import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { PythonEnvState, PythonTaskProgress } from '../../lib/types';
import { DEFAULT_PYTHON_VERSION } from '../../lib/constants';
import { CheckIcon, ArrowRightIcon, ChevronDownIcon, ChevronRightIcon } from '../Icons';

interface InstallStepProps {
  isInstalled: boolean;
  onInstalled?: () => void;
  onInstallComplete: () => void;
  onInstallingChange?: (installing: boolean) => void;
}

const INSTALL_STEPS = [
  { key: 'downloading_python', labelKey: 'python.downloading' },
  { key: 'creating_venv', labelKey: 'python.creating_venv' },
  { key: 'installing', labelKey: 'python.installing' },
];

export default function InstallStep({ isInstalled, onInstalled, onInstallComplete, onInstallingChange }: InstallStepProps) {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [currentInstallStep, setCurrentInstallStep] = useState(-1);
  const [downloadProgress, setDownloadProgress] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Version selection state (only used when isInstalled)
  const [pythonVersions, setPythonVersions] = useState<string[]>([]);
  const [ovVersions, setOvVersions] = useState<string[]>([]);
  const [selectedPythonVersion, setSelectedPythonVersion] = useState(DEFAULT_PYTHON_VERSION);
  const [selectedOvVersion, setSelectedOvVersion] = useState('');
  const [currentPythonVersion, setCurrentPythonVersion] = useState('');
  const [currentOvVersion, setCurrentOvVersion] = useState('');
  const [fetchingVersions, setFetchingVersions] = useState(false);
  const [localEmbed, setLocalEmbed] = useState(false);
  const [versionFetchError, setVersionFetchError] = useState('');
  const isWindows = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform);

  useEffect(() => {
    onInstallingChange?.(installing);
  }, [installing, onInstallingChange]);

  useEffect(() => {
    if (!isInstalled) return;
    setFetchingVersions(true);
    setVersionFetchError('');

    // 基础状态和 Python 版本（本地查询，不会因网络失败）
    Promise.all([
      invoke<PythonEnvState>('check_openviking_state'),
      invoke<string[]>('get_python_versions'),
    ])
      .then(([state, pyVersions]) => {
        setCurrentPythonVersion(state.pythonVersion || '');
        setCurrentOvVersion(state.currentVersion || '');
        setPythonVersions(pyVersions);
        setLocalEmbed(state.hasLocalEmbed);
        const defaultPy = state.pythonVersion
          ? state.pythonVersion.split('.').slice(0, 2).join('.')
          : pyVersions.find((v) => v.startsWith(DEFAULT_PYTHON_VERSION)) || pyVersions[0] || DEFAULT_PYTHON_VERSION;
        setSelectedPythonVersion(defaultPy);

        // OpenViking 版本号列表（PyPI 网络查询，可能失败）
        invoke<string[]>('get_openviking_versions')
          .then((ovList) => {
            setOvVersions(ovList);
            setSelectedOvVersion(state.currentVersion || ovList[0] || '');
          })
          .catch(() => {
            setVersionFetchError(t('python.version_fetch_error'));
            // 回退：至少显示当前已安装的版本
            if (state.currentVersion) {
              setOvVersions([state.currentVersion]);
              setSelectedOvVersion(state.currentVersion);
            }
          })
          .finally(() => setFetchingVersions(false));
      })
      .catch(() => setFetchingVersions(false));
  }, [isInstalled]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const unlistenPromise = listen<PythonTaskProgress>('python-task-progress', (event) => {
      const { step, message, done: taskDone, log_line } = event.payload;
      if (log_line) {
        setLogs((prev) => [...prev.slice(-200), log_line]);
        // Parse download progress from uv stderr: "X.X% / Y.Y%"
        const match = log_line.match(/(\d+\.?\d*)%\s*\/\s*(\d+\.?\d*)%/);
        if (match) {
          setDownloadProgress(`${match[1]}%`);
        }
      }
      if (step === 'error') {
        setError(message);
        setInstalling(false);
        setStatusMessage('');
      } else if (taskDone) {
        setInstalling(false);
        setStatusMessage('');
        setLogs([]);
        setError('');
        setDone(true);
        onInstalled?.();
        const timer = setTimeout(onInstallComplete, 800);
        return () => clearTimeout(timer);
      } else {
        setCurrentInstallStep(INSTALL_STEPS.findIndex((s) => s.key === step));
        setStatusMessage(message);
      }
    });
    return () => { unlistenPromise.then(f => f()); };
  }, [onInstallComplete]);

  const handleInstall = async () => {
    setInstalling(true);
    setError('');
    setLogs([]);
    setShowLogs(true);
    setCurrentInstallStep(-1);
    setDownloadProgress('');
    try {
      await invoke('install_openviking', { pythonVersion: selectedPythonVersion, openvikingVersion: selectedOvVersion || undefined, localEmbed });
    } catch (err) {
      setError(String(err));
      setInstalling(false);
    }
  };

  const fieldStyle = "w-full rounded-lg bg-surface-hover border border-border-subtle px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-aurora-400/50 transition-colors";
  const labelStyle = "block text-xs font-semibold text-text-secondary mb-1.5";

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
          <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-text-primary">
          {t('python.installing')}
        </h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-text-primary">{t('wizard.step_install')}</h2>

      {isInstalled ? (
        <p className="text-sm text-text-muted">{t('wizard.version_selection_hint')}</p>
      ) : (
        <p className="text-sm text-text-muted">{t('python.not_installed_hint')}</p>
      )}

      {isInstalled && (currentPythonVersion || currentOvVersion) && (
        <div className="rounded-lg bg-surface-elevated border border-border-subtle px-4 py-3 text-xs text-text-muted space-y-1">
          {currentPythonVersion && <p><span className="text-text-secondary font-medium">Python</span> {currentPythonVersion}</p>}
          {currentOvVersion && <p><span className="text-text-secondary font-medium">OpenViking</span> v{currentOvVersion}</p>}
        </div>
      )}

      {isInstalled && !installing && fetchingVersions && (
        <div className="flex items-center gap-2 text-sm text-text-muted py-4">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32" />
          </svg>
          <span>{t('app.preparing')}</span>
        </div>
      )}

      {isInstalled && !installing && !fetchingVersions && (
        <>
        <div>
          <label className={labelStyle}>{t('python.change_version')}</label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Python</label>
              <select
                value={selectedPythonVersion}
                onChange={(e) => setSelectedPythonVersion(e.target.value)}
                className={fieldStyle}
              >
                {pythonVersions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">OpenViking</label>
              <select
                value={selectedOvVersion}
                onChange={(e) => setSelectedOvVersion(e.target.value)}
                className={fieldStyle}
              >
                {ovVersions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {versionFetchError && (
          <p className="mt-2 text-xs text-amber-400">{versionFetchError}</p>
        )}
        </>
      )}

      {!installing && !fetchingVersions && (
        <div className="mt-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={localEmbed}
              onChange={(e) => setLocalEmbed(e.target.checked)}
              className="rounded border-border-subtle bg-surface-elevated text-aurora-400 focus:ring-aurora-400"
            />
            <span className="text-sm text-text-secondary">{t('python.local_embed')}</span>
          </label>
          <p className="mt-0.5 ml-6 text-xs text-text-muted">{t('python.local_embed_desc')}</p>
          {localEmbed && isWindows && (
            <p className="mt-1.5 ml-6 text-xs text-amber-400 bg-amber-500/10 rounded px-2 py-1">
              {t('python.local_embed_win_warning')}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {statusMessage && !installing && (
        <div className="bg-surface-elevated rounded-lg px-4 py-3 text-sm text-text-secondary">
          {statusMessage}
        </div>
      )}

      {installing ? (
        <div className="space-y-4">
          {INSTALL_STEPS.map((stepDef, i) => {
            const isActive = i === currentInstallStep;
            const isPast = i < currentInstallStep;
            return (
              <div key={stepDef.key} className="flex items-center gap-3">
                <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  isPast ? 'bg-green-500/20 text-green-400' :
                  isActive ? 'bg-aurora-500/20 text-aurora-400' :
                  'bg-surface-hover text-text-muted'
                }`}>
                  {isPast ? (
                    <CheckIcon className="w-3 h-3" />
                  ) : isActive ? (
                    <ArrowRightIcon className="w-3 h-3" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-sm ${isActive ? 'text-aurora-400 font-medium' : isPast ? 'text-green-400' : 'text-text-muted'}`}>
                  {isActive && statusMessage ? t(statusMessage, { version: selectedPythonVersion }) : (stepDef.labelKey.startsWith('python.') ? t(stepDef.labelKey, { version: selectedPythonVersion }) : stepDef.labelKey)}
                </span>
                {isActive && downloadProgress && (
                  <span className="text-xs text-aurora-400 font-mono ml-auto">{downloadProgress}</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <button
          onClick={handleInstall}
          disabled={fetchingVersions}
          className="w-full rounded-xl bg-aurora-500 hover:bg-aurora-600 disabled:opacity-50 disabled:cursor-not-allowed py-3 px-4 text-sm font-semibold text-white transition-colors"
        >
          {isInstalled ? t('python.reinstall') : t('python.install')}
        </button>
      )}

      {logs.length > 0 && (
        <div>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="text-[11px] text-text-muted hover:text-text-primary transition-colors"
          >
            {showLogs ? (
              <ChevronDownIcon className="w-3 h-3 inline-block mr-0.5" />
            ) : (
              <ChevronRightIcon className="w-3 h-3 inline-block mr-0.5" />
            )} {t('python.log_output')} ({logs.length} lines)
          </button>
          {showLogs && (
            <div className="mt-1 max-h-28 overflow-y-auto rounded-lg border border-border-subtle bg-surface/80 p-2 font-mono text-[10px] leading-relaxed text-text-muted">
              {logs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
