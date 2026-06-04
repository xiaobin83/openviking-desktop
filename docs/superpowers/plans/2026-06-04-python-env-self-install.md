# Python 环境自安装/升级 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除内置 Python 捆绑，改用 `uv` 二进制实现 app 内一键安装/升级 Python 和 openviking[bot]

**Architecture:** 新增 `python_env.rs` 模块封装 uv 子进程调用，新增 `PythonEnvCard` React 组件提供安装/升级 UI。Rust 后端通过 Tauri event 流式推送进度和日志到前端

**Tech Stack:** Rust (Tauri v2), React 18 + TypeScript, uv binary (bundled), Tailwind CSS v4, i18next

---

## 文件变更图

```
创建:
  scripts/download-uv.sh
  src-tauri/src/python_env.rs
  src/components/dashboard/PythonEnvCard.tsx

修改:
  src-tauri/tauri.conf.json           (bundle.resources)
  src-tauri/src/lib.rs                (ServerState, setup, commands)
  src-tauri/src/process.rs            (python_path → venv_path)
  src/lib/types.ts                    (新增 PythonEnvState)
  src/locales/zh.json                 (新增 python.* keys)
  src/locales/en.json                 (新增 python.* keys)
  src/components/dashboard/Dashboard.tsx  (集成 PythonEnvCard)
  .gitignore                          (添加 resources/uv/)

删除:
  scripts/bundle-python.sh
  resources/python/                   (手动 rm)
```

---

### Task 1: 创建 download-uv.sh 脚本

**Files:**
- Create: `scripts/download-uv.sh`

- [ ] **Step 1: 编写 download-uv.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# download-uv.sh — 从 GitHub Releases 下载 uv 二进制到 resources/uv/<target-triple>/
# 用法: ./scripts/download-uv.sh --platform <target-triple>
#       无参数则列出支持的 platform 列表

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESOURCES_DIR="$SCRIPT_DIR/../resources/uv"

UV_VERSION="${UV_VERSION:-0.11.17}"
GH_REPO="astral-sh/uv"

PLATFORMS=(
  "aarch64-apple-darwin"
  "x86_64-apple-darwin"
  "x86_64-pc-windows-msvc"
  "x86_64-unknown-linux-gnu"
)

PLATFORM=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="$2"; shift 2 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

if [[ -z "$PLATFORM" ]]; then
  echo "支持的 platform 列表:"
  for p in "${PLATFORMS[@]}"; do
    echo "  $p -> $RESOURCES_DIR/$p/uv"
  done
  echo ""
  echo "用法: $0 --platform <target-triple>"
  exit 1
fi

# 验证 platform 是否在支持列表中
VALID=false
for p in "${PLATFORMS[@]}"; do
  if [[ "$p" == "$PLATFORM" ]]; then
    VALID=true
    break
  fi
done

if [[ "$VALID" != "true" ]]; then
  echo "错误: 不支持的 platform '$PLATFORM'"
  echo "支持的 platform: ${PLATFORMS[*]}"
  exit 1
fi

TARGET_DIR="$RESOURCES_DIR/$PLATFORM"
mkdir -p "$TARGET_DIR"

ARCHIVE_EXT="tar.gz"
BINARY_NAME="uv"
if [[ "$PLATFORM" == *"windows"* ]]; then
  ARCHIVE_EXT="zip"
  BINARY_NAME="uv.exe"
fi

ARCHIVE="uv-${PLATFORM}.${ARCHIVE_EXT}"
URL="https://github.com/${GH_REPO}/releases/download/${UV_VERSION}/${ARCHIVE}"

echo "下载 $ARCHIVE ..."
TEMP_DIR="$(mktemp -d)"
curl -fsSL "$URL" -o "$TEMP_DIR/$ARCHIVE"

echo "解压到 $TARGET_DIR ..."
if [[ "$ARCHIVE_EXT" == "zip" ]]; then
  unzip -q -o "$TEMP_DIR/$ARCHIVE" -d "$TEMP_DIR/extract"
  mv "$TEMP_DIR/extract"/*/"${BINARY_NAME}" "$TARGET_DIR/${BINARY_NAME}" 2>/dev/null || mv "$TEMP_DIR/extract/${BINARY_NAME}" "$TARGET_DIR/${BINARY_NAME}" 2>/dev/null
else
  tar xzf "$TEMP_DIR/$ARCHIVE" -C "$TEMP_DIR"
  mv "$TEMP_DIR/${BINARY_NAME}" "$TARGET_DIR/${BINARY_NAME}" 2>/dev/null
fi

chmod +x "$TARGET_DIR/${BINARY_NAME}"

rm -rf "$TEMP_DIR"

echo "完成: $TARGET_DIR/${BINARY_NAME}"
"$TARGET_DIR/${BINARY_NAME}" --version
```

- [ ] **Step 2: 赋予执行权限**

```bash
chmod +x scripts/download-uv.sh
```

- [ ] **Step 3: 测试脚本（macOS arm64）**

```bash
./scripts/download-uv.sh --platform aarch64-apple-darwin
```

- [ ] **Step 4: 验证二进制可以执行**

```bash
resources/uv/aarch64-apple-darwin/uv --version
```

Expected: `uv 0.11.17 (Homebrew 2026-05-28 aarch64-apple-darwin)` 或类似

- [ ] **Step 5: Commit**

```bash
git add scripts/download-uv.sh
git commit -m "feat: add download-uv.sh script for uv binary bundling"
```

---

### Task 2: 清理旧构建产物

**Files:**
- Delete: `scripts/bundle-python.sh`
- Modify: `src-tauri/tauri.conf.json:37-39`

- [ ] **Step 1: 删除 bundle-python.sh**

```bash
rm scripts/bundle-python.sh
```

- [ ] **Step 2: 更新 tauri.conf.json 的 bundle.resources**

将 `src-tauri/tauri.conf.json` 第 37-39 行：
```json
    "resources": [
      "Resources/python/**/*"
    ],
```

改为：
```json
    "resources": [
      "Resources/uv/**/*"
    ],
```

- [ ] **Step 3: Commit**

```bash
git add scripts/bundle-python.sh src-tauri/tauri.conf.json
git commit -m "chore: remove bundle-python.sh, update resources to uv"
```

---

### Task 3: 更新 .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: 读取现有的 .gitignore**

- [ ] **Step 2: 添加 entries**

在 `.gitignore` 末尾追加：
```
# uv binary (downloaded by scripts/download-uv.sh)
resources/uv/
```

同时确保已有 `resources/python/`（若存在该行则保留）。

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add resources/uv/ to gitignore"
```

---

### Task 4: 创建 python_env.rs 模块

**Files:**
- Create: `src-tauri/src/python_env.rs`

- [ ] **Step 1: 将 python_env 声明为 lib.rs 的模块**

在 `src-tauri/src/lib.rs` 第 5-6 行，在 `mod tray;` 之后添加：
```rust
mod python_env;
```

- [ ] **Step 2: 编写 python_env.rs**

```rust
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

/// 运行 uv 命令，逐行读取 stdout 和 stderr，通过 event 推送进度
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

    // 在独立线程读取 stderr
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

    // 主线程读取 stdout
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                if !line.is_empty() {
                    let _ = app.emit("python-task-progress", ProgressPayload {
                        step: step.to_string(),
                        message: message.to_string(),
                        done: false,
                        log_line: line,
                    });
                }
            }
        }
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

/// 运行 uv 命令并捕获文本输出（用于查询命令）
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

/// 检查 Python 版本是否已通过 uv 安装
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

/// 安装 Python 版本
pub fn python_install(app: &AppHandle, uv_path: &str, version: &str) -> Result<(), String> {
    run_uv(
        app,
        uv_path,
        &["python", "install", version],
        "downloading_python",
        &format!("下载 Python {}...", version),
    )
}

/// 创建 venv
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

/// 安装 openviking[bot] 到指定 venv
pub fn pip_install_openviking(
    app: &AppHandle,
    uv_path: &str,
    venv_python: &str,
    upgrade: bool,
) -> Result<(), String> {
    let mut args = vec!["pip", "install", "--python", venv_python, "openviking[bot]"];
    if upgrade {
        args.push("--upgrade");
    }
    let step = if upgrade { "upgrading" } else { "installing" };
    let msg = if upgrade { "升级 OpenViking..." } else { "安装 OpenViking..." };
    run_uv(app, uv_path, &args, step, msg)
}

/// 查询已安装 openviking 版本
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
            // 包未安装时不报错，返回 None
            if e.contains("not found") || e.contains("not installed") {
                Ok(None)
            } else {
                Err(e)
            }
        }
    }
}

/// 查询 PyPI 上 openviking 最新版本
pub fn pip_index_latest_version(uv_path: &str) -> Result<Option<String>, String> {
    let output = run_uv_output(uv_path, &["pip", "index", "versions", "openviking"]);
    match output {
        Ok(text) => {
            // 输出格式: "openviking (0.3.0)\nAvailable versions: 0.3.0, 0.2.1, 0.2.0"
            for line in text.lines() {
                if line.starts_with("openviking ") && line.contains('(') {
                    let start = line.find('(').unwrap() + 1;
                    let end = line.find(')').unwrap_or(line.len());
                    return Ok(Some(line[start..end].to_string()));
                }
            }
            Ok(None)
        }
        Err(_) => {
            // 网络错误时静默返回 None
            Ok(None)
        }
    }
}

/// 列出所有可下载的 Python 版本
pub fn python_list_all(uv_path: &str) -> Result<Vec<String>, String> {
    let output = run_uv_output(uv_path, &["python", "list", "--all-versions"])?;
    let mut versions: Vec<String> = output
        .lines()
        .filter_map(|l| {
            let trimmed = l.trim();
            // 只保留 cpython 的稳定版本，格式如 "3.12.13" 或 "cpython-3.12.13-linux-x86_64-gnu"
            if trimmed.starts_with("cpython-") {
                let parts: Vec<&str> = trimmed.split('-').collect();
                if parts.len() >= 2 {
                    let ver = parts[1];
                    // 只保留 3.x 版本，使用前两位如 "3.12"
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

/// 获取 userdata venv 的 python3 路径
pub fn get_venv_python_path(app_data_dir: &std::path::Path) -> std::path::PathBuf {
    let ext = if cfg!(target_os = "windows") { "python.exe" } else { "python3" };
    app_data_dir.join("python").join("bin").join(ext)
}
```

- [ ] **Step 3: 在 `src-tauri/Cargo.toml` 中添加 `serde` 依赖（如不存在）**

检查 `Cargo.toml` 是否已有 `serde = "1"` with `derive` feature。目前是 `serde_json = "1"` 但没有 `serde`。需要添加：

```toml
serde = { version = "1", features = ["derive"] }
```

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 中添加（在 `serde_json` 之前）：

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/python_env.rs src-tauri/Cargo.toml
git commit -m "feat: add python_env.rs module for uv subprocess management"
```

---

### Task 5: 更新 lib.rs — ServerState、commands、setup

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 重命名 ServerState 的 python_path → venv_path，新增 uv_path 和 openviking_version**

修改 `src-tauri/src/lib.rs` 第 14-22 行的 `ServerState` 结构体：

```rust
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
```

- [ ] **Step 2: 在 setup() 中替换 python_path 解析逻辑，新增 venv_path 和 uv_path 解析**

修改 `src-tauri/src/lib.rs` 第 158-170 行，将现有 `python_path` 3 级 fallback 替换为：

```rust
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
log::info!("venv path: {}", if venv_path.is_empty() { "(not installed)" } else { venv_path.as_str() });
```

注意：保留 `app_data_dir` 的定义（原在第 183 行），需要将其移到上面。原第 183 行 `let app_data_dir = app.path().app_data_dir().expect("no app data dir");` 需要整合到新代码块中，**只声明一次**。

- [ ] **Step 3: 更新 ServerState 初始化（第 195-203 行）**

将：
```rust
            app.manage(ServerState {
                child: Mutex::new(None),
                status: Mutex::new("stopped".to_string()),
                port: Mutex::new(1933),
                python_path,
                workspace_path: Mutex::new(expanded_workspace_path),
                server_log_path,
                last_error: Mutex::new(String::new()),
            });
```

改为：
```rust
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
```

- [ ] **Step 4: 更新自动启动逻辑（第 227-231 行）**

将：
```rust
            // 自动启动服务
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = process::spawn_server_with_app_handle(&app_handle).await;
            });
```

改为：
```rust
            // 自动启动服务（仅在 venv 已安装时）
            let auto_start_handle = app.handle().clone();
            let auto_start_venv_empty = state.venv_path.lock().unwrap().is_empty();
            if !auto_start_venv_empty {
                tauri::async_runtime::spawn(async move {
                    let _ = process::spawn_server_with_app_handle(&auto_start_handle).await;
                });
            }
```

- [ ] **Step 5: 新增 Tauri commands**

在 `lib.rs` 中，`open_log_file` 命令之后（第 148 行之后），`run()` 函数之前，添加以下命令：

```rust
#[derive(serde::Serialize)]
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
        let venv_python = &state.venv_path;

        // 获取已安装版本
        current_version = python_env::pip_show_openviking(uv_path, venv_python).ok().flatten();
        if let Some(ref v) = current_version {
            *state.openviking_version.lock().unwrap() = v.clone();
        }

        // 检查 PyPI 最新版本（网络错误静默忽略）
        latest_version = python_env::pip_index_latest_version(uv_path).ok().flatten();

        // 比较版本
        if let (Some(ref cur), Some(ref latest)) = (&current_version, &latest_version) {
            upgradable = cur != latest;
        }

        // 获取 Python 版本
        python_version = get_python_version_internal(venv_python);
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
    // 输出格式: "Python 3.13.3"
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

    // 并发保护：同一时间只允许一个安装操作
    static INSTALLING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if INSTALLING.swap(true, std::sync::atomic::Ordering::Acquire) {
        return Err("已有安装/升级任务正在执行".to_string());
    }

    let result = async {
        // 1. 检查/安装 Python
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

        // 2. 创建 venv
        let app_data_dir = get_app_data_dir(&app)?;
        let venv_target = app_data_dir.join("python");
        let venv_target_str = venv_target.to_string_lossy().to_string();
        // 如果 venv 已存在则先删除
        if venv_target.exists() {
            std::fs::remove_dir_all(&venv_target)
                .map_err(|e| format!("删除旧 venv 失败: {}", e))?;
        }
        std::fs::create_dir_all(app_data_dir)
            .map_err(|e| format!("创建应用数据目录失败: {}", e))?;
        python_env::venv_create(&app, &uv_path, &version, &venv_target_str)?;

        // 3. 安装 openviking[bot]
        let venv_python = venv_target.join("bin")
            .join(if cfg!(target_os = "windows") { "python.exe" } else { "python3" });
        let venv_python_str = venv_python.to_string_lossy().to_string();
        python_env::pip_install_openviking(&app, &uv_path, &venv_python_str, false)?;

        Ok(venv_python_str)
    }.await;

    INSTALLING.store(false, std::sync::atomic::Ordering::Release);

    match result {
        Ok(python_path) => {
            // 更新 state.venv_path
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

    let result = python_env::pip_install_openviking(&app, &uv_path, &venv_python, true).await;

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

    // 先停止服务
    let _ = crate::process::stop_server(&state, &app).await;

    let result = async {
        // 1. 安装新 Python
        if !python_env::python_is_installed(&uv_path, &version) {
            python_env::python_install(&app, &uv_path, &version)?;
        }

        // 2. 删除旧 venv 并重建
        let venv_target = app_data_dir.join("python");
        if venv_target.exists() {
            std::fs::remove_dir_all(&venv_target)
                .map_err(|e| format!("删除旧 venv 失败: {}", e))?;
        }
        python_env::venv_create(&app, &uv_path, &version, &venv_target.to_string_lossy())?;

        // 3. 安装 openviking[bot]
        let venv_python = venv_target.join("bin")
            .join(if cfg!(target_os = "windows") { "python.exe" } else { "python3" });
        let venv_python_str = venv_python.to_string_lossy().to_string();
        python_env::pip_install_openviking(&app, &uv_path, &venv_python_str, false)?;

        Ok(venv_python_str)
    }.await;

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
```

注意：`install_openviking` 和 `upgrade_python` 完成后会更新 `state.venv_path`（已改为 `Mutex<String>`），并通过 `python-task-progress` event 通知前端。前端收到 `done: true` 后重新调用 `check_openviking_state` 刷新 UI 并启动服务。

- [ ] **Step 6: 更新 invoke_handler 注册新命令**

修改 `src-tauri/src/lib.rs` 第 235-246 行的 `generate_handler!`：

```rust
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
```

- [ ] **Step 7: 确保 use 语句正确**

在 `lib.rs` 顶部，确保有 `use crate::python_env;` 和 `use serde::Serialize;`（由 `mod python_env;` 和 Tauri 的 derive 提供即可）。

- [ ] **Step 8: 编译检查**

```bash
cd src-tauri && cargo check 2>&1
```

修复编译错误后，确认 `cargo check` 通过。

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add venv/uv management commands and state to lib.rs"
```

---

### Task 6: 更新 process.rs — 重命名 python_path → venv_path

**Files:**
- Modify: `src-tauri/src/process.rs`

- [ ] **Step 1: 替换所有 `python_path` 引用为 `venv_path`**

在 `src-tauri/src/process.rs` 中（注意 `venv_path` 现在是 `Mutex<String>`，需要 `.lock().unwrap()` 获取值）：
- 第 24 行：`let python_path = &state.python_path;` → `let venv_path = state.venv_path.lock().unwrap().clone();`
- 第 25 行：`!std::path::Path::new(python_path).exists()` → `!std::path::Path::new(&venv_path).exists()`
- 第 26 行：错误消息改为 `"OpenViking 未安装，请先在仪表盘中安装"`
- 第 53 行：`Command::new(python_path)` → `Command::new(&venv_path)`
- 第 76 行：`let state_python_path = state.python_path.clone();` → `let state_venv_path = state.venv_path.lock().unwrap().clone();`
- 第 106 行：`state_python_path,` → `state_venv_path,`
- 第 161 行（函数签名）：`python_path: String` → `venv_path: String`
- 第 257 行：`Command::new(&python_path)` → `Command::new(&venv_path)`

- [ ] **Step 2: 编译检查**

```bash
cd src-tauri && cargo check 2>&1
```

确认编译通过。

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/process.rs
git commit -m "refactor: rename python_path to venv_path in process.rs"
```

---

### Task 7: 添加前端 TypeScript 类型

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: 在 types.ts 末尾添加新类型**

```typescript
export interface PythonEnvState {
  installed: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  pythonVersion: string | null;
  upgradable: boolean;
}

export interface PythonTaskProgress {
  step: string;
  message: string;
  done: boolean;
  log_line: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add PythonEnvState and PythonTaskProgress types"
```

---

### Task 8: 添加国际化条目

**Files:**
- Modify: `src/locales/zh.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: 在 zh.json 末尾（最后一个 `}` 之前）添加**

```json
  "python.not_installed": "OpenViking 未安装",
  "python.not_installed_hint": "请安装后即可启动服务",
  "python.install": "安装 OpenViking",
  "python.upgrade": "升级到 {{version}}",
  "python.latest": "已是最新",
  "python.installing": "安装 OpenViking...",
  "python.upgrading": "升级 OpenViking...",
  "python.downloading": "下载 Python {{version}}...",
  "python.creating_venv": "创建虚拟环境...",
  "python.change_version": "更改 Python 版本",
  "python.current_version": "当前版本",
  "python.new_version": "新版本",
  "python.confirm_change": "更改 Python 版本将重新创建 virtualenv 并重新安装 openviking，是否继续？",
  "python.network_error": "网络连接失败，请检查网络后重试",
  "python.uv_not_found": "uv 运行时未找到，请重新安装 OpenViking Desktop",
  "python.env_title": "Python 环境",
  "python.log_output": "stdout/stderr 输出"
```

- [ ] **Step 2: 在 en.json 末尾添加**

```json
  "python.not_installed": "OpenViking Not Installed",
  "python.not_installed_hint": "Install to start the service",
  "python.install": "Install OpenViking",
  "python.upgrade": "Upgrade to {{version}}",
  "python.latest": "Up to Date",
  "python.installing": "Installing OpenViking...",
  "python.upgrading": "Upgrading OpenViking...",
  "python.downloading": "Downloading Python {{version}}...",
  "python.creating_venv": "Creating virtual environment...",
  "python.change_version": "Change Python Version",
  "python.current_version": "Current Version",
  "python.new_version": "New Version",
  "python.confirm_change": "Changing Python version will recreate the virtualenv and reinstall openviking. Continue?",
  "python.network_error": "Network error, please check your connection and retry",
  "python.uv_not_found": "uv runtime not found, please reinstall OpenViking Desktop",
  "python.env_title": "Python Environment",
  "python.log_output": "stdout/stderr output"
```

- [ ] **Step 3: Commit**

```bash
git add src/locales/zh.json src/locales/en.json
git commit -m "feat: add python env i18n keys"
```

---

### Task 9: 创建 PythonEnvCard 组件

**Files:**
- Create: `src/components/dashboard/PythonEnvCard.tsx`

- [ ] **Step 1: 编写 PythonEnvCard.tsx**

```tsx
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { PythonEnvState, PythonTaskProgress } from '../../lib/types';

export default function PythonEnvCard({
  onStateChange,
}: {
  onStateChange: (state: PythonEnvState) => void;
}) {
  const { t } = useTranslation();
  const [envState, setEnvState] = useState<PythonEnvState>({
    installed: false,
    currentVersion: null,
    latestVersion: null,
    pythonVersion: null,
    upgradable: false,
  });
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [showVersionDialog, setShowVersionDialog] = useState(false);
  const [pythonVersions, setPythonVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [error, setError] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 初始化：检查状态
  useEffect(() => {
    invoke<PythonEnvState>('check_openviking_state')
      .then((state) => {
        setEnvState(state);
        onStateChange(state);
      })
      .catch(console.error);
  }, []);

  // 监听进度事件
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<PythonTaskProgress>('python-task-progress', (event) => {
      const { step, message, done, log_line } = event.payload;
      if (log_line) {
        setLogs((prev) => [...prev.slice(-200), log_line]);
      }
      if (step === 'error') {
        setError(message);
        setLoading(false);
        setStatusMessage('');
      } else if (done) {
        setLoading(false);
        setStatusMessage('');
        setLogs([]);
        setError('');
        // 刷新状态
        invoke<PythonEnvState>('check_openviking_state')
          .then((state) => {
            setEnvState(state);
            onStateChange(state);
          })
          .catch(console.error);
      } else {
        setStatusMessage(message);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleInstall = async () => {
    setLoading(true);
    setError('');
    setLogs([]);
    setShowLogs(true);
    try {
      await invoke('install_openviking', { pythonVersion: '3.13' });
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setLoading(true);
    setError('');
    setLogs([]);
    setShowLogs(true);
    try {
      await invoke('upgrade_openviking');
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  const handleOpenVersionDialog = async () => {
    try {
      const versions = await invoke<string[]>('get_python_versions');
      setPythonVersions(versions);
      setSelectedVersion(envState.pythonVersion || '3.13');
      setShowVersionDialog(true);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleChangePython = async () => {
    if (!window.confirm(t('python.confirm_change'))) return;
    setShowVersionDialog(false);
    setLoading(true);
    setError('');
    setLogs([]);
    setShowLogs(true);
    try {
      await invoke('upgrade_python', { version: selectedVersion });
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  const isInstalled = envState.installed;
  const isUpgradable = envState.upgradable;

  return (
    <>
      <div className="group animate-slide-up rounded-2xl border border-border-subtle bg-surface-card/60 p-5 backdrop-blur-sm transition-all duration-300 hover:border-border-active hover:bg-surface-card/80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-elevated">
              <span className="text-lg">🐍</span>
            </div>
            <div>
              <p className="font-semibold text-text-primary">{t('python.env_title')}</p>
              {isInstalled ? (
                <p className="font-mono text-xs text-text-muted">
                  Python {envState.pythonVersion} | OpenViking v{envState.currentVersion}
                  {!isUpgradable && (
                    <span className="ml-1 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400">
                      {t('python.latest')}
                    </span>
                  )}
                  {isUpgradable && envState.latestVersion && (
                    <span className="ml-1 text-aurora-400"> → v{envState.latestVersion}</span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-text-muted">
                  {t('python.not_installed_hint')}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isInstalled && !loading && (
              <button
                onClick={handleInstall}
                className="rounded-xl bg-aurora-500/15 px-5 py-2 text-sm font-medium text-aurora-400 transition-all hover:bg-aurora-500/25 hover:shadow-lg hover:shadow-aurora-500/10"
              >
                {t('python.install')}
              </button>
            )}
            {isUpgradable && !loading && (
              <button
                onClick={handleUpgrade}
                className="rounded-xl bg-aurora-500/15 px-5 py-2 text-sm font-medium text-aurora-400 transition-all hover:bg-aurora-500/25 hover:shadow-lg hover:shadow-aurora-500/10"
              >
                {t('python.upgrade', { version: envState.latestVersion })}
              </button>
            )}
            {isInstalled && !loading && (
              <button
                onClick={handleOpenVersionDialog}
                className="rounded-lg border border-border-subtle p-2 text-text-muted transition-colors hover:border-border-active hover:text-text-primary"
                title={t('python.change_version')}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 进度 */}
        {loading && (
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
              <div className="h-full animate-pulse rounded-full bg-gradient-to-r from-aurora-400 to-aurora-600" style={{ width: '60%' }} />
            </div>
            <p className="text-xs text-aurora-400">{statusMessage}</p>
          </div>
        )}

        {/* 错误 */}
        {error && !loading && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
            <p className="text-xs text-red-400">{error}</p>
            <button
              onClick={() => setError('')}
              className="mt-1 text-xs text-red-400/70 underline hover:text-red-400"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 日志预览 */}
        {logs.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="mb-1 text-[11px] text-text-muted hover:text-text-primary transition-colors"
            >
              {showLogs ? '▾' : '▸'} {t('python.log_output')} ({logs.length} lines)
            </button>
            {showLogs && (
              <div className="max-h-28 overflow-y-auto rounded-lg border border-border-subtle bg-surface/80 p-2 font-mono text-[10px] leading-relaxed text-text-muted">
                {logs.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Python 版本选择对话框 */}
      {showVersionDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-80 rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-2xl">
            <h3 className="text-sm font-semibold text-text-primary mb-4">{t('python.change_version')}</h3>
            <p className="text-xs text-text-muted mb-2">{t('python.current_version')}: {envState.pythonVersion}</p>
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:border-aurora-400 focus:outline-none"
            >
              {pythonVersions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowVersionDialog(false)}
                className="rounded-lg border border-border-subtle px-4 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePython}
                className="rounded-lg bg-aurora-500/15 px-4 py-1.5 text-sm font-medium text-aurora-400 hover:bg-aurora-500/25 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/PythonEnvCard.tsx
git commit -m "feat: add PythonEnvCard component with install/upgrade UI"
```

---

### Task 10: 集成 PythonEnvCard 到 Dashboard

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx`

- [ ] **Step 1: 在 Dashboard.tsx 中添加 PythonEnvCard**

修改 `src/components/dashboard/Dashboard.tsx`：

1. 在 import 中添加：
```tsx
import PythonEnvCard from './PythonEnvCard';
import type { PythonEnvState } from '../../lib/types';
```

2. 在组件中添加 state：
```tsx
  const [pythonInstalled, setPythonInstalled] = useState(false);
```

3. 在 `handleToggleServer` 之后添加回调：
```tsx
  const handlePythonStateChange = (state: PythonEnvState) => {
    setPythonInstalled(state.installed);
  };
```

4. 在 return 的 JSX 中，`<div className="space-y-5">` 内的最开头（在标题之前）添加：
```tsx
      <PythonEnvCard onStateChange={handlePythonStateChange} />
```

5. 将现有的 StatusCard 部分用条件渲染包裹，仅在 `pythonInstalled` 为 true 时显示：
```tsx
      {pythonInstalled && (
        <>
          <div className="animate-slide-up flex items-center gap-3">
            <div className="h-6 w-1 rounded-full bg-gradient-to-b from-aurora-400 to-aurora-600" />
            <h2 className="text-lg font-bold tracking-tight text-text-primary">{t('dashboard.service_status')}</h2>
          </div>
          <StatusCard ... />
          {serverStatus === 'running' && ...}
        </>
      )}
```

- [ ] **Step 2: 完整修改后的 Dashboard.tsx**

确认完整文件为：

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { checkHealth, getDashboardSummary, getMemoryStats, setRootApiKey, setTenant } from '../../lib/api';
import type { OvConfig } from '../../lib/types';
import type { DashboardSummary, MemoryStats } from '../../lib/types';
import StatusCard from './StatusCard';
import StatsGrid from './StatsGrid';
import PythonEnvCard from './PythonEnvCard';
import type { PythonEnvState } from '../../lib/types';

export default function Dashboard() {
  const { t } = useTranslation();
  const [serverStatus, setServerStatus] = useState<string>('stopped');
  const [version, setVersion] = useState<string>('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [memStats, setMemStats] = useState<MemoryStats | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [pythonInstalled, setPythonInstalled] = useState(false);

  useEffect(() => {
    const unlisten = listen<string>('server-status-changed', (event) => {
      setServerStatus(event.payload);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  useEffect(() => {
    invoke<string>('get_server_status').then(setServerStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (serverStatus === 'error' || serverStatus === 'timeout') {
      invoke<string>('get_last_error').then(setErrorMessage).catch(() => {});
    } else {
      setErrorMessage('');
    }
  }, [serverStatus]);

  useEffect(() => {
    if (serverStatus !== 'running') return;

    const initApi = async () => {
      try {
        const content = await invoke<string>('read_config');
        const config = JSON.parse(content) as OvConfig;
        if (config.server?.root_api_key) {
          setRootApiKey(config.server.root_api_key);
        }
        setTenant(
          config.server?.account ?? 'default',
          config.server?.default_user ?? 'default',
        );
      } catch {
        // 读取配置失败时静默处理
      }
    };
    initApi();

    const fetchData = async () => {
      try {
        const health = await checkHealth();
        setVersion(health.version);
        const dashSummary = await getDashboardSummary();
        setSummary(dashSummary);
        const mem = await getMemoryStats();
        setMemStats(mem);
      } catch {
        // API 调用失败时静默处理
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [serverStatus]);

  const handleToggleServer = async () => {
    try {
      if (serverStatus === 'running' || serverStatus === 'starting') {
        setServerStatus('stopped');
        await invoke('stop_server');
      } else {
        setServerStatus('starting');
        await invoke('start_server');
      }
    } catch (err) {
      console.error('Toggle server failed:', err);
    }
  };

  const handlePythonStateChange = (state: PythonEnvState) => {
    setPythonInstalled(state.installed);
  };

  return (
    <div className="space-y-5">
      <PythonEnvCard onStateChange={handlePythonStateChange} />
      {pythonInstalled && (
        <>
          <div className="animate-slide-up flex items-center gap-3">
            <div className="h-6 w-1 rounded-full bg-gradient-to-b from-aurora-400 to-aurora-600" />
            <h2 className="text-lg font-bold tracking-tight text-text-primary">{t('dashboard.service_status')}</h2>
          </div>
          <StatusCard
            status={serverStatus}
            version={version}
            errorMessage={errorMessage}
            onToggle={handleToggleServer}
            onShowLog={() => invoke('open_log_file')}
          />
          {serverStatus === 'running' && (
            <>
              <div className="animate-slide-up flex items-center gap-3" style={{ animationDelay: '150ms' }}>
                <div className="h-6 w-1 rounded-full bg-gradient-to-b from-aurora-400 to-aurora-600" />
                <h2 className="text-lg font-bold tracking-tight text-text-primary">{t('dashboard.data_overview')}</h2>
              </div>
              <StatsGrid summary={summary} memStats={memStats} />
            </>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx
git commit -m "feat: integrate PythonEnvCard into Dashboard"
```

---

### Task 11: 最终验证

- [ ] **Step 1: 编译 Rust 后端**

```bash
cd src-tauri && cargo check 2>&1
```

确认无编译错误。

- [ ] **Step 2: 编译前端**

```bash
npx tsc --noEmit 2>&1
```

确认无 TypeScript 错误。

- [ ] **Step 3: 完整构建**

```bash
pnpm build 2>&1
```

确认构建成功。

- [ ] **Step 4: 验证功能**

```bash
pnpm tauri dev
```

验证：
1. 界面显示 "OpenViking 未安装" 和"安装 OpenViking"按钮
2. 点击安装 → 显示进度和日志 → 完成 → 自动激活 StatusCard
3. 检查升级提示是否正常

---

## 注意事项

1. **install_openviking 和 upgrade_python 完成后**：由于 `ServerState.venv_path` 是普通 `String`（非 `Mutex`），Rust 端无法在运行时动态更新该字段。前端在收到 `done: true` 的 `python-task-progress` 事件后，会重新调用 `check_openviking_state` 刷新状态，然后自动启动服务（通过 `handlePythonStateChange` 触发 StatusCard 可见后的 `start_server` 调用）。

2. **并发保护**：使用 `AtomicBool` 实现简单的互斥锁，防止用户同时触发两个安装/升级操作。

3. **跨平台**：Windows 上 `uv` 二进制为 `uv.exe`，venv 中 python 为 `python.exe`，已在代码中通过 `cfg!(target_os)` 处理。
