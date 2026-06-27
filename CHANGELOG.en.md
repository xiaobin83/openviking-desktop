# Changelog

## [0.1.2] - 2026-06-27 — Windows Env Var Expansion & Config Refactor

### 🔌 Port Conflict Detection & Resolution

- **Port detection on startup**: The app no longer unconditionally starts the service on launch; instead, it first checks port occupancy (`check_port`), confirms no conflict, then starts, preventing zombie processes and orphaned ports.
- **OpenViking process conflict dialog**: When a port is occupied by an existing OpenViking process, a `PortConflictDialog` offers "Kill and continue" or "Exit" options.
- **External port occupancy handling**: When a port is occupied by a non-OpenViking process, a `PortStep` (dialog mode) guides the user to change the port number and recheck, supporting both server and bot gateway ports.
- **New port config step in wizard**: The first-run wizard adds step 6 `PortStep`, which automatically detects port conflicts after API Key configuration. On conflict, allows the user to enter a new port and revalidate.
- **Dynamic API port**: `BASE_URL` in `api.ts` changed from a constant to `let baseUrl`, with a new `setBasePort()` export. The Dashboard reads `server.port` from `ov.conf` on start.
- **Debug helper script**: `occupy-port-1933.sh` starts a minimal HTTP server occupying port 1933 for testing the port conflict flow.

### 🧙 Existing Config Discovery

- **Detect existing ov.conf in wizard**: After the workspace step completes, automatically checks for `ov.conf` in the workspace root. Prompts the user to "Use existing config" or "Start over".
- **Smart config merge**: When using existing config, only wizard-visible fields (Embedding, VLM, API Key, ports, etc.) are pre-filled; non-wizard fields (Feishu integration, circuit breaker, encryption, etc.) are fully preserved in the original config, merged on write-back.
- **New Rust commands**: `read_config_at` — reads config file at a given path for loading existing `ov.conf`. `exit_app` — exits the app from the port conflict dialog.
- **Detection module**: New `src/lib/detection.ts` encapsulating `detectServer()`, `findConflictingPorts()`, `findForeignOccupiedPorts()`, `readExistingConfig()`, `prefillFormData()`, `mergeWizardChanges()`, and more.

### 🍎 macOS Gatekeeper

- **One-click bypass script**: `allow-gatekeeper.sh` — automatically removes the `com.apple.quarantine` flag from `OpenViking.app` and all embedded Mach-O executables (e.g., `uv`). Auto-detects the app path or accepts manual specification.
- **Reset quarantine script**: `reset-gatekeeper.sh` — re-applies the Gatekeeper quarantine mark (`xattr -w com.apple.quarantine`), restoring the "first download" block state for testing.

### 🔧 Infrastructure

- **Version bump**: `0.1.1` → `0.1.2` (`package.json`, `Cargo.toml`, `tauri.conf.json`).
- **Test framework**: Added `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom` dev dependencies. New `pnpm test` / `pnpm test:watch` scripts.
- **Test files**: New `src/__tests__/OnboardingWizard.test.tsx`, `src/__tests__/detection.test.ts`, `src/__tests__/setup.ts`, `vitest.config.ts`.
- **i18n interpolation format fix**: `prefix`/`suffix` explicitly set to `{`/`}` (from default `{{`/`}}`), locale file variables changed from `{{version}}` to `{version}`. Added 13 port detection translation keys (both EN and ZH).

### 🪟 Windows Env Var Path Expansion

- **`expand_env_vars()`**: `expand_tilde` in Rust now also expands Windows `%VAR%` environment variable references (e.g., `%USERPROFILE%`). Non-existent variables are safely skipped to avoid infinite loops. Supports multiple variables in a single path.
- **Frontend path building switched to `join()`**: Default workspace path in `config-fields.ts` changed from string concatenation to `path.ts`'s `join()`, automatically adapting Windows backslashes and Unix forward slashes.
- **Exported `isWindows`**: `path.ts` exports `isWindows` constant so `config-fields.ts` no longer duplicates platform detection.
- **Wizard reads back expanded path**: `WorkspaceStep.tsx` now calls `get_workspace_data_path` on fallback to read back Rust's expanded full path, ensuring the UI displays the correct resolved path.

### 🔧 Config Refactor

- **`EMBEDDING_PROVIDERS` shared constant**: `config-fields.ts` extracts `EMBEDDING_PROVIDERS` array, used by both the config page `provider` dropdown and the wizard `EmbeddingStep`, eliminating duplicate hardcoded lists.
- **Provider label i18n fix**: `EmbeddingStep.tsx` changes from `startsWith('wizard.')` to `includes('.')` to determine whether translation is needed, supporting new key names like `ai.provider_options_local`. Deprecated `wizard.provider_local` translation keys removed.

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
