use semver::Version as SemverVersion;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Clone, Serialize)]
pub struct ProgressPayload {
    pub step: String,
    pub message: String,
    pub done: bool,
    pub log_line: String,
}

fn run_uv(
    app: &AppHandle,
    uv_path: &str,
    args: &[&str],
    step: &str,
    message: &str,
    python_install_dir: &str,
) -> Result<(), String> {
    let mut cmd = Command::new(uv_path);
    for arg in args {
        cmd.arg(arg);
    }
    cmd.env("UV_PYTHON_INSTALL_DIR", python_install_dir);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 uv 失败: {}", e))?;

    let stderr = child.stderr.take();
    let app_clone = app.clone();
    let step_s = step.to_string();
    let msg_s = message.to_string();
    if let Some(stderr) = stderr {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    if !line.is_empty() {
                        let _ = app_clone.emit(
                            "python-task-progress",
                            ProgressPayload {
                                step: step_s.clone(),
                                message: msg_s.clone(),
                                done: false,
                                log_line: line,
                            },
                        );
                    }
                }
            }
        });
    }

    let status = child
        .wait()
        .map_err(|e| format!("等待 uv 完成失败: {}", e))?;
    if !status.success() {
        return Err(format!(
            "uv 命令失败 (exit code: {})",
            status.code().unwrap_or(-1)
        ));
    }
    Ok(())
}

fn run_uv_output(uv_path: &str, args: &[&str], python_install_dir: &str) -> Result<String, String> {
    let mut cmd = Command::new(uv_path);
    cmd.args(args);
    cmd.env("UV_PYTHON_INSTALL_DIR", python_install_dir);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = cmd.output()
        .map_err(|e| format!("执行 uv 失败: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("uv 命令失败: {}", stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn python_is_installed(uv_path: &str, version: &str, python_install_dir: &str) -> bool {
    let mut cmd = Command::new(uv_path);
    cmd.args(["python", "list", "--only-installed"]);
    cmd.env("UV_PYTHON_INSTALL_DIR", python_install_dir);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = cmd.output();
    match output {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout);
            text.lines().any(|l| l.contains(version))
        }
        _ => false,
    }
}

pub fn python_install(app: &AppHandle, uv_path: &str, version: &str, python_install_dir: &str) -> Result<(), String> {
    run_uv(
        app,
        uv_path,
        &["python", "install", version],
        "downloading_python",
        &format!("下载 Python {}...", version),
        python_install_dir,
    )
}

pub fn venv_create(
    app: &AppHandle,
    uv_path: &str,
    python_version: &str,
    target: &str,
    python_install_dir: &str,
) -> Result<(), String> {
    run_uv(
        app,
        uv_path,
        &["venv", "--python", python_version, target],
        "creating_venv",
        "创建虚拟环境...",
        python_install_dir,
    )
}

pub fn pip_install_openviking_with_wheel(
    app: &AppHandle,
    uv_path: &str,
    venv_python: &str,
    upgrade: bool,
    version: Option<&str>,
    prebuilt_wheel: Option<&str>,
    local_embed: bool,
    python_install_dir: &str,
) -> Result<(), String> {
    // 如果用户选择了 local-embed，且有预编译的 llama-cpp-python wheel，先安装它
    if local_embed {
        if let Some(wheel_path) = prebuilt_wheel {
            let wheel = std::path::Path::new(wheel_path);
            if wheel.exists() {
                log::info!("pip_install_openviking: pre-installing wheel: {}", wheel_path);
                run_uv(
                    app,
                    uv_path,
                    &["pip", "install", "--python", venv_python, "--no-deps", wheel_path],
                    "installing_wheel",
                    "安装 llama-cpp-python (预编译)...",
                    python_install_dir,
                )?;
            } else {
                log::warn!("pip_install_openviking: wheel not found at {}, skipping", wheel_path);
            }
        }
    }

    let extras = if local_embed { "[bot,local-embed]" } else { "[bot]" };
    let package = match version {
        Some(v) => format!("openviking{}=={}", extras, v),
        None => format!("openviking{}", extras),
    };
    let label = if local_embed { "OpenViking (含本地 Embedding)" } else { "OpenViking" };
    if upgrade {
        run_uv(
            app,
            uv_path,
            &["pip", "install", "--python", venv_python, "--upgrade", &package],
            "upgrading",
            &format!("升级 {}...", label),
            python_install_dir,
        )
    } else {
        run_uv(
            app,
            uv_path,
            &["pip", "install", "--python", venv_python, &package],
            "installing",
            &format!("安装 {}...", label),
            python_install_dir,
        )
    }
}

pub fn pip_show_openviking(uv_path: &str, venv_python: &str, python_install_dir: &str) -> Result<Option<String>, String> {
    log::info!(
        "pip_show_openviking: uv={}, python={}",
        uv_path,
        venv_python
    );

    // 方法 1: uv pip list --format json（结构化输出，无解析歧义）
    match run_uv_output(
        uv_path,
        &["pip", "list", "--python", venv_python, "--format", "json"],
        python_install_dir,
    ) {
        Ok(json) => {
            let json = json.trim_start_matches('\u{FEFF}').trim();
            if let Ok(packages) =
                serde_json::from_str::<Vec<serde_json::Value>>(json)
            {
                for pkg in &packages {
                    if pkg
                        .get("name")
                        .and_then(|v| v.as_str())
                        == Some("openviking")
                    {
                        if let Some(ver) =
                            pkg.get("version").and_then(|v| v.as_str())
                        {
                            let v = ver.to_string();
                            log::info!(
                                "pip_show_openviking: found via pip list: {}",
                                v
                            );
                            return Ok(Some(v));
                        }
                    }
                }
                log::warn!("pip_show_openviking: openviking not in pip list JSON output");
            } else {
                log::warn!("pip_show_openviking: failed to parse pip list JSON");
            }
        }
        Err(e) => {
            log::warn!("pip_show_openviking: uv pip list failed: {}", e);
        }
    }

    // 方法 2: Python 直接查询 importlib.metadata
    match get_version_via_python(venv_python) {
        Ok(Some(v)) => {
            log::info!("pip_show_openviking: found via Python: {}", v);
            return Ok(Some(v));
        }
        Ok(None) => {
            log::warn!("pip_show_openviking: Python method returned empty");
        }
        Err(e) => {
            log::warn!("pip_show_openviking: Python fallback error: {}", e);
        }
    }

    // 方法 3: uv pip show（大小写不敏感解析）
    match run_uv_output(
        uv_path,
        &["pip", "show", "--python", venv_python, "openviking"],
        python_install_dir,
    ) {
        Ok(text) => {
            for line in text.lines() {
                let trim = line.trim();
                if trim.len() > 8 && trim[..8].to_lowercase() == "version:" {
                    let ver = trim[8..].trim().to_string();
                    if !ver.is_empty() {
                        log::info!("pip_show_openviking: found via pip show: {}", ver);
                        return Ok(Some(ver));
                    }
                }
            }
            log::warn!("pip_show_openviking: pip show succeeded but version line not found");
            Ok(None)
        }
        Err(e) => {
            let lower = e.to_lowercase();
            if lower.contains("not found")
                || lower.contains("not installed")
                || lower.contains("no package")
            {
                log::info!("pip_show_openviking: package not installed");
                Ok(None)
            } else {
                log::error!("pip_show_openviking: all methods failed: {}", e);
                Err(e)
            }
        }
    }
}

fn get_version_via_python(venv_python: &str) -> Result<Option<String>, String> {
    let mut cmd = std::process::Command::new(venv_python);
    cmd.args(["-c", "import importlib.metadata; print(importlib.metadata.version('openviking'))"]);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = cmd.output()
        .map_err(|e| format!("执行 Python 失败: {}", e))?;
    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        let ver = text.trim().to_string();
        if !ver.is_empty() {
            return Ok(Some(ver));
        }
    }
    Ok(None)
}

pub async fn pip_index_all_versions() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://pypi.org/pypi/openviking/json")
        .send()
        .await
        .map_err(|e| format!("PyPI API 请求失败: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("PyPI API 返回状态码: {}", resp.status()));
    }
    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("PyPI API 解析失败: {}", e))?;

    let releases = data["releases"]
        .as_object()
        .ok_or_else(|| "PyPI 返回格式异常: 缺少 releases 字段".to_string())?;

    let mut versions: Vec<String> = releases.keys().cloned().collect();

    versions.sort_by(|a, b| {
        let a_sem = SemverVersion::parse(a);
        let b_sem = SemverVersion::parse(b);
        match (a_sem, b_sem) {
            (Ok(va), Ok(vb)) => vb.cmp(&va),
            (Ok(_), Err(_)) => std::cmp::Ordering::Less,
            (Err(_), Ok(_)) => std::cmp::Ordering::Greater,
            (Err(_), Err(_)) => b.cmp(a),
        }
    });

    Ok(versions)
}

pub async fn pip_index_latest_version() -> Result<Option<String>, String> {
    let versions = pip_index_all_versions().await?;
    Ok(versions.into_iter().next())
}

pub fn python_list_all(uv_path: &str, python_install_dir: &str) -> Result<Vec<String>, String> {
    let output = run_uv_output(uv_path, &["python", "list", "--all-versions"], python_install_dir)?;
    let mut versions: Vec<String> = output
        .lines()
        .filter_map(|l| {
            let trimmed = l.trim();
            if trimmed.starts_with("cpython-") {
                let parts: Vec<&str> = trimmed.split('-').collect();
                if parts.len() >= 2 {
                    let ver = parts[1];
                    let ver_parts: Vec<&str> = ver.split('.').collect();
                    if ver_parts.len() >= 2 && ver_parts[0] == "3" {
                        return Some(format!("{}.{}", ver_parts[0], ver_parts[1]));
                    }
                }
            }
            None
        })
        .collect();
    // 按语义版本号降序排列（最新版本在前）
    versions.sort_by(|a, b| {
        let va = SemverVersion::parse(&format!("{}.0", a));
        let vb = SemverVersion::parse(&format!("{}.0", b));
        match (va, vb) {
            (Ok(va), Ok(vb)) => vb.cmp(&va),
            _ => b.cmp(a), // 解析失败时回退到字典序降序
        }
    });
    versions.dedup();
    Ok(versions)
}

pub fn get_venv_python_path(app_data_dir: &std::path::Path) -> std::path::PathBuf {
    let (scripts_dir, ext) = if cfg!(target_os = "windows") {
        ("Scripts", "python.exe")
    } else {
        ("bin", "python3")
    };
    app_data_dir.join("python").join(scripts_dir).join(ext)
}
