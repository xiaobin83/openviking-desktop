import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { OvConfig } from '../../lib/types';

interface EmbeddingStepProps {
  formData: Partial<OvConfig>;
  onChange: (data: Partial<OvConfig>) => void;
  hasLocalEmbed: boolean;
}

const PROVIDER_OPTIONS = [
  { label: 'wizard.provider_local', value: 'local' },
  { label: 'volcengine', value: 'volcengine' },
  { label: 'openai', value: 'openai' },
  { label: 'jina', value: 'jina' },
  { label: 'gemini', value: 'gemini' },
  { label: 'dashscope', value: 'dashscope' },
  { label: 'vikingdb', value: 'vikingdb' },
];

const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  local: 'bge-small-zh-v1.5-f16',
  volcengine: 'doubao-embedding-vision-251215',
  openai: 'text-embedding-3-small',
  jina: 'jina-embeddings-v3',
  gemini: 'text-embedding-004',
  dashscope: 'text-embedding-v3',
};

export default function EmbeddingStep({ formData, onChange, hasLocalEmbed }: EmbeddingStepProps) {
  const { t } = useTranslation();

  const visibleProviders = hasLocalEmbed
    ? PROVIDER_OPTIONS
    : PROVIDER_OPTIONS.filter((opt) => opt.value !== 'local');

  const provider = formData.embedding?.dense?.provider || (hasLocalEmbed ? 'local' : 'volcengine');
  const isLocal = provider === 'local';
  const isLocalOrVikingdb = isLocal || provider === 'vikingdb';

  useEffect(() => {
    // 若当前 provider 不支持，回退到 volcengine
    let effectiveProvider = provider;
    if (effectiveProvider === 'local' && !hasLocalEmbed) {
      effectiveProvider = 'volcengine';
    }

    const dense = { ...formData.embedding?.dense };
    const defaultModel = PROVIDER_DEFAULT_MODEL[effectiveProvider];
    if (!defaultModel) return;

    const updated: any = { ...dense, provider: effectiveProvider };

    // 切换 provider 时总是更新 model
    updated.model = defaultModel;

    if (effectiveProvider === 'local') {
      delete updated.api_key;
      delete updated.api_base;
      updated.dimension = 512;
    } else {
      delete updated.model_path;
      if (dense.provider === 'local') {
        // 从 local 切换到其他 provider 时，重置 dimension
        updated.dimension = effectiveProvider === 'vikingdb' ? 512 : 1024;
      }
      if (updated.dimension === undefined) updated.dimension = 1024;
      if (updated.batch_size === undefined) updated.batch_size = 32;
    }

    // 只在有实际变更时才触发
    const prev = formData.embedding?.dense;
    const normalize = (obj: any) => JSON.stringify({
      model_path: obj?.model_path || '',
      api_key: obj?.api_key || '',
      api_base: obj?.api_base || '',
      batch_size: obj?.batch_size ?? 32,
      dimension: obj?.dimension ?? (effectiveProvider === 'local' ? 512 : 1024),
    });
    if (prev?.provider !== effectiveProvider
        || prev?.model !== updated.model
        || normalize(prev) !== normalize(updated)) {
      onChange({
        ...formData,
        embedding: { ...formData.embedding, dense: updated },
      });
    }
  }, [provider, hasLocalEmbed]);

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

  const handleProviderChange = (newProvider: string) => {
    const updated: any = {
      ...formData.embedding?.dense,
      provider: newProvider,
    };
    if (newProvider === 'local') {
      delete updated.api_key;
      delete updated.api_base;
    } else {
      delete updated.model_path;
    }
    onChange({
      ...formData,
      embedding: { ...formData.embedding, dense: updated },
    });
  };
  const fieldStyle = "w-full rounded-lg bg-surface-hover border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-aurora-400/50 transition-colors";
  const labelStyle = "block text-xs font-semibold text-text-secondary mb-1.5";

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-text-primary">{t('wizard.step_embedding')}</h2>
      <p className="text-sm text-text-muted">{t('ai.dense_provider_desc')}</p>

      <div>
        <label className={labelStyle}>{t('ai.provider')}</label>
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          className={fieldStyle}
        >
          {visibleProviders.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label.startsWith('wizard.') ? t(opt.label) : opt.label}
            </option>
          ))}
        </select>
      </div>

      {isLocalOrVikingdb && (
        <div>
          <label className={labelStyle}>{t('ai.model_path')}</label>
          <input
            type="text"
            value={formData.embedding?.dense?.model_path || ''}
            onChange={(e) => updateField('embedding.dense.model_path', e.target.value)}
            placeholder={t('ai.model_path_desc')}
            className={fieldStyle}
          />
        </div>
      )}

      {!isLocal && (
        <>
          <div>
            <label className={labelStyle}>{t('ai.api_base')}</label>
            <input
              type="text"
              value={formData.embedding?.dense?.api_base || ''}
              onChange={(e) => updateField('embedding.dense.api_base', e.target.value)}
              placeholder="https://ark.cn-beijing.volces.com/api/v3"
              className={fieldStyle}
            />
          </div>
          <div>
            <label className={labelStyle}>{t('ai.api_key')}</label>
            <input
              type="password"
              value={formData.embedding?.dense?.api_key || ''}
              onChange={(e) => updateField('embedding.dense.api_key', e.target.value)}
              className={fieldStyle}
            />
          </div>
          <div>
            <label className={labelStyle}>{t('ai.model')}</label>
            <input
              type="text"
              value={formData.embedding?.dense?.model || ''}
              onChange={(e) => updateField('embedding.dense.model', e.target.value)}
              placeholder={PROVIDER_DEFAULT_MODEL[provider] || 'model-name'}
              className={fieldStyle}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelStyle}>{t('ai.dimension')}</label>
              <input
                type="number"
                value={formData.embedding?.dense?.dimension ?? 1024}
                onChange={(e) => updateField('embedding.dense.dimension', parseInt(e.target.value) || 0)}
                min={1} max={8192}
                className={fieldStyle}
              />
            </div>
            <div>
              <label className={labelStyle}>{t('ai.dense_batch_size')}</label>
              <input
                type="number"
                value={formData.embedding?.dense?.batch_size ?? 32}
                onChange={(e) => updateField('embedding.dense.batch_size', parseInt(e.target.value) || 0)}
                min={1} max={512}
                className={fieldStyle}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
