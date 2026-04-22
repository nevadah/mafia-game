# System Dependencies

This document covers everything that must be installed **outside the project folder** to develop and test this project, including where each tool installs itself on disk. Use this as a cleanup reference if you want to fully remove the development environment from a machine.

---

## System Requirements

These must be installed before running `npm install`.

### Node.js and npm

Node.js bundles npm. The project requires Node 20+; the CI pipeline pins to Node 20.

| Platform | Default install path | Notes |
|---|---|---|
| Windows (official installer) | `C:\Program Files\nodejs\` | Adds to system PATH |
| Windows (nvm-windows) | `%APPDATA%\nvm\` | Per-version dirs inside |
| macOS (official pkg) | `/usr/local/bin/node`, `/usr/local/lib/node_modules/` | |
| macOS (Homebrew) | `/opt/homebrew/bin/node` (Apple Silicon) or `/usr/local/bin/node` (Intel) | |
| macOS (nvm) | `~/.nvm/versions/node/` | Per-version dirs inside |

### Git

| Platform | Default install path |
|---|---|
| Windows (Git for Windows) | `C:\Program Files\Git\` |
| macOS (Xcode CLT) | `/usr/bin/git` |
| macOS (Homebrew) | `/opt/homebrew/bin/git` |

Git for Windows also provides the Bash shell used by the project's `.sh` dev scripts.

---

## npm Install — External Locations

Running `npm install` in the project root writes all packages to `node_modules/` **inside** the project folder. However, two things land outside it:

### npm Package Cache

npm caches downloaded package tarballs to avoid re-downloading them on future installs.

| Platform | Path | Approximate size (after install) |
|---|---|---|
| Windows | `%LOCALAPPDATA%\npm-cache\` | ~74 MB |
| macOS | `~/.npm/` | ~74 MB |

To clear: `npm cache clean --force`

### Electron Binary Cache

The `electron` package (v41) downloads a platform-specific Electron runtime during `npm install` via a postinstall script. This binary is cached separately from the npm package cache.

| Platform | Path | Approximate size |
|---|---|---|
| Windows | `%LOCALAPPDATA%\electron\Cache\` | ~343 MB |
| macOS | `~/Library/Caches/electron\` | ~343 MB |

To clear: delete the directory manually.

---

## Playwright — Browser Binaries

Running `npx playwright install --with-deps` downloads browser engines used by the e2e test suite.

| Platform | Path | Approximate size |
|---|---|---|
| Windows | `%LOCALAPPDATA%\ms-playwright\` | ~1.2 GB |
| macOS | `~/Library/Caches/ms-playwright\` | ~1.2 GB |

Browsers installed (as of Playwright 1.58):

| Browser | Version |
|---|---|
| Chromium | 1208 |
| Chromium Headless Shell | 1208 |
| Firefox | 1509 |
| WebKit | 2248 |
| ffmpeg | 1011 |
| WinLDD (Windows only) | 1007 |

To clear: `npx playwright uninstall --all`, or delete the directory manually.

The `PLAYWRIGHT_BROWSERS_PATH` environment variable can redirect the install location if you want to store browsers elsewhere.

---

## Beads (`bd`) — Issue Tracker

The project uses [Beads](https://github.com/steveyegge/beads) for task tracking. It is a separate CLI tool that must be installed independently of `npm install`.

Beads depends on [Dolt](https://github.com/dolthub/dolt), a version-controlled SQL database.

### Installing on macOS

```bash
brew install beads
```

Homebrew installs to `/opt/homebrew/` (Apple Silicon) or `/usr/local/` (Intel). Dolt is installed as a dependency.

### Installing on Windows

A Windows installation method for Beads is not yet documented for this project. See the [Beads GitHub repository](https://github.com/steveyegge/beads) for current instructions.

### First-time setup (after install)

```bash
bd setup claude   # Installs Claude Code session hooks
```

### Data storage

Beads stores its Dolt database in a location managed by Dolt itself, separate from the git repository. The exact path depends on how Dolt is configured. Run `dolt config --global --list` to see the configured data directory.

---

## Global npm Packages

This project does not require any globally installed npm packages. All CLI tools (`ts-node`, `jest`, `playwright`, `eslint`, `prettier`) are installed as project-local devDependencies and invoked via `npm run` scripts or `npx`.

---

## Summary Cleanup Checklist

To fully remove the development environment from a machine after cloning this project:

| Item | Windows | macOS |
|---|---|---|
| Project folder (node_modules, build artifacts) | Delete project directory | Delete project directory |
| npm cache | `%LOCALAPPDATA%\npm-cache\` | `~/.npm\` |
| Electron binary cache | `%LOCALAPPDATA%\electron\Cache\` | `~/Library/Caches/electron\` |
| Playwright browsers | `%LOCALAPPDATA%\ms-playwright\` | `~/Library/Caches/ms-playwright\` |
| Node.js | Uninstall via Add/Remove Programs | Depends on install method (see above) |
| Git | Uninstall via Add/Remove Programs | Depends on install method |
| Beads / Dolt | Depends on install method | `brew uninstall beads dolt` |
