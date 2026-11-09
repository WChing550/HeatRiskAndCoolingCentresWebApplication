import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {calculateHeatIndex, heatIndexC, riskLevel, riskAdvice} from '../src/heat.js';

const fromF = t => (t - 32) * 5 / 9;
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);

test('screenshot reading uses the averaged mild-condition estimate rather than copying air temperature', () => {
  const result = calculateHeatIndex(24.5, 96);
  assert.equal(result.method, 'simple');
  close(result.temperature_f, 76.1);
  close(result.simple_f, 77.922);
  close(result.screening_f, 77.011);
  close(result.unrounded_c, 25.00611111111111);
  assert.equal(result.heat_index_c, 25);
  assert.equal(result.regression_f, null);
  assert.deepEqual(result.terms, []);
});

// Independently evaluated decimal values for the published NWS coefficients.
for (const [temperatureF, humidity, expectedF, expectedC] of [
  [96, 65, 121.03162930, 49.5],
  [90, 70, 105.92202060, 41.1],
  [95, 50, 105.21577210, 40.7],
  [90, 30, 87.92596580, 31.1],
]) test(`Rothfusz at ${temperatureF}°F / ${humidity}% matches the reference polynomial`, () => {
  const result = calculateHeatIndex(fromF(temperatureF), humidity);
  assert.equal(result.method, 'rothfusz');
  close(result.final_f, expectedF);
  assert.equal(result.heat_index_c, expectedC);
  assert.equal(result.terms.length, 9);
});

test('low humidity no longer bypasses the regression or its dry-air adjustment', () => {
  const result = calculateHeatIndex(fromF(100), 10);
  assert.equal(result.method, 'rothfusz');
  assert.equal(result.adjustment_type, 'low-humidity');
  close(result.regression_f, 94.75260870);
  close(result.adjustment_f, -0.6301260378126044);
  close(result.final_f, 94.1224826621874);
  assert.equal(result.heat_index_c, 34.5);
});

test('high humidity adjustment is added in the specified temperature range', () => {
  const result = calculateHeatIndex(fromF(80), 90);
  assert.equal(result.adjustment_type, 'high-humidity');
  close(result.adjustment_f, 0.7);
  close(result.final_f, 86.34189170);
  assert.equal(result.heat_index_c, 30.2);
});

test('humidity adjustments are not extended beyond their temperature bounds', () => {
  const hotDry = calculateHeatIndex(fromF(113), 10);
  const hotHumid = calculateHeatIndex(fromF(88), 90);
  assert.equal(hotDry.adjustment_type, 'none');
  assert.equal(hotHumid.adjustment_type, 'none');
  close(hotDry.final_f, 107.81909772);
  close(hotHumid.final_f, 113.24726522);
});

test('formula selection follows the screening heat index, not temperature alone', () => {
  const result = calculateHeatIndex(fromF(79.5), 100);
  assert.ok(result.temperature_f < 80);
  assert.ok(result.screening_f >= 80);
  assert.equal(result.method, 'rothfusz');
  assert.equal(result.adjustment_type, 'none');
  close(result.final_f, 85.4701567275);
});

test('screening near 80°F selects each side correctly without prematurely rounding', () => {
  assert.equal(calculateHeatIndex(fromF(79.9), 50).method, 'simple');
  assert.equal(calculateHeatIndex(fromF(80.1), 50).method, 'rothfusz');
});

test('metadata, published helper and Fahrenheit/Celsius conversions agree', () => {
  const result = calculateHeatIndex(32.15, 73);
  close(result.terms.reduce((sum, term) => sum + term.value, 0), result.regression_f);
  close(result.final_f, result.regression_f + result.adjustment_f);
  close(result.unrounded_c, (result.final_f - 32) * 5 / 9);
  assert.equal(heatIndexC(32.15, 73), result.heat_index_c);
  assert.equal(result.heat_index_c, Math.round(result.unrounded_c * 10) / 10);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('numeric weather strings are accepted without replacing nulls with zero', () => {
  assert.equal(heatIndexC('24.5', '96'), 25);
  assert.ok(Number.isFinite(heatIndexC(30, 0)));
  assert.ok(Number.isFinite(heatIndexC(30, 100)));
});

for (const [temperature, humidity] of [
  [null, 50], [undefined, 50], ['', 50], [' ', 50], [NaN, 50], [Infinity, 50],
  [true, 50], [30, null], [30, undefined], [30, ''], [30, NaN], [30, -1], [30, 101],
]) test(`invalid weather ${String(temperature)} / ${String(humidity)} is rejected`, () => {
  assert.throws(() => calculateHeatIndex(temperature, humidity));
});

test('existing project risk thresholds and advice remain compatible', () => {
  assert.equal(riskLevel(25), 'Low');
  assert.equal(riskLevel(32), 'Low');
  assert.equal(riskLevel(32.1), 'Moderate');
  assert.equal(riskLevel(40), 'Moderate');
  assert.equal(riskLevel(40.1), 'High');
  assert.equal(typeof riskAdvice('Moderate'), 'string');
});

function weatherHarness(main, key = 'isolated-test-key') {
  const code = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const start = code.indexOf('async function weather(lat, lon) {');
  const end = code.indexOf('\napp.get(', start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  const context = vm.createContext({
    calculateHeatIndex, riskLevel, riskAdvice,
    process: {env: {OPENWEATHER_API_KEY: key}},
    fetch: async () => ({ok: true, json: async () => ({name: 'Example city', main, coord: {lat: 3.139, lon: 101.6869}, dt: 1794150000, weather: [{description: 'test conditions'}]})}),
    pool: {query: async (sql, values) => {calls.push({sql, values}); return {rows: [], rowCount: 1};}},
  });
  vm.runInContext(code.slice(start, end) + '\nglobalThis.readWeather = weather;', context);
  return {read: context.readWeather, calls};
}

test('weather response, displayed calculation and saved log use exactly the same result', async () => {
  const harness = weatherHarness({temp: 24.5, humidity: 96});
  const result = await harness.read();
  assert.equal(result.heat_index_c, 25);
  assert.equal(result.heat_index_calculation.heat_index_c, result.heat_index_c);
  assert.equal(result.risk_level, 'Low');
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].values[5], result.heat_index_c);
});

test('personal-location weather carries the same calculation trace', async () => {
  const harness = weatherHarness({temp: 32.15, humidity: 73});
  const result = await harness.read(3.2, 101.7);
  assert.equal(result.latitude, 3.2);
  assert.equal(result.longitude, 101.7);
  assert.equal(result.heat_index_c, result.heat_index_calculation.heat_index_c);
});

for (const main of [{temp: null, humidity: 96}, {temp: 24.5, humidity: null}, {temp: 30, humidity: 120}]) {
  test('incomplete or invalid provider data returns 502 without storing a fabricated reading', async () => {
    const harness = weatherHarness(main);
    await assert.rejects(harness.read(), {status: 502});
    assert.equal(harness.calls.length, 0);
  });
}
