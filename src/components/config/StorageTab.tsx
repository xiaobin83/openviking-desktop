import { useTranslation } from 'react-i18next';
import type { OvConfig } from '../../lib/types';

interface StorageTabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
}

export default function StorageTab({ config, onChange }: StorageTabProps) {
  const { t } = useTranslation();
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
        <label className="block text-sm font-medium text-text-secondary mb-1">{t('storage.vector_db_name')}</label>
        <input
          type="text"
          value={config.storage.vectordb.name ?? 'context'}
          onChange={(e) => update('storage.vectordb.name', e.target.value)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">{t('storage.vector_db_backend')}</label>
        <select
          value={config.storage.vectordb.backend}
          onChange={(e) => update('storage.vectordb.backend', e.target.value)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        >
          <option value="local">local</option>
          <option value="chroma">chroma</option>
          <option value="milvus">milvus</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">{t('storage.agfs_backend')}</label>
        <select
          value={config.storage.agfs.backend}
          onChange={(e) => update('storage.agfs.backend', e.target.value)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        >
          <option value="local">local</option>
          <option value="s3">s3</option>
        </select>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-text-secondary">{t('storage.encryption')}</label>
        <button
          onClick={() => update('encryption.enabled', !(config.encryption?.enabled ?? false))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            (config.encryption?.enabled ?? false) ? 'bg-aurora-500' : 'bg-text-muted/30'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              (config.encryption?.enabled ?? false) ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
