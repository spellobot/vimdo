# VimDo

## Introduction

VimDo is a decentralized, local-first task management application built with Electron. It combines the efficiency of Vim-style keyboard navigation with the transparency of plain-text Markdown storage. Designed for privacy and resilience, VimDo operates without a central server, allowing users to safely synchronize tasks across local network devices via a Peer-to-Peer (P2P) architecture.

**Academic Context:** This project was developed as part of the "Advanced Programming" (*Programação Avançada*) course at **ISLA Gaia**, under the guidance and request of **Prof. Luís Osório**.

## Features

* **Keyboard-Driven Workflow:** Navigate and edit tasks using Vim state modes (Normal, Command, Insert).
* **Transparent Storage:** Tasks are stored locally as `.md` files featuring YAML Frontmatter for metadata and raw Markdown for descriptions.
* **Decentralized P2P Sync:** Devices discover each other locally via mDNS (Zero-configuration) and synchronize tasks using an HTTP transport layer with a Last-Write-Wins (LWW) conflict resolution strategy.
* **Privacy First:** No cloud accounts or central servers are required. Data remains entirely on your local machine until explicitly shared with the network.
* **Secure Architecture:** Built with strict Electron security policies, including Context Isolation (IPC) and strict Content-Security-Policy (CSP) to prevent XSS and CSS injection attacks.

## Installation

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* Git

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/spellobot/vimdo.git
   cd vimdo
   ```
2. Install the required dependencies:
   ```bash
   npm install
   ```
3. Run the application:
   ```bash
   npm start
   ```

## Usage

VimDo relies on three operational modes, seamlessly switched via the keyboard.

### Operating Modes
* **Normal Mode (`Esc`):** The default mode for navigation. Use `j` (down) and `k` (up) to select tasks. Press `x` to quickly toggle the task status (pending/completed).
* **Insert Mode (`i` or `a`):** Switches to the raw Markdown text editor. Press `Esc` to save changes, trim trailing whitespaces, and return to Normal Mode.
* **Command Mode (`:`):** Opens the command prompt at the bottom bar to manage files, tags, and trigger network operations. Press `Enter` to execute.

### Available Commands

| Action | Command | Example |
|---|---|---|
| **Create Task** | `new [folder]/[title]` or `new [title]` | `:new Projects/Fix Login` |
| **Delete Task** | `del [folder]/[title]` or `del` | `:del` *(Deletes active task)* |
| **Navigate Folder** | `cd [folder]` | `:cd Projects` *(Use `/` to clear)* |
| **Filter by Tag** | `tag [name]` | `:tag work` |
| **Manage Tags** | `tag+ [name]` / `tag- [name]` | `:tag+ urgent` |
| **Set Priority** | `priority [low/medium/high]` | `:priority high` |
| **Toggle Status** | `done`, `undo`, or `toggle` | `:done` |
| **Share Active Task** | `push` or `share` | `:push` *(P2P Broadcast)* |
| **Sync All Tasks** | `sync` | `:sync` *(P2P Broadcast)* |

## Contributing

We welcome contributions to VimDo. Please follow the standard Git workflow and adhere to the [Conventional Commits](https://www.conventionalcommits.org/) specification for your commit messages to ensure an atomic and readable history.

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m "feat: implement amazing feature"`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

---
**License:** GPL-3.0-only