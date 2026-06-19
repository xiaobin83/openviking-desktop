import { useTranslation } from 'react-i18next';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import type { ConfigField } from '../../lib/config-fields';
import type { OvConfig } from '../../lib/types';

interface ConfigFieldProps {
  field: ConfigField;
  value: unknown;
  onChange: (path: string, value: unknown) => void;
}

export function updateConfig(config: OvConfig, path: string, value: unknown): OvConfig {
  const clone = structuredClone(config);
  const keys = path.split('.');
  let obj: Record<string, unknown> = clone as unknown as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!obj[key] || typeof obj[key] !== 'object') {
      obj[key] = {};
    }
    obj = obj[key] as Record<string, unknown>;
  }
  obj[keys[keys.length - 1]] = value;
  return clone;
}

export default function ConfigFieldRenderer({ field, value, onChange }: ConfigFieldProps) {
  const { t } = useTranslation();

  const handleString = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(field.path, e.target.value || undefined);
  };

  const handleNumber = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(field.path, v !== '' ? (field.step && field.step < 1 ? parseFloat(v) : parseInt(v, 10)) : undefined);
  };

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(field.path, e.target.value);
  };

  const handleToggle = () => {
    onChange(field.path, !(value ?? field.defaultValue));
  };

  const inputClass = "w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50";

  const renderField = () => {
    switch (field.type) {
      case 'string':
        return (
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={handleString}
            placeholder={field.placeholder}
            className={inputClass}
          />
        );

      case 'password':
        return (
          <div className="flex gap-2">
            <input
              type="password"
              value={(value as string) ?? ''}
              onChange={handleString}
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={() => writeText((value as string) ?? '')}
              className="px-3 py-2 rounded-md border border-border-subtle bg-surface-elevated text-xs text-text-muted hover:text-text-primary hover:border-border-active transition-colors"
              title="复制"
            >
              复制
            </button>
          </div>
        );

      case 'number': {
        const isSlider = field.min !== undefined && field.max !== undefined && field.step !== undefined && field.path === 'retrieval.threshold';
        if (isSlider) {
          return (
            <div>
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={(value as number) ?? (field.defaultValue as number)}
                onChange={handleNumber}
                className="w-full accent-aurora-500"
              />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>{field.min}</span>
                <span>{(field.max! / 2).toFixed(1)}</span>
                <span>{field.max}</span>
              </div>
            </div>
          );
        }
        return (
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={handleNumber}
            min={field.min}
            max={field.max}
            step={field.step}
            className={inputClass}
          />
        );
      }

      case 'select':
        return (
          <select
            value={(value as string) ?? ''}
            onChange={handleSelect}
            className={inputClass}
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label.startsWith('ai.') || opt.label.startsWith('storage.') || opt.label.startsWith('basic.') || opt.label.startsWith('feishu.') || opt.label.startsWith('advanced.')
                  ? t(opt.label)
                  : opt.label}
              </option>
            ))}
          </select>
        );

      case 'boolean':
        return (
          <button
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              (value ?? field.defaultValue) ? 'bg-aurora-500' : 'bg-text-muted/30'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                (value ?? field.defaultValue) ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        );

      default:
        return null;
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-text-secondary mb-1">
        {t(field.label)}
      </label>
      {renderField()}
      <p className="text-xs text-text-muted mt-1 leading-relaxed">
        {t(field.description)}
      </p>
    </div>
  );
}
