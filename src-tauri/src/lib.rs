mod db;
mod crypto;
mod archiver;

use db::{Db, ServerConfig, Bookmark};
use crypto::Crypto;
use archiver::ARCHIVER;
use std::sync::Arc;
use anyhow::Result;
use russh::*;
use std::future::Future;
use tauri::{AppHandle, State, Manager, Url};
use tokio::sync::mpsc;
use tauri::Emitter;
use uuid::Uuid;
use std::sync::OnceLock;
use tauri_plugin_clipboard_manager::ClipboardExt;
#[cfg(not(target_os = "android"))]
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use tokio::sync::Mutex as TokioMutex;
use dashmap::DashMap;
use russh_sftp::client::SftpSession;
use tokio::process::{Command as TokioCommand};
use std::process::Stdio;
use tokio::io::{BufReader, AsyncBufReadExt};

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

const AGENT_SCRIPT: &str = r####"
(function() {
  window.TerAgent = {
    extractDOM: function() {
      const selectors = "a, button, input, textarea, [role='button'], [onclick]";
      const elements = document.querySelectorAll(selectors);
      let idCounter = 1;
      let markdown = "### CYBER_DOM_SNAPSHOT\n\n";
      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0") {
          const id = idCounter++;
          el.setAttribute("data-ter-id", id);
          const tag = el.tagName.toLowerCase();
          const text = (el.innerText || el.value || el.placeholder || el.ariaLabel || "").trim().substring(0, 40);
          markdown += "- [" + tag.toUpperCase() + " #" + id + ": " + (text || "NODE") + "]\n";
        }
      });
      return markdown;
    },
    click: function(id) {
      const el = document.querySelector("[data-ter-id='" + id + "']");
      if (el) { el.click(); return "OK"; }
      return "FAIL";
    },
    type: function(id, text) {
      const el = document.querySelector("[data-ter-id='" + id + "']");
      if (el) {
        el.focus();
        el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return "OK";
      }
      return "FAIL";
    }
  };
})();
"####;

// v2.18.0: Multi-Protocol Abstraction Layer
#[async_trait::async_trait]
pub trait GridTransport: Send + Sync {
    async fn open_pty(&self, tab_id: &str, cols: u32, rows: u32) -> Result<Box<dyn GridPtyChannel>, String>;
    async fn list_dir(&self, path: &str) -> Result<RemoteDirContent, String>;
    async fn read_file(&self, path: &str) -> Result<Vec<u8>, String>;
    async fn write_file(&self, path: &str, content: &[u8]) -> Result<(), String>;
    async fn delete_file(&self, path: &str) -> Result<(), String>;
    async fn download_file(&self, remote: &str, local: &str) -> Result<(), String>;
    async fn upload_file(&self, remote: &str, local: &str) -> Result<(), String>;
    async fn list_tmux_sessions(&self) -> Result<Vec<String>, String>;
    async fn kill_tmux_session(&self, id: &str) -> Result<(), String>;
    async fn open_tunnel(&self, remote_port: u16) -> Result<u16, String>;
    fn protocol_name(&self) -> &str;
}

#[async_trait::async_trait]
pub trait GridPtyChannel: Send + Sync {
    async fn write(&self, data: &[u8]) -> Result<(), String>;
    async fn resize(&self, cols: u32, rows: u32) -> Result<(), String>;
    async fn next_msg(&mut self) -> Option<PtyMessage>;
}

pub enum PtyMessage {
    Data(Vec<u8>),
    ExtendedData(Vec<u8>),
    Eof,
    Close,
}

struct SshTransport {
    handle: Arc<client::Handle<Client>>,
}

#[async_trait::async_trait]
impl GridTransport for SshTransport {
    async fn open_pty(&self, tab_id: &str, cols: u32, rows: u32) -> Result<Box<dyn GridPtyChannel>, String> {
        let mut channel = self.handle.channel_open_session().await.map_err(|e| e.to_string())?;
        channel.request_pty(true, "xterm-256color", cols, rows, 0, 0, &[]).await.map_err(|e| e.to_string())?;
        let tmux_cmd = format!("tmux new-session -A -s {0} \\; set-option status off || exec $SHELL || exec /bin/sh", tab_id);
        channel.exec(true, tmux_cmd.as_str()).await.map_err(|e| e.to_string())?;
        Ok(Box::new(SshPtyChannel { channel }))
    }

    async fn list_dir(&self, path: &str) -> Result<RemoteDirContent, String> {
        let channel = self.handle.channel_open_session().await.map_err(|e| e.to_string())?;
        channel.request_subsystem(true, "sftp").await.map_err(|e| e.to_string())?;
        let sftp = SftpSession::new(channel.into_stream()).await.map_err(|e| e.to_string())?;
        let target_path = if path.is_empty() { ".".to_string() } else { path.to_string() };
        let real_path = sftp.canonicalize(&target_path).await.map_err(|e| e.to_string())?;
        let entries = sftp.read_dir(&real_path).await.map_err(|e| e.to_string())?;
        let mut files = Vec::new();
        for entry in entries {
            let name = entry.file_name();
            if name == "." || name == ".." { continue; }
            let is_dir = entry.file_type() == russh_sftp::protocol::FileType::Dir;
            let full_path = if real_path == "/" { format!("/{}", name) } else { format!("{}/{}", real_path, name) };
            files.push(RemoteFile { name: name.to_string(), is_dir, size: entry.metadata().len(), path: full_path });
        }
        files.sort_by(|a, b| if a.is_dir != b.is_dir { b.is_dir.cmp(&a.is_dir) } else { a.name.to_lowercase().cmp(&b.name.to_lowercase()) });
        Ok(RemoteDirContent { files, current_path: real_path })
    }

    async fn read_file(&self, path: &str) -> Result<Vec<u8>, String> {
        let channel = self.handle.channel_open_session().await.map_err(|e| e.to_string())?;
        channel.request_subsystem(true, "sftp").await.map_err(|e| e.to_string())?;
        let sftp = SftpSession::new(channel.into_stream()).await.map_err(|e| e.to_string())?;
        let mut remote_file = sftp.open(path).await.map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        tokio::io::AsyncReadExt::read_to_end(&mut remote_file, &mut buffer).await.map_err(|e| e.to_string())?;
        Ok(buffer)
    }

    async fn write_file(&self, path: &str, content: &[u8]) -> Result<(), String> {
        let channel = self.handle.channel_open_session().await.map_err(|e| e.to_string())?;
        channel.request_subsystem(true, "sftp").await.map_err(|e| e.to_string())?;
        let sftp = SftpSession::new(channel.into_stream()).await.map_err(|e| e.to_string())?;
        let mut remote_file = sftp.create(path).await.map_err(|e| e.to_string())?;
        tokio::io::AsyncWriteExt::write_all(&mut remote_file, content).await.map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn delete_file(&self, path: &str) -> Result<(), String> {
        let channel = self.handle.channel_open_session().await.map_err(|e| e.to_string())?;
        channel.request_subsystem(true, "sftp").await.map_err(|e| e.to_string())?;
        let sftp = SftpSession::new(channel.into_stream()).await.map_err(|e| e.to_string())?;
        sftp.remove_file(path).await.map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn download_file(&self, remote: &str, local: &str) -> Result<(), String> {
        let data = self.read_file(remote).await?;
        tokio::fs::write(local, data).await.map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn upload_file(&self, remote: &str, local: &str) -> Result<(), String> {
        let data = tokio::fs::read(local).await.map_err(|e| e.to_string())?;
        self.write_file(remote, &data).await?;
        Ok(())
    }

    async fn list_tmux_sessions(&self) -> Result<Vec<String>, String> {
        let channel = self.handle.channel_open_session().await.map_err(|e| e.to_string())?;
        let mut data = Vec::new();
        channel.exec(true, "tmux ls -F '#S'").await.map_err(|e| e.to_string())?;
        let mut stream = channel.into_stream();
        tokio::io::AsyncReadExt::read_to_end(&mut stream, &mut data).await.map_err(|e| e.to_string())?;
        let output = String::from_utf8_lossy(&data);
        Ok(output.lines().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
    }

    async fn kill_tmux_session(&self, id: &str) -> Result<(), String> {
        let channel = self.handle.channel_open_session().await.map_err(|e| e.to_string())?;
        let _ = channel.exec(true, format!("tmux kill-session -t {}", id)).await;
        Ok(())
    }

    async fn open_tunnel(&self, remote_port: u16) -> Result<u16, String> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
        let local_port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let handle = self.handle.clone();
        tokio::spawn(async move {
            loop {
                if let Ok((mut socket, _)) = listener.accept().await {
                    let h = handle.clone();
                    tokio::spawn(async move {
                        if let Ok(channel) = h.channel_open_direct_tcpip("127.0.0.1", remote_port as u32, "127.0.0.1", 0).await {
                            let mut stream = channel.into_stream();
                            let _ = tokio::io::copy_bidirectional(&mut socket, &mut stream).await;
                        }
                    });
                } else { break; }
            }
        });
        Ok(local_port)
    }

    fn protocol_name(&self) -> &str { "SSH/TCP" }
}

struct SshPtyChannel {
    channel: russh::Channel<russh::client::Msg>,
}

#[async_trait::async_trait]
impl GridPtyChannel for SshPtyChannel {
    async fn write(&self, data: &[u8]) -> Result<(), String> {
        self.channel.data(data).await.map_err(|e| e.to_string())
    }
    async fn resize(&self, cols: u32, rows: u32) -> Result<(), String> {
        self.channel.window_change(cols, rows, 0, 0).await.map_err(|e| e.to_string())
    }
    async fn next_msg(&mut self) -> Option<PtyMessage> {
        match self.channel.wait().await {
            Some(russh::ChannelMsg::Data { data }) => Some(PtyMessage::Data(data.to_vec())),
            Some(russh::ChannelMsg::ExtendedData { data, .. }) => Some(PtyMessage::ExtendedData(data.to_vec())),
            Some(russh::ChannelMsg::Eof) => Some(PtyMessage::Eof),
            Some(russh::ChannelMsg::Close) | None => Some(PtyMessage::Close),
            _ => None,
        }
    }
}

struct BackendLogger;
impl log::Log for BackendLogger {
    fn enabled(&self, m: &log::Metadata) -> bool { m.level() <= log::Level::Debug }
    fn log(&self, r: &log::Record) {
        if self.enabled(r.metadata()) {
            let target = r.target();
            let args = format!("{}", r.args());
            let blacklist = ["sshbuffer", "seqn", "platform_impl", "event_loop"];
            if blacklist.iter().any(|k| args.contains(k) || target.contains(k)) { return; }
            if args.contains("msg 94") {
                if let Some(app) = APP_HANDLE.get() { let _ = app.emit("net-traffic", ()); }
                let mut display = false;
                if let Some(len_idx) = args.find("len ") {
                    let len_str = &args[len_idx + 4..];
                    let len_val: String = len_str.chars().take_while(|c| c.is_digit(10)).collect();
                    if let Ok(len) = len_val.parse::<usize>() { if len > 1000 { display = true; } }
                }
                if !display { return; }
            }
            let msg = format!("[{}] {}: {}", r.level(), target, args);
            if let Some(app) = APP_HANDLE.get() { let _ = app.emit("backend-log", msg); }
        }
    }
    fn flush(&self) {}
}
static LOGGER: BackendLogger = BackendLogger;

#[derive(Clone)]
struct Client {}
impl client::Handler for Client {
    type Error = anyhow::Error;
    fn check_server_key(&mut self, _: &russh::keys::PublicKey) -> impl Future<Output = Result<bool, Self::Error>> + Send { async { Ok(true) } }
}

enum PtyControl { Resize(u32, u32) }
struct AppState {
    pty_channels: DashMap<String, mpsc::Sender<String>>,
    ctrl_channels: DashMap<String, mpsc::Sender<PtyControl>>,
    transport: TokioMutex<Option<Arc<dyn GridTransport>>>,
    session_stack: TokioMutex<Vec<Arc<client::Handle<Client>>>>,
    agent_token: TokioMutex<String>,
    db: tokio::sync::OnceCell<Db>,
    db_error: TokioMutex<Option<String>>,
    crypto: TokioMutex<Option<Crypto>>,
    model_path: TokioMutex<Option<std::path::PathBuf>>,
    conda_path: TokioMutex<Option<String>>,
    agent_port: Arc<TokioMutex<Option<u16>>>,
    vnc_port: Arc<TokioMutex<Option<u16>>>,
    dynamic_port: Arc<TokioMutex<Option<u16>>>,
    #[allow(dead_code)]
    agent_abort: Arc<TokioMutex<Option<tokio::task::AbortHandle>>>,
    #[allow(dead_code)]
    vnc_abort: Arc<TokioMutex<Option<tokio::task::AbortHandle>>>,
    #[allow(dead_code)]
    dynamic_abort: Arc<TokioMutex<Option<tokio::task::AbortHandle>>>,
    mihomo_child: Arc<TokioMutex<Option<tokio::process::Child>>>,
    current_host: Arc<TokioMutex<Option<String>>>,
}

#[tauri::command]
async fn spawn_mihomo(config_path: String, bin_path: String, tab_id: Option<String>, state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    let mut guard = state.mihomo_child.lock().await;
    if let Some(mut child) = guard.take() { let _ = child.kill().await; let _ = child.wait().await; }
    let mut cmd = TokioCommand::new(bin_path);
    cmd.arg("-f").arg(config_path);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().unwrap();
    let app_clone = app.clone();
    let tab_id_clone = tab_id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let log_msg = format!("\x1b[36m[MIHOMO]\x1b[0m {}\r\n", line);
            if let Some(tid) = &tab_id_clone { let _ = app_clone.emit(&format!("pty-data-{}", tid), log_msg.clone()); }
            let _ = app_clone.emit("backend-log", format!("[PROXY] {}", line));
        }
    });
    *guard = Some(child);
    Ok(())
}

const AD_BLOCK_CSS: &str = "iframe[src*='ads'], [class*='ad-'], [id*='ad-'], .google-ads, #carbonads { display: none !important; }";

#[tauri::command]
async fn create_embedded_webview(label: String, url: String, x: f64, y: f64, width: f64, height: f64, app: AppHandle) -> Result<(), String> {
    let target_url = url.parse::<Url>().map_err(|e| format!("Invalid URL: {}", e))?;
    #[cfg(desktop)]
    if let Some(wv) = app.get_webview_window(&label) {
        let _ = wv.navigate(target_url).map_err(|e: tauri::Error| e.to_string())?;
        let _ = wv.set_position(tauri::LogicalPosition::new(x, y)).map_err(|e: tauri::Error| e.to_string())?;
        let _ = wv.set_size(tauri::LogicalSize::new(width, height)).map_err(|e: tauri::Error| e.to_string())?;
        let _ = wv.show().map_err(|e: tauri::Error| e.to_string())?;
    } else {
        let wv_win = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(target_url))
            .position(x, y).inner_size(width, height).decorations(false).always_on_top(true).build().map_err(|e: tauri::Error| e.to_string())?;
        let _ = wv_win.eval(&format!("const s = document.createElement('style'); s.innerHTML = `{}`; document.head.appendChild(s);", AD_BLOCK_CSS));
    }
    Ok(())
}

#[tauri::command]
async fn set_window_always_on_top(label: String, on_top: bool, app: AppHandle) -> Result<(), String> {
    #[cfg(desktop)] if let Some(win) = app.get_webview_window(&label) { let _ = win.set_always_on_top(on_top); }
    Ok(())
}

#[tauri::command]
async fn open_auth_window(url: String, x: f64, y: f64, width: f64, height: f64, app: AppHandle) -> Result<(), String> {
    create_embedded_webview("auth-gateway".to_string(), url, x, y, width, height, app).await
}

#[tauri::command]
async fn close_auth_window(app: AppHandle) -> Result<(), String> {
    #[cfg(desktop)] if let Some(wv) = app.get_webview_window("auth-gateway") { let _ = wv.close(); }
    Ok(())
}

#[tauri::command]
async fn close_webview(label: String, app: AppHandle) -> Result<(), String> {
    #[cfg(desktop)] if let Some(wv) = app.get_webview_window(&label) { let _ = wv.close(); }
    Ok(())
}

#[tauri::command]
async fn update_webview_bounds(label: String, x: f64, y: f64, width: f64, height: f64, app: AppHandle) -> Result<(), String> {
    #[cfg(desktop)] if let Some(wv) = app.get_webview_window(&label) {
        let _ = wv.set_position(tauri::LogicalPosition::new(x, y)).map_err(|e: tauri::Error| e.to_string())?;
        let _ = wv.set_size(tauri::LogicalSize::new(width, height)).map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn open_reverse_tunnel(remote_port: u16, local_port: u16, _state: State<'_, AppState>) -> Result<(), String> {
    log::info!("Reverse tunnel requested (STUB): Remote:{} -> Local:{}", remote_port, local_port);
    Ok(())
}

#[tauri::command]
async fn close_pty(tab_id: String, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(transport) = state.transport.lock().await.as_ref() { let _ = transport.kill_tmux_session(&tab_id).await; }
    state.pty_channels.remove(&tab_id);
    state.ctrl_channels.remove(&tab_id);
    Ok(())
}

#[tauri::command]
async fn detach_pty(tab_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.pty_channels.remove(&tab_id);
    state.ctrl_channels.remove(&tab_id);
    Ok(())
}

#[tauri::command]
async fn kill_remote_tmux_session(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let transport = state.transport.lock().await.as_ref().ok_or("No active transport")?.clone();
    transport.kill_tmux_session(&id).await
}

#[tauri::command]
async fn get_terminal_logs(tab_id: String, limit: i32, state: State<'_, AppState>) -> Result<Vec<Vec<u8>>, String> { let db = get_db(&state).await?; db.get_logs(&tab_id, limit).await.map_err(|e| e.to_string()) }
#[tauri::command]
async fn get_active_ports(state: State<'_, AppState>) -> Result<serde_json::Value, String> { Ok(serde_json::json!({ "agent": *state.agent_port.lock().await, "vnc": *state.vnc_port.lock().await, "dynamic": *state.dynamic_port.lock().await })) }
#[tauri::command]
async fn set_model_path(path: String, state: State<'_, AppState>) -> Result<(), String> { *state.model_path.lock().await = Some(std::path::PathBuf::from(path)); Ok(()) }
#[tauri::command]
async fn get_model_path(state: State<'_, AppState>) -> Result<Option<String>, String> { Ok(state.model_path.lock().await.as_ref().map(|p| p.to_string_lossy().into_owned())) }
#[tauri::command]
async fn set_conda_path(path: String, state: State<'_, AppState>) -> Result<(), String> { *state.conda_path.lock().await = Some(path); Ok(()) }
#[tauri::command]
async fn get_conda_path(state: State<'_, AppState>) -> Result<Option<String>, String> { Ok(state.conda_path.lock().await.clone()) }

#[tauri::command]
async fn write_remote_file(remote_path: String, content: String, state: State<'_, AppState>) -> Result<(), String> {
    let transport = state.transport.lock().await.as_ref().ok_or("No active transport")?.clone();
    transport.write_file(&remote_path, content.as_bytes()).await
}

#[tauri::command]
async fn dump_to_terminal(tab_id: String, remote_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let is_pdf = remote_path.to_lowercase().ends_with(".pdf");
    let cmd = if is_pdf { format!("pdftotext \"{}\" -", remote_path) } else { format!("cat \"{}\"", remote_path) };
    let final_cmd = if let Some(conda) = &*state.conda_path.lock().await { format!("{} run -n base {}", conda, cmd) } else { cmd };
    if let Some(tx) = state.pty_channels.get(&tab_id) { let _ = tx.send(format!("{}\r", final_cmd)).await; }
    else { return Err("Target terminal tab not found or not a terminal".to_string()); }
    Ok(())
}

#[tauri::command]
async fn check_master_password_set(state: State<'_, AppState>) -> Result<bool, String> { Ok(state.crypto.lock().await.is_some()) }
#[tauri::command]
async fn set_master_password(password: String, state: State<'_, AppState>) -> Result<(), String> {
    let crypto = tokio::task::spawn_blocking(move || Crypto::new(&password)).await.map_err(|e| e.to_string())?;
    *state.crypto.lock().await = Some(crypto); Ok(())
}
async fn get_db(state: &State<'_, AppState>) -> Result<Db, String> { if let Some(db) = state.db.get() { Ok(db.clone()) } else { match &*state.db_error.lock().await { Some(e) => Err(e.clone()), None => Err("DB not init".to_string()) } } }
#[tauri::command]
async fn save_server_config(mut config: ServerConfig, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(pass) = config.password_enc.as_ref() {
        if let Some(c) = state.crypto.lock().await.as_ref() { config.password_enc = Some(c.encrypt(pass)); }
        else { return Err("No crypto".to_string()); }
    }
    let db = get_db(&state).await?; db.save_server(&config).await.map_err(|e| e.to_string())
}
#[tauri::command]
async fn list_server_configs(state: State<'_, AppState>) -> Result<Vec<ServerConfig>, String> { let db = get_db(&state).await?; db.list_servers().await.map_err(|e| e.to_string()) }
#[tauri::command]
async fn delete_server_config(id: String, state: State<'_, AppState>) -> Result<(), String> { let db = get_db(&state).await?; db.delete_server(&id).await.map_err(|e| e.to_string()) }
#[tauri::command]
async fn list_bookmarks(host_id: String, state: State<'_, AppState>) -> Result<Vec<Bookmark>, String> { let db = get_db(&state).await?; db.list_bookmarks(&host_id).await.map_err(|e| e.to_string()) }
#[tauri::command]
async fn save_bookmark(bookmark: Bookmark, state: State<'_, AppState>) -> Result<(), String> { let db = get_db(&state).await?; db.save_bookmark(&bookmark).await.map_err(|e| e.to_string()) }
#[tauri::command]
async fn delete_bookmark(id: String, state: State<'_, AppState>) -> Result<(), String> { let db = get_db(&state).await?; db.delete_bookmark(&id).await.map_err(|e| e.to_string()) }
#[tauri::command]
async fn save_ui_preference(key: String, value: String, state: State<'_, AppState>) -> Result<(), String> { let db = get_db(&state).await?; db.save_ui_preference(&key, &value).await.map_err(|e| e.to_string()) }
#[tauri::command]
async fn list_ui_preferences(state: State<'_, AppState>) -> Result<std::collections::HashMap<String, String>, String> { let db = get_db(&state).await?; let prefs = db.list_ui_preferences().await.map_err(|e| e.to_string())?; Ok(prefs.into_iter().collect()) }

#[tauri::command]
async fn get_device_fingerprint() -> Result<serde_json::Value, String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    Ok(serde_json::json!({ "os": os, "arch": arch, "is_mobile": os == "android" || os == "ios" }))
}

#[tauri::command]
async fn navigate_cyber_webview(label: String, url: String, app_handle: AppHandle) -> Result<(), String> {
    if let Some(wv) = app_handle.get_webview_window(&label) {
        let url_parsed = url.parse::<Url>().map_err(|e| format!("{}", e))?;
        let _ = wv.navigate(url_parsed).map_err(|e: tauri::Error| e.to_string())?;
        let _ = wv.eval(AGENT_SCRIPT).map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn reload_cyber_webview(label: String, app_handle: AppHandle) -> Result<(), String> {
    if let Some(wv) = app_handle.get_webview_window(&label) {
        let _ = wv.eval("window.location.reload()").map_err(|e: tauri::Error| e.to_string())?;
        let _ = wv.eval(AGENT_SCRIPT).map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn extract_cyber_dom(label: String, app_handle: AppHandle) -> Result<(), String> {
    if let Some(wv) = app_handle.get_webview_window(&label) {
        let _ = wv.eval("window.emit('dom-extracted', window.TerAgent.extractDOM())").map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn eval_cyber_webview(label: String, code: String, app_handle: AppHandle) -> Result<(), String> {
    if let Some(wv) = app_handle.get_webview_window(&label) { let _ = wv.eval(&code).map_err(|e: tauri::Error| e.to_string())?; }
    Ok(())
}

#[tauri::command]
async fn copy_latest_to_clipboard(tab_id: String, app: AppHandle) -> Result<(), String> {
    let text = ARCHIVER.get_latest(&tab_id)?; app.clipboard().write_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_latest_ai_response(tab_id: String) -> Result<String, String> { ARCHIVER.get_latest(&tab_id) }

#[tauri::command]
async fn get_connection_chain(id: String, state: State<'_, AppState>) -> Result<Vec<ServerConfig>, String> {
    let db = get_db(&state).await?;
    let servers = db.list_servers().await.map_err(|e| e.to_string())?;
    let mut chain: Vec<ServerConfig> = Vec::new();
    let mut current_id = Some(id);
    while let Some(sid) = current_id {
        if let Some(config) = servers.iter().find(|s| s.id == sid) { chain.push(config.clone()); current_id = config.proxy_id.clone().filter(|id| !id.is_empty()); }
        else { break; }
    }
    chain.reverse(); Ok(chain)
}

#[tauri::command]
async fn read_local_file(path: String) -> Result<String, String> { std::fs::read_to_string(path).map_err(|e| e.to_string()) }
#[tauri::command]
async fn list_vault() -> Result<Vec<serde_json::Value>, String> { ARCHIVER.list_vault() }

#[cfg(target_os = "android")]
#[tauri::command]
async fn spawn_local_pty(_tab_id: String, _app_handle: AppHandle, _state: State<'_, AppState>) -> Result<(), String> { Err("Local PTY not supported on Android.".to_string()) }

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn spawn_local_pty(tab_id: String, app_handle: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 }).map_err(|e: anyhow::Error| e.to_string())?;
    #[cfg(target_os = "windows")] let shell = "powershell.exe";
    #[cfg(not(target_os = "windows"))] let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let cmd = CommandBuilder::new(&shell);
    let _child = pair.slave.spawn_command(cmd).map_err(|e: anyhow::Error| e.to_string())?;
    let reader = pair.master.try_clone_reader().map_err(|e: anyhow::Error| e.to_string())?;
    let mut writer = pair.master.take_writer().map_err(|e: anyhow::Error| e.to_string())?;
    let (tx, mut rx) = mpsc::channel::<String>(100);
    let (ctrl_tx, mut ctrl_rx) = mpsc::channel::<PtyControl>(10);
    state.pty_channels.insert(tab_id.clone(), tx); state.ctrl_channels.insert(tab_id.clone(), ctrl_tx);
    let tab_id_cap = tab_id.clone(); let app_handle_cap = app_handle.clone(); let master = pair.master;
    std::thread::spawn(move || {
        let mut reader = reader; let mut buffer = [0u8; 8192];
        loop { match reader.read(&mut buffer) { Ok(0) => break, Ok(n) => { let data = buffer[..n].to_vec(); if data.windows(10).any(|w| w == b"[GR_AUTH]") { let _ = app_handle_cap.emit("auth-trigger", ()); } let _ = app_handle_cap.emit("pty-data", serde_json::json!({"id": tab_id_cap, "data": data})); } Err(_) => break } }
    });
    tauri::async_runtime::spawn(async move {
        loop { tokio::select! { Some(ctrl) = ctrl_rx.recv() => { let PtyControl::Resize(c, r) = ctrl; let _ = master.resize(PtySize { rows: r as u16, cols: c as u16, pixel_width: 0, pixel_height: 0 }); } Some(data) = rx.recv() => { let _ = writer.write_all(data.as_bytes()); let _ = writer.flush(); } else => break } }
    });
    Ok(())
}

#[tauri::command]
async fn spawn_new_pty(tab_id: String, app_handle: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let transport = state.transport.lock().await.as_ref().ok_or("No active transport")?.clone();
    let mut pty_channel = transport.open_pty(&tab_id, 80, 24).await?;
    let (tx, mut rx) = mpsc::channel::<String>(100);
    let (ctrl_tx, mut ctrl_rx) = mpsc::channel::<PtyControl>(10);
    state.pty_channels.insert(tab_id.clone(), tx); state.ctrl_channels.insert(tab_id.clone(), ctrl_tx);
    let tab_id_cap = tab_id.clone(); let pty_channels = state.pty_channels.clone(); let ctrl_channels = state.ctrl_channels.clone();
    tauri::async_runtime::spawn(async move {
        log::info!("[PTY:{}] Starting abstract PTY read loop", tab_id_cap);
        let mut capture_active = false; let mut last_capture_time = std::time::Instant::now();
        let mut aggregation_buffer = Vec::new(); let mut interval = tokio::time::interval(std::time::Duration::from_millis(16));
        loop {
            tokio::select! {
                _ = interval.tick() => { if !aggregation_buffer.is_empty() { let _ = app_handle.emit("pty-data", serde_json::json!({"id": tab_id_cap, "data": aggregation_buffer.clone()})); aggregation_buffer.clear(); } }
                Some(ctrl) = ctrl_rx.recv() => { let PtyControl::Resize(c, r) = ctrl; let _ = pty_channel.resize(c, r).await; }
                Some(data) = rx.recv() => { let _ = pty_channel.write(data.as_bytes()).await; }
                msg = pty_channel.next_msg() => {
                    match msg {
                        Some(PtyMessage::Data(data)) | Some(PtyMessage::ExtendedData(data)) => {
                            if data.windows(10).any(|w| w == b"[GR_AUTH]") { let _ = app_handle.emit("auth-trigger", ()); }
                            if ARCHIVER.is_semantic_start(&data) { capture_active = true; ARCHIVER.clear_latest(&tab_id_cap); last_capture_time = std::time::Instant::now(); }
                            if capture_active { ARCHIVER.archive(&tab_id_cap, &data); last_capture_time = std::time::Instant::now(); if ARCHIVER.is_prompt(&data) { capture_active = false; } }
                            aggregation_buffer.extend_from_slice(&data); if aggregation_buffer.len() >= 512 { let _ = app_handle.emit("pty-data", serde_json::json!({"id": tab_id_cap, "data": aggregation_buffer.clone()})); aggregation_buffer.clear(); }
                        }
                        Some(PtyMessage::Eof) | Some(PtyMessage::Close) | None => {
                            log::warn!("[PTY:{}] Channel closed", tab_id_cap); pty_channels.remove(&tab_id_cap); ctrl_channels.remove(&tab_id_cap);
                            let _ = app_handle.emit("pty-data", serde_json::json!({"id": tab_id_cap, "data": "\r\n\x1b[90m[Process Completed]\x1b[0m\r\n"})); break;
                        }
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => { if capture_active && last_capture_time.elapsed().as_secs() > 10 { capture_active = false; } }
            }
        }
    });
    Ok(())
}

#[tauri::command]
async fn write_pty(tab_id: String, data: String, state: State<'_, AppState>) -> Result<(), String> { if let Some(tx) = state.pty_channels.get(&tab_id) { let _ = tx.send(data).await; } Ok(()) }
#[tauri::command]
async fn resize_pty(tab_id: String, cols: u32, rows: u32, state: State<'_, AppState>) -> Result<(), String> { if let Some(tx) = state.ctrl_channels.get(&tab_id) { let _ = tx.send(PtyControl::Resize(cols, rows)).await; } Ok(()) }
#[tauri::command]
async fn get_agent_token(state: State<'_, AppState>) -> Result<String, String> { Ok(state.agent_token.lock().await.clone()) }

#[tauri::command]
async fn ls_remote(path: String, state: State<'_, AppState>) -> Result<RemoteDirContent, String> {
    let transport = state.transport.lock().await.as_ref().ok_or("No active transport")?.clone();
    transport.list_dir(&path).await
}

#[tauri::command]
async fn open_dynamic_tunnel(remote_port: u16, state: State<'_, AppState>) -> Result<u16, String> {
    let transport = state.transport.lock().await.as_ref().ok_or("No active transport")?.clone();
    transport.open_tunnel(remote_port).await
}

#[tauri::command]
async fn list_remote_tmux_sessions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let transport = state.transport.lock().await.as_ref().ok_or("No active transport")?.clone();
    transport.list_tmux_sessions().await
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct ContextRequirement { require_screenshot: Option<bool> }
#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct Skill { id: String, name: String, description: String, icon: Option<String>, rpc: Option<String>, trigger: Option<String>, context_requirement: Option<ContextRequirement> }
#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct SkillManifest { skills: Vec<Skill> }

#[tauri::command]
async fn load_remote_skills(state: State<'_, AppState>) -> Result<Vec<Skill>, String> {
    let transport = state.transport.lock().await.as_ref().ok_or("No active transport")?.clone();
    match transport.read_file(".ter/skills.json").await {
        Ok(content) => {
            if let Ok(m) = serde_json::from_slice::<SkillManifest>(&content) { Ok(m.skills) }
            else if let Ok(s) = serde_json::from_slice::<Vec<Skill>>(&content) { Ok(s) }
            else { Err("Parse fail".to_string()) }
        }
        Err(_) => Ok(Vec::new())
    }
}

#[tauri::command]
async fn download_file(remote_path: String, local_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let transport = state.transport.lock().await.as_ref().ok_or("No active transport")?.clone();
    transport.download_file(&remote_path, &local_path).await
}

#[tauri::command]
async fn upload_file(remote_path: String, local_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let transport = state.transport.lock().await.as_ref().ok_or("No active transport")?.clone();
    transport.upload_file(&remote_path, &local_path).await
}

#[tauri::command]
async fn delete_remote_file(remote_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let transport = state.transport.lock().await.as_ref().ok_or("No active transport")?.clone();
    transport.delete_file(&remote_path).await
}

#[tauri::command]
async fn read_remote_file(remote_path: String, state: State<'_, AppState>) -> Result<String, String> {
    let transport = state.transport.lock().await.as_ref().ok_or("No active transport")?.clone();
    let content = transport.read_file(&remote_path).await?;
    Ok(String::from_utf8_lossy(&content).to_string())
}

async fn connect_to_server(config: &ServerConfig, servers: &[ServerConfig], crypto: &Option<Crypto>, app: &AppHandle) -> Result<Vec<Arc<client::Handle<Client>>>, String> {
    let mut pass = String::new();
    if let Some(enc) = &config.password_enc { if let Some(c) = crypto.as_ref() { pass = c.decrypt(enc).ok_or("Decrypt failed")?; } }
    let mut stack = Vec::new();
    if let Some(proxy_id) = &config.proxy_id {
        if !proxy_id.is_empty() {
            let proxy_config = servers.iter().find(|s| &s.id == proxy_id).ok_or("Proxy not found")?;
            stack = Box::pin(connect_to_server(proxy_config, servers, crypto, app)).await?;
            let proxy_handle = stack.last().ok_or("Proxy stack empty")?.clone();
            if let Some(script) = &proxy_config.pre_connect_script {
                if !script.is_empty() {
                    let _ = app.emit("conn-status", format!("[STEP] Running script on {}: {}", proxy_config.label, script));
                    let channel = proxy_handle.channel_open_session().await.map_err(|e| e.to_string())?;
                    channel.exec(true, script.as_str()).await.map_err(|e| e.to_string())?;
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            }
            let channel = proxy_handle.channel_open_direct_tcpip(&config.host, config.port as u32, "127.0.0.1", 0).await.map_err(|e| e.to_string())?;
            let russh_config = Arc::new(client::Config::default());
            let mut sess = client::connect_stream(russh_config, channel.into_stream(), Client {}).await.map_err(|e| e.to_string())?;
            let auth = sess.authenticate_password(&config.user, pass).await.map_err(|e| e.to_string())?;
            if !matches!(auth, russh::client::AuthResult::Success) { return Err("Auth fail on target".to_string()); }
            stack.push(Arc::new(sess)); return Ok(stack);
        }
    }
    let russh_config = Arc::new(client::Config::default());
    let _ = app.emit("conn-status", format!("[STEP] Connecting to {}...", config.host));
    use tokio::net::TcpStream;
    let tcp_stream = tokio::time::timeout(std::time::Duration::from_secs(5), TcpStream::connect((config.host.as_str(), config.port as u16))).await.map_err(|_| format!("TCP connection to {}:{} timed out", config.host, config.port))?.map_err(|e| e.to_string())?;
    let mut sess = tokio::time::timeout(std::time::Duration::from_secs(15), client::connect_stream(russh_config, tcp_stream, Client {})).await.map_err(|_| "SSH handshake timed out".to_string())?.map_err(|e| e.to_string())?;
    let auth = sess.authenticate_password(&config.user, pass).await.map_err(|e| e.to_string())?;
    if !matches!(auth, russh::client::AuthResult::Success) { return Err("Auth fail".to_string()); }
    stack.push(Arc::new(sess)); Ok(stack)
}

#[tauri::command]
async fn connect_with_id(id: String, app_handle: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let db = get_db(&state).await?;
    let servers = db.list_servers().await.map_err(|e| e.to_string())?;
    let config = servers.iter().find(|c| c.id == id).ok_or("Not found")?;
    let crypto = state.crypto.lock().await;
    let _ = app_handle.emit("conn-status", "[START] Orchestrating multi-layer connection...");
    let stack = connect_to_server(config, &servers, &*crypto, &app_handle).await?;
    let mut stack_guard = state.session_stack.lock().await; *stack_guard = stack;
    let final_session = stack_guard.last().unwrap().clone();
    let transport = Arc::new(SshTransport { handle: final_session.clone() });
    *state.transport.lock().await = Some(transport as Arc<dyn GridTransport>);
    *state.current_host.lock().await = Some(config.host.clone());
    let _ = app_handle.emit("conn-status", "[FINISH] Connection established.");
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
struct RemoteFile { name: String, is_dir: bool, size: u64, path: String }
#[derive(serde::Serialize, serde::Deserialize)]
struct RemoteDirContent { files: Vec<RemoteFile>, current_path: String }
#[derive(serde::Deserialize, Debug)]
struct TailscalePeer {
    #[serde(rename = "TailscaleIPs", alias = "IPs")] ips: Vec<String>,
    #[serde(rename = "Relay", alias = "PeerRelay")] relay: Option<String>,
    #[serde(rename = "HostName")] host_name: Option<String>,
    #[serde(rename = "DNSName")] dns_name: Option<String>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = log::set_logger(&LOGGER); log::set_max_level(log::LevelFilter::Debug);
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState {
            pty_channels: DashMap::new(), ctrl_channels: DashMap::new(), transport: TokioMutex::new(None),
            session_stack: TokioMutex::new(Vec::new()), agent_token: TokioMutex::new(Uuid::new_v4().to_string()),
            db: tokio::sync::OnceCell::new(), db_error: TokioMutex::new(None), crypto: TokioMutex::new(None),
            model_path: TokioMutex::new(None), conda_path: TokioMutex::new(None),
            agent_port: Arc::new(TokioMutex::new(None)), vnc_port: Arc::new(TokioMutex::new(None)),
            dynamic_port: Arc::new(TokioMutex::new(None)), agent_abort: Arc::new(TokioMutex::new(None)),
            vnc_abort: Arc::new(TokioMutex::new(None)), dynamic_abort: Arc::new(TokioMutex::new(None)),
            mihomo_child: Arc::new(TokioMutex::new(None)), current_host: Arc::new(TokioMutex::new(None)),
        })
        .setup(|app| {
            let ah = app.handle().clone(); let _ = APP_HANDLE.set(ah.clone());
            let app_dir = match app.path().app_data_dir() { Ok(dir) => dir, Err(_) => std::path::PathBuf::from("/tmp/.gridrunner") };
            if !app_dir.exists() { let _ = std::fs::create_dir_all(&app_dir); }
            let db_url = format!("sqlite:///{}?mode=rwc", app_dir.join("gridrunner.db").to_string_lossy());
            let state = app.state::<AppState>();
            let ah_conn = ah.clone(); let host_mutex = state.current_host.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(8)).await;
                    let current_host = host_mutex.lock().await.clone();
                    if let Some(host) = current_host {
                        let mut protocol = "SSH/TCP".to_string(); let mut relay_node = None; let mut is_direct = false;
                        if let Ok(output) = TokioCommand::new("tailscale").arg("status").arg("--json").output().await {
                            if output.status.success() {
                                if let Ok(status) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
                                    if let Some(peers) = status.get("Peer").and_then(|p| p.as_object()) {
                                        for (_, peer_val) in peers {
                                            let peer: TailscalePeer = match serde_json::from_value(peer_val.clone()) { Ok(p) => p, Err(_) => continue };
                                            let host_l = host.to_lowercase();
                                            let matches_host = peer.ips.iter().any(|ip| ip.to_lowercase() == host_l) || 
                                                             peer.host_name.as_ref().map(|h| h.to_lowercase() == host_l).unwrap_or(false) ||
                                                             peer.dns_name.as_ref().map(|d| d.to_lowercase().contains(&host_l)).unwrap_or(false);
                                            if matches_host {
                                                if let Some(r) = peer.relay { if !r.is_empty() { protocol = "TCP/Relay".to_string(); relay_node = Some(r); } else { protocol = "UDP/Direct".to_string(); is_direct = true; } }
                                                else { protocol = "UDP/Direct".to_string(); is_direct = true; }
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        let _ = ah_conn.emit("connection-metrics", serde_json::json!({ "host": host, "protocol": protocol, "relay": relay_node, "is_direct": is_direct, "latency": 0, "timestamp": chrono::Utc::now().to_rfc3339() }));
                    }
                }
            });
            let ah_telemetry = ah.clone();
            tauri::async_runtime::spawn(async move { 
                use sysinfo::{System, Networks}; let mut sys = System::new_all(); let mut networks = Networks::new_with_refreshed_list();
                let mut prev_net_recv = 0; let mut prev_net_sent = 0;
                loop { 
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await; 
                    sys.refresh_cpu_all(); sys.refresh_memory(); networks.refresh(false);
                    let mut total_recv = 0; let mut total_sent = 0;
                    for (_, data) in &networks { total_recv += data.received(); total_sent += data.transmitted(); }
                    let net_recv_speed = if prev_net_recv > 0 { (total_recv.saturating_sub(prev_net_recv)) / 3 } else { 0 };
                    let net_sent_speed = if prev_net_sent > 0 { (total_sent.saturating_sub(prev_net_sent)) / 3 } else { 0 };
                    prev_net_recv = total_recv; prev_net_sent = total_sent;
                    let _ = ah_telemetry.emit("system-stats", serde_json::json!({ "cpu_usage": sys.global_cpu_usage(), "mem_used": sys.used_memory(), "mem_total": sys.total_memory(), "net_sent": net_sent_speed, "net_recv": net_recv_speed, "uptime": sysinfo::System::uptime(), "is_heartbeat": true })); 
                } 
            });
            tauri::async_runtime::block_on(async move { 
                let db_init = tokio::time::timeout(std::time::Duration::from_secs(5), Db::new(&db_url)).await;
                match db_init { Ok(Ok(db)) => { let _ = state.db.set(db); } Ok(Err(e)) => { *state.db_error.lock().await = Some(e.to_string()); } Err(_) => { *state.db_error.lock().await = Some("Database initialization timed out".to_string()); } }
            }); Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_master_password, check_master_password_set, list_server_configs, delete_server_config, connect_with_id,
            spawn_new_pty, spawn_local_pty, write_pty, close_pty, detach_pty, resize_pty, get_terminal_logs, get_active_ports,
            get_agent_token, open_dynamic_tunnel, ls_remote, load_remote_skills,
            navigate_cyber_webview, reload_cyber_webview, extract_cyber_dom, eval_cyber_webview,
            save_server_config, set_model_path, get_model_path, set_conda_path, get_conda_path,
            download_file, upload_file, delete_remote_file, read_remote_file, write_remote_file, dump_to_terminal,
            get_latest_ai_response, list_vault, read_local_file, get_connection_chain,
            spawn_mihomo, open_auth_window, close_auth_window, close_webview, update_webview_bounds, create_embedded_webview, set_window_always_on_top, open_reverse_tunnel,
            copy_latest_to_clipboard, list_remote_tmux_sessions, kill_remote_tmux_session,
            list_bookmarks, save_bookmark, delete_bookmark, save_ui_preference, list_ui_preferences, get_device_fingerprint
        ]);
    let app = builder.build(tauri::generate_context!()).expect("error");
    app.run(|app_handle, event| match event {
        tauri::RunEvent::Exit => { let state = app_handle.state::<AppState>(); if let Ok(mut guard) = state.mihomo_child.try_lock() { if let Some(mut child) = guard.take() { let _ = child.start_kill(); } } state.pty_channels.clear(); state.ctrl_channels.clear(); }
        tauri::RunEvent::WindowEvent { label, event, .. } => { if label == "main" && matches!(event, tauri::WindowEvent::CloseRequested { .. }) { std::process::exit(0); } }
        _ => {}
    });
}
