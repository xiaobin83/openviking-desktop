use tauri::Manager;
use std::sync::Mutex;
use std::process::Child;

mod process;
mod tray;

pub struct ServerState {
    pub child: Mutex<Option<Child>>,
    pub status: Mutex<String>,
    pub port: Mutex<u16>,
    pub python_path: String,
    pub ov_conf_path: String,
    pub server_log_path: String,
}

impl Drop for ServerState {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.child.try_lock() {
            if let Some(ref mut child) = *guard {
                log::info!("ServerState::drop: killing openviking-server");
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[tauri::command]
async fn get_server_status(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    Ok(state.status.lock().unwrap().clone())
}

#[tauri::command]
async fn start_server(state: tauri::State<'_, ServerState>, app: tauri::AppHandle) -> Result<String, String> {
    process::spawn_server(&state, &app).await
}

#[tauri::command]
async fn stop_server(state: tauri::State<'_, ServerState>, app: tauri::AppHandle) -> Result<String, String> {
    process::stop_server(&state, &app).await
}

#[tauri::command]
async fn read_config(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let path = &state.ov_conf_path;
    match std::fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("读取配置失败: {}", e)),
    }
}

#[tauri::command]
async fn write_config(state: tauri::State<'_, ServerState>, config: String) -> Result<String, String> {
    let path = &state.ov_conf_path;
    if let Some(parent) = std::path::Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    std::fs::write(path, &config).map_err(|e| format!("写入配置失败: {}", e))?;
    Ok("ok".to_string())
}

#[tauri::command]
async fn read_server_log(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let path = &state.server_log_path;
    match std::fs::read_to_string(path) {
        Ok(content) => {
            let lines: Vec<&str> = content.lines().collect();
            let start = if lines.len() > 100 { lines.len() - 100 } else { 0 };
            Ok(lines[start..].join("\n"))
        }
        Err(e) => Err(format!("读取日志失败: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let python_path = {
                let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
                let root_dir = manifest_dir.parent().unwrap_or(manifest_dir);
                let dev_path = root_dir.join("resources/python/bin/python3");
                let symlink_path = manifest_dir.join("Resources/python/bin/python3");
                let resource_dir = app.path().resource_dir()
                    .expect("failed to resolve resource dir");
                let prod_path = resource_dir.join("python/bin/python3");
                if dev_path.exists() { dev_path }
                else if symlink_path.exists() { symlink_path }
                else { prod_path }
            }.to_string_lossy().to_string();
            log::info!("Python path: {}", python_path);

            let home = dirs::home_dir().expect("no home dir");
            let ov_conf_path = home
                .join(".openviking/ov.conf")
                .to_string_lossy()
                .to_string();
            let server_log_path = home
                .join("Library/Logs/OpenViking/server.log")
                .to_string_lossy()
                .to_string();

            if let Some(parent) = std::path::Path::new(&server_log_path).parent() {
                std::fs::create_dir_all(parent).ok();
            }

            app.manage(ServerState {
                child: Mutex::new(None),
                status: Mutex::new("stopped".to_string()),
                port: Mutex::new(1933),
                python_path,
                ov_conf_path,
                server_log_path,
            });

            tray::create_tray(app.handle())?;

            let state = app.state::<ServerState>();
            let conf_path = state.ov_conf_path.clone();
            if !std::path::Path::new(&conf_path).exists() {
                let default_config = r#"{
  "server": { "host": "127.0.0.1", "port": 1933 },
  "storage": { "workspace": "~/.openviking/data", "vectordb": { "backend": "local" }, "agfs": { "backend": "local" } },
  "embedding": { "model": "doubao-embedding-large" },
  "llm": { "model": "openai/gpt-4o" },
  "retrieval": { "top_k": 10, "threshold": 0.5 },
  "encryption": { "enabled": false },
  "log": { "level": "INFO" }
}"#;
                std::fs::write(&conf_path, default_config).ok();
            }

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if app_handle.try_state::<ServerState>().is_some() {
                    let _ = process::spawn_server_with_app_handle(&app_handle).await;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_server_status,
            start_server,
            stop_server,
            read_config,
            write_config,
            read_server_log,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "dashboard" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<ServerState>() {
                    let mut child_opt = state.child.lock().unwrap();
                    if let Some(ref mut c) = *child_opt {
                        log::info!("Killing openviking-server on RunEvent::Exit");
                        let _ = c.kill();
                        let _ = c.wait();
                    }
                    *child_opt = None;
                }
            }
        });
}
