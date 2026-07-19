import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCloudinaryUrl, signParams } from '../cloudinary.mjs';

test('parseCloudinaryUrl splits key / secret / cloud name', () => {
  assert.deepEqual(
    parseCloudinaryUrl('cloudinary://123456789:aBcD-eF_gH@risa-cloud'),
    { apiKey: '123456789', apiSecret: 'aBcD-eF_gH', cloudName: 'risa-cloud' }
  );
});

test('parseCloudinaryUrl throws on garbage', () => {
  assert.throws(() => parseCloudinaryUrl('nope'));
  assert.throws(() => parseCloudinaryUrl(''));
});

test('signParams builds sha1(sorted "k=v" joined by & + secret)', () => {
  // regression vector: sha1("public_id=sample&timestamp=1315060510" + "abcd")
  const sig = signParams({ timestamp: 1315060510, public_id: 'sample' }, 'abcd');
  assert.equal(sig, 'c3470533147774275dd37996cc4d0e68fd03cd4f');
});

test('signParams sorts keys deterministically regardless of input order', () => {
  const a = signParams({ folder: 'banco-risa', public_id: 'q_5', timestamp: 100 }, 's3cr3t');
  const b = signParams({ timestamp: 100, folder: 'banco-risa', public_id: 'q_5' }, 's3cr3t');
  assert.equal(a, b);
});
