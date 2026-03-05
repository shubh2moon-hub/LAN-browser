# LAN Browser

LAN Browser is an Electron desktop browser designed for local-network-first usage, with support for synchronized browsing state between peers on the same LAN.

## Project Description

This repository contains an Electron application that combines a custom browser shell with LAN-oriented collaboration features. Instead of acting like a generic wrapper around Chromium, the app is built around browser-level functionality such as tab lifecycle management, local history/bookmarks/download tracking, and peer discovery/synchronization.

In practical terms, the project aims to make browsing on a shared local network more coordinated by:
- Running as a desktop app with a custom UI and tab system
- Persisting local browsing metadata (history, bookmarks, downloads)
- Discovering peers on the local network
- Syncing selected browser events/state across connected peers

## Core Components

- **Electron main process (`main.js`)**: window creation, tab/browser view control, shortcuts, downloads interception, and IPC wiring.
- **Launcher (`start.js`)**: reliably starts Electron in app mode by clearing `ELECTRON_RUN_AS_NODE` before spawn.
- **Preload bridge (`preload.js`, `view-preload.js`)**: secure communication boundary between renderer and privileged main APIs.
- **Sync/data modules**: LAN discovery + synchronization engine and local persistence stores (history, bookmarks, downloads).

## Getting Started

### Prerequisites

- Node.js (recommended current LTS)
- npm

### Install dependencies

```bash
npm install
```

### Run

```bash
npm start
```

`npm start` executes `start.js`, which launches the Electron application.
