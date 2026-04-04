#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod mobile_server;
mod mobile_session;
mod mobile_state;

use base64::Engine;
use mobile_state::{MobileInboxEntry, MobileSessionStore, MobileSessionSummary};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DatabaseEntrySummary {
    entry_key: String,
    content_id: String,
    title: String,
    runtime_file: String,
    source_file: Option<String>,
    origin: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LoadedDatabaseEntry {
    entry_key: String,
    content_id: String,
    title: String,
    runtime_file: String,
    origin: String,
    runtime_content: String,
    source_file: Option<String>,
    source_content: Option<String>,
    editor_content: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublishBundleRequest {
    repo_path: String,
    content_type: String,
    target_entry_key: Option<String>,
    target_source_file: Option<String>,
    manifest: Value,
    files: Vec<PublishBundleFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublishBundleFile {
    name: String,
    content: String,
    encoding: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublishResult {
    entry_key: String,
    content_id: String,
    runtime_file: String,
}

fn normalize_content_type(content_type: &str) -> Result<&str, String> {
    match content_type {
        "dialogue" | "quest" | "map" | "npc" | "item" | "gear" | "card" | "unit" | "operation" | "class" => {
            Ok(content_type)
        }
        _ => Err(format!("Unsupported Chaos Core content type '{}'.", content_type)),
    }
}

fn runtime_root(repo_path: &Path, content_type: &str) -> PathBuf {
    repo_path
        .join("src")
        .join("content")
        .join("technica")
        .join("generated")
        .join(content_type)
}

fn source_root(repo_path: &Path, content_type: &str) -> PathBuf {
    repo_path
        .join("src")
        .join("content")
        .join("technica")
        .join("source")
        .join(content_type)
}

fn manifest_root(repo_path: &Path, content_type: &str) -> PathBuf {
    repo_path
        .join("src")
        .join("content")
        .join("technica")
        .join("manifests")
        .join(content_type)
}

fn asset_root(repo_path: &Path, content_type: &str) -> PathBuf {
    repo_path
        .join("public")
        .join("assets")
        .join("technica")
        .join(content_type)
}

fn disabled_root(repo_path: &Path, content_type: &str) -> PathBuf {
    repo_path
        .join("src")
        .join("content")
        .join("technica")
        .join("disabled")
        .join(content_type)
}

fn generated_version_path(repo_path: &Path) -> PathBuf {
    repo_path
        .join("src")
        .join("content")
        .join("technica")
        .join("generated")
        .join("version.json")
}

fn built_in_source_file(content_type: &str) -> Option<&'static str> {
    match content_type {
        "map" => Some("src/field/maps.ts"),
        "dialogue" => Some("src/field/npcs.ts"),
        "npc" => Some("src/field/npcs.ts"),
        "quest" => Some("src/quests/questData.ts"),
        "class" => Some("src/core/classes.ts"),
        "unit" | "operation" => Some("src/core/initialState.ts"),
        _ => None,
    }
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| format!("Could not create '{}': {}", path.display(), error))
}

fn technica_root() -> Result<PathBuf, String> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| "Could not resolve the Technica project root.".to_string())
}

fn database_snapshot_script_path() -> Result<PathBuf, String> {
    Ok(technica_root()?.join("scripts").join("chaosCoreDatabaseSnapshot.ts"))
}

fn tsx_binary_path() -> Result<PathBuf, String> {
    let technica_root = technica_root()?;
    let binary_name = if cfg!(target_os = "windows") { "tsx.cmd" } else { "tsx" };
    Ok(technica_root.join("node_modules").join(".bin").join(binary_name))
}

fn run_database_snapshot(
    command: &str,
    repo_path: &str,
    content_type: &str,
    entry_key: Option<&str>,
) -> Result<Vec<u8>, String> {
    let tsx_binary = tsx_binary_path()?;
    let snapshot_script = database_snapshot_script_path()?;

    if !tsx_binary.exists() {
        return Err(format!(
            "Could not find the tsx runtime at '{}'. Run npm install in Technica first.",
            tsx_binary.display()
        ));
    }

    if !snapshot_script.exists() {
        return Err(format!(
            "Could not find the Chaos Core snapshot script at '{}'.",
            snapshot_script.display()
        ));
    }

    let mut process = Command::new(&tsx_binary);
    process
        .arg(&snapshot_script)
        .arg(command)
        .arg(repo_path)
        .arg(content_type);

    if let Some(entry_key) = entry_key {
        process.arg(entry_key);
    }

    let output = process
        .output()
        .map_err(|error| format!("Could not run the Chaos Core snapshot script: {}", error))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("Snapshot script exited with status {}.", output.status)
        };
        return Err(detail);
    }

    Ok(output.stdout)
}

fn run_database_writeback(
    repo_path: &str,
    content_type: &str,
    entry_key: &str,
    payload_path: &Path,
    source_relative_path: Option<&str>,
) -> Result<Vec<u8>, String> {
    let tsx_binary = tsx_binary_path()?;
    let snapshot_script = database_snapshot_script_path()?;

    if !tsx_binary.exists() {
        return Err(format!(
            "Could not find the tsx runtime at '{}'. Run npm install in Technica first.",
            tsx_binary.display()
        ));
    }

    if !snapshot_script.exists() {
        return Err(format!(
            "Could not find the Chaos Core snapshot script at '{}'.",
            snapshot_script.display()
        ));
    }

    let mut process = Command::new(&tsx_binary);
    process
        .arg(&snapshot_script)
        .arg("writeback")
        .arg(repo_path)
        .arg(content_type)
        .arg(entry_key)
        .arg(payload_path);

    if let Some(source_relative_path) = source_relative_path {
        process.arg(source_relative_path);
    }

    let output = process
        .output()
        .map_err(|error| format!("Could not run the Chaos Core write-back script: {}", error))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("Write-back script exited with status {}.", output.status)
        };
        return Err(detail);
    }

    Ok(output.stdout)
}

fn replace_asset_paths(value: Value, replacements: &[(String, String)]) -> Value {
    match value {
        Value::String(text) => {
            if let Some((_, replacement)) = replacements.iter().find(|(source, _)| source == &text) {
                Value::String(replacement.clone())
            } else {
                Value::String(text)
            }
        }
        Value::Array(entries) => Value::Array(
            entries
                .into_iter()
                .map(|entry| replace_asset_paths(entry, replacements))
                .collect(),
        ),
        Value::Object(entries) => Value::Object(
            entries
                .into_iter()
                .map(|(key, entry)| (key, replace_asset_paths(entry, replacements)))
                .collect(),
        ),
        other => other,
    }
}

fn write_text(path: &Path, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|error| format!("Could not write '{}': {}", path.display(), error))
}

fn touch_generated_version(repo_root: &Path, content_type: &str, content_id: &str) -> Result<(), String> {
    let marker_path = generated_version_path(repo_root);
    let marker_parent = marker_path
        .parent()
        .ok_or_else(|| "Could not resolve Chaos Core generated marker directory.".to_string())?;
    ensure_dir(marker_parent)?;

    let updated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Could not resolve generated-content timestamp: {}", error))?
        .as_millis();
    let marker = serde_json::json!({
        "updatedAt": updated_at,
        "contentType": content_type,
        "contentId": content_id
    });

    write_text(
        &marker_path,
        &serde_json::to_string_pretty(&marker).unwrap_or_default(),
    )
}

fn write_file(path: &Path, file: &PublishBundleFile) -> Result<(), String> {
    if matches!(file.encoding.as_deref(), Some("base64")) {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(file.content.as_bytes())
            .map_err(|error| format!("Could not decode asset '{}': {}", file.name, error))?;
        fs::write(path, bytes).map_err(|error| format!("Could not write '{}': {}", path.display(), error))
    } else {
        write_text(path, &file.content)
    }
}

fn remove_matching_files(directory: &Path, content_id: &str) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }

    let prefix = format!("{}.", content_id);
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("Could not read '{}': {}", directory.display(), error))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };

        if file_name == content_id || file_name.starts_with(&prefix) || file_name.starts_with(&format!("{}-", content_id)) {
            if path.is_file() {
                fs::remove_file(&path)
                    .map_err(|error| format!("Could not remove '{}': {}", path.display(), error))?;
            }
        }
    }

    Ok(())
}

fn remove_manifest_assets(
    repo_root: &Path,
    content_type: &str,
    manifest_path: &Path,
    content_id: &str,
) -> Result<(), String> {
    if manifest_path.exists() {
        let manifest_text = fs::read_to_string(manifest_path)
            .map_err(|error| format!("Could not read '{}': {}", manifest_path.display(), error))?;
        let manifest: Value = serde_json::from_str(&manifest_text)
            .map_err(|error| format!("Could not parse '{}': {}", manifest_path.display(), error))?;

        if let Some(files) = manifest.get("files").and_then(Value::as_array) {
            for file in files {
                let Some(file_name) = file.as_str() else {
                    continue;
                };

                if !file_name.starts_with("assets/") {
                    continue;
                }

                let Some(asset_name) = Path::new(file_name).file_name().and_then(|value| value.to_str()) else {
                    continue;
                };

                let asset_path = asset_root(repo_root, content_type).join(asset_name);
                if asset_path.exists() {
                    fs::remove_file(&asset_path)
                        .map_err(|error| format!("Could not remove '{}': {}", asset_path.display(), error))?;
                }
            }
        }
    }

    remove_matching_files(&asset_root(repo_root, content_type), content_id)
}

fn is_chaos_core_repo(path: &Path) -> bool {
    let package_json = path.join("package.json");
    if !package_json.exists() {
        return false;
    }

    fs::read_to_string(&package_json)
        .map(|content| content.contains("\"name\": \"chaos-core\""))
        .unwrap_or(false)
}

fn discover_from_directory(root: &Path, remaining_depth: usize) -> Option<PathBuf> {
    if !root.exists() {
        return None;
    }

    if is_chaos_core_repo(root) {
        return Some(root.to_path_buf());
    }

    if remaining_depth == 0 {
        return None;
    }

    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        if let Some(found) = discover_from_directory(&path, remaining_depth.saturating_sub(1)) {
            return Some(found);
        }
    }

    None
}

pub(crate) fn discover_chaos_core_repo_path() -> Result<Option<String>, String> {
    let current_dir = env::current_dir().map_err(|error| format!("Could not read current directory: {}", error))?;
    let home_dir = env::var("HOME").ok().map(PathBuf::from);

    let candidates = [
        current_dir.clone(),
        current_dir.parent().map(PathBuf::from).unwrap_or(current_dir.clone()),
        current_dir
            .parent()
            .and_then(|path| path.parent())
            .map(PathBuf::from)
            .unwrap_or(current_dir.clone()),
        home_dir
            .as_ref()
            .map(|path| path.join("Desktop"))
            .unwrap_or(current_dir.clone()),
    ];

    for candidate in candidates {
        if let Some(found) = discover_from_directory(&candidate, 3) {
            return Ok(Some(found.to_string_lossy().to_string()));
        }
    }

    Ok(None)
}

#[tauri::command]
fn discover_chaos_core_repo() -> Result<Option<String>, String> {
    discover_chaos_core_repo_path()
}

pub(crate) fn list_chaos_core_database_entries(
    repo_path: String,
    content_type: String,
) -> Result<Vec<DatabaseEntrySummary>, String> {
    let content_type = normalize_content_type(&content_type)?;
    let stdout = run_database_snapshot("list", &repo_path, content_type, None)?;
    serde_json::from_slice::<Vec<DatabaseEntrySummary>>(&stdout)
        .map_err(|error| format!("Could not parse the Chaos Core database list: {}", error))
}

#[tauri::command]
fn list_chaos_core_database(repo_path: String, content_type: String) -> Result<Vec<DatabaseEntrySummary>, String> {
    list_chaos_core_database_entries(repo_path, content_type)
}

pub(crate) fn load_chaos_core_database_record(
    repo_path: String,
    content_type: String,
    entry_key: String,
) -> Result<LoadedDatabaseEntry, String> {
    let content_type = normalize_content_type(&content_type)?;
    let stdout = run_database_snapshot("load", &repo_path, content_type, Some(&entry_key))?;
    serde_json::from_slice::<LoadedDatabaseEntry>(&stdout)
        .map_err(|error| format!("Could not parse the selected Chaos Core database entry: {}", error))
}

#[tauri::command]
fn load_chaos_core_database_entry(
    repo_path: String,
    content_type: String,
    entry_key: String,
) -> Result<LoadedDatabaseEntry, String> {
    load_chaos_core_database_record(repo_path, content_type, entry_key)
}

#[tauri::command]
fn publish_chaos_core_bundle(request: PublishBundleRequest) -> Result<PublishResult, String> {
    let content_type = normalize_content_type(&request.content_type)?;
    let repo_root = PathBuf::from(&request.repo_path);
    let content_id = request
        .manifest
        .get("contentId")
        .and_then(Value::as_str)
        .ok_or_else(|| "Chaos Core publish payload is missing manifest.contentId.".to_string())?
        .to_string();
    let entry_file = request
        .manifest
        .get("entryFile")
        .and_then(Value::as_str)
        .ok_or_else(|| "Chaos Core publish payload is missing manifest.entryFile.".to_string())?
        .to_string();

    if let Some(target_entry_key) = request.target_entry_key.as_deref() {
        if target_entry_key.starts_with("game:") {
            let target_source_file = request
                .target_source_file
                .as_deref()
                .or_else(|| built_in_source_file(content_type));

            if let Some(source_file) = target_source_file {
                let runtime_payload = request
                    .files
                    .iter()
                    .find(|file| file.name == entry_file)
                    .ok_or_else(|| {
                        format!(
                            "Chaos Core publish payload does not include the runtime entry file '{}'.",
                            entry_file
                        )
                    })?;
                let temp_payload_path = env::temp_dir().join(format!(
                    "technica-writeback-{}-{}-{}.json",
                    content_type,
                    content_id,
                    SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map_err(|error| format!("Could not resolve write-back timestamp: {}", error))?
                        .as_nanos()
                ));

                let public_asset_dir = asset_root(&repo_root, content_type);
                ensure_dir(&public_asset_dir)?;
                remove_matching_files(&public_asset_dir, &content_id)?;

                let mut asset_replacements: Vec<(String, String)> = Vec::new();
                for file in request.files.iter().filter(|file| file.name.starts_with("assets/")) {
                    let file_name = Path::new(&file.name)
                        .file_name()
                        .and_then(|value| value.to_str())
                        .ok_or_else(|| format!("Invalid asset path '{}'.", file.name))?
                        .to_string();
                    let destination = public_asset_dir.join(&file_name);
                    write_file(&destination, file)?;
                    asset_replacements.push((
                        file.name.clone(),
                        format!("/assets/technica/{}/{}", content_type, file_name),
                    ));
                }

                let parsed_payload: Value = serde_json::from_str(&runtime_payload.content)
                    .map_err(|error| format!("Could not parse runtime JSON '{}': {}", runtime_payload.name, error))?;
                let replaced_payload = replace_asset_paths(parsed_payload, &asset_replacements);
                let runtime_content = serde_json::to_string_pretty(&replaced_payload)
                    .map_err(|error| format!("Could not serialize runtime JSON '{}': {}", runtime_payload.name, error))?;

                write_text(&temp_payload_path, &runtime_content)?;
                let writeback_output = run_database_writeback(
                    &request.repo_path,
                    content_type,
                    target_entry_key,
                    &temp_payload_path,
                    Some(source_file),
                );
                let _ = fs::remove_file(&temp_payload_path);
                let stdout = writeback_output?;
                touch_generated_version(&repo_root, content_type, &content_id)?;

                return serde_json::from_slice::<PublishResult>(&stdout)
                    .map_err(|error| format!("Could not parse the Chaos Core write-back result: {}", error))
                    .or_else(|_| {
                        Ok(PublishResult {
                            entry_key: format!("game:{}", content_id),
                            content_id,
                            runtime_file: source_file.to_string(),
                        })
                    });
            }
        }
    }

    let runtime_dir = runtime_root(&repo_root, content_type);
    let source_dir = source_root(&repo_root, content_type);
    let manifest_dir = manifest_root(&repo_root, content_type);
    let public_asset_dir = asset_root(&repo_root, content_type);

    ensure_dir(&runtime_dir)?;
    ensure_dir(&source_dir)?;
    ensure_dir(&manifest_dir)?;
    ensure_dir(&public_asset_dir)?;

    let manifest_path = manifest_dir.join(format!("{}.manifest.json", content_id));
    write_text(&manifest_path, &serde_json::to_string_pretty(&request.manifest).unwrap_or_default())?;

    let mut asset_replacements: Vec<(String, String)> = Vec::new();

    for file in request.files.iter().filter(|file| file.name.starts_with("assets/")) {
        let file_name = Path::new(&file.name)
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| format!("Invalid asset path '{}'.", file.name))?
            .to_string();
        let destination = public_asset_dir.join(&file_name);
        write_file(&destination, file)?;
        asset_replacements.push((
            file.name.clone(),
            format!("/assets/technica/{}/{}", content_type, file_name),
        ));
    }

    for file in request.files.iter().filter(|file| !file.name.starts_with("assets/")) {
        let destination = if file.name == "manifest.json" {
            continue;
        } else if file.name == "README.md" {
            source_dir.join(format!("{}.README.md", content_id))
        } else if file.name.ends_with(".source.json") || file.name.ends_with(".dialogue.txt") {
            source_dir.join(&file.name)
        } else if file.name == entry_file {
            runtime_dir.join(&file.name)
        } else {
            source_dir.join(&file.name)
        };

        if file.name == entry_file {
            let parsed: Value = serde_json::from_str(&file.content)
                .map_err(|error| format!("Could not parse runtime JSON '{}': {}", file.name, error))?;
            let replaced = replace_asset_paths(parsed, &asset_replacements);
            let content = serde_json::to_string_pretty(&replaced)
                .map_err(|error| format!("Could not serialize runtime JSON '{}': {}", file.name, error))?;
            write_text(&destination, &content)?;
        } else {
            write_file(&destination, file)?;
        }
    }

    touch_generated_version(&repo_root, content_type, &content_id)?;

    Ok(PublishResult {
        entry_key: format!("technica:{}", content_id),
        content_id,
        runtime_file: entry_file,
    })
}

#[tauri::command]
fn remove_chaos_core_database_entry(
    repo_path: String,
    content_type: String,
    entry_key: String,
) -> Result<(), String> {
    let content_type = normalize_content_type(&content_type)?;
    let repo_root = PathBuf::from(&repo_path);
    let (origin, content_id) = entry_key
        .split_once(':')
        .ok_or_else(|| format!("Invalid Chaos Core entry key '{}'.", entry_key))?;

    match origin {
        "technica" => {
            let manifest_path = manifest_root(&repo_root, content_type)
                .join(format!("{}.manifest.json", content_id));
            remove_manifest_assets(&repo_root, content_type, &manifest_path, content_id)?;
            remove_matching_files(&runtime_root(&repo_root, content_type), content_id)?;
            remove_matching_files(&source_root(&repo_root, content_type), content_id)?;
            remove_matching_files(&manifest_root(&repo_root, content_type), content_id)?;
            touch_generated_version(&repo_root, content_type, content_id)?;
            Ok(())
        }
        "game" => {
            let disabled_dir = disabled_root(&repo_root, content_type);
            ensure_dir(&disabled_dir)?;
            let disabled_at = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|error| format!("Could not resolve disable timestamp: {}", error))?
                .as_secs()
                .to_string();
            let tombstone = serde_json::json!({
                "id": content_id,
                "contentType": content_type,
                "origin": "game",
                "disabledAt": disabled_at
            });
            write_text(
                &disabled_dir.join(format!("{}.disabled.json", content_id)),
                &serde_json::to_string_pretty(&tombstone).unwrap_or_default(),
            )?;
            touch_generated_version(&repo_root, content_type, content_id)
        }
        _ => Err(format!("Unsupported Chaos Core entry origin '{}'.", origin)),
    }
}

#[tauri::command]
fn start_mobile_session(session_store: State<'_, MobileSessionStore>) -> Result<MobileSessionSummary, String> {
    mobile_session::start_session(&session_store)
}

#[tauri::command]
fn stop_mobile_session(session_store: State<'_, MobileSessionStore>) -> Result<(), String> {
    mobile_session::stop_session(&session_store)
}

#[tauri::command]
fn get_mobile_session_status(
    session_store: State<'_, MobileSessionStore>,
) -> Result<Option<MobileSessionSummary>, String> {
    mobile_session::get_session_status(&session_store)
}

#[tauri::command]
fn list_mobile_inbox_entries(
    session_store: State<'_, MobileSessionStore>,
) -> Result<Vec<MobileInboxEntry>, String> {
    mobile_session::list_inbox_entries(&session_store)
}

#[tauri::command]
fn accept_mobile_inbox_entry(
    session_store: State<'_, MobileSessionStore>,
    entry_id: String,
) -> Result<MobileInboxEntry, String> {
    mobile_session::accept_inbox_entry(&session_store, &entry_id)
}

#[tauri::command]
fn reject_mobile_inbox_entry(
    session_store: State<'_, MobileSessionStore>,
    entry_id: String,
) -> Result<MobileInboxEntry, String> {
    mobile_session::reject_inbox_entry(&session_store, &entry_id)
}

fn main() {
    tauri::Builder::default()
        .manage(MobileSessionStore::default())
        .invoke_handler(tauri::generate_handler![
            discover_chaos_core_repo,
            list_chaos_core_database,
            load_chaos_core_database_entry,
            publish_chaos_core_bundle,
            remove_chaos_core_database_entry,
            start_mobile_session,
            stop_mobile_session,
            get_mobile_session_status,
            list_mobile_inbox_entries,
            accept_mobile_inbox_entry,
            reject_mobile_inbox_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running Technica");
}
