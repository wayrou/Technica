use crate::{DatabaseEntrySummary, LoadedDatabaseEntry};
use serde::de::DeserializeOwned;
use std::collections::BTreeMap;
use std::env;
use std::path::PathBuf;
use std::process::Command;

const DATABASE_CONTENT_TYPES: [&str; 20] = [
    "dialogue",
    "mail",
    "chatter",
    "quest",
    "key_item",
    "faction",
    "chassis",
    "doctrine",
    "map",
    "field_enemy",
    "npc",
    "item",
    "gear",
    "card",
    "fieldmod",
    "unit",
    "operation",
    "class",
    "schema",
    "codex",
];

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

fn database_snapshot_script_path() -> Result<PathBuf, String> {
    Ok(technica_root()?.join("scripts").join("chaosCoreDatabaseSnapshot.ts"))
}

fn run_snapshot_command<TResponse: DeserializeOwned>(
    command: &str,
    args: &[String],
) -> Result<TResponse, String> {
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
    process.arg(&snapshot_script).arg(command);
    for arg in args {
        process.arg(arg);
    }

    let output = process
        .output()
        .map_err(|error| format!("Could not run the Chaos Core database snapshot script: {}", error))?;

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

    serde_json::from_slice::<TResponse>(&output.stdout).map_err(|error| {
        format!(
            "Could not decode the Chaos Core database snapshot response: {}",
            error
        )
    })
}

pub(crate) fn list_chaos_core_database_entries(
    repo_path: String,
    content_type: String,
    _force: bool,
) -> Result<Vec<DatabaseEntrySummary>, String> {
    run_snapshot_command("list", &[repo_path, content_type])
}

pub(crate) fn load_chaos_core_database_record(
    repo_path: String,
    content_type: String,
    entry_key: String,
    _force: bool,
) -> Result<LoadedDatabaseEntry, String> {
    run_snapshot_command("load", &[repo_path, content_type, entry_key])
}

pub(crate) fn list_all_chaos_core_database_entries(
    repo_path: String,
    _force: bool,
) -> Result<BTreeMap<String, Vec<DatabaseEntrySummary>>, String> {
    let mut entries_by_type = BTreeMap::new();

    for content_type in DATABASE_CONTENT_TYPES {
        let entries = list_chaos_core_database_entries(
            repo_path.clone(),
            content_type.to_string(),
            true,
        )
        .map_err(|error| format!("Could not list '{}' entries: {}", content_type, error))?;

        entries_by_type.insert(content_type.to_string(), entries);
    }

    Ok(entries_by_type)
}

pub(crate) fn invalidate_chaos_core_database_cache(
    _repo_path: &str,
    _content_type: Option<&str>,
) -> Result<(), String> {
    Ok(())
}

pub(crate) fn shutdown_chaos_core_database_daemon() {}
