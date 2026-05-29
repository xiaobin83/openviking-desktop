interface StatusCardProps {
  status: string;
  version: string;
  onToggle: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  running: { label: '服务运行中', color: 'bg-green-50 border-green-200', dot: 'bg-green-500' },
  stopped: { label: '服务已停止', color: 'bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
  starting: { label: '服务启动中', color: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500' },
  error: { label: '启动失败', color: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
  timeout: { label: '启动超时', color: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
};

export default function StatusCard({ status, version, onToggle }: StatusCardProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.stopped;
  const isStopped = status === 'stopped' || status === 'error' || status === 'timeout';

  return (
    <div className={`rounded-lg border p-5 ${cfg.color}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`inline-block w-3 h-3 rounded-full ${cfg.dot} animate-pulse`} />
          <div>
            <p className="font-semibold text-gray-900">{cfg.label}</p>
            <p className="text-sm text-gray-500">
              {status === 'running' ? `v${version}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onToggle}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isStopped
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {isStopped ? '启动服务' : '停止服务'}
          </button>
        </div>
      </div>
    </div>
  );
}
