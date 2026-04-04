use crate::mobile_server;
use crate::mobile_state::{
    ActiveMobileSession, MobileDeviceInfo, MobileInboxEntry, MobilePairingToken, MobileSessionStore,
    MobileSessionSummary,
};
use serde::Deserialize;
use serde_json::Value;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MOBILE_PROJECT_ID: &str = "technica-local";

fn now_millis() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|error| format!("Could not resolve current timestamp: {}", error))
}

fn millis_to_string(value: u128) -> String {
    value.to_string()
}

fn future_millis_string(offset: Duration) -> Result<String, String> {
    let future = SystemTime::now()
        .checked_add(offset)
        .ok_or_else(|| "Could not compute future mobile-session expiration timestamp.".to_string())?;
    let millis = future
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|error| format!("Could not resolve future timestamp: {}", error))?;
    Ok(millis.to_string())
}

fn generate_token(prefix: &str) -> Result<String, String> {
    Ok(format!("{}-{:x}", prefix, now_millis()?))
}

fn create_session() -> Result<ActiveMobileSession, String> {
    let now = millis_to_string(now_millis()?);
    Ok(ActiveMobileSession {
        session_id: generate_token("sess")?,
        project_id: MOBILE_PROJECT_ID.to_string(),
        started_at: now.clone(),
        last_activity_at: now,
        local_url: None,
        pairing: MobilePairingToken {
            token: generate_token("pair")?,
            expires_at: future_millis_string(Duration::from_secs(10 * 60))?,
        },
        joined_devices: Vec::new(),
        inbox_entries: Vec::new(),
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitMobileInboxEntryRequest {
    pub content_type: String,
    pub content_id: String,
    pub title: String,
    pub device_id: String,
    pub device_label: String,
    pub device_type: String,
    pub summary: Option<String>,
    pub payload: Value,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileSendResult {
    pub accepted: bool,
    pub inbox_entry_id: Option<String>,
    pub received_at: String,
    pub message: String,
}

fn touch_joined_device(session: &mut ActiveMobileSession, request: &SubmitMobileInboxEntryRequest, now: &str) {
    if let Some(device) = session
        .joined_devices
        .iter_mut()
        .find(|device| device.device_id == request.device_id)
    {
        device.label = request.device_label.clone();
        device.device_type = request.device_type.clone();
        device.last_seen_at = now.to_string();
        return;
    }

    session.joined_devices.push(MobileDeviceInfo {
        device_id: request.device_id.clone(),
        label: request.device_label.clone(),
        device_type: request.device_type.clone(),
        joined_at: now.to_string(),
        last_seen_at: now.to_string(),
    });
}

pub fn register_device(
    store: &MobileSessionStore,
    device_id: &str,
    device_label: &str,
    device_type: &str,
) -> Result<(), String> {
    let mut guard = store
        .current
        .lock()
        .map_err(|_| "Mobile session state is unavailable right now.".to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "No active mobile session is running.".to_string())?;
    let now = millis_to_string(now_millis()?);
    let request = SubmitMobileInboxEntryRequest {
        content_type: "dialogue".to_string(),
        content_id: "mobile_session".to_string(),
        title: "Mobile session".to_string(),
        device_id: device_id.to_string(),
        device_label: device_label.to_string(),
        device_type: device_type.to_string(),
        summary: None,
        payload: Value::Null,
    };

    touch_joined_device(session, &request, &now);
    session.last_activity_at = now;
    Ok(())
}

pub fn start_session(store: &MobileSessionStore) -> Result<MobileSessionSummary, String> {
    let mut guard = store
        .current
        .lock()
        .map_err(|_| "Mobile session state is unavailable right now.".to_string())?;

    if let Some(session) = guard.as_mut() {
        session.last_activity_at = millis_to_string(now_millis()?);
        drop(guard);
        let _ = mobile_server::start_mobile_server(store)?;
        let refreshed = store
            .current
            .lock()
            .map_err(|_| "Mobile session state is unavailable right now.".to_string())?;
        return refreshed
            .as_ref()
            .map(ActiveMobileSession::to_summary)
            .ok_or_else(|| "Mobile session disappeared while starting the server.".to_string());
    }

    let session = create_session()?;
    *guard = Some(session);
    drop(guard);

    let _ = mobile_server::start_mobile_server(store)?;
    let refreshed = store
        .current
        .lock()
        .map_err(|_| "Mobile session state is unavailable right now.".to_string())?;
    refreshed
        .as_ref()
        .map(ActiveMobileSession::to_summary)
        .ok_or_else(|| "Mobile session disappeared while starting the server.".to_string())
}

pub fn stop_session(store: &MobileSessionStore) -> Result<(), String> {
    mobile_server::stop_mobile_server(store)?;
    let mut guard = store
        .current
        .lock()
        .map_err(|_| "Mobile session state is unavailable right now.".to_string())?;
    *guard = None;
    Ok(())
}

pub fn get_session_status(store: &MobileSessionStore) -> Result<Option<MobileSessionSummary>, String> {
    let guard = store
        .current
        .lock()
        .map_err(|_| "Mobile session state is unavailable right now.".to_string())?;
    Ok(guard.as_ref().map(ActiveMobileSession::to_summary))
}

pub fn list_inbox_entries(store: &MobileSessionStore) -> Result<Vec<MobileInboxEntry>, String> {
    let guard = store
        .current
        .lock()
        .map_err(|_| "Mobile session state is unavailable right now.".to_string())?;
    Ok(guard
        .as_ref()
        .map(|session| session.inbox_entries.clone())
        .unwrap_or_default())
}

pub fn accept_inbox_entry(store: &MobileSessionStore, entry_id: &str) -> Result<MobileInboxEntry, String> {
    let mut guard = store
        .current
        .lock()
        .map_err(|_| "Mobile session state is unavailable right now.".to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "No active mobile session is running.".to_string())?;

    let entry_index = session
        .inbox_entries
        .iter()
        .position(|entry| entry.id == entry_id)
        .ok_or_else(|| format!("Could not find mobile inbox entry '{}'.", entry_id))?;

    session.last_activity_at = millis_to_string(now_millis()?);
    Ok(session.inbox_entries.remove(entry_index))
}

pub fn reject_inbox_entry(store: &MobileSessionStore, entry_id: &str) -> Result<MobileInboxEntry, String> {
    let mut guard = store
        .current
        .lock()
        .map_err(|_| "Mobile session state is unavailable right now.".to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "No active mobile session is running.".to_string())?;

    let entry_index = session
        .inbox_entries
        .iter()
        .position(|entry| entry.id == entry_id)
        .ok_or_else(|| format!("Could not find mobile inbox entry '{}'.", entry_id))?;

    session.last_activity_at = millis_to_string(now_millis()?);
    Ok(session.inbox_entries.remove(entry_index))
}

pub fn submit_inbox_entry(
    store: &MobileSessionStore,
    request: SubmitMobileInboxEntryRequest,
) -> Result<MobileSendResult, String> {
    let mut guard = store
        .current
        .lock()
        .map_err(|_| "Mobile session state is unavailable right now.".to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "No active mobile session is running.".to_string())?;

    let now = millis_to_string(now_millis()?);
    let next_entry = MobileInboxEntry {
        id: generate_token("inbox")?,
        content_type: request.content_type.clone(),
        content_id: request.content_id.clone(),
        title: request.title.clone(),
        device_id: request.device_id.clone(),
        device_label: request.device_label.clone(),
        submitted_at: now.clone(),
        summary: request
            .summary
            .clone()
            .unwrap_or_else(|| "Sent from mobile Technica.".to_string()),
        payload: request.payload.clone(),
    };

    touch_joined_device(session, &request, &now);
    session.last_activity_at = now.clone();
    session.inbox_entries.push(next_entry.clone());

    Ok(MobileSendResult {
        accepted: true,
        inbox_entry_id: Some(next_entry.id),
        received_at: now,
        message: format!("Sent '{}' to the desktop inbox.", request.title),
    })
}
