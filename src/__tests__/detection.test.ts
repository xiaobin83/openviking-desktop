import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockInvoke, mockInvokeError, resetMocks } from './setup';
import { detectServer } from '../lib/detection';

// Test suite: Port detection + health check service
describe('detectServer', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- Helper to create a mock fetch that respects AbortSignal ---

  function mockFetchWithSignal(
    response: Response | Error,
  ): ReturnType<typeof vi.fn> {
    return vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise<Response>((resolve, reject) => {
        if (init?.signal) {
          const onAbort = () => {
            init.signal!.removeEventListener('abort', onAbort);
            reject(new DOMException('The operation was aborted', 'AbortError'));
          };
          init.signal.addEventListener('abort', onAbort);
        }

        if (response instanceof Error) {
          reject(response);
        } else {
          resolve(response);
        }
      });
    });
  }

  // --- Test 1: port occupied + health 200 → both true ---

  it('returns { serverRunning: true, healthOk: true } when port is occupied and /health returns 200', async () => {
    mockInvoke(true);

    const mockResponse = new Response('{"status":"ok"}', {
      status: 200,
      statusText: 'OK',
    });
    vi.stubGlobal('fetch', mockFetchWithSignal(mockResponse));

    const result = await detectServer(1933);

    expect(result).toEqual({ serverRunning: true, healthOk: true });
  });

  // --- Test 2: port occupied but /health fails (network error) → healthOk false ---

  it('returns { serverRunning: true, healthOk: false } when port occupied but /health fetch fails', async () => {
    mockInvoke(true);

    vi.stubGlobal('fetch', mockFetchWithSignal(new Error('Network error')));

    const result = await detectServer(1933);

    expect(result).toEqual({ serverRunning: true, healthOk: false });
  });

  // --- Test 3: port not occupied → both false ---

  it('returns { serverRunning: false, healthOk: false } when port is not occupied', async () => {
    mockInvoke(false);

    const result = await detectServer(1933);

    expect(result).toEqual({ serverRunning: false, healthOk: false });
  });

  // --- Test 4: /health fetch times out → healthOk false ---

  it('returns { serverRunning: true, healthOk: false } when /health fetch times out', async () => {
    mockInvoke(true);

    // Mock fetch that never resolves but respects the abort signal
    const neverResolvingFetch = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          if (init?.signal) {
            const onAbort = () => {
              init.signal!.removeEventListener('abort', onAbort);
              reject(new DOMException('The operation was aborted', 'AbortError'));
            };
            init.signal.addEventListener('abort', onAbort);
          }
        });
      },
    );
    vi.stubGlobal('fetch', neverResolvingFetch);

    const result = await detectServer(1933, 10); // 10ms timeout for fast test

    expect(result).toEqual({ serverRunning: true, healthOk: false });
  });

  // --- Test 5: /health returns non-200 → healthOk false ---

  it('returns { serverRunning: true, healthOk: false } when /health returns non-200 status', async () => {
    mockInvoke(true);

    const mockResponse = new Response('Internal Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
    });
    vi.stubGlobal('fetch', mockFetchWithSignal(mockResponse));

    const result = await detectServer(1933);

    expect(result).toEqual({ serverRunning: true, healthOk: false });
  });
});

// ============================================================
// readExistingConfig & prefillFormData tests
// ============================================================
import { readExistingConfig, prefillFormData } from '../lib/detection';
import type { OvConfig } from '../lib/types';

describe('readExistingConfig', () => {
  beforeEach(() => {
    resetMocks();
  });

  // Test 1: Valid config returns ExistingConfigInfo
  it('returns ExistingConfigInfo when valid JSON config is found', async () => {
    const validJson = JSON.stringify({
      server: { port: 1933, root_api_key: 'test-key' },
      storage: { workspace: '/custom/path', vectordb: { backend: 'local' }, agfs: { backend: 'local' } },
      embedding: { dense: { provider: 'openai', model: 'text-embedding-3-small', api_key: 'sk-test' } },
    });
    mockInvoke(validJson);

    const result = await readExistingConfig('~/.openviking/ov.conf');

    expect(result).not.toBeNull();
    expect(result!.workspace).toBe('~/.openviking/');
    expect(result!.config.server.port).toBe(1933);
    expect(result!.config.server.root_api_key).toBe('test-key');
  });

  // Test 2: Nonexistent path returns null
  it('returns null when file does not exist', async () => {
    mockInvokeError('读取配置失败: No such file or directory');

    const result = await readExistingConfig('/nonexistent/path/ov.conf');

    expect(result).toBeNull();
  });

  // Test 3: Corrupted JSON returns null
  it('returns null when config contains corrupted JSON', async () => {
    mockInvoke('{broken');

    const result = await readExistingConfig('~/.openviking/ov.conf');

    expect(result).toBeNull();
  });

  // Test 4: Empty JSON returns null
  it('returns null when config is empty JSON object', async () => {
    mockInvoke('{}');

    const result = await readExistingConfig('~/.openviking/ov.conf');

    expect(result).toBeNull();
  });
});

describe('prefillFormData', () => {
  const defaults: Partial<OvConfig> = {
    server: { port: 1933, root_api_key: null },
    storage: { workspace: '~/.openviking/data', vectordb: { backend: 'local' }, agfs: { backend: 'local' } },
    embedding: { dense: { provider: 'local', api_base: '', api_key: '', model: '', dimension: 1024, input: '', batch_size: 32, model_path: '' } },
    vlm: { provider: '', api_base: '', api_key: '', model: '' },
    feishu: { app_id: '', app_secret: '' },
  };

  // Full config with wizard and non-wizard fields populated
  const fullConfig: OvConfig = {
    server: { port: 8080, root_api_key: 'existing-key' },
    storage: { workspace: '/existing/workspace', vectordb: { backend: 'local' }, agfs: { backend: 'local' } },
    embedding: { dense: { provider: 'openai', api_base: 'https://api.openai.com', api_key: 'sk-embed', model: 'text-embedding-3-small', dimension: 1536, input: 'text', batch_size: 64, model_path: '/models/embed.gguf' } },
    vlm: { provider: 'volcengine', api_base: 'https://ark.example.com', api_key: 'sk-vlm', model: 'doubao-pro' },
    feishu: { app_id: 'leaked-app-id', app_secret: 'leaked-secret' },
  };

  // Test 5: Copies wizard-visible fields from config into result
  it('copies wizard-visible fields from config into result', () => {
    const result = prefillFormData(fullConfig, defaults);

    // Server fields
    expect(result.server?.port).toBe(8080);
    expect(result.server?.root_api_key).toBe('existing-key');
    // Storage
    expect(result.storage?.workspace).toBe('/existing/workspace');
    // Embedding dense
    expect(result.embedding?.dense?.provider).toBe('openai');
    expect(result.embedding?.dense?.api_base).toBe('https://api.openai.com');
    expect(result.embedding?.dense?.api_key).toBe('sk-embed');
    expect(result.embedding?.dense?.model).toBe('text-embedding-3-small');
    expect(result.embedding?.dense?.dimension).toBe(1536);
    expect(result.embedding?.dense?.input).toBe('text');
    expect(result.embedding?.dense?.batch_size).toBe(64);
    expect(result.embedding?.dense?.model_path).toBe('/models/embed.gguf');
    // VLM
    expect(result.vlm?.provider).toBe('volcengine');
    expect(result.vlm?.api_base).toBe('https://ark.example.com');
    expect(result.vlm?.api_key).toBe('sk-vlm');
    expect(result.vlm?.model).toBe('doubao-pro');
  });

  // Test 6: Does NOT include non-wizard fields
  it('does NOT copy non-wizard fields (feishu, circuit_breaker, etc.)', () => {
    const result = prefillFormData(fullConfig, defaults);

    // Non-wizard fields should remain as defaults
    expect(result.feishu?.app_id).toBe('');
    expect(result.feishu?.app_secret).toBe('');
  });

  // Test 7: Falls back to defaults for missing fields
  it('falls back to defaults for fields not present in existing config', () => {
    const sparseConfig: OvConfig = {
      server: { port: 3000, root_api_key: null },
      storage: { workspace: '/sparse', vectordb: { backend: 'local' }, agfs: { backend: 'local' } },
      embedding: { dense: { provider: 'jina' } },
    };

    const result = prefillFormData(sparseConfig, defaults);

    // Copied from sparseConfig
    expect(result.server?.port).toBe(3000);
    expect(result.embedding?.dense?.provider).toBe('jina');
    expect(result.storage?.workspace).toBe('/sparse');
    // Fallback to defaults
    expect(result.server?.root_api_key).toBeNull();
    expect(result.embedding?.dense?.api_key).toBe('');
    expect(result.embedding?.dense?.model).toBe('');
    expect(result.embedding?.dense?.dimension).toBe(1024);
    expect(result.embedding?.dense?.batch_size).toBe(32);
    expect(result.vlm?.provider).toBe('');
    expect(result.vlm?.model).toBe('');
  });
});
