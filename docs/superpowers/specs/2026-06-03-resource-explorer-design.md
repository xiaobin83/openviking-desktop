# 资源管理器 — 设计文档

## 1. 概述

在 OpenViking Desktop 托盘菜单中新增"资源管理器"入口，打开独立的资源管理器窗口。窗口分为三面板布局（文件树 / 预览 / 检查器）+ 顶部工具条，通过 openviking-server 的 REST API 提供文件浏览、内容预览和搜索功能。

### 1.1 目标

- 托盘菜单新增"资源管理器"命令，打开独立窗口
- 左面板：树状文件浏览器，通过 filesystem API 获取数据
- 中面板：内容预览，支持纯文本和 Markdown 渲染
- 右面板：检查器，展示文件元信息或搜索结果
- 工具条：查找工具 + 面板切换开关，支持三种搜索模式（语义/内容/文件名）
- 文件树和检查器面板可通过工具条开关独立显隐，隐藏时预览区自动扩展

### 1.2 非目标

- 文件创建/删除/重命名/移动操作（后续版本）
- 图片/PDF/视频等二进制文件预览
- 拖拽排序或批量操作

---

## 2. 架构设计

### 2.1 窗口方案

采用**独立新窗口**方案：在 `tauri.conf.json` 中新增 `explorer` 窗口，与 `dashboard` 窗口独立并存，各自拥有独立的关闭拦截和生命周期。

```
Tray 菜单
  ├─ ● 服务运行中
  ├─ 启动服务 / 重启服务 / 关闭服务
  ├─ ──────────────
  ├─ 打开仪表盘        → dashboard 窗口
  ├─ 资源管理器        → explorer 窗口  ← 新增
  ├─ ──────────────
  └─ 退出
```

### 2.2 窗口内部布局

```
默认状态（三个面板全开）:
┌─────────────────────────────────────────────────────────┐
│  工具条  [☰ 树] [☷ 检查] │ [查找 ▼] [搜索框] [搜索]     │
├────────────┬──────────────────────┬──────────────────────┤
│  文件树     │  预览                 │  检查器               │
│  (220px)   │  (flex: 1)           │  (240px)             │
└────────────┴──────────────────────┴──────────────────────┘

隐藏文件树后（预览自动扩展）:
┌─────────────────────────────────────────────────────────┐
│  工具条  [☰ 树] [☷ 检查] │ [查找 ▼] [搜索框] [搜索]     │
├────────────────────────────────────┬──────────────────────┤
│  预览 (flex: 1)                    │  检查器 (240px)       │
└────────────────────────────────────┴──────────────────────┘

隐藏检查器后:
┌─────────────────────────────────────────────────────────┐
│  工具条  [☰ 树] [☷ 检查] │ [查找 ▼] [搜索框] [搜索]     │
├────────────┬──────────────────────────────────────────────┤
│  文件树     │  预览 (flex: 1)                              │
│  (220px)   │                                              │
└────────────┴──────────────────────────────────────────────┘

仅预览（两侧均隐藏）:
┌─────────────────────────────────────────────────────────┐
│  工具条  [☰ 树] [☷ 检查] │ [查找 ▼] [搜索框] [搜索]     │
├──────────────────────────────────────────────────────────┤
│  预览 (flex: 1)                                          │
└──────────────────────────────────────────────────────────┘
```

面板开关默认为开启状态，切换状态仅在当前窗口会话中生效（不持久化）。

### 2.3 组件树

```
ExplorerPage (顶层容器, 状态管理: showTree, showInspector)
├─ Toolbar
│   ├─ ToggleTreeButton   (切换文件树显隐)
│   ├─ ToggleInspectorButton (切换检查器显隐)
│   ├─ SearchButton       (点击展开/收起搜索栏)
│   ├─ SearchModeSelect   (下拉选择: 语义搜索/内容搜索/文件名)
│   ├─ SearchInput        (输入框)
│   └─ SearchSubmit       (提交按钮)
├─ FileTree (左面板, 受 showTree 控制显隐)
│   └─ TreeNode (递归渲染, 懒加载子节点)
├─ Preview (中面板, 自动扩展填充空间)
│   ├─ PlainTextViewer    (默认: <pre> 标签)
│   └─ MarkdownViewer     (.md 文件: marked 渲染)
└─ Inspector (右面板, 受 showInspector 控制显隐)
    ├─ FileDetail         (正常模式: fs/stat 返回的元信息)
    └─ SearchResults      (搜索模式: 搜索结果条目列表)
```

### 2.4 数据流

```
[FileTree] 点击节点
  ├─ uri → [Preview] 调用 content/read 获取内容并渲染
  └─ uri → [Inspector] 调用 fs/stat 获取元信息

[Toolbar] 点击查找按钮
  └─ Toolbar 展开搜索栏（SearchModeSelect + SearchInput + SearchSubmit）

[Toolbar] 提交搜索
  ├─ 根据模式调用对应 API:
  │   ├─ 语义搜索 → POST /api/v1/search/find
  │   ├─ 内容搜索 → POST /api/v1/search/grep
  │   └─ 文件名   → POST /api/v1/search/glob
  └─ 结果 → [Inspector] 切换为 SearchResults 模式

[Inspector/SearchResults] 点击条目
  ├─ uri → [FileTree] 逐级展开父路径并高亮目标节点
  └─ uri → [Preview] 加载内容
```

---

## 3. 使用的 API

所有 API 来自 openviking-server（`http://127.0.0.1:1933`），接口已就绪无需修改。

### 3.1 文件系统

| 端点 | 方法 | 用途 | 关键参数 |
|------|------|------|---------|
| `/api/v1/fs/tree` | GET | 获取目录树 | `uri`, `output=original`, `show_all_hidden` |
| `/api/v1/fs/ls` | GET | 列出目录内容 | `uri`, `simple=true` |
| `/api/v1/fs/stat` | GET | 获取资源状态（元信息） | `uri` |

### 3.2 内容

| 端点 | 方法 | 用途 | 关键参数 |
|------|------|------|---------|
| `/api/v1/content/read` | GET | 读取文件内容 | `uri`, `offset`, `limit` |

### 3.3 搜索

| 端点 | 方法 | 搜索模式 | 关键参数 |
|------|------|---------|---------|
| `/api/v1/search/find` | POST | 语义搜索 | `query`, `target_uri`, `limit` |
| `/api/v1/search/grep` | POST | 内容搜索 | `uri`, `pattern`, `case_insensitive` |
| `/api/v1/search/glob` | POST | 文件名匹配 | `pattern`, `uri` |

说明：`/api/v1/search/search` 与 `find` 功能重叠且需要 session 上下文，不在资源管理器中使用。

### 3.4 预览策略

根据文件 URI 的后缀决定渲染方式：

| 后缀 | 渲染方式 |
|------|---------|
| `.md` | Markdown 渲染（marked 库） |
| `.txt`, `.yaml`, `.yml`, `.json`, `.toml`, `.py`, `.rs`, `.ts`, `.js`, `.html`, `.css` 等 | 纯文本 `<pre>` 标签 |
| 其他 | 纯文本（兜底） |

---

## 4. 修改清单

### 4.1 Rust 层

#### tauri.conf.json — 新增 explorer 窗口

在 `app.windows` 数组中追加：

```json
{
  "label": "explorer",
  "title": "OpenViking 资源管理器",
  "width": 1100,
  "height": 680,
  "visible": false,
  "center": true,
  "resizable": true,
  "minWidth": 800,
  "minHeight": 500
}
```

#### capabilities/default.json — 权限扩展

`windows` 数组添加 `"explorer"`：

```json
{
  "windows": ["dashboard", "explorer"],
  ...
}
```

#### tray.rs — 新增菜单项和事件处理

在 `build_status_menu` 函数中，`dashboard_item` 之后、`quit_item` 之前添加：

```rust
let explorer_item = MenuItemBuilder::with_id("open_explorer", "资源管理器")
    .build(app)?;
```

菜单构建中插入：

```rust
MenuBuilder::new(app)
    .item(&status_item)
    .separator()
    .item(&start_item)
    .item(&restart_item)
    .item(&stop_item)
    .separator()
    .item(&dashboard_item)
    .item(&explorer_item)          // ← 新增
    .separator()
    .item(&quit_item)
    .build()
```

在 `handle_menu_event` 中添加：

```rust
"open_explorer" => {
    if let Some(window) = app.get_webview_window("explorer") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
```

#### lib.rs — 关闭拦截扩展

`on_window_event` 中将单窗口判断扩展为覆盖两个窗口：

```rust
.on_window_event(|window, event| {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let label = window.label();
        if label == "dashboard" || label == "explorer" {  // ← 扩展为 || "explorer"
            api.prevent_close();
            let _ = window.hide();
        }
    }
})
```

### 4.2 前端

#### src/lib/api.ts — 新增 API 函数

```typescript
// 文件系统
export async function getFsTree(uri: string): Promise<TreeNode[]>
export async function getFsLs(uri: string): Promise<string[]>
export async function getFsStat(uri: string): Promise<FileStat>

// 内容
export async function readContent(uri: string): Promise<string>

// 搜索
export async function searchFind(query: string, targetUri?: string): Promise<SearchResult[]>
export async function searchGrep(uri: string, pattern: string): Promise<SearchResult[]>
export async function searchGlob(pattern: string, uri?: string): Promise<SearchResult[]>
```

#### src/lib/types.ts — 新增类型定义

```typescript
export interface TreeNode {
  name: string;
  uri: string;
  is_dir: boolean;
  children?: TreeNode[];
}

export interface FileStat {
  uri: string;
  name: string;
  size: number;
  is_dir: boolean;
  created_at?: string;
  updated_at?: string;
  mime_type?: string;
}

export interface SearchResult {
  uri: string;
  name: string;
  score?: number;
  snippet?: string;
}

export type SearchMode = 'find' | 'grep' | 'glob';
```

#### src/components/explorer/ — 新增组件

| 文件 | 说明 | 关键 Props/State |
|------|------|-----------------|
| `ExplorerPage.tsx` | 顶层容器 | `selectedUri`, `searchMode`, `searchResults`, `showTree`, `showInspector` |
| `Toolbar.tsx` | 工具条 | `onSearch(mode, query)`, `searchExpanded`, `showTree`, `showInspector`, `onToggleTree`, `onToggleInspector` |
| `FileTree.tsx` | 文件树 | `onSelect(uri)`, `highlightUri` |
| `Preview.tsx` | 内容预览 | `uri`, 自动根据后缀切换渲染器 |
| `Inspector.tsx` | 检查器 | `uri`(正常模式), `searchResults`(搜索模式) |

#### src/main.tsx — 路由入口

两个窗口加载同一个 `index.html`，通过 `window.label` 判断渲染哪个页面：

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import ExplorerPage from "./components/explorer/ExplorerPage";
import "./App.css";
import "./lib/i18n";

const label = getCurrentWindow().label;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {label === "explorer" ? <ExplorerPage /> : <App />}
  </React.StrictMode>,
);
```

#### package.json — 新增依赖

```json
{
  "dependencies": {
    "marked": "^15.0.0"
  }
}
```

### 4.3 国际化

在 `src/locales/zh.json` 新增：

```json
{
  "explorer": {
    "title": "资源管理器",
    "toolbar": {
      "search": "查找",
      "toggleTree": "文件树",
      "toggleInspector": "检查器",
      "searchPlaceholder": "输入搜索内容...",
      "searchMode": {
        "find": "语义搜索",
        "grep": "内容搜索",
        "glob": "文件名"
      }
    },
    "tree": {
      "title": "文件树",
      "loading": "加载中..."
    },
    "preview": {
      "title": "预览",
      "noSelection": "请在左侧选择文件",
      "unsupported": "不支持预览此文件类型"
    },
    "inspector": {
      "title": "检查器",
      "type": "类型",
      "size": "大小",
      "modified": "修改时间",
      "searchResults": "搜索结果",
      "noResults": "未找到匹配结果"
    }
  }
}
```

---

## 5. 错误处理

| 场景 | 处理方式 |
|------|---------|
| 服务未启动时打开资源管理器 | 窗口正常打开，树显示"服务未连接"，API 调用失败静默处理 |
| 文件树加载失败 | 对应节点显示错误图标 + tooltip |
| 内容读取失败 | 预览区显示错误提示"No content available" |
| 搜索无结果 | Inspector 显示"未找到匹配结果" |
| 搜索 API 错误 | Inspector 显示错误信息，保留上次结果 |
| 文件过大 | content/read 支持 `offset`/`limit` 分页，预览区显示前 N 行 + "文件过大，仅显示前 1000 行" |

---

## 6. 决策记录

| 决策点 | 选项 | 选择 | 理由 |
|--------|------|------|------|
| 窗口方案 | 新窗口 / 新 Tab | 新窗口 | 独立生命周期，可同时查看仪表盘和资源管理器 |
| 搜索模式 | 下拉切换 / 统一入口 | 下拉切换 | API 参数差异大，精确控制搜索策略 |
| Markdown 渲染 | marked / react-markdown / markdown-it | marked | 最轻量（~50KB gzip），零 React 依赖 |
| 状态管理 | useState / zustand / context | useState (ExplorerPage) | 组件层级浅，无需引入额外库 |

---

## 7. 界面设计指引

- 实施阶段需主动使用 `Use Skill: frontend-design` 技能生成界面代码
- 风格参考现有 Dashboard 页面：深色主题（`bg-surface`、`border-border-subtle`、`text-text-primary` 等语义色）、Aurora 蓝作为强调色
- 整体为技术风（technical aesthetic），使用等宽字体 JetBrains Mono 渲染代码/文件内容
- 复用项目已有的 Tailwind CSS v4 自定义色彩体系（`aurora-400`/`aurora-500`/`aurora-600`、`surface`、`surface-elevated` 等）
- 面板间使用 `border-border-subtle` 分隔线，保持与 Dashboard 一致的视觉语言

## 8. 验证要点

- [ ] 托盘菜单出现"资源管理器"菜单项，点击后打开新窗口
- [ ] 窗口关闭后隐藏到后台（不退出），可通过托盘再次打开
- [ ] 左面板树正确展开/折叠，点击节点后中面板加载内容
- [ ] `.md` 文件使用 Markdown 渲染，其他文件使用纯文本
- [ ] 右面板显示当前选中文件的元信息（类型、大小、时间）
- [ ] 查找按钮展开搜索栏，可切换三种搜索模式
- [ ] 语义搜索返回匹配文件，grep 返回内容匹配文件，glob 返回文件名匹配
- [ ] 点击搜索结果条目后，左面板树定位到对应节点
- [ ] 服务未运行时树显示"服务未连接"状态
- [ ] 仪表盘窗口和资源管理器窗口可同时打开，互不影响
- [ ] 工具条"文件树"开关可切换左面板显隐，隐藏后预览区自动扩展
- [ ] 工具条"检查器"开关可切换右面板显隐，隐藏后预览区自动扩展
- [ ] 两侧面板均隐藏时，预览区占满全宽
- [ ] 面板开关默认为开启状态，重新打开窗口后恢复默认
