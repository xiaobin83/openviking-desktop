import type { ReactNode } from 'react';

interface ConfigGroupProps {
  title: string;
  children: ReactNode;
}

export default function ConfigGroup({ title, children }: ConfigGroupProps) {
  return (
    <div className="border border-border-subtle rounded-lg bg-surface-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-text-primary mb-2">{title}</h3>
      {children}
    </div>
  );
}
