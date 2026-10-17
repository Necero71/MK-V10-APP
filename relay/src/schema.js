// Normalized telemetry frame. Every adapter writes into this shape,
// the dashboard only ever reads this shape.
//
// Units: speed km/h, temps °C, pressures PSI (when available),
// times in ms, throttle/brake/clutch 0..1, steer -1..1 (left negative),
// fuel 0..1 fraction of tank, tyre arrays ordered [FL, FR, RL, RR].
// Anything a game doesn't expose stays null.

export function emptyFrame(game = null) {
  return {
    game,
    ts: 0,
    speedKph: 0,
    rpm: 0,
    maxRpm: 0,
    gear: 0, // -1 = reverse, 0 = neutral, 1+ = forward
    throttle: 0,
    brake: 0,
    clutch: 0,
    steer: 0,
    fuel: null,
    fuelLapsLeft: null,
    tyres: {
      tempC: [null, null, null, null],
      innerTempC: [null, null, null, null],
      wear: [null, null, null, null], // 0 = new, 1 = gone
      pressurePsi: [null, null, null, null],
    },
    lap: {
      number: null,
      position: null,
      sector: null, // 1..3 when known
      currentMs: null,
      lastMs: null,
      bestMs: null,
    },
    ers: null, // 0..1 battery fraction (F1 only)
    drs: null, // true/false (F1 only)
  };
}

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
