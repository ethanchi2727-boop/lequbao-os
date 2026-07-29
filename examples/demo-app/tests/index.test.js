import { test } from 'node:test';
import assert from 'node:assert';
import { add, subtract } from '../src/index.js';

test('add 正确相加', () => {
  assert.strictEqual(add(2, 3), 5);
});

test('subtract 正确相减', () => {
  assert.strictEqual(subtract(5, 3), 2);
});
