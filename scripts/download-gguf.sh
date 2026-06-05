#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/../src-tauri/Resources/models"

GGUF_MODEL="${GGUF_MODEL:-bge-small-zh-v1.5-f16}"
HF_MIRROR="${HF_MIRROR:-huggingface.co}"
GGUF_URL="https://${HF_MIRROR}/CompendiumLabs/bge-small-zh-v1.5-gguf/resolve/main/${GGUF_MODEL}.gguf?download=true"

mkdir -p "$MODELS_DIR"

echo "下载 ${GGUF_MODEL}.gguf (${HF_MIRROR}) ..."
curl -fsSL "$GGUF_URL" -o "$MODELS_DIR/${GGUF_MODEL}.gguf"

echo "完成: $MODELS_DIR/${GGUF_MODEL}.gguf"
