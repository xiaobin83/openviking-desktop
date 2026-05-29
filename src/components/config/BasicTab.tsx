import type { OvConfig } from '../../lib/types';

interface BasicTabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
}

export default function BasicTab({ config, onChange }: BasicTabProps) {
  const update = (path: string, value: string | number) => {
    const clone = structuredClone(config);
    const keys = path.split('.');
    let obj: Record<string, unknown> = clone as unknown as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]] as Record<string, unknown>;
    }
    obj[keys[keys.length - 1]] = value;
    onChange(clone);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">服务端口</label>
        <input
          type="number"
          value={config.server.port}
          onChange={(e) => update('server.port', parseInt(e.target.value) || 1933)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">数据存储路径</label>
        <input
          type="text"
          value={config.storage.workspace}
          onChange={(e) => update('storage.workspace', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">日志级别</label>
        <select
          value={config.log.level}
          onChange={(e) => update('log.level', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
        </select>
      </div>
    </div>
  );
}
