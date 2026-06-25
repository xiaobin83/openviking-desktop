import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Shared state accessible in both mock factories and helper functions.
// vi.hoisted() runs before vi.mock() factories, avoiding TDZ issues.
const tauriCore = vi.hoisted(() => ({
  invokeReturnValue: undefined as unknown,
  invokeError: null as string | null,
  invokeMap: {} as Record<string, unknown>,
}));

// --- Mock @tauri-apps/api/core ---
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((cmd: string, _args?: Record<string, unknown>) => {
    if (tauriCore.invokeError) {
      return Promise.reject(new Error(tauriCore.invokeError));
    }
    // Command-specific dispatch: if a value is registered for this command, use it
    if (cmd in tauriCore.invokeMap) {
      return Promise.resolve(tauriCore.invokeMap[cmd]);
    }
    // Fall back to generic return value
    return Promise.resolve(tauriCore.invokeReturnValue);
  }),
  listen: vi.fn().mockReturnValue(Promise.resolve(() => {})),
  once: vi.fn().mockReturnValue(Promise.resolve(() => {})),
  emit: vi.fn().mockReturnValue(Promise.resolve(undefined)),
}));

// --- Mock @tauri-apps/api/event ---
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockReturnValue(Promise.resolve(() => {})),
  once: vi.fn().mockReturnValue(Promise.resolve(() => {})),
  emit: vi.fn().mockReturnValue(Promise.resolve(undefined)),
}));

// --- Mock @tauri-apps/plugin-dialog ---
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockReturnValue(Promise.resolve(null)),
  save: vi.fn().mockReturnValue(Promise.resolve(null)),
  ask: vi.fn().mockReturnValue(Promise.resolve(true)),
  confirm: vi.fn().mockReturnValue(Promise.resolve(true)),
  message: vi.fn().mockReturnValue(Promise.resolve(undefined)),
}));

// --- Helper Functions ---

/**
 * Configure `invoke` to resolve with the given value on subsequent calls.
 * Also clears any previously set error.
 */
export function mockInvoke<T>(returnValue: T): void {
  tauriCore.invokeReturnValue = returnValue;
  tauriCore.invokeError = null;
}

/**
 * Configure `invoke` to resolve with a specific value for a specific Tauri command.
 */
export function mockInvokeCommand<T>(command: string, returnValue: T): void {
  tauriCore.invokeMap[command] = returnValue;
}

/**
 * Configure `invoke` to reject with the given error message on subsequent calls.
 */
export function mockInvokeError(error: string): void {
  tauriCore.invokeError = error;
}

/**
 * Reset all mocks to their default behaviour.
 */
export function resetMocks(): void {
  tauriCore.invokeReturnValue = undefined;
  tauriCore.invokeError = null;
  tauriCore.invokeMap = {};
}
