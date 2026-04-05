use crate::mobile_session::{self, SubmitMobileInboxEntryRequest};
use crate::mobile_state::{ActiveMobileSession, MobileServerHandle, MobileSessionStore};
use serde_json::json;
use std::net::{TcpListener, UdpSocket};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

fn cors_header() -> Header {
    Header::from_bytes(b"Access-Control-Allow-Origin", b"*")
        .expect("valid Access-Control-Allow-Origin header")
}

fn cors_methods_header() -> Header {
    Header::from_bytes(b"Access-Control-Allow-Methods", b"GET, POST, OPTIONS")
        .expect("valid Access-Control-Allow-Methods header")
}

fn cors_request_headers_header() -> Header {
    Header::from_bytes(b"Access-Control-Allow-Headers", b"Content-Type, Accept")
        .expect("valid Access-Control-Allow-Headers header")
}

fn json_header() -> Header {
    Header::from_bytes(b"Content-Type", b"application/json; charset=utf-8")
        .expect("valid Content-Type header")
}

fn html_header() -> Header {
    Header::from_bytes(b"Content-Type", b"text/html; charset=utf-8")
        .expect("valid Content-Type header")
}

fn resolve_lan_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("8.8.8.8:80")?;
            socket.local_addr()
        })
        .map(|address| address.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn bind_server() -> Result<(Server, u16), String> {
    for port in 4174..=4184 {
        if let Ok(listener) = TcpListener::bind(("0.0.0.0", port)) {
            let server = Server::from_listener(listener, None)
                .map_err(|error| format!("Could not start mobile session server: {}", error))?;
            return Ok((server, port));
        }
    }

    let listener = TcpListener::bind(("0.0.0.0", 0))
        .map_err(|error| format!("Could not bind an ephemeral mobile session port: {}", error))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Could not read the mobile session port: {}", error))?
        .port();
    let server = Server::from_listener(listener, None)
        .map_err(|error| format!("Could not start mobile session server: {}", error))?;
    Ok((server, port))
}

fn now_millis() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|error| format!("Could not resolve current timestamp: {}", error))
}

fn session_snapshot(
    current_state: &Arc<Mutex<Option<ActiveMobileSession>>>,
) -> Result<Option<ActiveMobileSession>, String> {
    current_state
        .lock()
        .map_err(|_| "Mobile session state is unavailable right now.".to_string())
        .map(|guard| guard.clone())
}

fn is_pairing_token_valid(session: &ActiveMobileSession, token: &str) -> bool {
    if session.pairing.token != token {
        return false;
    }

    session
        .pairing
        .expires_at
        .parse::<u128>()
        .ok()
        .zip(now_millis().ok())
        .map(|(expires_at, now)| now <= expires_at)
        .unwrap_or(false)
}

fn parse_token(request: &Request) -> Option<String> {
    parse_query_param(request, "token")
}

fn decode_url_component(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut result = String::with_capacity(value.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                result.push(' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let hex = &value[index + 1..index + 3];
                if let Ok(decoded) = u8::from_str_radix(hex, 16) {
                    result.push(decoded as char);
                    index += 3;
                } else {
                    result.push('%');
                    index += 1;
                }
            }
            next => {
                result.push(next as char);
                index += 1;
            }
        }
    }

    result
}

fn parse_query_param(request: &Request, key: &str) -> Option<String> {
    let url = request.url();
    let query = url.split_once('?')?.1;
    for segment in query.split('&') {
        let (segment_key, value) = segment.split_once('=')?;
        if segment_key == key {
            return Some(decode_url_component(value));
        }
    }
    None
}

fn respond_json(request: Request, status_code: StatusCode, payload: serde_json::Value) {
    let response = Response::from_string(payload.to_string())
        .with_status_code(status_code)
        .with_header(json_header())
        .with_header(cors_header())
        .with_header(cors_methods_header())
        .with_header(cors_request_headers_header());
    let _ = request.respond(response);
}

fn respond_html(request: Request, status_code: StatusCode, html: String) {
    let response = Response::from_string(html)
        .with_status_code(status_code)
        .with_header(html_header())
        .with_header(cors_header())
        .with_header(cors_methods_header())
        .with_header(cors_request_headers_header());
    let _ = request.respond(response);
}

fn read_request_json<TValue: serde::de::DeserializeOwned>(request: &mut Request) -> Result<TValue, String> {
    let mut body = String::new();
    request
        .as_reader()
        .read_to_string(&mut body)
        .map_err(|error| format!("Could not read the mobile request body: {}", error))?;

    serde_json::from_str(&body).map_err(|error| format!("Could not parse the mobile request body: {}", error))
}

fn pairing_redirect_html(pairing_token: &str, local_url: &str) -> String {
    format!(
        r##"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Technica Mobile Pairing</title>
    <style>
      body {{
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(180deg, #101b1f 0%, #0a1114 100%);
        color: #e8eced;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }}
      .card {{
        width: min(92vw, 420px);
        padding: 24px;
        border-radius: 20px;
        background: rgba(8, 17, 20, 0.9);
        border: 1px solid rgba(118, 150, 155, 0.22);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
      }}
      h1 {{
        margin: 0 0 12px;
        font-size: 1.35rem;
      }}
      p {{
        margin: 0 0 14px;
        color: #a8b7bb;
      }}
      a {{
        color: #9aeedb;
        word-break: break-word;
      }}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Opening Technica Mobile</h1>
      <p>If you are not redirected automatically, open the mobile shell link below.</p>
      <p><a id="mobile-link" href="#">Open mobile shell</a></p>
    </div>
    <script>
      const appUrl = new URL(`${{window.location.protocol}}//${{window.location.hostname}}:1430/`);
      appUrl.searchParams.set("mode", "mobile");
      appUrl.searchParams.set("pairingToken", "{pairing_token}");
      appUrl.searchParams.set("sessionOrigin", "{local_url}");
      document.getElementById("mobile-link").href = appUrl.toString();
      window.location.replace(appUrl.toString());
    </script>
  </body>
</html>"##
    )
}

fn handle_request(mut request: Request, store: &MobileSessionStore) {
    if request.method() == &Method::Options {
        let response = Response::empty(StatusCode(204))
            .with_header(cors_header())
            .with_header(cors_methods_header())
            .with_header(cors_request_headers_header());
        let _ = request.respond(response);
        return;
    }

    let url = request.url().to_string();

    if request.method() == &Method::Get && url == "/health" {
        respond_json(request, StatusCode(200), json!({ "ok": true }));
        return;
    }

    let session = match session_snapshot(&store.current) {
        Ok(Some(session)) => session,
        Ok(None) => {
            respond_json(
                request,
                StatusCode(503),
                json!({ "error": "No active mobile session is running." }),
            );
            return;
        }
        Err(error) => {
            respond_json(request, StatusCode(500), json!({ "error": error }));
            return;
        }
    };

    if request.method() == &Method::Get && url.starts_with("/pair/") {
        let token = url.trim_start_matches("/pair/").split('?').next().unwrap_or_default();
        if !is_pairing_token_valid(&session, token) {
            respond_html(
                request,
                StatusCode(401),
                "<!doctype html><html><body><p>Invalid or expired Technica pairing token.</p></body></html>"
                    .to_string(),
            );
            return;
        }

        let local_url = session.local_url.clone().unwrap_or_default();
        respond_html(request, StatusCode(200), pairing_redirect_html(token, &local_url));
        return;
    }

    if request.method() == &Method::Get && url.starts_with("/api/pair/") {
        let token = url.trim_start_matches("/api/pair/").split('?').next().unwrap_or_default();
        if !is_pairing_token_valid(&session, token) {
            respond_json(request, StatusCode(401), json!({ "error": "Invalid or expired pairing token." }));
            return;
        }

        if let (Some(device_id), Some(device_label), Some(device_type)) = (
            parse_query_param(&request, "deviceId"),
            parse_query_param(&request, "deviceLabel"),
            parse_query_param(&request, "deviceType"),
        ) {
            let _ = mobile_session::register_device(store, &device_id, &device_label, &device_type);
        }

        respond_json(
            request,
            StatusCode(200),
            json!({
                "paired": true,
                "session": session.to_summary()
            }),
        );
        return;
    }

    if request.method() == &Method::Get && url.starts_with("/session/status") {
        let Some(token) = parse_token(&request) else {
            respond_json(request, StatusCode(401), json!({ "error": "Missing pairing token." }));
            return;
        };

        if !is_pairing_token_valid(&session, &token) {
            respond_json(request, StatusCode(401), json!({ "error": "Invalid or expired pairing token." }));
            return;
        }

        respond_json(
            request,
            StatusCode(200),
            json!({
                "session": session.to_summary()
            }),
        );
        return;
    }

    if request.method() == &Method::Post && url.starts_with("/api/inbox/submit") {
        let Some(token) = parse_token(&request) else {
            respond_json(request, StatusCode(401), json!({ "error": "Missing pairing token." }));
            return;
        };

        if !is_pairing_token_valid(&session, &token) {
            respond_json(request, StatusCode(401), json!({ "error": "Invalid or expired pairing token." }));
            return;
        }

        let request_body = match read_request_json::<SubmitMobileInboxEntryRequest>(&mut request) {
            Ok(request_body) => request_body,
            Err(error) => {
                respond_json(request, StatusCode(400), json!({ "error": error }));
                return;
            }
        };

        match mobile_session::submit_inbox_entry(store, request_body) {
            Ok(send_result) => {
                respond_json(request, StatusCode(200), json!(send_result));
            }
            Err(error) => {
                respond_json(request, StatusCode(500), json!({ "error": error }));
            }
        }
        return;
    }

    if request.method() == &Method::Get && (url == "/api/database/list" || url.starts_with("/api/database/list?")) {
        let Some(token) = parse_token(&request) else {
            respond_json(request, StatusCode(401), json!({ "error": "Missing pairing token." }));
            return;
        };
        let Some(content_type) = parse_query_param(&request, "contentType") else {
            respond_json(request, StatusCode(400), json!({ "error": "Missing contentType." }));
            return;
        };

        if !is_pairing_token_valid(&session, &token) {
            respond_json(request, StatusCode(401), json!({ "error": "Invalid or expired pairing token." }));
            return;
        }

        let repo_path = match crate::discover_chaos_core_repo_path() {
            Ok(Some(repo_path)) => repo_path,
            Ok(None) => {
                respond_json(
                    request,
                    StatusCode(404),
                    json!({ "error": "Could not locate a Chaos Core repo from the desktop session." }),
                );
                return;
            }
            Err(error) => {
                respond_json(request, StatusCode(500), json!({ "error": error }));
                return;
            }
        };

        match crate::list_chaos_core_database_entries(repo_path.clone(), content_type, false) {
            Ok(entries) => {
                respond_json(request, StatusCode(200), json!({ "repoPath": repo_path, "entries": entries }));
            }
            Err(error) => {
                respond_json(request, StatusCode(500), json!({ "error": error }));
            }
        }
        return;
    }

    if request.method() == &Method::Get && url.starts_with("/api/database/list-all") {
        let Some(token) = parse_token(&request) else {
            respond_json(request, StatusCode(401), json!({ "error": "Missing pairing token." }));
            return;
        };

        if !is_pairing_token_valid(&session, &token) {
            respond_json(request, StatusCode(401), json!({ "error": "Invalid or expired pairing token." }));
            return;
        }

        let repo_path = match crate::discover_chaos_core_repo_path() {
            Ok(Some(repo_path)) => repo_path,
            Ok(None) => {
                respond_json(
                    request,
                    StatusCode(404),
                    json!({ "error": "Could not locate a Chaos Core repo from the desktop session." }),
                );
                return;
            }
            Err(error) => {
                respond_json(request, StatusCode(500), json!({ "error": error }));
                return;
            }
        };

        match crate::list_all_chaos_core_database(repo_path.clone(), false) {
            Ok(response) => {
                respond_json(
                    request,
                    StatusCode(200),
                    json!({ "repoPath": repo_path, "entriesByType": response.entries_by_type }),
                );
            }
            Err(error) => {
                respond_json(request, StatusCode(500), json!({ "error": error }));
            }
        }
        return;
    }

    if request.method() == &Method::Get && url.starts_with("/api/database/load") {
        let Some(token) = parse_token(&request) else {
            respond_json(request, StatusCode(401), json!({ "error": "Missing pairing token." }));
            return;
        };
        let Some(content_type) = parse_query_param(&request, "contentType") else {
            respond_json(request, StatusCode(400), json!({ "error": "Missing contentType." }));
            return;
        };
        let Some(entry_key) = parse_query_param(&request, "entryKey") else {
            respond_json(request, StatusCode(400), json!({ "error": "Missing entryKey." }));
            return;
        };

        if !is_pairing_token_valid(&session, &token) {
            respond_json(request, StatusCode(401), json!({ "error": "Invalid or expired pairing token." }));
            return;
        }

        let repo_path = match crate::discover_chaos_core_repo_path() {
            Ok(Some(repo_path)) => repo_path,
            Ok(None) => {
                respond_json(
                    request,
                    StatusCode(404),
                    json!({ "error": "Could not locate a Chaos Core repo from the desktop session." }),
                );
                return;
            }
            Err(error) => {
                respond_json(request, StatusCode(500), json!({ "error": error }));
                return;
            }
        };

        match crate::load_chaos_core_database_record(repo_path.clone(), content_type, entry_key, false) {
            Ok(entry) => {
                respond_json(request, StatusCode(200), json!({ "repoPath": repo_path, "entry": entry }));
            }
            Err(error) => {
                respond_json(request, StatusCode(500), json!({ "error": error }));
            }
        }
        return;
    }

    respond_json(request, StatusCode(404), json!({ "error": "Not found." }));
}

pub fn start_mobile_server(store: &MobileSessionStore) -> Result<String, String> {
    {
        let guard = store
            .server
            .lock()
            .map_err(|_| "Mobile server state is unavailable right now.".to_string())?;
        if let Some(handle) = guard.as_ref() {
            return Ok(handle.local_url.clone());
        }
    }

    let (server, port) = bind_server()?;
    let host = resolve_lan_ip();
    let local_url = format!("http://{}:{}", host, port);
    let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();
    let request_store = MobileSessionStore {
        current: Arc::clone(&store.current),
        server: Arc::clone(&store.server),
    };

    let join_handle = thread::spawn(move || loop {
        if shutdown_rx.try_recv().is_ok() {
            break;
        }

        match server.recv_timeout(Duration::from_millis(250)) {
            Ok(Some(request)) => handle_request(request, &request_store),
            Ok(None) => {}
            Err(_) => break,
        }
    });

    {
        let mut server_guard = store
            .server
            .lock()
            .map_err(|_| "Mobile server state is unavailable right now.".to_string())?;
        *server_guard = Some(MobileServerHandle {
            local_url: local_url.clone(),
            shutdown_tx,
            join_handle: Some(join_handle),
        });
    }

    {
        let mut session_guard = store
            .current
            .lock()
            .map_err(|_| "Mobile session state is unavailable right now.".to_string())?;
        if let Some(session) = session_guard.as_mut() {
            session.local_url = Some(local_url.clone());
        }
    }

    Ok(local_url)
}

pub fn stop_mobile_server(store: &MobileSessionStore) -> Result<(), String> {
    let mut server_guard = store
        .server
        .lock()
        .map_err(|_| "Mobile server state is unavailable right now.".to_string())?;

    if let Some(mut handle) = server_guard.take() {
        let _ = handle.shutdown_tx.send(());
        if let Some(join_handle) = handle.join_handle.take() {
            let _ = join_handle.join();
        }
    }

    Ok(())
}
