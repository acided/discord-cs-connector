# CS2 AutoConnect

Watches a Discord message and joins the CS2 server the moment a `connect IP:PORT; password PASS` line appears in it, either in the message text or in an embed.

- **Instant join**: the command goes straight to the CS2 console over NetCon (TCP), with no clicks and no alt-tab.
- **Fallback**: if CS2 isn't reachable over NetCon, the app opens `steam://connect/...`.
- **Real-time**: edits stream in through the Discord Gateway (WebSocket) instead of polling.

> ⚠️ **Disclaimer.** The app logs in with a Discord *user* token (a self-bot). That breaks the [Discord Terms of Service](https://discord.com/terms) and can get your account banned. Use it at your own risk. The project is for educational purposes.

## Quick start

Requires Node.js 22+ (for building and tests; the app itself runs on the Node bundled with Electron).

```powershell
npm install
npm start
```

1. Add `-netconport 2121` to the CS2 launch options in Steam (Properties → Launch Options).
2. Start the app and fill in **Discord token**, **Channel ID** and **NetCon port**.
3. Paste the **Message ID** and press **START**.

The config is stored in `%APPDATA%\cs2-autoconnect\config.json`. The token is encrypted with Windows DPAPI (`safeStorage`). `config.example.json` shows the file format.

**How to get IDs:** Discord → Settings → Advanced → Developer Mode, then right-click a channel or message → *Copy ID*.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Build and run the app |
| `npm run build` | Bundle into `out/` (esbuild) |
| `npm run typecheck` | Type-check main/preload and renderer |
| `npm test` | Unit tests (`node:test`) |
| `npm run dist` | typecheck + tests + portable `.exe` in `release/` |

## Architecture

```
src/
├── shared/                  # Code shared by every process; no Node/DOM dependencies
│   ├── types.ts             # Domain types: ConnectInfo, NetConStatus, MonitorState…
│   ├── config.ts            # AppConfig, defaults, validation
│   ├── events.ts            # AppEvent: events from main → renderer
│   ├── ipc.ts               # Typed IPC contract (channels + arguments + results)
│   ├── api.ts               # The window.api interface
│   └── result.ts            # Result<T> instead of throwing across IPC
├── main/                    # Electron main process
│   ├── index.ts             # Composition root: builds the services and wires the dependencies
│   ├── window.ts            # BrowserWindow (sandbox, navigation blocked)
│   ├── ipc-handlers.ts      # IPC handlers on top of the services
│   ├── config/              # ConfigStore + token encryption (SecretCodec)
│   ├── discord/             # REST client, Gateway client, Discord API types
│   ├── monitor/             # MonitorService (orchestration) + connect-parser
│   └── game/                # NetConClient (TCP to CS2) + GameLauncher (NetCon → Steam)
├── preload/index.ts         # contextBridge: exposes the typed window.api
└── renderer/                # UI in vanilla TS
    ├── app.ts               # Wires the views to the API and maps AppEvent to the UI
    └── views/               # ConfigForm, ControlPanel, ResultPanel, LogPanel
test/                        # Tests for the parser, MonitorService and ConfigStore
scripts/build.mjs            # esbuild: main/preload (cjs) + renderer (iife)
```

### Data flow

```
START ─► MonitorService.start()
          ├─ REST snapshot ──► parseConnect ──► found? ──► GameLauncher ──► NetCon │ steam://
          └─ GatewayClient ──► MESSAGE_UPDATE ──► parseConnect ──► (new server?) ──► GameLauncher
                 └─ every (re)connect ──► repeat the REST snapshot (resync)
```

- **MonitorService** decides when to launch. It drops stale versions of the message (by `edited_timestamp`) and repeats of the same server. After each Gateway reconnect it resyncs, so edits made while offline aren't lost.
- **GatewayClient** detects zombie connections (missing heartbeat ACK), resumes the session (op 6), handles op 7/9 and reconnects with exponential backoff. On fatal close codes (4004 invalid token, and others) it stops and reports the error.
- **NetConClient** holds a persistent TCP connection to `127.0.0.1:<port>` and retries every 5 s, because CS2 can be started later.
- **The renderer** has no business logic. It calls `window.api` and draws the `AppEvent`s it receives.
