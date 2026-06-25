# Known Issues

> 分支: `main` | 更新时间: 2026-06-25 | 已修复 8/9

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

## Code Quality

### ✅ [FIXED] 预存 TS 错误
- **状态**: 已修复 — `DIMENSION_PATH` / `BATCH_SIZE_PATH` 未使用的导入已移除

### ✅ [FIXED] unused variable workspace
- **状态**: 已修复 — 原始代码已被重构移除

### 清理
- 移除死代码常量 `DEFAULT_OV_CONF_PATH` 和 `DEFAULT_UNIX_WORKSPACE`

## Runtime

### ❌ [UNFIXED] 首次启动服务可能因等待时间不足导致失败
- **状态**: 未修复 — 首次启动服务时，Python 环境初始化或依赖加载可能耗时较长，超过当前等待超时，导致启动失败
- **缓解**: 再次点击"启动服务"按钮重试即可；通常第二次启动时环境已就绪，可以正常启动

## Build

### ✅ [FIXED] macOS 交叉编译未验证
- **状态**: 已验证 — macOS 和 Windows 平台均可正常打包构建
