#!/bin/bash
# 重置 OpenViking-Desktop.app 的 Gatekeeper 放行状态，重新施加检疫标记。
# 执行后，打开应用将再次被 Gatekeeper 拦截。
#
# Usage:
#   bash scripts/reset-gatekeeper.sh                                Auto-detect app path
#   bash scripts/reset-gatekeeper.sh /path/to/OpenViking-Desktop.app  指定 app 路径
#   bash scripts/reset-gatekeeper.sh --help                         显示帮助

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

show_help() {
    cat <<EOF
重置 OpenViking-Desktop.app 的 Gatekeeper 检疫标记，使其重新被拦截。
 
 Usage: $(basename "$0") [APP_PATH | --help]
 
 原理:
   1. 移除系统 spctl 放行记录
   2. 清除现有检疫标记
   3. 重新施加"来自互联网下载"的检疫标记（com.apple.quarantine）
 
 执行后，双击 OpenViking-Desktop.app 将再次出现：
  "无法打开，因为无法验证开发者"

需要用户再次右键 → 打开手动放行。

Options:
  --help    Show this help and exit

Without APP_PATH, the script searches the following locations:
   1. /Applications/OpenViking-Desktop.app
   2. src-tauri/target/release/bundle/macos/OpenViking-Desktop.app
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
        "/Applications/OpenViking-Desktop.app"
        "src-tauri/target/release/bundle/macos/OpenViking-Desktop.app"
    )
    APP_PATH=""
    for candidate in "${CANDIDATES[@]}"; do
        if [ -d "$candidate" ]; then
            APP_PATH="$candidate"
            break
        fi
    done
    if [ -z "$APP_PATH" ]; then
        echo -e "${RED}未找到 OpenViking-Desktop.app。请指定路径：$(basename "$0") /path/to/OpenViking-Desktop.app${NC}"
        exit 1
    fi
fi

if [ ! -d "$APP_PATH" ]; then
    echo -e "${RED}路径不存在: $APP_PATH${NC}"
    exit 1
fi

echo -e "${YELLOW}=== 重置 Gatekeeper 检疫: $APP_PATH ===${NC}"
echo ""

# 1. 从系统放行数据库移除
spctl --remove "$APP_PATH" 2>/dev/null && \
    echo -e "${GREEN}  ✓ 已从 spctl 放行数据库移除${NC}" || \
    echo "  - spctl 放行数据库（无需清除或此版本不支持）"

# 2. 清除现有检疫标记
echo ""
echo "正在清除现有检疫标记..."
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null
echo -e "${GREEN}  ✓ 已清除所有现有检疫标记${NC}"

# 3. 重新施加检疫标记（模拟首次下载状态）
echo ""
echo "正在重新施加检疫标记..."
NOW=$(date +%s)

# 对 app bundle 本身施加检疫
xattr -w com.apple.quarantine "0086;${NOW};" "$APP_PATH"
echo -e "${GREEN}  ✓ app bundle 已重新施加检疫${NC}"

# 对内部所有 Mach-O 可执行文件（如 uv）也施加检疫
echo ""
echo "正在扫描内部可执行文件..."
COUNT=0
while IFS= read -r -d '' exe; do
    if file -b "$exe" 2>/dev/null | grep -q "Mach-O"; then
        xattr -w com.apple.quarantine "0086;${NOW};" "$exe" 2>/dev/null
        COUNT=$((COUNT + 1))
        echo "  ✓ ${exe#$APP_PATH/}"
    fi
done < <(find "$APP_PATH" -type f -perm +111 -print0 2>/dev/null)

echo ""
echo -e "${GREEN}=== 完成 ===${NC}"
echo "已为 $COUNT 个可执行文件重新施加检疫标记。"
echo ""
echo -e "${YELLOW}现在双击打开 OpenViking-Desktop.app 将再次触发 Gatekeeper 拦截。${NC}"
echo "用户需通过 右键 → 打开 手动放行。"
echo ""
echo "如需再次放行，运行: bash scripts/allow-gatekeeper.sh"
