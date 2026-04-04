# Technica Mobile Phase 1 Backlog

## Scope

Phase 1 is the first practical mobile release of Technica.

It should deliver:

- a responsive phone/tablet web experience
- desktop-hosted mobile sessions on the local network
- QR-based pairing
- mobile editing for dialogue, quest, NPC, and database
- `Send to Desktop` as the primary mobile action

It should not try to deliver:

- full offline-first collaboration
- full map painting on phones
- remote internet relay
- native iOS/Android wrappers
- full CRDT-style multi-user merge

## Delivery strategy

Ship this in narrow vertical slices:

1. Add device and session scaffolding.
2. Add a desktop-hosted mobile session transport.
3. Add pairing and mobile shell mode.
4. Make one editor work end-to-end on mobile.
5. Extend the same pattern to quest, NPC, and database.
6. Add desktop inbox/review and export handoff.

## Ticket 1: Add Mobile Runtime Mode

### Goal

Give the frontend an explicit desktop vs mobile-session runtime mode so components can render differently without ad hoc media-query hacks.

### Files to add

- [src/types/mobile.ts](/Users/alexhungate/Desktop/technica-core/src/types/mobile.ts)
- [src/hooks/useTechnicaRuntime.ts](/Users/alexhungate/Desktop/technica-core/src/hooks/useTechnicaRuntime.ts)

### Files to modify

- [src/main.tsx](/Users/alexhungate/Desktop/technica-core/src/main.tsx)
- [src/App.tsx](/Users/alexhungate/Desktop/technica-core/src/App.tsx)
- [src/styles.css](/Users/alexhungate/Desktop/technica-core/src/styles.css)

### Work

- Read query params and runtime flags such as:
  - `mode=desktop`
  - `mode=mobile`
  - `sessionId=...`
  - `deviceType=phone|tablet`
- Expose a single runtime object with:
  - `surface`
  - `isMobile`
  - `isTablet`
  - `isPhone`
  - `sessionId`
  - `canPublishDirectly`
  - `canWriteToRepo`
- Add app-level CSS classes on the shell for:
  - `surface-desktop`
  - `surface-mobile`
  - `device-phone`
  - `device-tablet`

### Acceptance criteria

- Desktop keeps current behavior.
- Opening the app with `?mode=mobile&deviceType=phone` changes the shell class and layout mode.
- No existing desktop editor behavior regresses.

## Ticket 2: Add Mobile Session Domain Types

### Goal

Create stable client/server contracts before any network transport is built.

### Files to add

- [src/types/mobile.ts](/Users/alexhungate/Desktop/technica-core/src/types/mobile.ts)
- [src/utils/mobileProtocol.ts](/Users/alexhungate/Desktop/technica-core/src/utils/mobileProtocol.ts)

### Work

- Define:
  - `MobileSessionSummary`
  - `MobilePairingToken`
  - `MobileDeviceInfo`
  - `MobileProjectSnapshot`
  - `MobileDocumentPatch`
  - `MobileSendResult`
  - `MobileExportRequest`
  - `MobileInboxEntry`
- Define patch operations for current document models:
  - `replace_field`
  - `insert_list_item`
  - `update_list_item`
  - `remove_list_item`
  - `move_list_item`
- Define content-type-safe payload wrappers for:
  - `dialogue`
  - `quest`
  - `npc`
  - `database-selection`

### Acceptance criteria

- All new types compile cleanly.
- The protocol file can be imported from both frontend and Rust-facing serialization code.

## Ticket 3: Desktop Session Manager In Rust

### Goal

Let the desktop app create and manage a mobile editing session.

### Files to add

- [src-tauri/src/mobile_session.rs](/Users/alexhungate/Desktop/technica-core/src-tauri/src/mobile_session.rs)
- [src-tauri/src/mobile_state.rs](/Users/alexhungate/Desktop/technica-core/src-tauri/src/mobile_state.rs)

### Files to modify

- [src-tauri/src/main.rs](/Users/alexhungate/Desktop/technica-core/src-tauri/src/main.rs)
- [src-tauri/Cargo.toml](/Users/alexhungate/Desktop/technica-core/src-tauri/Cargo.toml)

### Work

- Add in-memory session state for:
  - current session id
  - pairing token
  - joined devices
  - session start time
  - last activity time
  - inbox queue
- Add Tauri commands:
  - `start_mobile_session`
  - `stop_mobile_session`
  - `get_mobile_session_status`
  - `list_mobile_inbox_entries`
  - `accept_mobile_inbox_entry`
  - `reject_mobile_inbox_entry`
- Generate short-lived pairing tokens.
- Track one active desktop-owned session at a time for MVP.

### Acceptance criteria

- Desktop can start and stop a session without restarting the app.
- Session state survives frontend reloads while the desktop app stays open.
- Commands serialize cleanly to the frontend.

## Ticket 4: Add Desktop-Hosted Mobile HTTP Server

### Goal

Expose a local mobile-accessible endpoint from the desktop app.

### Files to add

- [src-tauri/src/mobile_server.rs](/Users/alexhungate/Desktop/technica-core/src-tauri/src/mobile_server.rs)

### Files to modify

- [src-tauri/src/main.rs](/Users/alexhungate/Desktop/technica-core/src-tauri/src/main.rs)
- [src-tauri/Cargo.toml](/Users/alexhungate/Desktop/technica-core/src-tauri/Cargo.toml)

### Work

- Start a lightweight embedded HTTP server on the LAN.
- Serve:
  - pairing endpoint
  - session status endpoint
  - document sync endpoints
  - static frontend assets or a proxied mobile frontend route
- Keep the server disabled until the user explicitly starts a mobile session.
- Prefer a random available port.
- Return the session URL and local IP candidates to the frontend.

### Acceptance criteria

- Desktop can expose a mobile URL on the current local network.
- Stopping the session closes the server.
- Requests without a valid pairing/session token are rejected.

## Ticket 5: Pairing UI And QR Flow

### Goal

Make mobile connection simple enough for real use.

### Files to add

- [src/features/mobile/MobileSessionPanel.tsx](/Users/alexhungate/Desktop/technica-core/src/features/mobile/MobileSessionPanel.tsx)
- [src/components/QrCodePanel.tsx](/Users/alexhungate/Desktop/technica-core/src/components/QrCodePanel.tsx)

### Files to modify

- [src/App.tsx](/Users/alexhungate/Desktop/technica-core/src/App.tsx)
- [src/styles.css](/Users/alexhungate/Desktop/technica-core/src/styles.css)

### Work

- Add a desktop panel with:
  - `Start Mobile Session`
  - `Stop Mobile Session`
  - QR code
  - copyable URL
  - joined device list
  - session activity timestamp
- Use an existing QR library or a small local utility component.
- Make the panel easy to reach from the header or Database tab.

### Acceptance criteria

- Starting a session shows a QR code and URL.
- Stopping the session hides them and disconnects devices.
- The panel updates when a device joins.

## Ticket 6: Frontend Mobile Session Client

### Goal

Give the browser client a single place to handle pairing, polling, patch send, and inbox send operations.

### Files to add

- [src/utils/mobileClient.ts](/Users/alexhungate/Desktop/technica-core/src/utils/mobileClient.ts)
- [src/hooks/useMobileSession.ts](/Users/alexhungate/Desktop/technica-core/src/hooks/useMobileSession.ts)

### Work

- Implement:
  - pair with desktop
  - load initial project snapshot
  - send document patch
  - send full document to desktop inbox
  - poll session status
- Add a thin retry/backoff policy.
- Surface connection states:
  - connecting
  - connected
  - reconnecting
  - disconnected
  - invalid session

### Acceptance criteria

- Mobile can pair and receive a live session id.
- UI shows clear connection state.
- A disconnected mobile device does not crash the app.

## Ticket 7: Responsive Shell For Phone And Tablet

### Goal

Make the app genuinely usable on touch devices rather than simply squeezed.

### Files to modify

- [src/App.tsx](/Users/alexhungate/Desktop/technica-core/src/App.tsx)
- [src/styles.css](/Users/alexhungate/Desktop/technica-core/src/styles.css)

### Work

- Add a mobile shell with:
  - top bar
  - single-column stacked panels
  - bottom action bar
  - larger touch targets
- Add tablet layout rules that preserve side-by-side work where helpful.
- Collapse dense desktop-only controls behind drawers or sheets.
- Make pop-out and desktop-only controls disappear in mobile mode.

### Acceptance criteria

- Phone width does not horizontally overflow.
- Tablet layout remains readable and efficient.
- Desktop layout is unchanged.

## Ticket 8: Dialogue Editor Mobile Slice

### Goal

Make Dialogue Editor the first true end-to-end mobile editor.

### Files to add

- [src/features/mobile/dialogue/MobileDialogueWorkspace.tsx](/Users/alexhungate/Desktop/technica-core/src/features/mobile/dialogue/MobileDialogueWorkspace.tsx)

### Files to modify

- [src/features/dialogue/DialogueStudio.tsx](/Users/alexhungate/Desktop/technica-core/src/features/dialogue/DialogueStudio.tsx)
- [src/features/dialogue/DialoguePreview.tsx](/Users/alexhungate/Desktop/technica-core/src/features/dialogue/DialoguePreview.tsx)
- [src/utils/dialogueDocument.ts](/Users/alexhungate/Desktop/technica-core/src/utils/dialogueDocument.ts)
- [src/styles.css](/Users/alexhungate/Desktop/technica-core/src/styles.css)

### Work

- Add a mobile-specific branch and line card UI.
- Keep speaker selection, branch creation, choice targets, and validation.
- Move flow preview into a collapsible mobile section.
- Add `Send to Desktop` for dialogue as the default primary action.

### Acceptance criteria

- Dialogue can be meaningfully edited on phone and tablet.
- Mobile can send a dialogue draft to desktop.
- Validation still works and remains visible.

## Ticket 9: Quest Editor Mobile Slice

### Goal

Bring Quest Editor to mobile using the same send-to-desktop model.

### Files to add

- [src/features/mobile/quest/MobileQuestWorkspace.tsx](/Users/alexhungate/Desktop/technica-core/src/features/mobile/quest/MobileQuestWorkspace.tsx)

### Files to modify

- [src/features/quest/QuestCreator.tsx](/Users/alexhungate/Desktop/technica-core/src/features/quest/QuestCreator.tsx)
- [src/styles.css](/Users/alexhungate/Desktop/technica-core/src/styles.css)

### Work

- Collapse objectives, rewards, and states into mobile-friendly cards.
- Keep validation and live structure awareness.
- Add `Send to Desktop` and `Request Publish` actions.

### Acceptance criteria

- Quest title, description, objectives, rewards, and follow-ups are editable on mobile.
- The UI is touch-friendly and does not require horizontal scrolling.

## Ticket 10: NPC Editor Mobile Slice

### Goal

Support quick NPC balancing and placement-ready edits from mobile.

### Files to add

- [src/features/mobile/npc/MobileNpcWorkspace.tsx](/Users/alexhungate/Desktop/technica-core/src/features/mobile/npc/MobileNpcWorkspace.tsx)

### Files to modify

- [src/features/npc/NpcEditor.tsx](/Users/alexhungate/Desktop/technica-core/src/features/npc/NpcEditor.tsx)
- [src/components/ImageAssetField.tsx](/Users/alexhungate/Desktop/technica-core/src/components/ImageAssetField.tsx)
- [src/styles.css](/Users/alexhungate/Desktop/technica-core/src/styles.css)

### Work

- Keep:
  - name
  - map id
  - tile position
  - route mode
  - route points
  - dialogue id
  - portrait/sprite image attach
- Make image fields mobile-camera and gallery friendly.
- Add `Send to Desktop` as the main mobile action.

### Acceptance criteria

- NPC edits are practical on a phone.
- Image attach works through touch/file-picker flows.

## Ticket 11: Database Mobile Slice

### Goal

Make database browsing and reference tracing available on mobile without freezing.

### Files to add

- [src/features/mobile/database/MobileDatabaseWorkspace.tsx](/Users/alexhungate/Desktop/technica-core/src/features/mobile/database/MobileDatabaseWorkspace.tsx)

### Files to modify

- [src/features/database/DatabaseExplorer.tsx](/Users/alexhungate/Desktop/technica-core/src/features/database/DatabaseExplorer.tsx)
- [src/utils/chaosCoreDatabase.ts](/Users/alexhungate/Desktop/technica-core/src/utils/chaosCoreDatabase.ts)
- [src/styles.css](/Users/alexhungate/Desktop/technica-core/src/styles.css)

### Work

- Reuse the new lazy-loading database design.
- Add:
  - search
  - content-type filter
  - selected record view
  - outbound references
  - inbound references
  - `Open in editor`
- Keep mobile layout strictly stacked and search-first.

### Acceptance criteria

- Database tab opens quickly on mobile.
- Selecting a record is fast.
- `Open in editor` sends the user into the right mobile editor screen.

## Ticket 12: Desktop Inbox And Review Queue

### Goal

Desktop needs a safe review point for incoming mobile edits.

### Files to add

- [src/features/mobile/DesktopInboxPanel.tsx](/Users/alexhungate/Desktop/technica-core/src/features/mobile/DesktopInboxPanel.tsx)

### Files to modify

- [src/App.tsx](/Users/alexhungate/Desktop/technica-core/src/App.tsx)
- [src/components/ChaosCoreDatabasePanel.tsx](/Users/alexhungate/Desktop/technica-core/src/components/ChaosCoreDatabasePanel.tsx)
- [src/styles.css](/Users/alexhungate/Desktop/technica-core/src/styles.css)
- [src-tauri/src/mobile_session.rs](/Users/alexhungate/Desktop/technica-core/src-tauri/src/mobile_session.rs)

### Work

- Show pending mobile submissions with:
  - content type
  - title/id
  - sending device
  - timestamp
  - action summary
- Add:
  - accept
  - reject
  - open in editor
  - publish to game

### Acceptance criteria

- Desktop can review incoming mobile drafts without losing local work.
- Inbox entries are removed when accepted or rejected.

## Ticket 13: Mobile Send-To-Desktop Action Bar

### Goal

Replace file-centric export on mobile with a clear action model.

### Files to add

- [src/components/mobile/MobileActionBar.tsx](/Users/alexhungate/Desktop/technica-core/src/components/mobile/MobileActionBar.tsx)

### Files to modify

- [src/features/dialogue/DialogueStudio.tsx](/Users/alexhungate/Desktop/technica-core/src/features/dialogue/DialogueStudio.tsx)
- [src/features/quest/QuestCreator.tsx](/Users/alexhungate/Desktop/technica-core/src/features/quest/QuestCreator.tsx)
- [src/features/npc/NpcEditor.tsx](/Users/alexhungate/Desktop/technica-core/src/features/npc/NpcEditor.tsx)
- [src/features/database/DatabaseExplorer.tsx](/Users/alexhungate/Desktop/technica-core/src/features/database/DatabaseExplorer.tsx)
- [src/styles.css](/Users/alexhungate/Desktop/technica-core/src/styles.css)

### Work

- Add a bottom mobile action bar with:
  - `Send to Desktop`
  - `Request Publish`
  - `Reconnect`
  - `More`
- Hide zip-centric export buttons in mobile mode.

### Acceptance criteria

- Mobile workflows do not depend on downloaded files.
- The main action is obvious and consistent across supported editors.

## Ticket 14: Session Security And Guardrails

### Goal

Prevent accidental open-LAN behavior.

### Files to modify

- [src-tauri/src/mobile_server.rs](/Users/alexhungate/Desktop/technica-core/src-tauri/src/mobile_server.rs)
- [src-tauri/src/mobile_session.rs](/Users/alexhungate/Desktop/technica-core/src-tauri/src/mobile_session.rs)
- [src/features/mobile/MobileSessionPanel.tsx](/Users/alexhungate/Desktop/technica-core/src/features/mobile/MobileSessionPanel.tsx)

### Work

- Require explicit start/stop.
- Expire pairing tokens.
- Reject unknown device/session ids.
- Add idle timeout and manual disconnect.
- Show current connected devices in desktop UI.

### Acceptance criteria

- A mobile URL is useless without a valid pairing token.
- Devices can be revoked from the desktop UI.

## Ticket 15: Phase 1 QA And Test Harness

### Goal

Make the first mobile release testable and stable.

### Files to add

- [docs/mobile-phase-1-test-plan.md](/Users/alexhungate/Desktop/technica-core/docs/mobile-phase-1-test-plan.md)

### Files to modify

- [package.json](/Users/alexhungate/Desktop/technica-core/package.json)
- [README.md](/Users/alexhungate/Desktop/technica-core/README.md)

### Work

- Add local dev commands for mobile-session testing.
- Add a manual test matrix:
  - iPhone Safari
  - iPad Safari
  - Android Chrome
  - desktop host reconnect behavior
- Add core scenario tests:
  - pair
  - send dialogue edit
  - send quest edit
  - send NPC edit
  - browse database
  - disconnect and reconnect

### Acceptance criteria

- There is a repeatable checklist for testing the full Phase 1 flow.
- The repo documents how to run the mobile session locally.

## Suggested implementation order

Build in this order:

1. Ticket 1
2. Ticket 2
3. Ticket 3
4. Ticket 4
5. Ticket 5
6. Ticket 6
7. Ticket 7
8. Ticket 8
9. Ticket 11
10. Ticket 9
11. Ticket 10
12. Ticket 12
13. Ticket 13
14. Ticket 14
15. Ticket 15

## First engineering milestone

The first milestone worth demoing is:

- desktop starts a mobile session
- phone scans QR code
- phone opens mobile shell
- phone edits a dialogue record
- phone taps `Send to Desktop`
- desktop receives it in an inbox
- desktop opens the draft and publishes it to Chaos Core

If that works cleanly, the rest of Phase 1 is an extension of a proven path rather than a pile of isolated UI work.
