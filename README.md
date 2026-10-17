# MK V10 App

Web Bluetooth workbench for the PXN V10 Ultra (advertises as `PXN-V10 PRO`). Reverse-engineering tool today, custom settings app once the protocol is mapped.

## BLE layout (observed)

Service `0xFFE0`, unbonded:

| Char | Props | Role (inferred) |
|------|-------|-----------------|
| `FFE1` | Read, Write | Settings block (22 bytes observed) |
| `FFE2` | Write | Command channel (app -> wheel) |
| `FFE4` | Notify | Responses / events (wheel -> app) |

Sample `FFE1` read: `60 01 10 09 01 01 07 9C 55 00 20 14 00 00 00 00 00 00 00 0C 00 FF`

## Use

1. Serve over HTTPS (GitHub Pages: Settings -> Pages -> `main` / root).
2. Open in Chrome on Android (Web Bluetooth is not available on iOS Safari).
3. Disconnect nRF Connect and the stock PXN NEXUS app first. Only one BLE client can connect.
4. Connect, then use Snapshot / Compare to map which bytes change per setting.

## Safety

Raw write is locked behind a checkbox. Only replay packets captured from the stock app. Unknown writes to an FFB base can spike torque or corrupt config.

## Roadmap

- [ ] Map `FFE1` bytes (FFB strength, steering angle, dead zones)
- [ ] Capture `FFE2` command format from NEXUS (HCI snoop log)
- [ ] Real settings UI with per-game profiles
- [ ] PWA manifest + service worker

---

# Kater (telemetry)

Racing game telemetry for phone or PC browser. Lives next to the V10 workbench in this repo (repo is being renamed to `kater`).

```
game --UDP--> relay (Node, on your PC) --WebSocket--> dashboard (phone / browser)
```

Each game gets an adapter in `relay/src/adapters/` that writes into one shared frame (`relay/src/schema.js`). The dashboard only reads that frame, so adding a game = adding one adapter.

## Run

```bash
cd relay
npm install
npm run sim      # fake data, no game needed
npm start        # listen for real games
```

Open the printed `http://<pc-ip>:8080` on your phone (same Wi-Fi, or over Tailscale). The relay serves the dashboard itself, because an https GitHub Pages page can't open a `ws://` connection to a LAN relay.

Env overrides: `HTTP_PORT` (8080), `F1_PORT` (20777), `FORZA_PORT` (5300). Allow those through the PC firewall (UDP in, TCP 8080).

## Game setup

| Game | Status | In-game setting |
|------|--------|-----------------|
| F1 24 / 25 / 26 | adapter done (format 2024+) | Telemetry Settings -> UDP ON, IP = PC, port 20777, format 2024 or newer |
| Forza Motorsport / Horizon 4 / 5 | adapter done | HUD -> Data Out ON, IP = PC, port 5300 |
| ACC | planned | shared memory needs a Windows-side reader |
| Trackmania | planned | needs an OpenPlanet plugin, no native feed |
| Project Motor Racing | unknown | check whether it exposes anything |
| iRacing / AC / rF2 / AMS2 | later | |

Packet offsets are from the community docs, tested against synthetic packets only (`npm test`). First live session: check speed, gear, tyre order and lap times against the in-game HUD. TODOs are flagged in the adapter files.

## Roadmap

- [ ] Verify F1 26 + Forza Motorsport 2023 against live captures
- [ ] ACC adapter (Windows shared memory reader)
- [ ] Lap history + session recording to JSON
- [ ] Capacitor Android wrapper (allow cleartext for the LAN relay)
