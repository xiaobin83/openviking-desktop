import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { dirname } from '../../lib/path';
import type { OvConfig } from '../../lib/types';

const isWindows = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform);
const FALLBACK_WORKSPACE = isWindows ? '%USERPROFILE%\\OpenViking' : '~/.openviking';

interface WorkspaceStepProps {
  formData: Partial<OvConfig>;
  onChange: (data: Partial<OvConfig>) => void;
}

export interface WorkspaceStepHandle {
  /** Persist the current draft path (create dirs + update formData). Returns data path. */
  persist: () => Promise<string>;
}

const WorkspaceStep = forwardRef<WorkspaceStepHandle, WorkspaceStepProps>(
  function WorkspaceStep({ formData, onChange }, ref) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const initialised = useRef(false);

  // 组件挂载时获取平台默认工作目录并同步到 Rust ServerState，
  // 确保后续 write_config 写入正确的 ov.conf 路径。
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const preFilledWorkspace = formData.storage?.workspace;
    if (preFilledWorkspace?.trim()) {
      // formData.storage.workspace is the data path (<workspace>/data);
      // the input field expects the working directory (parent of data).
      const workingDir = dirname(preFilledWorkspace);
      setDraft(workingDir);
      return;
    }
    invoke<string>('get_default_workspace')
      .then((defaultPath) => {
        setDraft(defaultPath);
        persistWorkspace(defaultPath).catch(() => {});
      })
      .catch(() => {
        setDraft(FALLBACK_WORKSPACE);
        persistWorkspace(FALLBACK_WORKSPACE).catch(() => {});
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBrowse = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('basic.workspace_browse_title'),
    });
    if (selected) {
      setDraft(selected);
      try {
        await persistWorkspace(selected);
      } catch {}
    }
  };

  const persistWorkspace = async (path: string) => {
    // Propagate set_workspace errors so caller can detect invalid paths
    await invoke('set_workspace', { path });
    // Get properly joined data path from Rust (uses Path::join, not string concat)
    try {
      const dataPath = await invoke<string>('get_workspace_data_path');
      onChange({
        ...formData,
        storage: { workspace: dataPath, vectordb: { backend: 'local' }, agfs: { backend: 'local' } },
      });
    } catch {}
  };

  // Expose persist() so parent (OnboardingWizard) can trigger directory creation on "Next"
  useImperativeHandle(ref, () => ({
    persist: async () => {
      if (!draft.trim()) throw new Error('Workspace path is empty');
      await persistWorkspace(draft);
      const dataPath = await invoke<string>('get_workspace_data_path');
      return dataPath;
    },
  }), [draft, formData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (value: string) => {
    setDraft(value);
    // Do NOT persist on every keystroke — defer to parent's "Next" handler
  };

  const fieldStyle = "w-full rounded-lg bg-surface-hover border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-aurora-400/50 transition-colors";
  const labelStyle = "block text-xs font-semibold text-text-secondary mb-1.5";

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-text-primary">{t('wizard.workspace_title')}</h2>
      <p className="text-sm text-text-muted">{t('wizard.workspace_hint')}</p>

      <div>
        <label className={labelStyle}>{t('wizard.workspace_label')}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={t('wizard.workspace_placeholder')}
            className={fieldStyle + " flex-1"}
          />
          <button
            onClick={handleBrowse}
            className="rounded-lg bg-surface-elevated hover:bg-surface-hover border border-border-subtle px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap"
          >
            {t('basic.workspace_browse')}
          </button>
        </div>
      </div>
    </div>
  );
});

export default WorkspaceStep;
