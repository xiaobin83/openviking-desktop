# 开发准则

## 分支策略

- 禁止在 `main` 分支上直接提交代码。所有开发工作应在功能分支上进行，通过 Pull Request 合并到 `main`。

## 构建与开发

- 包管理器：`pnpm`（有 `pnpm-lock.yaml`，勿混用 npm/yarn）
- `pnpm build` = `tsc --noEmit && vite build` — 先 TypeScript 类型检查，再 Vite 打包
- `pnpm dev` — Vite 开发服务器（`localhost:1420`，单独运行时 Tauri API 不可用）
- `pnpm tauri dev` — Tauri 桌面应用开发模式（同时启动 Vite + Rust）
- VSCode Task `start:tauri:dev` 并行启动前端和 Rust 编译
- 预存在的 TS 错误（非本功能引入）：`src/components/config/EmbeddingModal.tsx:26-27` — `DIMENSION_PATH` / `BATCH_SIZE_PATH` 未使用

## Windows 构建环境 ![Windows](https://img.shields.io/badge/platform-Windows-0078D6)

> **推荐使用 GNU 工具链**（`x86_64-pc-windows-gnu`），无需管理员权限，兼容 Windows 10+。

### 必需依赖

| 依赖 | 安装方式 | 说明 |
|------|---------|------|
| Node.js + pnpm | `nvm4w` 或官方安装包 | pnpm ≥ 11 |
| Rust (GNU) | `rustup` | 默认 toolchain 设为 `stable-x86_64-pc-windows-gnu` |
| MinGW-w64 | 手动下载解压 | GCC 链接器，rustup 不捆绑 |

### 安装步骤（无需管理员）

#### 1. Rust GNU 工具链

```powershell
# 安装 GNU 工具链并设为默认
rustup toolchain install stable-x86_64-pc-windows-gnu
rustup default stable-x86_64-pc-windows-gnu
```

#### 2. MinGW-w64

从 [niXman/mingw-builds-binaries](https://github.com/niXman/mingw-builds-binaries/releases) 下载 `x86_64-*-release-posix-seh-ucrt-*.7z`，解压到 `C:\Users\<用户名>\mingw64\`。

7z 解压工具：从 [7-zip.org](https://www.7-zip.org/a/7za920.zip) 下载 `7za.exe`。

```powershell
7za.exe x mingw64.7z -oC:\Users\<用户名>\mingw64 -y
```

#### 3. 加入 PATH

```powershell
# 持久化到用户 PATH（重启终端生效）
[Environment]::SetEnvironmentVariable(
    "Path",
    "C:\Users\<用户名>\.cargo\bin;C:\Users\<用户名>\mingw64\mingw64\bin;$env:Path",
    "User"
)

# 当前会话临时设置
$env:Path = "$env:USERPROFILE\.cargo\bin;C:\Users\<用户名>\mingw64\mingw64\bin;$env:Path"
```

### 构建命令

```powershell
# 开发模式
pnpm tauri dev

# 生产构建（生成 MSI + NSIS 安装包）
pnpm tauri build

# 仅编译 Rust（在 src-tauri/ 下）
cargo build --release
```

### 为什么不推荐 MSVC？

- MSVC 需要 Visual Studio Build Tools（~2.5 GB），且安装需要管理员权限
- MSVC 工具链的 `windows` crate 预编译导入库（`.lib`）引用 Windows 11 API 集合约，导致编译产物在 Windows 10 上无法运行（`STATUS_ENTRYPOINT_NOT_FOUND`）
- GNU 工具链无此兼容性问题，产物可在 Windows 10 和 11 上运行

### 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| `linker 'gcc' not found` | MinGW 不在 PATH | 确认 `gcc --version` 能执行 |
| `rustc` 找不到 | Rust 不在 PATH | 确认 `~/.cargo/bin` 在 PATH 中 |
| 构建产物运行报错 `0xC0000139` | 用了 MSVC 工具链 | 切换到 GNU 工具链重建 |
| `export ordinal too large` | GNU `ld` 不支持 `cdylib` 大量导出 | 从 `Cargo.toml` 的 `crate-type` 中移除 `cdylib` |

## 架构要点

- **Tauri v2 三层架构**：React 前端 ↔ (IPC) ↔ Rust 后台 ↔ (spawn) ↔ Python sidecar
- Tauri 命令注册在 `src-tauri/src/lib.rs` 的 `generate_handler![]` 宏中
- 前端通过 `invoke()` 调用 Rust 命令，通过 `listen()` 监听后台事件
- REST API 封装在 `src/lib/api.ts`，使用 `fetch` 直接调用 Python server（`127.0.0.1:1933`）
- 配置字段声明式定义在 `src/lib/config-fields.ts`，由 `ConfigField` / `ConfigGroup` 统一渲染
- 配置持久化在 `~/.openviking/ov.conf`（JSON），通用工作空间由 `~/.openviking/workspace_path` 指定
- Python 环境管理通过捆绑的 `uv` 二进制实现（`scripts/download-uv.sh` 下载）

## 首次运行向导

- 新组件目录：`src/components/wizard/` — 6 个文件（OnboardingWizard + 4 Step + WizardProgress）
- 首次运行由 `~/.openviking/.onboarded` 标志文件控制，不存在时触发向导
- 向导完成时调用 `mark_onboarded` Rust 命令写入标志，同时写入 `ov.conf`
- 测试重置：`bash scripts/reset-first-run.sh`（清理标志+配置）；加 `--full` 额外清除 Python venv

## 代码规范

- TypeScript：严格模式（`strict: true`），`noUnusedLocals` / `noUnusedParameters` 强制无未使用变量
- CSS：Tailwind CSS v4（`@import "tailwindcss"`），无 CSS 模块或 styled-components
- 主题色系：深色 `surface` (#0a0f1e)，点缀 `aurora` (#22d3ee)，辅助 `nordic` (#1a75ff)
- 国际化：i18n 键定义在 `src/locales/{en,zh}.json`，渲染层通过 `useTranslation()` 取值
- Rust：`cargo build` 在 `src-tauri/` 目录下运行，输出到 `src-tauri/target/`
- 无测试框架（无 jest/vitest/playwright），手动验证为主

## Rust Tauri 命令

Tauri 命令注册在 `lib.rs` 的 `invoke_handler` 中。新增命令需要：
1. 在 `lib.rs` 中写 `#[tauri::command] async fn` 
2. 在 `generate_handler![]` 列表中注册
3. 前端通过 `invoke('command_name', { args })` 调用

## 资源文件

- `resources/uv/` — 各平台 uv 二进制（`.gitignore`，需运行 `download-uv.sh`）
- `src-tauri/Resources/models/*.gguf` — 嵌入模型（`.gitignore`，需运行 `download-gguf.sh`）
- 生产打包：Tauri bundle 配置中包含 `Resources/uv/**` 和 `Resources/models/**`
