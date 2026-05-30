import { useTranslation } from 'react-i18next';
import type { OvConfig } from '../../lib/types';
import { getFieldsByTab } from '../../lib/config-fields';
import ConfigFieldRenderer, { updateConfig } from './ConfigField';

interface FeishuTabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
}

export default function FeishuTab({ config, onChange }: FeishuTabProps) {
  const { t } = useTranslation();
  const fields = getFieldsByTab('feishu');

  const handleChange = (path: string, value: unknown) => {
    onChange(updateConfig(config, path, value));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary mb-2">{t('feishu.tab_hint')}</p>
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
