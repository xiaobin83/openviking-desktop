# Known Issues

> 分支: `feat/windows-support` | 更新时间: 2026-06-24 | 已修复 3/7 (不含 Build)

## Path

### ✅ [FIXED] server_log_path 仅兼容 macOS
- **状态**: 已修复 — `lib.rs:1043-1046` 非 macOS 平台改用 `app_data_dir.join("logs")`

### ❌ capabilities fs scope 路径不完整
- **文件**: `src-tauri/capabilities/default.json:20-30`
- **问题**:
  - `$HOME/Library/Application Support/OpenViking/**` 中 identifier 仍是 `OpenViking`，与 `tauri.conf.json` 的 `com.openviking.desktop` 不一致
  - 缺少 Windows `$APPDATA/com.openviking.desktop/**` 和 Linux `$HOME/.local/share/com.openviking.desktop/**`
  - `setup()` 中日志/工作区路径已改用 `app_data_dir()`（`lib.rs:1045-1046, 1118`），但 FS scope 未覆盖这些路径
- **影响**: Windows/Linux 上部分文件操作可能被权限阻断
- **修复**: 对齐 identifier 为 `com.openviking.desktop`，补全 `$APPDATA/` 和 `$HOME/.local/share/` 路径

### ❌ onboarded 标记和 ov.conf 使用 home_dir 而非 app_data_dir
- **文件**: `src-tauri/src/lib.rs:12-13, 139-144, 163-166`
- **问题**: `ONBOARDED_FLAG_NAME` / `DEFAULT_OV_CONF_PATH` 仍相对于 `get_home_dir()`，Windows 上会在 `C:\Users\<user>\.openviking\` 创建隐藏目录，不符合 Windows 惯例
- **影响**: Windows 用户体验不一致，应用数据未统一存放在 app_data_dir
- **修复**: 将 `.onboarded` 标记和 `ov.conf` fallback 迁移到 `app_data_dir()`

### ❌ resolve_vectordb_path 回退使用硬编码 Unix 路径
- **文件**: `src-tauri/src/lib.rs:929-933`
- **问题**: workspace 为空时回退 `"~/.openviking/data"`（未展开波浪线），Windows 上路径无效
- **影响**: 未设置 workspace 时 vectordb 路径错误
- **修复**: 改用 `app_data_dir()` 派生路径或平台感知默认值

### ❌ config-fields.ts 默认值未平台感知
- **文件**: `src/lib/config-fields.ts:66-67, 463`
- **问题**: `defaultValue`、`placeholder`、`defaultConfigObj.workspace` 硬编码 `~/.openviking/data`
- **影响**: ConfigPage 回退默认值在 Windows 上显示 Unix 路径
- **修复**: 添加平台检测，Windows 使用 `%USERPROFILE%\OpenViking\data`

## Code Quality

### ✅ [FIXED] 预存 TS 错误
- **状态**: 已修复 — `DIMENSION_PATH` / `BATCH_SIZE_PATH` 未使用的导入已移除

### ✅ [FIXED] unused variable workspace
- **状态**: 已修复 — 原始 `lib.rs` 旧 line 252 的代码已被重构移除

## Build

### macOS 交叉编译未验证
- **问题**: 当前构建仅在 WSL→Windows 交叉编译，macOS 构建未测试
- **修复**: 在 macOS 上运行 `pnpm tauri build` 验证 DMG 打包
