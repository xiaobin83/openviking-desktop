import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import type { OvConfig } from '../../lib/types';
import { DEFAULT_CONFIG, getDefaultConfigJson } from '../../lib/config-fields';
import BasicTab from './BasicTab';
import AITab from './AITab';
import StorageTab from './StorageTab';
import AdvancedTab from './AdvancedTab';
import FeishuTab from './FeishuTab';

type SubTab = 'basic' | 'ai' | 'storage' | 'advanced' | 'feishu';

function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      (result as Record<string, unknown>)[key as string] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else if (sourceVal !== undefined) {
      (result as Record<string, unknown>)[key as string] = sourceVal;
    }
  }
  return result;
}

export default function ConfigPage() {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('basic');
  const [config, setConfig] = useState<OvConfig>(DEFAULT_CONFIG);
  const [workspace, setWorkspace] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const loadConfig = () => {
    invoke<string>('read_config')
      .then((content) => {
        try {
          const parsed = JSON.parse(content) as OvConfig;
          setConfig(deepMerge(DEFAULT_CONFIG, parsed));
        } catch {
          setError(t('config.parse_error'));
        }
      })
      .catch(() => {
        /* no workspace yet or config not found */
      });
  };

  useEffect(() => {
    invoke<string>('get_workspace')
      .then((ws) => {
        setWorkspace(ws);
      })
      .catch(() => {
        /* workspace not set, use default */;
      })
      .finally(() => {
        loadConfig();
      });
  }, []);

  const handleWorkspaceChange = async (newWorkspace: string) => {
    setError('');
    setWorkspace(newWorkspace);
    try {
      await invoke('set_workspace', { path: newWorkspace });
      await invoke<string>('read_config').catch(() =>
        invoke('write_config', { config: getDefaultConfigJson() })
      );
      loadConfig();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleSave = async () => {
    setError('');
    const json = JSON.stringify(config, null, 2);
    try {
      await invoke('write_config', { config: json });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(String(err));
    }
  };

  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: 'basic', label: t('config.subtab.basic') },
    { key: 'ai', label: t('config.subtab.ai') },
    { key: 'storage', label: t('config.subtab.storage') },
    { key: 'advanced', label: t('config.subtab.advanced') },
    { key: 'feishu', label: t('config.subtab.feishu') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border-subtle pb-3">
        {SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveSubTab(key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeSubTab === key
                ? 'bg-aurora-500/15 text-aurora-400'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-md px-4 py-3 text-sm text-red-400">
          {error}
          <button
            onClick={async () => {
              await invoke('write_config', { config: JSON.stringify(DEFAULT_CONFIG, null, 2) });
              setConfig(DEFAULT_CONFIG);
              setError('');
            }}
            className="ml-3 underline hover:no-underline"
          >
            {t('config.reset_to_default')}
          </button>
        </div>
      )}

      {activeSubTab === 'basic' && (
        <BasicTab
          config={config}
          onChange={setConfig}
          workspace={workspace}
          onWorkspaceChange={handleWorkspaceChange}
        />
      )}
      {activeSubTab === 'ai' && <AITab config={config} onChange={setConfig} />}
      {activeSubTab === 'storage' && <StorageTab config={config} onChange={setConfig} />}
      {activeSubTab === 'advanced' && <AdvancedTab config={config} onChange={setConfig} />}
      {activeSubTab === 'feishu' && <FeishuTab config={config} onChange={setConfig} />}

      <div className="pt-4 border-t border-border-subtle flex items-center gap-3">
        <button
          onClick={handleSave}
          className="px-5 py-2 bg-aurora-500/15 text-aurora-400 rounded-md text-sm font-medium hover:bg-aurora-500/25 transition-colors"
        >
          {t('config.save')}
        </button>
        {saved && (
          <span className="text-sm text-green-400">
            {t('config.saved_tip')}
          </span>
        )}
      </div>
    </div>
  );
}
