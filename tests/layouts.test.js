import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRatio } from '../public/layouts.js';

test('解析合法比例', () => {
  assert.deepEqual(parseRatio('4:6', 2), [4, 6]);
  assert.deepEqual(parseRatio('3:4:3', 3), [3, 4, 3]);
});

test('每栏收敛到 2~8', () => {
  assert.deepEqual(parseRatio('1:9', 2), [2, 8]);
  assert.deepEqual(parseRatio('0:100', 2), [2, 8]);
});

test('数量不符或非法时均分', () => {
  assert.deepEqual(parseRatio('4:6', 3), [1, 1, 1]);
  assert.deepEqual(parseRatio('abc', 2), [1, 1]);
  assert.deepEqual(parseRatio(undefined, 2), [1, 1]);
  assert.deepEqual(parseRatio('', 2), [1, 1]);
});
