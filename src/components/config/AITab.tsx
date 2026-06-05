import { useTranslation } from 'react-i18next';
import type { OvConfig } from '../../lib/types';
import { getGroups, getFieldsByTab } from '../../lib/config-fields';
import ConfigFieldRenderer, { updateConfig } from './ConfigField';
import ConfigGroup from './ConfigGroup';

interface AITabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
  isEmbeddingRebuilding?: boolean;
  onOpenEmbeddingModal?: () => void;
}

function ConfigFields({ config, onChange, group }: { config: OvConfig; onChange: (config: OvConfig) => void; group?: string }) {
  const fields = getFieldsByTab('ai').filter((f) => f.group === group);

  const handleChange = (path: string, value: unknown) => {
    const updated = updateConfig(config, path, value);
    onChange(updated);
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

export default function AITab({ config, onChange, isEmbeddingRebuilding, onOpenEmbeddingModal }: AITabProps) {
  const { t } = useTranslation();
  const groups = getGroups('ai');

  const groupLabels: Record<string, string> = {
    dense: t('ai.dense_embedding'),
    embedding_settings: t('ai.embedding_settings'),
    circuit_breaker: t('ai.circuit_breaker'),
    vlm: t('ai.vlm'),
  };

  const dense = config.embedding?.dense;
  const provider = dense?.provider ?? '-';
  const model = dense?.model ?? '-';
  const dimension = dense?.dimension ?? '-';

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        if (group === 'dense') {
          return (
            <ConfigGroup key={group} title={groupLabels[group] ?? group}>
              <div className="space-y-1 text-sm">
                <div className="flex gap-2">
                  <span className="text-text-muted w-20">{t('ai.provider')}:</span>
                  <span className="text-text-primary">{provider}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-text-muted w-20">{t('ai.model')}:</span>
                  <span className="text-text-primary">{model}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-text-muted w-20">{t('ai.dimension')}:</span>
                  <span className="text-text-primary">{dimension}</span>
                </div>
              </div>
              <button
                onClick={onOpenEmbeddingModal}
                disabled={isEmbeddingRebuilding}
                className="w-full px-4 py-2 mt-2 bg-aurora-500/15 text-aurora-400 rounded-md text-sm font-medium hover:bg-aurora-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEmbeddingRebuilding ? (
                  <span>{t('embedding_modal.rebuilding')}...</span>
                ) : (
                  t('ai.change_embedding')
                )}
              </button>
            </ConfigGroup>
          );
        }
        return (
          <ConfigGroup key={group} title={groupLabels[group] ?? group}>
            <ConfigFields config={config} onChange={onChange} group={group} />
          </ConfigGroup>
        );
      })}
    </div>
  );
}
