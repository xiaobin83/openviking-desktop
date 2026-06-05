# Embedding 模型变更独立流程设计文档

Date: 2026-06-06
Status: 待审批

## 目标

将 Embedding 模型配置从 AI 配置页面移除，改为通过独立的 "更改 Embedding 模型" 流程进行变更。变更后自动执行 停止服务 → 删除向量库 → 保存配置 → 重启服务 的重建流程，确保切换 embedding 模型后向量库与模型一致。

## 背景

- 当前 AI 配置页面（AITab）的 Dense Embedding 组直接暴露 8 个配置字段，用户可随意修改
- 更改 embedding 模型（provider、model、dimension 等）会导致现有向量库数据与模型不匹配，造成静默错误
- 向量库目录路径为 `{storage.workspace}/vectordb/`（默认 workspace 为 `./data`，即 `./data/vectordb/`），删除后重启服务会自动重建
- 当前 `stop_server` 通过 `kill(-pid, SIGKILL)` 杀死进程组（Unix），可处理主服务（port 1933）和 vikingbot（port 18790）的子进程

## 设计

### AI 配置页面变更

#### Dense Embedding 组 → 只读摘要卡片

移除 8 个可编辑字段，替换为只读信息展示 + 操作按钮：

**只读展示内容：**
- Provider：当前 `embedding.dense.provider` 值
- Model：当前 `embedding.dense.model` 值
- Dimension：当前 `embedding.dense.dimension` 值

**按钮：** "更改 Embedding 模型"（Change Embedding Model）

**按钮状态：**
- 默认：正常可点击
- 重建执行中：disabled + loading 图标

#### 保留的配置组

| 配置组 | 状态 |
|--------|------|
| Dense Embedding | 改为只读摘要卡片 + 按钮 |
| Embedding Settings（max_concurrent, max_retries） | 不变 |
| Circuit Breaker | 不变 |
| VLM | 不变 |

### Modal 流程：更改 Embedding 模型

#### 状态机

```
[打开 Modal] → edit
edit → [点击"保存并重建"] → confirm
edit → [点击"取消" / 点遮罩关闭] → 关闭（丢弃变更）
confirm → [点击"上一步"] → edit
confirm → [点击"取消"] → 关闭（丢弃变更）
confirm → [点击"确认重建"] → executing
executing → [全部完成] → 显示完成 → [点击"完成"] → 关闭 + 刷新 AI 页面摘要
executing → [某步失败] → 显示错误，停留 executing（提供 Retry / Cancel）
```

#### Step 1：编辑（edit）

- 从当前 `config.embedding.dense` 深拷贝到 Modal 本地 state
- 展示 8 个 Dense Embedding 字段（复用现有 ConfigField 渲染逻辑）：
  - `provider`（select）
  - `api_base`（string，remote 时显示）
  - `api_key`（password，remote 时显示）
  - `model`（string）
  - `dimension`（number，remote 时显示）
  - `input`（select，remote 时显示）
  - `batch_size`（number，remote 时显示）
  - `model_path`（string，始终显示）
- 字段可见性根据 provider 动态切换（同现有 AITab 逻辑，移入 Modal）
- 顶部显示警告横幅：修改 embedding 模型需要重建向量库
- 按钮：Cancel / Save & Rebuild
- 用户未修改任何字段时，Save & Rebuild 按钮 disabled

#### Step 2：确认（confirm）

- 操作预览列表（红色警告卡片）：
  1. 停止 OpenViking 服务
  2. 删除向量数据库
  3. 保存新配置
  4. 重启服务
- 变更差异对比（diff 视图）：显示修改前 → 修改后的字段值
- 按钮：Back / Cancel / Confirm Rebuild（红色）

#### Step 3：执行（executing）

5 步顺序执行，每步完成后更新进度 UI：

| 步骤 | 操作 | 成功 | 失败处理 |
|------|------|------|----------|
| 1 | 停止服务（调用 `stop_server`） | ✓ | 服务未运行 → 跳过 |
| 2 | 验证端口释放（server_port + 18790） | ✓ | 检测端口占用 → 等待 1s 重试 × 3 → 仍占用则主动 `kill -9`（Unix）/ `taskkill`（Windows）→ 再验证一次 → 仍失败则显示错误 + Retry |
| 3 | 删除向量库目录 | ✓ | 目录不存在 → 跳过；权限不足 → 错误 + Retry |

**向量库目录路径解析：** `{storage.workspace}/vectordb/`，其中 `storage.workspace` 从当前配置中读取（默认 `./data`）。Rust 端提供 `resolve_vectordb_path` 命令，展开 `~` 和相对路径后返回绝对路径。
| 4 | 保存配置（写入 `ov.conf`） | ✓ | 写入失败 → 错误 + Retry |
| 5 | 启动服务（调用 `start_server`） | ✓ | 启动失败 → 错误 + 手动指引（配置已保存） |

**进度 UI：** 每步显示 ✓（成功）/ ⟳（进行中）/ ○（待执行）/ ✕（失败），失败时显示错误详情。

**失败恢复：**
- Retry：从失败步骤重新执行
- Cancel：关闭 Modal，保留已完成步骤的状态

#### Step 4：完成（complete）

- 绿色勾 + "Embedding 模型已更新" 提示
- 按钮：Done → 关闭 Modal，AI 页面摘要卡片刷新为新配置值

### 数据流与状态管理

#### Modal 本地状态

```typescript
// Modal 内部 state
const [step, setStep] = useState<'edit' | 'confirm' | 'executing' | null>('edit');
const [localDense, setLocalDense] = useState<DenseEmbeddingConfig>(deepClone(config.embedding.dense));
const [stepResults, setStepResults] = useState<StepResult[]>([]);
const [error, setError] = useState<string | null>(null);
```

- Modal 打开时深拷贝当前配置，编辑期间不修改全局 config
- 仅在 executing 阶段步骤 4 时通过父组件 `onChange` 写回全局 config

#### Rebuild State File

防止执行中关闭应用导致状态丢失。

- 路径：`<ov.conf 所在目录>/rebuild_lock.json`
- 内容：`{ "status": "in_progress", "target_config_hash": "...", "timestamp": "..." }`
- 生命周期：
  - executing 开始前（步骤 1 之前）写入
  - executing 全部成功后（步骤 5 完成）删除
- 启动检测：应用启动时检查此文件
  - 存在 → Dashboard 显示警告横幅："上次 embedding 模型重建未完成，向量库可能过期。建议删除向量库后重启服务。" + "执行重建"按钮（打开 Modal）

### 端口验证与清理

停服后确保 `127.0.0.1:{server_port}` 和 `127.0.0.1:18790` 都释放（server_port 从 `config.server.port` 读取，默认 1933；18790 为 vikingbot 默认端口）：

1. TCP connect 检测端口占用（3 次 × 1s 间隔）
2. 仍占用 → 主动清理：

   **Unix:**
   ```bash
   lsof -ti :1933 | xargs kill -9
   lsof -ti :18790 | xargs kill -9
   ```

   **Windows:**
   ```cmd
   for /f "tokens=5" %a in ('netstat -ano ^| findstr :1933') do taskkill /F /PID %a
   for /f "tokens=5" %a in ('netstat -ano ^| findstr :18790') do taskkill /F /PID %a
   ```

3. 清理后再次验证，仍失败 → 报错

### 边界情况

| 场景 | 处理 |
|------|------|
| 服务已停止时点击按钮 | 步骤 1 跳过，从步骤 2 开始 |
| 向量库目录不存在 | 步骤 3 跳过，不报错 |
| 用户未修改任何字段 | Confirm 阶段 diff 为空，"保存并重建"按钮 disabled |
| Modal 打开时切换 Tab | Modal 保持打开（遮罩层阻止交互） |
| 执行中关闭应用 | rebuild_lock.json 保留，下次启动检测到 → Dashboard 警告横幅 |
| provider local → remote 切换 | 同现有逻辑：删除 dimension/batch_size（local）或注入默认值（remote），逻辑从 AITab 移到 Modal |
| provider remote → local 切换 |
| Windows 非进程组 kill | 步骤 1 的 `kill_child` 仅 kill 父进程，步骤 2 的端口清理兜底 |

### 涉及文件

| 文件 | 变更 |
|------|------|
| `src/lib/types.ts` | 无需变更 |
| `src/lib/config-fields.ts` | Dense Embedding 字段标记 `hidden: true`（从 AI tab 移除渲染）；新增只读摘要的展示字段定义 |
| `src/components/config/AITab.tsx` | 移除 Dense Embedding 组渲染 + provider 切换逻辑；新增只读摘要卡片 + "更改 Embedding 模型" 按钮 |
| **新建** `src/components/config/EmbeddingModal.tsx` | Modal 组件：三态管理（edit/confirm/executing）、本地表单、差异对比、进度展示、端口验证、状态文件管理 |
| `src-tauri/src/lib.rs` | 新增 Tauri commands：`resolve_vectordb_path()`（解析 `{workspace}/vectordb/` 绝对路径）、`delete_vectordb(path)`、`check_port(port)`、`kill_port_process(port)`、`read_rebuild_lock()`、`write_rebuild_lock()`、`delete_rebuild_lock()`；保持现有命令不变 |
| `src-tauri/src/process.rs` | 可选：抽取端口验证逻辑为独立函数 |
| `src/lib/api.ts` | 新增 invoke 封装：`deleteVectordb`、`checkPort`、`killPortProcess`、`readRebuildLock`、`writeRebuildLock`、`deleteRebuildLock` |
| `src/components/dashboard/Dashboard.tsx` | 新增 `rebuild_lock.json` 启动检测 + 警告横幅 |
| `src/locales/zh.json` | 新增 i18n key |
| `src/locales/en.json` | 新增 i18n key |

### i18n 新增 Key

| Key | 中文 | English |
|-----|------|---------|
| `ai.change_embedding` | 更改 Embedding 模型 | Change Embedding Model |
| `ai.current_embedding` | 当前 Embedding 配置 | Current Embedding |
| `embedding_modal.title` | 更改 Embedding 模型 | Change Embedding Model |
| `embedding_modal.warning` | 修改 embedding 模型需要重建向量数据库，现有向量数据将丢失。 | Changing the embedding model requires rebuilding the vector database. Existing vectors will be lost. |
| `embedding_modal.save_rebuild` | 保存并重建 | Save & Rebuild |
| `embedding_modal.confirm_rebuild` | 确认重建 | Confirm Rebuild |
| `embedding_modal.confirm_warning` | 此操作将执行以下步骤： | This action will: |
| `embedding_modal.changes` | 变更 | Changes |
| `embedding_modal.no_changes` | 无变更 | No changes |
| `embedding_modal.step_stop` | 停止服务 | Stopping service |
| `embedding_modal.step_verify_port` | 验证端口释放 | Verifying port release |
| `embedding_modal.step_delete_db` | 删除向量数据库 | Deleting vector database |
| `embedding_modal.step_save_config` | 保存配置 | Saving configuration |
| `embedding_modal.step_start` | 启动服务 | Starting service |
| `embedding_modal.success` | Embedding 模型已更新 | Embedding model updated |
| `embedding_modal.success_desc` | 向量库已使用新模型重建，服务已重启。 | Vector database rebuilt with new model. Service restarted. |
| `embedding_modal.done` | 完成 | Done |
| `embedding_modal.retry` | 重试 | Retry |
| `embedding_modal.back` | 上一步 | Back |
| `embedding_modal.cancel` | 取消 | Cancel |
| `dashboard.rebuild_incomplete` | 上次 embedding 模型重建未完成，向量库可能过期。 | Previous embedding model rebuild was interrupted. Vector database may be stale. |
| `dashboard.rebuild_action` | 删除向量库并重启 | Delete vector DB & restart |

### 不受影响的部分

- Config 读写方式不变：仍通过 existing `read_config` / `write_config` IPC
- Server 进程启动参数不变：仍通过 `--config` 传递配置路径
- `start_server` / `stop_server` 命令不变
- 其他 tab 的配置字段不变
- Python 服务端无需修改
