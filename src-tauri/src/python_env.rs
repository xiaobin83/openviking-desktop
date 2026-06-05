use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};
use serde::Serialize;

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
) -> Result<(), String> {
    let mut cmd = Command::new(uv_path);
    for arg in args {
        cmd.arg(arg);
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
                        let _ = app_clone.emit("python-task-progress", ProgressPayload {
                            step: step_s.clone(),
                            message: msg_s.clone(),
                            done: false,
                            log_line: line,
                        });
                    }
                }
            }
        });
    }

    let status = child.wait().map_err(|e| format!("等待 uv 完成失败: {}", e))?;
    if !status.success() {
        return Err(format!(
            "uv 命令失败 (exit code: {})",
            status.code().unwrap_or(-1)
        ));
    }
    Ok(())
}

fn run_uv_output(uv_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(uv_path)
        .args(args)
        .output()
        .map_err(|e| format!("执行 uv 失败: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("uv 命令失败: {}", stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn python_is_installed(uv_path: &str, version: &str) -> bool {
    let output = Command::new(uv_path)
        .args(["python", "list", "--only-installed"])
        .output();
    match output {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout);
            text.lines().any(|l| l.contains(version))
        }
        _ => false,
    }
}

pub fn python_install(app: &AppHandle, uv_path: &str, version: &str) -> Result<(), String> {
    run_uv(
        app,
        uv_path,
        &["python", "install", version],
        "downloading_python",
        &format!("下载 Python {}...", version),
    )
}

pub fn venv_create(
    app: &AppHandle,
    uv_path: &str,
    python_version: &str,
    target: &str,
) -> Result<(), String> {
    run_uv(
        app,
        uv_path,
        &["venv", "--python", python_version, target],
        "creating_venv",
        "创建虚拟环境...",
    )
}

pub fn pip_install_openviking(
    app: &AppHandle,
    uv_path: &str,
    venv_python: &str,
    upgrade: bool,
) -> Result<(), String> {
    if upgrade {
        run_uv(
            app,
            uv_path,
            &["pip", "install", "--python", venv_python, "--upgrade", "openviking[bot,local-embed]"],
            "upgrading",
            "升级 OpenViking...",
        )
    } else {
        run_uv(
            app,
            uv_path,
            &["pip", "install", "--python", venv_python, "openviking[bot,local-embed]"],
            "installing",
            "安装 OpenViking...",
        )
    }
}

pub fn pip_show_openviking(uv_path: &str, venv_python: &str) -> Result<Option<String>, String> {
    let output = run_uv_output(
        uv_path,
        &["pip", "show", "--python", venv_python, "openviking"],
    );
    match output {
        Ok(text) => {
            for line in text.lines() {
                if let Some(ver) = line.strip_prefix("Version: ") {
                    return Ok(Some(ver.trim().to_string()));
                }
            }
            Ok(None)
        }
        Err(e) => {
            if e.contains("not found") || e.contains("not installed") {
                Ok(None)
            } else {
                Err(e)
            }
        }
    }
}

pub fn pip_index_latest_version(uv_path: &str) -> Result<Option<String>, String> {
    let output = run_uv_output(uv_path, &["pip", "index", "versions", "openviking"]);
    match output {
        Ok(text) => {
            for line in text.lines() {
                if line.starts_with("openviking ") && line.contains('(') {
                    let start = line.find('(').unwrap() + 1;
                    let end = line.find(')').unwrap_or(line.len());
                    return Ok(Some(line[start..end].to_string()));
                }
            }
            Ok(None)
        }
        Err(_) => Ok(None),
    }
}

pub fn python_list_all(uv_path: &str) -> Result<Vec<String>, String> {
    let output = run_uv_output(uv_path, &["python", "list", "--all-versions"])?;
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
    versions.sort();
    versions.dedup();
    Ok(versions)
}

pub fn get_venv_python_path(app_data_dir: &std::path::Path) -> std::path::PathBuf {
    let ext = if cfg!(target_os = "windows") { "python.exe" } else { "python3" };
    app_data_dir.join("python").join("bin").join(ext)
}
