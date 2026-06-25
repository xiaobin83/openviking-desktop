#!/bin/bash
# 放行 OpenViking.app 通过 Gatekeeper，使其无需手动右键打开即可运行。
#
# Usage:
#   bash scripts/allow-gatekeeper.sh                          Auto-detect app path
#   bash scripts/allow-gatekeeper.sh /path/to/OpenViking.app  指定 app 路径
#   bash scripts/allow-gatekeeper.sh --help                   显示帮助

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

show_help() {
    cat <<EOF
放行 OpenViking.app 通过 Gatekeeper，移除检疫标记以便正常运行。

Usage: $(basename "$0") [APP_PATH | --help]

Options:
  --help    Show this help and exit

Without APP_PATH, the script searches the following locations:
  1. /Applications/OpenViking.app
  2. src-tauri/target/release/bundle/macos/OpenViking.app
EOF
    exit 0
}

# --- 平台检查 ---
if [ "$(uname -s)" != "Darwin" ]; then
    echo -e "${RED}此脚本仅适用于 macOS。${NC}"
    exit 1
fi

# --- 参数处理 ---
case "${1:-}" in
    --help|-h) show_help ;;
esac

if [ -n "${1:-}" ]; then
    APP_PATH="$1"
else
    # 自动检测
    CANDIDATES=(
        "/Applications/OpenViking.app"
        "src-tauri/target/release/bundle/macos/OpenViking.app"
    )
    APP_PATH=""
    for candidate in "${CANDIDATES[@]}"; do
        if [ -d "$candidate" ]; then
            APP_PATH="$candidate"
            break
        fi
    done
    if [ -z "$APP_PATH" ]; then
        echo -e "${RED}未找到 OpenViking.app。请指定路径：$(basename "$0") /path/to/OpenViking.app${NC}"
        exit 1
    fi
fi

if [ ! -d "$APP_PATH" ]; then
    echo -e "${RED}路径不存在: $APP_PATH${NC}"
    exit 1
fi

echo -e "${GREEN}=== 放行 Gatekeeper: $APP_PATH ===${NC}"
echo ""

# 1. 从系统放行数据库移除（如果之前手动放行过）
spctl --remove "$APP_PATH" 2>/dev/null && \
    echo -e "${YELLOW}  ✓ 已从 spctl 放行数据库移除${NC}" || \
    echo "  - spctl 放行数据库（无需清除或此版本不支持）"

# 2. 清除整个 app bundle 及其内部所有文件的检疫标记
QUARANTINED=$(xattr "$APP_PATH" 2>/dev/null | grep com.apple.quarantine || true)
if [ -n "$QUARANTINED" ]; then
    xattr -dr com.apple.quarantine "$APP_PATH"
    echo -e "${GREEN}  ✓ 已清除 app bundle 检疫标记${NC}"
else
    echo "  - app bundle 无检疫标记"
fi

# 3. 统计并清除 UV 等内部可执行文件的检疫标记
echo ""
echo "正在扫描内部可执行文件..."
COUNT=0
while IFS= read -r -d '' exe; do
    if file -b "$exe" 2>/dev/null | grep -q "Mach-O"; then
        if xattr "$exe" 2>/dev/null | grep -q "com.apple.quarantine"; then
            xattr -d com.apple.quarantine "$exe"
            COUNT=$((COUNT + 1))
            echo "  ✓ ${exe#$APP_PATH/}"
        fi
    fi
done < <(find "$APP_PATH" -type f -perm +111 -print0 2>/dev/null)

echo ""
echo -e "${GREEN}=== 完成 ===${NC}"
echo "已清除 $COUNT 个可执行文件的检疫标记。"
echo "OpenViking.app 现在可以直接双击打开，无需手动右键放行。"
echo ""
if [ "$COUNT" -eq 0 ] && [ -z "$QUARANTINED" ]; then
    echo -e "${YELLOW}未发现任何检疫标记，应用可能已处于放行状态。${NC}"
fi
