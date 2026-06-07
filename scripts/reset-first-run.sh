#!/bin/bash
# Reset first-run state for testing the onboarding wizard.
#
# Usage:
#   bash scripts/reset-first-run.sh                 Reset flags + config only
#   bash scripts/reset-first-run.sh --full          Also delete Python venv
#   bash scripts/reset-first-run.sh --purge         Alias for --full
#   bash scripts/reset-first-run.sh --help          Show this help

set -e

ONBOARDED_FLAG="$HOME/.openviking/.onboarded"
OV_CONF="$HOME/.openviking/ov.conf"

# app data dir per Tauri conventions (bundle id com.openviking.desktop)
case "$(uname -s)" in
    Darwin)
        VENV_DIR="$HOME/Library/Application Support/com.openviking.desktop/python"
        UV_PYTHON_DIR="$HOME/.local/share/uv/python"
        ;;
    Linux)
        VENV_DIR="$HOME/.local/share/com.openviking.desktop/python"
        UV_PYTHON_DIR="$HOME/.local/share/uv/python"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        VENV_DIR="$APPDATA/com.openviking.desktop/python"
        UV_PYTHON_DIR="$APPDATA/uv/data/python"
        ;;
    *)
        echo "Unknown platform: $(uname -s)"
        exit 1
        ;;
esac

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

if [ -f "$ONBOARDED_FLAG" ]; then
    rm "$ONBOARDED_FLAG"
    echo "  ✓ Removed $ONBOARDED_FLAG"
else
    echo "  - $ONBOARDED_FLAG (not found)"
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
