import type { HealthResponse, DashboardSummary, MemoryStats, ApiResponse } from './types';

const BASE_URL = 'http://127.0.0.1:1933';
let rootApiKey = '';
let account = 'default';
let user = 'default';

export function setRootApiKey(key: string) {
  rootApiKey = key;
}

export function getRootApiKey(): string {
  return rootApiKey;
}

export function setTenant(accountId: string, userId: string) {
  account = accountId;
  user = userId;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (rootApiKey) {
    headers['Authorization'] = `Bearer ${rootApiKey}`;
    headers['X-OpenViking-Account'] = account;
    headers['X-OpenViking-User'] = user;
  }
  return headers;
}

async function fetchApi<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  console.log(`[API] Request: GET ${url}`);

  const startTime = performance.now();
  const response = await fetch(url, {
    headers: { ...authHeaders() },
  });
  const elapsed = (performance.now() - startTime).toFixed(0);

  if (!response.ok) {
    console.error(`[API] Response: GET ${url} -> ${response.status} (${elapsed}ms)`);
    throw new Error(`API error: ${response.status}`);
  }

  const data: ApiResponse<T> = await response.json();
  console.log(`[API] Response: GET ${url} -> ${response.status} (${elapsed}ms)`, data);

  if (data.status === 'error') {
    console.error(`[API] Business Error: GET ${url}`, data.error);
    throw new Error(data.error?.message ?? 'Unknown error');
  }

  return data.result as T;
}

export async function checkHealth(): Promise<HealthResponse> {
  const url = `${BASE_URL}/health`;
  console.log(`[API] Request: GET ${url}`);

  const startTime = performance.now();
  const response = await fetch(url, {
    headers: { ...authHeaders() },
  });
  const elapsed = (performance.now() - startTime).toFixed(0);

  if (!response.ok) {
    console.error(`[API] Response: GET ${url} -> ${response.status} (${elapsed}ms)`);
    throw new Error(`Health check failed: ${response.status}`);
  }

  const data: HealthResponse = await response.json();
  console.log(`[API] Response: GET ${url} -> ${response.status} (${elapsed}ms)`, data);
  return data;
}

export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  try {
    const result = await fetchApi<DashboardSummary>('/api/v1/console/dashboard/summary');
    return result;
  } catch {
    return null;
  }
}

export async function getMemoryStats(): Promise<MemoryStats> {
  return fetchApi<MemoryStats>('/api/v1/stats/memories');
}
