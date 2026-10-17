// Forza "Data Out" UDP adapter (Motorsport 7 / Motorsport 2023 / Horizon 4 / Horizon 5).
// In-game: Settings -> HUD and Gameplay -> Data Out ON,
// IP = the PC running the relay, port 5300, packet format "Car Dash" if offered.
//
// Packet sizes seen in the wild:
//   232  Sled only (no speed/gear/lap)
//   311  FM7 Dash
//   324  Horizon 4/5 (FM7 Dash with 12 padding bytes inserted at offset 232)
//   331  Motorsport 2023 (Dash + tyre wear + track ordinal)
// Offsets below are the community-documented ones; confirm with a live capture.
//
// TODO: confirm tyre temp unit on Motorsport 2023 (we assume Fahrenheit like FM7/Horizon).
// TODO: confirm neutral vs reverse gear encoding (we map 0 -> reverse).

import { clamp01 } from '../schema.js';

const MS_TO_KPH = 3.6;
const fToC = (f) => Math.round(((f - 32) * 5) / 9);
const secToMs = (s) => (s > 0 ? Math.round(s * 1000) : null);

export function createForzaAdapter() {
  return {
    game: 'FORZA',

    /** @returns {boolean} true if the frame changed */
    handle(raw, frame) {
      let buf = raw;
      if (buf.length === 324) {
        buf = Buffer.concat([buf.subarray(0, 232), buf.subarray(244)]);
      }
      if (buf.length < 232) return false;
      if (buf.readInt32LE(0) === 0) return false; // IsRaceOn = 0 (menus / paused)

      frame.game = 'FORZA';
      frame.maxRpm = Math.round(buf.readFloatLE(8));
      frame.rpm = Math.round(buf.readFloatLE(16));

      if (buf.length < 311) return true; // sled-only packet

      frame.speedKph = Math.round(buf.readFloatLE(244) * MS_TO_KPH);
      frame.tyres.tempC = [
        fToC(buf.readFloatLE(256)),
        fToC(buf.readFloatLE(260)),
        fToC(buf.readFloatLE(264)),
        fToC(buf.readFloatLE(268)),
      ];
      frame.fuel = clamp01(buf.readFloatLE(276));
      frame.lap.bestMs = secToMs(buf.readFloatLE(284));
      frame.lap.lastMs = secToMs(buf.readFloatLE(288));
      frame.lap.currentMs = secToMs(buf.readFloatLE(292)) ?? 0;
      frame.lap.number = buf.readUInt16LE(300) + 1;
      frame.lap.position = buf.readUInt8(302);
      frame.throttle = buf.readUInt8(303) / 255;
      frame.brake = buf.readUInt8(304) / 255;
      frame.clutch = buf.readUInt8(305) / 255;
      const gear = buf.readUInt8(307);
      frame.gear = gear === 0 ? -1 : gear;
      frame.steer = Math.max(-1, buf.readInt8(308) / 127);

      if (buf.length >= 327) {
        frame.tyres.wear = [
          clamp01(buf.readFloatLE(311)),
          clamp01(buf.readFloatLE(315)),
          clamp01(buf.readFloatLE(319)),
          clamp01(buf.readFloatLE(323)),
        ];
      }
      return true;
    },
  };
}
