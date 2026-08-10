import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signPut } from '../r2.mjs';

const BASE = {
  accessKeyId: '99899758b69aa8b12c2cfd511e1f6683',
  secretAccessKey: 'ff44d6eb142cffec3f7fda21f5110668928fc13cec3884fda056fd8334c06c91',
  endpoint: 'https://2b31b59e8986fd78f6e37ab0a054f036.r2.cloudflarestorage.com',
  bucket: 'banco-risa',
  key: 'banco-risa/q_823020113.mp3',
  contentType: 'audio/mpeg',
  payloadHash: '5de4ba1b98f6f2f1a36b09f0c1f14e9f9b4c6a2f39d5d1e3a7b8c9d0e1f2a3b4',
  now: new Date('2026-08-10T11:00:00.000Z')
};

test('signPut builds path-style uri and scope', () => {
  const s = signPut(BASE);
  assert.equal(s.host, '2b31b59e8986fd78f6e37ab0a054f036.r2.cloudflarestorage.com');
  assert.equal(s.uri, '/banco-risa/banco-risa/q_823020113.mp3');
  assert.equal(s.scope, '20260810/auto/s3/aws4_request');
  assert.equal(s.signedHeaders, 'content-type;host;x-amz-content-sha256;x-amz-date');
  assert.equal(s.amzDate, '20260810T110000Z');
});

test('signPut is deterministic', () => {
  assert.equal(signPut(BASE).signature, signPut(BASE).signature);
});

test('signPut produces a 64-hex signature', () => {
  assert.match(signPut(BASE).signature, /^[0-9a-f]{64}$/);
});

test('signPut signature changes when the key changes', () => {
  assert.notEqual(
    signPut(BASE).signature,
    signPut({ ...BASE, key: 'banco-risa/another.mp3' }).signature
  );
});
