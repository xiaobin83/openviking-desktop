# OpenViking Desktop

OpenViking 的桌面管理控制台，基于 **Tauri v2** + **React** + **TypeScript** 构建，提供对 OpenViking AI 知识管理系统的本地监控与管理能力。

![Dashboard Screenshot](docs/ov-desktop-dashboard.png)

![Configuration Screenshot](docs/ov-configuration.png)

## 功能特性

- **首次运行向导** — 引导完成 Python 环境安装、工作目录设置、AI 模型和 API Key 配置，全程图形化操作，无需接触命令行
- **自动 Python 环境管理** — 内置 `uv` 运行时会自动下载指定 Python 版本、创建虚拟环境并安装 `openviking[bot]`
- **服务管理** — 一键启动 / 停止 / 重启 OpenViking 后端服务，支持系统托盘常驻运行，崩溃自动重试最多 3 次
- **实时仪表盘** — 直观展示文件数、记忆总数、Token 消耗、检索次数等关键指标，每 10 秒自动刷新
- **配置管理** — 通过 5 个配置标签页（基础 / AI / 存储 / 高级 / 飞书）可视化调整服务器、存储、AI 模型（Embedding / VLM）、检索参数、飞书集成等全方位配置
- **内嵌 PlayGround** — 在应用窗口内直接打开 OpenViking PlayGround，API Key 自动复制到剪贴板
- **系统托盘** — 支持最小化到系统托盘运行，后台常驻管理
- **国际化** — 内置中英文双语界面支持，自动跟随系统语言
- **深色主题** — 精心设计的暗色 UI 风格，低视觉疲劳

## 技术栈

| 层级 | 技术 |
|---|---|
| 桌面框架 | Tauri v2 (Rust) |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 6 |
| 样式方案 | Tailwind CSS v4 |
| 字体 | Plus Jakarta Sans / JetBrains Mono |
| 国际化 | i18next + react-i18next |
| IPC | @tauri-apps/api (invoke / listen) |
| 后端 | Python (OpenViking Service) — 运行时通过 uv 自动安装 |

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发模式（浏览器预览，Tauri API 不可用）
pnpm run dev

# 启动 Tauri 桌面应用
pnpm tauri dev

# 生产构建
pnpm run build
pnpm tauri build
```

## 打包 uv 运行时

生产构建前，需要将 `uv` 二进制文件下载到 `resources/uv` 目录，供 Tauri 内置使用：

```bash
bash scripts/download-uv.sh --platform aarch64-apple-darwin
```

支持的平台：
- `aarch64-apple-darwin`
- `x86_64-apple-darwin`
- `x86_64-pc-windows-msvc`
- `x86_64-unknown-linux-gnu`

应用首次启动时，会自动使用 `uv` 下载对应 Python 版本、创建虚拟环境并安装 `openviking[bot]`，无需手动预打包。

## 打包 GGUFs 模型

本地 Embedding 模型需下载到 `src-tauri/Resources/models/` 目录：

```bash
bash scripts/download-gguf.sh
```

## 项目结构

```
src/
├── main.tsx                      # React 入口
├── App.tsx / App.css             # 根组件 + Tailwind v4 主题
├── components/
│   ├── dashboard/                # 仪表盘模块
│   │   ├── Dashboard.tsx         # 主组件（状态管理 + 数据轮询）
│   │   ├── StatusCard.tsx        # 服务状态卡片（5 种状态）
│   │   ├── StatsGrid.tsx         # 统计数据网格（4 指标卡片）
│   │   └── PythonEnvCard.tsx     # Python 环境状态卡片
│   ├── wizard/                   # 首次运行向导模块
│   │   ├── OnboardingWizard.tsx  # 向导容器（5 步骤编排）
│   │   ├── InstallStep.tsx       # 步骤 0：安装 Python + OpenViking
│   │   ├── WorkspaceStep.tsx     # 步骤 1：选择工作目录
│   │   ├── EmbeddingStep.tsx     # 步骤 2：配置 Embedding 模型
│   │   ├── VlmStep.tsx           # 步骤 3：配置 VLM 模型
│   │   ├── ApiKeyStep.tsx        # 步骤 4：设置 Root API Key
│   │   └── WizardProgress.tsx    # 步骤进度指示器
│   └── config/                   # 配置模块
│       ├── ConfigPage.tsx        # 配置页容器
│       ├── ConfigField.tsx       # 可复用配置字段组件
│       ├── ConfigGroup.tsx       # 可复用配置分组容器
│       ├── BasicTab.tsx          # 基础配置
│       ├── AITab.tsx             # AI 模型配置
│       ├── StorageTab.tsx        # 存储配置
│       ├── AdvancedTab.tsx       # 高级配置
│       ├── FeishuTab.tsx         # 飞书集成配置
│       └── EmbeddingModal.tsx    # Embedding 重建弹窗
├── lib/
│   ├── api.ts                    # REST API 封装
│   ├── types.ts                  # TypeScript 类型定义
│   ├── config-fields.ts          # 配置字段声明式定义
│   └── i18n.ts                   # i18n 国际化初始化
└── locales/
    ├── zh.json                   # 中文语言包
    └── en.json                   # 英文语言包

src-tauri/src/
├── main.rs                       # 应用入口
├── lib.rs                        # Tauri 命令与插件注册（约 30 个命令）
├── process.rs                    # 子进程管理（Python sidecar + 健康监控 + 自动重启）
├── python_env.rs                 # uv/Python 环境管理（下载、venv、pip install）
└── tray.rs                       # 系统托盘功能

scripts/
├── download-uv.sh                # uv 二进制下载脚本
├── download-gguf.sh              # 本地 Embedding 模型下载脚本
└── reset-first-run.sh            # 重置首次运行状态（用于测试）

resources/
└── uv/                           # 各平台 uv 二进制（gitignored）
```

## 开发说明

- 仪表盘通过 Tauri `invoke` 命令控制 Python 后端进程
- 服务运行后通过 REST API（`/health`、`/api/v1/console/dashboard/summary`、`/api/v1/stats/memories`）轮询数据
- 配置模块使用声明式字段定义（`config-fields.ts`），通过 `ConfigField` / `ConfigGroup` 组件统一渲染
- 国际化使用 `i18next`，语言包位于 `src/locales/`，当前支持中文和英文
- 主题色系：深色背景（`surface`）+ 青蓝点缀（`aurora`）+ 辅助蓝（`nordic`）
- 工作目录结构：`<工作目录>/` 下包含 `ov.conf`（配置文件）和 `data/`（知识库数据）
- 首次运行由 `~/.openviking/.onboarded` 标志控制，删除该文件可重新运行向导
- 构建产物格式：macOS DMG（目标平台 aarch64），发布说明见 [RELEASE_NOTES.md](RELEASE_NOTES.md)

## 分支策略

- 禁止在 `main` 分支上直接提交代码。所有开发工作应在功能分支上进行，通过 Pull Request 合并到 `main`。
- 更多开发规范详见 [AGENTS.md](AGENTS.md)。
