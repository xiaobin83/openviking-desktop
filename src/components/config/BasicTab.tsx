import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import type { OvConfig } from '../../lib/types';
import { getFieldsByTab } from '../../lib/config-fields';
import ConfigFieldRenderer, { updateConfig } from './ConfigField';

interface BasicTabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
  workspace: string;
  onApplyWorkspace: (workspace: string) => Promise<boolean>;
}

export default function BasicTab({ config, onChange, workspace, onApplyWorkspace }: BasicTabProps) {
  const { t } = useTranslation();
  const fields = getFieldsByTab('basic');
  const [draft, setDraft] = useState(workspace);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setDraft(workspace);
  }, [workspace]);

  const handleChange = (path: string, value: unknown) => {
    onChange(updateConfig(config, path, value));
  };

  const handleBrowse = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('basic.workspace_browse_title'),
    });
    if (selected) {
      setDraft(selected);
    }
  };

  const handleApply = async () => {
    if (draft === workspace) return;
    setApplying(true);
    const ok = await onApplyWorkspace(draft);
    setApplying(false);
    if (!ok) {
      setDraft(workspace);
    }
  };

  const isDirty = draft !== workspace;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">{t('basic.workspace')}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('basic.workspace_placeholder')}
            className="flex-1 px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
          />
          <button
            onClick={handleBrowse}
            className="px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors whitespace-nowrap"
          >
            {t('basic.workspace_browse')}
          </button>
          {isDirty && (
            <button
              onClick={handleApply}
              disabled={applying}
              className="px-3 py-2 bg-aurora-500/15 text-aurora-400 rounded-md text-sm font-medium hover:bg-aurora-500/25 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {applying ? '...' : t('basic.workspace_apply')}
            </button>
          )}
        </div>
        <p className="text-xs text-text-secondary mt-1">
          {t('basic.workspace_hint')}
        </p>
      </div>
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
    </div>
  );
}
