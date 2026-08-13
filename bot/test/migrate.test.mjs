import { test } from 'node:test';
import assert from 'node:assert/strict';
import { r2ClipKeys, rewriteUrls, rewriteConfig } from '../migrate-r2.mjs';

const PB = 'https://pub-e3cbc6c5f1c945358670af27745479f1.r2.dev';

test('r2ClipKeys extracts only banco-risa clip keys', () => {
  const srcs = [
    PB + '/banco-risa/q_823020149.mp3',
    PB + '/banco-risa/q_823020144.mp3',
    PB + '/risa/q_old.mp3'
  ];
  assert.deepEqual(r2ClipKeys(srcs, PB), ['banco-risa/q_823020144.mp3', 'banco-risa/q_823020149.mp3']);
});

test('rewriteUrls swaps banco-risa prefix in the feed JSON', () => {
  const out = rewriteUrls(JSON.stringify([{ src: PB + '/banco-risa/q_1.mp3' }]), PB);
  assert.equal(JSON.parse(out)[0].src, PB + '/risa/q_1.mp3');
});

test('rewriteConfig flips r2Folder', () => {
  const out = rewriteConfig('"r2Folder": "banco-risa",');
  assert.equal(out, '"r2Folder": "risa",');
});
