#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/../src-tauri/resources/models"

GGUF_MODEL="${GGUF_MODEL:-bge-small-zh-v1.5-f16}"
GGUF_URL="https://huggingface.co/CompendiumLabs/bge-small-zh-v1.5-gguf/resolve/main/${GGUF_MODEL}.gguf?download=true"

mkdir -p "$MODELS_DIR"

echo "下载 ${GGUF_MODEL}.gguf ..."
curl -fsSL "$GGUF_URL" -o "$MODELS_DIR/${GGUF_MODEL}.gguf"

echo "完成: $MODELS_DIR/${GGUF_MODEL}.gguf"
