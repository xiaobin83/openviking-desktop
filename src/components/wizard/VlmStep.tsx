import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OvConfig } from '../../lib/types';

interface VlmStepProps {
  formData: Partial<OvConfig>;
  onChange: (data: Partial<OvConfig>) => void;
}

const VLM_PROVIDER_OPTIONS = [
  { label: 'Volcengine', value: 'volcengine' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'OpenAI-Codex', value: 'openai-codex' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'Kimi', value: 'kimi' },
  { label: 'GLM', value: 'glm' },
  { label: 'wizard.provider_custom', value: '_custom' },
];

const PREDEFINED_VALUES = VLM_PROVIDER_OPTIONS.map((o) => o.value);

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string; apiKeyPlaceholder: string; website: string }> = {
  volcengine: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-2-0-pro-260215',
    apiKeyPlaceholder: 'API Key',
    website: 'https://console.volcengine.com/ark',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.4',
    apiKeyPlaceholder: 'sk-...',
    website: 'https://platform.openai.com',
  },
  'openai-codex': {
    baseUrl: 'https://api.openai.com/v1',
    model: 'o5-mini',
    apiKeyPlaceholder: 'sk-...',
    website: 'https://platform.openai.com',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    apiKeyPlaceholder: 'sk-xxxxx',
    website: 'https://platform.deepseek.com',
  },
  kimi: {
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-latest',
    apiKeyPlaceholder: 'API Key',
    website: 'https://platform.moonshot.cn',
  },
  glm: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-5',
    apiKeyPlaceholder: 'API Key',
    website: 'https://open.bigmodel.cn',
  },
};

export default function VlmStep({ formData, onChange }: VlmStepProps) {
  const { t } = useTranslation();
  const [selectedOption, setSelectedOption] = useState(() => {
    const p = formData.vlm?.provider || '';
    if (p && !PREDEFINED_VALUES.includes(p)) return '_custom';
    return p || 'volcengine';
  });

  const isCustom = selectedOption === '_custom';
  const providerDefaults = selectedOption !== '_custom' ? PROVIDER_DEFAULTS[selectedOption] : null;

  const updateField = (path: string, value: unknown) => {
    const parts = path.split('.');
    const newData = JSON.parse(JSON.stringify(formData));
    let obj = newData;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    onChange(newData);
  };

  const handleProviderChange = (val: string) => {
    setSelectedOption(val);
    if (val === '_custom') {
      onChange({
        ...formData,
        vlm: { ...formData.vlm, provider: '' },
      });
      return;
    }
    const defaults = PROVIDER_DEFAULTS[val];
    onChange({
      ...formData,
      vlm: {
        ...formData.vlm,
        provider: val,
        api_base: defaults?.baseUrl || '',
        model: defaults?.model || '',
        api_key: formData.vlm?.api_key || '',
        max_retries: formData.vlm?.max_retries ?? 3,
        max_concurrent: formData.vlm?.max_concurrent ?? 100,
        timeout: formData.vlm?.timeout ?? 60,
        thinking: formData.vlm?.thinking ?? false,
        stream: formData.vlm?.stream ?? false,
      },
    });
  };

  const fieldStyle = "w-full rounded-lg bg-surface-hover border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-aurora-400/50 transition-colors";
  const labelStyle = "block text-xs font-semibold text-text-secondary mb-1.5";

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-text-primary">{t('wizard.step_vlm')}</h2>
      <p className="text-sm text-text-muted">{t('ai.vlm_provider_desc')}</p>

      <div>
        <label className={labelStyle}>{t('ai.provider')}</label>
        <select
          value={selectedOption}
          onChange={(e) => handleProviderChange(e.target.value)}
          className={fieldStyle}
        >
          {VLM_PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label.startsWith('wizard.') ? t(opt.label) : opt.label}
            </option>
          ))}
        </select>
      </div>

      {isCustom && (
        <div className="space-y-4 border-t border-border-subtle pt-4">
          <p className="text-xs text-text-muted font-medium">{t('wizard.custom_provider_fields')}</p>
          <div>
            <label className={labelStyle}>{t('ai.provider')}</label>
            <input
              type="text"
              value={formData.vlm?.provider || ''}
              onChange={(e) => updateField('vlm.provider', e.target.value)}
              placeholder="e.g. my-provider"
              className={fieldStyle}
            />
          </div>
          <div>
            <label className={labelStyle}>{t('ai.model')}</label>
            <input
              type="text"
              value={formData.vlm?.model || ''}
              onChange={(e) => updateField('vlm.model', e.target.value)}
              placeholder="model-name"
              className={fieldStyle}
            />
          </div>
          <div>
            <label className={labelStyle}>{t('ai.api_base')}</label>
            <input
              type="text"
              value={formData.vlm?.api_base || ''}
              onChange={(e) => updateField('vlm.api_base', e.target.value)}
              placeholder="https://api.example.com/v1"
              className={fieldStyle}
            />
          </div>
          <div>
            <label className={labelStyle}>{t('ai.api_key')}</label>
            <input
              type="password"
              value={formData.vlm?.api_key || ''}
              onChange={(e) => updateField('vlm.api_key', e.target.value)}
              className={fieldStyle}
            />
          </div>
        </div>
      )}

      {!isCustom && selectedOption && providerDefaults && (
        <>
          {providerDefaults.website && (
            <a
              href={providerDefaults.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-aurora-400 hover:text-aurora-300 underline transition-colors"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              {providerDefaults.website}
            </a>
          )}
          <div>
            <label className={labelStyle}>{t('ai.api_base')}</label>
            <input
              type="text"
              value={formData.vlm?.api_base || ''}
              onChange={(e) => updateField('vlm.api_base', e.target.value)}
              placeholder={providerDefaults.baseUrl}
              className={fieldStyle}
            />
          </div>
          <div>
            <label className={labelStyle}>{t('ai.api_key')}</label>
            <input
              type="password"
              value={formData.vlm?.api_key || ''}
              onChange={(e) => updateField('vlm.api_key', e.target.value)}
              placeholder={providerDefaults.apiKeyPlaceholder}
              className={fieldStyle}
            />
          </div>
          <div>
            <label className={labelStyle}>{t('ai.model')}</label>
            <input
              type="text"
              value={formData.vlm?.model || ''}
              onChange={(e) => updateField('vlm.model', e.target.value)}
              placeholder={providerDefaults.model}
              className={fieldStyle}
            />
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelStyle}>{t('ai.vlm_max_concurrent')}</label>
          <input
            type="number"
            value={formData.vlm?.max_concurrent ?? 100}
            onChange={(e) => updateField('vlm.max_concurrent', parseInt(e.target.value) || 0)}
            min={1} max={1000}
            className={fieldStyle}
          />
        </div>
        <div>
          <label className={labelStyle}>{t('ai.vlm_timeout')}</label>
          <input
            type="number"
            value={formData.vlm?.timeout ?? 60}
            onChange={(e) => updateField('vlm.timeout', parseFloat(e.target.value) || 0)}
            min={1} max={600}
            step={1}
            className={fieldStyle}
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.vlm?.thinking ?? false}
            onChange={(e) => updateField('vlm.thinking', e.target.checked)}
            className="rounded border-border-subtle bg-surface-hover text-aurora-400 focus:ring-aurora-400/30"
          />
          <span className="text-sm text-text-secondary">{t('ai.thinking')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.vlm?.stream ?? false}
            onChange={(e) => updateField('vlm.stream', e.target.checked)}
            className="rounded border-border-subtle bg-surface-hover text-aurora-400 focus:ring-aurora-400/30"
          />
          <span className="text-sm text-text-secondary">{t('ai.vlm_stream')}</span>
        </label>
      </div>
    </div>
  );
}
