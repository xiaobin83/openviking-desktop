import { useTranslation } from 'react-i18next';

interface StatusCardProps {
  status: string;
  version: string;
  onToggle: () => void;
}

const STATUS_CONFIG: Record<string, { labelKey: string; dot: string; ring: string; badge: string; pulseColor: string }> = {
  running: {
    labelKey: 'status.running',
    dot: 'bg-green-400',
    ring: 'shadow-green-500/20',
    badge: 'bg-green-500/10 text-green-400 border-green-500/20',
    pulseColor: 'shadow-green-400/50',
  },
  stopped: {
    labelKey: 'status.stopped',
    dot: 'bg-gray-500',
    ring: 'shadow-gray-500/10',
    badge: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    pulseColor: 'shadow-gray-400/30',
  },
  starting: {
    labelKey: 'status.starting',
    dot: 'bg-amber-400',
    ring: 'shadow-amber-500/20',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    pulseColor: 'shadow-amber-400/50',
  },
  error: {
    labelKey: 'status.error',
    dot: 'bg-red-400',
    ring: 'shadow-red-500/20',
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
    pulseColor: 'shadow-red-400/50',
  },
  timeout: {
    labelKey: 'status.timeout',
    dot: 'bg-red-400',
    ring: 'shadow-red-500/20',
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
    pulseColor: 'shadow-red-400/50',
  },
};

export default function StatusCard({ status, version, onToggle }: StatusCardProps) {
  const { t } = useTranslation();
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.stopped;
  const isStopped = status === 'stopped' || status === 'error' || status === 'timeout';

  return (
    <div className="group animate-slide-up rounded-2xl border border-border-subtle bg-surface-card/60 p-5 backdrop-blur-sm transition-all duration-300 hover:border-border-active hover:bg-surface-card/80">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`relative flex h-10 w-10 items-center justify-center rounded-xl bg-surface-elevated ${cfg.ring}`}>
            <span className={`inline-block h-3 w-3 rounded-full ${cfg.dot} ${status === 'starting' ? 'animate-ping' : 'animate-pulse'}`} />
            <span className={`absolute inset-0 rounded-xl ${status === 'running' ? 'animate-pulse-glow' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <p className="font-semibold text-text-primary">{t(cfg.labelKey)}</p>
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${cfg.badge}`}>
                {status.toUpperCase()}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-xs text-text-muted">
              {status === 'running' ? `v${version}` : t('status.not_running')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onToggle}
            className={`relative overflow-hidden rounded-xl px-5 py-2 text-sm font-medium transition-all duration-300 ${
              isStopped
                ? 'bg-aurora-500/15 text-aurora-400 hover:bg-aurora-500/25 hover:shadow-lg hover:shadow-aurora-500/10'
                : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:shadow-lg hover:shadow-red-500/10'
            }`}
          >
            <span className="relative z-10">{isStopped ? t('status.start') : t('status.stop')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
