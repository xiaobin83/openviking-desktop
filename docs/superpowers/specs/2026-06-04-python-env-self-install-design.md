# Python 环境自安装/升级设计

**日期**: 2026-06-04
**状态**: 设计完成，待审核

---

## 概述

移除内置 Python venv 捆绑方式，改为 app 内通过 `uv` 工具让用户自行安装/升级 Python 和 openviking 包。用户无需接触命令行，全程在 UI 中操作。

**核心原则**：
- 不再捆绑 Python/openviking，app 体积大幅缩减（~700MB → ~20MB uv 二进制）
- 使用 `uv` 管理 Python 版本和包安装
- Python 默认 3.13，用户在升级界面可选择其他版本
- 启动时自动检查 PyPI 上 openviking 版本，有更新时提示用户
- 所有 Python/openviking 安装到 userdata

---

## 资源捆绑

### 移除
- `resources/python/`（不再捆绑 Python venv）
- `scripts/bundle-python.sh`（不再需要）

### 新增
- `scripts/download-uv.sh`：下载各平台 `uv` 二进制到 `resources/uv/`

**目录结构**：
```
resources/uv/
  aarch64-apple-darwin/uv      # macOS Apple Silicon
  x86_64-apple-darwin/uv        # macOS Intel
  x86_64-pc-windows-msvc/uv.exe # Windows x64
  x86_64-unknown-linux-gnu/uv   # Linux x64
```

### tauri.conf.json 变更
```json
"resources": [
  "Resources/uv/**/*"
]
```
替换原来的 `"Resources/python/**/*"`。

### download-uv.sh
从 uv GitHub Releases 下载对应平台的二进制压缩包，解压后放到 `resources/uv/<target-triple>/`。`--platform` 为**必填**参数，如 `--platform aarch64-apple-darwin`。无参数运行时仅列出支持的平台列表。

---

## Rust 后端

### 新增模块：`src-tauri/src/python_env.rs`

封装所有 uv 子进程调用，统一返回 `Result`，所有输出通过 Tauri event 流式发送进度。

#### uv 子进程操作

| 功能 | 命令 | 说明 |
|---|---|---|
| 检查已安装 Python | `uv python list --only-installed` | 解析输出获取已安装版本列表 |
| 安装 Python | `uv python install <version>` | 下载并缓存全局 Python（缓存目录由 uv 管理） |
| 创建 venv | `uv venv --python <version> <target>` | 在 userdata 创建 venv |
| 安装 openviking | `uv pip install openviking[bot]` | 安装到 userdata venv |
| 升级 openviking | `uv pip install --upgrade openviking[bot]` | 升级到最新版本 |
| 查询已安装版本 | `uv pip show openviking` | 解析 `Version:` 字段 |
| 查询最新版本 | `uv pip index versions openviking` | 解析最新版本号 |
| 列出 Python 版本 | `uv python list --all-versions` | 返回可安装的 Python 版本列表 |

所有命令通过 `std::process::Command` 执行。**关键**：pip 相关命令（install/upgrade/show/index）需通过 `--python <venv>/bin/python3` 指定目标 venv，或设置 `VIRTUAL_ENV` 环境变量指向 userdata venv 路径。

#### 进度事件

长时间操作（安装/升级）通过 Tauri event `python-task-progress` 发送进度：
```json
{
  "step": "downloading_python",      // 当前步骤标识
  "message": "下载 Python 3.13...",   // 用户可读消息
  "done": false,                      // 是否完成
  "log_line": "Downloading cpython..." // 子进程 stdout/stderr 输出行
}
```

uv 子进程的 stdout/stderr 通过管道逐行读取，每条作为 `log_line` 实时发送到前端。前端在安装进度区域下方展示可滚动的日志预览窗口。

### 新增 Tauri 命令

| 命令 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `check_openviking_state` | 无 | `{ installed, current_version, latest_version, python_version }` | 检查安装状态和更新 |
| `install_openviking` | `python_version?: string` | 流式进度 + 完成状态 | 安装 Python + venv + openviking[bot] |
| `upgrade_openviking` | 无 | 流式进度 + 完成状态 | 仅升级 openviking 包 |
| `upgrade_python` | `version: string` | 流式进度 + 完成状态 | 重建 venv 使用新 Python 版本 |
| `get_python_versions` | 无 | `string[]` | 返回可安装的 Python 版本列表 |
| `get_uv_path` | 无 | `string` | 返回 uv 二进制路径（调试用） |

### ServerState 变更（lib.rs）

```rust
pub struct ServerState {
    pub child: Mutex<Option<Child>>,
    pub status: Mutex<String>,
    pub port: Mutex<u16>,
    pub venv_path: String,               // 改为指向 userdata venv 的 bin/python3
    pub workspace_path: Mutex<String>,
    pub server_log_path: String,
    pub last_error: Mutex<String>,
    pub uv_path: String,                  // 新增：uv 二进制路径
    pub openviking_version: Mutex<String>, // 新增：当前 openviking 版本
}
```

**字段变更**：
- `python_path` → `venv_path`（语义不变，名称更准确）
- 新增 `uv_path`
- 新增 `openviking_version`

### venv 路径解析（lib.rs setup）

```
1. 检查 {app_data_dir}/python/bin/python3 是否存在
   → 存在：使用 userdata venv
2. userdata venv 不存在：venv_path 为空字符串
   → 前端识别此状态，显示"安装"按钮
```

**uv_path 解析**（三级 fallback，等同于现有 python_path 逻辑）：
```
1. dev: resources/uv/<current_platform_target>/uv
2. symlink: src-tauri/Resources/uv/<current_platform_target>/uv
3. prod: {resource_dir}/uv/<current_platform_target>/uv
```

平台标识通过编译时 `std::env::consts::ARCH` + `std::env::consts::OS` 拼接 target triple（如 `"aarch64-apple-darwin"`），在 uv_path 三级 fallback 中使用。

### spawn_server 变更

将 `state.python_path` 替换为 `state.venv_path`，其他逻辑不变。venv_path 为空时返回错误"openviking 未安装"。

### setup() 变更

自动启动服务逻辑需检查 venv_path：
```rust
if !state.venv_path.is_empty() {
    tauri::async_runtime::spawn(async move {
        let _ = process::spawn_server_with_app_handle(&app_handle).await;
    });
}
```
venv_path 为空时不自动启动（首次启动需要用户先安装）。

---

## 前端 UI

### 新增组件：PythonEnvCard（`src/components/dashboard/PythonEnvCard.tsx`）

与 `StatusCard` 并列展示在 Dashboard 上。

#### 三种状态：

**状态一：未安装**
```
┌──────────────────────────────────────────────┐
│  Python 环境                                  │
│  OpenViking 未安装                            │
│  请安装后即可启动服务                           │
│              [ 安装 OpenViking ]               │
└──────────────────────────────────────────────┘
```

**状态二：已安装，可升级**
```
┌──────────────────────────────────────────────┐
│  Python 环境                                  │
│  Python 3.13 | OpenViking v0.3.0 → v0.4.0    │
│              [ 升级到 v0.4.0 ]                 │
└──────────────────────────────────────────────┘
```

**状态三：已安装，已是最新**
```
┌──────────────────────────────────────────────┐
│  Python 3.13 | OpenViking v0.3.0 (已是最新)   │
│               [ ⚙ ]                           │
└──────────────────────────────────────────────┘
```

#### 安装/升级中
按钮替换为进度条 + 当前步骤文本，下方展示可折叠的 stdout/stderr 日志预览：
```
┌──────────────────────────────────────────────┐
│  Python 环境                                  │
│  ████████████░░░░░░░░  60%                    │
│  安装 OpenViking...                            │
│  ┌─ stdout/stderr 输出 ───────────────────┐  │
│  │ Resolved 42 packages in 2.3s            │  │
│  │ Downloading openviking (1.2MB)          │  │
│  │ Installing collected packages...        │  │
│  │ Successfully installed openviking-0.3.0 │  │
│  │ ▲ 逐行追加，自动滚动到底部                   │  │
│  └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

日志预览窗口：
- 高度固定（~6 行），内容可滚动
- 逐行实时追加 uv 进程的 stdout/stderr
- 自动滚动到底部
- 安装完成后保留日志，用户可以展开/折叠查看

#### Python 版本管理

齿轮按钮（⚙）点击弹出对话框：
- 显示当前 Python 版本
- 下拉框列出可选 Python 版本（3.11、3.12、3.13 等，从 `get_python_versions` 获取）
- 确认按钮
- 二次确认提示："更改 Python 版本将重新创建 virtualenv 并重新安装 openviking，是否继续？"

### Dashboard.tsx 变更

- 新增 `pythonEnvState` state（含 installed、currentVersion、latestVersion、pythonVersion、upgradable 字段）
- `useEffect` 中调用 `invoke('check_openviking_state')` 获取初始状态
- 若未安装，隐藏 `StatusCard`（因为服务无法启动）
- 安装/升级完成后自动刷新状态

---

## 启动流程

```
App 启动
  ├─ 解析 uv_path（uv 二进制位置）
  ├─ 解析 venv_path（userdata python/bin/python3 是否存在）
  ├─ 初始化 ServerState
  ├─ 创建 tray
  ├─ 生成默认配置（若不存在）
  ├─ 检查 venv_path
  │   ├─ 存在 → check_openviking_state
  │   │   ├─ 可升级 → 前端显示升级按钮
  │   │   └─ 已最新 → 正常启动服务
  │   └─ 不存在 → 前端显示安装按钮（不启动服务）
  └─ 窗口准备就绪
```

### 安装流程
```
用户点击"安装"
  └─ 调用 install_openviking(default: "3.13")
      ├─ 检查 Python 3.13 是否已安装 (uv python list)
      │   └─ 否 → uv python install 3.13（流式进度）
      ├─ uv venv <userdata>/python/ --python 3.13（流式进度）
      ├─ uv pip install openviking[bot]（流式进度）
      └─ 完成
          ├─ 更新 state.venv_path
          └─ 自动启动服务
```

### check_openviking_state 网络处理

查询 PyPI 需要网络。若网络不可用，不报错，仅不展示升级提示（静默降级）。前端 `check_openviking_state` 在启动时异步调用，不影响服务正常启动。

### 升级流程
```
用户点击"升级"
  └─ 调用 upgrade_openviking
      ├─ uv pip install --upgrade openviking[bot]（流式进度）
      └─ 完成
          ├─ 更新状态
          ├─ 若服务在运行 → 自动重启
          └─ 若无服务 → 自动启动服务
```

### Python 版本变更流程
```
用户选择新版本并确认
  └─ 调用 upgrade_python(<version>)
      ├─ 检查新版本 Python 是否已安装 → 否 → uv python install（流式进度）
      ├─ 删除旧的 userdata venv
      ├─ uv venv <userdata>/python/ --python <version>（流式进度）
      ├─ uv pip install openviking[bot]（流式进度）
      └─ 完成
          ├─ 更新 state.venv_path / openviking_version
          └─ 若服务在运行 → 自动重启
```

---

## 错误处理

| 场景 | 处理 |
|---|---|
| uv 二进制未找到 | 前端显示"uv 运行时未找到，请重新安装 OpenViking Desktop" |
| 网络不可用 | 安装/升级失败，显示"网络连接失败，请检查网络后重试" |
| Python 安装失败 | 显示 uv 错误输出，"下载 Python 失败，请重试" |
| openviking 安装失败 | 显示错误，"安装 OpenViking 失败"，保留 venv 以便重试时复用 |
| 用户取消操作 | 不实现取消（uv 操作通常快），若需则 kill 子进程 |
| 并发安装/升级 | Tauri 端加锁，禁止并发 Python 环境操作 |

每个错误都通过 `set_error()` 设置 last_error，前端可显示错误消息和"重试"按钮。

---

## Capabilities / 权限

现有 `capabilities/default.json` 已包含所需权限：
- `fs:scope` → `$HOME/Library/Application Support/OpenViking/**`（venv 写入路径）
- `shell:allow-spawn`（执行 uv 子进程）
- `shell:allow-execute`

无需新增权限项。uv 的 Python 缓存目录（`~/Library/Caches/uv/`）由 uv 自己管理，不需要 app 的 FS 权限。

---

## 国际化

新增 i18n 键（`zh.json` / `en.json`）：

| 键 | 中文 | 英文 |
|---|---|---|
| `python.not_installed` | OpenViking 未安装 | OpenViking Not Installed |
| `python.install` | 安装 OpenViking | Install OpenViking |
| `python.upgrade` | 升级到 {} | Upgrade to {} |
| `python.latest` | 已是最新 | Up to Date |
| `python.installing` | 安装中... | Installing... |
| `python.upgrading` | 升级中... | Upgrading... |
| `python.downloading` | 下载 Python {}... | Downloading Python {}... |
| `python.creating_venv` | 创建虚拟环境... | Creating Virtual Environment... |
| `python.change_version` | 更改 Python 版本 | Change Python Version |
| `python.current_version` | 当前版本 | Current Version |
| `python.new_version` | 新版本 | New Version |
| `python.confirm_change` | 更改 Python 版本将重新创建 virtualenv 并重新安装 openviking，是否继续？ | Changing Python version will recreate the virtualenv and reinstall openviking. Continue? |
| `python.network_error` | 网络连接失败，请检查网络后重试 | Network error, please check your connection and retry |
| `python.uv_not_found` | uv 运行时未找到，请重新安装 OpenViking Desktop | uv runtime not found, please reinstall OpenViking Desktop |

---

## 待移除/清理

| 项目 | 操作 |
|---|---|
| `scripts/bundle-python.sh` | 删除 |
| `resources/python/` | 删除（已 `.gitignore`） |
| `tauri.conf.json` `bundle.resources` | 改为 `"Resources/uv/**/*"` |
| `lib.rs` `python_path` 字段 | 重命名为 `venv_path` |
| `lib.rs` 三级 python_path 解析 | 简化为仅检查 userdata venv |
| `process.rs` 中 `python_path` 引用 | 改为 `venv_path` |
| 现有 `package.json` 构建步骤 | 移除 bundle-python 相关调用（如有） |
| `.gitignore` | 添加 `resources/uv/` 若不存在 |

---

## 测试要点

1. **首次安装流程**：清空 userdata venv，验证"安装"按钮出现 → 点击安装 → 完成 → 自动启动服务
2. **升级流程**：安装旧版 openviking → 验证"升级"按钮出现 → 点击升级 → 验证版本更新
3. **无网络场景**：断网 → 点击安装 → 验证错误提示和重试按钮
4. **uv 缺失场景**：删掉 uv 二进制 → 验证错误提示
5. **Python 版本切换**：已安装 → 切换到其他版本 → 验证 venv 重建和服务可用
6. **并发保护**：尝试同时触两个安装操作 → 验证只有一个执行
