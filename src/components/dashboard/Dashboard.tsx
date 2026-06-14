import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { checkHealth, getDashboardSummary, getMemoryStats, setRootApiKey, getRootApiKey, setTenant } from '../../lib/api';
import type { OvConfig } from '../../lib/types';
import type { DashboardSummary, MemoryStats, PythonEnvState } from '../../lib/types';
import StatusCard from './StatusCard';
import StatsGrid from './StatsGrid';
import PythonEnvCard from './PythonEnvCard';

export default function Dashboard() {
  const { t } = useTranslation();
  const [serverStatus, setServerStatus] = useState<string>('stopped');
  const [version, setVersion] = useState<string>('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [memStats, setMemStats] = useState<MemoryStats | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [pythonInstalled, setPythonInstalled] = useState(false);
  const [rebuildLockExists, setRebuildLockExists] = useState(false);
  const [embeddingRebuildNeeded, setEmbeddingRebuildNeeded] = useState(false);
  const [toast, setToast] = useState('');
  const [playgroundOpening, setPlaygroundOpening] = useState(false);

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
    invoke<string | null>('read_rebuild_lock')
      .then((content) => {
        if (content) {
          setRebuildLockExists(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (serverStatus === 'error') {
      invoke<string>('get_last_error').then(setErrorMessage).catch(() => {});
    } else if (serverStatus === 'timeout') {
      setErrorMessage(t('status.timeout_message'));
      invoke<string>('read_server_log')
        .then((log) => {
          if (log.includes('EmbeddingRebuildRequiredError')) {
            setEmbeddingRebuildNeeded(true);
          }
        })
        .catch(() => {});
    } else {
      setErrorMessage('');
      setEmbeddingRebuildNeeded(false);
    }
  }, [serverStatus, t]);

  useEffect(() => {
    if (serverStatus !== 'running') return;

    const initApi = async () => {
      try {
        const content = await invoke<string>('read_config');
        const config = JSON.parse(content) as OvConfig;
        if (config.server?.root_api_key) {
          setRootApiKey(config.server.root_api_key);
        }
        setTenant(
          config.server?.account ?? 'default',
          config.server?.default_user ?? 'default',
        );
      } catch {
        // 读取配置失败时静默处理
      }
    };
    initApi();

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
      if (serverStatus === 'running' || serverStatus === 'starting') {
        setServerStatus('stopped');
        await invoke('stop_server');
      } else {
        setServerStatus('starting');
        await invoke('start_server');
      }
    } catch (err) {
      console.error('Toggle server failed:', err);
    }
  };

  const handlePythonStateChange = (state: PythonEnvState) => {
    setPythonInstalled(state.installed);
  };

  const handlePlayground = async () => {
    if (playgroundOpening) return;
    setPlaygroundOpening(true);
    try {
      let key = getRootApiKey();
      if (!key) {
        const configStr = await invoke<string>('read_config');
        const config = JSON.parse(configStr) as OvConfig;
        key = config.server?.root_api_key ?? '';
      }
      if (key) {
        await writeText(key);
      } else {
        console.warn('[Playground] no API key available to copy');
      }
    } catch (e) {
      console.error('[Playground] clipboard error:', e);
    }
    setToast(t('playground.apikey_copied'));
    await new Promise((r) => setTimeout(r, 2000));
    setToast('');
    invoke('open_playground');
    setPlaygroundOpening(false);
  };

  const handleRebuildEmbedding = async () => {
    try {
      await invoke('stop_server');
      const vdbPath = await invoke<string>('resolve_vectordb_path');
      await invoke('delete_directory', { path: vdbPath });
      setEmbeddingRebuildNeeded(false);
      setServerStatus('starting');
      await invoke('start_server');
    } catch (err) {
      console.error('Embedding rebuild failed:', err);
    }
  };

  return (
    <div className="space-y-5">
      <PythonEnvCard onStateChange={handlePythonStateChange} serverStopped={serverStatus === 'stopped'} />
      {rebuildLockExists && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-md px-4 py-3 text-sm text-amber-400 flex items-center gap-3">
          <span className="flex-1">{t('dashboard.rebuild_incomplete')}</span>
          <button
            onClick={async () => {
              try {
                await invoke('stop_server');
                const vdbPath = await invoke<string>('resolve_vectordb_path');
                await invoke('delete_directory', { path: vdbPath });
                await invoke('delete_rebuild_lock');
                await invoke('start_server');
                setRebuildLockExists(false);
              } catch (err) {
                console.error('Recovery rebuild failed:', err);
              }
            }}
            className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-md hover:bg-amber-500/30 transition-colors"
          >
            {t('dashboard.rebuild_action')}
          </button>
        </div>
      )}
      {pythonInstalled && (
        <>
      <div className="animate-slide-up flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-gradient-to-b from-aurora-400 to-aurora-600" />
        <h2 className="text-lg font-bold tracking-tight text-text-primary">{t('dashboard.service_status')}</h2>
      </div>
      <div className="flex items-stretch gap-3">
        <button
          onClick={handlePlayground}
          disabled={serverStatus !== 'running' || playgroundOpening}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl border px-4 backdrop-blur-sm transition-all duration-300 ${
            serverStatus === 'running'
              ? 'border-aurora-500/20 bg-aurora-500/10 text-aurora-400 hover:border-aurora-500/30 hover:bg-aurora-500/20 cursor-pointer'
              : 'border-border-subtle bg-gray-500/5 text-gray-500 cursor-not-allowed'
          }`}
        >
          <span className="text-xl leading-none">🎮</span>
          <span className="text-[11px] font-medium leading-tight">Playground</span>
        </button>
        <div className="flex-1">
          <StatusCard
            status={serverStatus}
            version={version}
            errorMessage={errorMessage}
            onToggle={handleToggleServer}
            onConsole={() => invoke('open_console')}
            onShowLog={() => invoke('open_log_file')}
            onShowAppLog={() => invoke('open_app_log_file')}
            onRebuildEmbedding={embeddingRebuildNeeded ? handleRebuildEmbedding : undefined}
          />
        </div>
      </div>
      {serverStatus === 'running' && (
        <>
          <div className="animate-slide-up flex items-center gap-3" style={{ animationDelay: '150ms' }}>
            <div className="h-6 w-1 rounded-full bg-gradient-to-b from-aurora-400 to-aurora-600" />
            <h2 className="text-lg font-bold tracking-tight text-text-primary">{t('dashboard.data_overview')}</h2>
          </div>
          <StatsGrid summary={summary} memStats={memStats} />
        </>
      )}
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface-elevated border border-aurora-500/30 rounded-xl px-5 py-3 shadow-xl shadow-aurora-500/10 text-sm text-aurora-400 animate-slide-up transition-opacity">
          {toast}
        </div>
      )}
    </div>
  );
}
