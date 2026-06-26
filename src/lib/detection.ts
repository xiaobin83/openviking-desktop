import { invoke } from '@tauri-apps/api/core';
import type { ExistingConfigInfo, OvConfig } from './types';

/**
 * Result of a server detection scan for a single port.
 */
export interface DetectionResult {
  /** Whether a process is listening on the port (TCP port occupied). */
  serverRunning: boolean;
  /** Whether the /health endpoint returned a 200 OK response. */
  healthOk: boolean;
}

/**
 * Check the /health endpoint on the given port.
 *
 * Sends a GET request with a configurable timeout. The request carries
 * no auth headers — this is a read-only liveness probe, not an
 * authenticated API call.
 *
 * @param port - TCP port to probe.
 * @param timeoutMs - Abort the fetch after this many milliseconds.
 * @returns `true` if the endpoint responds with an HTTP 2xx status.
 */
async function checkHealthEndpoint(port: number, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    // Aborted (timeout) or network error → treat as unhealthy.
    clearTimeout(timeoutId);
    return false;
  }
}

/**
 * Detect whether an OpenViking server is running on the given port.
 *
 * 1. Queries the Rust backend via {@link https://tauri.app Tauri invoke}
 *    to check if the TCP port is occupied.
 * 2. If the port is occupied, probes the `/health` HTTP endpoint to
 *    confirm the server is actually healthy.
 *
 * @param port - TCP port to scan (defaults to 1933).
 * @param timeoutMs - Maximum time to wait for the /health response (default 3000 ms).
 * @returns A {@link DetectionResult} with `serverRunning` and `healthOk` flags.
 */
export async function detectServer(
  port: number = 1933,
  timeoutMs: number = 3000,
): Promise<DetectionResult> {
  // 1. Check if port is occupied via Tauri invoke
  const serverRunning = await invoke<boolean>('check_port', { port });

  if (!serverRunning) {
    return { serverRunning: false, healthOk: false };
  }

  // 2. Check /health endpoint
  const healthOk = await checkHealthEndpoint(port, timeoutMs);
  return { serverRunning: true, healthOk };
}

/** Config fields that the wizard exposes in its UI — all other ov.conf fields are excluded from pre-fill. */
const WIZARD_VISIBLE_FIELDS = new Set([
  'server.port',
  'server.root_api_key',
  'storage.workspace',
  'embedding.dense.provider',
  'embedding.dense.api_base',
  'embedding.dense.api_key',
  'embedding.dense.model',
  'embedding.dense.dimension',
  'embedding.dense.input',
  'embedding.dense.batch_size',
  'embedding.dense.model_path',
  'vlm.provider',
  'vlm.api_base',
  'vlm.api_key',
  'vlm.model',
]);

/**
 * Check whether a parsed config object is effectively empty
 * (null, non-object, or no own enumerable keys).
 */
function isConfigEmpty(config: unknown): boolean {
  return !config || typeof config !== 'object' || Object.keys(config).length === 0;
}

/**
 * Read an existing ov.conf from a filesystem path and return parsed config info.
 * Returns null if the file doesn't exist, is corrupted, or is empty.
 */
export async function readExistingConfig(pathStr: string): Promise<ExistingConfigInfo | null> {
  let content: string;
  try {
    content = await invoke<string>('read_config_at', { path: pathStr });
  } catch {
    return null;
  }

  let config: OvConfig;
  try {
    config = JSON.parse(content);
  } catch {
    return null;
  }

  if (isConfigEmpty(config)) {
    return null;
  }

  const normalizedPath = pathStr.replace(/\\/g, '/');
  const lastSlash = normalizedPath.lastIndexOf('/');
  const workspace = lastSlash >= 0 ? normalizedPath.substring(0, lastSlash + 1) : normalizedPath;
  return { path: pathStr, workspace, config };
}

/** Set a nested value on an object by dot-separated path — creates intermediate objects as needed. */
function setByPath(obj: Record<string, unknown>, path_: string, value: unknown): void {
  const keys = path_.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

/** Read a nested value from an object by dot-separated path. */
function getByPath(obj: Record<string, unknown>, path_: string): unknown {
  return path_.split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj as unknown);
}

/**
 * Pre-fill wizard-visible fields from an existing ov.conf into the default form data.
 * Only fields that the wizard exposes (embedding, VLM, API key, workspace, port) are copied.
 * Non-wizard fields (feishu, circuit_breaker, encryption, etc.) are excluded.
 * Missing fields fall back to the defaults.
 */
export function prefillFormData(
  config: OvConfig,
  defaults: Partial<OvConfig>,
): Partial<OvConfig> {
  const result: Partial<OvConfig> = JSON.parse(JSON.stringify(defaults));

  for (const fieldPath of WIZARD_VISIBLE_FIELDS) {
    const value = getByPath(config as unknown as Record<string, unknown>, fieldPath);
    if (value !== undefined && value !== null) {
      setByPath(result as unknown as Record<string, unknown>, fieldPath, value);
    }
  }

  return result;
}

/**
 * Check whether OpenViking processes are already running on the configured ports.
 * Returns the list of ports that are occupied and confirmed as OpenViking via /health.
 */
export async function findConflictingPorts(serverPort: number, botPort: number): Promise<number[]> {
  const conflicts: number[] = [];
  const serverResult = await detectServer(serverPort);
  if (serverResult.serverRunning && serverResult.healthOk) {
    conflicts.push(serverPort);
    // Bot gateway has no /health endpoint — check TCP occupancy only.
    // Only add bot port if the server port was confirmed as OpenViking.
    const botRunning = await invoke<boolean>('check_port', { port: botPort });
    if (botRunning) {
      conflicts.push(botPort);
    }
  }
  return conflicts;
}

/**
 * Detect ports occupied by a non-OpenViking process
 * (TCP port in use, but the /health endpoint is unreachable).
 *
 * For the server port: checks TCP occupancy then probes /health.
 * For the bot gateway port: since it has no /health endpoint,
 * TCP occupancy alone flags it as foreign — but only when the
 * server port is NOT confirmed as OpenViking (to avoid false
 * positives when OpenViking is already running on both ports).
 *
 * @param serverPort - TCP port to scan for the main server.
 * @param botPort    - Optional bot gateway port to also scan.
 * @param timeoutMs  - Max wait for /health response (default 3000 ms).
 * @returns Ports occupied by non-OpenViking foreign processes.
 */
export async function findForeignOccupiedPorts(
  serverPort: number,
  botPort?: number,
  timeoutMs: number = 3000,
): Promise<number[]> {
  const foreignPorts: number[] = [];
  let serverIsOurs = false;

  const serverOccupied = await invoke<boolean>('check_port', { port: serverPort });
  if (serverOccupied) {
    const healthOk = await checkHealthEndpoint(serverPort, timeoutMs);
    if (!healthOk) {
      foreignPorts.push(serverPort);
    } else {
      serverIsOurs = true;
    }
  }

  // Bot gateway has no /health endpoint — TCP occupancy alone flags it.
  // Skip when server is confirmed as OpenViking (both ports are likely ours).
  if (!serverIsOurs && botPort !== undefined && botPort !== serverPort) {
    const botOccupied = await invoke<boolean>('check_port', { port: botPort });
    if (botOccupied) {
      foreignPorts.push(botPort);
    }
  }

  return foreignPorts;
}

/**
 * Merge wizard-visible fields from formData into an existing full config.
 * Non-wizard fields in the existing config are preserved unchanged.
 */
export function mergeWizardChanges(existing: OvConfig, formData: Partial<OvConfig>): OvConfig {
  const result = JSON.parse(JSON.stringify(existing)) as OvConfig;
  for (const fieldPath of WIZARD_VISIBLE_FIELDS) {
    const value = getByPath(formData as unknown as Record<string, unknown>, fieldPath);
    if (value !== undefined && value !== null) {
      setByPath(result as unknown as Record<string, unknown>, fieldPath, value);
    }
  }
  return result;
}
