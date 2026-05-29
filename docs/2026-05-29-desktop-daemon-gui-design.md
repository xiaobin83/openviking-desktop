# OpenViking Desktop Daemon GUI — 设计文档

## 1. 概述与目标

### 1.1 项目定位

面向非开发者的 OpenViking 桌面守护进程应用。用户安装后无需配置任何开发环境，即可在本地运行 OpenViking Server，并获得图形化管理能力。

### 1.2 核心目标

| 目标 | 说明 |
|---|---|
| 零环境依赖 | 打包时预构建完整 Python venv，用户无需安装 Python 或任何依赖 |
| 独立分发 | 以 macOS DMG 格式独立分发 |
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
│  │              │          │  fs 文件访问       │            │
│  └──────┬───────┘          └────────┬─────────┘            │
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
- 直接复用 openviking-server 全部 REST API 端点
- 新增前端功能无需修改 Rust 代码
- 符合 Tauri "轻量壳 + Web 内容" 的设计哲学

### 2.2 技术栈

| 层 | 技术 | 版本要求 |
|---|---|---|
| 桌面框架 | Tauri v2 | `tauri = "2"`, Rust edition 2021 |
| 前端框架 | React 18 + TypeScript 5 | `react@^18`, `typescript@^5` |
| CSS | Tailwind CSS v4 | `tailwindcss@^4` |
| 构建 | Vite 6 | `vite@^6` |
| Tauri CLI | `@tauri-apps/cli` v2 | `npm create tauri-app@latest` |
| Python 环境 | uv + 预构建 venv | Python 3.12, uv 最新版 |
| 服务端 | openviking-server (FastAPI) | 通过 PyPI 安装，REST API 提供数据服务 |
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
- 左键单击托盘图标：切换仪表盘窗口的显示/隐藏

### 3.2 仪表盘窗口

窗口顶部包含两个 Tab（通过顶部按钮切换）：

**概览 Tab**：
- 服务状态卡片：运行中/已停止/启动中/异常，版本号
- 资源数量：文件数、技能数
- 记忆数量：记忆总数、按类别分布
- 每 10 秒自动刷新

**配置 Tab**：
- 四个子 Tab：基础 / AI 模型 / 存储 / 高级
- 加载时通过 Tauri IPC 读取 `~/.openviking/ov.conf`
- 表单式配置，保存后写入 ov.conf
- 保存后弹出"配置已保存，需重启服务生效"提示

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
- Web 前端通过 Tauri `invoke("read_config")` / `invoke("write_config")` 间接读写，Rust 端使用 `std::fs` 操作文件
- 读取：页面加载时 invoke → Rust 读取 ov.conf → 返回 JSON 字符串 → 前端 `JSON.parse()`
- 写入：点击"保存"时将表单数据序列化为 JSON → `invoke("write_config", { config: jsonStr })` → Rust 端写入文件
- 校验：保存前前端进行字段类型校验（number 字段不是 NaN，string 字段非空等），字段非法时高亮提示
- 错误恢复：若 ov.conf JSON 格式错误，前端显示红色横幅并提供"重置为默认配置"按钮

---

## 5. 项目结构

```
./
├── scripts/
│   └── bundle-python.sh        # 构建阶段脚本：创建 venv 并安装 openviking
│
├── resources/
│   └── python/                  # 预构建 Python venv（gitignored，构建时生成）
│       ├── bin/
│       │   ├── python3          # Python 3.12 解释器
│       │   └── pip              # pip 包管理器
│       └── lib/
│           └── python3.12/
│               └── site-packages/
│                   └── openviking/  # + 所有依赖
│
├── src-tauri/                  # Tauri Rust 核心
│   ├── Cargo.toml              # Rust 依赖声明
│   ├── tauri.conf.json         # Tauri 配置（见 Section 12.1）
│   ├── build.rs                # Tauri 构建脚本
│   ├── Resources/
│   │   └── python -> ../../resources/python  # 符号链接
│   ├── capabilities/
│   │   └── default.json        # 权限声明（见 Section 12.3）
│   ├── icons/
│   │   └── icon.png            # 应用图标 (1024x1024 PNG)
│   │   └── icon.icns           # macOS .icns 图标
│   └── src/
│       ├── main.rs             # 入口：创建 Tauri app（见 Section 12.4.1）
│       ├── lib.rs              # Tauri IPC 命令注册、ServerState 管理（见 Section 12.4.2）
│       ├── process.rs          # Python sidecar 进程管理（见 Section 12.4.3）
│       └── tray.rs             # 菜单栏托盘管理（见 Section 12.4.4）
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
│   │   ├── api.ts              # REST API 封装（见 Section 12.5.1）
│   │   └── types.ts            # TypeScript 类型定义（HealthResponse, OvConfig 等）
│   └── vite-env.d.ts           # Vite 环境类型声明
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
        → Python 路径解析（dev/prod 降级）
          dev:     resources/python/bin/python3
          symlink: Resources/python/bin/python3  (符号链接)
          prod:    {app_resource_dir}/python/bin/python3
        → 检查 python 文件存在性
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
    → invoke("get_server_status")              → 当前状态
    → GET /health                               → healthy 状态 + version
    → GET /api/v1/console/dashboard/summary     → context_counts + today_tokens
    → GET /api/v1/stats/memories                → total_memories + by_category
    → 将数据聚合后渲染 StatusCard + StatsGrid
    → 每 10 秒自动刷新一次
```

**错误降级**：若 dashboard/summary 返回 `{"enabled": false}`，StatsGrid 仅显示记忆统计（来自 `/api/v1/stats/memories`），文件/技能数显示为 "—"。

**配置保存流程**：
```
用户填写表单 → 点击"保存配置"
    → Web 前端序列化表单数据 → 构建 ov.conf JSON 字符串
    → 字段类型校验（number 不为 NaN，string 不为空）
    → invoke("write_config", { config: jsonStr })
    → Rust 端：
        → 确保 ~/.openviking/ 目录存在
        → fs::write(ov_conf_path, &config)
        → 返回 { success: true }
    → Web 前端弹出提示："配置已保存，需重启服务生效"
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
[1] 创建 venv + 安装 openviking（在项目根目录执行）
    bash scripts/bundle-python.sh
    → uv venv --python 3.12 resources/python/
    → uv pip install openviking
    → 清理 __pycache__
        ↓
[2] 构建前端（在项目根目录执行）
    pnpm install
    pnpm build
    → tsc --noEmit && vite build → dist/
        ↓
[3] Tauri 打包
    pnpm tauri build
    → cargo build --release（Rust 后端）
    → 复制 Resources/python/**/* 进 app bundle
    → 签名 + DMG 打包
        ↓
[4] 产物
    src-tauri/target/release/bundle/dmg/OpenViking_0.1.0_aarch64.dmg
```

### 8.2 DMG 内容结构

```
OpenViking.app/
├── Contents/
│   ├── MacOS/
│   │   └── openviking-desktop     # Tauri 编译的 Rust 二进制
│   ├── Resources/
│   │   ├── python/                 # 预构建 Python venv
│   │   │   ├── bin/
│   │   │   │   └── python3        # Python 3.12 解释器
│   │   │   └── lib/
│   │   │       └── python3.12/
│   │   │           └── site-packages/
│   │   │               └── openviking/  # + 所有依赖
│   │   ├── index.html              # 前端入口
│   │   ├── assets/                 # Vite 打包产物
│   │   └── icons/                  # 应用图标
│   ├── Frameworks/                 # Tauri WebView 依赖
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
| Python venv 工具 | python venv / uv / virtualenv | uv | 更快的创建速度，避免 Python 3.14 ensurepip 兼容问题 |
| openviking 安装方式 | PyPI / 复制 .venv | PyPI pip install | 从 PyPI 安装，构建流程简洁 |

---

## 12. 实施参考（Implementation Reference）

> 本章节提供与实际实现一致的配置和代码。实施 agent 可直接参考。

### 12.1 tauri.conf.json

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-cli/schema.json",
  "productName": "OpenViking",
  "version": "0.1.0",
  "identifier": "com.openviking.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "beforeDevCommand": "pnpm dev"
  },
  "app": {
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
- `"resources"` — 将 `Resources/python/**/*` 目录打包进 app bundle
- `"identifier"` — macOS bundle identifier，确保唯一性
- `devUrl` 使用端口 1420（Vite 默认 5173，此处为 Tauri 创建项目时的配置）

### 12.2 package.json

```json
{
  "name": "openviking-desktop",
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

### 12.4 Rust 代码

#### 12.4.1 Cargo.toml

```toml
[package]
name = "openviking-desktop"
version = "0.1.0"
edition = "2021"

[lib]
name = "openviking_desktop_lib"
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
dirs = "6"
```

#### 12.4.2 main.rs — 入口

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    openviking_desktop_lib::run()
}
```

#### 12.4.3 lib.rs — Tauri IPC 命令注册

```rust
use tauri::Manager;
use std::sync::Mutex;
use std::process::Child;

mod process;
mod tray;

pub struct ServerState {
    pub child: Mutex<Option<Child>>,
    pub status: Mutex<String>,
    pub port: Mutex<u16>,
    pub python_path: String,
    pub ov_conf_path: String,
    pub server_log_path: String,
}

impl Drop for ServerState {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.child.try_lock() {
            if let Some(ref mut child) = *guard {
                log::info!("ServerState::drop: killing openviking-server");
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[tauri::command]
async fn get_server_status(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    Ok(state.status.lock().unwrap().clone())
}

#[tauri::command]
async fn start_server(state: tauri::State<'_, ServerState>, app: tauri::AppHandle) -> Result<String, String> {
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
            // Python 路径解析：dev / symlink / prod 三级降级
            let python_path = {
                let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
                let root_dir = manifest_dir.parent().unwrap_or(manifest_dir);
                let dev_path = root_dir.join("resources/python/bin/python3");
                let symlink_path = manifest_dir.join("Resources/python/bin/python3");
                let resource_dir = app.path().resource_dir()
                    .expect("failed to resolve resource dir");
                let prod_path = resource_dir.join("python/bin/python3");
                if dev_path.exists() { dev_path }
                else if symlink_path.exists() { symlink_path }
                else { prod_path }
            }.to_string_lossy().to_string();
            log::info!("Python path: {}", python_path);

            let home = dirs::home_dir().expect("no home dir");
            let ov_conf_path = home
                .join(".openviking/ov.conf")
                .to_string_lossy()
                .to_string();
            let server_log_path = home
                .join("Library/Logs/OpenViking/server.log")
                .to_string_lossy()
                .to_string();

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

            tray::create_tray(app.handle())?;

            // 自动生成默认 ov.conf（若不存在）
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
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if app_handle.try_state::<ServerState>().is_some() {
                    let _ = process::spawn_server_with_app_handle(&app_handle).await;
                }
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
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "dashboard" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<ServerState>() {
                    let mut child_opt = state.child.lock().unwrap();
                    if let Some(ref mut c) = *child_opt {
                        log::info!("Killing openviking-server on RunEvent::Exit");
                        let _ = c.kill();
                        let _ = c.wait();
                    }
                    *child_opt = None;
                }
            }
        });
}
```

关键差异说明（相比设计初版）：
- **`Drop` impl** for `ServerState` — 确保 ServerState 析构时终止子进程
- **Python 路径三级降级** — `dev_path` (resources/python/) → `symlink_path` (Resources/python/) → `prod_path` (app bundle 内 resource dir)
- **`build()` + `run()` 模式** — 分离构建和运行，在 `RunEvent::Exit` 中清理子进程
- **`spawn_server_with_app_handle`** — 从 AppHandle 获取 ServerState 的便捷包装

#### 12.4.4 process.rs — 进程管理器

```rust
use std::process::{Command, Stdio};
use std::fs::File;
use tauri::{AppHandle, Emitter, Manager};
use crate::ServerState;

pub async fn spawn_server_with_app_handle(
    app: &AppHandle,
) -> Result<String, String> {
    let state = app.state::<ServerState>();
    spawn_server(&state, app).await
}

pub async fn spawn_server(
    state: &ServerState,
    app: &AppHandle,
) -> Result<String, String> {
    let python_path = &state.python_path;
    if !std::path::Path::new(python_path).exists() {
        *state.status.lock().unwrap() = "error".to_string();
        let _ = app.emit("server-status-changed", "error");
        return Err("Python 环境未找到".to_string());
    }

    {
        let child = state.child.lock().unwrap();
        if child.is_some() {
            return Err("服务已在运行".to_string());
        }
    }

    *state.status.lock().unwrap() = "starting".to_string();
    let _ = app.emit("server-status-changed", "starting");

    let port = *state.port.lock().unwrap();

    let log_file = File::create(&state.server_log_path)
        .map_err(|e| format!("无法创建日志文件: {}", e))?;

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

    let health_port = *state.port.lock().unwrap();
    let app_for_health = app.clone();

    tokio::spawn(async move {
        let url = format!("http://127.0.0.1:{}/health", health_port);
        let client = reqwest::Client::new();
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(30);

        loop {
            if start.elapsed() > timeout {
                if let Some(s) = app_for_health.try_state::<ServerState>() {
                    *s.status.lock().unwrap() = "timeout".to_string();
                }
                let _ = app_for_health.emit("server-status-changed", "timeout");
                break;
            }

            match client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Some(s) = app_for_health.try_state::<ServerState>() {
                        *s.status.lock().unwrap() = "running".to_string();
                    }
                    let _ = app_for_health.emit("server-status-changed", "running");
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

关键差异：
- **`spawn_server_with_app_handle`** — 新增便捷函数，从 AppHandle 中提取 ServerState
- **`try_state` 代替 unsafe 指针** — health 轮询中使用 `try_state::{ServerState}()` 安全获取状态

#### 12.4.5 tray.rs — 菜单栏托盘

```rust
use tauri::{
    AppHandle, Emitter, Manager, Runtime,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
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
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "toggle_server" => {
                    let _ = app.emit::<bool>("tray-toggle-server", true);
                }
                "open_dashboard" => {
                    if let Some(window) = app.get_webview_window("dashboard") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    log::info!("Quit requested from tray menu");
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event {
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

关键差异：
- **`show_menu_on_left_click(false)`** — 左键不显示菜单，用于左键单击切换窗口
- **`MouseButtonState::Up`** — 只在鼠标释放时触发，避免双击误触

### 12.5 前端代码

#### 12.5.1 api.ts — REST API 封装

```typescript
import type { HealthResponse, DashboardSummary, MemoryStats, ApiResponse } from './types';

const BASE_URL = 'http://127.0.0.1:1933';

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
    return null;
  }
}

export async function getMemoryStats(): Promise<MemoryStats> {
  return fetchApi<MemoryStats>('/api/v1/stats/memories');
}
```

#### 12.5.2 types.ts — TypeScript 类型定义

```typescript
export interface HealthResponse {
  status: string;
  healthy: boolean;
  version: string;
}

export interface DashboardSummary {
  context_counts: {
    files: number;
    skills: number;
    memories: number;
    total: number;
  };
  today_tokens?: { input: number; output: number };
  today_retrievals?: { count: number };
}

export interface MemoryStats {
  total_memories: number;
  by_category: Record<string, number>;
}

export interface ApiResponse<T> {
  status: string;
  result?: T;
  error?: { code: string; message: string };
}

export interface OvConfig {
  server: {
    host: string;
    port: number;
    auth_mode?: string | null;
    cors_origins?: string[];
    observability?: {
      metrics?: { enabled?: boolean };
    };
  };
  storage: {
    workspace: string;
    vectordb: { backend: string };
    agfs: { backend: string };
  };
  embedding: {
    model: string;
    base_url?: string | null;
    api_key?: string | null;
  };
  llm: {
    model: string;
    base_url?: string | null;
    api_key?: string | null;
  };
  vlm: {
    model?: string | null;
    base_url?: string | null;
    api_key?: string | null;
  };
  retrieval: {
    top_k: number;
    threshold: number;
  };
  encryption: {
    enabled: boolean;
  };
  log: {
    level: string;
  };
}
```

#### 12.5.3 Dashboard.tsx — 仪表盘组件

```tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { checkHealth, getDashboardSummary, getMemoryStats } from '../../lib/api';
import type { DashboardSummary, MemoryStats } from '../../lib/types';
import StatusCard from './StatusCard';
import StatsGrid from './StatsGrid';

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
    invoke<string>('get_server_status').then(setServerStatus).catch(() => {});
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
    <div className="space-y-6">
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

# bundle-python.sh — 创建全新 Python venv 并安装 openviking，打包到 resources 目录
#
# 用法：
#   bash scripts/bundle-python.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_RESOURCES="$SCRIPT_DIR/../resources/python"

echo "=== 打包 Python venv 到 resources ==="
echo "项目根目录:   $PROJECT_ROOT"
echo "目标目录:     $TAURI_RESOURCES"

# 1. 创建目标目录（全新 venv）
rm -rf "$TAURI_RESOURCES"

# 2. 用 uv 创建虚拟环境（Python 3.12）
echo "正在创建虚拟环境..."
uv venv --python 3.12 "$TAURI_RESOURCES"

# 3. 安装 openviking 及其依赖（从 PyPI）
echo "正在安装 openviking 及其依赖（此操作可能需要几分钟）..."
uv pip install --python "$TAURI_RESOURCES" --quiet openviking

# 4. 清理：删除 __pycache__、.pyc、.pyo 文件以减小体积
echo "正在清理缓存文件..."
find "$TAURI_RESOURCES" -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
find "$TAURI_RESOURCES" -type f -name '*.pyc' -delete
find "$TAURI_RESOURCES" -type f -name '*.pyo' -delete

echo "=== 打包完成 ==="
echo "Python venv 已创建并安装 openviking 到: $TAURI_RESOURCES"
```

设计决策：
- **使用 uv** 替代 `python3 -m venv`：Homebrew 的 Python 3.14 有 `libexpat` 兼容问题导致 `ensurepip` 失败，uv 独立管理 venv 创建，更稳定、更快
- **从 PyPI 安装 openviking**：构建流程简洁，无需额外构建步骤
- **Python 3.12**：显式指定避免使用系统默认的 Python 3.14

### 12.7 Resources 符号链接

Tauri 的 `bundle.resources` 配置打包 `Resources/python/**/*` 目录。为在开发阶段也能访问 venv，需在 `src-tauri/Resources/` 下创建符号链接指向 `resources/python`：

```bash
cd src-tauri/Resources
ln -s ../../resources/python python
```

这样 `tauri.conf.json` 中的 `resources: ["Resources/python/**/*"]` 在开发和生产阶段均有效：
- **开发时**：符号链接 `Resources/python → ../../resources/python`
- **打包时**：Tauri 解析符号链接，将目标目录内容复制到 app bundle

### 12.8 实施步骤建议

| 步骤 | 内容 | 验证方式 |
|---|---|---|
| 1 | 创建 Tauri 项目骨架：`pnpm create tauri-app` 选择 React + TypeScript | `pnpm tauri dev` 能看到窗口 |
| 2 | 配置 `tauri.conf.json`（Section 12.1），设置窗口隐藏 + 托盘 | 窗口不可见但托盘图标出现 |
| 3 | 创建 `resources/` 符号链接（Section 12.7） | `ls -la src-tauri/Resources/python` |
| 4 | 实现 `bundle-python.sh`（Section 12.6），打包 venv | `bash scripts/bundle-python.sh` 运行成功 |
| 5 | 实现 `process.rs` — spawn/stop Python server（Section 12.4.4） | 点击启动后 `curl localhost:1933/health` 返回 200 |
| 6 | 实现 `tray.rs` — 托盘菜单 + 左键单击逻辑（Section 12.4.5） | 托盘菜单可切换启停、打开仪表盘 |
| 7 | 实现 `lib.rs` — Python 路径三级降级 + 自动启动（Section 12.4.3） | 应用启动后服务自动运行 |
| 8 | 实现前端 `Dashboard.tsx` + `StatusCard.tsx`（Section 12.5.3） | 仪表盘正确显示服务状态 |
| 9 | 实现前端 `StatsGrid.tsx` + `api.ts` + `types.ts`（Section 12.5.1-2） | 仪表盘正确显示资源/记忆数量 |
| 10 | 实现配置表单 `ConfigPage.tsx` + 4 个子 Tab | 保存后 `~/.openviking/ov.conf` 内容正确 |
| 11 | DMG 构建测试：`pnpm tauri build` | 产物 `OpenViking_0.1.0_aarch64.dmg` 约 148MB |
| 12 | DMG 安装测试：干净 macOS 环境安装运行 | 首次启动生成默认 ov.conf、服务正常启动 |

---

## 13. 测试验证清单

- [ ] 在无 Python 环境的 macOS 上安装 DMG 后能正常启动
- [ ] 首次启动自动生成 `~/.openviking/ov.conf`
- [ ] 菜单栏图标正确反映服务状态（彩色/灰色/闪烁）
- [ ] 左键单击托盘图标切换仪表盘窗口显示/隐藏
- [ ] 点击托盘菜单可启停服务
- [ ] 关闭仪表盘窗口后应用仍在后台运行
- [ ] 仪表盘正确显示健康状态、版本号、文件数、技能数、记忆数
- [ ] 配置表单保存后重启服务生效
- [ ] 端口被占用时给出明确错误提示
- [ ] 应用退出时服务被正常终止
