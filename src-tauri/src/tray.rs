use std::sync::Mutex;
use tauri::{
    AppHandle, Listener, Manager,
    menu::{Menu, MenuBuilder, MenuItemBuilder},
    tray::{TrayIcon, TrayIconBuilder},
    WebviewUrl,
};

static TRAY: Mutex<Option<TrayIcon>> = Mutex::new(None);

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_status_menu(app, "stopped")?;

    let icon = app
        .default_window_icon()
        .cloned()
        .unwrap_or_else(|| tauri::image::Image::new(&[], 0, 0));

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .tooltip("OpenViking")
        .show_menu_on_left_click(true)
        .on_menu_event(handle_menu_event)
        .build(app)?;

    if let Ok(mut guard) = TRAY.lock() {
        *guard = Some(tray);
    }

    let app_clone = app.clone();
    app.listen("server-status-changed", move |event| {
        let status = event.payload();
        if let Ok(new_menu) = build_status_menu(&app_clone, status.trim_matches('"')) {
            if let Ok(guard) = TRAY.lock() {
                if let Some(tray) = guard.as_ref() {
                    let _ = tray.set_menu(Some(new_menu));
                }
            }
        }
    });

    log::info!("Tray icon created");
    Ok(())
}

fn build_status_menu(app: &AppHandle, status: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let is_running = status == "running";
    let is_starting = status == "starting";
    let is_stopped = status == "stopped" || status == "error" || status == "timeout";

    let status_text = match status {
        "running" => "● 服务运行中",
        "starting" => "⟳ 服务启动中",
        "error" => "✕ 服务异常",
        "timeout" => "✕ 服务超时",
        _ => "○ 服务已停止",
    };

    let status_item = MenuItemBuilder::with_id("_status", status_text)
        .enabled(false)
        .build(app)?;
    let start_item = MenuItemBuilder::with_id("start_server", "启动服务")
        .enabled(is_stopped)
        .build(app)?;
    let restart_item = MenuItemBuilder::with_id("restart_server", "重启服务")
        .enabled(is_running || is_starting)
        .build(app)?;
    let stop_item = MenuItemBuilder::with_id("stop_server", "关闭服务")
        .enabled(is_running || is_starting)
        .build(app)?;
    let dashboard_item = MenuItemBuilder::with_id("open_dashboard", "打开仪表盘")
        .build(app)?;
    let playground_item = MenuItemBuilder::with_id("open_playground", "启动 PlayGround")
        .enabled(is_running)
        .build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出")
        .build(app)?;

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
}

fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let app_clone = app.clone();
    match event.id().as_ref() {
        "start_server" => {
            tauri::async_runtime::spawn(async move {
                let state = app_clone.state::<crate::ServerState>();
                let _ = crate::process::spawn_server(&state, &app_clone).await;
            });
        }
        "restart_server" => {
            tauri::async_runtime::spawn(async move {
                let state = app_clone.state::<crate::ServerState>();
                let _ = crate::process::stop_server(&state, &app_clone).await;
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                let _ = crate::process::spawn_server(&state, &app_clone).await;
            });
        }
        "stop_server" => {
            tauri::async_runtime::spawn(async move {
                let state = app_clone.state::<crate::ServerState>();
                let _ = crate::process::stop_server(&state, &app_clone).await;
            });
        }
        "open_dashboard" => {
            if let Some(window) = app.get_webview_window("dashboard") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
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
                    WebviewUrl::External(url),
                )
                .title("PlayGround")
                .inner_size(850.0, 650.0)
                .center()
                .build();
            }
        }
        "quit" => {
            log::info!("Quit requested from tray menu");
            app.exit(0);
        }
        _ => {}
    }
}
