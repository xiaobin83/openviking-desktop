use semver::Version as SemverVersion;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

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
    version: Option<&str>,
) -> Result<(), String> {
    let package = match version {
        Some(v) => format!("openviking[bot,local-embed]=={}", v),
        None => "openviking[bot,local-embed]".to_string(),
    };
    if upgrade {
        run_uv(
            app,
            uv_path,
            &[
                "pip",
                "install",
                "--python",
                venv_python,
                "--upgrade",
                &package,
            ],
            "upgrading",
            &format!(
                "升级 OpenViking{}...",
                version.map(|v| format!(" v{}", v)).unwrap_or_default()
            ),
        )
    } else {
        run_uv(
            app,
            uv_path,
            &["pip", "install", "--python", venv_python, &package],
            "installing",
            &format!(
                "安装 OpenViking{}...",
                version.map(|v| format!(" v{}", v)).unwrap_or_default()
            ),
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
    let ext = if cfg!(target_os = "windows") {
        "python.exe"
    } else {
        "python3"
    };
    app_data_dir.join("python").join("bin").join(ext)
}
