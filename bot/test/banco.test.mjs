import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bancoEntry, prependClip } from '../logic.mjs';

const BASE = 'https://floveorg.github.io/banco-risa';

test('bancoEntry builds absolute src and keeps name (no by field)', () => {
  const e = bancoEntry({ id: 'q_10', name: 'Marta', tags: 'de grupo', when: '2026-07-19', pagesBase: BASE });
  assert.deepEqual(e, {
    id: 'q_10', name: 'Marta',
    src: 'https://floveorg.github.io/banco-risa/audio/q_10.mp3',
    tags: 'de grupo', when: '2026-07-19'
  });
  assert.equal('by' in e, false);
});

test('bancoEntry omits tags when empty', () => {
  const e = bancoEntry({ id: 'q_11', name: 'Yusuf', tags: '', when: '2026-07-19', pagesBase: BASE });
  assert.equal('tags' in e, false);
});

test('prependClip puts the new clip first and does not mutate input', () => {
  const banco = [{ id: 'old' }];
  const out = prependClip(banco, { id: 'new' });
  assert.deepEqual(out.map(x => x.id), ['new', 'old']);
  assert.deepEqual(banco.map(x => x.id), ['old']); // unchanged
});
