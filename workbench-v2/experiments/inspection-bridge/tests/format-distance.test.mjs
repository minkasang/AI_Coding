import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDistance } from '../format-distance.mjs';

test('formatDistance mm and m', () => {
  assert.match(formatDistance(0.152), /152\.00 mm/);
  assert.match(formatDistance(0.152), /0\.1520 m/);
});
test('formatDistance unknown', () => {
  assert.equal(formatDistance(NaN), 'UNKNOWN');
});