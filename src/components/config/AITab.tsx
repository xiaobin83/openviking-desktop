import type { OvConfig } from '../../lib/types';

interface AITabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
}

function ModelGroup({ title, prefix, model, baseUrl, apiKey, onChange }: {
  title: string;
  prefix: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  onChange: (path: string, value: string) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
      <div>
        <label className="block text-sm text-gray-600 mb-1">模型</label>
        <input
          type="text"
          value={model}
          onChange={(e) => onChange(`${prefix}.model`, e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">API 基础地址</label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => onChange(`${prefix}.base_url`, e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">API 密钥</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onChange(`${prefix}.api_key`, e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </div>
  );
}

export default function AITab({ config, onChange }: AITabProps) {
  const update = (path: string, value: string) => {
    const clone = structuredClone(config);
    const keys = path.split('.');
    let obj: Record<string, unknown> = clone as unknown as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]] as Record<string, unknown>;
    }
    obj[keys[keys.length - 1]] = value || null;
    onChange(clone);
  };

  return (
    <div className="space-y-4">
      <ModelGroup
        title="嵌入模型 (Embedding)"
        prefix="embedding"
        model={config.embedding.model}
        baseUrl={config.embedding.base_url ?? ''}
        apiKey={config.embedding.api_key ?? ''}
        onChange={update}
      />
      <ModelGroup
        title="语言模型 (LLM)"
        prefix="llm"
        model={config.llm.model}
        baseUrl={config.llm.base_url ?? ''}
        apiKey={config.llm.api_key ?? ''}
        onChange={update}
      />
      <ModelGroup
        title="视觉模型 (VLM)"
        prefix="vlm"
        model={config.vlm.model ?? ''}
        baseUrl={config.vlm.base_url ?? ''}
        apiKey={config.vlm.api_key ?? ''}
        onChange={update}
      />
    </div>
  );
}
