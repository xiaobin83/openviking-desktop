# First-Run Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 4-step first-run onboarding wizard that guides users through installing OpenViking, configuring embedding/VLM models, and setting a root API key before entering the dashboard.

**Architecture:** Rust owns first-run detection via a `.onboarded` flag file in `~/.openviking/`. On startup, Rust gates auto-config generation and auto-start behind this flag (skipped when absent). `App.tsx` invokes `is_onboarded` on mount to decide whether to render the wizard. The wizard collects form data across 4 steps, then writes `ov.conf` and the `.onboarded` flag on completion. No persistence of partial wizard progress — closing restarts from step 1.

**Tech Stack:** Tauri v2 (Rust), React 18 + TypeScript, Tailwind CSS v4, i18next

---

## File Structure

```
src-tauri/src/lib.rs              (modify - new commands + setup() gating)
src/App.tsx                       (modify - listen for onboarding event)
src/components/wizard/
  OnboardingWizard.tsx             (new - wizard container, state mgmt)
  WizardProgress.tsx               (new - 4-dot step indicator)
  InstallStep.tsx                  (new - Step 1: Python + OpenViking)
  EmbeddingStep.tsx                (new - Step 2: embedding config)
  VlmStep.tsx                      (new - Step 3: VLM config)
  ApiKeyStep.tsx                   (new - Step 4: root API key)
src/locales/en.json                (modify - add wizard keys)
src/locales/zh.json                (modify - add wizard keys)
scripts/reset-first-run.sh         (new - testing script)
```

---

### Task 1: Rust — Add onboarding flag path helper and Tauri commands

**Files:**
- Modify: `src-tauri/src/lib.rs:11-11` (add const)
- Modify: `src-tauri/src/lib.rs:116-122` (add flag path fn)
- Modify: `src-tauri/src/lib.rs:817-846` (register new commands)

- [ ] **Step 1: Add `ONBOARDED_FLAG_NAME` constant and `get_onboarded_flag_path` helper**

In `src-tauri/src/lib.rs`, after line 11 (`const DEFAULT_OV_CONF_PATH`), add:

```rust
const ONBOARDED_FLAG_NAME: &str = ".openviking/.onboarded";
```

After line 122 (end of `get_ov_conf_dir`), add:

```rust
fn get_onboarded_flag_path() -> String {
    let home = get_home_dir();
    home.join(ONBOARDED_FLAG_NAME)
        .to_string_lossy()
        .to_string()
}
```

- [ ] **Step 2: Add `is_onboarded` command**

After the `get_ov_conf_dir` function (after the new `get_onboarded_flag_path`), add:

```rust
#[tauri::command]
async fn is_onboarded() -> Result<bool, String> {
    let flag_path = get_onboarded_flag_path();
    Ok(std::path::Path::new(&flag_path).exists())
}
```

- [ ] **Step 3: Add `mark_onboarded` command**

After `is_onboarded`, add:

```rust
#[tauri::command]
async fn mark_onboarded() -> Result<String, String> {
    let flag_path = get_onboarded_flag_path();
    if let Some(parent) = std::path::Path::new(&flag_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }
    std::fs::write(&flag_path, "1")
        .map_err(|e| format!("写入标志文件失败: {}", e))?;
    Ok("ok".to_string())
}
```

- [ ] **Step 4: Register new commands in `invoke_handler`**

In the `tauri::generate_handler![]` macro (around line 817), add `is_onboarded` and `mark_onboarded` to the list:

```rust
.invoke_handler(tauri::generate_handler![
    get_server_status,
    get_last_error,
    start_server,
    stop_server,
    read_config,
    write_config,
    get_workspace,
    set_workspace,
    read_server_log,
    open_log_file,
    open_app_log_file,
    open_console,
    check_openviking_state,
    install_openviking,
    upgrade_openviking,
    upgrade_python,
    get_python_versions,
    get_openviking_versions,
    get_uv_path,
    open_playground,
    resolve_bundled_model_path,
    resolve_vectordb_path,
    delete_directory,
    check_port,
    kill_port_process,
    read_rebuild_lock,
    write_rebuild_lock,
    delete_rebuild_lock,
    is_onboarded,
    mark_onboarded,
])
```

- [ ] **Step 5: Commit**

```bash
cargo build 2>&1 | tail -5
git add src-tauri/src/
git commit -m "feat: add onboarding flag detection and mark commands"
```

---

### Task 2: Rust — Gate config auto-generation and auto-start on onboarding flag

**Files:**
- Modify: `src-tauri/src/lib.rs:773-814` (setup function config + auto-start section)

- [ ] **Step 1: Add onboarding check in `setup()`**

Replace lines 773-814 (`setup()` function, from "首次启动" comment to the end of auto-start logic) with the gated version:

```rust
            tray::create_tray(app.handle())?;

            let state = app.state::<ServerState>();
            let onboarded = std::path::Path::new(&get_onboarded_flag_path()).exists();
            log::info!("Onboarded flag: {}", onboarded);

            if onboarded {
                // 首次启动：若 ov.conf 不存在则生成默认配置
                let conf_path = get_ov_conf_path(&state);
                if !std::path::Path::new(&conf_path).exists() {
                    log::info!("Generating default ov.conf at {}", conf_path);
                    let model_path = resolve_bundled_model_path_inner(app.handle());
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

                // 自动启动服务（仅在 openviking 已安装时）
                let auto_start_handle = app.handle().clone();
                let venv_path_val = state.venv_path.lock().unwrap().clone();
                let should_auto_start = if !venv_path_val.is_empty() {
                    python_env::pip_show_openviking(&state.uv_path, &venv_path_val)
                        .ok()
                        .flatten()
                        .is_some()
                } else {
                    false
                };
                if should_auto_start {
                    tauri::async_runtime::spawn(async move {
                        let _ = process::spawn_server_with_app_handle(&auto_start_handle).await;
                    });
                }
            } else {
                // 首次运行：不生成配置，不自动启动（前端通过 is_onboarded 命令判断是否显示向导）
                log::info!("First run detected — skipping auto-config and auto-start");
            }
```

- [ ] **Step 2: Commit**

```bash
cargo build 2>&1 | tail -5
git add src-tauri/src/
git commit -m "feat: gate auto-config and auto-start behind onboarding flag"
```

---

### Task 3: Frontend — Create WizardProgress component

**Files:**
- Create: `src/components/wizard/WizardProgress.tsx`

- [ ] **Step 1: Create WizardProgress component**

```bash
mkdir -p src/components/wizard
```

Write `src/components/wizard/WizardProgress.tsx`:

```tsx
interface WizardProgressProps {
  totalSteps: number;
  currentStep: number;
}

export default function WizardProgress({ totalSteps, currentStep }: WizardProgressProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i <= currentStep
              ? 'w-6 bg-aurora-400 shadow-glow shadow-aurora-500/30'
              : 'w-2 bg-surface-hover'
          }`}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/wizard/WizardProgress.tsx
git commit -m "feat: add wizard step progress indicator"
```

---

### Task 4: Frontend — Create InstallStep component

**Files:**
- Create: `src/components/wizard/InstallStep.tsx`

- [ ] **Step 1: Create InstallStep component**

Write `src/components/wizard/InstallStep.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { PythonTaskProgress } from '../../lib/types';

interface InstallStepProps {
  isInstalled: boolean;
  onInstallComplete: () => void;
}

export default function InstallStep({ isInstalled, onInstallComplete }: InstallStepProps) {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isInstalled) {
      setDone(true);
      const timer = setTimeout(onInstallComplete, 800);
      return () => clearTimeout(timer);
    }
  }, [isInstalled, onInstallComplete]);

  useEffect(() => {
    const unlistenPromise = listen<PythonTaskProgress>('python-task-progress', (event) => {
      setStatusMessage(event.payload.message);
      if (event.payload.done) {
        setDone(true);
        setInstalling(false);
        const timer = setTimeout(onInstallComplete, 800);
        return () => clearTimeout(timer);
      }
    });
    return () => { unlistenPromise.then(f => f()); };
  }, [onInstallComplete]);

  const handleInstall = async () => {
    setInstalling(true);
    setError('');
    try {
      await invoke('install_openviking', { pythonVersion: '3.13' });
    } catch (err) {
      setError(String(err));
      setInstalling(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
          <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-text-primary">
          {isInstalled ? t('wizard.already_installed') : t('python.installing')}
        </h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-text-primary">{t('wizard.step_install')}</h2>
      <p className="text-sm text-text-muted">
        {t('python.not_installed_hint')}
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {statusMessage && (
        <div className="bg-surface-elevated rounded-lg px-4 py-3 text-sm text-text-secondary">
          {statusMessage}
        </div>
      )}

      {installing ? (
        <div className="space-y-3">
          <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
            <div className="h-full bg-aurora-400 rounded-full animate-shimmer" style={{ width: '100%' }} />
          </div>
          <p className="text-xs text-text-muted text-center">{t('wizard.install_progress')}</p>
        </div>
      ) : (
        <button
          onClick={handleInstall}
          disabled={installing}
          className="w-full rounded-xl bg-aurora-500 hover:bg-aurora-600 disabled:opacity-50 disabled:cursor-not-allowed py-3 px-4 text-sm font-semibold text-white transition-colors"
        >
          {t('python.install')}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/wizard/InstallStep.tsx
git commit -m "feat: add onboarding install step component"
```

---

### Task 5: Frontend — Create EmbeddingStep component

**Files:**
- Create: `src/components/wizard/EmbeddingStep.tsx`

- [ ] **Step 1: Create EmbeddingStep component**

Write `src/components/wizard/EmbeddingStep.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import type { OvConfig } from '../../lib/types';

interface EmbeddingStepProps {
  formData: Partial<OvConfig>;
  onChange: (data: Partial<OvConfig>) => void;
}

const PROVIDER_OPTIONS = [
  { label: 'wizard.provider_local', value: 'local' },
  { label: 'volcengine', value: 'volcengine' },
  { label: 'openai', value: 'openai' },
  { label: 'jina', value: 'jina' },
  { label: 'gemini', value: 'gemini' },
  { label: 'dashscope', value: 'dashscope' },
  { label: 'vikingdb', value: 'vikingdb' },
];

export default function EmbeddingStep({ formData, onChange }: EmbeddingStepProps) {
  const { t } = useTranslation();

  const provider = formData.embedding?.dense?.provider || 'local';
  const isLocal = provider === 'local';
  const isLocalOrVikingdb = isLocal || provider === 'vikingdb';

  const updateField = (path: string, value: unknown) => {
    const parts = path.split('.');
    const newData = JSON.parse(JSON.stringify(formData));
    let obj = newData;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    onChange(newData);
  };

  const fieldStyle = "w-full rounded-lg bg-surface-hover border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-aurora-400/50 transition-colors";
  const labelStyle = "block text-xs font-semibold text-text-secondary mb-1.5";

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-text-primary">{t('wizard.step_embedding')}</h2>
      <p className="text-sm text-text-muted">{t('ai.dense_provider_desc')}</p>

      <div>
        <label className={labelStyle}>{t('ai.provider')}</label>
        <select
          value={provider}
          onChange={(e) => {
            updateField('embedding.dense.provider', e.target.value);
          }}
          className={fieldStyle}
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isLocalOrVikingdb && (
        <div>
          <label className={labelStyle}>{t('ai.model_path')}</label>
          <input
            type="text"
            value={formData.embedding?.dense?.model_path || ''}
            onChange={(e) => updateField('embedding.dense.model_path', e.target.value)}
            placeholder={t('ai.model_path_desc')}
            className={fieldStyle}
          />
        </div>
      )}

      {!isLocal && (
        <>
          <div>
            <label className={labelStyle}>{t('ai.api_base')}</label>
            <input
              type="text"
              value={formData.embedding?.dense?.api_base || ''}
              onChange={(e) => updateField('embedding.dense.api_base', e.target.value)}
              placeholder="https://ark.cn-beijing.volces.com/api/v3"
              className={fieldStyle}
            />
          </div>
          <div>
            <label className={labelStyle}>{t('ai.api_key')}</label>
            <input
              type="password"
              value={formData.embedding?.dense?.api_key || ''}
              onChange={(e) => updateField('embedding.dense.api_key', e.target.value)}
              className={fieldStyle}
            />
          </div>
          <div>
            <label className={labelStyle}>{t('ai.model')}</label>
            <input
              type="text"
              value={formData.embedding?.dense?.model || ''}
              onChange={(e) => updateField('embedding.dense.model', e.target.value)}
              placeholder="doubao-embedding-vision-251215"
              className={fieldStyle}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelStyle}>{t('ai.dimension')}</label>
              <input
                type="number"
                value={formData.embedding?.dense?.dimension ?? 1024}
                onChange={(e) => updateField('embedding.dense.dimension', parseInt(e.target.value) || 0)}
                min={1} max={8192}
                className={fieldStyle}
              />
            </div>
            <div>
              <label className={labelStyle}>{t('ai.dense_batch_size')}</label>
              <input
                type="number"
                value={formData.embedding?.dense?.batch_size ?? 32}
                onChange={(e) => updateField('embedding.dense.batch_size', parseInt(e.target.value) || 0)}
                min={1} max={512}
                className={fieldStyle}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/wizard/EmbeddingStep.tsx
git commit -m "feat: add onboarding embedding config step component"
```

---

### Task 6: Frontend — Create VlmStep component

**Files:**
- Create: `src/components/wizard/VlmStep.tsx`

- [ ] **Step 1: Create VlmStep component**

Write `src/components/wizard/VlmStep.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import type { OvConfig } from '../../lib/types';

interface VlmStepProps {
  formData: Partial<OvConfig>;
  onChange: (data: Partial<OvConfig>) => void;
}

const VLM_PROVIDER_OPTIONS = [
  { label: 'Volcengine', value: 'volcengine' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'OpenAI-Codex', value: 'openai-codex' },
  { label: 'Kimi', value: 'kimi' },
  { label: 'GLM', value: 'glm' },
  { label: 'wizard.provider_custom', value: '_custom' },
];

export default function VlmStep({ formData, onChange }: VlmStepProps) {
  const { t } = useTranslation();

  const provider = formData.vlm?.provider || '';
  const isCustom = provider === '_custom';

  const updateField = (path: string, value: unknown) => {
    const parts = path.split('.');
    const newData = JSON.parse(JSON.stringify(formData));
    let obj = newData;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    onChange(newData);
  };

  const fieldStyle = "w-full rounded-lg bg-surface-hover border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-aurora-400/50 transition-colors";
  const labelStyle = "block text-xs font-semibold text-text-secondary mb-1.5";

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-text-primary">{t('wizard.step_vlm')}</h2>
      <p className="text-sm text-text-muted">{t('ai.vlm_provider_desc')}</p>

      <div>
        <label className={labelStyle}>{t('ai.provider')}</label>
        <select
          value={provider}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '_custom') {
              updateField('vlm.provider', '');
            } else {
              updateField('vlm.provider', val);
            }
          }}
          className={fieldStyle}
        >
          <option value="">-- {t('wizard.select_provider')} --</option>
          {VLM_PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isCustom && (
        <div>
          <label className={labelStyle}>{t('ai.provider')} (custom)</label>
          <input
            type="text"
            value={formData.vlm?.provider ?? ''}
            onChange={(e) => updateField('vlm.provider', e.target.value)}
            className={fieldStyle}
          />
        </div>
      )}

      {provider && (
        <>
          <div>
            <label className={labelStyle}>{t('ai.api_base')}</label>
            <input
              type="text"
              value={formData.vlm?.api_base || ''}
              onChange={(e) => updateField('vlm.api_base', e.target.value)}
              placeholder="https://ark.cn-beijing.volces.com/api/v3"
              className={fieldStyle}
            />
          </div>
          <div>
            <label className={labelStyle}>{t('ai.api_key')}</label>
            <input
              type="password"
              value={formData.vlm?.api_key || ''}
              onChange={(e) => updateField('vlm.api_key', e.target.value)}
              className={fieldStyle}
            />
          </div>
          <div>
            <label className={labelStyle}>{t('ai.model')}</label>
            <input
              type="text"
              value={formData.vlm?.model || ''}
              onChange={(e) => updateField('vlm.model', e.target.value)}
              placeholder="doubao-seed-2-0-pro-260215"
              className={fieldStyle}
            />
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelStyle}>{t('ai.vlm_max_concurrent')}</label>
          <input
            type="number"
            value={formData.vlm?.max_concurrent ?? 100}
            onChange={(e) => updateField('vlm.max_concurrent', parseInt(e.target.value) || 0)}
            min={1} max={1000}
            className={fieldStyle}
          />
        </div>
        <div>
          <label className={labelStyle}>{t('ai.vlm_timeout')}</label>
          <input
            type="number"
            value={formData.vlm?.timeout ?? 60}
            onChange={(e) => updateField('vlm.timeout', parseFloat(e.target.value) || 0)}
            min={1} max={600}
            step={1}
            className={fieldStyle}
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.vlm?.thinking ?? false}
            onChange={(e) => updateField('vlm.thinking', e.target.checked)}
            className="rounded border-border-subtle bg-surface-hover text-aurora-400 focus:ring-aurora-400/30"
          />
          <span className="text-sm text-text-secondary">{t('ai.thinking')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.vlm?.stream ?? false}
            onChange={(e) => updateField('vlm.stream', e.target.checked)}
            className="rounded border-border-subtle bg-surface-hover text-aurora-400 focus:ring-aurora-400/30"
          />
          <span className="text-sm text-text-secondary">{t('ai.vlm_stream')}</span>
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/wizard/VlmStep.tsx
git commit -m "feat: add onboarding VLM config step component"
```

---

### Task 7: Frontend — Create ApiKeyStep component

**Files:**
- Create: `src/components/wizard/ApiKeyStep.tsx`

- [ ] **Step 1: Create ApiKeyStep component**

Write `src/components/wizard/ApiKeyStep.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OvConfig } from '../../lib/types';

interface ApiKeyStepProps {
  formData: Partial<OvConfig>;
  onChange: (data: Partial<OvConfig>) => void;
}

export default function ApiKeyStep({ formData, onChange }: ApiKeyStepProps) {
  const { t } = useTranslation();
  const [showKey, setShowKey] = useState(false);

  const apiKey = formData.server?.root_api_key || '';

  const handleGenerateUuid = () => {
    const uuid = crypto.randomUUID();
    onChange({
      ...formData,
      server: { ...formData.server, root_api_key: uuid, port: formData.server?.port ?? 1933 },
    });
  };

  const handleChange = (value: string) => {
    onChange({
      ...formData,
      server: { ...formData.server, root_api_key: value || null, port: formData.server?.port ?? 1933 },
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-text-primary">{t('wizard.step_apikey')}</h2>

      <div>
        <label className="block text-xs font-semibold text-text-secondary mb-1.5">
          {t('basic.root_api_key')} <span className="text-red-400">*</span>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="550e8400-e29b-41d4-a716-446655440000"
              className="w-full rounded-lg bg-surface-hover border border-border-subtle px-3 py-2.5 pr-10 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-aurora-400/50 transition-colors font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
            >
              {showKey ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={handleGenerateUuid}
            className="rounded-lg bg-surface-elevated hover:bg-surface-hover border border-border-subtle px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap"
          >
            {t('wizard.generate_uuid')}
          </button>
        </div>
      </div>

      <div className="bg-surface-elevated border border-border-subtle rounded-xl px-4 py-3.5 flex items-start gap-3">
        <svg className="h-5 w-5 text-aurora-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-text-primary">{t('wizard.apikey_required')}</p>
          <p className="text-xs text-text-muted mt-1">{t('wizard.apikey_playground_note')}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/wizard/ApiKeyStep.tsx
git commit -m "feat: add onboarding API key step component"
```

---

### Task 8: Frontend — Create OnboardingWizard container

**Files:**
- Create: `src/components/wizard/OnboardingWizard.tsx`

- [ ] **Step 1: Create OnboardingWizard container**

Write `src/components/wizard/OnboardingWizard.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { getDefaultConfigJson } from '../../lib/config-fields';
import type { OvConfig, PythonEnvState } from '../../lib/types';
import WizardProgress from './WizardProgress';
import InstallStep from './InstallStep';
import EmbeddingStep from './EmbeddingStep';
import VlmStep from './VlmStep';
import ApiKeyStep from './ApiKeyStep';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const TOTAL_STEPS = 4;

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [isInstalled, setIsInstalled] = useState(false);
  const [checkingInstall, setCheckingInstall] = useState(true);
  const [error, setError] = useState('');

  // Initialize form data from default config
  const [formData, setFormData] = useState<Partial<OvConfig>>(() => {
    const defaults = JSON.parse(getDefaultConfigJson()) as OvConfig;
    // Ensure local embedding defaults for the wizard
    if (!defaults.embedding?.dense) defaults.embedding = { ...defaults.embedding, dense: {} };
    defaults.embedding.dense = { ...defaults.embedding.dense, provider: 'local' };
    return defaults;
  });

  useEffect(() => {
    invoke<PythonEnvState>('check_openviking_state')
      .then((state) => {
        setIsInstalled(state.installed);
      })
      .catch(() => {
        setIsInstalled(false);
      })
      .finally(() => setCheckingInstall(false));
  }, []);

  // Auto-skip step 0 if already installed
  useEffect(() => {
    if (!checkingInstall && isInstalled && stepIndex === 0) {
      setStepIndex(1);
    }
  }, [checkingInstall, isInstalled, stepIndex]);

  const isLastStep = stepIndex === TOTAL_STEPS - 1;
  const isApiKeyValid = (formData.server?.root_api_key || '') !== '';

  const handleBack = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex((s) => s - 1);
    }
  }, [stepIndex]);

  const handleNext = useCallback(() => {
    // Validate step 3 (API key must be non-empty)
    if (isLastStep && !isApiKeyValid) return;
    if (!isLastStep) {
      setStepIndex((s) => s + 1);
    }
  }, [isLastStep, isApiKeyValid]);

  const handleComplete = async () => {
    setError('');
    try {
      await invoke('write_config', { config: JSON.stringify(formData, null, 2) });
      await invoke('mark_onboarded');
      onComplete();
    } catch (err) {
      setError(String(err));
    }
  };

  if (checkingInstall) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <span className="text-sm tracking-widest text-text-muted">
          {t('app.preparing')}
        </span>
      </div>
    );
  }

  const renderStep = () => {
    switch (stepIndex) {
      case 0:
        return (
          <InstallStep
            isInstalled={isInstalled}
            onInstallComplete={() => setStepIndex(1)}
          />
        );
      case 1:
        return (
          <EmbeddingStep
            formData={formData}
            onChange={(data) => setFormData({ ...formData, ...data })}
          />
        );
      case 2:
        return (
          <VlmStep
            formData={formData}
            onChange={(data) => setFormData({ ...formData, ...data })}
          />
        );
      case 3:
        return (
          <ApiKeyStep
            formData={formData}
            onChange={(data) => setFormData({ ...formData, ...data })}
          />
        );
      default:
        return null;
    }
  };

  // Only show Back/Next for steps 1-3 (not step 0 which has its own flow)
  const showNav = stepIndex > 0;

  return (
    <div className="h-screen flex flex-col bg-surface">
      <header className="flex-shrink-0 border-b border-border-subtle bg-surface-elevated/80 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-aurora-400 to-aurora-600 shadow-lg shadow-aurora-500/20">
              <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-text-primary">{t('wizard.title')}</h1>
              <p className="text-[11px] text-text-muted">Step {stepIndex + 1} of {TOTAL_STEPS}</p>
            </div>
          </div>
          <WizardProgress totalSteps={TOTAL_STEPS} currentStep={stepIndex} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl p-6">
          <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6">
            {renderStep()}
          </div>

          {showNav && (
            <div className="flex justify-between mt-6 gap-3">
              <button
                onClick={handleBack}
                className="rounded-xl bg-surface-elevated hover:bg-surface-hover border border-border-subtle px-6 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                {t('wizard.back')}
              </button>
              {isLastStep ? (
                <button
                  onClick={handleComplete}
                  disabled={!isApiKeyValid}
                  className="rounded-xl bg-aurora-500 hover:bg-aurora-600 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2.5 text-sm font-semibold text-white transition-colors"
                >
                  {t('wizard.complete')}
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="rounded-xl bg-aurora-500 hover:bg-aurora-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors"
                >
                  {t('wizard.next')}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400 flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={handleComplete}
                className="px-3 py-1 bg-red-500/20 text-red-400 rounded-md hover:bg-red-500/30 transition-colors text-xs font-medium"
              >
                {t('embedding_modal.retry')}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/wizard/OnboardingWizard.tsx
git commit -m "feat: add onboarding wizard container with step navigation"
```

---

### Task 9: Frontend — Modify App.tsx to integrate wizard

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update App.tsx to listen for onboarding event and render wizard**

Replace the entire `src/App.tsx` with:

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { getDefaultConfigJson } from './lib/config-fields';
import OnboardingWizard from './components/wizard/OnboardingWizard';
import Dashboard from './components/dashboard/Dashboard';
import ConfigPage from './components/config/ConfigPage';

type Tab = 'overview' | 'config';

function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    invoke<boolean>('is_onboarded')
      .then((onboarded) => {
        setNeedsOnboarding(!onboarded);
      })
      .catch(() => {
        setNeedsOnboarding(false);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (needsOnboarding) return;
    invoke<string>('read_config').catch(() => {
      invoke('write_config', { config: getDefaultConfigJson() }).catch(() => {});
    });
  }, [needsOnboarding]);

  useEffect(() => {
    const updateTitle = () => {
      document.title = t('app.pageTitle');
    };
    updateTitle();
    i18n.on('languageChanged', updateTitle);
    return () => {
      i18n.off('languageChanged', updateTitle);
    };
  }, [i18n, t]);

  const toggleLang = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
  };

  // Show wizard if onboarding needed
  if (needsOnboarding) {
    return <OnboardingWizard onComplete={() => setNeedsOnboarding(false)} />;
  }

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <span className="text-sm tracking-widest text-text-muted">
          {t('app.preparing')}
        </span>
      </div>
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: t('tab.overview') },
    { key: 'config', label: t('tab.config') },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface">
      <header className="flex-shrink-0 border-b border-border-subtle bg-surface-elevated/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-aurora-400 to-aurora-600 shadow-lg shadow-aurora-500/20">
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-text-primary">
                {t('app.title')}
              </h1>
              <p className="text-[11px] font-medium tracking-wider text-text-muted">
                {t('app.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <nav className="flex gap-1 rounded-lg bg-surface/50 p-1">
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`relative rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                    activeTab === key
                      ? 'bg-aurora-500/15 text-aurora-400 shadow-sm'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {activeTab === key && (
                    <span className="absolute inset-0 rounded-md border border-aurora-400/20" />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </nav>
            <button
              onClick={toggleLang}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors border border-border-subtle"
            >
              {i18n.language === 'zh' ? 'EN' : '中'}
            </button>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-aurora-500/20 to-transparent" />
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">
          {activeTab === 'overview' ? <Dashboard /> : <ConfigPage />}
        </div>
      </main>
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Build check**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: integrate onboarding wizard into App.tsx"
```

---

### Task 10: i18n — Add wizard translation keys

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`

- [ ] **Step 1: Add wizard keys to en.json**

In `src/locales/en.json`, before the last closing `}`, add:

```json
  "wizard.title": "Setup Wizard",
  "wizard.step_install": "Install OpenViking",
  "wizard.step_embedding": "Configure Embedding",
  "wizard.step_vlm": "Configure VLM",
  "wizard.step_apikey": "Root API Key",
  "wizard.generate_uuid": "Generate UUID",
  "wizard.apikey_required": "Root API Key is required",
  "wizard.apikey_playground_note": "You need this key to access Playground. Keep it safe.",
  "wizard.next": "Next",
  "wizard.back": "Back",
  "wizard.complete": "Complete Setup",
  "wizard.skip": "Skip for now",
  "wizard.install_progress": "Installing OpenViking...",
  "wizard.already_installed": "OpenViking already installed, skipping...",
  "wizard.provider_local": "Local",
  "wizard.provider_custom": "Custom...",
  "wizard.select_provider": "Select a provider"
```

- [ ] **Step 2: Add wizard keys to zh.json**

In `src/locales/zh.json`, before the last closing `}`, add:

```json
  "wizard.title": "设置向导",
  "wizard.step_install": "安装 OpenViking",
  "wizard.step_embedding": "配置 Embedding",
  "wizard.step_vlm": "配置 VLM",
  "wizard.step_apikey": "Root API Key",
  "wizard.generate_uuid": "生成 UUID",
  "wizard.apikey_required": "Root API Key 为必填项",
  "wizard.apikey_playground_note": "访问 Playground 需要此密钥，请妥善保管。",
  "wizard.next": "下一步",
  "wizard.back": "上一步",
  "wizard.complete": "完成设置",
  "wizard.skip": "暂时跳过",
  "wizard.install_progress": "正在安装 OpenViking...",
  "wizard.already_installed": "OpenViking 已安装，跳过此步骤...",
  "wizard.provider_local": "本地 (Local)",
  "wizard.provider_custom": "自定义...",
  "wizard.select_provider": "选择 Provider"
```

- [ ] **Step 3: Commit**

```bash
git add src/locales/en.json src/locales/zh.json
git commit -m "feat: add wizard i18n keys (en + zh)"
```

---

### Task 11: Script — Create reset-first-run.sh

**Files:**
- Create: `scripts/reset-first-run.sh`

- [ ] **Step 1: Create reset script**

Write `scripts/reset-first-run.sh`:

```bash
#!/bin/bash
# Reset first-run state for testing the onboarding wizard.
#
# Usage:
#   bash scripts/reset-first-run.sh          Reset flags + config only
#   bash scripts/reset-first-run.sh --full   Also delete Python venv

set -e

ONBOARDED_FLAG="$HOME/.openviking/.onboarded"
OV_CONF="$HOME/.openviking/ov.conf"

# macOS app data dir per Tauri conventions
# (matches app.path().app_data_dir() for bundle id com.openviking.desktop)
VENV_DIR="$HOME/Library/Application Support/com.openviking.desktop/python"

echo "Resetting first-run state..."
echo ""

if [ -f "$ONBOARDED_FLAG" ]; then
    rm "$ONBOARDED_FLAG"
    echo "  ✓ Removed $ONBOARDED_FLAG"
else
    echo "  - $ONBOARDED_FLAG (not found)"
fi

if [ -f "$OV_CONF" ]; then
    rm "$OV_CONF"
    echo "  ✓ Removed $OV_CONF"
    if [ -f "${OV_CONF}.bak" ]; then
        rm "${OV_CONF}.bak"
        echo "  ✓ Removed ${OV_CONF}.bak"
    fi
else
    echo "  - $OV_CONF (not found)"
fi

if [ "${1:-}" = "--full" ]; then
    if [ -d "$VENV_DIR" ]; then
        rm -rf "$VENV_DIR"
        echo "  ✓ Removed Python venv: $VENV_DIR"
    else
        echo "  - Python venv (not found): $VENV_DIR"
    fi
fi

echo ""
echo "Done. Next app launch will show the onboarding wizard."
```

- [ ] **Step 2: Make script executable**

```bash
chmod +x scripts/reset-first-run.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/reset-first-run.sh
git commit -m "feat: add first-run reset script for testing"
```

---

### Task 12: Integration — Build and verify

- [ ] **Step 1: Build the project**

```bash
npm run build 2>&1 | tail -15
```

Expected: Build succeeds, no TypeScript errors.

- [ ] **Step 2: Run the reset script and launch app**

```bash
bash scripts/reset-first-run.sh --full
```

Then launch the Tauri app in dev mode:

```bash
npm run tauri dev
```

Expected: The onboarding wizard appears with 4 steps.

- [ ] **Step 3: Verify wizard flow**

1. Step 1: Install button should trigger Python + OpenViking installation
2. Step 2: Embedding provider defaults to "local", switch to "volcengine" to see extra fields
3. Step 3: Select VLM provider, observe conditional fields
4. Step 4: "Generate UUID" fills a random key, "Complete Setup" disabled until key is set
5. Complete: Dashboard renders, `~/.openviking/.onboarded` exists, `ov.conf` written with wizard values

- [ ] **Step 4: Verify wizard does NOT appear on second launch**

Restart the app (no reset). Expected: Dashboard renders directly (no wizard).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final integration verification"
```
