use std::process::{Command, Stdio};
use std::fs::OpenOptions;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use crate::{get_ov_conf_path, ServerState};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

/// Kill a child process and its entire process group (Unix) or just the child (non-Unix).
/// On Unix, this uses process groups to ensure subprocesses are also terminated.
#[cfg(unix)]
pub fn kill_child(child: &mut std::process::Child) {
    let pid = child.id();
    unsafe {
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
    let _ = child.wait();
}

#[cfg(not(unix))]
pub fn kill_child(child: &mut std::process::Child) {
    let _ = child.kill();
    let _ = child.wait();
}

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
    let python_path = state.venv_path.lock().unwrap().clone();
    if !std::path::Path::new(&python_path).exists() {
        set_error(state, app, "OpenViking 未安装，请先在仪表盘中安装");
        return Err("OpenViking 未安装".to_string());
    }

    {
        let mut child_opt = state.child.lock().unwrap();
        if let Some(ref mut c) = *child_opt {
            kill_child(c);
        }
        *child_opt = None;
    }

    *state.last_error.lock().unwrap() = String::new();
    *state.status.lock().unwrap() = "starting".to_string();
    let _ = app.emit("server-status-changed", "starting");

    let port = *state.port.lock().unwrap();

    let log_file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&state.server_log_path)
        .map_err(|e| {
            set_error(state, app, &format!("无法创建日志文件: {}", e));
            format!("无法创建日志文件: {}", e)
        })?;

    let mut command = Command::new(&python_path);
    command
        .arg("-m")
        .arg("openviking.server.bootstrap")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--config")
        .arg(get_ov_conf_path(state))
        .arg("--with-bot")
        .stdout(Stdio::from(log_file.try_clone().unwrap()))
        .stderr(Stdio::from(log_file));

    #[cfg(unix)]
    {
        command.process_group(0);
    }

    let child = command.spawn().map_err(|e| {
        let msg = format!("启动服务失败: {}", e);
        set_error(state, app, &msg);
        msg
    })?;

    log::info!("服务进程已启动 (PID={})", child.id());

    *state.child.lock().unwrap() = Some(child);

    let health_port = *state.port.lock().unwrap();
    let app_for_health = app.clone();
    let state_python_path = state.venv_path.lock().unwrap().clone();
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
            let current = app_for_health.try_state::<ServerState>()
                .map(|s| s.status.lock().unwrap().clone());
            // 如果用户已主动停止，不覆盖状态
            if current.as_deref() == Some("starting") {
                if let Some(s) = app_for_health.try_state::<ServerState>() {
                    *s.status.lock().unwrap() = "timeout".to_string();
                    *s.last_error.lock().unwrap() = "服务启动超时（30 秒），请检查 Python 服务和配置是否正确".to_string();
                }
                let _ = app_for_health.emit("server-status-changed", "timeout");
            }
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

    // 初次检查前等待2秒，给服务启动时间，减少无意义的连接失败
    tokio::time::sleep(Duration::from_secs(2)).await;

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
                log::info!("健康检查通过: {} (elapsed={:?})", url, start.elapsed());
                return true;
            }
            Ok(resp) => {
                log::info!("健康检查返回非成功状态码: {} for {} (elapsed={:?})", resp.status(), url, start.elapsed());
                tokio::time::sleep(Duration::from_secs(interval_secs)).await;
            }
            Err(e) => {
                log::info!("健康检查连接失败: {} for {} (elapsed={:?})", e, url, start.elapsed());
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
    venv_path: String,
    log_path: String,
) {
    tokio::spawn(async move {
        let monitor_client = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap();

        // 宽限期：服务标记为 running 后等待 30s 再开始监控，让服务完成后台初始化
        log::info!("健康监控将在 30 秒宽限期后开始");
        tokio::time::sleep(Duration::from_secs(30)).await;

        // 检查宽限期内用户是否已停止服务
        let current_status = app.try_state::<ServerState>()
            .map(|s| s.status.lock().unwrap().clone())
            .unwrap_or_default();
        if current_status != "running" {
            log::info!("宽限期内服务状态已变更为 {}, 退出健康监控", current_status);
            return;
        }
        log::info!("健康监控开始, 每 10s 轮询 /health");

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
                Ok(resp) if resp.status().is_success() => {
                    true
                }
                Ok(resp) => {
                    log::info!("健康检查返回非成功状态码: {} for {}", resp.status(), url);
                    false
                }
                Err(e) => {
                    log::info!("健康检查连接失败: {} for {}", e, url);
                    false
                }
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
            log::info!("健康检查连续 {} 次失败, 触发自动重启 (第 {} 次)", MAX_FAILURES, total_restarts + 1);
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

            // 杀死现有进程（包括子进程）
            if let Some(s) = app.try_state::<ServerState>() {
                let mut child_opt = s.child.lock().unwrap();
                if let Some(ref mut c) = *child_opt {
                    kill_child(c);
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

            let log_file = match OpenOptions::new()
                .append(true)
                .create(true)
                .open(&log_path) {
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

            let mut command = Command::new(&venv_path);
            command
                .arg("-m")
                .arg("openviking.server.bootstrap")
                .arg("--host")
                .arg("127.0.0.1")
                .arg("--port")
                .arg(port.to_string())
                .arg("--config")
                .arg(&ov_conf_path)
                .arg("--with-bot")
                .stdout(Stdio::from(log_file.try_clone().unwrap()))
                .stderr(Stdio::from(log_file));

            #[cfg(unix)]
            {
                command.process_group(0);
            }

            let child = match command.spawn()
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
        kill_child(child);
    }
    *child_opt = None;

    // 确保服务端和 vikingbot 端口也都释放（兜底清理）
    cleanup_port(1933);
    cleanup_port(18790);

    *state.last_error.lock().unwrap() = String::new();
    *state.status.lock().unwrap() = "stopped".to_string();
    let _ = app.emit("server-status-changed", "stopped");
    Ok("stopped".to_string())
}

/// 释放指定端口上的进程 (Unix: lsof+kill, Windows: netstat+taskkill)
pub fn cleanup_port(port: u16) {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("cmd")
            .args(&["/C", &format!("for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :{}') do taskkill /F /PID %a", port)])
            .output();
        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if !stdout.trim().is_empty() {
                log::info!("cleanup_port {}: killed {}", port, stdout.trim());
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let output = std::process::Command::new("sh")
            .arg("-c")
            .arg(&format!("lsof -ti :{} 2>/dev/null", port))
            .output();
        if let Ok(out) = output {
            let pids = String::from_utf8_lossy(&out.stdout);
            let trimmed = pids.trim();
            if !trimmed.is_empty() {
                log::info!("cleanup_port {}: killing PIDs {}", port, trimmed);
                let _ = std::process::Command::new("sh")
                    .arg("-c")
                    .arg(&format!("kill -9 {} 2>/dev/null", trimmed.replace('\n', " ")))
                    .output();
            }
        }
    }
}
