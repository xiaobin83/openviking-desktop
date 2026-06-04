use tauri::{Emitter, Manager};
use std::sync::Mutex;
use std::process::Child;

mod process;
mod python_env;
mod tray;

const DEFAULT_OV_CONF_PATH: &str = ".openviking/ov.conf";

fn get_home_dir() -> std::path::PathBuf {
    dirs::home_dir().expect("no home dir")
}

pub struct ServerState {
    pub child: Mutex<Option<Child>>,
    pub status: Mutex<String>,
    pub port: Mutex<u16>,
    pub venv_path: Mutex<String>,
    pub workspace_path: Mutex<String>,
    pub server_log_path: String,
    pub last_error: Mutex<String>,
    pub uv_path: String,
    pub openviking_version: Mutex<String>,
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
async fn get_last_error(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    Ok(state.last_error.lock().unwrap().clone())
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
        let home = get_home_dir();
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
        let home = get_home_dir();
        home.join(DEFAULT_OV_CONF_PATH)
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

    std::fs::create_dir_all(&expanded).map_err(|e| format!("创建工作空间目录失败: {}", e))?;

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

#[tauri::command]
async fn open_log_file(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let path = &state.server_log_path;
    std::process::Command::new("open")
        .arg(path)
        .spawn()
        .map_err(|e| format!("打开日志文件失败: {}", e))?;
    Ok("ok".to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenvikingState {
    pub installed: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub python_version: Option<String>,
    pub upgradable: bool,
}

#[tauri::command]
async fn check_openviking_state(
    state: tauri::State<'_, ServerState>,
) -> Result<OpenvikingState, String> {
    let installed = !state.venv_path.lock().unwrap().is_empty();
    let mut current_version = None;
    let mut python_version = None;
    let mut latest_version = None;
    let mut upgradable = false;

    if installed {
        let uv_path = &state.uv_path;
        let venv_python = state.venv_path.lock().unwrap().clone();

        match python_env::pip_show_openviking(uv_path, &venv_python) {
            Ok(Some(v)) => {
                current_version = Some(v.clone());
                *state.openviking_version.lock().unwrap() = v;
            }
            Ok(None) => log::warn!("check_openviking_state: openviking not found in venv"),
            Err(e) => log::warn!("check_openviking_state: pip_show error: {}", e),
        }

        match python_env::pip_index_latest_version(uv_path) {
            Ok(Some(v)) => latest_version = Some(v),
            Ok(None) => {} // network unavailable, skip
            Err(e) => log::warn!("check_openviking_state: index error: {}", e),
        }

        if let (Some(ref cur), Some(ref latest)) = (&current_version, &latest_version) {
            upgradable = cur != latest;
        }

        python_version = get_python_version_internal(&venv_python);
    }

    Ok(OpenvikingState {
        installed,
        current_version,
        latest_version,
        python_version,
        upgradable,
    })
}

fn get_python_version_internal(venv_python: &str) -> Option<String> {
    let output = std::process::Command::new(venv_python)
        .args(["--version"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout).to_string();
    text.strip_prefix("Python ")
        .map(|s| s.trim().to_string())
}

fn get_app_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))
}

#[tauri::command]
async fn install_openviking(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServerState>,
    python_version: Option<String>,
) -> Result<String, String> {
    let version = python_version.unwrap_or_else(|| "3.13".to_string());
    let uv_path = state.uv_path.clone();

    static INSTALLING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if INSTALLING.swap(true, std::sync::atomic::Ordering::Acquire) {
        return Err("已有安装/升级任务正在执行".to_string());
    }

    let result: Result<String, String> = (async {
        if !python_env::python_is_installed(&uv_path, &version) {
            python_env::python_install(&app, &uv_path, &version)?;
        } else {
            let _ = app.emit("python-task-progress", python_env::ProgressPayload {
                step: "downloading_python".into(),
                message: format!("Python {} 已存在，跳过下载", version),
                done: false,
                log_line: String::new(),
            });
        }

        let app_data_dir = get_app_data_dir(&app)?;
        let venv_target = app_data_dir.join("python");
        let venv_target_str = venv_target.to_string_lossy().to_string();
        if venv_target.exists() {
            std::fs::remove_dir_all(&venv_target)
                .map_err(|e| format!("删除旧 venv 失败: {}", e))?;
        }
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("创建应用数据目录失败: {}", e))?;
        python_env::venv_create(&app, &uv_path, &version, &venv_target_str)?;

        let venv_python = venv_target.join("bin")
            .join(if cfg!(target_os = "windows") { "python.exe" } else { "python3" });
        let venv_python_str = venv_python.to_string_lossy().to_string();
        python_env::pip_install_openviking(&app, &uv_path, &venv_python_str, false)?;

        Ok(venv_python_str)
    }).await;

    INSTALLING.store(false, std::sync::atomic::Ordering::Release);

    match result {
        Ok(python_path) => {
            *state.venv_path.lock().unwrap() = python_path;
            let _ = app.emit("python-task-progress", python_env::ProgressPayload {
                step: "done".into(),
                message: "安装完成".to_string(),
                done: true,
                log_line: String::new(),
            });
            Ok("installed".to_string())
        }
        Err(e) => {
            let _ = app.emit("python-task-progress", python_env::ProgressPayload {
                step: "error".into(),
                message: e.clone(),
                done: true,
                log_line: String::new(),
            });
            Err(e)
        }
    }
}

#[tauri::command]
async fn upgrade_openviking(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServerState>,
) -> Result<String, String> {
    if state.venv_path.lock().unwrap().is_empty() {
        return Err("OpenViking 未安装".to_string());
    }

    static UPGRADING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if UPGRADING.swap(true, std::sync::atomic::Ordering::Acquire) {
        return Err("已有安装/升级任务正在执行".to_string());
    }

    let uv_path = state.uv_path.clone();
    let venv_python = state.venv_path.lock().unwrap().clone();

    let result = python_env::pip_install_openviking(&app, &uv_path, &venv_python, true);

    UPGRADING.store(false, std::sync::atomic::Ordering::Release);

    match result {
        Ok(()) => {
            let _ = app.emit("python-task-progress", python_env::ProgressPayload {
                step: "done".into(),
                message: "升级完成".to_string(),
                done: true,
                log_line: String::new(),
            });
            Ok("upgraded".to_string())
        }
        Err(e) => {
            let _ = app.emit("python-task-progress", python_env::ProgressPayload {
                step: "error".into(),
                message: e.clone(),
                done: true,
                log_line: String::new(),
            });
            Err(e)
        }
    }
}

#[tauri::command]
async fn upgrade_python(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServerState>,
    version: String,
) -> Result<String, String> {
    if state.venv_path.lock().unwrap().is_empty() {
        return Err("OpenViking 未安装".to_string());
    }

    static UPGRADING_PY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if UPGRADING_PY.swap(true, std::sync::atomic::Ordering::Acquire) {
        return Err("已有安装/升级任务正在执行".to_string());
    }

    let uv_path = state.uv_path.clone();
    let app_data_dir = get_app_data_dir(&app)?;

    let _ = crate::process::stop_server(&state, &app).await;

    let result: Result<String, String> = (async {
        if !python_env::python_is_installed(&uv_path, &version) {
            python_env::python_install(&app, &uv_path, &version)?;
        }

        let venv_target = app_data_dir.join("python");
        if venv_target.exists() {
            std::fs::remove_dir_all(&venv_target)
                .map_err(|e| format!("删除旧 venv 失败: {}", e))?;
        }
        python_env::venv_create(&app, &uv_path, &version, &venv_target.to_string_lossy())?;

        let venv_python = venv_target.join("bin")
            .join(if cfg!(target_os = "windows") { "python.exe" } else { "python3" });
        let venv_python_str = venv_python.to_string_lossy().to_string();
        python_env::pip_install_openviking(&app, &uv_path, &venv_python_str, false)?;

        Ok(venv_python_str)
    }).await;

    UPGRADING_PY.store(false, std::sync::atomic::Ordering::Release);

    match result {
        Ok(python_path) => {
            *state.venv_path.lock().unwrap() = python_path;
            let _ = app.emit("python-task-progress", python_env::ProgressPayload {
                step: "done".into(),
                message: "Python 版本切换完成".to_string(),
                done: true,
                log_line: String::new(),
            });
            Ok("upgraded".to_string())
        }
        Err(e) => {
            let _ = app.emit("python-task-progress", python_env::ProgressPayload {
                step: "error".into(),
                message: e.clone(),
                done: true,
                log_line: String::new(),
            });
            Err(e)
        }
    }
}

#[tauri::command]
async fn get_python_versions(
    state: tauri::State<'_, ServerState>,
) -> Result<Vec<String>, String> {
    python_env::python_list_all(&state.uv_path)
}

#[tauri::command]
async fn get_uv_path(
    state: tauri::State<'_, ServerState>,
) -> Result<String, String> {
    Ok(state.uv_path.clone())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let target_arch = std::env::consts::ARCH;
            let target_os = std::env::consts::OS;
            let target_triple = match (target_arch, target_os) {
                ("aarch64", "macos") => "aarch64-apple-darwin",
                ("x86_64", "macos") => "x86_64-apple-darwin",
                ("x86_64", "windows") => "x86_64-pc-windows-msvc",
                ("x86_64", "linux") => "x86_64-unknown-linux-gnu",
                _ => panic!("unsupported platform: {}-{}", target_arch, target_os),
            };
            let uv_binary_name = if target_os == "windows" { "uv.exe" } else { "uv" };

            let uv_path = {
                let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
                let root_dir = manifest_dir.parent().unwrap_or(manifest_dir);
                let dev_path = root_dir
                    .join("resources/uv")
                    .join(target_triple)
                    .join(uv_binary_name);
                let symlink_path = manifest_dir
                    .join("Resources/uv")
                    .join(target_triple)
                    .join(uv_binary_name);
                let resource_dir = app.path().resource_dir()
                    .expect("failed to resolve resource dir");
                let prod_path = resource_dir
                    .join("uv")
                    .join(target_triple)
                    .join(uv_binary_name);
                if dev_path.exists() { dev_path }
                else if symlink_path.exists() { symlink_path }
                else { prod_path }
            }.to_string_lossy().to_string();
            log::info!("uv path: {}", uv_path);

            let app_data_dir = app.path().app_data_dir().expect("no app data dir");
            let venv_python_path = python_env::get_venv_python_path(&app_data_dir);
            let venv_path = if venv_python_path.exists() {
                venv_python_path.to_string_lossy().to_string()
            } else {
                String::new()
            };
            log::info!("venv path: {}", if venv_path.is_empty() { "(not installed)" } else { &venv_path });

            let home = get_home_dir();
            let server_log_path = home
                .join("Library/Logs/OpenViking/openviking.log")
                .to_string_lossy()
                .to_string();

            if let Some(parent) = std::path::Path::new(&server_log_path).parent() {
                std::fs::create_dir_all(parent).ok();
            }

            let workspace_path = {
                let ws_file = app_data_dir.join("workspace_path");
                if ws_file.exists() {
                    std::fs::read_to_string(&ws_file).unwrap_or_default()
                } else {
                    String::new()
                }
            };
            
            let expanded_workspace_path = expand_tilde(&workspace_path);

            app.manage(ServerState {
                child: Mutex::new(None),
                status: Mutex::new("stopped".to_string()),
                port: Mutex::new(1933),
                venv_path: Mutex::new(venv_path),
                workspace_path: Mutex::new(expanded_workspace_path),
                server_log_path,
                last_error: Mutex::new(String::new()),
                uv_path,
                openviking_version: Mutex::new(String::new()),
            });

            tray::create_tray(app.handle())?;

            // 首次启动：若 ov.conf 不存在则生成默认配置
            let state = app.state::<ServerState>();
            let conf_path = get_ov_conf_path(&state);
            if !std::path::Path::new(&conf_path).exists() {
                log::info!("Generating default ov.conf at {}", conf_path);
                let default_config = r#"{
  "server": { "host": "127.0.0.1", "port": 1933, "cors_origins": ["*"] },
  "storage": { "workspace": "~/.openviking/data", "vectordb": { "backend": "local" }, "agfs": { "backend": "local" } },
  "embedding": { "dense": { "dimension": 1024, "batch_size": 32 }, "max_concurrent": 10, "max_retries": 3, "circuit_breaker": { "failure_threshold": 5, "reset_timeout": 60, "max_reset_timeout": 600 } },
  "vlm": { "max_retries": 3, "max_concurrent": 100, "timeout": 60.0, "thinking": false, "stream": false },
  "encryption": { "enabled": false },
  "log": { "level": "INFO" },
  "feishu": { "domain": "https://open.feishu.cn", "max_rows_per_sheet": 1000, "max_records_per_table": 1000 }
}"#;
                if let Some(parent) = std::path::Path::new(&conf_path).parent() {
                    std::fs::create_dir_all(parent).ok();
                }
                std::fs::write(&conf_path, default_config).ok();
            }

            // 自动启动服务（仅在 venv 已安装时）
            let auto_start_handle = app.handle().clone();
            let should_auto_start = !state.venv_path.lock().unwrap().is_empty();
            if should_auto_start {
                tauri::async_runtime::spawn(async move {
                    let _ = process::spawn_server_with_app_handle(&auto_start_handle).await;
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_server_status,
            get_last_error,
            start_server,
            stop_server,
            read_config,
            write_config,
            get_workspace,
            set_workspace,
            read_server_log,
            open_log_file,
            check_openviking_state,
            install_openviking,
            upgrade_openviking,
            upgrade_python,
            get_python_versions,
            get_uv_path,
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
