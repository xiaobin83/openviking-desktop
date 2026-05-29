import type { OvConfig } from '../../lib/types';

interface StorageTabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
}

export default function StorageTab({ config, onChange }: StorageTabProps) {
  const update = (path: string, value: string | boolean) => {
    const clone = structuredClone(config);
    const keys = path.split('.');
    let obj: Record<string, unknown> = clone as unknown as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]] as Record<string, unknown>;
    }
    obj[keys[keys.length - 1]] = value;
    onChange(clone);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">向量数据库后端</label>
        <select
          value={config.storage.vectordb.backend}
          onChange={(e) => update('storage.vectordb.backend', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="local">local</option>
          <option value="chroma">chroma</option>
          <option value="milvus">milvus</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">AGFS 存储后端</label>
        <select
          value={config.storage.agfs.backend}
          onChange={(e) => update('storage.agfs.backend', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="local">local</option>
          <option value="s3">s3</option>
        </select>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">加密存储</label>
        <button
          onClick={() => update('encryption.enabled', !config.encryption.enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            config.encryption.enabled ? 'bg-indigo-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              config.encryption.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
