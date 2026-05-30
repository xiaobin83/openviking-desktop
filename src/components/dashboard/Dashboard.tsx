import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { checkHealth, getDashboardSummary, getMemoryStats } from '../../lib/api';
import type { DashboardSummary, MemoryStats } from '../../lib/types';
import StatusCard from './StatusCard';
import StatsGrid from './StatsGrid';

export default function Dashboard() {
  const { t } = useTranslation();
  const [serverStatus, setServerStatus] = useState<string>('stopped');
  const [version, setVersion] = useState<string>('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [memStats, setMemStats] = useState<MemoryStats | null>(null);

  useEffect(() => {
    const unlisten = listen<string>('server-status-changed', (event) => {
      setServerStatus(event.payload);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  useEffect(() => {
    invoke<string>('get_server_status').then(setServerStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (serverStatus !== 'running') return;

    const fetchData = async () => {
      try {
        const health = await checkHealth();
        setVersion(health.version);
        const dashSummary = await getDashboardSummary();
        setSummary(dashSummary);
        const mem = await getMemoryStats();
        setMemStats(mem);
      } catch {
        // API 调用失败时静默处理
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [serverStatus]);

  const handleToggleServer = async () => {
    try {
      if (serverStatus === 'running') {
        await invoke('stop_server');
      } else {
        await invoke('start_server');
      }
    } catch (err) {
      console.error('Toggle server failed:', err);
    }
  };

  return (
    <div className="space-y-5">
      <div className="animate-slide-up flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-gradient-to-b from-aurora-400 to-aurora-600" />
        <h2 className="text-lg font-bold tracking-tight text-text-primary">{t('dashboard.service_status')}</h2>
      </div>
      <StatusCard
        status={serverStatus}
        version={version}
        onToggle={handleToggleServer}
      />
      {serverStatus === 'running' && (
        <>
          <div className="animate-slide-up flex items-center gap-3" style={{ animationDelay: '150ms' }}>
            <div className="h-6 w-1 rounded-full bg-gradient-to-b from-aurora-400 to-aurora-600" />
            <h2 className="text-lg font-bold tracking-tight text-text-primary">{t('dashboard.data_overview')}</h2>
          </div>
          <StatsGrid summary={summary} memStats={memStats} />
        </>
      )}
    </div>
  );
}
