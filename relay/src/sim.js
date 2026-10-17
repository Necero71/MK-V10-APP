// Fake telemetry so you can build/test the dashboard without a game running.
// `npm run sim` -> a car lapping a ~60 s track with throttle/brake/gear changes.

const GEAR_SPEEDS = [0, 70, 110, 150, 190, 230, 270, 310]; // km/h top of each gear

export function createSim(frame) {
  const start = Date.now();
  let best = null;
  let lastLapIdx = 0;
  let lastLapMs = null;

  return function tick() {
    const t = (Date.now() - start) / 1000;
    const lapLen = 60;
    const lapIdx = Math.floor(t / lapLen);
    const lapT = t % lapLen;

    // speed profile: 3 straights, 3 braking zones
    const phase = (lapT / lapLen) * Math.PI * 6;
    const base = 0.5 + 0.5 * Math.sin(phase - Math.PI / 2);
    const speed = 80 + base * 230;
    const accel = Math.cos(phase);

    frame.game = 'SIM';
    frame.ts = Date.now();
    frame.speedKph = Math.round(speed);
    let gear = 1;
    while (gear < 7 && speed > GEAR_SPEEDS[gear]) gear++;
    frame.gear = gear;
    const inGear = (speed - GEAR_SPEEDS[gear - 1]) / (GEAR_SPEEDS[gear] - GEAR_SPEEDS[gear - 1]);
    frame.maxRpm = 13000;
    frame.rpm = Math.round(5500 + Math.max(0, Math.min(1, inGear)) * 7200);
    frame.throttle = accel > 0 ? Math.min(1, accel * 1.6) : 0;
    frame.brake = accel < 0 ? Math.min(1, -accel * 1.4) : 0;
    frame.steer = Math.sin(phase * 1.7) * 0.6;
    frame.drs = accel > 0.9;
    frame.fuel = Math.max(0.05, 0.8 - t / 1500);
    frame.fuelLapsLeft = Math.round(frame.fuel * 22 * 10) / 10;
    frame.ers = 0.5 + 0.5 * Math.sin(t / 7);
    const heat = 80 + base * 25;
    frame.tyres.tempC = [heat + 4, heat + 6, heat - 3, heat - 2].map(Math.round);
    frame.tyres.innerTempC = frame.tyres.tempC.map((v) => v + 8);
    frame.tyres.pressurePsi = [23.1, 23.3, 21.8, 21.9];
    frame.tyres.wear = [0.1, 0.12, 0.08, 0.09].map((w) => w + t / 4000);

    if (lapIdx !== lastLapIdx) {
      lastLapMs = lapLen * 1000;
      best = best === null ? lastLapMs : Math.min(best, lastLapMs);
      lastLapIdx = lapIdx;
    }
    frame.lap.number = lapIdx + 1;
    frame.lap.position = 1;
    frame.lap.sector = Math.min(3, Math.floor(lapT / (lapLen / 3)) + 1);
    frame.lap.currentMs = Math.round(lapT * 1000);
    frame.lap.lastMs = lastLapMs;
    frame.lap.bestMs = best;
    return true;
  };
}
