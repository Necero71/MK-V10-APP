// EA/Codemasters F1 UDP adapter (F1 24 / F1 25 / F1 26 format, packetFormat >= 2024).
// In-game: Settings -> Telemetry Settings -> UDP Telemetry ON,
// IP = the PC running the relay (or 127.0.0.1), port 20777, format 2024+.
//
// Layout notes (little endian, packed):
//   header 29 bytes: u16 format, u8 gameYear, u8 major, u8 minor, u8 pktVersion,
//                    u8 packetId, u64 sessionUID, f32 sessionTime, u32 frameId,
//                    u32 overallFrameId, u8 playerCarIndex, u8 secondaryCarIndex
//   packetId 2 = LapData (57 B/car), 6 = CarTelemetry (60 B/car), 7 = CarStatus (55 B/car)
// F1 sends tyre arrays as [RL, RR, FL, FR]; we reorder to [FL, FR, RL, RR].
//
// TODO: verify F1 26 hasn't changed struct sizes once you have a live capture.

import { clamp01 } from '../schema.js';

const HEADER = 29;
const PKT = { LAP: 2, TELEMETRY: 6, STATUS: 7 };
const SIZE = { LAP: 57, TELEMETRY: 60, STATUS: 55 };
const ERS_MAX_J = 4_000_000;
const REORDER = [2, 3, 0, 1]; // F1 [RL,RR,FL,FR] -> ours [FL,FR,RL,RR]

export function createF1Adapter() {
  let warnedFormat = false;
  let bestMs = null;

  return {
    game: 'F1',

    /** @returns {boolean} true if the frame changed */
    handle(buf, frame) {
      if (buf.length < HEADER + 1) return false;
      const format = buf.readUInt16LE(0);
      if (format < 2024) {
        if (!warnedFormat) {
          console.warn(`[f1] packetFormat ${format} not supported, set the game to 2024 or newer`);
          warnedFormat = true;
        }
        return false;
      }
      const packetId = buf.readUInt8(6);
      const player = buf.readUInt8(27);
      frame.game = 'F1';

      switch (packetId) {
        case PKT.TELEMETRY: {
          const o = HEADER + player * SIZE.TELEMETRY;
          if (buf.length < o + SIZE.TELEMETRY) return false;
          frame.speedKph = buf.readUInt16LE(o);
          frame.throttle = clamp01(buf.readFloatLE(o + 2));
          frame.steer = Math.max(-1, Math.min(1, buf.readFloatLE(o + 6)));
          frame.brake = clamp01(buf.readFloatLE(o + 10));
          frame.clutch = clamp01(buf.readUInt8(o + 14) / 100);
          frame.gear = buf.readInt8(o + 15);
          frame.rpm = buf.readUInt16LE(o + 16);
          frame.drs = buf.readUInt8(o + 18) === 1;
          for (let i = 0; i < 4; i++) {
            const src = REORDER[i];
            frame.tyres.tempC[i] = buf.readUInt8(o + 30 + src);
            frame.tyres.innerTempC[i] = buf.readUInt8(o + 34 + src);
            frame.tyres.pressurePsi[i] = round1(buf.readFloatLE(o + 40 + src * 4));
          }
          return true;
        }
        case PKT.LAP: {
          const o = HEADER + player * SIZE.LAP;
          if (buf.length < o + SIZE.LAP) return false;
          const lastMs = buf.readUInt32LE(o);
          frame.lap.lastMs = lastMs || null;
          frame.lap.currentMs = buf.readUInt32LE(o + 4);
          frame.lap.position = buf.readUInt8(o + 32);
          frame.lap.number = buf.readUInt8(o + 33);
          frame.lap.sector = buf.readUInt8(o + 36) + 1;
          if (lastMs > 0 && (bestMs === null || lastMs < bestMs)) bestMs = lastMs;
          frame.lap.bestMs = bestMs;
          return true;
        }
        case PKT.STATUS: {
          const o = HEADER + player * SIZE.STATUS;
          if (buf.length < o + SIZE.STATUS) return false;
          const inTank = buf.readFloatLE(o + 5);
          const capacity = buf.readFloatLE(o + 9);
          frame.fuel = capacity > 0 ? clamp01(inTank / capacity) : null;
          frame.fuelLapsLeft = round1(buf.readFloatLE(o + 13));
          frame.maxRpm = buf.readUInt16LE(o + 17);
          frame.ers = clamp01(buf.readFloatLE(o + 37) / ERS_MAX_J);
          return true;
        }
        default:
          return false;
      }
    },
  };
}

const round1 = (v) => Math.round(v * 10) / 10;
