import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { getDefaultConfigJson } from './lib/config-fields';
import OnboardingWizard from './components/wizard/OnboardingWizard';
import Dashboard from './components/dashboard/Dashboard';
import ConfigPage from './components/config/ConfigPage';

type Tab = 'overview' | 'config';

function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

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
    if (needsOnboarding) return;
    invoke<string>('read_config').catch(() => {
      invoke('write_config', { config: getDefaultConfigJson() }).catch(() => {});
    });
  }, [needsOnboarding]);

  useEffect(() => {
    const updateTitle = () => {
      document.title = t('app.pageTitle');
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
              <h1 className="text-base font-bold tracking-tight text-text-primary">
                {t('app.title')}
              </h1>
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
                  className={`relative rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                    activeTab === key
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
          {activeTab === 'overview' ? <Dashboard /> : <ConfigPage />}
        </div>
      </main>
    </div>
  );
}

export default App;
