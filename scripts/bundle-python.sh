#!/usr/bin/env bash
set -euo pipefail

# bundle-python.sh — 创建全新 Python venv 并安装 openviking，打包到 resources 目录
#
# 用法：
#   bash scripts/bundle-python.sh
#   bash scripts/bundle-python.sh --with-bot

WITH_BOT=false

for arg in "$@"; do
  case "$arg" in
    --with-bot)
      WITH_BOT=true
      shift
      ;;
    *)
      echo "未知参数: $arg"
      echo "用法: bash scripts/bundle-python.sh [--with-bot]"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_RESOURCES="$SCRIPT_DIR/../resources/python"

PKG_NAME="openviking"
if [ "$WITH_BOT" = true ]; then
  PKG_NAME="openviking[bot]"
fi

echo "=== 打包 Python venv 到 resources ==="
echo "项目根目录:   $PROJECT_ROOT"
echo "目标目录:     $TAURI_RESOURCES"
echo "安装包:       $PKG_NAME"

# 1. 创建目标目录（全新 venv）
rm -rf "$TAURI_RESOURCES"

# 2. 用 uv 创建虚拟环境
echo "正在创建虚拟环境..."
uv venv --python 3.12 "$TAURI_RESOURCES"

# 3. 安装 openviking 及其依赖
echo "正在安装 $PKG_NAME 及其依赖（此操作可能需要几分钟）..."
uv pip install --python "$TAURI_RESOURCES" --quiet "$PKG_NAME"

# 4. 清理：删除 __pycache__、.pyc、.pyo 文件以减小体积
echo "正在清理缓存文件..."
find "$TAURI_RESOURCES" -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
find "$TAURI_RESOURCES" -type f -name '*.pyc' -delete
find "$TAURI_RESOURCES" -type f -name '*.pyo' -delete

echo "=== 打包完成 ==="
echo "Python venv 已创建并安装 $PKG_NAME 到: $TAURI_RESOURCES"
