# 本地 Embedding 默认配置设计文档

Date: 2026-06-05
Status: 已批准进入实现

## 目标

将 openviking-desktop 的默认 embedding 配置从远程 provider（volcengine）改为本地 embedding（基于 llama-cpp-python 的 GGUF 模型），同时保留切换到远程 provider 的能力。

## 背景

- openviking Python 包已通过 `openviking[bot,local-embed]` extra 支持本地 embedding，使用 `llama-cpp-python` 加载 GGUF 模型
- 上游 openviking 设计：当配置中无 `embedding` 时，隐式选择 local backend；默认模型为 `bge-small-zh-v1.5-f16`
- 桌面端现有配置 UI 仅在 Dense Embedding 组提供远程 API 字段（provider/api_key/api_base/model），无 `backend` 选择，也无本地模型配置字段
- 桌面端已通过 `uv pip install openviking[bot,local-embed]` 安装了 local-embed extra，但配置侧未暴露

## 设计

### 配置字段变更

#### `embedding.dense.provider` — 从 string 改为 select

原为自由输入字符串（placeholder: `volcengine / openai / jina / ...`），改为 select 下拉：

| 值 | 含义 |
|----|------|
| `local` | 本地 embedding（默认） |
| `volcengine` | 火山引擎 |
| `openai` | OpenAI |
| `jina` | Jina AI |
| `gemini` | Google Gemini |
| `dashscope` | 阿里灵积 |
| `vikingdb` | VikingDB |

#### 新增 `embedding.dense.model_path`

- 类型：string
- 意义：显式指定 GGUF 模型文件路径
- 默认值：打包在 app 资源中的 `bge-small-zh-v1.5-f16.gguf` 的绝对路径
- 始终在配置中保留（无论 provider 值）

#### 字段可见性规则

| 字段 | provider=local | provider=远程 |
|------|---------------|--------------|
| `provider` | ✅ select | ✅ select |
| `model` | ✅ 显示 | ✅ 显示 |
| `model_path` | ✅ 显示 | ✅ 显示（保留） |
| `api_key` | ❌ 隐藏 | ✅ 显示 |
| `api_base` | ❌ 隐藏 | ✅ 显示 |
| `input` | ❌ 隐藏 | ✅ 显示 |
| `ak` / `sk` / `region` 等 | ❌ 隐藏 | ✅ 显示 |
| `dimension` | ❌ 从配置中移除 | ✅ 写回 1024 |
| `batch_size` | ❌ 从配置中移除 | ✅ 写回 32 |

#### Provider 切换逻辑

当用户在 UI 中切换 provider 时：

- **local → 远程**：onChange 时自动注入 `dimension: 1024`、`batch_size: 32`
- **远程 → local**：onChange 时自动删除 `dimension`、`batch_size`
- `model_path` 始终保留，不做增减

### 默认配置

首次启动生成 `ov.conf` 时，Rust 端写入：

```json
{
  "embedding": {
    "dense": {
      "provider": "local",
      "model": "bge-small-zh-v1.5-f16",
      "model_path": "<bundled gguf 绝对路径>"
    },
    "max_concurrent": 10,
    "max_retries": 3,
    "circuit_breaker": {
      "failure_threshold": 5,
      "reset_timeout": 60,
      "max_reset_timeout": 600
    }
  }
}
```

不包含 `dimension` 和 `batch_size` — Python backend 从模型注册表自动推导。

### GGUF 模型资源打包

#### 文件位置

```
src-tauri/resources/models/bge-small-zh-v1.5-f16.gguf
```

#### Tauri bundle 配置

在 `tauri.conf.json` 的 `bundle.resources` 中添加：

```json
"resources": [
  "Resources/uv/**/*",
  "Resources/models/**/*"
]
```

#### 模型下载脚本

`scripts/download-gguf.sh` — 从 HuggingFace 下载 GGUF 模型到 `src-tauri/resources/models/`：

- 下载源：`https://huggingface.co/CompendiumLabs/bge-small-zh-v1.5-gguf/resolve/main/bge-small-zh-v1.5-f16.gguf`
- 支持 `GGUF_MODEL` 环境变量指定其他模型
- 输出到 `src-tauri/resources/models/` 目录

#### Rust 资源解析

参照现有 uv 路径解析模式，新增 `resolve_bundled_model_path` Tauri command：

1. 开发模式：`<project>/src-tauri/resources/models/bge-small-zh-v1.5-f16.gguf`
2. 生产模式：`<resource_dir>/models/bge-small-zh-v1.5-f16.gguf`

返回绝对路径字符串。

### 前端变更

#### 变更文件

| 文件 | 变更 |
|------|------|
| `src/lib/types.ts` | `DenseEmbeddingConfig` 新增 `model_path?: string` |
| `src/lib/config-fields.ts` | `provider` 改为 select 类型，新增 `model_path` 字段定义，更新默认值 |
| `src/components/config/AITab.tsx` | 条件渲染：根据 `provider` 值动态显示/隐藏字段组 |
| `src/locales/zh.json` | 新增 i18n key |
| `src/locales/en.json` | 新增 i18n key |

#### i18n 新增 key

| Key | 中文 | English |
|-----|------|---------|
| `ai.provider_options_local` | 本地 (Local) | Local |
| `ai.model_path` | 模型路径 (model_path) | Model Path |
| `ai.model_path_desc` | 自定义 GGUF 模型文件路径，默认使用预打包模型。 | Custom GGUF model file path. Uses the bundled model by default. |

#### i18n 修改 key

| Key | 中文 | English |
|-----|------|---------|
| `ai.dense_provider_desc` | embedding provider：local（默认） / volcengine / openai / jina / gemini / dashscope / vikingdb。选择 local 时无需 API 密钥。 | embedding provider: local (default) / volcengine / openai / jina / gemini / dashscope / vikingdb. No API key needed for local. |

注：`model` 字段的 label/description 复用已有 `ai.model` / `ai.dense_model_desc`，不做修改。

### 脚本变更

| 文件 | 变更 |
|------|------|
| `scripts/download-gguf.sh` | 新增：从 HuggingFace 下载 GGUF 模型到 `src-tauri/resources/models/` |

### Rust 后端变更

| 文件 | 变更 |
|------|------|
| `src-tauri/src/lib.rs` | 默认配置生成从静态 `&str` 改为运行时构建 JSON（`serde_json::json!`），将 `model_path` 写入解析后的资源路径；新增 `resolve_bundled_model_path` command；新增 `resolve_default_model_path(app)` 辅助函数 |
| `src-tauri/Cargo.toml` | 无需变更（`tauri` path、`serde_json` 均已依赖） |

#### 默认配置生成方式变化

**原来**（静态字符串）：
```rust
let default_config = r#"{"embedding": {"dense": {...}}}"#;
```

**改为**（运行时构建）：
```rust
let model_path = resolve_default_model_path(app);
let default_config = serde_json::json!({
    "server": { "host": "127.0.0.1", "port": 1933, "cors_origins": ["*"] },
    "storage": { "workspace": "~/.openviking/data", "vectordb": { "backend": "local" }, "agfs": { "backend": "local" } },
    "embedding": {
        "dense": { "provider": "local", "model": "bge-small-zh-v1.5-f16", "model_path": model_path },
        "max_concurrent": 10, "max_retries": 3,
        "circuit_breaker": { "failure_threshold": 5, "reset_timeout": 60, "max_reset_timeout": 600 }
    },
    "vlm": { "max_retries": 3, "max_concurrent": 100, "timeout": 60.0, "thinking": false, "stream": false },
    "encryption": { "enabled": false },
    "log": { "level": "INFO" },
    "feishu": { "domain": "https://open.feishu.cn", "max_rows_per_sheet": 1000, "max_records_per_table": 1000 }
}).to_string();
```

### 不受影响的部分

- Python server 端无需修改 — `openviking[local-embed]` 已支持 `backend=local` 及 `model_path` 字段
- Config 的读写方式不变：仍是 opaque JSON 字符串读写
- Server 进程启动参数不变：仍通过 `--config` 传递 `ov.conf` 路径
- 其他 tab 的配置字段（storage / vlm / feishu 等）不变
