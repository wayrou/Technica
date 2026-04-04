use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobilePairingToken {
    pub token: String,
    pub expires_at: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileDeviceInfo {
    pub device_id: String,
    pub label: String,
    pub device_type: String,
    pub joined_at: String,
    pub last_seen_at: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileInboxEntry {
    pub id: String,
    pub content_type: String,
    pub content_id: String,
    pub title: String,
    pub device_id: String,
    pub device_label: String,
    pub submitted_at: String,
    pub summary: String,
    pub payload: Value,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileSessionSummary {
    pub state: String,
    pub session_id: String,
    pub project_id: String,
    pub started_at: String,
    pub last_activity_at: String,
    pub local_url: Option<String>,
    pub pairing: MobilePairingToken,
    pub joined_devices: Vec<MobileDeviceInfo>,
    pub inbox_count: usize,
}

#[derive(Clone)]
pub struct ActiveMobileSession {
    pub session_id: String,
    pub project_id: String,
    pub started_at: String,
    pub last_activity_at: String,
    pub local_url: Option<String>,
    pub pairing: MobilePairingToken,
    pub joined_devices: Vec<MobileDeviceInfo>,
    pub inbox_entries: Vec<MobileInboxEntry>,
}

impl ActiveMobileSession {
    pub fn to_summary(&self) -> MobileSessionSummary {
        MobileSessionSummary {
            state: "active".to_string(),
            session_id: self.session_id.clone(),
            project_id: self.project_id.clone(),
            started_at: self.started_at.clone(),
            last_activity_at: self.last_activity_at.clone(),
            local_url: self.local_url.clone(),
            pairing: self.pairing.clone(),
            joined_devices: self.joined_devices.clone(),
            inbox_count: self.inbox_entries.len(),
        }
    }
}

pub struct MobileServerHandle {
    pub local_url: String,
    pub shutdown_tx: mpsc::Sender<()>,
    pub join_handle: Option<JoinHandle<()>>,
}

pub struct MobileSessionStore {
    pub current: Arc<Mutex<Option<ActiveMobileSession>>>,
    pub server: Arc<Mutex<Option<MobileServerHandle>>>,
}

impl Default for MobileSessionStore {
    fn default() -> Self {
        Self {
            current: Arc::new(Mutex::new(None)),
            server: Arc::new(Mutex::new(None)),
        }
    }
}
