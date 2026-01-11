# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

awrit (Actual Web Rendering in Terminal) is a graphical web browser for the Kitty terminal. It uses Electron/Chromium to render web content and displays it using the Kitty graphics protocol with full mouse and keyboard support.

## Commands

```bash
# Run the browser
bun run index.ts [url]
bun run index.ts --dev          # Dev mode with Vite hot reload for toolbar

# Formatting and linting (Biome)
bun run format                  # Format all files
bun run lint                    # Check for lint errors
bun run lint-fix                # Auto-fix lint errors

# Type checking
bun run typecheck

# Testing
bun test                        # Run all tests
bun test src/layout.test.ts     # Run specific test file

# Terminal protocol testing
bun run input-test              # Test TTY input handling
bun run gfx-test                # Test Kitty graphics protocol

# Build native Rust bindings
cd awrit-native-rs && bun run build
```

## Architecture

The browser runs as two coordinated Electron BrowserWindows rendered to a single terminal:

```
┌─────────────────────────────────────────┐
│ Toolbar (40px) - Solid.js + Tailwind    │  ← src/toolbar/
├─────────────────────────────────────────┤
│                                         │
│ Content Window - Web page               │  ← Managed by src/windows.ts
│                                         │
└─────────────────────────────────────────┘
         ↓ Kitty Graphics Protocol
    Terminal (TTY output via Rust NAPI)
```

### Key Components

- **src/index.ts** - Main entry point, initializes Electron app and coordinates all subsystems
- **src/windows.ts** - Creates and manages toolbar/content BrowserWindows, handles navigation events
- **src/layout.ts** - Layout engine converting between device pixels and terminal cells
- **src/paint.ts** - Coordinates rendering frames to terminal via Kitty graphics protocol
- **src/inputHandler.ts** - Processes raw terminal input, dispatches to Electron windows
- **src/keybindings.ts** - Vim-style keybinding system with multi-key sequence support

### Terminal I/O (src/tty/)

- **kittyGraphics.ts** - Implements Kitty graphics protocol for image transmission
- **graphics.ts** - Abstractions for frame rendering with SHM buffer support
- **escapeCodes.ts** - ANSI escape code generation
- **output.ts** - Buffered terminal output

### Native Layer (awrit-native-rs/)

Rust NAPI bindings providing:
- Raw terminal input handling via crossterm
- Terminal feature detection (kitty keyboard, graphics support)
- Efficient graphics buffer operations

### IPC (src/ipc/)

Type-safe IPC wrappers for Electron main↔renderer communication.

## Configuration

User settings in `config.js`:
- `homepage` - Default URL
- `keybindings` - Custom key mappings (platform-aware: `mac` vs `default`)

The config file is watched and hot-reloaded.

## CLI Options

```
awrit [url]
  --dev/-d           Dev mode (Vite toolbar at localhost:5173, opens DevTools)
  --no-paint/-n      Disable terminal painting
  --transparent/-t   Transparent window background
  --debug-paint/-p   Log graphics protocol output
  --rebuild/-r       Force rebuild toolbar
```
