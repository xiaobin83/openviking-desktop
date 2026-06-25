#!/bin/bash
# Reset first-run state for testing the onboarding wizard.
#
# Usage:
#   bash scripts/reset-first-run.sh                 Reset flags + config only
#   bash scripts/reset-first-run.sh --full          Also delete Python venv
#   bash scripts/reset-first-run.sh --purge         Alias for --full
#   bash scripts/reset-first-run.sh --help          Show this help

set -e

# Legacy flag/config locations (before Tauri app_data_dir migration)
ONBOARDED_FLAG_LEGACY="$HOME/.openviking/.onboarded"
OV_CONF="$HOME/.openviking/ov.conf"

# app data dir per Tauri conventions (bundle id com.openviking.desktop)
case "$(uname -s)" in
    Darwin)
        APPDATA_DIR="$HOME/Library/Application Support/com.openviking.desktop"
        VENV_DIR="$APPDATA_DIR/python"
        UV_PYTHON_DIR="$HOME/.local/share/uv/python"
        ;;
    Linux)
        APPDATA_DIR="$HOME/.local/share/com.openviking.desktop"
        VENV_DIR="$APPDATA_DIR/python"
        UV_PYTHON_DIR="$HOME/.local/share/uv/python"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        APPDATA_DIR="$APPDATA/com.openviking.desktop"
        VENV_DIR="$APPDATA_DIR/python"
        UV_PYTHON_DIR="$APPDATA/uv/data/python"
        ;;
    *)
        echo "Unknown platform: $(uname -s)"
        exit 1
        ;;
esac

ONBOARDED_FLAG="$APPDATA_DIR/.onboarded"

show_help() {
    cat <<EOF
Reset first-run state for testing the onboarding wizard.

Usage: $(basename "$0") [OPTION]

Options:
  --full    Delete Python venv and downloaded Python binaries
  --purge   (same as --full)
  --help    Show this help and exit

Without options, only removes the .onboarded flag and ov.conf.
EOF
    exit 0
}

MODE="reset"
case "${1:-}" in
    --help|-h) show_help ;;
    --full|--purge) MODE="full" ;;
esac

echo "Resetting first-run state..."
echo ""

# --- always: remove flag and config ---

removed_any_flag=false
for flag_path in "$ONBOARDED_FLAG" "$ONBOARDED_FLAG_LEGACY"; do
    if [ -f "$flag_path" ]; then
        rm "$flag_path"
        echo "  ✓ Removed $flag_path"
        removed_any_flag=true
    fi
done
if [ "$removed_any_flag" = false ]; then
    echo "  - .onboarded flag (not found in app data or legacy location)"
fi

if [ -f "$OV_CONF" ]; then
    rm "$OV_CONF"
    echo "  ✓ Removed $OV_CONF"
    if [ -f "${OV_CONF}.bak" ]; then
        rm "${OV_CONF}.bak"
        echo "  ✓ Removed ${OV_CONF}.bak"
    fi
else
    echo "  - $OV_CONF (not found)"
fi

# --- full/purge: delete venv and uv-downloaded Python binaries ---

if [ "$MODE" = "full" ]; then
    echo ""
    echo "--- Removing Python environment ---"

    if [ -d "$VENV_DIR" ]; then
        rm -rf "$VENV_DIR"
        echo "  ✓ Removed Python venv: $VENV_DIR"
    else
        echo "  - Python venv (not found): $VENV_DIR"
    fi

    if [ -d "$UV_PYTHON_DIR" ]; then
        rm -rf "$UV_PYTHON_DIR"
        echo "  ✓ Removed downloaded Python binaries: $UV_PYTHON_DIR"
    else
        echo "  - Downloaded Python binaries (not found): $UV_PYTHON_DIR"
    fi
fi

echo ""
echo "Done. Next app launch will show the onboarding wizard."
