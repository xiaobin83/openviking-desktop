import { useTranslation } from 'react-i18next';
import type { OvConfig } from '../../lib/types';
import { getGroups, getFieldsByTab } from '../../lib/config-fields';
import ConfigFieldRenderer, { updateConfig } from './ConfigField';
import ConfigGroup from './ConfigGroup';

interface AITabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
}

function ConfigFields({ config, onChange, group }: { config: OvConfig; onChange: (config: OvConfig) => void; group?: string }) {
  const fields = getFieldsByTab('ai').filter((f) => f.group === group);
  const handleChange = (path: string, value: unknown) => {
    onChange(updateConfig(config, path, value));
  };

  return (
    <>
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
