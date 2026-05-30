import type { OvConfig } from '../../lib/types';

interface AdvancedTabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
}

type PathValue = string | number | boolean | string[];

export default function AdvancedTab({ config, onChange }: AdvancedTabProps) {
  const update = (path: string, value: PathValue) => {
    const clone = structuredClone(config);
    const keys = path.split('.');
    let obj: Record<string, unknown> = clone as unknown as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]] as Record<string, unknown>;
    }
    obj[keys[keys.length - 1]] = value;
    onChange(clone);
  };

  const isObservabilityEnabled = !!(
    config.server.observability?.metrics?.enabled
  );

  const toggleObservability = () => {
    const clone = structuredClone(config);
    if (!clone.server.observability) {
      clone.server.observability = { metrics: { enabled: true } };
    } else if (!clone.server.observability.metrics) {
      clone.server.observability.metrics = { enabled: true };
    } else {
      clone.server.observability.metrics.enabled = !clone.server.observability.metrics.enabled;
    }
    onChange(clone);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          检索 Top-K
        </label>
        <input
          type="number"
          value={config.retrieval.top_k}
          onChange={(e) => update('retrieval.top_k', parseInt(e.target.value) || 10)}
          min={1}
          max={100}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          检索相似度阈值 ({config.retrieval.threshold})
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={config.retrieval.threshold}
          onChange={(e) => update('retrieval.threshold', parseFloat(e.target.value))}
          className="w-full accent-aurora-500"
        />
        <div className="flex justify-between text-xs text-text-muted mt-1">
          <span>0</span>
          <span>0.5</span>
          <span>1</span>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">CORS 允许来源</label>
        <input
          type="text"
          value={(config.server.cors_origins ?? ['*']).join(', ')}
          onChange={(e) => update('server.cors_origins', e.target.value.split(',').map(s => s.trim()))}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-text-secondary">启用可观测性</label>
        <button
          onClick={toggleObservability}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            isObservabilityEnabled ? 'bg-aurora-500' : 'bg-text-muted/30'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isObservabilityEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
