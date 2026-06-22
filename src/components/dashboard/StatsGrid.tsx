import { useTranslation } from 'react-i18next';
import type { DashboardSummary } from '../../lib/types';

interface StatsGridProps {
  summary: DashboardSummary | null;
}

interface StatItem {
  labelKey: string;
  value: string | number;
  icon: string;
  descKey: string;
}

const STAT_ICONS: Record<string, string> = {
  files: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  skills: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  memories: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  tokens: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  retrievals: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
};

export default function StatsGrid({ summary }: StatsGridProps) {
  const items: StatItem[] = [
    {
      labelKey: 'stats.files',
      value: summary?.context_counts.files ?? '—',
      icon: STAT_ICONS.files,
      descKey: 'stats.files_desc',
    },
    {
      labelKey: 'stats.skills',
      value: summary?.context_counts.skills ?? '—',
      icon: STAT_ICONS.skills,
      descKey: 'stats.skills_desc',
    },
    {
      labelKey: 'stats.memories',
      value: summary?.context_counts.memories ?? '—',
      icon: STAT_ICONS.memories,
      descKey: 'stats.memories_desc',
    },
    {
      labelKey: 'stats.tokens',
      value: summary?.today_tokens
        ? `${summary.today_tokens.total.toLocaleString()}`
        : '—',
      icon: STAT_ICONS.tokens,
      descKey: 'stats.tokens_desc',
    },
    {
      labelKey: 'stats.retrievals',
      value: summary?.today_retrievals
        ? `${summary.today_retrievals.total.toLocaleString()}`
        : '—',
      icon: STAT_ICONS.retrievals,
      descKey: 'stats.retrievals_desc',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((item, i) => (
        <StatCard key={item.labelKey} item={item} index={i} />
      ))}
    </div>
  );
}

function StatCard({ item, index }: { item: StatItem; index: number }) {
  const { t } = useTranslation();
  return (
    <div
      className="animate-slide-up group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-card/40 p-5 backdrop-blur-sm transition-all duration-300 hover:border-border-active hover:bg-surface-card/60 hover:shadow-lg hover:shadow-aurora-500/5"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-aurora-500/5 blur-2xl transition-all duration-500 group-hover:bg-aurora-400/10" />

      <div className="relative">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-aurora-500/10 transition-colors duration-300 group-hover:bg-aurora-500/20">
          <svg
            className="text-aurora-400"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={item.icon} />
          </svg>
        </div>

        <p className="mb-0.5 font-mono text-2xl font-semibold tracking-tight text-text-primary">
          {item.value}
        </p>
        <p className="text-sm font-medium text-text-secondary">{t(item.labelKey)}</p>
        <p className="mt-1 text-[11px] leading-tight text-text-muted">{t(item.descKey)}</p>
      </div>
    </div>
  );
}
