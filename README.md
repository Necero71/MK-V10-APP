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
