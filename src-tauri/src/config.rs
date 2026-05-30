use serde::Serialize;

#[derive(Serialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Serialize)]
pub struct VectordbConfig {
    pub name: String,
    pub backend: String,
}

#[derive(Serialize)]
pub struct AgfsConfig {
    pub backend: String,
}

#[derive(Serialize)]
pub struct StorageConfig {
    pub workspace: String,
    pub vectordb: VectordbConfig,
    pub agfs: AgfsConfig,
}

#[derive(Serialize)]
pub struct DenseEmbeddingConfig {
    pub dimension: u32,
    pub batch_size: u32,
}

#[derive(Serialize)]
pub struct CircuitBreakerConfig {
    pub failure_threshold: u32,
    pub reset_timeout: u32,
    pub max_reset_timeout: u32,
}

#[derive(Serialize)]
pub struct EmbeddingConfig {
    pub max_concurrent: u32,
    pub max_retries: u32,
    pub dense: DenseEmbeddingConfig,
    pub circuit_breaker: CircuitBreakerConfig,
}

#[derive(Serialize)]
pub struct VlmConfig {
    pub max_retries: u32,
    pub max_concurrent: u32,
    pub timeout: f64,
    pub thinking: bool,
    pub stream: bool,
}

#[derive(Serialize)]
pub struct RetrievalConfig {
    pub top_k: u32,
    pub threshold: f64,
}

#[derive(Serialize)]
pub struct EncryptionConfig {
    pub enabled: bool,
}

#[derive(Serialize)]
pub struct LogConfig {
    pub level: String,
}

#[derive(Serialize)]
pub struct FeishuConfig {
    pub domain: String,
    pub max_rows_per_sheet: u32,
    pub max_records_per_table: u32,
}

#[derive(Serialize)]
pub struct OvConfig {
    pub server: ServerConfig,
    pub storage: StorageConfig,
    pub embedding: EmbeddingConfig,
    pub vlm: VlmConfig,
    pub retrieval: RetrievalConfig,
    pub encryption: EncryptionConfig,
    pub log: LogConfig,
    pub feishu: FeishuConfig,
}

impl OvConfig {
    pub fn default() -> Self {
        OvConfig {
            server: ServerConfig {
                host: "127.0.0.1".to_string(),
                port: 1933,
            },
            storage: StorageConfig {
                workspace: "~/.openviking/data".to_string(),
                vectordb: VectordbConfig {
                    name: "context".to_string(),
                    backend: "local".to_string(),
                },
                agfs: AgfsConfig {
                    backend: "local".to_string(),
                },
            },
            embedding: EmbeddingConfig {
                max_concurrent: 10,
                max_retries: 3,
                dense: DenseEmbeddingConfig {
                    dimension: 1024,
                    batch_size: 32,
                },
                circuit_breaker: CircuitBreakerConfig {
                    failure_threshold: 5,
                    reset_timeout: 60,
                    max_reset_timeout: 600,
                },
            },
            vlm: VlmConfig {
                max_retries: 3,
                max_concurrent: 100,
                timeout: 60.0,
                thinking: false,
                stream: false,
            },
            retrieval: RetrievalConfig {
                top_k: 10,
                threshold: 0.5,
            },
            encryption: EncryptionConfig {
                enabled: false,
            },
            log: LogConfig {
                level: "INFO".to_string(),
            },
            feishu: FeishuConfig {
                domain: "https://open.feishu.cn".to_string(),
                max_rows_per_sheet: 1000,
                max_records_per_table: 1000,
            },
        }
    }

    pub fn to_json_pretty(&self) -> String {
        serde_json::to_string_pretty(self).unwrap()
    }
}
