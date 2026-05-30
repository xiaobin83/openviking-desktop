import type { OvConfig, DenseEmbeddingConfig, VlmConfig } from '../../lib/types';

interface AITabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
}

function DenseEmbeddingGroup({ dense, onChange }: {
  dense: DenseEmbeddingConfig;
  onChange: (path: string, value: string | number | boolean | undefined) => void;
}) {
  return (
    <div className="border border-border-subtle rounded-lg bg-surface-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-text-primary mb-2">嵌入模型 (Dense Embedding)</h3>
      <div>
        <label className="block text-sm text-text-secondary mb-1">Provider</label>
        <input
          type="text"
          value={dense.provider ?? ''}
          onChange={(e) => onChange('embedding.dense.provider', e.target.value || undefined)}
          placeholder="volcengine / openai / jina / ..."
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div>
        <label className="block text-sm text-text-secondary mb-1">API 基础地址 (api_base)</label>
        <input
          type="text"
          value={dense.api_base ?? ''}
          onChange={(e) => onChange('embedding.dense.api_base', e.target.value || undefined)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div>
        <label className="block text-sm text-text-secondary mb-1">API 密钥</label>
        <input
          type="password"
          value={dense.api_key ?? ''}
          onChange={(e) => onChange('embedding.dense.api_key', e.target.value || undefined)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div>
        <label className="block text-sm text-text-secondary mb-1">模型 (model)</label>
        <input
          type="text"
          value={dense.model ?? ''}
          onChange={(e) => onChange('embedding.dense.model', e.target.value || undefined)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div>
        <label className="block text-sm text-text-secondary mb-1">向量维度 (dimension)</label>
        <input
          type="number"
          value={dense.dimension ?? ''}
          onChange={(e) => onChange('embedding.dense.dimension', e.target.value ? parseInt(e.target.value) : undefined)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div>
        <label className="block text-sm text-text-secondary mb-1">输入类型 (input)</label>
        <select
          value={dense.input ?? ''}
          onChange={(e) => onChange('embedding.dense.input', e.target.value || undefined)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        >
          <option value="">自动</option>
          <option value="text">text</option>
          <option value="multimodal">multimodal</option>
        </select>
      </div>
    </div>
  );
}

function VlmGroup({ vlm, onChange }: {
  vlm: VlmConfig;
  onChange: (path: string, value: string | number | boolean | undefined) => void;
}) {
  return (
    <div className="border border-border-subtle rounded-lg bg-surface-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-text-primary mb-2">视觉语言模型 (VLM)</h3>
      <div>
        <label className="block text-sm text-text-secondary mb-1">Provider</label>
        <input
          type="text"
          value={vlm.provider ?? ''}
          onChange={(e) => onChange('vlm.provider', e.target.value || undefined)}
          placeholder="volcengine / openai / openai-codex / kimi / glm"
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div>
        <label className="block text-sm text-text-secondary mb-1">API 基础地址 (api_base)</label>
        <input
          type="text"
          value={vlm.api_base ?? ''}
          onChange={(e) => onChange('vlm.api_base', e.target.value || undefined)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div>
        <label className="block text-sm text-text-secondary mb-1">API 密钥</label>
        <input
          type="password"
          value={vlm.api_key ?? ''}
          onChange={(e) => onChange('vlm.api_key', e.target.value || undefined)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div>
        <label className="block text-sm text-text-secondary mb-1">模型 (model)</label>
        <input
          type="text"
          value={vlm.model ?? ''}
          onChange={(e) => onChange('vlm.model', e.target.value || undefined)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div>
        <label className="block text-sm text-text-secondary mb-1">最大重试次数 (max_retries)</label>
        <input
          type="number"
          value={vlm.max_retries ?? ''}
          onChange={(e) => onChange('vlm.max_retries', e.target.value !== '' ? parseInt(e.target.value) : undefined)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-text-secondary">思考模式 (thinking)</label>
        <button
          onClick={() => onChange('vlm.thinking', !vlm.thinking)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            vlm.thinking ? 'bg-aurora-500' : 'bg-text-muted/30'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              vlm.thinking ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

export default function AITab({ config, onChange }: AITabProps) {
  const update = (path: string, value: string | number | boolean | undefined) => {
    const clone = structuredClone(config);
    const keys = path.split('.');
    let obj: Record<string, unknown> = clone as unknown as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') {
        (obj as Record<string, unknown>)[keys[i]] = {};
      }
      obj = obj[keys[i]] as Record<string, unknown>;
    }
    obj[keys[keys.length - 1]] = value;
    onChange(clone);
  };

  const embeddingDense = config.embedding.dense ?? {};
  const vlm = config.vlm ?? {};

  return (
    <div className="space-y-4">
      <DenseEmbeddingGroup dense={embeddingDense} onChange={update} />
      <VlmGroup vlm={vlm} onChange={update} />
    </div>
  );
}
