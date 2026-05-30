use tauri::Manager;
use std::sync::Mutex;
use std::process::Child;

mod config;
mod process;
mod tray;

pub struct ServerState {
    pub child: Mutex<Option<Child>>,
    pub status: Mutex<String>,
    pub port: Mutex<u16>,
    pub python_path: String,
    pub workspace_path: Mutex<String>,
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

pub fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        let home = dirs::home_dir().expect("no home dir");
        let trimmed = path.strip_prefix("~").unwrap_or("");
        home.join(trimmed.strip_prefix('/').unwrap_or(trimmed))
            .to_string_lossy()
            .to_string()
    } else {
        path.to_string()
    }
}

pub fn get_ov_conf_path(state: &ServerState) -> String {
    let workspace = state.workspace_path.lock().unwrap().clone();
    if workspace.is_empty() {
        let home = dirs::home_dir().expect("no home dir");
        home.join(".openviking/ov.conf")
            .to_string_lossy()
            .to_string()
    } else {
        let expanded = expand_tilde(&workspace);
        std::path::Path::new(&expanded)
            .join("ov.conf")
            .to_string_lossy()
            .to_string()
    }
}

#[tauri::command]
async fn read_config(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let ov_conf_path = get_ov_conf_path(&state);
    match std::fs::read_to_string(&ov_conf_path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("读取配置失败: {}", e)),
    }
}

#[tauri::command]
async fn write_config(state: tauri::State<'_, ServerState>, config: String) -> Result<String, String> {
    serde_json::from_str::<config::OvConfig>(&config)
        .map_err(|e| format!("配置格式无效: {}", e))?;
    let ov_conf_path = get_ov_conf_path(&state);
    if let Some(parent) = std::path::Path::new(&ov_conf_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let bak_path = format!("{}.bak", ov_conf_path);
    if std::path::Path::new(&ov_conf_path).exists() {
        std::fs::rename(&ov_conf_path, &bak_path).ok();
    }
    std::fs::write(&ov_conf_path, &config).map_err(|e| format!("写入配置失败: {}", e))?;
    Ok("ok".to_string())
}

#[tauri::command]
async fn get_workspace(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    Ok(state.workspace_path.lock().unwrap().clone())
}

#[tauri::command]
async fn set_workspace(app: tauri::AppHandle, state: tauri::State<'_, ServerState>, path: String) -> Result<String, String> {
    let expanded = expand_tilde(&path);
    let app_data_dir = app.path().app_data_dir().map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    std::fs::create_dir_all(&app_data_dir).map_err(|e| format!("创建应用数据目录失败: {}", e))?;
    let workspace_file = app_data_dir.join("workspace_path");
    std::fs::write(&workspace_file, &expanded).map_err(|e| format!("保存工作空间路径失败: {}", e))?;

    let ov_conf = std::path::Path::new(&expanded).join("ov.conf");
    if !ov_conf.exists() {
        std::fs::create_dir_all(&expanded).map_err(|e| format!("创建工作空间目录失败: {}", e))?;
        std::fs::write(&ov_conf, config::OvConfig::default().to_json_pretty())
            .map_err(|e| format!("创建默认配置失败: {}", e))?;
    }

    *state.workspace_path.lock().unwrap() = expanded;

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
            let server_log_path = home
                .join("Library/Logs/OpenViking/server.log")
                .to_string_lossy()
                .to_string();

            if let Some(parent) = std::path::Path::new(&server_log_path).parent() {
                std::fs::create_dir_all(parent).ok();
            }

            let app_data_dir = app.path().app_data_dir().expect("no app data dir");
            let workspace_path = {
                let ws_file = app_data_dir.join("workspace_path");
                if ws_file.exists() {
                    std::fs::read_to_string(&ws_file).unwrap_or_default()
                } else {
                    String::new()
                }
            };

            {
                let ov_conf_path = if workspace_path.is_empty() {
                    dirs::home_dir()
                        .expect("no home dir")
                        .join(".openviking/ov.conf")
                } else {
                    std::path::Path::new(&workspace_path).join("ov.conf")
                };
                if !ov_conf_path.exists() {
                    if let Some(parent) = ov_conf_path.parent() {
                        std::fs::create_dir_all(parent).ok();
                    }
                    std::fs::write(&ov_conf_path, config::OvConfig::default().to_json_pretty()).ok();
                }
            }

            app.manage(ServerState {
                child: Mutex::new(None),
                status: Mutex::new("stopped".to_string()),
                port: Mutex::new(1933),
                python_path,
                workspace_path: Mutex::new(workspace_path),
                server_log_path,
            });

            tray::create_tray(app.handle())?;

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
            get_workspace,
            set_workspace,
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
            match event {
                tauri::RunEvent::Reopen { .. } => {
                    if let Some(window) = app_handle.get_webview_window("dashboard") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                tauri::RunEvent::Exit => {
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
                _ => {}
            }
        });
}
