# Embedding 模型变更独立流程 Implementation Plan

> **For agentic workers:** This plan is implemented by dispatching subagents per task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove embedding model config from AI tab, add a "Change Embedding Model" modal with auto-rebuild (stop → verify ports → delete vectordb → save config → restart).

**Architecture:** Frontend-orchestrated — React Modal manages state and sequentially invokes Tauri commands (stop_server → verify_ports → delete_directory → write_config → start_server). Rust backend adds new commands for vectordb path resolution, port checking/cleanup, and rebuild lock file management.

**Tech Stack:** Tauri v2 (Rust) + React 18 + TypeScript 5 + Tailwind CSS 4

---

### Task 1: Rust backend — vectordb path resolution & directory deletion

**Files:**
- Modify: `src-tauri/src/lib.rs` (add new Tauri commands and register them)
- Modify: `src-tauri/src/process.rs` (add delete_directory helper)

- [ ] **Step 1: Add `resolve_vectordb_path` command** in `src-tauri/src/lib.rs`

Use `state.workspace_path` (the canonical workspace from ServerState), resolve `~` via `expand_tilde`, append `/vectordb/`, return absolute path.

```rust
#[tauri::command]
fn resolve_vectordb_path(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let workspace = state.workspace_path.lock().unwrap().clone();
    let expanded = if workspace.is_empty() {
        expand_tilde("~/.openviking/data")
    } else {
        workspace
    };
    let mut vdb_path = std::path::PathBuf::from(&expanded);
    vdb_path.push("vectordb");
    Ok(vdb_path.to_string_lossy().to_string())
}
```

- [ ] **Step 2: Add `delete_directory` command** in `src-tauri/src/lib.rs`

```rust
#[tauri::command]
fn delete_directory(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(()); // 不存在视为已删除
    }
    std::fs::remove_dir_all(&p)
        .map_err(|e| format!("删除目录失败 {}: {}", path, e))
}
```

- [ ] **Step 3: Register both commands** in `invoke_handler`

Add `resolve_vectordb_path` and `delete_directory` to the `tauri::generate_handler!` macro call at line 631 of `lib.rs`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(rust): add resolve_vectordb_path and delete_directory commands"
```

---

### Task 2: Rust backend — port check & cleanup

**Files:**
- Modify: `src-tauri/src/lib.rs` (add `check_port`, `kill_port_process` commands)
- Modify: `src-tauri/src/process.rs` (add port helper functions)

- [ ] **Step 1: Add `check_port` command** in `src-tauri/src/lib.rs`

Uses `std::net::TcpStream::connect_timeout` to check if a port on 127.0.0.1 is in use.

```rust
#[tauri::command]
fn check_port(port: u16) -> Result<bool, String> {
    let addr = format!("127.0.0.1:{}", port);
    match std::net::TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("地址解析失败: {}", e))?,
        std::time::Duration::from_secs(1),
    ) {
        Ok(_) => Ok(true),  // 端口被占用
        Err(_) => Ok(false), // 端口空闲
    }
}
```

- [ ] **Step 2: Add `kill_port_process` command** in `src-tauri/src/lib.rs`

Platform-specific: on Unix use `lsof -ti :PORT | xargs kill -9`, on Windows use `netstat -ano | findstr :PORT` + `taskkill /F /PID`.

```rust
#[tauri::command]
fn kill_port_process(port: u16) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("cmd")
            .args(&["/C", &format!("for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :{}') do taskkill /F /PID %a", port)])
            .output()
            .map_err(|e| format!("执行命令失败: {}", e))?;
        if !output.status.success() {
            log::warn!("kill_port_process (Windows) 可能未完全清理: {}", String::from_utf8_lossy(&output.stderr));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        // macOS / Linux
        let output = std::process::Command::new("sh")
            .arg("-c")
            .arg(&format!("lsof -ti :{} | xargs kill -9 2>/dev/null", port))
            .output()
            .map_err(|e| format!("执行命令失败: {}", e))?;
    }
    Ok(())
}
```

- [ ] **Step 3: Register both commands** in `invoke_handler`

Add `check_port` and `kill_port_process` to `tauri::generate_handler!`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(rust): add check_port and kill_port_process commands"
```

---

### Task 3: Rust backend — rebuild lock file management

**Files:**
- Modify: `src-tauri/src/lib.rs` (add `read_rebuild_lock`, `write_rebuild_lock`, `delete_rebuild_lock` commands)

- [ ] **Step 1: Add `get_ov_conf_dir` helper** in `src-tauri/src/lib.rs`

```rust
fn get_ov_conf_dir(state: &ServerState) -> String {
    let conf_path = get_ov_conf_path(state);
    std::path::Path::new(&conf_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/tmp".to_string())
}
```

- [ ] **Step 2: Add `read_rebuild_lock` command**

```rust
#[tauri::command]
fn read_rebuild_lock(state: tauri::State<'_, ServerState>) -> Result<Option<String>, String> {
    let dir = get_ov_conf_dir(&state);
    let lock_path = std::path::Path::new(&dir).join("rebuild_lock.json");
    if lock_path.exists() {
        std::fs::read_to_string(&lock_path)
            .map(Some)
            .map_err(|e| format!("读取锁文件失败: {}", e))
    } else {
        Ok(None)
    }
}
```

- [ ] **Step 3: Add `write_rebuild_lock` command**

```rust
#[tauri::command]
fn write_rebuild_lock(state: tauri::State<'_, ServerState>, content: String) -> Result<(), String> {
    let dir = get_ov_conf_dir(&state);
    let lock_path = std::path::Path::new(&dir).join("rebuild_lock.json");
    std::fs::write(&lock_path, &content)
        .map_err(|e| format!("写入锁文件失败: {}", e))
}
```

- [ ] **Step 4: Add `delete_rebuild_lock` command**

```rust
#[tauri::command]
fn delete_rebuild_lock(state: tauri::State<'_, ServerState>) -> Result<(), String> {
    let dir = get_ov_conf_dir(&state);
    let lock_path = std::path::Path::new(&dir).join("rebuild_lock.json");
    if lock_path.exists() {
        std::fs::remove_file(&lock_path)
            .map_err(|e| format!("删除锁文件失败: {}", e))
    } else {
        Ok(())
    }
}
```

- [ ] **Step 5: Register all three commands** in `invoke_handler`

Add `read_rebuild_lock`, `write_rebuild_lock`, `delete_rebuild_lock`.

Note: These commands take `state: tauri::State<'_, ServerState>` but `get_ov_conf_path` expects `&ServerState` (not `State`). In the helper function, use `state.inner()` to get `&ServerState` from `State`. Actually looking at existing code, `get_ov_conf_path` takes `&ServerState`, and commands use `state: tauri::State<'_, ServerState>`. The pattern in existing code:

```rust
fn get_ov_conf_path(state: &ServerState) -> String { ... }

#[tauri::command]
fn read_config(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    let config_path = get_ov_conf_path(&state);
    // ...
}
```

So `&state` where `state: State<ServerState>` auto-derefs to `&ServerState`. Good.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(rust): add rebuild lock file management commands"
```

---

### Task 4: Frontend — AITab.tsx changes

**Files:**
- Modify: `src/components/config/AITab.tsx`

- [ ] **Step 1: Replace Dense Embedding group with readonly summary + button**

Remove the `ConfigFields` call for group `'dense'`. Instead, render a read-only summary card using `ConfigGroup` with the Dense Embedding title, showing provider / model / dimension as text, plus the "Change Embedding Model" button.

```tsx
// Inside the groups.map() loop, when group === 'dense':
// Read from config.embedding.dense
const dense = config.embedding?.dense;
const provider = dense?.provider ?? 'local';
const model = dense?.model ?? '-';
const dimension = dense?.dimension ?? '-';

// Render a ConfigGroup with title "Dense Embedding" containing:
// - Read-only info display: Provider: {provider}, Model: {model}, Dimension: {dimension}
// - "Change Embedding Model" button
```

Button states:
- Default: enabled, clickable
- When `isRebuilding` prop is true: disabled + loading spinner

Pass `isRebuilding` and `onChangeEmbedding` as props from parent.

- [ ] **Step 2: Update AITab props** — accept `showEmbeddingModal` and `onOpenEmbeddingModal`

```tsx
interface AITabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
  isEmbeddingRebuilding?: boolean;
  onOpenEmbeddingModal?: () => void;
}
```

- [ ] **Step 3: Remove provider switching logic** from AITab

Delete the `handleChange` function and the `REMOTE_ONLY_FIELDS` / `DIMENSION_PATH` / `BATCH_SIZE_PATH` constants. The ConfigFields rendering (for remaining groups) should use a simple change handler.

```tsx
function ConfigFields({ config, onChange, group }: { config: OvConfig; onChange: (config: OvConfig) => void; group?: string }) {
  const fields = getFieldsByTab('ai').filter((f) => f.group === group);

  const handleChange = (path: string, value: unknown) => {
    const updated = updateConfig(config, path, value);
    onChange(updated);
  };

  return (
    <>
      {fields.map((field) => {
        const keys = field.path.split('.');
        let value: unknown = config;
        for (const key of keys) {
          if (value == null || typeof value !== 'object') {
            value = undefined;
            break;
          }
          value = (value as Record<string, unknown>)[key];
        }
        return (
          <ConfigFieldRenderer
            key={field.path}
            field={field}
            value={value}
            onChange={handleChange}
          />
        );
      })}
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/config/AITab.tsx
git commit -m "feat(ui): replace dense embedding group with readonly summary + button"
```

---

### Task 5: Frontend — EmbeddingModal.tsx (new component)

**Files:**
- Create: `src/components/config/EmbeddingModal.tsx`

This is the largest task. The modal has 3 steps: edit → confirm → executing.

- [ ] **Step 1: Create the EmbeddingModal component skeleton**

```tsx
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import type { OvConfig, DenseEmbeddingConfig } from '../../lib/types';
import { getFieldsByTab } from '../../lib/config-fields';
import ConfigFieldRenderer, { updateConfig } from './ConfigField';

interface EmbeddingModalProps {
  config: OvConfig;
  open: boolean;
  onClose: (saved?: boolean) => void; // saved=true means changes were committed
}
```

- [ ] **Step 2: Step 1 — Edit mode**

Render the 8 Dense Embedding fields in edit mode. Deep-clone `config.embedding.dense` into local state. Show warning banner at the top.

```tsx
const REMOTE_ONLY_FIELDS = new Set([
  'embedding.dense.api_base',
  'embedding.dense.api_key',
  'embedding.dense.input',
]);
const DIMENSION_PATH = 'embedding.dense.dimension';
const BATCH_SIZE_PATH = 'embedding.dense.batch_size';
```

Field visibility logic (same as current AITab):
- Always show: provider, model, model_path
- When provider !== 'local': show api_base, api_key, input, dimension, batch_size
- When switching to 'local': delete dimension, batch_size from local state
- When switching to 'remote': inject dimension=1024, batch_size=32

Buttons: Cancel | Save & Rebuild (disabled if no changes)

- [ ] **Step 3: Step 2 — Confirm mode**

Show action list (4 steps), diff view of changes. Use a diff calculation function:

```tsx
function computeChanges(original: DenseEmbeddingConfig, current: DenseEmbeddingConfig): Array<{key: string, from: unknown, to: unknown}> {
  return Object.keys(current).filter(key => 
    JSON.stringify(original[key as keyof DenseEmbeddingConfig]) !== 
    JSON.stringify(current[key as keyof DenseEmbeddingConfig])
  ).map(key => ({
    key,
    from: original[key as keyof DenseEmbeddingConfig],
    to: current[key as keyof DenseEmbeddingConfig],
  }));
}
```

Buttons: Back | Cancel | Confirm Rebuild (red/danger style)

- [ ] **Step 4: Step 3 — Executing mode**

Sequentially invoke Tauri commands, updating progress state after each step:

```typescript
type StepName = 'stop' | 'verify_port' | 'delete_db' | 'save_config' | 'start';
type StepState = 'pending' | 'in_progress' | 'done' | 'error';

const STEPS: StepName[] = ['stop', 'verify_port', 'delete_db', 'save_config', 'start'];
```

Execution logic:
1. Write rebuild_lock: `await invoke('write_rebuild_lock', { content: JSON.stringify({ status: 'in_progress', timestamp: new Date().toISOString() }) })`
2. Stop service: `await invoke('stop_server')` — ignore error if already stopped
3. Verify ports: get server port from `config.server.port` (default 1933), vikingbot 18790. Loop check_port up to 3 times. If still occupied, call kill_port_process, then check once more.
4. Delete vectordb: `await invoke('resolve_vectordb_path')` then `await invoke('delete_directory', { path })`
5. Save config: construct new config from current config with updated dense values, call `await invoke('write_config', { config: JSON.stringify(newConfig) })`
6. Start service: `await invoke('start_server')` — if fails, show error
7. Delete rebuild_lock: `await invoke('delete_rebuild_lock')`

If any step fails, show error + Retry button. Retry continues from the failed step.

- [ ] **Step 5: Step 4 — Complete mode**

Green checkmark + "Embedding model updated" message. "Done" button calls `onClose(true)`.

- [ ] **Step 6: Add modal backdrop and styling**

Use a portal/fixed overlay with backdrop blur + centered card. Max-width ~600px.

- [ ] **Step 7: Commit**

```bash
git add src/components/config/EmbeddingModal.tsx
git commit -m "feat(ui): add EmbeddingModal component with edit/confirm/executing flow"
```

---

### Task 6: Frontend — ConfigPage.tsx integration

**Files:**
- Modify: `src/components/config/ConfigPage.tsx`

- [ ] **Step 1: Add EmbeddingModal to ConfigPage**

Import EmbeddingModal, add state:

```tsx
const [embeddingModalOpen, setEmbeddingModalOpen] = useState(false);
const [isEmbeddingRebuilding, setIsEmbeddingRebuilding] = useState(false);
```

Wrap the AITab rendering to pass props:

```tsx
{activeSubTab === 'ai' && (
  <AITab
    config={config}
    onChange={setConfig}
    isEmbeddingRebuilding={isEmbeddingRebuilding}
    onOpenEmbeddingModal={() => setEmbeddingModalOpen(true)}
  />
)}
```

Render the modal:

```tsx
<EmbeddingModal
  config={config}
  open={embeddingModalOpen}
  onClose={(saved) => {
    setEmbeddingModalOpen(false);
    if (saved) {
      loadConfig(); // reload config to show updated values
    }
  }}
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/config/ConfigPage.tsx
git commit -m "feat(ui): integrate EmbeddingModal into ConfigPage"
```

---

### Task 7: Frontend — Dashboard.tsx rebuild lock detection

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx`

- [ ] **Step 1: Add rebuild lock check on startup**

In the Dashboard component, add a new `useEffect` that checks for rebuild_lock.json on mount:

```tsx
const [rebuildLockExists, setRebuildLockExists] = useState(false);

useEffect(() => {
  invoke<string | null>('read_rebuild_lock')
    .then((content) => {
      if (content) {
        setRebuildLockExists(true);
      }
    })
    .catch(() => {});
}, []);
```

- [ ] **Step 2: Add warning banner when lock exists**

When `rebuildLockExists` is true, render a warning banner above the service status area:

```tsx
{rebuildLockExists && (
  <div className="bg-amber-500/10 border border-amber-500/20 rounded-md px-4 py-3 text-sm text-amber-400 flex items-center gap-3">
    <span className="flex-1">{t('dashboard.rebuild_incomplete')}</span>
    <button
      onClick={async () => {
        try {
          await invoke('stop_server');
          const vdbPath = await invoke<string>('resolve_vectordb_path');
          await invoke('delete_directory', { path: vdbPath });
          await invoke('delete_rebuild_lock');
          await invoke('start_server');
          setRebuildLockExists(false);
        } catch (err) {
          console.error('Recovery rebuild failed:', err);
        }
      }}
      className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-md hover:bg-amber-500/30 transition-colors"
    >
      {t('dashboard.rebuild_action')}
    </button>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx
git commit -m "feat(ui): add rebuild lock detection and recovery banner on dashboard"
```

---

### Task 8: i18n additions

**Files:**
- Modify: `src/locales/zh.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: Add keys to zh.json**

```json
"ai.change_embedding": "更改 Embedding 模型",
"ai.current_embedding": "当前 Embedding 配置",
"embedding_modal.title": "更改 Embedding 模型",
"embedding_modal.warning": "修改 embedding 模型需要重建向量数据库，现有向量数据将丢失。",
"embedding_modal.save_rebuild": "保存并重建",
"embedding_modal.confirm_rebuild": "确认重建",
"embedding_modal.confirm_warning": "此操作将执行以下步骤：",
"embedding_modal.changes": "变更",
"embedding_modal.no_changes": "无变更",
"embedding_modal.step_stop": "停止服务",
"embedding_modal.step_verify_port": "验证端口释放",
"embedding_modal.step_delete_db": "删除向量数据库",
"embedding_modal.step_save_config": "保存配置",
"embedding_modal.step_start": "启动服务",
"embedding_modal.success": "Embedding 模型已更新",
"embedding_modal.success_desc": "向量库已使用新模型重建，服务已重启。",
"embedding_modal.done": "完成",
"embedding_modal.retry": "重试",
"embedding_modal.back": "上一步",
"embedding_modal.cancel": "取消",
"dashboard.rebuild_incomplete": "上次 embedding 模型重建未完成，向量库可能过期。",
"dashboard.rebuild_action": "删除向量库并重启",
```

- [ ] **Step 2: Add keys to en.json**

```json
"ai.change_embedding": "Change Embedding Model",
"ai.current_embedding": "Current Embedding",
"embedding_modal.title": "Change Embedding Model",
"embedding_modal.warning": "Changing the embedding model requires rebuilding the vector database. Existing vectors will be lost.",
"embedding_modal.save_rebuild": "Save & Rebuild",
"embedding_modal.confirm_rebuild": "Confirm Rebuild",
"embedding_modal.confirm_warning": "This action will:",
"embedding_modal.changes": "Changes",
"embedding_modal.no_changes": "No changes",
"embedding_modal.step_stop": "Stopping service",
"embedding_modal.step_verify_port": "Verifying port release",
"embedding_modal.step_delete_db": "Deleting vector database",
"embedding_modal.step_save_config": "Saving configuration",
"embedding_modal.step_start": "Starting service",
"embedding_modal.success": "Embedding model updated",
"embedding_modal.success_desc": "Vector database rebuilt with new model. Service restarted.",
"embedding_modal.done": "Done",
"embedding_modal.retry": "Retry",
"embedding_modal.back": "Back",
"embedding_modal.cancel": "Cancel",
"dashboard.rebuild_incomplete": "Previous embedding model rebuild was interrupted. Vector database may be stale.",
"dashboard.rebuild_action": "Delete vector DB & restart",
```

- [ ] **Step 3: Commit**

```bash
git add src/locales/zh.json src/locales/en.json
git commit -m "feat(i18n): add embedding modal and rebuild detection i18n keys"
```

---

### Task 9: Integration verification

- [ ] **Step 1: TypeScript compilation check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 2: Rust compilation check**

Run: `cd src-tauri && cargo check`
Expected: No compilation errors.

- [ ] **Step 3: Review config-fields.ts** to ensure no unused code

The Dense Embedding fields remain in config-fields.ts for default value generation and type safety. Verify they aren't rendered anywhere else.
