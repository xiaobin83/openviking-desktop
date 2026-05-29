import { useState } from 'react';
import Dashboard from './components/dashboard/Dashboard';
import ConfigPage from './components/config/ConfigPage';

type Tab = 'overview' | 'config';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'config', label: '配置' },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <div className="min-h-screen bg-surface">
      <header className="relative border-b border-border-subtle bg-surface-elevated/80 backdrop-blur-xl">
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
                OpenViking
              </h1>
              <p className="text-[11px] font-medium tracking-wider text-text-muted">
                控制面板
              </p>
            </div>
          </div>

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
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-aurora-500/20 to-transparent" />
      </header>

      <main className="mx-auto max-w-7xl p-6">
        {activeTab === 'overview' ? <Dashboard /> : <ConfigPage />}
      </main>
    </div>
  );
}

export default App;
