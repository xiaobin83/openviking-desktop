import type { OvConfig } from '../../lib/types';

interface BasicTabProps {
  config: OvConfig;
  onChange: (config: OvConfig) => void;
  workspace: string;
  onWorkspaceChange: (workspace: string) => void;
}

export default function BasicTab({ config, onChange, workspace, onWorkspaceChange }: BasicTabProps) {
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
        <label className="block text-sm font-medium text-text-secondary mb-1">工作空间</label>
        <input
          type="text"
          value={workspace}
          onChange={(e) => onWorkspaceChange(e.target.value)}
          placeholder="例如: /Users/xxx/.openviking"
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
        <p className="text-xs text-text-secondary mt-1">
          设置工作空间目录后，配置将从该目录下的 ov.conf 读取/保存
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">服务端口</label>
        <input
          type="number"
          value={config.server.port}
          onChange={(e) => update('server.port', parseInt(e.target.value) || 1933)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">数据存储路径</label>
        <input
          type="text"
          value={config.storage.workspace}
          onChange={(e) => update('storage.workspace', e.target.value)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">日志级别</label>
        <select
          value={config.log?.level ?? 'INFO'}
          onChange={(e) => update('log.level', e.target.value)}
          className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
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
