import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { findForeignOccupiedPorts } from '../../lib/detection';
import type { OvConfig } from '../../lib/types';

interface PortStepProps {
  formData: Partial<OvConfig>;
  onPortsResolved: (updatedFormData: Partial<OvConfig>) => void;
  onExit: () => void;
  /** 'wizard' = embedded in step card; 'dialog' = modal overlay (for App.tsx). Default: 'wizard' */
  mode?: 'wizard' | 'dialog';
}

export default function PortStep({ formData, onPortsResolved, onExit, mode = 'wizard' }: PortStepProps) {
  const { t } = useTranslation();

  const defaultServerPort = formData.server?.port ?? 1933;
  const defaultBotPort = formData.bot?.gateway?.port ?? 18790;

  const [checking, setChecking] = useState(true);
  const [conflictPorts, setConflictPorts] = useState<number[]>([]);
  const [editServerPort, setEditServerPort] = useState(defaultServerPort);
  const [editBotPort, setEditBotPort] = useState(defaultBotPort);
  const [error, setError] = useState('');

  const checkPorts = async (serverPort: number, botPort: number) => {
    setChecking(true);
    setError('');
    try {
      const conflicts = await findForeignOccupiedPorts(serverPort, botPort);
      if (conflicts.length === 0) {
        const updated: Partial<OvConfig> = JSON.parse(JSON.stringify(formData));
        updated.server = { ...(updated.server ?? {}), port: serverPort } as OvConfig['server'];
        updated.bot = {
          ...(updated.bot ?? {}),
          gateway: { ...(updated.bot?.gateway ?? {}), port: botPort },
        } as OvConfig['bot'];
        onPortsResolved(updated);
        return;
      }
      setConflictPorts(conflicts);
      setEditServerPort(serverPort);
      setEditBotPort(botPort);
    } catch {
      setError(t('wizard.port_check_failed'));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkPorts(defaultServerPort, defaultBotPort);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRecheck = async () => {
    if (!Number.isInteger(editServerPort) || editServerPort < 1 || editServerPort > 65535) {
      setError(t('wizard.port_invalid', { field: t('wizard.port_server') }));
      return;
    }
    if (!Number.isInteger(editBotPort) || editBotPort < 1 || editBotPort > 65535) {
      setError(t('wizard.port_invalid', { field: t('wizard.port_bot_gateway') }));
      return;
    }
    if (editServerPort === editBotPort) {
      setError(t('wizard.port_duplicate'));
      return;
    }
    const changed = editServerPort !== defaultServerPort || editBotPort !== defaultBotPort;
    if (!changed && conflictPorts.length > 0) {
      setError(t('wizard.port_unchanged'));
      return;
    }
    await checkPorts(editServerPort, editBotPort);
  };

  const handleExit = async () => {
    await invoke('exit_app').catch(() => {});
    onExit();
  };

  const fieldStyle =
    'w-full rounded-lg bg-surface-hover border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-aurora-400/50 transition-colors';
  const labelStyle = 'block text-xs font-semibold text-text-secondary mb-1.5';

  const innerContent = checking ? (
    <div className="flex items-center justify-center py-12">
      <span className="text-sm text-text-muted">{t('wizard.port_checking')}</span>
    </div>
  ) : (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
        <h2 className="text-lg font-bold text-amber-400">{t('wizard.port_conflict_title')}</h2>
        <p className="mt-1 text-sm text-text-muted">
          {t('wizard.port_conflict_desc', {
            ports: conflictPorts.join(', '),
          })}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className={labelStyle}>{t('wizard.port_server')}</label>
          <input
            type="number"
            value={editServerPort}
            onChange={(e) => setEditServerPort(Number(e.target.value))}
            min={1}
            max={65535}
            className={fieldStyle}
          />
        </div>
        <div>
          <label className={labelStyle}>{t('wizard.port_bot_gateway')}</label>
          <input
            type="number"
            value={editBotPort}
            onChange={(e) => setEditBotPort(Number(e.target.value))}
            min={1}
            max={65535}
            className={fieldStyle}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleExit}
          className="rounded-xl bg-surface-elevated hover:bg-surface-hover border border-border-subtle px-6 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          {t('app.port_conflict_exit')}
        </button>
        <button
          onClick={handleRecheck}
          className="rounded-xl bg-aurora-500 hover:bg-aurora-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors ml-auto"
        >
          {t('wizard.port_recheck')}
        </button>
      </div>
    </div>
  );

  // Dialog mode: render as a modal overlay (like PortConflictDialog)
  if (mode === 'dialog') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="mx-auto max-w-md w-full p-6">
          <div
            role="dialog"
            aria-modal="true"
            className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-2xl"
          >
            {innerContent}
          </div>
        </div>
      </div>
    );
  }

  // Wizard mode: render directly (embedded in step card)
  return innerContent;
}
