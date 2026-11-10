import { test, expect } from '@playwright/test';

// 只验证测试运行器可执行，不代表业务功能通过。
test('@regression 测试运行器可执行（非业务验收）', () => {
  expect(new URL('http://localhost:3000').protocol).toBe('http:');
});
