import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyFrame } from '../src/schema.js';
import { createF1Adapter } from '../src/adapters/f1.js';
import { createForzaAdapter } from '../src/adapters/forza.js';

// ---- F1 packet builders -----------------------------------------------------
function f1Header(packetId, player, totalSize, format = 2025) {
  const b = Buffer.alloc(totalSize);
  b.writeUInt16LE(format, 0);
  b.writeUInt8(25, 2);
  b.writeUInt8(packetId, 6);
  b.writeUInt8(player, 27);
  return b;
}

test('F1 car telemetry: player car, tyre reorder', () => {
  const player = 3;
  const buf = f1Header(6, player, 29 + 22 * 60 + 3);
  const o = 29 + player * 60;
  buf.writeUInt16LE(287, o); // speed
  buf.writeFloatLE(0.8, o + 2); // throttle
  buf.writeFloatLE(-0.25, o + 6); // steer
  buf.writeFloatLE(0.1, o + 10); // brake
  buf.writeInt8(6, o + 15); // gear
  buf.writeUInt16LE(11800, o + 16); // rpm
  buf.writeUInt8(1, o + 18); // drs
  // surface temps in F1 order RL, RR, FL, FR
  [90, 91, 100, 101].forEach((v, i) => buf.writeUInt8(v, o + 30 + i));

  const frame = emptyFrame();
  assert.equal(createF1Adapter().handle(buf, frame), true);
  assert.equal(frame.game, 'F1');
  assert.equal(frame.speedKph, 287);
  assert.equal(frame.gear, 6);
  assert.equal(frame.rpm, 11800);
  assert.equal(frame.drs, true);
  assert.ok(Math.abs(frame.throttle - 0.8) < 1e-6);
  assert.ok(Math.abs(frame.steer + 0.25) < 1e-6);
  assert.deepEqual(frame.tyres.tempC, [100, 101, 90, 91]); // FL FR RL RR
});

test('F1 lap data + best lap tracking', () => {
  const adapter = createF1Adapter();
  const frame = emptyFrame();
  const send = (last, cur, lapNum) => {
    const buf = f1Header(2, 0, 29 + 22 * 57);
    const o = 29;
    buf.writeUInt32LE(last, o);
    buf.writeUInt32LE(cur, o + 4);
    buf.writeUInt8(4, o + 32); // position
    buf.writeUInt8(lapNum, o + 33);
    buf.writeUInt8(1, o + 36); // sector 0-based -> S2
    adapter.handle(buf, frame);
  };
  send(0, 12000, 1);
  assert.equal(frame.lap.lastMs, null);
  send(91234, 500, 2);
  send(90100, 700, 3);
  send(95000, 900, 4);
  assert.equal(frame.lap.number, 4);
  assert.equal(frame.lap.position, 4);
  assert.equal(frame.lap.sector, 2);
  assert.equal(frame.lap.lastMs, 95000);
  assert.equal(frame.lap.bestMs, 90100);
});

test('F1 car status: fuel, ERS, max rpm', () => {
  const buf = f1Header(7, 0, 29 + 22 * 55 + 1);
  const o = 29;
  buf.writeFloatLE(50, o + 5);
  buf.writeFloatLE(110, o + 9);
  buf.writeFloatLE(17.46, o + 13);
  buf.writeUInt16LE(13000, o + 17);
  buf.writeFloatLE(2_000_000, o + 37);
  const frame = emptyFrame();
  createF1Adapter().handle(buf, frame);
  assert.ok(Math.abs(frame.fuel - 50 / 110) < 1e-6);
  assert.equal(frame.fuelLapsLeft, 17.5);
  assert.equal(frame.maxRpm, 13000);
  assert.equal(frame.ers, 0.5);
});

test('F1 rejects pre-2024 formats', () => {
  const buf = f1Header(6, 0, 1500, 2023);
  assert.equal(createF1Adapter().handle(buf, emptyFrame()), false);
});

// ---- Forza packet builders --------------------------------------------------
function forzaDash(len = 311) {
  const b = Buffer.alloc(len);
  b.writeInt32LE(1, 0); // IsRaceOn
  b.writeFloatLE(9000, 8); // max rpm
  b.writeFloatLE(6500, 16); // rpm
  b.writeFloatLE(50, 244); // speed m/s -> 180 km/h
  [140, 150, 160, 170].forEach((f, i) => b.writeFloatLE(f, 256 + i * 4)); // F temps
  b.writeFloatLE(0.75, 276); // fuel
  b.writeFloatLE(84.5, 284); // best
  b.writeFloatLE(86.25, 288); // last
  b.writeFloatLE(33.3, 292); // current
  b.writeUInt16LE(2, 300); // lap (0-based)
  b.writeUInt8(5, 302); // position
  b.writeUInt8(255, 303); // accel
  b.writeUInt8(0, 304); // brake
  b.writeUInt8(4, 307); // gear
  b.writeInt8(-64, 308); // steer
  return b;
}

test('Forza FM7 dash (311 B)', () => {
  const frame = emptyFrame();
  assert.equal(createForzaAdapter().handle(forzaDash(), frame), true);
  assert.equal(frame.game, 'FORZA');
  assert.equal(frame.speedKph, 180);
  assert.equal(frame.rpm, 6500);
  assert.equal(frame.maxRpm, 9000);
  assert.equal(frame.gear, 4);
  assert.equal(frame.throttle, 1);
  assert.ok(Math.abs(frame.steer + 64 / 127) < 1e-6);
  assert.deepEqual(frame.tyres.tempC, [60, 66, 71, 77]); // F -> C
  assert.equal(frame.fuel, 0.75);
  assert.equal(frame.lap.number, 3);
  assert.equal(frame.lap.bestMs, 84500);
  assert.equal(frame.lap.lastMs, 86250);
  assert.equal(frame.lap.position, 5);
});

test('Forza Horizon (324 B) strips the 12 byte pad', () => {
  const dash = forzaDash(311);
  const fh = Buffer.concat([dash.subarray(0, 232), Buffer.alloc(12, 0xee), dash.subarray(232), Buffer.alloc(1)]);
  assert.equal(fh.length, 324);
  const frame = emptyFrame();
  createForzaAdapter().handle(fh, frame);
  assert.equal(frame.speedKph, 180);
  assert.equal(frame.gear, 4);
  assert.equal(frame.lap.number, 3);
});

test('Forza ignores IsRaceOn = 0', () => {
  const b = forzaDash();
  b.writeInt32LE(0, 0);
  assert.equal(createForzaAdapter().handle(b, emptyFrame()), false);
});
