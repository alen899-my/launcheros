# DevLaunch 🚀

> A beautiful desktop project launcher with integrated terminal — manage all your dev projects from one place.

## Features

- **Multi-project management** — Add unlimited projects with name, icon, folder path, and start command
- **One-click launch** — Run any project instantly with the ▶ Run button
- **Live terminal view** — Real-time stdout/stderr streaming per project with ANSI colors
- **Multi-tab terminal** — Each project gets its own terminal tab
- **Process control** — Start and stop processes cleanly
- **Quick command hints** — npm, yarn, pnpm, python, go, cargo, docker-compose and more
- **Search & filter** — Search by name/tags, filter by running/stopped
- **Project metadata** — Emoji icons, color accents, tags, descriptions
- **Cross-platform** — Linux (AppImage, .deb) and Windows (NSIS installer, portable)
- **Persistent storage** — Projects saved to user data directory

## Screenshots

The app has three main areas:
1. **Sidebar** — Project list with live status indicators and running count
2. **Cards grid** — Project cards with path, command, tags, run/stop buttons
3. **Terminal panel** — Tabbed terminal with ANSI color output and stdin input

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 8

> **Linux users:** For native module support (optional `node-pty`), you may need:
> ```bash
> sudo apt-get install build-essential python3
> ```

## Quick Start (Development)

```bash
# 1. Clone / download and enter the folder
cd devlaunch

# 2. Install dependencies
npm install

# 3. Run in development mode
npm start
```

## Build for Distribution

### Linux (AppImage + .deb)
```bash
npm run build:linux
```

### Windows (.exe installer + portable)
```bash
npm run build:win
```

### Both platforms
```bash
npm run build:all
```

Built files are output to the `dist/` directory.

---

## Cross-compiling Notes

- **Building Windows `.exe` on Linux** requires `wine` and `mono`:
  ```bash
  sudo apt-get install wine mono-complete
  npm run build:win
  ```
- **Building Linux on Windows** works natively with WSL2 or Docker.

## Project Data Storage

Projects are saved as JSON in your OS user data directory:

| Platform | Path |
|----------|------|
| Linux    | `~/.config/devlaunch/projects.json` |
| Windows  | `%APPDATA%\devlaunch\projects.json` |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New project |
| `Escape` | Close modal |

## Tech Stack

- **Electron** 28 — Desktop shell
- **Vanilla JS** — Zero-framework renderer (fast, no bloat)
- **Node.js child_process** — Process spawning & streaming
- **CSS Variables** — Full dark theme with teal accent

## Architecture

```
devlaunch/
├── src/
│   ├── main/
│   │   └── main.js          ← Electron main process
│   │                           (window, IPC, process management)
│   ├── preload/
│   │   └── preload.js       ← Secure context bridge
│   └── renderer/
│       └── index.html       ← Full UI (HTML + CSS + JS)
├── assets/
│   ├── icon.png             ← App icon (Linux)
│   └── icon.ico             ← App icon (Windows)
└── package.json
```

## Customizing

**Add more quick-command hints:** Edit the `cmd-hints` section in `index.html`.

**Change color palette:** Edit the CSS variables at the top of `index.html` (`:root { ... }`).

**Change default terminal height:** Edit `--term-h: 320px;` in the `:root` block.
