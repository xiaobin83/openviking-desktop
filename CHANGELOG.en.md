# Changelog

## [0.1.1] - 2026-06-23 — Windows Support

### 🪟 Windows Platform Support

- **Platform-aware paths**: Added Windows support for `open_console`, `open_log_file`, `open_app_log_file`. Log files open with Notepad, folders with explorer.exe, and console prefers Windows Terminal (`wt`) with fallback to legacy cmd.
- **Python virtual environment**: On Windows, Python binaries are located in `Scripts/` (not `bin/`), and the `PATH` separator uses `;` (not `:`).
- **Build guide**: Added Windows GNU toolchain build guide to `AGENTS.md` (MinGW-w64, Rust GNU toolchain). Removed `cdylib` crate type from `Cargo.toml` for GNU `ld` compatibility.
- **`reset-first-run.bat`**: Added Windows batch script to reset first-run state.
- **Line endings**: `.gitattributes` enforces LF line endings.
- **Default workspace**: Windows defaults to `%USERPROFILE%\OpenViking`.

### 🐍 Python Environment Management

- **Version detection**: `pip_show_openviking` uses a three-tier fallback strategy — structured JSON (`pip list --format json`) → Python `importlib.metadata` → case-insensitive `pip show` parsing, resolving version string parsing ambiguity.
- **Version cache**: Persists the installed version to `app_data_dir/openviking_version` after installation, preventing empty results on subsequent launches.
- **Async version check**: `check_latest_version` command decoupled from `check_openviking_state`, queries the latest version asynchronously over the network without blocking the UI.
- **DEFAULT_PYTHON_VERSION**: Extracted to constant `3.13`, eliminating multiple hardcoded occurrences.
- **Optional local embedding**: `local-embed` extra is now optional during install/upgrade/reinstall, controlling whether `llama-cpp-python` is installed. A C++ toolchain prompt is shown on Windows (Windows only). Prebuilt `.whl` files can be bundled via `Resources/wheels/`, avoiding source compilation on Windows.

### ⚙️ Configuration & Ports

- **Bot Gateway port**: Added `bot.gateway.port` field to `ov.conf` (default 18790), configurable in the Basic config tab.
- **Port config sync**: Syncs `server.port` and `bot.gateway.port` from `ov.conf` to state on startup; properly cleans up ports on exit.
- **Storage workspace path**: Default config `storage.workspace` now uses `Path::join()` for platform-appropriate path separators.

### 🖥️ Server Process

- **Python subprocess encoding**: Sets `PYTHONIOENCODING=utf-8` and `PYTHONUTF8=1` when spawning openviking-server, fixing GBK encoding issues on Windows console.
- **Port cleanup**: Cleans up server and bot ports on `ServerState::Drop` and `RunEvent::Exit`.
- **Auto-show dashboard**: Dashboard window is now automatically shown on first launch.

### 📊 Dashboard & Python Environment Card

- **Remove broken endpoints**: Removed `getMemoryStats` and `getMemoriesStats` API calls from Dashboard.
- **Extras display**: Python environment card shows installed extra feature tag (`[bot]` or `[bot, local-embed]`).
- **Two-line version info**: Python and OpenViking versions are each on their own line.
- **Upgrade button polish**: Smaller button with centered "Stop the server first" hint (i18n) shown below when disabled.
- **i18n progress messages**: In-progress text (e.g., "Installing OpenViking...", "Downloading Python...") now supports English/Chinese i18n.
- **Root API Key copy button**: Copy button added to password fields in config page.

### 🎨 UI & Icons

- **SVG icon library**: New `Icons.tsx` (CheckIcon, ArrowRightIcon, ChevronDownIcon, ChevronRightIcon, XIcon), replacing all Unicode characters (✓, ✗, ▾, ▸) and HTML entities (`&check;`, `&times;`), fixing missing glyph issues.
- **App version display**: Version badge (`v0.1.1`) shown next to the window title.
- **Volcengine default API base**: Defaults to the multimodal embeddings endpoint.
- **DMG bundle target**: Restored `dmg` entry in `tauri.conf.json` bundle targets.

### 🧙 Setup Wizard

- **Local embedding toggle**: InstallStep (step 0) now includes a local-embed checkbox, controlling whether `llama-cpp-python` is included during installation. State is refreshed post-install to ensure the local option appears correctly in subsequent steps.
- **Embedding provider description**: Removed local provider mention from description text.
- **Version list fallback**: Falls back to showing the installed OpenViking version when the network is unavailable.
- **Disable Next during install**: The "Next" button is disabled during installation.
- **Provider switch logic**: Model and dimension are always updated on provider changes.

### 🔧 Build & Infrastructure

- **Version bump**: `0.1.0` → `0.1.1` (`package.json`, `Cargo.toml`, `tauri.conf.json`).
- **`pnpm-workspace.yaml`**: `esbuild` builds allowed.
- **`download-llama-cpp.sh`**: New script for downloading prebuilt `llama-cpp-python` wheels.
- **`.gitignore`**: Added `.whl`, `.deb`, and cargo-xwin cache rules.
- **Debug logging**: Curl-style request logging added to `fetchApi`.

### 🛠️ Platform Path Fixes

- **Log path**: Non-macOS platforms now use `app_data_dir/logs` (replacing hardcoded `~/Library/Logs/OpenViking`).
- **FS scope**: Added `$APPDATA/com.openviking.desktop/**` to `capabilities/default.json`, covering `app_data_dir` on Windows, Linux, and macOS.
- **First-run flag migration**: `.onboarded` flag migrated from `~/.openviking/` to `app_data_dir/` (Windows: `%APPDATA%/com.openviking.desktop/`), with backward-compat fallback to the old location.
- **Default config path**: `ov.conf` fallback path migrated from `home_dir` to `app_data_dir`.
- **Vector DB path**: `resolve_vectordb_path` and `get_workspace_data_path` empty-workspace fallbacks now use platform-aware `get_default_workspace_path()`.
- **Frontend defaults**: `config-fields.ts` and wizard workspace fallback now detect Windows platform (`%USERPROFILE%\OpenViking\data`).
- **Wheel path**: `Resources/wheels` uses explicit `Path::join("Resources").join("wheels")` construction.

### 🖱️ Dashboard UX Improvements

- **Lock controls during install**: Disable "Start Service" button (muted + `cursor-not-allowed`) and lock Config tab during Python environment installation/upgrade. Auto-switch to Overview tab if already on Config when installation starts.
