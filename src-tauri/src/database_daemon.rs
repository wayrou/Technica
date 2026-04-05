use crate::{DatabaseEntrySummary, LoadedDatabaseEntry};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};
use std::env;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Mutex, OnceLock};

#[derive(Default)]
struct DatabaseDaemonStore {
    client: Mutex<Option<DatabaseDaemonClient>>,
}

struct DatabaseDaemonClient {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

enum DatabaseDaemonError {
    Transport(String),
    Logical(String),
}

#[derive(serde::Deserialize)]
struct DatabaseDaemonResponse {
    ok: bool,
    data: Option<Value>,
    error: Option<String>,
}

static DATABASE_DAEMON_STORE: OnceLock<DatabaseDaemonStore> = OnceLock::new();

fn database_daemon_store() -> &'static DatabaseDaemonStore {
    DATABASE_DAEMON_STORE.get_or_init(DatabaseDaemonStore::default)
}

fn technica_root() -> Result<PathBuf, String> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| "Could not resolve the Technica project root.".to_string())
}

fn tsx_binary_path() -> Result<PathBuf, String> {
    let technica_root = technica_root()?;
    let binary_name = if cfg!(target_os = "windows") { "tsx.cmd" } else { "tsx" };
    Ok(technica_root.join("node_modules").join(".bin").join(binary_name))
}

fn database_daemon_script_path() -> Result<PathBuf, String> {
    Ok(technica_root()?.join("scripts").join("chaosCoreDatabaseDaemon.ts"))
}

impl DatabaseDaemonClient {
    fn spawn() -> Result<Self, String> {
        let tsx_binary = tsx_binary_path()?;
        let daemon_script = database_daemon_script_path()?;

        if !tsx_binary.exists() {
            return Err(format!(
                "Could not find the tsx runtime at '{}'. Run npm install in Technica first.",
                tsx_binary.display()
            ));
        }

        if !daemon_script.exists() {
            return Err(format!(
                "Could not find the Chaos Core database daemon at '{}'.",
                daemon_script.display()
            ));
        }

        let mut child = if cfg!(target_os = "windows") {
            Command::new("cmd")
                .arg("/C")
                .arg(&tsx_binary)
                .arg(&daemon_script)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
        } else {
            Command::new(&tsx_binary)
                .arg(&daemon_script)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
        }
        .map_err(|error| format!("Could not start the Chaos Core database daemon: {}", error))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Chaos Core database daemon stdin is unavailable.".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Chaos Core database daemon stdout is unavailable.".to_string())?;

        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
        })
    }

    fn send_request<TResponse: DeserializeOwned, TPayload: Serialize>(
        &mut self,
        command: &str,
        payload: TPayload,
    ) -> Result<TResponse, DatabaseDaemonError> {
        let serialized_request = serde_json::to_string(&json!({
            "command": command,
            "payload": payload
        }))
        .map_err(|error| DatabaseDaemonError::Logical(format!("Could not encode daemon request: {}", error)))?;

        self.stdin
            .write_all(serialized_request.as_bytes())
            .and_then(|_| self.stdin.write_all(b"\n"))
            .and_then(|_| self.stdin.flush())
            .map_err(|error| {
                DatabaseDaemonError::Transport(format!(
                    "Could not send a request to the Chaos Core database daemon: {}",
                    error
                ))
            })?;

        let mut response_line = String::new();
        let bytes_read = self
            .stdout
            .read_line(&mut response_line)
            .map_err(|error| {
                DatabaseDaemonError::Transport(format!(
                    "Could not read the Chaos Core database daemon response: {}",
                    error
                ))
            })?;

        if bytes_read == 0 {
            return Err(DatabaseDaemonError::Transport(
                "Chaos Core database daemon closed unexpectedly.".to_string(),
            ));
        }

        let response = serde_json::from_str::<DatabaseDaemonResponse>(response_line.trim())
            .map_err(|error| {
                DatabaseDaemonError::Transport(format!(
                    "Could not parse the Chaos Core database daemon response: {}",
                    error
                ))
            })?;

        if !response.ok {
            return Err(DatabaseDaemonError::Logical(
                response
                    .error
                    .unwrap_or_else(|| "Chaos Core database daemon request failed.".to_string()),
            ));
        }

        serde_json::from_value::<TResponse>(response.data.unwrap_or(Value::Null)).map_err(|error| {
            DatabaseDaemonError::Transport(format!(
                "Could not decode the Chaos Core database daemon payload: {}",
                error
            ))
        })
    }
}

fn with_daemon_client<T>(
    operation: impl Fn(&mut DatabaseDaemonClient) -> Result<T, DatabaseDaemonError>,
) -> Result<T, String> {
    let store = database_daemon_store();
    let mut guard = store
        .client
        .lock()
        .map_err(|_| "Chaos Core database daemon state is unavailable right now.".to_string())?;

    let mut restarted = false;
    loop {
        if guard.is_none() {
            *guard = Some(DatabaseDaemonClient::spawn()?);
        }

        let result = {
            let client = guard
                .as_mut()
                .ok_or_else(|| "Chaos Core database daemon client is unavailable.".to_string())?;
            operation(client)
        };

        match result {
            Ok(value) => return Ok(value),
            Err(DatabaseDaemonError::Logical(error)) => return Err(error),
            Err(DatabaseDaemonError::Transport(error)) => {
                if restarted {
                    return Err(error);
                }

                *guard = None;
                restarted = true;
            }
        }
    }
}

pub(crate) fn list_chaos_core_database_entries(
    repo_path: String,
    content_type: String,
    force: bool,
) -> Result<Vec<DatabaseEntrySummary>, String> {
    with_daemon_client(|client| {
        client.send_request(
            "list",
            json!({
                "repoPath": repo_path,
                "contentType": content_type,
                "force": force
            }),
        )
    })
}

pub(crate) fn load_chaos_core_database_record(
    repo_path: String,
    content_type: String,
    entry_key: String,
    force: bool,
) -> Result<LoadedDatabaseEntry, String> {
    with_daemon_client(|client| {
        client.send_request(
            "load",
            json!({
                "repoPath": repo_path,
                "contentType": content_type,
                "entryKey": entry_key,
                "force": force
            }),
        )
    })
}

pub(crate) fn list_all_chaos_core_database_entries(
    repo_path: String,
    force: bool,
) -> Result<std::collections::BTreeMap<String, Vec<DatabaseEntrySummary>>, String> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ListAllResponse {
        entries_by_type: std::collections::BTreeMap<String, Vec<DatabaseEntrySummary>>,
    }

    let response: ListAllResponse = with_daemon_client(|client| {
        client.send_request(
            "listAll",
            json!({
                "repoPath": repo_path,
                "force": force
            }),
        )
    })?;

    Ok(response.entries_by_type)
}

pub(crate) fn invalidate_chaos_core_database_cache(
    repo_path: &str,
    content_type: Option<&str>,
) -> Result<(), String> {
    let repo_path = repo_path.to_string();
    let content_type = content_type.map(str::to_string);

    let _: Value = with_daemon_client(|client| {
        client.send_request(
            "invalidate",
            json!({
                "repoPath": repo_path,
                "contentType": content_type
            }),
        )
    })?;

    Ok(())
}

pub(crate) fn shutdown_chaos_core_database_daemon() {
    if let Some(store) = DATABASE_DAEMON_STORE.get() {
        if let Ok(mut guard) = store.client.lock() {
            if let Some(mut client) = guard.take() {
                let _ = client.child.kill();
                let _ = client.child.wait();
            }
        }
    }
}
