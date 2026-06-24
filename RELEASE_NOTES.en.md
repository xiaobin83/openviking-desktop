# OpenViking Desktop v0.1.1 — Pre-release (macOS + Windows)

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

1. Download the installer for your platform (macOS: `OpenViking_0.1.1_aarch64.dmg`, Windows: `OpenViking_0.1.1_x64.msi`)
2. Drag `OpenViking.app` into the `Applications` folder
3. On first launch, the setup wizard will appear automatically — follow the prompts to initialize the Python environment (internet required)
4. Once complete, start the service and you're ready to go

## Notes

- After completing the wizard, your working directory will have the following structure:
  ```
  <working-dir>/
  ├── ov.conf    # Configuration file (auto-generated)
  └── data/      # Knowledge base data, vector database, etc.
  ```
- To re-run the wizard, delete the first-run flag file (your Python environment and working directory data will be preserved):
  - **macOS / Linux**: Delete `~/.openviking/.onboarded` (or `~/Library/Application Support/com.openviking.desktop/.onboarded`)
  - **Windows**: Delete `%APPDATA%\com.openviking.desktop\.onboarded` (or `%USERPROFILE%\.openviking\.onboarded`)
