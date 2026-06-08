import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { OvConfig } from '../../lib/types';

interface WorkspaceStepProps {
  formData: Partial<OvConfig>;
  onChange: (data: Partial<OvConfig>) => void;
}

export default function WorkspaceStep({ formData, onChange }: WorkspaceStepProps) {
  const { t } = useTranslation();
  const workspace = formData.storage?.workspace || '~/.openviking/data';
  const [draft, setDraft] = useState(workspace);

  const handleBrowse = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('basic.workspace_browse_title'),
    });
    if (selected) {
      setDraft(selected);
      persistWorkspace(selected);
    }
  };

  const persistWorkspace = async (path: string) => {
    try {
      await invoke('set_workspace', { path });
    } catch {}
    onChange({
      ...formData,
      storage: { workspace: path, vectordb: { backend: 'local' }, agfs: { backend: 'local' } },
    });
  };

  const handleChange = (value: string) => {
    setDraft(value);
    persistWorkspace(value);
  };

  const fieldStyle = "w-full rounded-lg bg-surface-hover border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-aurora-400/50 transition-colors";
  const labelStyle = "block text-xs font-semibold text-text-secondary mb-1.5";

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-text-primary">Workspace</h2>
      <p className="text-sm text-text-muted">{t('basic.workspace_hint')}</p>

      <div>
        <label className={labelStyle}>{t('basic.workspace')}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={t('basic.workspace_placeholder')}
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
}
