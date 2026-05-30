<p align="center">
  <img src="./assets/banner.jpg" alt="localports" width="100%" />
</p>

<p align="center">
  A beautiful interactive TUI for managing localhost ports — macOS and Linux.<br/>
  See what's running, kill it, restart it in a new tab, tunnel it live, relaunch recent dev servers without remembering the command.
</p>

<br/>

<p align="center">
  <img src="./assets/ss.png" alt="localports preview" width="100%" />
</p>

<br/>

## Install

```sh
npm install -g localports
```

Or run without installing:

```sh
npx localports
```

## Usage

```sh
localports
```

Scans all listening TCP ports every 2 seconds. Dev ports appear as cards, system daemons in a compact row at the bottom.

## Keys

| Key | Action |
|-----|--------|
| `↑` `↓` or `j` `k` | Navigate |
| `x` | Kill selected port (SIGTERM) |
| `o` | Open in browser |
| `r` | Restart (kills + reopens in new terminal tab) |
| `t` | Tunnel — expose port publicly via Cloudflare or ngrok |
| `/` | Enter filter mode |
| `esc` | Clear filter / quit |
| `q` | Quit |

**When a history entry is selected:**

| Key | Action |
|-----|--------|
| `r` | Start — opens a new terminal tab and runs the last command |
| `x` | Remove from history |

## Features

**Live scanning** — ports appear and disappear in real time as processes start and stop.

**Smart labels** — resolves process titles like `next-server (v16.1.6)` back to readable names like `next dev`. Shows the working directory and uptime for each port.

**Kill is instant** — the card vanishes the moment you press `x`. If the process ignores SIGTERM and survives 4 seconds, the card reappears.

**Restart in new tab** — `r` kills the process and reopens the command in a new terminal tab so you can see the output. Resolves the right command from `package.json` scripts and detects your package manager (npm/pnpm/yarn/bun).

**Port history** — when a dev port disappears, it moves to a *recent* section. Navigate to it and press `r` to relaunch without searching for the command.

**Filter** — press `/` to enter filter mode. Type to match by port number, command name, or directory. `esc` clears.

**System port grouping** — repeated processes are collapsed into a single line (e.g. Code Helper ×3).

**Quick tunnel** — press `t` on any dev port to expose it publicly via a Cloudflare quick tunnel or ngrok. The public URL appears on the card the moment it's ready. Press `t` again to tear it down. The tunnel is automatically cleaned up when the port process exits.

## Terminal support

**macOS** — opened via AppleScript or System Events (Warp/Ghostty require Accessibility permission on first use).

| Terminal | Method |
|----------|--------|
| iTerm2 | AppleScript — native tab API |
| Terminal.app | AppleScript — new tab |
| Warp | System Events — `⌘T` + keystrokes |
| Ghostty | System Events — `⌘T` + keystrokes |
| Others | Terminal.app fallback |

**Linux** — detected via environment variables, spawned directly.

| Terminal | Detection |
|----------|-----------|
| kitty | `$KITTY_WINDOW_ID` |
| WezTerm | `$WEZTERM_PANE` |
| Konsole | `$KONSOLE_VERSION` |
| Tilix | `$TILIX_ID` |
| GNOME Terminal | `$VTE_VERSION` |
| Others | `x-terminal-emulator` fallback |

## Requirements

- macOS or Linux
- Node.js 18+
- For tunneling: [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (recommended, no account needed) or [`ngrok`](https://ngrok.com/download)

## Contributing

PRs welcome.

```sh
git clone https://github.com/moh-hit/localports
cd localports
npm install
npm run dev
```

## License

MIT
