# Technica Mobile Architecture

## Goal

Build a phone and tablet companion for Technica without making the App Store or Play Store the primary distribution path.

The safest product shape is:

- Desktop Technica stays the main app and source of truth.
- Mobile Technica runs as a responsive web app.
- The desktop app can host a local session that phones and tablets join over the local network.
- Publishing to Chaos Core still happens on the desktop side.

## Product shape

### Desktop

- Owns the project files.
- Owns Chaos Core repo integration.
- Owns runtime bundle export and direct publish-to-game.
- Owns conflict resolution, validation, and database write-back.

### Tablet

- Near-full editor surface.
- Dialogue, quests, NPCs, maps, and database browsing should all be usable.
- Best target for field authoring, balancing, and review.

### Phone

- Fast companion workflow, not full desktop parity.
- Best for dialogue revisions, quest text changes, NPC edits, approvals, search, and review.
- Map work on phone should be light-touch placement and inspection, not heavy layout work.

## Core idea

### Desktop-hosted mobile session

The desktop app should offer a `Start Mobile Session` action.

That flow should:

1. Start a small local Technica web server.
2. Create a short-lived pairing token.
3. Show a QR code and local address.
4. Let the phone or tablet join the session in the browser.
5. Keep the desktop project as the canonical source of truth.

Example:

- Desktop starts session at `https://192.168.1.14:4174`
- Mobile opens `https://192.168.1.14:4174/pair/ABCD-1234`

## Why this is the right shape

- No app store submission needed for the main mobile path.
- One shared frontend can power desktop, tablet, and phone.
- Mobile does not need direct filesystem or repo access.
- Export stays simple because the desktop already knows how to publish into Chaos Core.
- Users do not need to handle zip files on phones.

## Runtime architecture

### Desktop shell

- Tauri desktop app remains the primary shell.
- Rust side adds a mobile session server and pairing/session management.
- The React app gains a responsive mobile layout mode.

### Mobile client

- Browser-first web app.
- Installable to the home screen where supported.
- Works as a paired client into a live desktop session.
- Stores a small local draft cache so temporary disconnects are survivable.

### Session layer

- Pair device to desktop with a short-lived token.
- Issue a session id after pairing.
- Sync deltas instead of rewriting entire documents on every keystroke.
- Keep an activity log so the desktop can show what changed and from which device.

## Data ownership

Use a hub-and-spoke model.

- Desktop project is canonical.
- Mobile device holds a working cache only.
- Desktop persists official draft state and export artifacts.
- Mobile changes are treated as edits against the desktop project, not as separate standalone projects.

This keeps the Chaos Core integration clean because the desktop already owns:

- generated content
- manifests
- sidecar source files
- asset copying
- publish-to-game

## Sync model

### Recommended sync format

Use document-level operations with small patches:

- `replace_field`
- `insert_list_item`
- `update_list_item`
- `remove_list_item`
- `move_list_item`

That is enough for the current Technica editors and easier to reason about than a full CRDT stack.

### Conflict model

For MVP mobile sync:

- Single-writer per document at a time.
- Desktop may lock a document while publishing.
- If the same record is edited in two places, show a merge/review screen instead of silently blending them.

This is much more practical than trying to build full collaborative editing on day one.

## Mobile UX by area

### Dialogue

- Tablet: full branch editor, sticky flow preview, speaker picker, branch collapsing.
- Phone: conversation cards, branch jump controls, validation, quick line edits, speaker dropdown.

### Quest

- Tablet: near-desktop forms.
- Phone: stacked cards for objectives, rewards, and states with collapsible sections.

### Map

- Tablet: review, inspect, NPC placement, object placement, metadata editing, zoom/pan.
- Phone: view map, inspect tiles/zones/objects, place NPCs, edit labels and metadata.
- Heavy tile painting should remain a desktop-first workflow.

### Database

- Tablet and phone: search-first browser, filters, reference tracing, open-in-editor.
- Use aggressive lazy loading so the database never stalls the UI.

## Export model

Phones and tablets should not be file-first.

### Primary action

Use `Send to Desktop`.

That action should:

1. Validate the current document on mobile.
2. Send the draft update to the paired desktop session.
3. Let the desktop store it in the project immediately.
4. Optionally surface it in a desktop review queue.

### Secondary actions

- `Publish to game`
  This is really a request to the desktop app. The desktop performs the actual publish.
- `Create bundle`
  Desktop builds the zip and keeps it in the project export history.
- `Share`
  Mobile can share a link, summary, or lightweight bundle through the OS share sheet when useful.

### Export history

Add an export history panel on desktop:

- who exported
- when
- what content changed
- which target was used
- whether it was published into Chaos Core

That gives mobile authors confidence without forcing them into filesystem workflows.

## Asset handling

Mobile is actually useful for assets if the workflow is right.

### Phone/tablet asset actions

- Take photo
- Pick from gallery
- Crop
- Mark usage type: portrait, icon, sprite, card art
- Send to desktop project

### Desktop side

- Normalize file names
- Convert to repo-safe asset paths
- Copy into the Technica/Chaos Core asset area
- Update the related content record

The mobile client should never need to understand Chaos Core’s final asset path rules.

## Security model

If Technica hosts on the local network, do not make it an open unauthenticated LAN tool.

Use:

- explicit `Start Mobile Session`
- short-lived pairing token
- per-device session ids
- local network allowlist for the current session
- optional session timeout and disconnect button

If HTTPS is practical for the hosted mobile session, prefer it. If not, keep the LAN session explicitly local, temporary, and opt-in.

## Failure handling

### If the mobile device disconnects

- Keep a local unsynced change queue.
- Show `Waiting to reconnect`.
- Retry in the background.
- Let the user discard or retry if the desktop session ends.

### If the desktop closes

- Mobile becomes read-only except for local cached drafts.
- Offer `Reconnect to desktop` or `Export local draft summary`.

## Suggested implementation phases

### Phase 1

- Responsive tablet/phone layouts in the existing React app.
- `Start Mobile Session` on desktop.
- QR pairing.
- Read/write mobile session for dialogue, quest, NPC, and database.
- `Send to Desktop` as the default mobile action.

### Phase 2

- Tablet map review and NPC placement.
- Mobile asset capture and upload.
- Desktop export history and review queue.
- Session presence and simple document locking.

### Phase 3

- Richer tablet map editing.
- Offline local draft queue on mobile.
- Optional remote relay mode for use outside the home LAN.
- Better multi-user review workflows.

## Recommendation

If we build this, the first shipping version should be:

- Desktop Technica as it exists now
- a tablet-friendly responsive mobile web client
- desktop-hosted mobile sessions over the local network
- desktop-owned export and publish

That gives you a practical mobile Technica without app-store dependency and without forcing phone users into manual file management.

## Next document

For the concrete Phase 1 delivery plan, see [mobile-phase-1-backlog.md](/Users/alexhungate/Desktop/technica-core/docs/mobile-phase-1-backlog.md).
