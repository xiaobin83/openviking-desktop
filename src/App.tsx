import { useState } from 'react';
import Dashboard from './components/dashboard/Dashboard';
import ConfigPage from './components/config/ConfigPage';

type Tab = 'overview' | 'config';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">OpenViking 仪表盘</h1>
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              概览
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'config'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              配置
            </button>
          </div>
        </div>
      </header>
      <main className="p-6">
        {activeTab === 'overview' ? <Dashboard /> : <ConfigPage />}
      </main>
    </div>
  );
}

export default App;
