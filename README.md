# Distributed Task Management System (Electron + Markdown P2P)

This project consists of a task management application (To-Do) developed in Electron, focused on lightweight performance, data privacy via local plain-text storage (Markdown), keyboard control (Vim-style commands), and decentralized Peer-to-Peer (P2P) synchronization.

License: GPL-3.0-only

---

## 1. System Architecture

The application adopts the standard Electron security and process isolation model, dividing itself into three distinct layers.

### Main Process

Runs in a Node.js environment and holds full operating system privileges. Its responsibilities include:

* Managing the application lifecycle and native windows (`BrowserWindow`).
* Direct file system access for data persistence.
* Executing the P2P network engine for synchronization.
* Maintaining a data index in RAM for efficient queries.

### Renderer Process

Runs in an isolated Chromium environment. It is strictly responsible for:

* Presenting the graphical user interface (UI) using HTML, CSS, and Vanilla JavaScript (or ultra-lightweight libraries).
* Capturing user keyboard events.
* Executing the state machine for Vim commands.

### Preload Script

Acts as a secure Inter-Process Communication (IPC) bridge between the Renderer and the Main Process. It uses the `contextBridge` API to expose strict, secure functions to the interface, preventing direct Chromium access to native Node.js APIs.

---

## 2. Data Model and Persistence

The system stores each task as an independent file with the `.md` extension. The file system functions as the structured database.

### Hybrid Naming Strategy

To ensure data integrity during distributed synchronization, files utilize the following naming convention:
`[IMMUTABLE_ID]-[TITLE_SLUG].md`

* **Immutable ID:** A identifier based on the creation timestamp (e.g., `202605271700`). It functions as the distributed primary key. The file name never changes regarding the ID, shielding the P2P algorithm against orphan file conflicts.
* **Title Slug:** A conversion of the task title to lowercase, removing accents and special characters, separated by hyphens. If the title changes, only this section of the file name is updated.

### Front Matter (YAML)

Task metadata resides at the top of the file, delimited by `---`. The descriptive content in Markdown resides immediately below.

```yaml
---
id: "202605271700"
title: "Study for Advanced Programming"
priority: "high"
status: "pending"
tags: [university, electron]
updated_at: 1779984600000
---

Here resides the detailed description of the task in raw Markdown format.

```

### Performance Optimization (Two-Phase Reading)

1. **Listing Phase (Fast):** When loading a folder, the Main Process reads only the lines that compose the YAML block of each file. It populates the in-memory index and displays the list in the UI within milliseconds.
2. **Detail Phase (Lazy Loading):** The Markdown text content below the YAML is only read from disk and rendered into HTML when the user explicitly selects that task.

---

## 3. Interface and Command Line Interface (Vim Mode)

The interface adopts a split-pane layout: the left sidebar lists the tasks of the current folder, and the right panel displays the details of the focused task. Navigation is performed strictly via keyboard.

### Keyboard State Machine

* **Normal Mode (Navigation):** Keys perform structural actions (e.g., `j`/`k` to navigate vertically). The cursor assumes a solid block format.
* **Command Mode (Palette):** Activated with the `:` key. It focuses an input field in the status bar to enter text commands.
* **Insert Mode (Editing):** Activated with the `i` key. It replaces the HTML view with a plain text area to edit raw Markdown. `Esc` reverts to Normal Mode.

### Command Parser

To avoid ambiguities caused by spaces in folder names or titles, the command line uses the forward slash (`/`) as a path delimiter.

| Action | Global Command | Contextual Command (Active folder) |
| --- | --- | --- |
| Create Task | `new [folder]/[title]` | `new [title]` |
| Delete | `del [folder]/[title]` | `del` *(Deletes the selected task)* |
| Navigate to Folder | `cd [folder]` or `open [folder]` | — |
| View Details | `open [folder]/[title]` | `open` *(Opens the selected task)* |
| Filter by Tag | `tag [tag-name]` | — |

---

## 4. Network Layer and P2P Synchronization

The network engine follows the Strategy design pattern to isolate synchronization logic from the application business logic.

### Phase 1: File-Based Synchronization (Initial Implementation)

* **Detection:** The Main Process uses `chokidar` to monitor local changes. When a file is saved, a SHA-256 hash of the content is calculated.
* **Transmission:** Peers on the local network communicate via sockets. Whenever a file changes, the corresponding ID and hash are shared. If the remote peer has a different hash, it requests the full file.
* **Conflict Resolution (Last-Write-Wins):** If concurrent offline modifications occur, the system validates the `updated_at` field in the YAML. The file with the most recent timestamp overwrites the older one. The superseded file is moved to a backup folder (`.trash/`) to prevent data loss.

### Phase 2: Real-Time Synchronization (Extensibility)

The abstract interface of the `SyncEngine` allows the file-based provider to be replaced by a CRDT-based provider (such as `Yjs` or `Automerge`). In that future scenario, the system will transmit only character insertion/deletion deltas when triggering text mutations.

---

## 5. Project Directory Structure

```text
todo-electron-p2p/
├── src/
│   ├── main/
│   │   ├── index.js          # Electron Initialization and Lifecycle
│   │   └── storage.js        # Data Engine (YAML Parser, File Watcher, Indexes)
│   ├── preload/
│   │   └── index.js          # Secure IPC Bridge (contextBridge)
│   └── renderer/
│       ├── index.html        # HTML structure of the split-pane layout
│       ├── styles.css        # UI and Status Bar styles
│       └── app.js            # Keyboard Capture and Vim State Machine
├── tasks/                    # Default local directory for storing .md files
├── .gitignore                # File filters for the Git repository
├── LICENSE                   # Full text of the GPL-3.0 license
└── package.json              # Project configuration and dependencies

```

---

## 6. Incremental Development Plan (Commit Structure)

Development must strictly follow the sequence below to ensure an atomic Git history through the Conventional Commits standard.

### Phase 1: Basic Infrastructure

* `chore: initialize node project and structure folders`
* `docs: add gpl-3.0 license and base readme`

### Phase 2: Lifecycle and Initial Interface

* `feat: implement main process and window initialization`
* `feat: create basic html and css interface for the renderer`

### Phase 3: Data Engine (Core)

* `feat: create storage manager for atomic reading and writing`
* `feat: implement front matter yaml and markdown parser`
* `feat: create in-memory indexer and tag search`
* `feat: integrate chokidar for active file system observation`

### Phase 4: Security Integration (IPC)

* `feat: define preload script and secure ipc bridge contract`
* `feat: implement ipc handlers in main process for the data engine`

### Phase 5: Keyboard Control (Vim)

* `feat: implement text parser for command mode`
* `feat: create state machine for vim normal and insert modes`
* `feat: render metadata and markdown content in ui`

### Phase 6: P2P Layer

* `feat: design abstract syncengine interface for network protocol`
* `feat: implement p2p file replication with last-write-wins strategy`