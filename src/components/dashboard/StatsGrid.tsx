import type { DashboardSummary, MemoryStats } from '../../lib/types';

interface StatsGridProps {
  summary: DashboardSummary | null;
  memStats: MemoryStats | null;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export default function StatsGrid({ summary, memStats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="文件数" value={summary?.context_counts.files ?? '—'} />
      <StatCard label="技能数" value={summary?.context_counts.skills ?? '—'} />
      <StatCard label="记忆总数" value={memStats?.total_memories ?? summary?.context_counts.memories ?? '—'} />
      <StatCard label="今日 Token" value={
        summary?.today_tokens
          ? `${(summary.today_tokens.input + summary.today_tokens.output).toLocaleString()}`
          : '—'
      } />
    </div>
  );
}
