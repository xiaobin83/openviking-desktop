#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESOURCES_DIR="$SCRIPT_DIR/../src-tauri/Resources/uv"

UV_VERSION="${UV_VERSION:-0.11.17}"
GH_REPO="astral-sh/uv"

PLATFORMS=(
  "aarch64-apple-darwin"
  "x86_64-apple-darwin"
  "x86_64-pc-windows-msvc"
  "x86_64-unknown-linux-gnu"
)

PLATFORM=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="$2"; shift 2 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

if [[ -z "$PLATFORM" ]]; then
  echo "支持的 platform 列表:"
  for p in "${PLATFORMS[@]}"; do
    echo "  $p -> $RESOURCES_DIR/$p/uv"
  done
  echo ""
  echo "用法: $0 --platform <target-triple>"
  exit 1
fi

VALID=false
for p in "${PLATFORMS[@]}"; do
  if [[ "$p" == "$PLATFORM" ]]; then
    VALID=true
    break
  fi
done

if [[ "$VALID" != "true" ]]; then
  echo "错误: 不支持的 platform '$PLATFORM'"
  echo "支持的 platform: ${PLATFORMS[*]}"
  exit 1
fi

TARGET_DIR="$RESOURCES_DIR/$PLATFORM"
mkdir -p "$TARGET_DIR"

ARCHIVE_EXT="tar.gz"
BINARY_NAME="uv"
if [[ "$PLATFORM" == *"windows"* ]]; then
  ARCHIVE_EXT="zip"
  BINARY_NAME="uv.exe"
fi

ARCHIVE="uv-${PLATFORM}.${ARCHIVE_EXT}"
URL="https://github.com/${GH_REPO}/releases/download/${UV_VERSION}/${ARCHIVE}"

echo "下载 $ARCHIVE ..."
TEMP_DIR="$(mktemp -d)"
curl -fsSL "$URL" -o "$TEMP_DIR/$ARCHIVE"

echo "解压到 $TARGET_DIR ..."
if [[ "$ARCHIVE_EXT" == "zip" ]]; then
  unzip -q -o "$TEMP_DIR/$ARCHIVE" -d "$TEMP_DIR/extract"
  mv "$TEMP_DIR/extract"/*/"${BINARY_NAME}" "$TARGET_DIR/${BINARY_NAME}" 2>/dev/null || mv "$TEMP_DIR/extract/${BINARY_NAME}" "$TARGET_DIR/${BINARY_NAME}" 2>/dev/null
else
  tar xzf "$TEMP_DIR/$ARCHIVE" --strip-components=1 -C "$TEMP_DIR"
  mv "$TEMP_DIR/${BINARY_NAME}" "$TARGET_DIR/${BINARY_NAME}" 2>/dev/null
fi

chmod +x "$TARGET_DIR/${BINARY_NAME}"

rm -rf "$TEMP_DIR"

echo "完成: $TARGET_DIR/${BINARY_NAME}"
"$TARGET_DIR/${BINARY_NAME}" --version
