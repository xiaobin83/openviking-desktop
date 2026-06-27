use std::io::Write;
use std::process::Child;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

mod process;
mod python_env;
mod tray;

// --- Path constants ---
const ONBOARDED_FLAG_NAME: &str = ".openviking/.onboarded";
const OV_CONF_FILENAME: &str = "ov.conf";
const WORKSPACE_PATH_FILENAME: &str = "workspace_path";
const OPENVIKING_VERSION_FILENAME: &str = "openviking_version";
const DATA_SUBDIR: &str = "data";
const VECTORDB_SUBDIR: &str = "vectordb";
const REBUILD_LOCK_FILENAME: &str = "rebuild_lock.json";
const DEFAULT_WORKSPACE_NAME: &str = "OpenViking";
const DEFAULT_PYTHON_VERSION: &str = "3.13";

fn get_home_dir() -> std::path::PathBuf {
    dirs::home_dir().expect("no home dir")
}

struct FileAndConsoleLogger {
    file: Mutex<std::fs::File>,
}

impl log::Log for FileAndConsoleLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= log::Level::Info
    }

    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let msg = format!("[{}] {}", record.level(), record.args());
        if let Ok(mut file) = self.file.lock() {
            let _ = writeln!(file, "{}", msg);
        }
        eprintln!("{}", msg);
    }

    fn flush(&self) {
        if let Ok(mut file) = self.file.lock() {
            let _ = file.flush();
        }
    }
}

pub struct ServerState {
    pub child: Mutex<Option<Child>>,
    pub status: Mutex<String>,
    pub port: Mutex<u16>,
    pub bot_port: Mutex<u16>,
    pub venv_path: Mutex<String>,
    pub workspace_path: Mutex<String>,
    pub server_log_path: String,
    pub desktop_log_path: String,
    pub last_error: Mutex<String>,
    pub uv_path: String,
    pub app_data_dir: Mutex<String>,
    pub openviking_version: Mutex<String>,
}

impl Drop for ServerState {
    fn drop(&mut self) {
        let server_port = *self.port.lock().unwrap();
        let bot_port = *self.bot_port.lock().unwrap();
        if let Ok(mut guard) = self.child.try_lock() {
            if let Some(ref mut child) = *guard {
                log::info!("ServerState::drop: killing openviking-server");
                crate::process::kill_child(child);
                drop(guard);
                crate::process::cleanup_port(server_port);
                crate::process::cleanup_port(bot_port);
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
async fn start_server(
    state: tauri::State<'_, ServerState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    process::spawn_server(&state, &app).await
}

#[tauri::command]
async fn stop_server(
    state: tauri::State<'_, ServerState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    process::stop_server(&state, &app).await
}

/// Expand `~` (Unix home) and `%VAR%` (Windows environment variables) in a path.
pub fn expand_tilde(path: &str) -> String {
    let expanded = if path.starts_with("~/") || path == "~" {
        let home = get_home_dir();
        let trimmed = path.strip_prefix("~").unwrap_or("");
        home.join(trimmed.strip_prefix('/').unwrap_or(trimmed))
            .to_string_lossy()
            .to_string()
    } else {
        path.to_string()
    };
    expand_env_vars(&expanded)
}

/// Expand Windows `%VAR%` environment variable references (e.g. `%USERPROFILE%`).
/// Non-existent variables are left as-is.
fn expand_env_vars(path: &str) -> String {
    let mut result = path.to_string();
    // Loop to handle multiple variables in one path
    while let Some(start) = result.find('%') {
        // Skip escaped percent signs (%%)
        if start + 1 < result.len() && result.as_bytes()[start + 1] == b'%' {
            result.replace_range(start..start + 2, "%");
            continue;
        }
        if let Some(end) = result[start + 1..].find('%') {
            let var_name = &result[start + 1..start + 1 + end];
            // Only expand known-looking variable names (alphanumeric + underscore)
            if !var_name.is_empty() && var_name.chars().all(|c| c.is_alphanumeric() || c == '_') {
                match std::env::var(var_name) {
                    Ok(val) => {
                        result.replace_range(start..start + 2 + end, &val);
                        continue;
                    }
                    Err(_) => {
                        // Variable not set — skip past it to avoid infinite loop
                        result.replace_range(start..start + 2 + end, "");
                        continue;
                    }
                }
            }
        }
        break; // malformed or no closing '%' — stop
    }
    result
}

pub fn get_default_workspace_path() -> String {
    get_home_dir().join(DEFAULT_WORKSPACE_NAME).to_string_lossy().to_string()
}

#[tauri::command]
fn get_default_workspace() -> String {
    get_default_workspace_path()
}

pub fn get_ov_conf_path(state: &ServerState) -> String {
    let workspace = state.workspace_path.lock().unwrap().clone();
    if workspace.is_empty() {
        let app_data_dir = state.app_data_dir.lock().unwrap().clone();
        std::path::Path::new(&app_data_dir)
            .join(OV_CONF_FILENAME)
            .to_string_lossy()
            .to_string()
    } else {
        let expanded = expand_tilde(&workspace);
        std::path::Path::new(&expanded)
            .join(OV_CONF_FILENAME)
            .to_string_lossy()
            .to_string()
    }
}

fn get_ov_conf_dir(state: &ServerState) -> String {
    let conf_path = crate::get_ov_conf_path(state);
    std::path::Path::new(&conf_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/tmp".to_string())
}

fn get_onboarded_flag_path(state: &ServerState) -> String {
    let app_data_dir = state.app_data_dir.lock().unwrap().clone();
    std::path::Path::new(&app_data_dir)
        .join(".onboarded")
        .to_string_lossy()
        .to_string()
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
async fn read_config_at(path: String) -> Result<String, String> {
    let expanded = crate::expand_tilde(&path);
    match std::fs::read_to_string(&expanded) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("读取配置失败: {}", e)),
    }
}

#[tauri::command]
async fn write_config(
    state: tauri::State<'_, ServerState>,
    config: String,
) -> Result<String, String> {
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
async fn set_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServerState>,
    path: String,
) -> Result<String, String> {
    let expanded = expand_tilde(&path);
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    std::fs::create_dir_all(&app_data_dir).map_err(|e| format!("创建应用数据目录失败: {}", e))?;
    let workspace_file = app_data_dir.join(WORKSPACE_PATH_FILENAME);
    std::fs::write(&workspace_file, &expanded)
        .map_err(|e| format!("保存工作空间路径失败: {}", e))?;

    std::fs::create_dir_all(&expanded).map_err(|e| format!("创建工作空间目录失败: {}", e))?;

    // 同时创建 data/ 子目录（实际知识库数据存储目录）
    let data_dir = std::path::Path::new(&expanded).join(DATA_SUBDIR);
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("创建工作空间 data 目录失败: {}", e))?;

    *state.workspace_path.lock().unwrap() = expanded;

    Ok("ok".to_string())
}

#[tauri::command]
fn get_workspace_data_path(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let workspace = state.workspace_path.lock().unwrap().clone();
    let base = if workspace.is_empty() {
        expand_tilde(&get_default_workspace_path())
    } else {
        workspace
    };
    Ok(std::path::Path::new(&base)
        .join(DATA_SUBDIR)
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
async fn read_server_log(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let path = &state.server_log_path;
    match std::fs::read_to_string(path) {
        Ok(content) => {
            let lines: Vec<&str> = content.lines().collect();
            let start = if lines.len() > 100 {
                lines.len() - 100
            } else {
                0
            };
            Ok(lines[start..].join("\n"))
        }
        Err(e) => Err(format!("读取日志失败: {}", e)),
    }
}

#[tauri::command]
async fn open_log_file(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let path = &state.server_log_path;
    open_file_with_default_app(path)
}

#[tauri::command]
async fn open_app_log_file(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let path = &state.desktop_log_path;
    open_file_with_default_app(path)
}

fn open_file_with_default_app(path: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("notepad")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开文件失败: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开文件失败: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开文件失败: {}", e))?;
    }
    Ok("ok".to_string())
}

#[tauri::command]
fn open_console(state: tauri::State<'_, ServerState>) -> Result<(), String> {
    let venv_python = state.venv_path.lock().unwrap().clone();
    let workspace = {
        let ws = state.workspace_path.lock().unwrap().clone();
        if ws.is_empty() { "~".to_string() } else { ws }
    };

    #[cfg(target_os = "macos")]
    {
        let activate = std::path::Path::new(&venv_python)
            .parent()
            .map(|p| p.join("activate"))
            .filter(|p| p.exists());

        let cmd = if let Some(activate_path) = activate {
            format!(
                "tell application \"Terminal\" to do script \"cd \\\"{}\\\" && source \\\"{}\\\"\"",
                workspace,
                activate_path.to_string_lossy()
            )
        } else {
            format!(
                "tell application \"Terminal\" to do script \"cd \\\"{}\\\"\"",
                workspace
            )
        };
        std::process::Command::new("osascript")
            .arg("-e")
            .arg(&cmd)
            .spawn()
            .map_err(|e| format!("打开终端失败: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        // 在 Windows 上，workspace 为空时回退到用户主目录
        let ws_dir = if workspace == "~" {
            dirs::home_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "C:\\".to_string())
        } else {
            workspace
        };

        let activate_bat = std::path::Path::new(&venv_python)
            .parent()
            .map(|p| p.join("activate.bat"));
        // 写临时 bat 文件到 %TEMP%，用于 start 命令（避免嵌套引号）
        let bat_content = if let Some(ref ap) = activate_bat {
            if ap.exists() {
                format!(
                    "@echo off\r\n\
                     echo [workspace] {}\r\n\
                     echo [activate] {}\r\n\
                     cd /d \"{}\"\r\n\
                     call \"{}\"\r\n\
                     cmd /k\r\n",
                    ws_dir,
                    ap.to_string_lossy(),
                    ws_dir,
                    ap.to_string_lossy()
                )
            } else {
                format!(
                    "@echo off\r\n\
                     echo [workspace] {}\r\n\
                     echo [activate] (not found)\r\n\
                     cd /d \"{}\"\r\n\
                     cmd /k\r\n",
                    ws_dir, ws_dir
                )
            }
        } else {
            format!(
                "@echo off\r\n\
                 echo [workspace] {}\r\n\
                 echo [activate] (not found)\r\n\
                 cd /d \"{}\"\r\n\
                 cmd /k\r\n",
                ws_dir, ws_dir
            )
        };

        let temp_dir = std::env::temp_dir();
        let bat_path = temp_dir.join("openviking_console.bat");
        std::fs::write(&bat_path, bat_content)
            .map_err(|e| format!("写入临时脚本失败: {}", e))?;

        // 优先使用 Windows Terminal，支持现代 TUI
        let wt_result = std::process::Command::new("wt")
            .args(["-d", &ws_dir, "cmd", "/k", &bat_path.to_string_lossy()])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();

        if wt_result.is_err() {
            // 回退到传统 cmd 窗口
            std::process::Command::new("cmd")
                .args(["/c", "start", "", &bat_path.to_string_lossy()])
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .map_err(|e| format!("打开终端失败: {}", e))?;
        }
    }
    #[cfg(target_os = "linux")]
    {
        let _ = activate;
    }
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenvikingState {
    pub installed: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub python_version: Option<String>,
    pub upgradable: bool,
    pub has_local_embed: bool,
}

#[tauri::command]
async fn check_openviking_state(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServerState>,
) -> Result<OpenvikingState, String> {
    let installed = !state.venv_path.lock().unwrap().is_empty();
    let mut current_version = None;
    let mut python_version = None;
    let latest_version = None;
    let upgradable = false;

    if installed {
        let uv_path = &state.uv_path;
        let venv_python = state.venv_path.lock().unwrap().clone();
        let cached_ver = state.openviking_version.lock().unwrap().clone();
        // Scope uv's Python installation to avoid os error 448 on Windows
        let app_data_dir = app.path().app_data_dir().unwrap_or_default();
        let python_install_dir = app_data_dir.join("uv-python");
        let python_install_dir_str = python_install_dir.to_string_lossy().to_string();
        log::info!(
            "check_openviking_state: installed=true, venv={}, cached_version={}",
            venv_python,
            if cached_ver.is_empty() { "(none)" } else { &cached_ver }
        );

        match python_env::pip_show_openviking(uv_path, &venv_python, &python_install_dir_str) {
            Ok(Some(v)) => {
                log::info!("check_openviking_state: version={}", v);
                current_version = Some(v.clone());
                *state.openviking_version.lock().unwrap() = v.clone();
                // 持久化版本号，避免下次启动读取失败
                let app_data_dir = app.path().app_data_dir().expect("no app data dir");
                let _ = std::fs::write(app_data_dir.join("openviking_version"), &v);
            }
            Ok(None) => {
                log::warn!("check_openviking_state: openviking not found in venv");
                // fallback: 使用上次缓存的版本号
                let cached = state.openviking_version.lock().unwrap().clone();
                if !cached.is_empty() {
                    log::info!("check_openviking_state: using cached version={}", cached);
                    current_version = Some(cached);
                }
            }
            Err(e) => {
                log::warn!("check_openviking_state: pip_show error: {}", e);
                let cached = state.openviking_version.lock().unwrap().clone();
                if !cached.is_empty() {
                    log::info!("check_openviking_state: using cached version={}", cached);
                    current_version = Some(cached);
                }
            }
        }

        // 跳过网络查询，只显示当前已安装版本


        python_version = get_python_version_internal(&venv_python);
    }

    let has_local_embed = if installed {
        let venv_python = state.venv_path.lock().unwrap().clone();
        let mut cmd = std::process::Command::new(&venv_python);
        cmd.args(["-c", "import llama_cpp"]);
        cmd.stdout(std::process::Stdio::null());
        cmd.stderr(std::process::Stdio::null());
        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        cmd.status()
            .map(|s| s.success())
            .unwrap_or(false)
    } else {
        false
    };

    Ok(OpenvikingState {
        installed,
        current_version,
        latest_version,
        python_version,
        upgradable,
        has_local_embed,
    })
}

#[derive(serde::Serialize)]
pub struct LatestVersionResult {
    pub latest_version: Option<String>,
    pub upgradable: bool,
}

#[tauri::command]
async fn check_latest_version(current_version: String) -> Result<LatestVersionResult, String> {
    match python_env::pip_index_latest_version().await {
        Ok(Some(latest)) => {
            let upgradable = latest != current_version;
            Ok(LatestVersionResult {
                latest_version: Some(latest),
                upgradable,
            })
        }
        Ok(None) | Err(_) => Ok(LatestVersionResult {
            latest_version: None,
            upgradable: false,
        }),
    }
}

fn get_python_version_internal(venv_python: &str) -> Option<String> {
    let mut cmd = std::process::Command::new(venv_python);
    cmd.args(["--version"]);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = cmd.output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout).to_string();
    text.strip_prefix("Python ").map(|s| s.trim().to_string())
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
    openviking_version: Option<String>,
    local_embed: Option<bool>,
) -> Result<String, String> {
    let version = python_version.unwrap_or_else(|| DEFAULT_PYTHON_VERSION.to_string());
    let local_embed = local_embed.unwrap_or(false);
    let uv_path = state.uv_path.clone();

    static INSTALLING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if INSTALLING.swap(true, std::sync::atomic::Ordering::Acquire) {
        return Err("已有安装/升级任务正在执行".to_string());
    }

    let result: Result<String, String> = (async {
        let app_data_dir = get_app_data_dir(&app)?;
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("创建应用数据目录失败: {}", e))?;
        // Scope uv's Python installation to app data dir to avoid
        // os error 448 (untrusted mount point) on Windows
        let python_install_dir = app_data_dir.join("uv-python");
        let python_install_dir_str = python_install_dir.to_string_lossy().to_string();
        std::fs::create_dir_all(&python_install_dir).ok();

        if !python_env::python_is_installed(&uv_path, &version, &python_install_dir_str) {
            python_env::python_install(&app, &uv_path, &version, &python_install_dir_str)?;
        } else {
            let _ = app.emit(
                "python-task-progress",
                python_env::ProgressPayload {
                    step: "downloading_python".into(),
                    message: format!("Python {} 已存在，跳过下载", version),
                    done: false,
                    log_line: String::new(),
                },
            );
        }

        let venv_target = app_data_dir.join("python");
        let venv_target_str = venv_target.to_string_lossy().to_string();
        if venv_target.exists() {
            std::fs::remove_dir_all(&venv_target)
                .map_err(|e| format!("删除旧 venv 失败: {}", e))?;
        }
        python_env::venv_create(&app, &uv_path, &version, &venv_target_str, &python_install_dir_str)?;

        let venv_python = venv_target
            .join(if cfg!(target_os = "windows") {
                "Scripts"
            } else {
                "bin"
            })
            .join(if cfg!(target_os = "windows") {
                "python.exe"
            } else {
                "python3"
            });
        let venv_python_str = venv_python.to_string_lossy().to_string();
        let wheel = resolve_llama_cpp_wheel_inner(&app);
        python_env::pip_install_openviking_with_wheel(
            &app,
            &uv_path,
            &venv_python_str,
            false,
            openviking_version.as_deref(),
            wheel.as_deref(),
            local_embed,
            &python_install_dir_str,
        )?;

        Ok(venv_python_str)
    })
    .await;

    INSTALLING.store(false, std::sync::atomic::Ordering::Release);

    match result {
        Ok(python_path) => {
            *state.venv_path.lock().unwrap() = python_path;
            let _ = app.emit(
                "python-task-progress",
                python_env::ProgressPayload {
                    step: "done".into(),
                    message: "安装完成".to_string(),
                    done: true,
                    log_line: String::new(),
                },
            );
            Ok("installed".to_string())
        }
        Err(e) => {
            let _ = app.emit(
                "python-task-progress",
                python_env::ProgressPayload {
                    step: "error".into(),
                    message: e.clone(),
                    done: true,
                    log_line: String::new(),
                },
            );
            Err(e)
        }
    }
}

#[tauri::command]
async fn upgrade_openviking(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServerState>,
    local_embed: Option<bool>,
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
    let local_embed = local_embed.unwrap_or(false);

    let result = {
        let app_data_dir = get_app_data_dir(&app)?;
        let python_install_dir = app_data_dir.join("uv-python");
        let python_install_dir_str = python_install_dir.to_string_lossy().to_string();
        std::fs::create_dir_all(&python_install_dir).ok();
        let wheel = resolve_llama_cpp_wheel_inner(&app);
        python_env::pip_install_openviking_with_wheel(&app, &uv_path, &venv_python, true, None, wheel.as_deref(), local_embed, &python_install_dir_str)
    };

    UPGRADING.store(false, std::sync::atomic::Ordering::Release);

    match result {
        Ok(()) => {
            let _ = app.emit(
                "python-task-progress",
                python_env::ProgressPayload {
                    step: "done".into(),
                    message: "升级完成".to_string(),
                    done: true,
                    log_line: String::new(),
                },
            );
            Ok("upgraded".to_string())
        }
        Err(e) => {
            let _ = app.emit(
                "python-task-progress",
                python_env::ProgressPayload {
                    step: "error".into(),
                    message: e.clone(),
                    done: true,
                    log_line: String::new(),
                },
            );
            Err(e)
        }
    }
}

#[tauri::command]
async fn upgrade_python(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServerState>,
    version: String,
    local_embed: Option<bool>,
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
    let python_install_dir = app_data_dir.join("uv-python");
    let python_install_dir_str = python_install_dir.to_string_lossy().to_string();
    std::fs::create_dir_all(&python_install_dir).ok();

    let _ = crate::process::stop_server(&state, &app).await;

    let result: Result<String, String> = (async {
        if !python_env::python_is_installed(&uv_path, &version, &python_install_dir_str) {
            python_env::python_install(&app, &uv_path, &version, &python_install_dir_str)?;
        }

        let venv_target = app_data_dir.join("python");
        if venv_target.exists() {
            std::fs::remove_dir_all(&venv_target)
                .map_err(|e| format!("删除旧 venv 失败: {}", e))?;
        }
        python_env::venv_create(&app, &uv_path, &version, &venv_target.to_string_lossy(), &python_install_dir_str)?;

        let venv_python = venv_target
            .join(if cfg!(target_os = "windows") {
                "Scripts"
            } else {
                "bin"
            })
            .join(if cfg!(target_os = "windows") {
                "python.exe"
            } else {
                "python3"
            });
        let venv_python_str = venv_python.to_string_lossy().to_string();
        let local_embed = local_embed.unwrap_or(false);
        let wheel = resolve_llama_cpp_wheel_inner(&app);
        python_env::pip_install_openviking_with_wheel(&app, &uv_path, &venv_python_str, false, None, wheel.as_deref(), local_embed, &python_install_dir_str)?;

        Ok(venv_python_str)
    })
    .await;

    UPGRADING_PY.store(false, std::sync::atomic::Ordering::Release);

    match result {
        Ok(python_path) => {
            *state.venv_path.lock().unwrap() = python_path;
            let _ = app.emit(
                "python-task-progress",
                python_env::ProgressPayload {
                    step: "done".into(),
                    message: "Python 版本切换完成".to_string(),
                    done: true,
                    log_line: String::new(),
                },
            );
            Ok("upgraded".to_string())
        }
        Err(e) => {
            let _ = app.emit(
                "python-task-progress",
                python_env::ProgressPayload {
                    step: "error".into(),
                    message: e.clone(),
                    done: true,
                    log_line: String::new(),
                },
            );
            Err(e)
        }
    }
}

#[tauri::command]
async fn get_python_versions(app: tauri::AppHandle, state: tauri::State<'_, ServerState>) -> Result<Vec<String>, String> {
    let app_data_dir = app.path().app_data_dir().unwrap_or_default();
    let python_install_dir = app_data_dir.join("uv-python");
    let python_install_dir_str = python_install_dir.to_string_lossy().to_string();
    python_env::python_list_all(&state.uv_path, &python_install_dir_str)
}

#[tauri::command]
async fn get_openviking_versions() -> Result<Vec<String>, String> {
    python_env::pip_index_all_versions().await
}

#[tauri::command]
async fn get_uv_path(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    Ok(state.uv_path.clone())
}

pub fn open_playground_inner(app: &tauri::AppHandle, state: &ServerState) -> Result<(), String> {
    let port = *state.port.lock().unwrap();
    let url_str = format!("http://localhost:{}", port);
    let url = url_str
        .parse::<tauri::Url>()
        .map_err(|e| format!("Invalid URL: {}", e))?;

    if let Some(window) = app.get_webview_window("playground") {
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        let app_for_nav = app.clone();
        tauri::WebviewWindowBuilder::new(app, "playground", tauri::WebviewUrl::External(url))
            .title("Playground")
            .inner_size(850.0, 650.0)
            .center()
            .initialization_script(
                r#"
document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (a && a.target === '_blank') {
        e.preventDefault();
        window.location.href = a.href;
    }
});
var _open = window.open;
window.open = function(url) {
    window.location.href = url;
};
"#,
            )
            .on_navigation(move |nav_url| {
                if nav_url.host_str() == Some("localhost") {
                    true
                } else {
                    if let Err(e) = app_for_nav
                        .opener()
                        .open_url(nav_url.as_str(), None::<&str>)
                    {
                        log::error!("Failed to open URL in browser: {}", e);
                    }
                    false
                }
            })
            .build()
            .map_err(|e| format!("Failed to create window: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn open_playground(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServerState>,
) -> Result<String, String> {
    open_playground_inner(&app, &state)?;
    Ok("ok".to_string())
}

fn resolve_bundled_model_path_inner(app: &tauri::AppHandle) -> String {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let dev_path = manifest_dir.join("Resources/models/bge-small-zh-v1.5-f16.gguf");
    let resource_dir = app
        .path()
        .resource_dir()
        .expect("failed to resolve resource dir");
    let prod_path = resource_dir.join("Resources/models/bge-small-zh-v1.5-f16.gguf");
    let path = if dev_path.exists() {
        dev_path
    } else {
        prod_path
    };
    path.to_string_lossy().to_string()
}

fn resolve_llama_cpp_wheel_inner(app: &tauri::AppHandle) -> Option<String> {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let dev_dir = manifest_dir.join("Resources").join("wheels");
    let resource_dir = app.path().resource_dir().ok()?;
    let prod_dir = resource_dir.join("Resources").join("wheels");

    // 在目录中查找 llama_cpp_python-*.whl 文件
    let search_dir = if dev_dir.exists() { &dev_dir } else { &prod_dir };
    if let Ok(entries) = std::fs::read_dir(search_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with("llama_cpp_python-") && name_str.ends_with(".whl") {
                log::info!("Found bundled wheel: {}", name_str);
                return Some(entry.path().to_string_lossy().to_string());
            }
        }
    }
    log::info!("No bundled llama-cpp-python wheel found in {:?}", search_dir);
    None
}

#[tauri::command]
fn resolve_bundled_model_path(app: tauri::AppHandle) -> Result<String, String> {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let dev_path = manifest_dir.join("Resources/models/bge-small-zh-v1.5-f16.gguf");
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("failed to resolve resource dir: {}", e))?;
    let prod_path = resource_dir.join("Resources/models/bge-small-zh-v1.5-f16.gguf");
    let path = if dev_path.exists() {
        dev_path
    } else {
        prod_path
    };
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn resolve_vectordb_path(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let workspace = state.workspace_path.lock().unwrap().clone();
    let expanded = if workspace.is_empty() {
        let expanded_ws = expand_tilde(&get_default_workspace_path());
        std::path::Path::new(&expanded_ws)
            .join(DATA_SUBDIR)
            .to_string_lossy()
            .to_string()
    } else {
        workspace
    };
    let mut vdb_path = std::path::PathBuf::from(&expanded);
    vdb_path.push(VECTORDB_SUBDIR);
    Ok(vdb_path.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_directory(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&p).map_err(|e| format!("删除目录失败 {}: {}", path, e))
}

#[tauri::command]
fn check_port(port: u16) -> Result<bool, String> {
    let addr = format!("127.0.0.1:{}", port);
    match std::net::TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("地址解析失败: {}", e))?,
        std::time::Duration::from_secs(1),
    ) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
fn kill_port_process(port: u16) -> Result<(), String> {
    crate::process::cleanup_port(port);
    Ok(())
}

#[tauri::command]
fn read_rebuild_lock(state: tauri::State<'_, ServerState>) -> Result<Option<String>, String> {
    let dir = get_ov_conf_dir(&state);
    let lock_path = std::path::Path::new(&dir).join(REBUILD_LOCK_FILENAME);
    if lock_path.exists() {
        std::fs::read_to_string(&lock_path)
            .map(Some)
            .map_err(|e| format!("读取锁文件失败: {}", e))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn write_rebuild_lock(state: tauri::State<'_, ServerState>, content: String) -> Result<(), String> {
    let dir = get_ov_conf_dir(&state);
    let lock_path = std::path::Path::new(&dir).join(REBUILD_LOCK_FILENAME);
    std::fs::write(&lock_path, &content).map_err(|e| format!("写入锁文件失败: {}", e))
}

#[tauri::command]
fn delete_rebuild_lock(state: tauri::State<'_, ServerState>) -> Result<(), String> {
    let dir = get_ov_conf_dir(&state);
    let lock_path = std::path::Path::new(&dir).join(REBUILD_LOCK_FILENAME);
    if lock_path.exists() {
        std::fs::remove_file(&lock_path).map_err(|e| format!("删除锁文件失败: {}", e))
    } else {
        Ok(())
    }
}

#[tauri::command]
async fn is_onboarded(state: tauri::State<'_, ServerState>) -> Result<bool, String> {
    let flag_path = get_onboarded_flag_path(&state);
    if std::path::Path::new(&flag_path).exists() {
        return Ok(true);
    }
    // Fallback: check old home_dir location for backward compatibility
    let old_flag_path = get_home_dir()
        .join(ONBOARDED_FLAG_NAME)
        .to_string_lossy()
        .to_string();
    Ok(std::path::Path::new(&old_flag_path).exists())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn mark_onboarded(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let flag_path = get_onboarded_flag_path(&state);
    if let Some(parent) = std::path::Path::new(&flag_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    std::fs::write(&flag_path, "1").map_err(|e| format!("写入标志文件失败: {}", e))?;
    Ok("ok".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let home = get_home_dir();
            let app_data_dir = app.path().app_data_dir().expect("no app data dir");
            let app_data_dir_str = app_data_dir.to_string_lossy().to_string();
            // macOS: ~/Library/Logs/OpenViking (backward compat)
            // Windows: %APPDATA%/com.openviking.desktop/logs
            // Linux: ~/.local/share/com.openviking.desktop/logs
            let log_dir = if cfg!(target_os = "macos") {
                home.join("Library/Logs/OpenViking")
            } else {
                app_data_dir.join("logs")
            };
            let desktop_log_path = log_dir
                .join("openviking-desktop.log")
                .to_string_lossy()
                .to_string();
            if let Some(parent) = std::path::Path::new(&desktop_log_path).parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(file) = std::fs::File::create(&desktop_log_path) {
                log::set_boxed_logger(Box::new(FileAndConsoleLogger { file: Mutex::new(file) }))
                    .map(|()| log::set_max_level(log::LevelFilter::Info))
                    .ok();
                log::info!("app log: {}", desktop_log_path);
            } else {
                env_logger::init();
            }

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
                    .join("Resources/uv")
                    .join(target_triple)
                    .join(uv_binary_name);
                if dev_path.exists() { dev_path }
                else if symlink_path.exists() { symlink_path }
                else { prod_path }
            }.to_string_lossy().to_string();
            log::info!("uv path: {}", uv_path);

            let venv_python_path = python_env::get_venv_python_path(&app_data_dir);
            let venv_path = if venv_python_path.exists() {
                venv_python_path.to_string_lossy().to_string()
            } else {
                String::new()
            };
            log::info!("venv path: {}", if venv_path.is_empty() { "(not installed)" } else { &venv_path });

            let server_log_path = log_dir
                .join("openviking.log")
                .to_string_lossy()
                .to_string();

            if let Some(parent) = std::path::Path::new(&server_log_path).parent() {
                std::fs::create_dir_all(parent).ok();
            }
            // 每次 app 启动时清空服务端日志，确保日志对应当前会话
            let _ = std::fs::File::create(&server_log_path);

            let workspace_path = {
                let ws_file = app_data_dir.join("workspace_path");
                if ws_file.exists() {
                    std::fs::read_to_string(&ws_file).unwrap_or_default()
                } else {
                    String::new()
                }
            };
            
            let expanded_workspace_path = expand_tilde(&workspace_path);

            let cached_version = {
                let ver_file = app_data_dir.join(OPENVIKING_VERSION_FILENAME);
                if ver_file.exists() {
                    std::fs::read_to_string(&ver_file).unwrap_or_default()
                } else {
                    String::new()
                }
            };

            app.manage(ServerState {
                child: Mutex::new(None),
                status: Mutex::new("stopped".to_string()),
                port: Mutex::new(1933),
                bot_port: Mutex::new(18790),
                venv_path: Mutex::new(venv_path),
                workspace_path: Mutex::new(expanded_workspace_path),
                server_log_path: server_log_path,
                desktop_log_path: desktop_log_path.clone(),
                last_error: Mutex::new(String::new()),
                uv_path,
                app_data_dir: Mutex::new(app_data_dir_str.clone()),
                openviking_version: Mutex::new(cached_version),
            });

            tray::create_tray(app.handle())?;

            let state = app.state::<ServerState>();
            let onboarded = std::path::Path::new(&get_onboarded_flag_path(&state)).exists();
            log::info!("Onboarded flag: {}", onboarded);

            if onboarded {
                // 首次启动：若 ov.conf 不存在则生成默认配置
                let conf_path = get_ov_conf_path(&state);
                if !std::path::Path::new(&conf_path).exists() {
                    log::info!("Generating default ov.conf at {}", conf_path);
                    let model_path = resolve_bundled_model_path_inner(app.handle());
                    let default_config = serde_json::json!({
                        "server": { "host": "127.0.0.1", "port": 1933, "cors_origins": ["*"] },
                        "bot": { "gateway": { "port": 18790 } },
                        "storage": { "workspace": std::path::Path::new(&get_default_workspace_path()).join(DATA_SUBDIR).to_string_lossy().to_string(), "vectordb": { "backend": "local" }, "agfs": { "backend": "local" } },
                        "embedding": {
                            "dense": { "provider": "local", "model": "bge-small-zh-v1.5-f16", "model_path": model_path },
                            "max_concurrent": 10, "max_retries": 3,
                            "circuit_breaker": { "failure_threshold": 5, "reset_timeout": 60, "max_reset_timeout": 600 }
                        },
                        "vlm": { "max_retries": 3, "max_concurrent": 100, "timeout": 60.0, "thinking": false, "stream": false },
                        "encryption": { "enabled": false },
                        "log": { "level": "INFO" },
                        "feishu": { "domain": "https://open.feishu.cn", "max_rows_per_sheet": 1000, "max_records_per_table": 1000 }
                    }).to_string();
                    if let Some(parent) = std::path::Path::new(&conf_path).parent() {
                        std::fs::create_dir_all(parent).ok();
                    }
                    std::fs::write(&conf_path, default_config).ok();
                }

                // 从 ov.conf 读取端口配置，覆盖默认值
                if let Ok(content) = std::fs::read_to_string(&conf_path) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(p) = json["server"]["port"].as_u64() {
                            *state.port.lock().unwrap() = p as u16;
                        }
                        if let Some(p) = json["bot"]["gateway"]["port"].as_u64() {
                            *state.bot_port.lock().unwrap() = p as u16;
                        }
                        log::info!("Config ports: server={}, bot={}",
                            *state.port.lock().unwrap(),
                            *state.bot_port.lock().unwrap());
                    }
                }

                // 端口配置已从 ov.conf 读取，服务启动由前端在
                // 端口冲突检查完成后通过 start_server 命令触发。

                // 启动时自动显示仪表盘窗口
                if let Some(window) = app.get_webview_window("dashboard") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            } else {
                // 首次运行：不生成配置，不自动启动，显示向导窗口
                log::info!("First run detected — showing onboarding wizard");
                if let Some(window) = app.get_webview_window("dashboard") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_server_status,
            get_last_error,
            start_server,
            stop_server,
            read_config,
            read_config_at,
            write_config,
            get_workspace,
            get_workspace_data_path,
            get_default_workspace,
            set_workspace,
            read_server_log,
            open_log_file,
            open_app_log_file,
            open_console,
            check_openviking_state,
            check_latest_version,
            install_openviking,
            upgrade_openviking,
            upgrade_python,
            get_python_versions,
            get_openviking_versions,
            get_uv_path,
            open_playground,
            resolve_bundled_model_path,
            resolve_vectordb_path,
            delete_directory,
            check_port,
            kill_port_process,
            read_rebuild_lock,
            write_rebuild_lock,
            delete_rebuild_lock,
            get_app_version,
            is_onboarded,
            mark_onboarded,
            exit_app,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "dashboard" || window.label() == "playground" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match event {
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { .. } => {
                    if let Some(window) = app_handle.get_webview_window("dashboard") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                tauri::RunEvent::Exit => {
                    if let Some(state) = app_handle.try_state::<ServerState>() {
                        let server_port = *state.port.lock().unwrap();
                        let bot_port = *state.bot_port.lock().unwrap();
                        let mut child_opt = state.child.lock().unwrap();
                        if let Some(ref mut c) = *child_opt {
                            log::info!("Killing openviking-server on RunEvent::Exit");
                            crate::process::kill_child(c);
                            *child_opt = None;
                            drop(child_opt);
                            crate::process::cleanup_port(server_port);
                            crate::process::cleanup_port(bot_port);
                        }
                    }
                }
                _ => {}
            }
        });
}
