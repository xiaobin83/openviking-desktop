# Known Issues

> 分支: `main` | 更新时间: 2026-06-27 | 已修复 10/10

## Path

### ✅ [FIXED] server_log_path 仅兼容 macOS
- **状态**: 已修复 — `lib.rs:1058-1061` 非 macOS 平台改用 `app_data_dir.join("logs")`

### ✅ [FIXED] capabilities fs scope 路径不完整
- **状态**: 已修复 — `default.json` 新增 `$APPDATA/com.openviking.desktop/**`，覆盖 Windows/Linux/macOS 的 `app_data_dir` 路径
- **保留**: `$HOME/.openviking/**`、`$HOME/OpenViking/**`、`$HOME/Library/Logs/OpenViking/**` 用于向后兼容

### ✅ [FIXED] onboarded 标记和 ov.conf 使用 home_dir 而非 app_data_dir
- **状态**: 已修复 — `lib.rs:142-151, 168-174, 1016-1027, 1035-1042`
  - `ServerState` 新增 `app_data_dir` 字段（`lib.rs:69`）
  - `get_onboarded_flag_path()` 返回 `app_data_dir/.onboarded`（`lib.rs:168-174`）
  - `get_ov_conf_path()` fallback 使用 `app_data_dir/ov.conf`（`lib.rs:143-152`）
  - `is_onboarded()` 先检查新路径，再回退到旧 `home_dir/.openviking/.onboarded`（`lib.rs:1016-1027`）
  - `mark_onboarded()` 写入新 `app_data_dir/.onboarded`（`lib.rs:1035-1042`）
- **向后兼容**: 旧 `~/.openviking/.onboarded` 路径仍可被检测

### ✅ [FIXED] resolve_vectordb_path 回退使用硬编码 Unix 路径
- **状态**: 已修复 — `lib.rs:943-950` 改用平台感知的 `get_default_workspace_path()` 替代 `DEFAULT_UNIX_WORKSPACE`
- **同样修复**: `get_workspace_data_path()`（`lib.rs:234`）

### ✅ [FIXED] config-fields.ts 默认值未平台感知
- **状态**: 已修复 — `config-fields.ts:4-5` 添加 `isWindows` 平台检测
  - Windows: `%USERPROFILE%\OpenViking\data`
  - macOS/Linux: `~/.openviking/data`
- **同样修复**: `WorkspaceStep.tsx` catch 回退路径（`WorkspaceStep.tsx:7-8, 31-32`）

### ✅ [FIXED] 向导"发现已有配置"功能在 Windows 上失效

- **状态**: 已修复 — `OnboardingWizard.tsx:110-111` 改用 `path.dirname()` + `path.join()` 跨平台路径函数
- **根因**: Windows 上 `get_workspace_data_path` 返回反斜杠路径（如 `C:\Users\xxx\OpenViking\data`），正则不匹配，导致 `workspacePath` 未清理，`ovConfPath` 指向错误位置（`...data/ov.conf` 而非 `...OpenViking/ov.conf`）
- **影响**: `readExistingConfig()` 读取失败返回 `null`，向导始终走"重新开始"分支，已有配置不会被检测到。不会崩溃，功能静默降级
- **修复**: 新增 `src/lib/path.ts` 跨平台路径工具（`dirname`/`join`/`basename`），`OnboardingWizard.tsx:110-111` 改用 `path.dirname(dataPath)` + `path.join(workspacePath, 'ov.conf')` 替代正则+字符串拼接；`WorkspaceStep.tsx:36` 同步改用 `path.dirname()`
- **发现日期**: 2026-06-26（v0.1.1→HEAD 审查）

## Code Quality

### ✅ [FIXED] 预存 TS 错误
- **状态**: 已修复 — `DIMENSION_PATH` / `BATCH_SIZE_PATH` 未使用的导入已移除

### ✅ [FIXED] unused variable workspace
- **状态**: 已修复 — 原始代码已被重构移除

### ✅ [FIXED] 移除死代码常量
- **状态**: 已确认清理 — 常量 `DEFAULT_OV_CONF_PATH` 和 `DEFAULT_UNIX_WORKSPACE` 已在先前修复中移出代码库

## Runtime

### ✅ [FIXED] 首次启动服务可能因等待时间不足导致失败
- **状态**: 已修复 — `process.rs:195` 启动超时从 30s 延长至 60s，特别缓解 Windows 上 Python 首次加载的慢速 I/O 问题
- **根因**: 首次启动服务时，Python 环境初始化或依赖加载可能耗时较长，30s 超时在 Windows 上尤其紧张
- **修复**: `process.rs:195` 将 `startup_timeout` 从 30s 增加至 60s

## Build

### ✅ [FIXED] macOS 交叉编译未验证
- **状态**: 已验证 — macOS 和 Windows 平台均可正常打包构建
