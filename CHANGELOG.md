# Changelog

## [0.1.1] - 2026-06-23 — Windows 支持

### 🪟 Windows 平台支持

- **平台感知路径**：`open_console`、`open_log_file`、`open_app_log_file` 新增 Windows 支持。日志文件使用 Notepad 打开，文件夹使用 explorer.exe 打开，控制台优先使用 Windows Terminal (`wt`)，回退到传统 cmd。
- **Python 虚拟环境**：Windows 上 Python 二进制目录为 `Scripts/`（非 `bin/`），PATH 分隔符使用 `;`（非 `:`）。
- **构建文档**：`AGENTS.md` 新增 Windows GNU 工具链构建指南（MinGW-w64、Rust GNU toolchain），移除 `Cargo.toml` 中 `cdylib` crate type 以兼容 GNU `ld`。
- **`reset-first-run.bat`**：新增 Windows 批处理脚本用于重置首次运行状态。
- **行尾规范化**：`.gitattributes` 强制 LF 行尾。
- **默认工作目录**：Windows 默认使用 `%USERPROFILE%\OpenViking`。

### 🐍 Python 环境管理

- **版本检测优化**：`pip_show_openviking` 改为三层回退策略——结构化 JSON（`pip list --format json`）→ Python `importlib.metadata` → 大小写不敏感 `pip show` 解析，解决版本字符串解析歧义。
- **版本缓存**：安装后将版本号持久化到 `app_data_dir/openviking_version`，避免下次启动读取失败时为空。
- **异步版本检查**：`check_latest_version` 命令从 `check_openviking_state` 解耦，通过网络异步查询最新版本，避免阻塞 UI。
- **DEFAULT_PYTHON_VERSION 常量**：提取为 `3.13`，消除多处硬编码。
- **本地 Embedding 可选**：安装/升级/重装时可选 `local-embed` extra，控制是否安装 `llama-cpp-python`。Windows 平台显示 C++ 工具链安装提示（仅 Windoows 显示）。预编译 `.whl` 文件可通过 `Resources/wheels/` 内置，避免 Windows 从源码编译。

### ⚙️ 配置 & 端口

- **Bot Gateway 端口**：`ov.conf` 新增 `bot.gateway.port` 字段（默认 18790），支持在 Basic 配置标签页中修改。
- **端口配置同步**：启动时从 `ov.conf` 同步 `server.port` 和 `bot.gateway.port` 到 state，退出时正确清理端口。
- **存储工作区路径**：默认配置中 `storage.workspace` 使用 `Path::join()` 适配平台分隔符。

### 🖥️ 服务进程

- **Python 子进程编码**：启动 openviking-server 时设置 `PYTHONIOENCODING=utf-8` 和 `PYTHONUTF8=1` 环境变量，解决 Windows 控制台 GBK 编码乱码。
- **端口清理**：`ServerState::Drop` 和 `RunEvent::Exit` 时清理 server 和 bot 端口。
- **自动启动**：首次运行后自动显示仪表盘窗口。

### 📊 仪表盘 & Python 环境卡片

- **移除失效端点**：Dashboard 移除 `getMemoryStats` 和 `getMemoriesStats` API 调用。
- **Extras 显示**：Python 环境卡片显示已安装的 extra 功能标签（`[bot]` 或 `[bot, local-embed]`）。
- **版本信息分两行**：Python 版本和 OpenViking 版本各占一行。
- **升级按钮优化**：按钮尺寸缩小，禁用时下方显示"需要先停止服务器"提示文字（居中、i18n）。
- **安装进度多语言**：运行中进度文字（"安装 OpenViking..."、"下载 Python..." 等）支持中英文切换。
- **Root API Key 复制按钮**：配置页密码字段新增复制按钮。

### 🎨 UI & 图标

- **SVG 图标库**：新增 `Icons.tsx`（CheckIcon、ArrowRightIcon、ChevronDownIcon、ChevronRightIcon、XIcon），替换所有 Unicode 字符（✓、✗、▾、▸）和 HTML 实体（`&check;`、`&times;`），修复字体缺失字形问题。
- **应用版本显示**：窗口标题旁显示 `v0.1.1` 版本标签。
- **Volcengine 默认 API Base**：默认指向多模态嵌入端点。
- **DMG 构建目标恢复**：`tauri.conf.json` 重新添加 `dmg` bundle target。

### 🧙 安装向导

- **本地 Embedding 开关**：安装向导第一步（InstallStep）新增 local-embed 勾选框，控制安装时是否包含 `llama-cpp-python`。安装完成后自动刷新状态确保后续步骤正确显示 local 选项。
- **Embedding Provider 描述**：移除描述文字中 local provider 的提及。
- **版本列表回退**：网络不可用时，回退显示已安装的 OpenViking 版本。
- **安装中禁用 Next**：向导安装过程中禁用"下一步"按钮。
- **Provider 切换逻辑**：Provider 变更时始终更新 model/dimension。

### 🔧 构建 & 基础设施

- **版本号**：`0.1.0` → `0.1.1`（`package.json`、`Cargo.toml`、`tauri.conf.json`）。
- **`pnpm-workspace.yaml`**：`esbuild` 允许构建。
- **`download-llama-cpp.sh`**：新增 `llama-cpp-python` 预编译 wheel 下载脚本。
- **`.gitignore`**：新增 `.whl`、`.deb`、cargo-xwin 缓存规则。
- **Debug 日志**：`fetchApi` 新增 curl 风格请求日志。
