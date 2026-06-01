use std::process::{Command, Stdio};
use std::fs::File;
use tauri::{AppHandle, Emitter, Manager};
use crate::{get_ov_conf_path, ServerState};

fn set_error(state: &ServerState, app: &AppHandle, msg: &str) {
    *state.status.lock().unwrap() = "error".to_string();
    *state.last_error.lock().unwrap() = msg.to_string();
    let _ = app.emit("server-status-changed", "error");
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

    let root_api_key = {
        let ov_conf_path = get_ov_conf_path(state);
        std::fs::read_to_string(&ov_conf_path).ok()
            .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
            .and_then(|json| json.get("server")?.get("root_api_key")?.as_str().map(|s| s.to_string()))
            .filter(|s| !s.is_empty())
    };

    tokio::spawn(async move {
        let url = format!("http://127.0.0.1:{}/health", health_port);
        let client = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap();
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(30);

        loop {
            if start.elapsed() > timeout {
                if let Some(s) = app_for_health.try_state::<ServerState>() {
                    *s.status.lock().unwrap() = "timeout".to_string();
                    *s.last_error.lock().unwrap() = "服务启动超时（30 秒），请检查 Python 服务和配置是否正确".to_string();
                }
                let _ = app_for_health.emit("server-status-changed", "timeout");
                break;
            }

            let mut req = client.get(&url);
            if let Some(ref key) = root_api_key {
                req = req.header("Authorization", format!("Bearer {}", key));
            }

            match req.send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Some(s) = app_for_health.try_state::<ServerState>() {
                        *s.status.lock().unwrap() = "running".to_string();
                    }
                    let _ = app_for_health.emit("server-status-changed", "running");
                    break;
                }
                _ => {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            }
        }
    });

    Ok("starting".to_string())
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
