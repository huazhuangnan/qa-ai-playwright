import { describe, expect, test } from 'bun:test';
import { assertSkillLicense, releaseAssetHash } from '../scripts/sync-upstream.ts';

describe('upstream release asset validation', () => {
  test('accepts one matching official SHA256', () => {
    const hash = 'a'.repeat(64);
    expect(releaseAssetHash([{ name: 'asset.zip', digest: `sha256:${hash}` }], 'asset.zip')).toBe(hash);
  });

  test('rejects missing, ambiguous and malformed release metadata', () => {
    const asset = { name: 'asset.zip', digest: `sha256:${'a'.repeat(64)}` };
    expect(() => releaseAssetHash([], 'asset.zip')).toThrow();
    expect(() => releaseAssetHash([asset, asset], 'asset.zip')).toThrow();
    expect(() => releaseAssetHash([{ name: 'asset.zip', digest: 'sha256:bad' }], 'asset.zip')).toThrow();
  });
});

test('rejects unverified or changed Skill licenses', () => {
  expect(() => assertSkillLicense({ license: { spdx_id: 'MIT' } }, 'MIT')).not.toThrow();
  expect(() => assertSkillLicense({ license: { spdx_id: 'Apache-2.0' } }, 'MIT')).toThrow();
  expect(() => assertSkillLicense({}, 'MIT')).toThrow();
});
