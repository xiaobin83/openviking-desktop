use tauri::{
    AppHandle, Emitter, Manager, Runtime,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
};
use log::info;

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let toggle_item = MenuItemBuilder::with_id("toggle_server", "● 启动服务").build(app)?;
    let dashboard_item = MenuItemBuilder::with_id("open_dashboard", "打开仪表盘").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&toggle_item)
        .separator()
        .item(&dashboard_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("OpenViking")
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "toggle_server" => {
                    let _ = app.emit::<bool>("tray-toggle-server", true);
                }
                "open_dashboard" => {
                    if let Some(window) = app.get_webview_window("dashboard") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    log::info!("Quit requested from tray menu");
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                if let Some(window) = tray.app_handle().get_webview_window("dashboard") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    info!("Tray icon created");
    Ok(())
}
