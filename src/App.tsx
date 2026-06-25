import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getDefaultConfigJson } from './lib/config-fields';
import { findConflictingPorts, findForeignOccupiedPorts } from './lib/detection';
import OnboardingWizard from './components/wizard/OnboardingWizard';
import Dashboard from './components/dashboard/Dashboard';
import ConfigPage from './components/config/ConfigPage';
import PortConflictDialog from './components/PortConflictDialog';

type Tab = 'overview' | 'config';

function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [isPythonInstalling, setIsPythonInstalling] = useState(false);
  const [portConflicts, setPortConflicts] = useState<number[] | null>(null);
  const [foreignPortConflicts, setForeignPortConflicts] = useState<number[] | null>(null);

  useEffect(() => {
    invoke<string>('get_app_version')
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    invoke<boolean>('is_onboarded')
      .then((onboarded) => {
        setNeedsOnboarding(!onboarded);
      })
      .catch(() => {
        setNeedsOnboarding(false);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || needsOnboarding) return;
    invoke<string>('read_config')
      .then(async (configStr) => {
        try {
          const config = JSON.parse(configStr);
          const serverPort = config.server?.port ?? 1933;
          const botPort = config.bot?.gateway?.port ?? 18790;
          const conflicts = await findConflictingPorts(serverPort, botPort);
          if (conflicts.length > 0) {
            setPortConflicts(conflicts);
            return;
          }

          const foreignPorts = await findForeignOccupiedPorts(serverPort);
          if (foreignPorts.length > 0) {
            setForeignPortConflicts(foreignPorts);
            return;
          }

          await invoke('start_server').catch(() => {});
        } catch {
          // Config parse failed — write default config as fallback
          await invoke('write_config', { config: getDefaultConfigJson() }).catch(() => {});
        }
      })
      .catch(() => {
        invoke('write_config', { config: getDefaultConfigJson() }).catch(() => {});
      });
  }, [ready, needsOnboarding]);

  const handleClearPorts = async () => {
    if (!portConflicts) return;
    for (const port of portConflicts) {
      await invoke('kill_port_process', { port }).catch(() => {});
    }
    setPortConflicts(null);
    await invoke('start_server').catch(() => {});
  };

  const handleExit = async () => {
    await invoke('exit_app');
  };

  useEffect(() => {
    const updateTitle = async () => {
      const title = t('app.pageTitle');
      document.title = title;
      try {
        await getCurrentWindow().setTitle(title);
      } catch (e) {
        console.warn('[App] failed to set window title:', e);
      }
    };
    updateTitle();
    i18n.on('languageChanged', updateTitle);
    return () => {
      i18n.off('languageChanged', updateTitle);
    };
  }, [i18n, t]);

  const toggleLang = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
  };

  // Force-switch to overview tab when Python installation starts
  useEffect(() => {
    if (isPythonInstalling && activeTab === 'config') {
      setActiveTab('overview');
    }
  }, [isPythonInstalling, activeTab]);

  // Show wizard if onboarding needed
  if (needsOnboarding) {
    return <OnboardingWizard onComplete={() => setNeedsOnboarding(false)} />;
  }

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <span className="text-sm tracking-widest text-text-muted">
          {t('app.preparing')}
        </span>
      </div>
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: t('tab.overview') },
    { key: 'config', label: t('tab.config') },
  ];

  return (
    <>
      {portConflicts && portConflicts.length > 0 && (
        <PortConflictDialog
          ports={portConflicts}
          onClear={handleClearPorts}
          onExit={handleExit}
        />
      )}
      {foreignPortConflicts && foreignPortConflicts.length > 0 && (
        <PortConflictDialog
          ports={foreignPortConflicts}
          variant="foreign"
          onExit={handleExit}
        />
      )}
      <div className="h-screen flex flex-col overflow-hidden bg-surface">
      <header className="flex-shrink-0 border-b border-border-subtle bg-surface-elevated/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-aurora-400 to-aurora-600 shadow-lg shadow-aurora-500/20">
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-text-primary">
                  {t('app.title')}
                </h1>
                {appVersion && (
                  <span className="rounded-md bg-aurora-500/10 px-1.5 py-0.5 font-mono text-[10px] text-aurora-400 border border-aurora-500/20">
                    v{appVersion}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-medium tracking-wider text-text-muted">
                {t('app.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <nav className="flex gap-1 rounded-lg bg-surface/50 p-1">
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  disabled={key === 'config' && isPythonInstalling}
                  className={`relative rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                    key === 'config' && isPythonInstalling
                      ? 'text-text-muted/40 cursor-not-allowed'
                      : activeTab === key
                        ? 'bg-aurora-500/15 text-aurora-400 shadow-sm'
                        : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {activeTab === key && (
                    <span className="absolute inset-0 rounded-md border border-aurora-400/20" />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </nav>
            <button
              onClick={toggleLang}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors border border-border-subtle"
            >
              {i18n.language === 'zh' ? 'EN' : '中'}
            </button>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-aurora-500/20 to-transparent" />
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">
          {activeTab === 'overview' ? <Dashboard onInstallingChange={setIsPythonInstalling} /> : <ConfigPage />}
        </div>
      </main>
    </div>
    </>
  );
}

export default App;
