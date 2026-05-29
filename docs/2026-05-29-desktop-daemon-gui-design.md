# OpenViking Desktop Daemon GUI — 设计文档

## 1. 概述与目标

### 1.1 项目定位

面向非开发者的 OpenViking 桌面守护进程应用。用户安装后无需配置任何开发环境，即可在本地运行 OpenViking Server，并获得图形化管理能力。

### 1.2 核心目标

| 目标 | 说明 |
|---|---|
| 零环境依赖 | 打包时预构建完整 Python venv，用户无需安装 Python 或任何依赖 |
| 独立分发 | 以 macOS DMG（后续扩展 Windows/Linux）格式独立分发 |
| 开箱即用 | 启动即运行 openviking-server，提供图形化配置 |
| 守护进程 | 应用常驻菜单栏，后台静默提供服务 |
| 仪表盘 | 窗口仪表盘展示服务状态、存储用量、资源/记忆统计 |

### 1.3 v1.0 范围

- 菜单栏托盘图标 + 下拉菜单（启停控制、打开仪表盘）
- 仪表盘窗口：服务状态、资源/记忆统计
- 图形化配置表单：基础设置、AI 模型、存储、高级
- openviking-server 进程生命周期管理（启动/停止/重启/健康检查）
- macOS 优先（后续通过 Tauri 扩展到 Windows/Linux）

### 1.4 后续版本（v2+）

- 文件管理：树形文件浏览器（对标 `ov tui`）
- 语义搜索：GUI 搜索界面
- 多语言支持
- 自动更新

---

## 2. 架构设计

### 2.1 架构选型：Thin Shell

```
┌────────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                        │
│                                                            │
│  ┌──────────────┐   IPC    ┌──────────────────┐            │
│  │   Web 前端    │ ◄──────► │  Tauri Rust 层    │            │
│  │  (React+TS)  │          │  (进程/窗口管理)   │            │
│  │              │          │                  │            │
│  │  仪表盘       │          │  托盘菜单          │            │
│  │  配置表单     │          │  子进程 spawn      │            │
│  │              │          │  健康检查轮询       │            │
│  └──────┬───────┘          │  fs 文件访问       │            │
│         │                  └────────┬─────────┘            │
│         │  HTTP (fetch)             │ spawn                │
│         │                           ▼                      │
│         │                  ┌──────────────────┐            │
│         └─────────────────►│  Python Sidecar  │            │
│                            │  openviking-     │            │
│                            │  server          │            │
│                            │  127.0.0.1:1933  │            │
│                            └──────────────────┘            │
└────────────────────────────────────────────────────────────┘
```

**核心原则**：Tauri 的 Rust 层仅承担最小职责 — 进程生命周期管理和窗口/托盘控制。Web 前端通过 HTTP 直接调用 openviking-server 的 REST API 完成所有业务操作。

**选择理由**：
- Rust 代码量最小，降低维护成本
- 直接复用 openviking-server 全部 18 个路由 + MCP 端点
- 新增前端功能无需修改 Rust 代码
- 符合 Tauri "轻量壳 + Web 内容" 的设计哲学

### 2.2 技术栈

| 层 | 技术 | 精确版本要求 |
|---|---|---|
| 桌面框架 | Tauri v2 | `tauri = "2"`, Rust edition 2021 |
| 前端框架 | React 18 + TypeScript 5 | `react@^18`, `typescript@^5` |
| CSS | Tailwind CSS v4 | `tailwindcss@^4` |
| 构建 | Vite 6 | `vite@^6` |
| Tauri CLI | `@tauri-apps/cli` v2 | `npm create tauri-app@latest` |
| Python 环境 | uv + 预构建 venv | Python >= 3.10, `uv` 最新版 |
| 服务端 | openviking-server (FastAPI) | 通过现有 REST API 提供数据服务 |
| 打包 | Tauri bundler → DMG | macOS 14+ |

---

## 3. 交互模式

### 3.1 菜单栏托盘

```
┌─────────────────────┐
│ 🧠  OpenViking      │  ← 应用名称 + 状态指示
│ ─────────────────   │
│ ● 服务运行中         │  ← 点击切换 启动/停止
│ ─────────────────   │
│ 打开仪表盘           │  ← 打开管理窗口
│ ─────────────────   │
│ 退出                │  ← 停止服务并退出应用
└─────────────────────┘
```

- macOS 状态栏图标，点击展开菜单
- 图标变化反映服务状态：运行中（彩色）/ 已停止（灰色）/ 启动中（闪烁）
- 点击"服务运行中/已停止"切换启停
- "打开仪表盘"打开管理窗口，窗口关闭后应用仍在后台运行
- "退出"停止服务并退出应用

### 3.2 仪表盘窗口

窗口包含两个 Tab：

**概览 Tab**：
- 服务状态卡片：运行中/已停止/启动中/异常，版本号
- 资源数量：文件数、技能数
- 记忆数量：记忆总数、按类别分布
- 服务版本号

**配置 Tab**：
- 四个子 Tab：基础 / AI 模型 / 存储 / 高级
- 表单式配置，保存后写入 ov.conf
- 保存后弹出"需重启服务生效"提示

---

## 4. 配置表单设计

### 4.1 基础 Tab

| 字段 | 类型 | 默认值 | ov.conf 路径 |
|---|---|---|---|
| 服务端口 | NumberInput | `1933` | `server.port` |
| 数据存储路径 | PathPicker | `~/.openviking/data` | `storage.workspace` |
| 日志级别 | Select | `INFO` | `log.level` |

### 4.2 AI 模型 Tab

| 字段 | 类型 | 默认值 | ov.conf 路径 |
|---|---|---|---|
| 嵌入模型 (Embedding) | TextInput | `doubao-embedding-large` | `embedding.model` |
| API 基础地址 | TextInput | — | `embedding.base_url` |
| API 密钥 | PasswordInput | — | `embedding.api_key` |
| 语言模型 (LLM) | TextInput | `openai/gpt-4o` | `llm.model` |
| LLM API 基础地址 | TextInput | — | `llm.base_url` |
| LLM API 密钥 | PasswordInput | — | `llm.api_key` |
| 视觉模型 (VLM) | TextInput | — | `vlm.model` |
| VLM API 基础地址 | TextInput | — | `vlm.base_url` |
| VLM API 密钥 | PasswordInput | — | `vlm.api_key` |

### 4.3 存储 Tab

| 字段 | 类型 | 默认值 | ov.conf 路径 |
|---|---|---|---|
| 向量数据库后端 | Select | `local` | `storage.vectordb.backend` |
| AGFS 存储后端 | Select | `local` | `storage.agfs.backend` |
| 加密存储 | Switch | `false` | `encryption.enabled` |

### 4.4 高级 Tab

| 字段 | 类型 | 默认值 | ov.conf 路径 |
|---|---|---|---|
| 检索 Top-K | NumberInput | `10` | `retrieval.top_k` |
| 检索相似度阈值 | Slider (0-1) | `0.5` | `retrieval.threshold` |
| CORS 允许来源 | TextInput | `*` | `server.cors_origins` |
| 启用可观测性 | Switch | `false` | `server.observability.metrics.enabled` |

### 4.5 ov.conf JSON 结构（默认配置模板）

应用在首次启动且 ov.conf 不存在时，会生成以下默认配置：

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 1933,
    "auth_mode": null,
    "cors_origins": ["*"]
  },
  "storage": {
    "workspace": "~/.openviking/data",
    "vectordb": {
      "backend": "local"
    },
    "agfs": {
      "backend": "local"
    }
  },
  "embedding": {
    "model": "doubao-embedding-large",
    "base_url": null,
    "api_key": null
  },
  "llm": {
    "model": "openai/gpt-4o",
    "base_url": null,
    "api_key": null
  },
  "vlm": {
    "model": null,
    "base_url": null,
    "api_key": null
  },
  "retrieval": {
    "top_k": 10,
    "threshold": 0.5
  },
  "encryption": {
    "enabled": false
  },
  "log": {
    "level": "INFO"
  }
}
```

### 4.6 配置读写机制

- 配置文件路径：`~/.openviking/ov.conf`
- Web 前端通过 Tauri `@tauri-apps/plugin-fs` 插件直接读写 JSON 文件
- 读取：页面加载时解析 ov.conf → 填充表单（使用 `JSON.parse()`）
- 写入：点击"保存"时将表单数据序列化为 JSON → `JSON.stringify(data, null, 2)` → 写入 ov.conf
- 校验：保存前进行字段类型校验（number 字段不是 NaN，string 字段非空等），字段非法时高亮提示

---

## 5. 项目结构

```
./
├── src-tauri/                  # Tauri Rust 核心
│   ├── Cargo.toml              # Rust 依赖声明
│   ├── tauri.conf.json         # Tauri 配置（见 Section 12.1）
│   ├── capabilities/
│   │   └── default.json        # 权限声明（见 Section 12.3）
│   ├── icons/
│   │   └── icon.png            # 应用图标 (1024x1024 PNG)
│   └── src/
│       ├── main.rs             # 入口：创建 Tauri app、注册 SystemTray（见 Section 12.4.1）
│       ├── tray.rs             # 菜单栏托盘管理（见 Section 12.4.2）
│       ├── process.rs          # Python sidecar 进程管理（见 Section 12.4.3）
│       └── lib.rs              # Tauri IPC 命令注册（见 Section 12.4.4）
│
├── src/                        # Web 前端
│   ├── main.tsx                # React 入口
│   ├── App.tsx                 # 顶层路由：概览 / 配置
│   ├── App.css                 # Tailwind 入口（@import "tailwindcss"）
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── Dashboard.tsx   # 概览仪表盘页面
│   │   │   ├── StatusCard.tsx  # 服务状态卡片（健康/版本号/端口）
│   │   │   └── StatsGrid.tsx   # 统计数字网格（文件数、技能数、记忆数）
│   │   └── config/
│   │       ├── ConfigPage.tsx  # 配置页面容器（4 个子 Tab 路由）
│   │       ├── BasicTab.tsx    # 基础配置表单
│   │       ├── AITab.tsx       # AI 模型配置表单
│   │       ├── StorageTab.tsx  # 存储配置表单
│   │       └── AdvancedTab.tsx # 高级配置表单
│   ├── lib/
│   │   ├── api.ts              # REST API 封装，base URL = http://127.0.0.1:1933
│   │   └── types.ts            # TypeScript 类型定义
│   └── vite-env.d.ts           # Vite 环境类型声明
│
├── scripts/
│   └── bundle-python.sh        # 构建阶段脚本（见 Section 12.6）
│
├── docs/
│   └── 2026-05-29-desktop-daemon-gui-design.md
│
├── index.html                  # Vite HTML 入口
├── package.json                # 前端依赖（见 Section 12.2）
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── .gitignore
```

---

## 6. 数据流与 API 参考

### 6.1 通信矩阵

| 方向 | 协议 | 用途 |
|---|---|---|
| Web 前端 → Python Server | HTTP `fetch()` | 业务数据：health、dashboard summary、stats |
| Web 前端 → Tauri Rust | IPC `invoke()` | 服务启停、ov.conf 读写、进程日志查询 |
| Tauri Rust → Web 前端 | IPC `event` (`listen()`) | 服务状态变更通知 (`server-status-changed`) |

### 6.2 使用的 openviking-server API 端点

以下所有 API 端点均来自 openviking-server 已有的实现，**无需修改服务端代码**。

#### GET /health — 健康检查

```
GET http://127.0.0.1:1933/health
```

无需认证。响应格式（HTTP 200）：

```json
{
  "status": "ok",
  "healthy": true,
  "version": "0.3.17"
}
```

- 前端每 5 秒轮询此端点判断服务是否存活
- 也用于等待服务启动就绪（超时 30 秒）

#### GET /api/v1/console/dashboard/summary — 仪表盘概览

```
GET http://127.0.0.1:1933/api/v1/console/dashboard/summary
```

需要认证（DEV 模式自动通过）。响应格式：

```json
{
  "status": "ok",
  "result": {
    "context_counts": {
      "files": 156,
      "skills": 3,
      "memories": 89,
      "total": 248
    },
    "today_tokens": { "input": 12000, "output": 8000 },
    "today_retrievals": { "count": 45 },
    "agent_overview": [
      {
        "agent_id": "default",
        "total_tokens": 150000,
        "total_users": 2
      }
    ]
  }
}
```

- `context_counts.files` — 资源文件总数
- `context_counts.skills` — 技能数量
- `context_counts.memories` — 记忆数量
- 如果 usage/audit 未启用，返回 `{"enabled": false, "message": "..."}`，前端应降级显示

#### GET /api/v1/stats/memories — 记忆统计

```
GET http://127.0.0.1:1933/api/v1/stats/memories?category=profile
```

可选查询参数 `category`。响应格式：

```json
{
  "status": "ok",
  "result": {
    "total_memories": 89,
    "by_category": { "profile": 5, "entities": 30, "events": 25, "patterns": 15, "skills": 10, "tools": 4 },
    "hotness_distribution": { "cold": 20, "warm": 45, "hot": 24 }
  }
}
```

### 6.3 关键数据流

**服务启动流程**：
```
用户点击"启动服务"
    → Web 前端 invoke("start_server")
    → Rust 端：
        → 构建 venv python 路径：{app_resource_dir}/python/bin/python3
        → 检查文件存在性
        → 确定 ov.conf 路径：~/.openviking/ov.conf
        → 创建日志目录：~/Library/Logs/OpenViking/
        → 打开 server.log 文件句柄
        → Command::new(python_path)
            .arg("-m").arg("openviking.server.bootstrap")
            .arg("--host").arg("127.0.0.1")
            .arg("--port").arg(config_port)
            .arg("--config").arg(ov_conf_path)
            .stdout(log_file)
            .stderr(log_file)
            .spawn()
        → 保存 child 进程句柄到全局状态（Mutex<Option<Child>>）
        → emit("server-status-changed", "starting")
        → 异步轮询 http://127.0.0.1:1933/health（每 2s，最多 30s）
        → 成功 → emit("server-status-changed", "running")
        → 超时 → emit("server-status-changed", "timeout")
    → Web 前端 listen("server-status-changed") → 更新 UI
```

**仪表盘数据加载**：
```
Web 前端 Dashboard 组件挂载
    → GET /health                           → healthy 状态 + version
    → GET /api/v1/console/dashboard/summary  → context_counts + today_tokens
    → GET /api/v1/stats/memories             → total_memories + by_category
    → 将数据聚合后渲染 StatusCard + StatsGrid
    → 每 10 秒自动刷新一次
```

**错误降级**：若 dashboard/summary 返回 `{"enabled": false}`，StatsGrid 仅显示记忆统计（来自 `/api/v1/stats/memories`），文件/技能数显示为 "—"。

**配置保存流程**：
```
用户填写表单 → 点击"保存配置"
    → Web 前端序列化表单数据 → 构建 ov.conf JSON 对象
    → 字段类型校验（number 不为 NaN，string 不为空）
    → invoke("write_config", { config: ovConfJson })
    → Rust 端：
        → 确保 ~/.openviking/ 目录存在
        → fs::write(ov_conf_path, JSON.stringify(config, null, 2))
        → 返回 { success: true }
    → Web 前端弹出提示："配置已保存，需重启服务生效"，显示 [重启服务] 按钮
```

---

## 7. 错误处理

### 7.1 服务生命周期状态机

```
  [应用启动]
      │
      ▼
  ┌─────────┐  spawn 成功   ┌──────────┐  health OK   ┌──────────┐
  │ 启动中   │ ────────────► │  初始化中  │ ───────────► │  运行中   │
  └─────────┘               └──────────┘              └──────────┘
      │                          │                          │
      │ spawn 失败               │ 超时 (30s)              │ crash/手动停止
      ▼                          ▼                          ▼
  ┌─────────┐               ┌──────────┐              ┌──────────┐
  │ 启动失败  │               │  超时     │              │  已停止   │
  └─────────┘               └──────────┘              └──────────┘
      │                          │                          │
      │ 点击"重试"               │ 点击"重试"               │ 点击"启动"
      └──────────────────────────┘                          │
                                                   ┌───────┘
                                                   ▼
                                             回到 [启动中]
```

### 7.2 错误场景处理

| 场景 | UI 表现 | 处理逻辑 |
|---|---|---|
| **Python venv 缺失/损坏** | StatusCard 显示"环境异常，请重新安装应用" | Rust 启动前检查 `python_path.exists()` |
| **端口被占用** | StatusCard 显示"端口 {port} 被占用"，引导用户修改配置 | Rust 检测子进程立即退出 + stderr 含 `address already in use` |
| **ov.conf 不存在** | 首次启动自动生成默认 ov.conf，直接尝试启动 | Rust 写入默认配置 JSON 到 `~/.openviking/ov.conf` |
| **ov.conf JSON 解析失败** | 配置页顶部红色横幅"配置格式错误"，重置按钮可用 | 前端 JSON.parse 失败时捕获，降级显示空表单 + 错误提示 |
| **服务启动超时 (30s)** | StatusCard 显示"启动超时"，[查看日志] [重试] 按钮 | 30s 后 /health 仍未 200 |
| **运行时 health 失败** | StatusCard 变红"服务无响应"，自动尝试重启（最多 3 次） | 连续 3 次 `/health` 非 200 → kill + restart；3 次重启仍失败 → 停止并提示 |
| **Dashboard API 不可用** | StatsGrid 部分数据显示 "—"，StatusCard 仍正常 | GET /api/v1/console/dashboard/summary 失败时仅显示记忆统计 |

### 7.3 日志方案

- Python server 的 stdout/stderr 由 Rust 进程管理器捕获，写入 `~/Library/Logs/OpenViking/server.log`
- 仪表盘提供"查看日志"按钮，读取 server.log 最近 100 行显示在弹窗中
- Rust 层使用 `log` crate + `env_logger`，日志写入 `~/Library/Logs/OpenViking/app.log`

---

## 8. 打包与分发

### 8.1 构建流程

```
[1] 准备 Python 环境（在 OpenViking 根目录执行）
    uv sync --frozen
        ↓
[2] 打包 venv 到 Tauri Resources
    bash scripts/bundle-python.sh
    → 复制 .venv/ → src-tauri/Resources/python/
        ↓
[3] 构建前端（在项目根目录执行）
    pnpm install
    pnpm build
    → Vite 输出 → dist/
        ↓
[4] Tauri 打包
    pnpm tauri build --bundles dmg
    → cargo build --release（Rust 后端）
    → 签名 + DMG 打包
        ↓
[5] 产物
    src-tauri/target/release/bundle/dmg/OpenViking_0.1.0_aarch64.dmg
```

### 8.2 DMG 内容结构

```
OpenViking.app/
├── Contents/
│   ├── MacOS/
│   │   └── desktop-daemon-gui       # Tauri 编译的 Rust 二进制
│   ├── Resources/
│   │   ├── python/                   # 预构建 Python venv
│   │   │   ├── bin/
│   │   │   │   └── python3          # Python 解释器
│   │   │   └── lib/
│   │   │       └── python3.xx/
│   │   │           └── site-packages/
│   │   │               └── openviking/  # + 所有依赖
│   │   ├── index.html                # 前端入口
│   │   ├── assets/                   # Vite 打包产物
│   │   └── icons/                    # 应用图标
│   ├── Frameworks/                   # Tauri WebView 依赖
│   └── Info.plist
```

### 8.3 Info.plist 关键配置

```xml
<key>LSUIElement</key>
<true/>  <!-- 菜单栏应用，不显示在 Dock -->
```

### 8.4 首次启动体验

1. 用户双击 `OpenViking.app` → 应用启动
2. 菜单栏出现 OpenViking 图标（灰色 = 未启动）
3. Rust 自动检查 ov.conf 是否存在：
   - **不存在** → 写入默认 ov.conf（Section 4.5），然后自动启动
   - **存在** → 自动启动 openviking-server
4. 服务启动中（图标闪烁），就绪后图标变彩色
5. 用户点击菜单栏 → 打开仪表盘 → 查看运行状态

### 8.5 更新机制（v2 预留）

- Tauri updater plugin 配置（`tauri.conf.json` 中 `plugins.updater` 部分，v1 置空）

---

## 9. v2 扩展预留

### 9.1 文件管理

- 仪表盘新增"文件"Tab
- 左侧树形目录（`GET /api/v1/fs/tree`）
- 右侧文件内容预览（`GET /api/v1/content/read`）
- 支持创建/删除/重命名/移动操作

### 9.2 语义搜索

- 仪表盘新增"搜索"Tab
- 搜索框 + 结果列表
- 调用 `POST /api/v1/search/find` 和 `/api/v1/search/search`
- 支持时间过滤、层级过滤

### 9.3 架构扩展点

- `src-tauri/src/process.rs` 的 `ServerConfig` 结构体支持追加额外参数
- `src/lib/api.ts` 按模块拆分，API 函数模式统一
- 前端路由预留 `FileManager` 和 `SearchPanel` 组件位置

---

## 10. 安全性考量

- 服务仅监听 `127.0.0.1`，不接受外部网络请求
- API Key 等敏感配置在 UI 中以 password 类型输入框展示（浏览器原生脱敏）
- 私有数据存储在 `~/.openviking/`（macOS 沙箱友好）
- 日志中过滤 API Key 等敏感信息（Python server 自动处理，Rust 端仅记录进程启停）

---

## 11. 决策记录

| 决策点 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 目标平台 | macOS/Windows/Linux | macOS 优先，Tauri 跨平台架构 | 快速落地 + 架构不绑定平台 |
| GUI 框架 | Electron / Tauri / 原生 | Tauri | 轻量（~10MB vs ~150MB），Rust 安全 |
| Python 打包 | PyInstaller / 网络安装 / 预构建 venv | 预构建 venv | 零网络依赖，启动快 |
| 交互模式 | 纯窗口 / 纯托盘 / 混合 | 混合（托盘 + 窗口） | 守护进程不打扰 + 需要时展开管理 |
| 配置方式 | 向导 / 表单 / JSON 编辑器 / 混合 | 表单 | 非开发者友好，覆盖核心配置项 |
| v1.0 范围 | 最小 / 仪表盘 / 完整 | 守护 + 仪表盘 | 可验证核心链路 + 有展示价值 |
| 架构模式 | Thin Shell / Proxy / Rust-First | Thin Shell | 最少 Rust 代码，最大复用现有 API |
| 前端框架 | React / Vue / Svelte | React | Tauri 官方模板支持最好，生态最成熟 |

---

## 12. 实施参考（Implementation Reference）

> 本章节为实施 agent 提供可直接使用的配置模板和代码骨架。

### 12.1 tauri.conf.json 模板

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-cli/schema.json",
  "productName": "OpenViking",
  "version": "0.1.0",
  "identifier": "com.openviking.desktop-daemon-gui",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "pnpm build",
    "beforeDevCommand": "pnpm dev"
  },
  "app": {
    "title": "OpenViking",
    "withGlobalTauri": true,
    "windows": [
      {
        "label": "dashboard",
        "title": "OpenViking 仪表盘",
        "width": 720,
        "height": 560,
        "visible": false,
        "center": true,
        "resizable": true,
        "minWidth": 600,
        "minHeight": 400
      }
    ],
    "trayIcon": {
      "id": "main-tray",
      "iconPath": "icons/icon.png",
      "tooltip": "OpenViking",
      "iconAsTemplate": true
    },
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "dmg",
    "icon": [
      "icons/icon.icns"
    ],
    "resources": [
      "Resources/python/**/*"
    ],
    "macOS": {
      "minimumSystemVersion": "14.0"
    }
  }
}
```

关键说明：
- `"visible": false` — 仪表盘窗口初始隐藏，通过托盘菜单打开
- `"iconAsTemplate": true` — macOS 模板图标（自动适配亮暗模式）
- `"resources"` — 将 `Resources/python/` 目录打包进 app bundle
- `"identifier"` — macOS bundle identifier，确保唯一性

### 12.2 package.json 依赖

```json
{
  "name": "openviking-desktop-daemon-gui",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-fs": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@tauri-apps/cli": "^2.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
```

### 12.3 Tauri Capabilities 权限声明

文件：`src-tauri/capabilities/default.json`

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability for the main window",
  "windows": ["dashboard"],
  "permissions": [
    "core:default",
    "fs:default",
    "fs:allow-read",
    "fs:allow-write",
    "fs:allow-exists",
    "fs:allow-mkdir",
    {
      "identifier": "fs:scope",
      "allow": [
        { "path": "$HOME/.openviking/**" },
        { "path": "$HOME/Library/Logs/OpenViking/**" },
        { "path": "$HOME/Library/Application Support/OpenViking/**" }
      ]
    },
    "shell:default",
    "shell:allow-spawn",
    "shell:allow-execute"
  ]
}
```

### 12.4 Rust 代码骨架

#### 12.4.1 Cargo.toml

```toml
[package]
name = "desktop-daemon-gui"
version = "0.1.0"
edition = "2021"

[lib]
name = "desktop_daemon_gui_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-fs = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["json"] }
tokio = { version = "1", features = ["full"] }
log = "0.4"
env_logger = "0.11"
```

#### 12.4.2 lib.rs — Tauri IPC 命令注册

```rust
use tauri::Manager;
use std::sync::Mutex;
use std::process::Child;

mod process;
mod tray;

pub struct ServerState {
    pub child: Mutex<Option<Child>>,
    pub status: Mutex<String>, // "stopped" | "starting" | "running" | "error" | "timeout"
    pub port: Mutex<u16>,
    pub python_path: String,
    pub ov_conf_path: String,
    pub server_log_path: String,
}

#[tauri::command]
async fn get_server_status(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    Ok(state.status.lock().unwrap().clone())
}

#[tauri::command]
async fn start_server(state: tauri::State<'_, ServerState>, app: tauri::AppHandle) -> Result<String, String> {
    // 1. 检查是否已运行
    // 2. 调用 process::spawn_server()
    // 3. 后台轮询 health
    // 4. emit("server-status-changed", status)
    process::spawn_server(&state, &app).await
}

#[tauri::command]
async fn stop_server(state: tauri::State<'_, ServerState>, app: tauri::AppHandle) -> Result<String, String> {
    process::stop_server(&state, &app).await
}

#[tauri::command]
async fn read_config(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let path = &state.ov_conf_path;
    match std::fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("读取配置失败: {}", e)),
    }
}

#[tauri::command]
async fn write_config(state: tauri::State<'_, ServerState>, config: String) -> Result<String, String> {
    let path = &state.ov_conf_path;
    // 确保目录存在
    if let Some(parent) = std::path::Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    std::fs::write(path, &config).map_err(|e| format!("写入配置失败: {}", e))?;
    Ok("ok".to_string())
}

#[tauri::command]
async fn read_server_log(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let path = &state.server_log_path;
    match std::fs::read_to_string(path) {
        Ok(content) => {
            // 返回最近 100 行
            let lines: Vec<&str> = content.lines().collect();
            let start = if lines.len() > 100 { lines.len() - 100 } else { 0 };
            Ok(lines[start..].join("\n"))
        }
        Err(e) => Err(format!("读取日志失败: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 初始化 ServerState
            let resource_dir = app.path().resource_dir()
                .expect("failed to resolve resource dir");
            let python_path = resource_dir
                .join("python/bin/python3")
                .to_string_lossy()
                .to_string();

            let home = dirs::home_dir().expect("no home dir");
            let ov_conf_path = home
                .join(".openviking/ov.conf")
                .to_string_lossy()
                .to_string();
            let server_log_path = home
                .join("Library/Logs/OpenViking/server.log")
                .to_string_lossy()
                .to_string();

            // 确保日志目录存在
            if let Some(parent) = std::path::Path::new(&server_log_path).parent() {
                std::fs::create_dir_all(parent).ok();
            }

            app.manage(ServerState {
                child: Mutex::new(None),
                status: Mutex::new("stopped".to_string()),
                port: Mutex::new(1933),
                python_path,
                ov_conf_path,
                server_log_path,
            });

            // 注册托盘
            tray::create_tray(app)?;

            // 自动启动：检查 ov.conf 是否存在，不存在则创建默认配置
            let state = app.state::<ServerState>();
            let conf_path = state.ov_conf_path.clone();
            if !std::path::Path::new(&conf_path).exists() {
                let default_config = r#"{
  "server": { "host": "127.0.0.1", "port": 1933 },
  "storage": { "workspace": "~/.openviking/data", "vectordb": { "backend": "local" }, "agfs": { "backend": "local" } },
  "embedding": { "model": "doubao-embedding-large" },
  "llm": { "model": "openai/gpt-4o" },
  "retrieval": { "top_k": 10, "threshold": 0.5 },
  "encryption": { "enabled": false },
  "log": { "level": "INFO" }
}"#;
                std::fs::write(&conf_path, default_config).ok();
            }

            // 自动启动服务
            let state_for_spawn = app.state::<ServerState>().clone();
            let app_for_spawn = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = process::spawn_server(&state_for_spawn, &app_for_spawn).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_server_status,
            start_server,
            stop_server,
            read_config,
            write_config,
            read_server_log,
        ])
        .on_window_event(|window, event| {
            // 窗口关闭时隐藏而非退出
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "dashboard" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

#### 12.4.3 process.rs — 进程管理器

```rust
use std::process::{Child, Command, Stdio};
use std::fs::File;
use tauri::{AppHandle, Emitter};
use crate::ServerState;

pub async fn spawn_server(
    state: &ServerState,
    app: &AppHandle,
) -> Result<String, String> {
    // 1. 检查 venv
    let python_path = &state.python_path;
    if !std::path::Path::new(python_path).exists() {
        *state.status.lock().unwrap() = "error".to_string();
        let _ = app.emit("server-status-changed", "error");
        return Err("Python 环境未找到".to_string());
    }

    // 2. 检查是否有已运行的进程
    {
        let mut child = state.child.lock().unwrap();
        if child.is_some() {
            return Err("服务已在运行".to_string());
        }
    }

    // 3. 设置状态为 starting
    *state.status.lock().unwrap() = "starting".to_string();
    let _ = app.emit("server-status-changed", "starting");

    // 4. 获取端口
    let port = *state.port.lock().unwrap();

    // 5. 打开日志文件
    let log_file = File::create(&state.server_log_path)
        .map_err(|e| format!("无法创建日志文件: {}", e))?;

    // 6. 启动子进程
    let child = Command::new(python_path)
        .arg("-m")
        .arg("openviking.server.bootstrap")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--config")
        .arg(&state.ov_conf_path)
        .stdout(Stdio::from(log_file.try_clone().unwrap()))
        .stderr(Stdio::from(log_file))
        .spawn()
        .map_err(|e| {
            *state.status.lock().unwrap() = "error".to_string();
            let _ = app.emit("server-status-changed", "error");
            format!("启动服务失败: {}", e)
        })?;

    *state.child.lock().unwrap() = Some(child);

    // 7. 异步轮询 health
    let port = *state.port.lock().unwrap();
    let app_clone = app.clone();
    let state_ptr: *const ServerState = state as *const ServerState;

    tokio::spawn(async move {
        let state_ref = unsafe { &*state_ptr };
        let url = format!("http://127.0.0.1:{}/health", port);
        let client = reqwest::Client::new();
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(30);

        loop {
            if start.elapsed() > timeout {
                *state_ref.status.lock().unwrap() = "timeout".to_string();
                let _ = app_clone.emit("server-status-changed", "timeout");
                break;
            }

            match client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    *state_ref.status.lock().unwrap() = "running".to_string();
                    let _ = app_clone.emit("server-status-changed", "running");
                    break;
                }
                _ => {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            }
        }
    });

    Ok("starting".to_string())
}

pub async fn stop_server(
    state: &ServerState,
    app: &AppHandle,
) -> Result<String, String> {
    let mut child_opt = state.child.lock().unwrap();
    if let Some(ref mut child) = *child_opt {
        let _ = child.kill();
        let _ = child.wait();
    }
    *child_opt = None;
    *state.status.lock().unwrap() = "stopped".to_string();
    let _ = app.emit("server-status-changed", "stopped");
    Ok("stopped".to_string())
}
```

注意：`ServerState` 指针传递使用 `unsafe` 是因为 `ServerState` 被 Tauri 管理，生命周期与 app 一致。这是 Tauri 的常见模式。

#### 12.4.4 tray.rs — 菜单栏托盘

```rust
use tauri::{
    AppHandle, Runtime,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton},
};
use log::info;

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let toggle_item = MenuItemBuilder::with_id("toggle_server", "● 启动服务").build(app)?;
    let dashboard_item = MenuItemBuilder::with_id("open_dashboard", "打开仪表盘").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&toggle_item)
        .separator()
        .item(&dashboard_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("OpenViking")
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "toggle_server" => {
                    // 通过 emit 通知前端切换服务状态
                    let _ = app.emit("tray-toggle-server", true);
                }
                "open_dashboard" => {
                    if let Some(window) = app.get_webview_window("dashboard") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    // 停止服务后退出
                    if let Some(state) = app.try_state::<crate::ServerState>() {
                        let mut child = state.child.lock().unwrap();
                        if let Some(ref mut c) = *child {
                            let _ = c.kill();
                            let _ = c.wait();
                        }
                    }
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                // 左键单击：打开/隐藏仪表盘
                if let Some(window) = tray.app_handle().get_webview_window("dashboard") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    info!("Tray icon created");
    Ok(())
}
```

### 12.5 前端代码骨架

#### 12.5.1 api.ts — REST API 封装

```typescript
const BASE_URL = 'http://127.0.0.1:1933';

interface HealthResponse {
  status: string;
  healthy: boolean;
  version: string;
}

interface DashboardSummary {
  context_counts: {
    files: number;
    skills: number;
    memories: number;
    total: number;
  };
  today_tokens?: { input: number; output: number };
  today_retrievals?: { count: number };
}

interface MemoryStats {
  total_memories: number;
  by_category: Record<string, number>;
}

interface ApiResponse<T> {
  status: string;
  result?: T;
  error?: { code: string; message: string };
}

async function fetchApi<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  const data: ApiResponse<T> = await response.json();
  if (data.status === 'error') {
    throw new Error(data.error?.message ?? 'Unknown error');
  }
  return data.result as T;
}

export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.json();
}

export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  try {
    const result = await fetchApi<DashboardSummary>('/api/v1/console/dashboard/summary');
    return result;
  } catch {
    // usage/audit 未启用时返回 null，前端降级显示
    return null;
  }
}

export async function getMemoryStats(): Promise<MemoryStats> {
  return fetchApi<MemoryStats>('/api/v1/stats/memories');
}
```

#### 12.5.2 Dashboard.tsx — 仪表盘组件逻辑

```tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { checkHealth, getDashboardSummary, getMemoryStats } from '../lib/api';
import type { DashboardSummary, MemoryStats } from '../lib/types';

export default function Dashboard() {
  const [serverStatus, setServerStatus] = useState<string>('stopped');
  const [version, setVersion] = useState<string>('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [memStats, setMemStats] = useState<MemoryStats | null>(null);

  // 监听服务状态变更
  useEffect(() => {
    const unlisten = listen<string>('server-status-changed', (event) => {
      setServerStatus(event.payload);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  // 初始加载：获取当前状态
  useEffect(() => {
    invoke<string>('get_server_status').then(setServerStatus);
  }, []);

  // 服务运行时轮询数据
  useEffect(() => {
    if (serverStatus !== 'running') return;

    const fetchData = async () => {
      try {
        const health = await checkHealth();
        setVersion(health.version);

        const dashSummary = await getDashboardSummary();
        setSummary(dashSummary);

        const mem = await getMemoryStats();
        setMemStats(mem);
      } catch {
        // API 调用失败时静默处理
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10_000); // 10s 轮询
    return () => clearInterval(interval);
  }, [serverStatus]);

  // 启动/停止处理
  const handleToggleServer = async () => {
    try {
      if (serverStatus === 'running') {
        await invoke('stop_server');
      } else {
        await invoke('start_server');
      }
    } catch (err) {
      console.error('Toggle server failed:', err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <StatusCard
        status={serverStatus}
        version={version}
        onToggle={handleToggleServer}
      />
      {serverStatus === 'running' && (
        <StatsGrid summary={summary} memStats={memStats} />
      )}
    </div>
  );
}
```

### 12.6 bundle-python.sh 构建脚本

```bash
#!/usr/bin/env bash
set -euo pipefail

# bundle-python.sh — 将 OpenViking 的 Python venv 打包到 Tauri Resources 目录
#
# 用法：在 OpenViking 根目录执行
#   bash scripts/bundle-python.sh
#
# 前置条件：已在 OpenViking 根目录执行过 uv sync --frozen

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_RESOURCES="$SCRIPT_DIR/../src-tauri/Resources/python"

echo "=== 打包 Python venv 到 Tauri Resources ==="
echo "项目根目录: $PROJECT_ROOT"
echo "目标目录:   $TAURI_RESOURCES"

# 1. 检查 venv 是否存在
if [ ! -d "$PROJECT_ROOT/.venv" ]; then
    echo "错误: .venv 目录不存在，请先执行 uv sync --frozen"
    exit 1
fi

# 2. 创建目标目录
rm -rf "$TAURI_RESOURCES"
mkdir -p "$TAURI_RESOURCES"

# 3. 复制 venv（排除 __pycache__ 和 .pyc 文件以减小体积）
echo "正在复制 venv（此操作可能需要几分钟）..."
rsync -a --info=progress2 \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='*.pyo' \
    "$PROJECT_ROOT/.venv/" "$TAURI_RESOURCES/"

echo "=== 打包完成 ==="
echo "Python venv 已复制到: $TAURI_RESOURCES"
```

### 12.7 实施步骤建议

| 步骤 | 内容 | 验证方式 |
|---|---|---|
| 1 | 创建 Tauri 项目骨架：`pnpm create tauri-app` 选择 React + TypeScript | `pnpm tauri dev` 能看到窗口 |
| 2 | 配置 `tauri.conf.json`（Section 12.1），设置窗口隐藏 + 托盘 | 窗口不可见但托盘图标出现 |
| 3 | 实现 `process.rs` — spawn/stop Python server | 点击启动后 `curl localhost:1933/health` 返回 200 |
| 4 | 实现 `tray.rs` — 托盘菜单 + 左键单击逻辑 | 托盘菜单可切换启停、打开仪表盘 |
| 5 | 实现前端 `Dashboard.tsx` + `StatusCard.tsx` | 仪表盘正确显示服务状态 |
| 6 | 实现前端 `StatsGrid.tsx` + `api.ts` | 仪表盘正确显示资源/记忆数量 |
| 7 | 实现配置表单 `ConfigPage.tsx` + 4 个子 Tab | 保存后 `~/.openviking/ov.conf` 内容正确 |
| 8 | 实现 `bundle-python.sh` + Tauri resources 打包 | `pnpm tauri build` 打包出 DMG |
| 9 | DMG 安装测试：干净 macOS 环境安装运行 | 首次启动生成默认 ov.conf、服务正常启动 |

---

## 13. 测试验证清单

- [ ] 在无 Python 环境的 macOS 上安装 DMG 后能正常启动
- [ ] 首次启动自动生成 `~/.openviking/ov.conf`
- [ ] 菜单栏图标正确反映服务状态（彩色/灰色/闪烁）
- [ ] 点击托盘菜单可启停服务
- [ ] 关闭仪表盘窗口后应用仍在后台运行
- [ ] 仪表盘正确显示健康状态、版本号、文件数、技能数、记忆数
- [ ] 配置表单保存后重启服务生效
- [ ] 端口被占用时给出明确错误提示
- [ ] 退出应用时服务被正常终止
