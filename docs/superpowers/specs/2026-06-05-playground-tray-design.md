# PlayGround Tray 菜单设计

## 概述

在系统托盘菜单中新增"启动 PlayGround"命令，该命令仅在 OpenViking 服务器启动（状态为 `running`）后才可被使用。点击后在新的 webview 窗口中打开服务器地址 `http://localhost:{port}`。

## 需求

1. 新增菜单项 "启动 PlayGround"，`enabled` 状态绑定到 `is_running`
2. 点击后打开/聚焦一个 webview 窗口，加载 `http://localhost:{port}`（port 从 `ServerState.port` 读取）
3. 窗口复用：若"playground"窗口已存在，则仅 `show()` + `set_focus()`，不重复创建
4. 窗口关闭时隐藏而非销毁（与 dashboard 行为一致）

## 改动清单

### 1. `src-tauri/src/tray.rs`

**`build_status_menu()`** — 在 "打开仪表盘" 下方新增菜单项：

| 属性 | 值 |
|------|-----|
| ID | `"open_playground"` |
| 标签 | `"启动 PlayGround"` |
| enabled | `is_running` |

菜单结构变为：`... | 打开仪表盘 | separator | 启动 PlayGround | separator | 退出`

**`handle_menu_event()`** — 新增 `"open_playground"` 分支：

```rust
"open_playground" => {
    let port = *app.state::<crate::ServerState>().port.lock().unwrap();
    let url = format!("http://localhost:{}", port);
    if let Some(window) = app.get_webview_window("playground") {
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        let _ = tauri::WebviewWindowBuilder::new(
            app,
            "playground",
            tauri::WebviewUrl::External(url.parse().unwrap()),
        )
        .title("PlayGround")
        .inner_size(850.0, 650.0)
        .center()
        .build();
    }
}
```

### 2. `src-tauri/src/lib.rs`

**`on_window_event`** — 为 `"playground"` 窗口添加与 `"dashboard"` 相同的隐藏而非关闭逻辑：

```rust
if window.label() == "dashboard" || window.label() == "playground" {
    api.prevent_close();
    let _ = window.hide();
}
```

### 3. `src-tauri/capabilities/default.json`

无需修改。PlayGround 窗口加载外部 URL，不调用 Tauri IPC。

### 4. `src-tauri/tauri.conf.json`

无需修改。PlayGround 窗口由 `WebviewWindowBuilder` 在运行时动态创建。

## 边界情况

- **服务未运行**：菜单项置灰不可点击
- **服务端口非 1933**：从 `ServerState.port` 动态读取 URL
- **重复点击**：复用已有窗口，不创建新实例
- **窗口关闭后再点击**：重新 `show()` + `set_focus()`（因关闭被拦截为 hide）
