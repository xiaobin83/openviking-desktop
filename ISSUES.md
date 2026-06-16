# Known Issues

## Path

### server_log_path 仅兼容 macOS
- **文件**: `src-tauri/src/lib.rs:875-878`
- **问题**: 硬编码 `$HOME/Library/Logs/OpenViking/openviking.log`，Linux/Windows 会创建错误的目录结构
- **影响**: 服务端日志写入位置不正确
- **修复**: 改用 `app.path().app_log_dir()` 或平台感知路径

### capabilities fs scope 路径不完整
- **文件**: `src-tauri/capabilities/default.json`
- **问题**:
  - `$HOME/Library/Application Support/OpenViking/**` 中 identifier 与 `tauri.conf.json` 的 `com.openviking.desktop` 不一致
  - 缺少 Windows `$APPDATA/com.openviking.desktop/**` 和 Linux `$HOME/.local/share/com.openviking.desktop/**`
- **影响**: Windows/Linux 上部分文件操作可能被权限阻断
- **修复**: 对齐 identifier，补全平台路径

### onboarded 标记和 ov.conf 使用 home_dir 而非 app_data_dir
- **文件**: `src-tauri/src/lib.rs:11-12, 131-134, 107-121`
- **问题**: `ONBOARDED_FLAG_NAME` 和 `DEFAULT_OV_CONF_PATH` 始终相对于 `get_home_dir()`，Windows 上 iOS 会在 `C:\Users\<user>\.openviking\` 创建隐藏目录，不符合 Windows 惯例
- **影响**: Windows 用户体验不一致
- **修复**: 将 `.onboarded` 标记和 `ov.conf` fallback 迁移到 `app_data_dir()`

### resolve_vectordb_path 回退使用硬编码路径
- **文件**: `src-tauri/src/lib.rs:699`
- **问题**: workspace 为空时回退 `expand_tilde("~/.openviking/data")`，Windows 上不合适
- **影响**: 未设置 workspace 时 vectordb 路径错误
- **修复**: 改用 `app_data_dir()` 派生路径

### config-fields.ts 默认值未平台感知
- **文件**: `src/lib/config-fields.ts:56-57, 453`
- **问题**: `defaultValue`、`placeholder`、`defaultConfigObj.workspace` 硬编码 `~/.openviking/data`
- **影响**: ConfigPage 回退默认值在 Windows 上显示 Unix 路径
- **修复**: 添加平台检测，Windows 使用 `%USERPROFILE%\OpenViking\data`

## Code Quality

### 预存 TS 错误
- **文件**: `src/components/config/EmbeddingModal.tsx:26-27`
- **问题**: `DIMENSION_PATH` / `BATCH_SIZE_PATH` 已导入但未使用，`tsc --noEmit` 报错
- **修复**: 移除未使用的导入

### unused variable workspace
- **文件**: `src-tauri/src/lib.rs:252`
- **问题**: `let workspace = if workspace.is_empty() { ... }` 赋值后未使用
- **修复**: 移除或加下划线前缀

## Build

### macOS 交叉编译未验证
- **问题**: 当前构建仅在 WSL→Windows 交叉编译，macOS 构建未测试
- **修复**: 在 macOS 上运行 `pnpm tauri build` 验证 DMG 打包
