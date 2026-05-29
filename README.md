# OpenViking Desktop

OpenViking 的桌面管理控制台，基于 **Tauri v2** + **React** + **TypeScript** 构建，提供对 OpenViking AI 知识管理系统的本地监控与管理能力。

![Dashboard Screenshot](docs/ov-desktop-dashboard.png)

## 功能特性

- **服务管理** — 一键启动 / 停止 OpenViking 后端服务，实时监控运行状态
- **数据概览** — 直观展示文件数、技能数、记忆总数、今日 Token 消耗等关键指标
- **配置管理** — 支持服务器、存储、AI 模型（Embedding / LLM / VLM）、检索参数等全方位配置
- **实时监控** — 通过 Tauri IPC 监听服务状态变化，每 10 秒自动刷新仪表盘数据

## 技术栈

| 层级 | 技术 |
|---|---|
| 桌面框架 | Tauri v2 (Rust) |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 6 |
| 样式方案 | Tailwind CSS v4 |
| 字体 | Plus Jakarta Sans / JetBrains Mono |
| IPC | @tauri-apps/api (invoke / listen) |
| 后端 | Python sidecar (OpenViking Service) |

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

## 项目结构

```
src/
├── main.tsx                      # React 入口
├── App.tsx / App.css             # 根组件 + Tailwind v4 主题
├── components/
│   ├── dashboard/                # 仪表盘模块
│   │   ├── Dashboard.tsx         # 主组件（状态管理 + 数据轮询）
│   │   ├── StatusCard.tsx        # 服务状态卡片（5 种状态）
│   │   └── StatsGrid.tsx         # 统计数据网格（4 指标卡片）
│   └── config/                   # 配置模块
│       ├── ConfigPage.tsx        # 配置页容器
│       ├── BasicTab.tsx          # 基础配置
│       ├── AITab.tsx             # AI 模型配置
│       ├── StorageTab.tsx        # 存储配置
│       └── AdvancedTab.tsx       # 高级配置
└── lib/
    ├── api.ts                    # REST API 封装
    └── types.ts                  # TypeScript 类型定义
```

## 开发说明

- 仪表盘通过 Tauri `invoke` 命令控制 Python 后端进程
- 服务运行后通过 REST API（`/health`、`/api/v1/console/dashboard/summary`、`/api/v1/stats/memories`）轮询数据
- 主题色系：深色背景（`surface`）+ 青蓝点缀（`aurora`）+ 辅助蓝（`nordic`）
