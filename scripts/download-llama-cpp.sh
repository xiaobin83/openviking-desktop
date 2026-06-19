#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESOURCES_DIR="$SCRIPT_DIR/../src-tauri/Resources/wheels"

LLAMA_VERSION="${LLAMA_VERSION:-0.3.30}"

# Platform → Python tag for wheel filename
# v0.3.20+ uses py3-none (universal), older versions use cp312-cp312
declare -A PLATFORM_PY_TAG=(
  ["x86_64-pc-windows-msvc"]="py3-none-win_amd64"
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
  for p in "${!PLATFORM_PY_TAG[@]}"; do
    echo "  $p"
  done
  echo ""
  echo "用法: $0 --platform <target-triple>"
  echo ""
  echo "说明: 下载 llama-cpp-python 预编译 wheel，避免在 Windows 上从源码编译。"
  echo "      macOS/Linux 平台 PyPI 已有预编译 wheel，无需额外下载。"
  exit 1
fi

PY_TAG="${PLATFORM_PY_TAG[$PLATFORM]:-}"
if [[ -z "$PY_TAG" ]]; then
  echo "提示: 平台 '$PLATFORM' 的 PyPI 已有预编译 wheel，无需额外下载。"
  exit 0
fi

WHL_NAME="llama_cpp_python-${LLAMA_VERSION}-${PY_TAG}.whl"
TARGET_DIR="$RESOURCES_DIR"
mkdir -p "$TARGET_DIR"

echo "目标 wheel: $WHL_NAME"
echo "输出目录: $TARGET_DIR"

# 方法 1: 从 PyPI 直接下载
PYPI_URL="https://files.pythonhosted.org/packages"

# 先通过 PyPI JSON API 获取 wheel 的完整 URL
echo "查询 PyPI 获取 wheel URL..."
JSON_URL="https://pypi.org/pypi/llama-cpp-python/${LLAMA_VERSION}/json"
WHEEL_URL=$(curl -fsSL "$JSON_URL" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data.get('urls', []):
    if item.get('filename', '').endswith('${PY_TAG}.whl'):
        print(item['url'])
        break
" 2>/dev/null || true)

if [[ -n "$WHEEL_URL" ]]; then
  echo "从 PyPI 下载 $WHL_NAME ..."
  curl -fsSL "$WHEEL_URL" -o "$TARGET_DIR/$WHL_NAME"
  echo "完成: $TARGET_DIR/$WHL_NAME"
  exit 0
fi

# 方法 2: 从 GitHub Releases 下载
GH_RELEASES_URL="https://github.com/abetlen/llama-cpp-python/releases/download/v${LLAMA_VERSION}/${WHL_NAME}"
echo "尝试从 GitHub Releases 下载..."
if curl -fsSL -o /dev/null -w "%{http_code}" "$GH_RELEASES_URL" | grep -q "200"; then
  curl -fsSL "$GH_RELEASES_URL" -o "$TARGET_DIR/$WHL_NAME"
  echo "完成: $TARGET_DIR/$WHL_NAME"
  exit 0
fi

# 方法 3: 尝试用 pip download 获取（需要 CMake + C++ 编译器）
echo ""
echo "=============================================="
echo " 未找到预编译 wheel。尝试本地编译..."
echo " 需要: CMake + C++ 编译器 (MSVC 或 MinGW)"
echo "=============================================="
echo ""

TEMP_DIR="$(mktemp -d)"
if command -v pip3 &>/dev/null; then
  PIP="pip3"
elif command -v pip &>/dev/null; then
  PIP="pip"
else
  echo "错误: 未找到 pip，无法编译 wheel"
  rm -rf "$TEMP_DIR"
  exit 1
fi

echo "编译 llama-cpp-python==${LLAMA_VERSION}..."
cd "$TEMP_DIR"
$PIP download --no-binary :all: --no-deps "llama-cpp-python==${LLAMA_VERSION}" -d . 2>&1 || {
  echo "错误: 编译失败。请确保已安装:"
  echo "  - CMake (https://cmake.org/download/)"
  echo "  - Visual Studio Build Tools 或 MinGW-w64"
  rm -rf "$TEMP_DIR"
  exit 1
}

# 找到编译好的 wheel
COMPILED_WHL=$(ls llama_cpp_python-*.whl 2>/dev/null | head -1)
if [[ -z "$COMPILED_WHL" ]]; then
  echo "错误: 未找到编译产物"
  rm -rf "$TEMP_DIR"
  exit 1
fi

cp "$COMPILED_WHL" "$TARGET_DIR/$WHL_NAME"
rm -rf "$TEMP_DIR"
echo "编译完成: $TARGET_DIR/$WHL_NAME"
