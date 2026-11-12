import { expect, test } from '../fixtures/qa';

// 接入前替换路径和预期；缺少服务时不能把跳过计作 API 覆盖。
test('@contract @integration 服务健康检查（接入前修改路径和契约）', async ({
  api,
}) => {
  const apiBaseUrl = process.env.API_BASE_URL;
  if (!apiBaseUrl && process.env.REQUIRE_API_TESTS === '1') {
    throw new Error('API tests require API_BASE_URL');
  }
  test.skip(!apiBaseUrl, '请配置当前环境的 API_BASE_URL');
  const response = await api.get('/health');
  expect(response.status()).toBe(200);
});
