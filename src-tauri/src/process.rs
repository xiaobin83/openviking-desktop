use std::process::{Command, Stdio};
use std::fs::File;
use tauri::{AppHandle, Emitter, Manager};
use crate::{get_ov_conf_path, ServerState};

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
        *state.status.lock().unwrap() = "error".to_string();
        let _ = app.emit("server-status-changed", "error");
        return Err("Python 环境未找到".to_string());
    }

    {
        let child = state.child.lock().unwrap();
        if child.is_some() {
            return Err("服务已在运行".to_string());
        }
    }

    *state.status.lock().unwrap() = "starting".to_string();
    let _ = app.emit("server-status-changed", "starting");

    let port = *state.port.lock().unwrap();

    let log_file = File::create(&state.server_log_path)
        .map_err(|e| format!("无法创建日志文件: {}", e))?;

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
            *state.status.lock().unwrap() = "error".to_string();
            let _ = app.emit("server-status-changed", "error");
            format!("启动服务失败: {}", e)
        })?;

    *state.child.lock().unwrap() = Some(child);

    let health_port = *state.port.lock().unwrap();
    let app_for_health = app.clone();

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
                }
                let _ = app_for_health.emit("server-status-changed", "timeout");
                break;
            }

            match client.get(&url).send().await {
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
    *state.status.lock().unwrap() = "stopped".to_string();
    let _ = app.emit("server-status-changed", "stopped");
    Ok("stopped".to_string())
}
