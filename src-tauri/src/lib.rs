use tauri::{Manager, PhysicalPosition, PhysicalSize, Position, Size};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_resizable(true);
                let _ = window.maximize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("main window must be configured");
            window.set_decorations(false)?;
            if let Some(monitor) = window.current_monitor()? {
                let size = monitor.size();
                let position = monitor.position();
                eprintln!("display position={position:?} size={size:?} scale={:?} work_area={:?}", monitor.scale_factor(), monitor.work_area());
                window.set_position(Position::Physical(PhysicalPosition::new(position.x, position.y)))?;
                window.set_size(Size::Physical(PhysicalSize::new(size.width, size.height)))?;
            }
            eprintln!("window before fullscreen outer={:?} inner={:?} fullscreen={:?} scale={:?}", window.outer_size(), window.inner_size(), window.is_fullscreen(), window.scale_factor());
            window.set_fullscreen(false)?;
            window.set_resizable(true)?;
            window.maximize()?;
            window.set_focus()?;

            let delayed_window = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(800));
                if let Ok(Some(monitor)) = delayed_window.current_monitor() {
                    let size = monitor.size();
                    let position = monitor.position();
                    let _ = delayed_window.set_position(Position::Physical(PhysicalPosition::new(position.x, position.y)));
                    let _ = delayed_window.set_size(Size::Physical(PhysicalSize::new(size.width, size.height)));
                    let _ = delayed_window.set_fullscreen(false);
                    let _ = delayed_window.set_resizable(true);
                    let _ = delayed_window.maximize();
                    let _ = delayed_window.set_focus();
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    eprintln!("window delayed maximized display={size:?} outer={:?} inner={:?} fullscreen={:?} maximized={:?} scale={:?}", delayed_window.outer_size(), delayed_window.inner_size(), delayed_window.is_fullscreen(), delayed_window.is_maximized(), delayed_window.scale_factor());
                } else {
                    eprintln!("window delayed fullscreen monitor unavailable");
                }
            });

            eprintln!("window after fullscreen outer={:?} inner={:?} fullscreen={:?} scale={:?}", window.outer_size(), window.inner_size(), window.is_fullscreen(), window.scale_factor());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DeepFusion Desktop");
}
