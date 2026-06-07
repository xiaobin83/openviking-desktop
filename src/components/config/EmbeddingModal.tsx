import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import type { OvConfig, DenseEmbeddingConfig } from '../../lib/types';
import { getFieldsByTab } from '../../lib/config-fields';
import ConfigFieldRenderer from './ConfigField';

interface EmbeddingModalProps {
  config: OvConfig;
  open: boolean;
  onClose: (saved?: boolean) => void;
}

type Step = 'edit' | 'confirm' | 'executing' | 'complete' | null;

type StepName = 'stop' | 'verify_port' | 'delete_db' | 'save_config' | 'start';
type StepState = 'pending' | 'in_progress' | 'done' | 'error';

const STEP_NAMES: StepName[] = ['stop', 'verify_port', 'delete_db', 'save_config', 'start'];

const REMOTE_ONLY_FIELDS = new Set([
  'embedding.dense.api_base',
  'embedding.dense.api_key',
  'embedding.dense.input',
]);
const DIMENSION_PATH = 'embedding.dense.dimension';
const BATCH_SIZE_PATH = 'embedding.dense.batch_size';

const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  volcengine: 'doubao-embedding-vision-251215',
  openai: 'text-embedding-3-small',
  jina: 'jina-embeddings-v3',
  gemini: 'text-embedding-004',
  dashscope: 'text-embedding-v3',
  local: 'bge-small-zh-v1.5-f16',
};

function computeChanges(
  original: DenseEmbeddingConfig,
  current: DenseEmbeddingConfig
): Array<{ key: string; from: unknown; to: unknown }> {
  const allKeys = new Set([...Object.keys(original), ...Object.keys(current)]);
  const changes: Array<{ key: string; from: unknown; to: unknown }> = [];
  for (const key of allKeys) {
    const origVal = original[key as keyof DenseEmbeddingConfig];
    const currVal = current[key as keyof DenseEmbeddingConfig];
    if (JSON.stringify(origVal) !== JSON.stringify(currVal)) {
      changes.push({ key, from: origVal, to: currVal });
    }
  }
  return changes;
}

export default function EmbeddingModal({ config, open, onClose }: EmbeddingModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(null);
  const [localDense, setLocalDense] = useState<DenseEmbeddingConfig>({});
  const [stepStates, setStepStates] = useState<Record<StepName, StepState>>({
    stop: 'pending',
    verify_port: 'pending',
    delete_db: 'pending',
    save_config: 'pending',
    start: 'pending',
  });
  const [error, setError] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<number | null>(null);
  const abortRef = useRef(false);
  const originalDenseRef = useRef<DenseEmbeddingConfig>({});

  useEffect(() => {
    if (open) {
      setStep('edit');
      setLocalDense(structuredClone(config.embedding?.dense ?? {}));
      originalDenseRef.current = structuredClone(config.embedding?.dense ?? {});
      setStepStates({
        stop: 'pending',
        verify_port: 'pending',
        delete_db: 'pending',
        save_config: 'pending',
        start: 'pending',
      });
      setError(null);
      setFailedStep(null);
      abortRef.current = false;
    }
  }, [open, config.embedding?.dense]);

  const handleFieldChange = useCallback(
    (path: string, value: unknown) => {
      const denseKeys = path.replace('embedding.dense.', '');
      setLocalDense((prev) => {
        const updated = { ...prev, [denseKeys]: value };

        if (denseKeys === 'provider') {
          if (value === 'local') {
            if (updated.dimension === undefined) updated.dimension = 512;
            delete updated.api_key;
            delete updated.api_base;
            delete updated.input;
            if (!updated.model_path && originalDenseRef.current?.model_path) {
              updated.model_path = originalDenseRef.current.model_path;
            }
            if (originalDenseRef.current?.model) {
              updated.model = originalDenseRef.current.model;
            } else {
              updated.model = PROVIDER_DEFAULT_MODEL.local;
            }
          } else {
            if (updated.dimension === undefined) updated.dimension = 1024;
            if (updated.batch_size === undefined) updated.batch_size = 32;
            const defaultModel = PROVIDER_DEFAULT_MODEL[value as string];
            if (defaultModel) {
              updated.model = defaultModel;
            }
            delete updated.model_path;
          }
        }
        return updated;
      });
    },
    []
  );

  const changes = computeChanges(
    config.embedding?.dense ?? {},
    localDense
  );

  const handleSaveRebuild = () => {
    if (changes.length === 0) return;
    setStep('confirm');
  };

  const handleBack = () => {
    setStep('edit');
  };

  const handleCancel = () => {
    if (step === 'executing') {
      abortRef.current = true;
    }
    onClose(false);
  };

  const markStep = (stepName: StepName, state: StepState) => {
    setStepStates((prev) => ({ ...prev, [stepName]: state }));
  };

  const executeSteps = async () => {
    setStep('executing');
    abortRef.current = false;

    const getServerPort = () => config.server?.port ?? 1933;

    try {
      markStep('stop', 'in_progress');
      await invoke('write_rebuild_lock', {
        content: JSON.stringify({
          status: 'in_progress',
          timestamp: new Date().toISOString(),
          target_config: localDense,
        }),
      });

      try {
        await invoke('stop_server');
      } catch {
        // Already stopped
      }
      markStep('stop', 'done');

      markStep('verify_port', 'in_progress');
      const portsToCheck = [getServerPort(), 18790];
      for (const port of portsToCheck) {
        let occupied = await invoke<boolean>('check_port', { port });
        let retries = 3;
        while (occupied && retries > 0 && !abortRef.current) {
          await new Promise((r) => setTimeout(r, 1000));
          occupied = await invoke<boolean>('check_port', { port });
          retries--;
        }
        if (occupied && !abortRef.current) {
          await invoke('kill_port_process', { port });
          await new Promise((r) => setTimeout(r, 500));
          const stillOccupied = await invoke<boolean>('check_port', { port });
          if (stillOccupied) {
            setError(t('embedding_modal.port_error', { port }));
            setFailedStep(2);
            markStep('verify_port', 'error');
            return;
          }
        }
      }
      markStep('verify_port', 'done');

      markStep('delete_db', 'in_progress');
      const vdbPath = await invoke<string>('resolve_vectordb_path');
      await invoke('delete_directory', { path: vdbPath });
      markStep('delete_db', 'done');

      markStep('save_config', 'in_progress');
      const newEmbedding = { ...config.embedding, dense: localDense };
      const newConfig = { ...config, embedding: newEmbedding };
      delete (newConfig as Record<string, unknown>).retrieval;
      await invoke('write_config', { config: JSON.stringify(newConfig, null, 2) });
      markStep('save_config', 'done');

      markStep('start', 'in_progress');
      try {
        await invoke('start_server');
      } catch (e) {
        setError(t('embedding_modal.start_error') + String(e));
        setFailedStep(5);
        markStep('start', 'error');
        return;
      }
      markStep('start', 'done');

      await invoke('delete_rebuild_lock');

      setStep('complete');
    } catch (e) {
      setError(String(e));
      setFailedStep(STEP_NAMES.findIndex((s) => stepStates[s] === 'in_progress' || stepStates[s] === 'pending'));
    }
  };

  const handleRetry = () => {
    setError(null);
    setFailedStep(null);
    setStepStates({
      stop: 'pending',
      verify_port: 'pending',
      delete_db: 'pending',
      save_config: 'pending',
      start: 'pending',
    });
    executeSteps();
  };

  const handleDone = () => {
    onClose(true);
  };

  if (!open || step === null) return null;

  const renderField = (path: string) => {
    const fields = getFieldsByTab('ai');
    const field = fields.find((f) => f.path === path);
    if (!field) return null;

    const provider = localDense.provider ?? 'local';
    const isLocal = provider === 'local';
    if (isLocal && REMOTE_ONLY_FIELDS.has(path)) return null;

    if (!isLocal && path === 'embedding.dense.model_path') return null;

    const keys = path.split('.');
    let value: unknown = localDense[keys[keys.length - 1] as keyof DenseEmbeddingConfig];

    return (
      <ConfigFieldRenderer
        key={field.path}
        field={field}
        value={value}
        onChange={handleFieldChange}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { if (step === 'edit') handleCancel(); }}>
      <div
        className="bg-surface-card border border-border-subtle rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'edit' && (
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-text-primary">{t('embedding_modal.title')}</h2>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-md px-4 py-3 text-sm text-amber-400">
              {t('embedding_modal.warning')}
            </div>

            <div className="space-y-3">
              {renderField('embedding.dense.provider')}
              {renderField('embedding.dense.model')}
              {renderField('embedding.dense.model_path')}
              {renderField('embedding.dense.api_base')}
              {renderField('embedding.dense.api_key')}
              {renderField('embedding.dense.dimension')}
              {renderField('embedding.dense.input')}
              {renderField('embedding.dense.batch_size')}
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                {t('embedding_modal.cancel')}
              </button>
              <button
                onClick={handleSaveRebuild}
                disabled={changes.length === 0}
                className="px-5 py-2 bg-aurora-500/15 text-aurora-400 rounded-md text-sm font-medium hover:bg-aurora-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('embedding_modal.save_rebuild')}
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-text-primary">{t('embedding_modal.title')}</h2>

            <div className="bg-red-500/10 border border-red-500/20 rounded-md px-4 py-3 text-sm text-red-400">
              <p className="font-semibold mb-1">{t('embedding_modal.confirm_warning')}</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>{t('embedding_modal.step_stop')}</li>
                <li>{t('embedding_modal.step_delete_db')}</li>
                <li>{t('embedding_modal.step_save_config')}</li>
                <li>{t('embedding_modal.step_start')}</li>
              </ol>
            </div>

            <div className="border border-border-subtle rounded-md px-4 py-3">
              <h3 className="text-sm font-semibold text-text-primary mb-2">{t('embedding_modal.changes')}</h3>
              <div className="text-sm space-y-1">
                {changes.map((c) => (
                  <div key={c.key} className="flex gap-2">
                    <span className="text-text-muted">{c.key}:</span>
                    <span className="text-text-secondary">{JSON.stringify(c.from)}</span>
                    <span className="text-green-400">&rarr;</span>
                    <span className="text-text-primary">{JSON.stringify(c.to)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button onClick={handleBack} className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
                {t('embedding_modal.back')}
              </button>
              <button onClick={handleCancel} className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
                {t('embedding_modal.cancel')}
              </button>
              <button
                onClick={executeSteps}
                className="px-5 py-2 bg-red-500/15 text-red-400 rounded-md text-sm font-medium hover:bg-red-500/25 transition-colors"
              >
                {t('embedding_modal.confirm_rebuild')}
              </button>
            </div>
          </div>
        )}

        {step === 'executing' && (
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-text-primary">{t('embedding_modal.title')}</h2>
            <p className="text-sm text-text-secondary">{t('embedding_modal.rebuilding')}</p>

            <div className="space-y-2">
              {STEP_NAMES.map((stepName) => {
                const state = stepStates[stepName];
                return (
                  <div
                    key={stepName}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                      state === 'error'
                        ? 'bg-red-500/10 text-red-400'
                        : state === 'done'
                        ? 'bg-green-500/10 text-green-400'
                        : state === 'in_progress'
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'text-text-muted'
                    }`}
                  >
                    <span className="w-5 h-5 flex items-center justify-center">
                      {state === 'done' && <span>&check;</span>}
                      {state === 'in_progress' && <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                      {state === 'error' && <span>&times;</span>}
                      {state === 'pending' && <span className="w-3 h-3 rounded-full border border-current opacity-40" />}
                    </span>
                    <span>{t(`embedding_modal.step_${stepName}`)}</span>
                    {state === 'in_progress' && <span className="ml-auto text-xs">{t('embedding_modal.in_progress')}</span>}
                    {state === 'done' && <span className="ml-auto text-xs">{t('embedding_modal.done_status')}</span>}
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-md px-4 py-3 text-sm text-red-400">
                <p>{error}</p>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              {failedStep !== null ? (
                <>
                  <button onClick={handleCancel} className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
                    {t('embedding_modal.cancel')}
                  </button>
                  <button onClick={handleRetry} className="px-5 py-2 bg-amber-500/15 text-amber-400 rounded-md text-sm font-medium hover:bg-amber-500/25 transition-colors">
                    {t('embedding_modal.retry')}
                  </button>
                </>
              ) : (
                <button onClick={handleCancel} disabled className="px-4 py-2 text-sm font-medium text-text-muted cursor-not-allowed">
                  {t('embedding_modal.cancel')}
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'complete' && (
          <div className="p-6 space-y-4 text-center">
            <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
              <span className="text-green-400 text-3xl">&check;</span>
            </div>
            <h2 className="text-lg font-bold text-text-primary">{t('embedding_modal.success')}</h2>
            <p className="text-sm text-text-secondary">{t('embedding_modal.success_desc')}</p>
            <button onClick={handleDone} className="px-6 py-2 bg-aurora-500/15 text-aurora-400 rounded-md text-sm font-medium hover:bg-aurora-500/25 transition-colors">
              {t('embedding_modal.done')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
