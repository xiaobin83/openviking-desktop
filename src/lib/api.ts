import type { HealthResponse, DashboardSummary, MemoryStats, ApiResponse } from './types';

const BASE_URL = 'http://127.0.0.1:1933';
let rootApiKey = '';

export function setRootApiKey(key: string) {
  rootApiKey = key;
}

function authHeaders(): Record<string, string> {
  return rootApiKey ? { 'Authorization': `Bearer ${rootApiKey}` } : {};
}

async function fetchApi<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  const data: ApiResponse<T> = await response.json();
  if (data.status === 'error') {
    throw new Error(data.error?.message ?? 'Unknown error');
  }
  return data.result as T;
}

export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${BASE_URL}/health`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.json();
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
