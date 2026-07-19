import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bancoEntry, prependClip } from '../logic.mjs';

const SRC = 'https://res.cloudinary.com/risa/video/upload/v1/banco-risa/q_10.mp3';

test('bancoEntry keeps name + given src (no by field)', () => {
  const e = bancoEntry({ id: 'q_10', name: 'Marta', tags: 'de grupo', when: '2026-07-19', src: SRC });
  assert.deepEqual(e, {
    id: 'q_10', name: 'Marta',
    src: SRC,
    tags: 'de grupo', when: '2026-07-19'
  });
  assert.equal('by' in e, false);
});

test('bancoEntry omits tags when empty', () => {
  const e = bancoEntry({ id: 'q_11', name: 'Yusuf', tags: '', when: '2026-07-19', src: SRC });
  assert.equal('tags' in e, false);
});

test('prependClip puts the new clip first and does not mutate input', () => {
  const banco = [{ id: 'old' }];
  const out = prependClip(banco, { id: 'new' });
  assert.deepEqual(out.map(x => x.id), ['new', 'old']);
  assert.deepEqual(banco.map(x => x.id), ['old']); // unchanged
});
