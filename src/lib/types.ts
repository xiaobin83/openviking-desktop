export interface HealthResponse {
  status: string;
  healthy: boolean;
  version: string;
}

export interface DashboardSummary {
  context_counts: {
    files: number;
    skills: number;
    memories: number;
    total: number;
  };
  today_tokens?: { input: number; output: number };
  today_retrievals?: { count: number };
}

export interface MemoryStats {
  total_memories: number;
  by_category: Record<string, number>;
}

export interface ApiResponse<T> {
  status: string;
  result?: T;
  error?: { code: string; message: string };
}

export interface OvConfig {
  server: {
    host: string;
    port: number;
    auth_mode?: string | null;
    cors_origins?: string[];
    observability?: {
      metrics?: {
        enabled?: boolean;
      };
    };
  };
  storage: {
    workspace: string;
    vectordb: { backend: string };
    agfs: { backend: string };
  };
  embedding: {
    model: string;
    base_url?: string | null;
    api_key?: string | null;
  };
  llm: {
    model: string;
    base_url?: string | null;
    api_key?: string | null;
  };
  vlm: {
    model?: string | null;
    base_url?: string | null;
    api_key?: string | null;
  };
  retrieval: {
    top_k: number;
    threshold: number;
  };
  encryption: {
    enabled: boolean;
  };
  log: {
    level: string;
  };
}
