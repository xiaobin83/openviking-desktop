import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { getDefaultConfigJson } from '../../lib/config-fields';
import { readExistingConfig, prefillFormData, mergeWizardChanges } from '../../lib/detection';
import { dirname, join } from '../../lib/path';
import type { OvConfig, PythonEnvState } from '../../lib/types';
import WizardProgress from './WizardProgress';
import InstallStep from './InstallStep';
import WorkspaceStep, { type WorkspaceStepHandle } from './WorkspaceStep';
import EmbeddingStep from './EmbeddingStep';
import VlmStep from './VlmStep';
import ApiKeyStep from './ApiKeyStep';
import PortStep from './PortStep';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const TOTAL_STEPS = 6;
const PREDEFINED_VLM_PROVIDERS = ['volcengine', 'openai', 'openai-codex', 'deepseek', 'kimi', 'glm'];

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [isInstalled, setIsInstalled] = useState(false);
  const [checkingInstall, setCheckingInstall] = useState(true);
  const [error, setError] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [hasLocalEmbed, setHasLocalEmbed] = useState(false);
  const workspaceRef = useRef<WorkspaceStepHandle>(null);
  const originalConfigRef = useRef<OvConfig | null>(null);

  // Initialize form data from default config
  const [formData, setFormData] = useState<Partial<OvConfig>>(() => {
    const defaults = JSON.parse(getDefaultConfigJson()) as OvConfig;
    if (!defaults.embedding?.dense) defaults.embedding = { ...defaults.embedding, dense: {} };
    return defaults;
  });

  useEffect(() => {
    invoke<PythonEnvState>('check_openviking_state')
      .then((state) => {
        setIsInstalled(state.installed);
        setHasLocalEmbed(state.hasLocalEmbed);
      })
      .catch(() => {
        setIsInstalled(false);
      })
      .finally(() => setCheckingInstall(false));
  }, []);

  // Re-check hasLocalEmbed after installation completes (step 0 -> step 1)
  useEffect(() => {
    if (isInstalled) {
      invoke<PythonEnvState>('check_openviking_state')
        .then((state) => setHasLocalEmbed(state.hasLocalEmbed))
        .catch(() => {});
    }
  }, [isInstalled]);

  // Auto-skip step 0 on initial mount only (user can navigate back manually)
  const initialSkipDone = useRef(false);
  useEffect(() => {
    if (!checkingInstall && isInstalled && stepIndex === 0 && !initialSkipDone.current) {
      initialSkipDone.current = true;
      setStepIndex(1);
    }
  }, [checkingInstall, isInstalled, stepIndex]);

  const handleInstallComplete = useCallback(() => {
    setStepIndex(1);
  }, []);

  const isLastStep = stepIndex === TOTAL_STEPS - 1;
  const isApiKeyValid = (formData.server?.root_api_key || '') !== '';

  const isVlmValid = useCallback(() => {
    const vlm = formData.vlm;
    const isCustom = vlm?.provider && !PREDEFINED_VLM_PROVIDERS.includes(vlm.provider);
    if (isCustom) return !!(vlm.provider && vlm.model && vlm.api_key && vlm.api_base);
    return !!(vlm?.model && vlm?.api_key && vlm?.api_base);
  }, [formData.vlm]);

  const isWorkspaceValid = useCallback(() => {
    const ws = formData.storage?.workspace;
    return !!ws;
  }, [formData.storage?.workspace]);

  const isStepValid = useCallback(() => {
    if (stepIndex === 1) return isWorkspaceValid();
    if (stepIndex === 3) return isVlmValid();
    return true;
  }, [stepIndex, isWorkspaceValid, isVlmValid]);

  const handleBack = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex((s) => s - 1);
    }
  }, [stepIndex]);

  const handleNext = useCallback(async () => {
    if (!isStepValid()) return;

    // For workspace step, persist draft path (create dirs) before proceeding.
    // If ov.conf already exists in the workspace, pre-fill remaining wizard fields.
    if (stepIndex === 1) {
      try {
        const dataPath = await workspaceRef.current?.persist();
        if (dataPath) {
          const workspacePath = dirname(dataPath);
          const ovConfPath = join(workspacePath, 'ov.conf');
          const configInfo = await readExistingConfig(ovConfPath);
          if (configInfo) {
            // Save full config for merge-on-complete (preserve non-wizard fields)
            originalConfigRef.current = configInfo.config;
            const preFilled = prefillFormData(configInfo.config, formData);
            setFormData((prev) => ({ ...prev, ...preFilled }));
          } else {
            originalConfigRef.current = null;
          }
        }
      } catch {
        setError(t('wizard.workspace_invalid'));
        return;
      }
    }

    if (stepIndex === 4 && !isApiKeyValid) return;
    if (isLastStep && !isApiKeyValid) return;
    if (!isLastStep) {
      setStepIndex((s) => s + 1);
    }
  }, [isLastStep, isApiKeyValid, isStepValid, stepIndex, t, formData]);

  const handleComplete = async (overrideFormData?: Partial<OvConfig>) => {
    setError('');
    const data = overrideFormData ?? formData;
    try {
      let configToWrite: string;
      if (originalConfigRef.current) {
        configToWrite = JSON.stringify(
          mergeWizardChanges(originalConfigRef.current, data),
          null,
          2,
        );
      } else {
        configToWrite = JSON.stringify(data, null, 2);
      }
      await invoke('write_config', { config: configToWrite });
      await invoke('mark_onboarded');
      onComplete();
    } catch (err) {
      setError(String(err));
    }
  };

  const handlePortsResolved = (updatedFormData: Partial<OvConfig>) => {
    setFormData(updatedFormData);
    handleComplete(updatedFormData);
  };

  if (checkingInstall) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <span className="text-sm tracking-widest text-text-muted">
          {t('app.preparing')}
        </span>
      </div>
    );
  }

  const renderStep = () => {
    switch (stepIndex) {
      case 0:
        return (
          <InstallStep
            isInstalled={isInstalled}
            onInstalled={() => setIsInstalled(true)}
            onInstallComplete={handleInstallComplete}
            onInstallingChange={setIsInstalling}
          />
        );
      case 1:
        return (
          <WorkspaceStep
            ref={workspaceRef}
            formData={formData}
            onChange={(data) => setFormData({ ...formData, ...data })}
          />
        );
      case 2:
        return (
          <EmbeddingStep
            formData={formData}
            onChange={(data) => setFormData({ ...formData, ...data })}
            hasLocalEmbed={hasLocalEmbed}
          />
        );
      case 3:
        return (
          <VlmStep
            formData={formData}
            onChange={(data) => setFormData({ ...formData, ...data })}
          />
        );
      case 4:
        return (
          <ApiKeyStep
            formData={formData}
            onChange={(data) => setFormData({ ...formData, ...data })}
          />
        );
      case 5:
        return (
          <PortStep
            formData={formData}
            onPortsResolved={handlePortsResolved}
            onExit={onComplete}
          />
        );
      default:
        return null;
    }
  };

  const showNav = (stepIndex > 0 || (stepIndex === 0 && isInstalled)) && stepIndex !== 5;

  return (
    <div className="h-screen flex flex-col bg-surface">
      <header className="flex-shrink-0 border-b border-border-subtle bg-surface-elevated/80 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-aurora-400 to-aurora-600 shadow-lg shadow-aurora-500/20">
              <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-text-primary">{t('wizard.title')}</h1>
              <p className="text-[11px] text-text-muted">Step {stepIndex + 1} of {TOTAL_STEPS}</p>
            </div>
          </div>
          <WizardProgress totalSteps={TOTAL_STEPS} currentStep={stepIndex} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl p-6">
          <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6">
            {renderStep()}
          </div>

          {showNav && (
            <div className="flex items-center mt-6 gap-3">
              {stepIndex > 0 && (
                <button
                  onClick={handleBack}
                  className="rounded-xl bg-surface-elevated hover:bg-surface-hover border border-border-subtle px-6 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  {t('wizard.back')}
                </button>
              )}
              <div className="ml-auto">
                {isLastStep ? (
                  <button
                    onClick={() => handleComplete()}
                    disabled={!isApiKeyValid}
                    className="rounded-xl bg-aurora-500 hover:bg-aurora-600 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2.5 text-sm font-semibold text-white transition-colors"
                  >
                    {t('wizard.complete')}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    disabled={!isStepValid() || isInstalling}
                    className="rounded-xl bg-aurora-500 hover:bg-aurora-600 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2.5 text-sm font-semibold text-white transition-colors"
                  >
                    {t('wizard.next')}
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400 flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={() => handleComplete()}
                className="px-3 py-1 bg-red-500/20 text-red-400 rounded-md hover:bg-red-500/30 transition-colors text-xs font-medium"
              >
                {t('embedding_modal.retry')}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
