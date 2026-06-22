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
  today_tokens?: {
    vlm_input: number;
    vlm_output: number;
    embedding_input: number;
    total: number;
  };
  today_retrievals?: {
    find: number;
    search: number;
    total: number;
  };
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

export interface DenseEmbeddingConfig {
  provider?: string;
  api_key?: string;
  api_base?: string;
  model?: string;
  dimension?: number;
  input?: string;
  batch_size?: number;
  model_path?: string;
  query_param?: string;
  document_param?: string;
  extra_headers?: Record<string, string>;
  ak?: string;
  sk?: string;
  region?: string;
  enable_fusion?: boolean;
  res_level?: number;
  max_video_frames?: number;
  input_type?: string;
}

export interface SparseEmbeddingConfig {
  provider?: string;
  api_key?: string;
  model?: string;
}

export interface HybridEmbeddingConfig {
  provider?: string;
  api_key?: string;
  model?: string;
  dimension?: number;
}

export interface CircuitBreakerConfig {
  failure_threshold?: number;
  reset_timeout?: number;
  max_reset_timeout?: number;
}

export interface VlmConfig {
  provider?: string;
  api_key?: string;
  api_base?: string;
  model?: string;
  max_retries?: number;
  max_concurrent?: number;
  timeout?: number;
  thinking?: boolean;
  stream?: boolean;
  extra_headers?: Record<string, string>;
}

export interface FeishuConfig {
  app_id?: string;
  app_secret?: string;
  domain?: string;
  max_rows_per_sheet?: number;
  max_records_per_table?: number;
}

export interface OvConfig {
  server: {
    host?: string;
    port: number;
    auth_mode?: string | null;
    root_api_key?: string | null;
    account?: string;
    default_user?: string;
    cors_origins?: string[];
    observability?: {
      metrics?: { enabled?: boolean };
    };
  };
  storage: {
    workspace: string;
    vectordb: { name?: string; backend: string };
    agfs: { backend: string };
  };
  embedding: {
    max_concurrent?: number;
    max_retries?: number;
    dense?: DenseEmbeddingConfig;
    sparse?: SparseEmbeddingConfig;
    hybrid?: HybridEmbeddingConfig;
    circuit_breaker?: CircuitBreakerConfig;
  };
  vlm?: VlmConfig;
  encryption?: {
    enabled?: boolean;
  };
  log?: {
    level?: string;
  };
  feishu?: FeishuConfig;
  bot?: {
    gateway?: {
      port?: number;
    };
  };
}

export interface PythonEnvState {
  installed: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  pythonVersion: string | null;
  upgradable: boolean;
  hasLocalEmbed: boolean;
}

export interface PythonTaskProgress {
  step: string;
  message: string;
  done: boolean;
  log_line: string;
}
