import type { OvConfig } from './types';

export type FieldType = 'string' | 'number' | 'boolean' | 'select' | 'password';
export type TabId = 'basic' | 'ai' | 'storage' | 'advanced' | 'feishu';

const isWindows = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform);
const DEFAULT_DATA_DIR = isWindows ? '%USERPROFILE%\\OpenViking\\data' : '~/.openviking/data';

export interface ConfigField {
  path: string;
  label: string;
  description: string;
  type: FieldType;
  tab: TabId;
  group?: string;
  defaultValue: unknown;
  options?: { label: string; value: string }[];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

const FIELDS: ConfigField[] = [
  // ===== Basic Tab =====
  {
    path: 'server.host',
    label: 'basic.server_host',
    description: 'basic.server_host_desc',
    type: 'string',
    tab: 'basic',
    defaultValue: '127.0.0.1',
    placeholder: '127.0.0.1',
  },
  {
    path: 'server.port',
    label: 'basic.server_port',
    description: 'basic.server_port_desc',
    type: 'number',
    tab: 'basic',
    defaultValue: 1933,
    min: 1,
    max: 65535,
  },
  {
    path: 'bot.gateway.port',
    label: 'basic.bot_gateway_port',
    description: 'basic.bot_gateway_port_desc',
    type: 'number',
    tab: 'basic',
    defaultValue: 18790,
    min: 1,
    max: 65535,
  },
  {
    path: 'server.root_api_key',
    label: 'basic.root_api_key',
    description: 'basic.root_api_key_desc',
    type: 'password',
    tab: 'basic',
    defaultValue: null,
  },
  {
    path: 'storage.workspace',
    label: 'basic.storage_path',
    description: 'basic.storage_path_desc',
    type: 'string',
    tab: 'basic',
    defaultValue: DEFAULT_DATA_DIR,
    placeholder: DEFAULT_DATA_DIR,
  },
  {
    path: 'log.level',
    label: 'basic.log_level',
    description: 'basic.log_level_desc',
    type: 'select',
    tab: 'basic',
    defaultValue: 'INFO',
    options: [
      { label: 'DEBUG', value: 'DEBUG' },
      { label: 'INFO', value: 'INFO' },
      { label: 'WARNING', value: 'WARNING' },
      { label: 'ERROR', value: 'ERROR' },
    ],
  },
  // ===== AI Tab - Dense Embedding =====
  {
    path: 'embedding.dense.provider',
    label: 'ai.provider',
    description: 'ai.dense_provider_desc',
    type: 'select',
    tab: 'ai',
    group: 'dense',
    defaultValue: 'local',
    options: [
      { label: 'ai.provider_options_local', value: 'local' },
      { label: 'volcengine', value: 'volcengine' },
      { label: 'openai', value: 'openai' },
      { label: 'jina', value: 'jina' },
      { label: 'gemini', value: 'gemini' },
      { label: 'dashscope', value: 'dashscope' },
      { label: 'vikingdb', value: 'vikingdb' },
    ],
  },
  {
    path: 'embedding.dense.api_base',
    label: 'ai.api_base',
    description: 'ai.dense_api_base_desc',
    type: 'string',
    tab: 'ai',
    group: 'dense',
    defaultValue: '',
    placeholder: 'https://ark.cn-beijing.volces.com/api/v3',
  },
  {
    path: 'embedding.dense.api_key',
    label: 'ai.api_key',
    description: 'ai.dense_api_key_desc',
    type: 'password',
    tab: 'ai',
    group: 'dense',
    defaultValue: '',
  },
  {
    path: 'embedding.dense.model',
    label: 'ai.model',
    description: 'ai.dense_model_desc',
    type: 'string',
    tab: 'ai',
    group: 'dense',
    defaultValue: '',
    placeholder: 'doubao-embedding-vision-251215',
  },
  {
    path: 'embedding.dense.dimension',
    label: 'ai.dimension',
    description: 'ai.dense_dimension_desc',
    type: 'number',
    tab: 'ai',
    group: 'dense',
    defaultValue: 1024,
    min: 1,
    max: 8192,
  },
  {
    path: 'embedding.dense.input',
    label: 'ai.input_type',
    description: 'ai.dense_input_desc',
    type: 'select',
    tab: 'ai',
    group: 'dense',
    defaultValue: '',
    options: [
      { label: 'ai.auto', value: '' },
      { label: 'text', value: 'text' },
      { label: 'multimodal', value: 'multimodal' },
    ],
  },
  {
    path: 'embedding.dense.batch_size',
    label: 'ai.dense_batch_size',
    description: 'ai.dense_batch_size_desc',
    type: 'number',
    tab: 'ai',
    group: 'dense',
    defaultValue: 32,
    min: 1,
    max: 512,
  },
  {
    path: 'embedding.dense.model_path',
    label: 'ai.model_path',
    description: 'ai.model_path_desc',
    type: 'string',
    tab: 'ai',
    group: 'dense',
    defaultValue: '',
    placeholder: '/path/to/model.gguf',
  },

  // ===== AI Tab - Embedding Settings =====
  {
    path: 'embedding.max_concurrent',
    label: 'ai.embedding_max_concurrent',
    description: 'ai.embedding_max_concurrent_desc',
    type: 'number',
    tab: 'ai',
    group: 'embedding_settings',
    defaultValue: 10,
    min: 1,
    max: 100,
  },
  {
    path: 'embedding.max_retries',
    label: 'ai.embedding_max_retries',
    description: 'ai.embedding_max_retries_desc',
    type: 'number',
    tab: 'ai',
    group: 'embedding_settings',
    defaultValue: 3,
    min: 0,
    max: 10,
  },

  // ===== AI Tab - Circuit Breaker =====
  {
    path: 'embedding.circuit_breaker.failure_threshold',
    label: 'ai.cb_failure_threshold',
    description: 'ai.cb_failure_threshold_desc',
    type: 'number',
    tab: 'ai',
    group: 'circuit_breaker',
    defaultValue: 5,
    min: 1,
    max: 100,
  },
  {
    path: 'embedding.circuit_breaker.reset_timeout',
    label: 'ai.cb_reset_timeout',
    description: 'ai.cb_reset_timeout_desc',
    type: 'number',
    tab: 'ai',
    group: 'circuit_breaker',
    defaultValue: 60,
    min: 1,
    max: 3600,
  },
  {
    path: 'embedding.circuit_breaker.max_reset_timeout',
    label: 'ai.cb_max_reset_timeout',
    description: 'ai.cb_max_reset_timeout_desc',
    type: 'number',
    tab: 'ai',
    group: 'circuit_breaker',
    defaultValue: 600,
    min: 1,
    max: 86400,
  },

  // ===== AI Tab - VLM =====
  {
    path: 'vlm.provider',
    label: 'ai.provider',
    description: 'ai.vlm_provider_desc',
    type: 'string',
    tab: 'ai',
    group: 'vlm',
    defaultValue: '',
    placeholder: 'volcengine / openai / openai-codex / kimi / glm',
  },
  {
    path: 'vlm.api_base',
    label: 'ai.api_base',
    description: 'ai.vlm_api_base_desc',
    type: 'string',
    tab: 'ai',
    group: 'vlm',
    defaultValue: '',
    placeholder: 'https://ark.cn-beijing.volces.com/api/v3',
  },
  {
    path: 'vlm.api_key',
    label: 'ai.api_key',
    description: 'ai.vlm_api_key_desc',
    type: 'password',
    tab: 'ai',
    group: 'vlm',
    defaultValue: '',
  },
  {
    path: 'vlm.model',
    label: 'ai.model',
    description: 'ai.vlm_model_desc',
    type: 'string',
    tab: 'ai',
    group: 'vlm',
    defaultValue: '',
    placeholder: 'doubao-seed-2-0-pro-260215',
  },
  {
    path: 'vlm.max_retries',
    label: 'ai.max_retries',
    description: 'ai.vlm_max_retries_desc',
    type: 'number',
    tab: 'ai',
    group: 'vlm',
    defaultValue: 3,
    min: 0,
    max: 10,
  },
  {
    path: 'vlm.max_concurrent',
    label: 'ai.vlm_max_concurrent',
    description: 'ai.vlm_max_concurrent_desc',
    type: 'number',
    tab: 'ai',
    group: 'vlm',
    defaultValue: 100,
    min: 1,
    max: 1000,
  },
  {
    path: 'vlm.timeout',
    label: 'ai.vlm_timeout',
    description: 'ai.vlm_timeout_desc',
    type: 'number',
    tab: 'ai',
    group: 'vlm',
    defaultValue: 60.0,
    min: 1,
    max: 600,
    step: 1,
  },
  {
    path: 'vlm.thinking',
    label: 'ai.thinking',
    description: 'ai.vlm_thinking_desc',
    type: 'boolean',
    tab: 'ai',
    group: 'vlm',
    defaultValue: false,
  },
  {
    path: 'vlm.stream',
    label: 'ai.vlm_stream',
    description: 'ai.vlm_stream_desc',
    type: 'boolean',
    tab: 'ai',
    group: 'vlm',
    defaultValue: false,
  },

  // ===== Storage Tab =====
  {
    path: 'storage.vectordb.name',
    label: 'storage.vector_db_name',
    description: 'storage.vector_db_name_desc',
    type: 'string',
    tab: 'storage',
    defaultValue: 'context',
    placeholder: 'context',
  },
  {
    path: 'storage.vectordb.backend',
    label: 'storage.vector_db_backend',
    description: 'storage.vector_db_backend_desc',
    type: 'select',
    tab: 'storage',
    defaultValue: 'local',
    options: [
      { label: 'local', value: 'local' },
      { label: 'chroma', value: 'chroma' },
      { label: 'milvus', value: 'milvus' },
    ],
  },
  {
    path: 'storage.agfs.backend',
    label: 'storage.agfs_backend',
    description: 'storage.agfs_backend_desc',
    type: 'select',
    tab: 'storage',
    defaultValue: 'local',
    options: [
      { label: 'local', value: 'local' },
      { label: 's3', value: 's3' },
    ],
  },
  {
    path: 'encryption.enabled',
    label: 'storage.encryption',
    description: 'storage.encryption_desc',
    type: 'boolean',
    tab: 'storage',
    defaultValue: false,
  },

  // ===== Advanced Tab =====
  {
    path: 'server.cors_origins',
    label: 'advanced.cors_origins',
    description: 'advanced.cors_origins_desc',
    type: 'string',
    tab: 'advanced',
    defaultValue: '*',
    placeholder: '*',
  },
  {
    path: 'server.observability.metrics.enabled',
    label: 'advanced.observability',
    description: 'advanced.observability_desc',
    type: 'boolean',
    tab: 'advanced',
    defaultValue: false,
  },

  // ===== Feishu Tab =====
  {
    path: 'feishu.app_id',
    label: 'feishu.app_id',
    description: 'feishu.app_id_desc',
    type: 'string',
    tab: 'feishu',
    defaultValue: '',
    placeholder: 'cli_xxxxxxxxxxxxx',
  },
  {
    path: 'feishu.app_secret',
    label: 'feishu.app_secret',
    description: 'feishu.app_secret_desc',
    type: 'password',
    tab: 'feishu',
    defaultValue: '',
  },
  {
    path: 'feishu.domain',
    label: 'feishu.domain',
    description: 'feishu.domain_desc',
    type: 'string',
    tab: 'feishu',
    defaultValue: 'https://open.feishu.cn',
    placeholder: 'https://open.feishu.cn',
  },
  {
    path: 'feishu.max_rows_per_sheet',
    label: 'feishu.max_rows_per_sheet',
    description: 'feishu.max_rows_per_sheet_desc',
    type: 'number',
    tab: 'feishu',
    defaultValue: 1000,
    min: 1,
    max: 100000,
  },
  {
    path: 'feishu.max_records_per_table',
    label: 'feishu.max_records_per_table',
    description: 'feishu.max_records_per_table_desc',
    type: 'number',
    tab: 'feishu',
    defaultValue: 1000,
    min: 1,
    max: 100000,
  },
];

export function getFieldsByTab(tab: TabId): ConfigField[] {
  return FIELDS.filter((f) => f.tab === tab);
}

export function getGroups(tab: TabId): string[] {
  const groups = FIELDS.filter((f) => f.tab === tab && f.group)
    .map((f) => f.group as string);
  return [...new Set(groups)];
}

export function getFieldsByGroup(tab: TabId, group?: string): ConfigField[] {
  return FIELDS.filter((f) => f.tab === tab && f.group === group);
}

export function getFieldByPath(path: string): ConfigField | undefined {
  return FIELDS.find((f) => f.path === path);
}

const defaultConfigObj = {
  server: { host: '127.0.0.1', port: 1933 },
  storage: {
    workspace: DEFAULT_DATA_DIR,
    vectordb: { name: 'context', backend: 'local' },
    agfs: { backend: 'local' },
  },
  embedding: {
    max_concurrent: 10,
    max_retries: 3,
    dense: { dimension: 1024, batch_size: 32 },
    circuit_breaker: { failure_threshold: 5, reset_timeout: 60, max_reset_timeout: 600 },
  },
  vlm: { max_retries: 3, max_concurrent: 100, timeout: 60.0, thinking: false, stream: false },
  encryption: { enabled: false },
  log: { level: 'INFO' },
  bot: { gateway: { port: 18790 } },
  feishu: {
    domain: 'https://open.feishu.cn',
    max_rows_per_sheet: 1000,
    max_records_per_table: 1000,
  },
};

export const DEFAULT_CONFIG = defaultConfigObj as OvConfig;

export function getDefaultConfigJson(): string {
  return JSON.stringify(defaultConfigObj, null, 2);
}

export default FIELDS;
