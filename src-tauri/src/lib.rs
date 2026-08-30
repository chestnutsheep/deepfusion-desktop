use std::os::unix::process::CommandExt;
use std::process::Command;
use std::sync::Mutex;
use tauri::{Manager, PhysicalPosition, PhysicalSize, Position, Size};

/// 后端服务子进程（独立进程组，便于整组 kill）。
/// None 表示后端未启动。
struct BackendState(Mutex<Option<BackendHandle>>);

struct BackendHandle {
    /// 进程组 ID（即 spawn 出的 bash 子进程 pid，也是 serve.py 进程组组长）。
    pgid: u32,
}

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

            // 窗口创建即自动拉起后端服务（5173），保持活性直到用户点击关闭主屏。
            let backend_state = app.state::<BackendState>();
            match spawn_backend(&backend_state) {
                Ok(_) => eprintln!("[backend] auto-started on launch"),
                Err(e) => eprintln!("[backend] auto-start skipped: {e}"),
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DeepFusion Desktop");
}

/// 实际拉起后端进程：spawn 一个独立进程组的 bash 运行 serve.py。
/// 成功返回进程组 ID（== 子进程 pid），供 stop_backend 用 killpg 整组清除。
fn spawn_backend(state: &tauri::State<BackendState>) -> Result<u32, String> {
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("already_running".to_string());
        }
    }

    // 后端服务目录通过环境变量 DEEP_FUSION_HOME 指定（缺省回落原路径）。
    // 解耦 desktop panel 与后端仓库的物理位置，便于后端独立为 deepfusion-server 模块。
    let deepfusion_dir = std::env::var("DEEP_FUSION_HOME")
        .unwrap_or_else(|_| "/home/AI/workspace/Mcp Server/DeepFusion".to_string());
    // 直接 spawn bash，并用 process_group(0) 使其成为新进程组组长，
    // 这样 child.id() == pgid，stop_backend 用 killpg(pgid) 即可整组清除后端。
    let child = Command::new("bash")
        .arg("-c")
        .arg(format!(
            "cd \"{dir}\" && exec uv run serve.py >>/tmp/webui-5173.log 2>&1",
            dir = deepfusion_dir
        ))
        .process_group(0)
        .spawn();

    let child = match child {
        Ok(c) => c,
        Err(e) => return Err(format!("启动后端失败: {e}")),
    };

    let pgid = child.id();
    eprintln!("[backend] started serve.py pgid={pgid}");

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(BackendHandle { pgid });
    Ok(pgid)
}

/// 启动后端服务（DeepFusion serve.py）。供前端“启动应用”按钮调用。
#[tauri::command]
fn start_backend(state: tauri::State<BackendState>) -> Result<String, String> {
    match spawn_backend(&state) {
        Ok(_) => Ok("started".to_string()),
        Err(e) if e == "already_running" => Ok("running".to_string()),
        Err(e) => Err(e),
    }
}

/// 停止后端服务：向整个进程组发送 SIGKILL，并清空状态。
#[tauri::command]
fn stop_backend(state: tauri::State<BackendState>) -> Result<String, String> {
    let handle = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.take()
    };
    match handle {
        Some(h) => {
            let pgid = h.pgid as i32;
            eprintln!("[backend] stopping serve.py pgid={pgid}");
            // 杀掉整个进程组（后端可能 fork 出子进程）。
            unsafe {
                libc::killpg(pgid, libc::SIGKILL);
            }
            // 进程组已被 SIGKILL，子进程句柄无需 wait，直接丢弃。
            Ok("stopped".to_string())
        }
        None => Ok("not_running".to_string()),
    }
}

/// 返回后端当前是否在运行。
#[tauri::command]
fn backend_status(state: tauri::State<BackendState>) -> Result<bool, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.is_some())
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
        .unwrap_or_else(|_| "/home/AI/workspace/Mcp Server/DeepFusion".to_string());
    let base = std::path::Path::new(root);
    let full = base.join(&relative);
    let target = if full.is_dir() {
        full.join("SKILL.md")
    } else {
        full
    };
    std::fs::read_to_string(&target)
        .map_err(|e| format!("读取失败 {}: {e}", target.display()))
}
