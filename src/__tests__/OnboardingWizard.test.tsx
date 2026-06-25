import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OnboardingWizard from '../components/wizard/OnboardingWizard';
import { resetMocks, mockInvokeCommand } from './setup';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../lib/detection', async () => {
  const actual = await vi.importActual<typeof import('../lib/detection')>('../lib/detection');
  return {
    ...actual,
    readExistingConfig: vi.fn(),
  };
});

import { readExistingConfig } from '../lib/detection';

const INSTALLED_STATE = {
  installed: true,
  currentVersion: '1.0.0',
  latestVersion: '1.0.0',
  pythonVersion: '3.12.0',
  upgradable: false,
  hasLocalEmbed: false,
};

function setupInstalled() {
  mockInvokeCommand('check_openviking_state', INSTALLED_STATE);
  mockInvokeCommand('get_python_versions', ['3.12', '3.11', '3.10']);
  mockInvokeCommand('get_openviking_versions', ['1.0.0', '0.9.0']);
  mockInvokeCommand('get_default_workspace', '/mock/OpenViking');
  mockInvokeCommand('set_workspace', 'ok');
  mockInvokeCommand('get_workspace_data_path', '/mock/OpenViking/data');
}

function renderWizard() {
  setupInstalled();
  return render(<OnboardingWizard onComplete={vi.fn()} />);
}

beforeEach(() => {
  resetMocks();
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  (readExistingConfig as ReturnType<typeof vi.fn>).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OnboardingWizard', () => {
  it('auto-skip advances directly to workspace step', async () => {
    renderWizard();

    await waitFor(() => {
      expect(screen.getByText('wizard.workspace_title')).toBeTruthy();
    });
  });

  it('pre-fills wizard fields when ov.conf exists in workspace', async () => {
    const readConfigMock = readExistingConfig as ReturnType<typeof vi.fn>;
    readConfigMock.mockResolvedValue({
      path: '/mock/OpenViking/ov.conf',
      workspace: '/mock/OpenViking/',
      config: {
        server: { port: 1933, root_api_key: 'existing-key' },
        storage: { workspace: '/mock/OpenViking/', vectordb: { backend: 'local' }, agfs: { backend: 'local' } },
        embedding: { dense: { provider: 'openai', model: 'text-embedding-3-small', api_key: 'sk-test' } },
        vlm: { provider: 'volcengine', api_key: 'sk-vlm', model: 'doubao' },
      },
    });

    renderWizard();

    await waitFor(() => {
      expect(screen.getByText('wizard.workspace_title')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('wizard.next'));

    // After clicking Next, should advance to step 2 (EmbeddingStep)
    // and readExistingConfig should have been called with workspace ov.conf path
    await waitFor(() => {
      expect(readConfigMock).toHaveBeenCalledWith('/mock/OpenViking/ov.conf');
    });
  });

  it('proceeds normally when no ov.conf exists', async () => {
    const readConfigMock = readExistingConfig as ReturnType<typeof vi.fn>;
    readConfigMock.mockResolvedValue(null);

    renderWizard();

    await waitFor(() => {
      expect(screen.getByText('wizard.workspace_title')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('wizard.next'));

    await waitFor(() => {
      expect(readConfigMock).toHaveBeenCalled();
    });
  });

  it('navigates back and forward without side effects', async () => {
    renderWizard();

    await waitFor(() => {
      expect(screen.getByText('wizard.workspace_title')).toBeTruthy();
    });

    // Back to step 0
    fireEvent.click(screen.getByText('wizard.back'));
    await waitFor(() => {
      expect(screen.getByText('wizard.step_install')).toBeTruthy();
    });

    // Forward to step 1 again
    fireEvent.click(screen.getByText('wizard.next'));
    await waitFor(() => {
      expect(screen.getByText('wizard.workspace_title')).toBeTruthy();
    });
  });
});
