import { useTranslation } from 'react-i18next';
import type { OvConfig } from '../../lib/types';
import { getGroups, getFieldsByTab } from '../../lib/config-fields';
import ConfigFieldRenderer, { updateConfig } from './ConfigField';
import ConfigGroup from './ConfigGroup';

interface AITabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
}

const REMOTE_ONLY_FIELDS = new Set([
  'embedding.dense.api_base',
  'embedding.dense.api_key',
  'embedding.dense.input',
]);

const DIMENSION_PATH = 'embedding.dense.dimension';
const BATCH_SIZE_PATH = 'embedding.dense.batch_size';

function ConfigFields({ config, onChange, group }: { config: OvConfig; onChange: (config: OvConfig) => void; group?: string }) {
  const fields = getFieldsByTab('ai').filter((f) => f.group === group);
  const provider = config.embedding?.dense?.provider;
  const isLocal = provider === 'local';

  const handleChange = (path: string, value: unknown) => {
    let updated = updateConfig(config, path, value);

    if (path === 'embedding.dense.provider') {
      if (value === 'local') {
        const dense = updated.embedding.dense as Record<string, unknown> | undefined;
        if (dense) {
          delete dense.dimension;
          delete dense.batch_size;
        }
      } else {
        updated.embedding.dense = {
          ...updated.embedding.dense,
          dimension: 1024,
          batch_size: 32,
        };
      }
    }

    onChange(updated);
  };

  return (
    <>
      {fields
        .filter((f) => {
          if (f.path === 'embedding.dense.provider') return true;
          if (f.path === 'embedding.dense.model') return true;
          if (f.path === 'embedding.dense.model_path') return true;
          if (isLocal && REMOTE_ONLY_FIELDS.has(f.path)) return false;
          if (isLocal && (f.path === DIMENSION_PATH || f.path === BATCH_SIZE_PATH)) return false;
          return true;
        })
        .map((field) => {
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
    </>
  );
}

export default function AITab({ config, onChange }: AITabProps) {
  const { t } = useTranslation();
  const groups = getGroups('ai');

  const groupLabels: Record<string, string> = {
    dense: t('ai.dense_embedding'),
    embedding_settings: t('ai.embedding_settings'),
    circuit_breaker: t('ai.circuit_breaker'),
    vlm: t('ai.vlm'),
  };

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <ConfigGroup key={group} title={groupLabels[group] ?? group}>
          <ConfigFields config={config} onChange={onChange} group={group} />
        </ConfigGroup>
      ))}
    </div>
  );
}
