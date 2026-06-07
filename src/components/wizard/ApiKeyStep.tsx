import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OvConfig } from '../../lib/types';

interface ApiKeyStepProps {
  formData: Partial<OvConfig>;
  onChange: (data: Partial<OvConfig>) => void;
}

export default function ApiKeyStep({ formData, onChange }: ApiKeyStepProps) {
  const { t } = useTranslation();
  const [showKey, setShowKey] = useState(false);

  const apiKey = formData.server?.root_api_key || '';

  const handleGenerateUuid = () => {
    const uuid = crypto.randomUUID();
    onChange({
      ...formData,
      server: { ...formData.server, root_api_key: uuid, port: formData.server?.port ?? 1933 },
    });
  };

  const handleChange = (value: string) => {
    onChange({
      ...formData,
      server: { ...formData.server, root_api_key: value || null, port: formData.server?.port ?? 1933 },
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-text-primary">{t('wizard.step_apikey')}</h2>

      <div>
        <label className="block text-xs font-semibold text-text-secondary mb-1.5">
          {t('basic.root_api_key')} <span className="text-red-400">*</span>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="550e8400-e29b-41d4-a716-446655440000"
              className="w-full rounded-lg bg-surface-hover border border-border-subtle px-3 py-2.5 pr-10 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-aurora-400/50 transition-colors font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
            >
              {showKey ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={handleGenerateUuid}
            className="rounded-lg bg-surface-elevated hover:bg-surface-hover border border-border-subtle px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap"
          >
            {t('wizard.generate_uuid')}
          </button>
        </div>
      </div>

      <div className="bg-surface-elevated border border-border-subtle rounded-xl px-4 py-3.5 flex items-start gap-3">
        <svg className="h-5 w-5 text-aurora-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-text-primary">{t('wizard.apikey_required')}</p>
          <p className="text-xs text-text-muted mt-1">{t('wizard.apikey_playground_note')}</p>
        </div>
      </div>
    </div>
  );
}
