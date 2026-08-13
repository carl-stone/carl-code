// carl-code Tauri shell — THIN ONLY.
// See main.rs for the full reasoning. The crate holds no product logic.

use std::io::{BufRead, BufReader, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

struct Sidecar {
    stdin: Mutex<ChildStdin>,
}

/// Forward a ClientMessage (JSON string) from the webview to the sidecar.
#[tauri::command]
fn sidecar_send(state: State<'_, Sidecar>, json: String) -> Result<(), String> {
    let mut stdin = state.stdin.lock().map_err(|e| e.to_string())?;
    writeln!(stdin, "{}", json).map_err(|e| e.to_string())
}

/// Launch the sidecar and register the stdio relay at app setup.
fn setup(app: &AppHandle) -> std::io::Result<()> {
    // Monorepo root = three levels up from src-tauri (src-tauri -> gui -> apps -> carl-code).
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .expect("monorepo root must exist")
        .to_path_buf();
    let script = root.join("packages/sidecar/src/index.ts");

    let mut child = Command::new("bun")
        .arg("run")
        .arg(&script)
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()?;

    // Take ownership of both pipes BEFORE moving stdout into the reader thread.
    let stdin = child.stdin.take().expect("sidecar stdin piped");
    let stdout = child.stdout.take().expect("sidecar stdout piped");
    let _ = child; // retained implicitly; not yet used for wait-on-exit.

    app.manage(Sidecar {
        stdin: Mutex::new(stdin),
    });

    // Relay sidecar stdout → webview as `sidecar_recv` events.
    let app = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = match line {
                Ok(line) => line,
                Err(_) => break,
            };
            if !line.trim().is_empty() {
                let _ = app.emit("sidecar_recv", line);
            }
        }
        let _ = app.emit(
            "sidecar_recv",
            r#"{"type":"fatal","error":"sidecar process exited"}"#,
        );
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            setup(app.handle())
                .map_err(|e| Box::<dyn std::error::Error>::from(format!("sidecar spawn failed: {e}")))
        })
        .invoke_handler(tauri::generate_handler![sidecar_send])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}