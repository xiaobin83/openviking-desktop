# Changelog

## [0.1.2] - 2026-06-26 — 端口冲突检测与已有配置发现

### 🔌 端口冲突检测与解决

- **启动时端口检测**：应用启动不再无条件自动启动服务，改为先检测端口占用状态（`check_port`），确认无冲突后再启动，避免僵尸进程和端口孤儿问题。
- **OpenViking 进程冲突对话框**：检测到端口被已有 OpenViking 进程占用时，弹出 `PortConflictDialog` 提供"清除并继续"或"退出"选项。
- **外部端口占用处理**：检测到端口被非 OpenViking 进程占用时，弹出 `PortStep`（对话框模式）引导用户修改端口号后重新检测，支持 server 和 bot gateway 两个端口。
- **向导新增端口配置步骤**：首次运行向导新增第 6 步 `PortStep`，在 API Key 配置后自动检测端口冲突。冲突时允许用户输入新端口号并重新验证。
- **动态 API 端口**：`api.ts` 中 `BASE_URL` 从常量改为 `let baseUrl`，新增 `setBasePort()` 导出。Dashboard 启动时从 `ov.conf` 的 `server.port` 读取并设置，不再硬编码端口 `1933`。
- **调试辅助脚本**：新增 `occupy-port-1933.sh`，启动一个最小 HTTP 服务器占用端口 1933，用于测试端口冲突处理流程。

### 🧙 已有配置发现

- **向导中检测已有 ov.conf**：工作目录步骤完成后，自动检测工作区根目录下是否存在 `ov.conf`。存在时提示用户选择"使用已有配置"或"重新开始"。
- **智能配置合并**：选择使用已有配置时，仅将向导可见字段（Embedding、VLM、API Key、端口等）预填到表单，非向导字段（飞书集成、熔断器、加密等）在原配置中完整保留，最终写回时合并。
- **Rust 新增命令**：`read_config_at` — 读取指定路径的配置文件，用于向导中加载已有 `ov.conf`。`exit_app` — 从端口冲突对话框中退出应用。
- **检测模块**：新增 `src/lib/detection.ts`，封装 `detectServer()`、`findConflictingPorts()`、`findForeignOccupiedPorts()`、`readExistingConfig()`、`prefillFormData()`、`mergeWizardChanges()` 等检测和合并逻辑。

### 🍎 macOS Gatekeeper

- **一键放行脚本**：`allow-gatekeeper.sh` — 自动清除 `OpenViking.app` 及内部所有 Mach-O 可执行文件（如 `uv`）的 `com.apple.quarantine` 检疫标记，支持自动检测 app 路径或手动指定。
- **重置拦截脚本**：`reset-gatekeeper.sh` — 重新施加 Gatekeeper 检疫标记（`xattr -w com.apple.quarantine`），恢复"首次下载"拦截状态，方便测试。

### 🔧 基础设施

- **版本号**：`0.1.1` → `0.1.2`（`package.json`、`Cargo.toml`、`tauri.conf.json`）。
- **测试框架**：新增 `vitest`、`jsdom`、`@testing-library/react`、`@testing-library/jest-dom` 开发依赖。新增 `pnpm test` / `pnpm test:watch` 脚本。
- **测试文件**：新增 `src/__tests__/OnboardingWizard.test.tsx`、`src/__tests__/detection.test.ts`、`src/__tests__/setup.ts`、`vitest.config.ts`。
- **i18n 插值格式修正**：`prefix`/`suffix` 从默认 `{{`/`}}` 显式设置为 `{`/`}`，locale 文件中对应变量从 `{{version}}` 改为 `{version}`。新增向导端口检测相关翻译键 13 个（中英文各 13 个）。

### ⚠️ 已知问题

- **Windows 上向导"已有配置发现"失效**：`OnboardingWizard.tsx` 中路径清理正则为 `/\/data\/?$/`，仅匹配正斜杠，Windows 反斜杠路径下无法正确提取工作区路径。功能静默降级为"重新开始"，不影响正常使用。

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

### 🛠️ 平台路径修复

- **日志路径**：非 macOS 平台改用 `app_data_dir/logs`（替代硬编码的 `~/Library/Logs/OpenViking`）。
- **FS scope 权限**：`capabilities/default.json` 新增 `$APPDATA/com.openviking.desktop/**`，覆盖 Windows/Linux/macOS 的 `app_data_dir` 路径。
- **首次运行标记迁移**：`.onboarded` 标记从 `~/.openviking/` 迁移到 `app_data_dir/`（Windows: `%APPDATA%/com.openviking.desktop/`），保留旧路径向后兼容。
- **默认配置路径**：`ov.conf` 回退路径从 `home_dir` 迁移到 `app_data_dir`。
- **向量数据库路径**：`resolve_vectordb_path` 和 `get_workspace_data_path` 空工作区回退使用平台感知的 `get_default_workspace_path()`。
- **前端默认值**：`config-fields.ts` 和安装向导工作区回退路径添加 Windows 平台检测（`%USERPROFILE%\OpenViking\data`）。
- **Wheel 路径**：`Resources/wheels` 使用显式 `Path::join("Resources").join("wheels")` 构建。

### 🖱️ 仪表盘 UX 改进

- **安装中锁定控件**：Python 环境安装/升级期间，禁用"启动服务"按钮（灰色 + `cursor-not-allowed`），禁止切换到配置选项卡，若已在配置页则自动切回概览。
