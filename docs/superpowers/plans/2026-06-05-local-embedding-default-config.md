# 本地 Embedding 默认配置 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将桌面端的默认 embedding 配置改为本地 LLama.cpp GGUF 模型，保留切换到远程 provider 的能力。

**Architecture:** 前端（React/TypeScript）配置 schema 和 UI 条件渲染 + Rust/Tauri 后端默认配置运行时生成。

**Tech Stack:** TypeScript (React), Rust (Tauri), JSON config

---

### Task 1: 下载 GGUF 模型 & .gitignore

**Files:**
- Create: `src-tauri/resources/models/`（目录）
- Create: `src-tauri/resources/models/.gitkeep`（占位）
- Modify: `.gitignore`

- [ ] **Step 1: 创建模型目录和 .gitkeep**

```bash
mkdir -p src-tauri/resources/models
touch src-tauri/resources/models/.gitkeep
```

- [ ] **Step 2: 下载 GGUF 模型**

```bash
./scripts/download-gguf.sh
```

- [ ] **Step 3: 更新 .gitignore 忽略模型文件**

修改 `.gitignore`，在 `src-tauri/Resources/uv/` 行后添加：

```
# GGUF models (downloaded by scripts/download-gguf.sh)
src-tauri/resources/models/*.gguf
```

- [ ] **Step 4: 验证模型文件存在**

```bash
ls -lh src-tauri/resources/models/bge-small-zh-v1.5-f16.gguf
```

Expected: file exists with non-zero size.

- [ ] **Step 5: Commit**

```bash
git add .gitignore src-tauri/resources/models/.gitkeep
git commit -m "chore: add gguf model directory and gitignore"
```

---

### Task 2: tauri.conf.json — 打包模型资源

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: 在 bundle.resources 中添加 models 路径**

修改 `tauri.conf.json:37-39`：

```json
"resources": [
  "Resources/uv/**/*",
  "Resources/models/**/*"
]
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat: bundle gguf models in app resources"
```

---

### Task 3: Rust — resolve_bundled_model_path + 默认配置运行时构建

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 添加 resolve_bundled_model_path Tauri command**

在 `open_playground` command 后、`run` 函数前添加：

```rust
#[tauri::command]
fn resolve_bundled_model_path(app: tauri::AppHandle) -> Result<String, String> {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let root_dir = manifest_dir.parent().unwrap_or(manifest_dir);
    let dev_path = root_dir
        .join("resources/models/bge-small-zh-v1.5-f16.gguf");
    let symlink_path = manifest_dir
        .join("Resources/models/bge-small-zh-v1.5-f16.gguf");
    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("failed to resolve resource dir: {}", e))?;
    let prod_path = resource_dir
        .join("models/bge-small-zh-v1.5-f16.gguf");
    let path = if dev_path.exists() { dev_path }
               else if symlink_path.exists() { symlink_path }
               else { prod_path };
    Ok(path.to_string_lossy().to_string())
}
```

- [ ] **Step 2: 将默认配置从静态字符串改为运行时构建**

修改 `lib.rs:563-578`（setup 函数中的默认配置生成逻辑）：

```rust
// 首次启动：若 ov.conf 不存在则生成默认配置
let state = app.state::<ServerState>();
let conf_path = get_ov_conf_path(&state);
if !std::path::Path::new(&conf_path).exists() {
    log::info!("Generating default ov.conf at {}", conf_path);

    let model_path = resolve_bundled_model_path_inner(app);
    let default_config = serde_json::json!({
        "server": { "host": "127.0.0.1", "port": 1933, "cors_origins": ["*"] },
        "storage": { "workspace": "~/.openviking/data", "vectordb": { "backend": "local" }, "agfs": { "backend": "local" } },
        "embedding": {
            "dense": { "provider": "local", "model": "bge-small-zh-v1.5-f16", "model_path": model_path },
            "max_concurrent": 10, "max_retries": 3,
            "circuit_breaker": { "failure_threshold": 5, "reset_timeout": 60, "max_reset_timeout": 600 }
        },
        "vlm": { "max_retries": 3, "max_concurrent": 100, "timeout": 60.0, "thinking": false, "stream": false },
        "encryption": { "enabled": false },
        "log": { "level": "INFO" },
        "feishu": { "domain": "https://open.feishu.cn", "max_rows_per_sheet": 1000, "max_records_per_table": 1000 }
    }).to_string();

    if let Some(parent) = std::path::Path::new(&conf_path).parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&conf_path, default_config).ok();
}
```

添加 `resolve_bundled_model_path_inner` 辅助函数（与 command 相同的逻辑但接收 `&AppHandle` 而非 owned）：

```rust
fn resolve_bundled_model_path_inner(app: &tauri::AppHandle) -> String {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let root_dir = manifest_dir.parent().unwrap_or(manifest_dir);
    let dev_path = root_dir
        .join("resources/models/bge-small-zh-v1.5-f16.gguf");
    let symlink_path = manifest_dir
        .join("Resources/models/bge-small-zh-v1.5-f16.gguf");
    let resource_dir = app.path().resource_dir()
        .expect("failed to resolve resource dir");
    let prod_path = resource_dir
        .join("models/bge-small-zh-v1.5-f16.gguf");
    let path = if dev_path.exists() { dev_path }
               else if symlink_path.exists() { symlink_path }
               else { prod_path };
    path.to_string_lossy().to_string()
}
```

- [ ] **Step 3: 注册新 command**

在 `invoke_handler` 的 generate_handler 宏中添加 `resolve_bundled_model_path`：

```rust
.invoke_handler(tauri::generate_handler![
    ...
    open_playground,
    resolve_bundled_model_path,
])
```

- [ ] **Step 4: 验证编译**

```bash
cd src-tauri && cargo check
```

Expected: compilation succeeds.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add resolve_bundled_model_path command and runtime default config"
```

---

### Task 4: TypeScript 类型定义 — 添加 model_path

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: 在 DenseEmbeddingConfig 中添加 model_path 字段**

修改 `types.ts:42-60`，在 `batch_size?: number;` 后添加：

```typescript
  model_path?: string;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add model_path to DenseEmbeddingConfig"
```

---

### Task 5: i18n — 新增和修改语言 key

**Files:**
- Modify: `src/locales/zh.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: zh.json — 添加新 key，修改旧 key**

在 `ai.auto` 行后添加：

```json
  "ai.provider_options_local": "本地 (Local)",
  "ai.model_path": "模型路径 (model_path)",
  "ai.model_path_desc": "自定义 GGUF 模型文件路径，默认使用预打包模型。",
```

将 `ai.dense_provider_desc` 的值改为：

```json
  "ai.dense_provider_desc": "Embedding provider：local（默认）/ volcengine / openai / jina / gemini / dashscope / vikingdb。选择 local 时无需 API 密钥。",
```

- [ ] **Step 2: en.json — 添加新 key，修改旧 key**

在 `ai.auto` 行后添加：

```json
  "ai.provider_options_local": "Local",
  "ai.model_path": "Model Path",
  "ai.model_path_desc": "Custom GGUF model file path. Uses the bundled model by default.",
```

将 `ai.dense_provider_desc` 的值改为：

```json
  "ai.dense_provider_desc": "Embedding provider: local (default) / volcengine / openai / jina / gemini / dashscope / vikingdb. No API key needed for local.",
```

- [ ] **Step 3: Commit**

```bash
git add src/locales/zh.json src/locales/en.json
git commit -m "feat(i18n): add local embedding i18n keys"
```

---

### Task 6: 配置字段定义 — provider 改为 select，新增 model_path

**Files:**
- Modify: `src/lib/config-fields.ts`

- [ ] **Step 1: 将 provider 字段从 string 改为 select**

修改 `config-fields.ts:74-83`：

```typescript
  {
    path: 'embedding.dense.provider',
    label: 'ai.provider',
    description: 'ai.dense_provider_desc',
    type: 'select',
    tab: 'ai',
    group: 'dense',
    defaultValue: 'local',
    options: [
      { label: 'ai.provider_options_local', value: 'local' },
      { label: 'volcengine', value: 'volcengine' },
      { label: 'openai', value: 'openai' },
      { label: 'jina', value: 'jina' },
      { label: 'gemini', value: 'gemini' },
      { label: 'dashscope', value: 'dashscope' },
      { label: 'vikingdb', value: 'vikingdb' },
    ],
  },
```

- [ ] **Step 2: 新增 model_path 字段定义**

在 `batch_size` 字段后（`config-fields.ts:148` 行后）添加：

```typescript
  {
    path: 'embedding.dense.model_path',
    label: 'ai.model_path',
    description: 'ai.model_path_desc',
    type: 'string',
    tab: 'ai',
    group: 'dense',
    defaultValue: '',
    placeholder: '/path/to/model.gguf',
  },
```

- [ ] **Step 3: 更新 DEFAULT_CONFIG**

修改 `config-fields.ts:439-444`，将 embedding.dense 默认值改为：

```typescript
  embedding: {
    max_concurrent: 10,
    max_retries: 3,
    dense: { provider: 'local', model: 'bge-small-zh-v1.5-f16', dimension: 1024, batch_size: 32 },
    circuit_breaker: { failure_threshold: 5, reset_timeout: 60, max_reset_timeout: 600 },
  },
```

注意：TypeScript 侧的 DEFAULT_CONFIG 仍然保留 dimension/batch_size 作为 fallback 默认值，实际的 config 删减逻辑在 AITab 的 Provider 切换逻辑中处理。

- [ ] **Step 4: Commit**

```bash
git add src/lib/config-fields.ts
git commit -m "feat(config): change provider to select, add model_path field"
```

---

### Task 7: AITab — 条件渲染 + provider 切换逻辑

**Files:**
- Modify: `src/components/config/AITab.tsx`

- [ ] **Step 1: 实现 provider 切换逻辑和条件渲染**

替换整个 `AITab.tsx`：

```typescript
import { useTranslation } from 'react-i18next';
import type { OvConfig } from '../../lib/types';
import { getGroups, getFieldsByTab } from '../../lib/config-fields';
import ConfigFieldRenderer, { updateConfig } from './ConfigField';
import ConfigGroup from './ConfigGroup';

interface AITabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
}

// Fields to hide when provider is "local" (keep in config, just not shown)
const REMOTE_ONLY_FIELDS = new Set([
  'embedding.dense.api_base',
  'embedding.dense.api_key',
  'embedding.dense.input',
]);

const DIMENSION_PATH = 'embedding.dense.dimension';
const BATCH_SIZE_PATH = 'embedding.dense.batch_size';

function ConfigFields({ config, onChange, group }: { config: OvConfig; onChange: (config: OvConfig) => void; group?: string }) {
  const fields = getFieldsByTab('ai').filter((f) => f.group === group);
  const provider = config.embedding?.dense?.provider;
  const isLocal = provider === 'local';

  const handleChange = (path: string, value: unknown) => {
    // First apply the field change to a cloned config
    let updated = updateConfig(config, path, value);

    // Then apply side effects for provider switch
    if (path === 'embedding.dense.provider') {
      if (value === 'local') {
        // local: remove dimension and batch_size from config
        const dense = updated.embedding.dense as Record<string, unknown> | undefined;
        if (dense) {
          delete dense.dimension;
          delete dense.batch_size;
        }
      } else {
        // remote: inject dimension=1024, batch_size=32
        updated.embedding.dense = {
          ...updated.embedding.dense,
          dimension: 1024,
          batch_size: 32,
        };
      }
    }

    onChange(updated);
  };

  return (
    <>
      {fields
        .filter((f) => {
          if (f.path === 'embedding.dense.provider') return true;
          if (f.path === 'embedding.dense.model') return true;
          if (f.path === 'embedding.dense.model_path') return true;
          if (isLocal && REMOTE_ONLY_FIELDS.has(f.path)) return false;
          if (isLocal && (f.path === DIMENSION_PATH || f.path === BATCH_SIZE_PATH)) return false;
          return true;
        })
        .map((field) => {
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

export default function AITab({ config, onChange }: AITabProps) {
  const { t } = useTranslation();
  const groups = getGroups('ai');

  const groupLabels: Record<string, string> = {
    dense: t('ai.dense_embedding'),
    embedding_settings: t('ai.embedding_settings'),
    circuit_breaker: t('ai.circuit_breaker'),
    vlm: t('ai.vlm'),
  };

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <ConfigGroup key={group} title={groupLabels[group] ?? group}>
          <ConfigFields config={config} onChange={onChange} group={group} />
        </configGroup>
      ))}
    </div>
  );
}
```

注意：上述代码中 `getFieldsByTab` 返回所有字段（含无 group 的字段），但原 `AITab.tsx` 的 `groups` 是从 `getGroups` 函数获取的，所以 `uniqueGroups` 已经是过滤后的。需要确认 —— 查看原代码，`groups` 来自 `getGroups('ai')`，而 `getGroups` 只返回有 group 的字段，所以 `vlm` 等也在内。修改后保持这个行为，用 `getFieldsByTab('ai')` 代替 `getGroups` 逻辑。

实际上上面的 `groups` 变量应该从 `getGroups('ai')` 获取，而不是用 `getFieldsByTab`。让我修正：

```typescript
import { getGroups, getFieldsByTab } from '../../lib/config-fields';
```

然后恢复 `groups` 从 `getGroups('ai')` 获取。其他逻辑不变。

- [ ] **Step 2: 验证前端构建**

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/config/AITab.tsx
git commit -m "feat(ui): conditional field rendering and provider switch logic"
```

---

### Task 8: 集成验证

- [ ] **Step 1: 验证全量构建**

```bash
cd src-tauri && cargo build 2>&1 | tail -20
```

Expected: compiles without errors.

- [ ] **Step 2: 验证默认配置生成（模拟首次启动）**

检查 Rust 代码逻辑：当 `ov.conf` 不存在时，生成的 JSON 应包含 `provider: "local"` 和有效的 `model_path`。

- [ ] **Step 3: 最终提交**

```bash
git add -A
git status  # 确认只有预期文件
git commit -m "feat: default local embedding with GGUF model"
```
