# PlayGround Tray Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "启动 PlayGround" tray menu item that opens the server URL in a reusable webview window.

**Architecture:** Single Rust-side change in `tray.rs` — add menu item in `build_status_menu()`, handle click in `handle_menu_event()` by showing/focusing an existing "playground" window or creating a new one with `WebviewWindowBuilder`. Add close-to-hide behavior in `lib.rs` `on_window_event`.

**Tech Stack:** Tauri 2.0 (Rust), `tauri::WebviewWindowBuilder`, `tauri::WebviewUrl`

---

### Task 1: Add menu item "启动 PlayGround"

**Files:**
- Modify: `src-tauri/src/tray.rs:47-88` (`build_status_menu`)

- [ ] **Step 1: Add playground item after dashboard item**

In `src-tauri/src/tray.rs`, add the new menu item and separator after the dashboard item:

```rust
let dashboard_item = MenuItemBuilder::with_id("open_dashboard", "打开仪表盘")
    .build(app)?;
let playground_item = MenuItemBuilder::with_id("open_playground", "启动 PlayGround")
    .enabled(is_running)
    .build(app)?;
let quit_item = MenuItemBuilder::with_id("quit", "退出")
    .build(app)?;
```

Then update `MenuBuilder` to include the new items:

```rust
MenuBuilder::new(app)
    .item(&status_item)
    .separator()
    .item(&start_item)
    .item(&restart_item)
    .item(&stop_item)
    .separator()
    .item(&dashboard_item)
    .separator()
    .item(&playground_item)
    .separator()
    .item(&quit_item)
    .build()
```

- [ ] **Step 2: Verify the file compiles**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: Build succeeds (may take time for first build)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/tray.rs
git commit -m "feat(tray): add PlayGround menu item"
```

---

### Task 2: Handle "open_playground" menu event

**Files:**
- Modify: `src-tauri/src/tray.rs:90-125` (`handle_menu_event`)

- [ ] **Step 1: Add import for WebviewUrl and WebviewWindowBuilder**

At the top of `src-tauri/src/tray.rs`, ensure `Manager` and necessary types are imported. The file already imports `Manager`, but add `WebviewUrl`:

```rust
use tauri::{
    AppHandle, Listener, Manager,
    menu::{Menu, MenuBuilder, MenuItemBuilder},
    tray::{TrayIcon, TrayIconBuilder},
    WebviewUrl,
};
```

- [ ] **Step 2: Add "open_playground" handler**

Add a new match arm in `handle_menu_event()` after `"open_dashboard"`:

```rust
"open_playground" => {
    let port = *app.state::<crate::ServerState>().port.lock().unwrap();
    let url = format!("http://localhost:{}", port);
    if let Some(window) = app.get_webview_window("playground") {
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        let url = url.parse::<tauri::Url>().expect("invalid playground URL");
        let _ = tauri::WebviewWindowBuilder::new(
            app,
            "playground",
            tauri::WebviewUrl::External(url),
        )
        .title("PlayGround")
        .inner_size(850.0, 650.0)
        .center()
        .build();
    }
}
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/tray.rs
git commit -m "feat(tray): handle open_playground menu event"
```

---

### Task 3: Hide playground window on close (instead of destroy)

**Files:**
- Modify: `src-tauri/src/lib.rs:552-558` (`on_window_event`)

- [ ] **Step 1: Extend close prevention to playground window**

In `src-tauri/src/lib.rs`, modify the `CloseRequested` handler:

```rust
.on_window_event(|window, event| {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == "dashboard" || window.label() == "playground" {
            api.prevent_close();
            let _ = window.hide();
        }
    }
})
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: hide playground window on close instead of destroy"
```
