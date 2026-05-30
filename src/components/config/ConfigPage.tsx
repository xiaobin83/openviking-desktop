import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { OvConfig } from '../../lib/types';
import BasicTab from './BasicTab';
import AITab from './AITab';
import StorageTab from './StorageTab';
import AdvancedTab from './AdvancedTab';

type SubTab = 'basic' | 'ai' | 'storage' | 'advanced';

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

const DEFAULT_CONFIG: OvConfig = {
  server: { host: '127.0.0.1', port: 1933 },
  storage: { workspace: '~/.openviking/data', vectordb: { backend: 'local' }, agfs: { backend: 'local' } },
  embedding: { model: 'doubao-embedding-large' },
  llm: { model: 'openai/gpt-4o' },
  vlm: {},
  retrieval: { top_k: 10, threshold: 0.5 },
  encryption: { enabled: false },
  log: { level: 'INFO' },
};

export default function ConfigPage() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('basic');
  const [config, setConfig] = useState<OvConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    invoke<string>('read_config')
      .then((content) => {
        try {
          const parsed = JSON.parse(content) as OvConfig;
          setConfig(deepMerge(DEFAULT_CONFIG, parsed));
        } catch {
          setError('配置格式错误');
        }
      })
      .catch(() => setError('读取配置失败'));
  }, []);

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
    { key: 'basic', label: '基础' },
    { key: 'ai', label: 'AI 模型' },
    { key: 'storage', label: '存储' },
    { key: 'advanced', label: '高级' },
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
            重置为默认配置
          </button>
        </div>
      )}

      {activeSubTab === 'basic' && <BasicTab config={config} onChange={setConfig} />}
      {activeSubTab === 'ai' && <AITab config={config} onChange={setConfig} />}
      {activeSubTab === 'storage' && <StorageTab config={config} onChange={setConfig} />}
      {activeSubTab === 'advanced' && <AdvancedTab config={config} onChange={setConfig} />}

      <div className="pt-4 border-t border-border-subtle flex items-center gap-3">
        <button
          onClick={handleSave}
          className="px-5 py-2 bg-aurora-500/15 text-aurora-400 rounded-md text-sm font-medium hover:bg-aurora-500/25 transition-colors"
        >
          保存配置
        </button>
        {saved && (
          <span className="text-sm text-green-400">
            配置已保存，需重启服务生效
          </span>
        )}
      </div>
    </div>
  );
}
