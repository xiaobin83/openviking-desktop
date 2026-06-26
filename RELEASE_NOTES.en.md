# OpenViking Desktop v0.1.2 — Pre-release (macOS + Windows)

OpenViking Desktop is a local desktop management console for the OpenViking AI knowledge management system. **Its goal is to dramatically lower the barrier to using OpenViking** — no command-line interaction required for installation, startup, configuration, or monitoring.

## System Requirements

- macOS 14.0 (Sonoma) or later, Apple Silicon (M1/M2/M3/M4)
- Windows 10 or later, x86_64
- Internet connection required on first use (automatically downloads Python runtime)

## Key Features

- **Zero command-line setup**: The first-run wizard guides you through everything — choose an OpenViking working directory, configure AI models, set your API Key — all through a graphical interface
- **Automatic Python environment management**: Built-in `uv` runtime automatically downloads the specified Python version, creates a virtual environment, and installs `openviking[bot]` with real-time progress feedback
- **One-click service management**: Start/stop/restart the backend service, system tray support for background operation, automatic crash recovery with up to 3 retries
- **Real-time dashboard**: Service status at a glance with auto-refreshing metrics — file count, memory count, token usage, query count, and more
- **Full configuration management**: Visually configure all parameters across 5 tabs (Basic / AI / Storage / Advanced / Feishu), with one-click workspace switching
- **Embedded PlayGround**: Open OpenViking PlayGround directly in the app window — API Key is automatically copied to your clipboard
- **Bilingual interface**: Automatically matches system language, with one-click switching in settings
- **Dark theme**: Carefully crafted dark UI for reduced eye strain

## Installation

1. Download the installer for your platform (macOS: `OpenViking_0.1.2_aarch64.dmg`, Windows: `OpenViking_0.1.2_x64.msi`)
2. Drag `OpenViking.app` into the `Applications` folder
3. On first launch, the setup wizard will appear automatically — follow the prompts to initialize the Python environment (internet required)
4. Once complete, start the service and you're ready to go

### macOS First Launch

The current build uses ad-hoc signing and is not notarized by Apple. macOS Gatekeeper will block the first launch. Follow these steps:

**Option 1: One-click bypass (recommended)**

Run the following in Terminal to automatically clear the quarantine flags:

```bash
curl -fsSL https://raw.githubusercontent.com/xiaobin83/openviking-desktop/main/scripts/allow-gatekeeper.sh | bash
```

You can then double-click to open OpenViking.app directly.

> To restore the Gatekeeper quarantine state (for testing):
> ```bash
> curl -fsSL https://raw.githubusercontent.com/xiaobin83/openviking-desktop/main/scripts/reset-gatekeeper.sh | bash
> ```

**Option 2: Manual right-click bypass**

1. Double-click `OpenViking.app` → "Cannot be opened" dialog → click **"Done"**
2. Open **System Settings → Privacy & Security** → scroll to the bottom → click **"Open Anyway"**
3. Double-click `OpenViking.app` again → click **"Open"**

> If the "Open Anyway" button does not appear, run in Terminal:
> ```
> xattr -cr /Applications/OpenViking.app
> ```

> Enterprise-managed Macs may prohibit unsigned applications entirely. Contact your IT administrator in such cases.

## What's New

- **Port conflict detection and resolution**: The app now checks if required ports are occupied at startup. If occupied by an existing OpenViking process, a dialog offers to clear it; if occupied by another application, a port reconfiguration step guides the user to choose new port numbers.
- **Existing config detection**: The wizard now detects an existing `ov.conf` during the workspace step and offers to reuse it or start fresh. When reusing, only wizard-visible fields are loaded — non-wizard fields (Feishu integration, circuit breaker, etc.) are preserved unchanged.
- **Dynamic API port**: The API base URL is no longer hardcoded to `1933`. It now reads from `server.port` in `ov.conf`, supporting any port configuration.
- **Gatekeeper scripts**: Added `allow-gatekeeper.sh` (one-click bypass) and `reset-gatekeeper.sh` (restore quarantine), making macOS testing and daily use more convenient.
- **Debug helper script**: Added `occupy-port-1933.sh` to simulate a port occupied by another application for testing port conflict handling.

## Bug Fixes

- **Eager workspace directory creation**: Fixed an issue in the first-run wizard where typing each character in the "Working Directory" step created a directory. The directory is now only created when clicking "Next" if the path does not exist, with path validity validation.
- **Startup behavior optimization**: Removed unconditional auto-start on app launch. The app now performs port conflict detection first, starting the server only after confirming no conflicts — preventing zombie processes and orphaned ports.

## Known Issues

- **Existing config detection not working on Windows**: The path regex in the wizard's config detection only matches forward slashes (`/`), so it fails on Windows paths which use backslashes. The feature silently degrades to "Start Fresh", with no impact on normal usage. Planned fix in v0.1.3.

## Notes

- After completing the wizard, your working directory will have the following structure:
  ```
  <working-dir>/
  ├── ov.conf    # Configuration file (auto-generated)
  └── data/      # Knowledge base data, vector database, etc.
  ```
- To re-run the wizard, delete the first-run flag file (your Python environment and working directory data will be preserved):
  - **macOS**: Delete `~/Library/Application Support/com.openviking.desktop/.onboarded`
  - **Linux**: Delete `~/.local/share/com.openviking.desktop/.onboarded`
  - **Windows**: Delete `%APPDATA%\com.openviking.desktop\.onboarded`
  - Tip: You can also run `bash scripts/reset-first-run.sh` to reset automatically
