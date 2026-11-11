import { assertWriteAccess, expect, test } from '../fixtures/qa';

// 写保护区分非生产环境、默认生产环境和显式授权。
test('@unit allows writes in non-production environments', () => {
  expect(() => assertWriteAccess({ QA_ENV: 'stg' })).not.toThrow();
});

test('@unit blocks production writes by default', () => {
  expect(() => assertWriteAccess({ QA_ENV: 'prod' })).toThrow(
    'QA_ALLOW_PRODUCTION_WRITES=true',
  );
});

test('@unit allows explicitly approved production writes', () => {
  expect(() => assertWriteAccess({
    QA_ENV: 'prod',
    QA_ALLOW_PRODUCTION_WRITES: 'true',
  })).not.toThrow();
});
