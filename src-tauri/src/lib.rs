use std::sync::Mutex;
use tauri::{Manager, PhysicalPosition, PhysicalSize, Position, Size};

/// 后端服务状态：面板不再 spawn/管理后端（改由独立 DF Server 脚本/按钮管控），
/// 此 state 仅用于记录“面板是否探测到后端在线”，避免重复探测。
struct BackendState(Mutex<Option<bool>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackendState(Mutex::new(None)))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_resizable(true);
                let _ = window.maximize();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            save_watchlist_backup,
            load_watchlist_backup,
            start_backend,
            stop_backend,
            backend_status,
            read_doc,
        ])
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

            // 后端生命周期已解耦：面板不再 spawn 后端，仅探测是否在线。
            // 真正拉起请用独立 DF Server 脚本/桌面按钮。
            let backend_state = app.state::<BackendState>();
            let running = is_backend_running();
            *backend_state.0.lock().unwrap() = Some(running);
            eprintln!("[backend] detected at launch: {}", if running { "running" } else { "not running (use DF Server to start)" });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DeepFusion Desktop");
}

/// 探测后端服务（5173）是否在线。仅做 TCP 连接探测，不拉起、不管理后端生命周期。
/// 后端完全由独立 DF Server 脚本/按钮管控，面板与 Web 看板都只连、不管。
fn is_backend_running() -> bool {
    use std::net::TcpStream;
    use std::time::Duration;
    match TcpStream::connect_timeout(
        &"127.0.0.1:5173".parse().unwrap(),
        Duration::from_millis(400),
    ) {
        Ok(_) => true,
        Err(_) => false,
    }
}

/// 启动后端服务（DeepFusion serve.py）。
/// 注意：面板不再负责 spawn 后端。此命令改为“探测是否在线”——已在线返回 running，
/// 否则返回 backend_not_running（提示用户用 DF Server 按钮启动），避免与 Web 看板争抢生命周期。
#[tauri::command]
fn start_backend(state: tauri::State<BackendState>) -> Result<String, String> {
    let running = is_backend_running();
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(running);
    if running {
        Ok("running".to_string())
    } else {
        Err("backend_not_running".to_string())
    }
}

/// 停止后端服务：面板不再拥有后端生命周期，此命令改为 no-op。
/// 真正停止后端请用 DF Server 脚本或 pkill serve.py。
#[tauri::command]
fn stop_backend(state: tauri::State<BackendState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(false);
    Ok("ignored_by_panel".to_string())
}

/// 返回后端当前是否在运行（基于 5173 端口探测）。
#[tauri::command]
fn backend_status(state: tauri::State<BackendState>) -> Result<bool, String> {
    let running = is_backend_running();
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(running);
    Ok(running)
}

/// 持仓磁盘备份：写入 ~/.config/deepfusion/watchlist.json（独立于 WebView 缓存）
#[tauri::command]
fn save_watchlist_backup(json: String) -> Result<(), String> {
    let dir = dirs_config();
    if let Err(e) = std::fs::create_dir_all(&dir) {
        return Err(format!("mkdir failed: {e}"));
    }
    let path = format!("{dir}/watchlist.json");
    std::fs::write(&path, json).map_err(|e| format!("write failed: {e}"))
}

/// 读取磁盘备份，不存在/损坏时返回 None
#[tauri::command]
fn load_watchlist_backup() -> Option<String> {
    let path = format!("{}/watchlist.json", dirs_config());
    std::fs::read_to_string(path).ok()
}

fn dirs_config() -> String {
    // 优先 HOME，回退 /tmp
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    format!("{home}/.config/deepfusion")
}

/// 读取 DeepFusion 项目内的文档（md/文本）。
/// - relative 为相对 DeepFusion 项目根的路径。
/// - 若为目录，则读取其 SKILL.md（skill 目录约定）。
/// - 路径做安全校验，禁止“..”跳出项目根。
#[tauri::command]
fn read_doc(relative: String) -> Result<String, String> {
    if relative.contains("..") {
        return Err("非法路径：禁止使用 .. ".to_string());
    }
    // 文档读取根目录同样走 DEEP_FUSION_HOME，与后端位置保持一致。
    let root = std::env::var("DEEP_FUSION_HOME")
        .unwrap_or_else(|_| "/home/AI/workspace/Mcp Server/deepfusion-server".to_string());
    let base = std::path::Path::new(&root);
    let full = base.join(&relative);
    let target = if full.is_dir() {
        full.join("SKILL.md")
    } else {
        full
    };
    std::fs::read_to_string(&target)
        .map_err(|e| format!("读取失败 {}: {e}", target.display()))
}
