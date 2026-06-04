import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { PythonEnvState, PythonTaskProgress } from '../../lib/types';

export default function PythonEnvCard({
  onStateChange,
}: {
  onStateChange: (state: PythonEnvState) => void;
}) {
  const { t } = useTranslation();
  const [envState, setEnvState] = useState<PythonEnvState>({
    installed: false,
    currentVersion: null,
    latestVersion: null,
    pythonVersion: null,
    upgradable: false,
  });
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [showVersionDialog, setShowVersionDialog] = useState(false);
  const [pythonVersions, setPythonVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [error, setError] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<PythonEnvState>('check_openviking_state')
      .then((state) => {
        setEnvState(state);
        onStateChange(state);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<PythonTaskProgress>('python-task-progress', (event) => {
      const { step, message, done, log_line } = event.payload;
      if (log_line) {
        setLogs((prev) => [...prev.slice(-200), log_line]);
      }
      if (step === 'error') {
        setError(message);
        setLoading(false);
        setStatusMessage('');
      } else if (done) {
        setLoading(false);
        setStatusMessage('');
        setLogs([]);
        setError('');
        invoke<PythonEnvState>('check_openviking_state')
          .then((newState) => {
            setEnvState(newState);
            onStateChange(newState);
            if (newState.installed) {
              invoke('start_server').catch(console.error);
            }
          })
          .catch(console.error);
      } else {
        setStatusMessage(message);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleInstall = async () => {
    setLoading(true);
    setError('');
    setLogs([]);
    setShowLogs(true);
    try {
      await invoke('install_openviking', { pythonVersion: '3.13' });
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setLoading(true);
    setError('');
    setLogs([]);
    setShowLogs(true);
    try {
      await invoke('upgrade_openviking');
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  const handleOpenVersionDialog = async () => {
    try {
      const versions = await invoke<string[]>('get_python_versions');
      setPythonVersions(versions);
      setSelectedVersion(envState.pythonVersion || '3.13');
      setShowVersionDialog(true);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleChangePython = async () => {
    if (!window.confirm(t('python.confirm_change'))) return;
    setShowVersionDialog(false);
    setLoading(true);
    setError('');
    setLogs([]);
    setShowLogs(true);
    try {
      await invoke('upgrade_python', { version: selectedVersion });
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  const isInstalled = envState.installed;
  const isUpgradable = envState.upgradable;

  return (
    <>
      <div className="group animate-slide-up rounded-2xl border border-border-subtle bg-surface-card/60 p-5 backdrop-blur-sm transition-all duration-300 hover:border-border-active hover:bg-surface-card/80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-elevated">
              <span className="text-lg">🐍</span>
            </div>
            <div>
              <p className="font-semibold text-text-primary">{t('python.env_title')}</p>
              {isInstalled ? (
                <p className="font-mono text-xs text-text-muted">
                  {envState.pythonVersion
                    ? `Python ${envState.pythonVersion}`
                    : 'Python (读取中...)'}
                  {' | '}
                  {envState.currentVersion
                    ? `OpenViking v${envState.currentVersion}`
                    : 'OpenViking (读取中...)'}
                  {!isUpgradable && envState.currentVersion && envState.latestVersion && envState.currentVersion === envState.latestVersion && (
                    <span className="ml-1 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400">
                      {t('python.latest')}
                    </span>
                  )}
                  {isUpgradable && envState.latestVersion && (
                    <span className="ml-1 text-aurora-400"> → v{envState.latestVersion}</span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-text-muted">
                  {t('python.not_installed_hint')}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isInstalled && !loading && (
              <button
                onClick={handleInstall}
                className="rounded-xl bg-aurora-500/15 px-5 py-2 text-sm font-medium text-aurora-400 transition-all hover:bg-aurora-500/25 hover:shadow-lg hover:shadow-aurora-500/10"
              >
                {t('python.install')}
              </button>
            )}
            {isUpgradable && !loading && (
              <button
                onClick={handleUpgrade}
                className="rounded-xl bg-aurora-500/15 px-5 py-2 text-sm font-medium text-aurora-400 transition-all hover:bg-aurora-500/25 hover:shadow-lg hover:shadow-aurora-500/10"
              >
                {t('python.upgrade', { version: envState.latestVersion })}
              </button>
            )}
            {isInstalled && !loading && (
              <button
                onClick={handleOpenVersionDialog}
                className="rounded-lg border border-border-subtle p-2 text-text-muted transition-colors hover:border-border-active hover:text-text-primary"
                title={t('python.change_version')}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
              <div className="h-full animate-pulse rounded-full bg-gradient-to-r from-aurora-400 to-aurora-600" style={{ width: '60%' }} />
            </div>
            <p className="text-xs text-aurora-400">{statusMessage}</p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
            <p className="text-xs text-red-400">{error}</p>
            <button
              onClick={() => setError('')}
              className="mt-1 text-xs text-red-400/70 underline hover:text-red-400"
            >
              Dismiss
            </button>
          </div>
        )}

        {logs.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="mb-1 text-[11px] text-text-muted hover:text-text-primary transition-colors"
            >
              {showLogs ? '▾' : '▸'} {t('python.log_output')} ({logs.length} lines)
            </button>
            {showLogs && (
              <div className="max-h-28 overflow-y-auto rounded-lg border border-border-subtle bg-surface/80 p-2 font-mono text-[10px] leading-relaxed text-text-muted">
                {logs.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        )}
      </div>

      {showVersionDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-80 rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-2xl">
            <h3 className="text-sm font-semibold text-text-primary mb-4">{t('python.change_version')}</h3>
            <p className="text-xs text-text-muted mb-2">{t('python.current_version')}: {envState.pythonVersion}</p>
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:border-aurora-400 focus:outline-none"
            >
              {pythonVersions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowVersionDialog(false)}
                className="rounded-lg border border-border-subtle px-4 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePython}
                className="rounded-lg bg-aurora-500/15 px-4 py-1.5 text-sm font-medium text-aurora-400 hover:bg-aurora-500/25 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
