import { useTranslation } from 'react-i18next';

interface PortConflictDialogProps {
  ports: number[];
  variant?: 'openviking' | 'foreign';
  onClear?: () => void;
  onExit: () => void;
}

export default function PortConflictDialog({
  ports,
  variant = 'openviking',
  onClear,
  onExit,
}: PortConflictDialogProps) {
  const { t } = useTranslation();
  const portList = ports.join(', ');

  const isForeign = variant === 'foreign';
  const iconColor = isForeign ? 'text-red-400' : 'text-amber-400';
  const iconBg = isForeign ? 'bg-red-500/20' : 'bg-amber-500/20';
  const titleKey = isForeign ? 'app.foreign_port_conflict_title' : 'app.port_conflict_title';
  const descKey = isForeign ? 'app.foreign_port_conflict_desc' : 'app.port_conflict_desc';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-auto max-w-md w-full p-6">
        <div
          role="dialog"
          aria-modal="true"
          className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-2xl"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`h-10 w-10 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0`}>
              <svg className={`h-5 w-5 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">{t(titleKey)}</h2>
              <p className="text-sm text-text-muted mt-1">{t(descKey, { ports: portList })}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {!isForeign && onClear && (
              <button
                onClick={onClear}
                className="w-full rounded-xl bg-aurora-500 hover:bg-aurora-600 py-3 px-4 text-sm font-semibold text-white transition-colors"
              >
                {t('app.port_conflict_clear')}
              </button>
            )}
            <button
              onClick={onExit}
              className="w-full rounded-xl bg-surface-elevated hover:bg-surface-hover border border-border-subtle py-3 px-4 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('app.port_conflict_exit')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
