import { expect, test } from '@playwright/test';
import { localTarget } from '../support/local-targets.ts';

// 该示例会写入数据，只能连接套件启动的本机服务。
test('example suite accepts only its local service address', () => {
  const expected = 'http://127.0.0.1:8787';
  expect(localTarget(`${expected}/`, expected)).toBe(expected);
  expect(() => localTarget('https://example.com', expected)).toThrow();
  expect(() => localTarget('http://127.0.0.1:9999', expected)).toThrow();
  expect(() => localTarget(`${expected}/api`, expected)).toThrow();
});
