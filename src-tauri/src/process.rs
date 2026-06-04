use std::process::{Command, Stdio};
use std::fs::File;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use crate::{get_ov_conf_path, ServerState};

fn set_error(state: &ServerState, app: &AppHandle, msg: &str) {
    *state.status.lock().unwrap() = "error".to_string();
    *state.last_error.lock().unwrap() = msg.to_string();
    let _ = app.emit("server-status-changed", "error");
}

pub async fn spawn_server_with_app_handle(
    app: &AppHandle,
) -> Result<String, String> {
    let state = app.state::<ServerState>();
    spawn_server(&state, app).await
}

pub async fn spawn_server(
    state: &ServerState,
    app: &AppHandle,
) -> Result<String, String> {
    let python_path = &state.python_path;
    if !std::path::Path::new(python_path).exists() {
        set_error(state, app, "Python 环境未找到，请检查 Resources/python 目录");
        return Err("Python 环境未找到".to_string());
    }

    {
        let mut child = state.child.lock().unwrap();
        if child.is_some() {
            if let Some(ref mut c) = *child {
                let _ = c.kill();
                let _ = c.wait();
            }
            *child = None;
        }
    }

    *state.last_error.lock().unwrap() = String::new();
    *state.status.lock().unwrap() = "starting".to_string();
    let _ = app.emit("server-status-changed", "starting");

    let port = *state.port.lock().unwrap();

    let log_file = File::create(&state.server_log_path)
        .map_err(|e| {
            set_error(state, app, &format!("无法创建日志文件: {}", e));
            format!("无法创建日志文件: {}", e)
        })?;

    let child = Command::new(python_path)
        .arg("-m")
        .arg("openviking.server.bootstrap")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--config")
        .arg(get_ov_conf_path(state))
        .stdout(Stdio::from(log_file.try_clone().unwrap()))
        .stderr(Stdio::from(log_file))
        .spawn()
        .map_err(|e| {
            let msg = format!("启动服务失败: {}", e);
            set_error(state, app, &msg);
            msg
        })?;

    *state.child.lock().unwrap() = Some(child);

    let health_port = *state.port.lock().unwrap();
    let app_for_health = app.clone();
    let state_python_path = state.python_path.clone();
    let state_log_path = state.server_log_path.clone();

    let root_api_key = {
        let ov_conf_path = get_ov_conf_path(state);
        std::fs::read_to_string(&ov_conf_path).ok()
            .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
            .and_then(|json| json.get("server")?.get("root_api_key")?.as_str().map(|s| s.to_string()))
            .filter(|s| !s.is_empty())
    };

    tokio::spawn(async move {
        let url = format!("http://127.0.0.1:{}/health", health_port);
        let start = std::time::Instant::now();
        let startup_timeout = Duration::from_secs(30);

        let healthy = wait_for_health(&url, &root_api_key, start, startup_timeout, 2).await;

        if healthy {
            if let Some(s) = app_for_health.try_state::<ServerState>() {
                *s.status.lock().unwrap() = "running".to_string();
            }
            let _ = app_for_health.emit("server-status-changed", "running");

            // 启动运行时健康监控（自动重启机制）
            start_runtime_health_monitor(
                app_for_health.clone(),
                url,
                root_api_key,
                health_port,
                state_python_path,
                state_log_path,
            );
        } else {
            if let Some(s) = app_for_health.try_state::<ServerState>() {
                *s.status.lock().unwrap() = "timeout".to_string();
                *s.last_error.lock().unwrap() = "服务启动超时（30 秒），请检查 Python 服务和配置是否正确".to_string();
            }
            let _ = app_for_health.emit("server-status-changed", "timeout");
        }
    });

    Ok("starting".to_string())
}

/// 轮询 /health 直到成功或超时
async fn wait_for_health(
    url: &str,
    api_key: &Option<String>,
    start: std::time::Instant,
    timeout: Duration,
    interval_secs: u64,
) -> bool {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .unwrap();

    loop {
        if start.elapsed() > timeout {
            return false;
        }

        let mut req = client.get(url);
        if let Some(ref key) = api_key {
            req = req.header("Authorization", format!("Bearer {}", key));
        }

        match req.send().await {
            Ok(resp) if resp.status().is_success() => {
                return true;
            }
            _ => {
                tokio::time::sleep(Duration::from_secs(interval_secs)).await;
            }
        }
    }
}

/// 运行时健康监控：连续 3 次 health 失败时自动重启，最多 3 次
fn start_runtime_health_monitor(
    app: AppHandle,
    url: String,
    api_key: Option<String>,
    port: u16,
    python_path: String,
    log_path: String,
) {
    tokio::spawn(async move {
        let monitor_client = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap();
        let mut consecutive_failures: u32 = 0;
        let mut total_restarts: u32 = 0;
        const MAX_FAILURES: u32 = 3;
        const MAX_RESTARTS: u32 = 3;

        loop {
            tokio::time::sleep(Duration::from_secs(10)).await;

            // 如果状态不是 running，说明被用户手动停止，退出监控
            let current_status = app.try_state::<ServerState>()
                .map(|s| s.status.lock().unwrap().clone())
                .unwrap_or_default();
            if current_status != "running" {
                break;
            }

            let mut req = monitor_client.get(&url);
            if let Some(ref key) = api_key {
                req = req.header("Authorization", format!("Bearer {}", key));
            }

            let ok = match req.send().await {
                Ok(resp) if resp.status().is_success() => true,
                _ => false,
            };

            if ok {
                consecutive_failures = 0;
                continue;
            }

            consecutive_failures += 1;
            if consecutive_failures < MAX_FAILURES {
                continue;
            }

            // health 连续失败，执行自动重启
            if total_restarts >= MAX_RESTARTS {
                // 已达最大重启次数，停止尝试
                if let Some(s) = app.try_state::<ServerState>() {
                    *s.status.lock().unwrap() = "error".to_string();
                    *s.last_error.lock().unwrap() =
                        format!("服务多次重启失败（{} 次），请手动检查配置", MAX_RESTARTS);
                }
                let _ = app.emit("server-status-changed", "error");
                break;
            }

            total_restarts += 1;
            consecutive_failures = 0;

            // 更新状态为 "starting"
            if let Some(s) = app.try_state::<ServerState>() {
                *s.status.lock().unwrap() = "starting".to_string();
            }
            let _ = app.emit("server-status-changed", "starting");

            // 杀死现有进程
            if let Some(s) = app.try_state::<ServerState>() {
                let mut child_opt = s.child.lock().unwrap();
                if let Some(ref mut c) = *child_opt {
                    let _ = c.kill();
                    let _ = c.wait();
                }
                *child_opt = None;
            }

            // 重新启动新进程
            let ov_conf_path = {
                if let Some(s) = app.try_state::<ServerState>() {
                    get_ov_conf_path(&s)
                } else {
                    break;
                }
            };

            let log_file = match File::create(&log_path) {
                Ok(f) => f,
                Err(e) => {
                    if let Some(s) = app.try_state::<ServerState>() {
                        *s.status.lock().unwrap() = "error".to_string();
                        *s.last_error.lock().unwrap() = format!("重启失败，无法创建日志文件: {}", e);
                    }
                    let _ = app.emit("server-status-changed", "error");
                    break;
                }
            };

            let child = match Command::new(&python_path)
                .arg("-m")
                .arg("openviking.server.bootstrap")
                .arg("--host")
                .arg("127.0.0.1")
                .arg("--port")
                .arg(port.to_string())
                .arg("--config")
                .arg(&ov_conf_path)
                .stdout(Stdio::from(log_file.try_clone().unwrap()))
                .stderr(Stdio::from(log_file))
                .spawn()
            {
                Ok(c) => c,
                Err(e) => {
                    if let Some(s) = app.try_state::<ServerState>() {
                        *s.status.lock().unwrap() = "error".to_string();
                        *s.last_error.lock().unwrap() = format!("重启失败: {}", e);
                    }
                    let _ = app.emit("server-status-changed", "error");
                    break;
                }
            };

            if let Some(s) = app.try_state::<ServerState>() {
                *s.child.lock().unwrap() = Some(child);
            }

            // 等待新进程健康检查就绪（更短的超时时间）
            let restart_start = std::time::Instant::now();
            let restart_timeout = Duration::from_secs(15);
            let restarted_ok = wait_for_health(
                &url,
                &api_key,
                restart_start,
                restart_timeout,
                2,
            ).await;

            if restarted_ok {
                if let Some(s) = app.try_state::<ServerState>() {
                    *s.status.lock().unwrap() = "running".to_string();
                }
                let _ = app.emit("server-status-changed", "running");
            } else {
                if let Some(s) = app.try_state::<ServerState>() {
                    *s.status.lock().unwrap() = "error".to_string();
                    *s.last_error.lock().unwrap() =
                        format!("自动重启失败（第 {} 次），请手动检查", total_restarts);
                }
                let _ = app.emit("server-status-changed", "error");
                break;
            }
        }
    });
}

pub async fn stop_server(
    state: &ServerState,
    app: &AppHandle,
) -> Result<String, String> {
    let mut child_opt = state.child.lock().unwrap();
    if let Some(ref mut child) = *child_opt {
        let _ = child.kill();
        let _ = child.wait();
    }
    *child_opt = None;
    *state.last_error.lock().unwrap() = String::new();
    *state.status.lock().unwrap() = "stopped".to_string();
    let _ = app.emit("server-status-changed", "stopped");
    Ok("stopped".to_string())
}
