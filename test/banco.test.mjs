import { test } from 'node:test';
import assert from 'node:assert/strict';
import Banco from '../banco.js';

const SAMPLE = [
  { id: 'b_1', t: 'Risa de Marta', name: 'Marta', tags: 'contagiosa', src: 'audio/a.mp3', when: '2026-07-19' },
  { id: 'b_2', name: 'Yusuf', src: 'audio/b.mp3' },              // no t, no tags, no when
  { id: 'b_3', name: 'SinAudio', tags: 'x' },                   // no src -> dropped from tracks
];

test('buildBancoTracks maps fields and composes by/orig from the license', () => {
  const tracks = Banco.buildBancoTracks(SAMPLE);
  assert.equal(tracks.length, 2);                               // b_3 dropped (no src)
  assert.deepEqual(tracks[0], {
    t: 'Risa de Marta', src: 'audio/a.mp3', tags: 'contagiosa',
    by: 'Marta · CC BY-SA 4.0',
    orig: 'https://creativecommons.org/licenses/by-sa/4.0/deed.es',
    origLabel: 'licencia',
    clip: SAMPLE[0],
  });
});

test('buildBancoTracks derives a title and defaults tags when missing', () => {
  const tracks = Banco.buildBancoTracks(SAMPLE);
  assert.equal(tracks[1].t, 'Risa de Yusuf');
  assert.equal(tracks[1].tags, 'risa libre');
});

test('buildBancoTracks tolerates non-arrays', () => {
  assert.deepEqual(Banco.buildBancoTracks(null), []);
  assert.deepEqual(Banco.buildBancoTracks(undefined), []);
});

test('latestFeed returns first n as feed items with defaults', () => {
  const feed = Banco.latestFeed(SAMPLE, 2);
  assert.equal(feed.length, 2);
  assert.deepEqual(feed[0], { name: 'Marta', tags: 'contagiosa', when: '2026-07-19' });
  assert.deepEqual(feed[1], { name: 'Yusuf', tags: 'risa libre', when: 'ahora' });
});

test('latestFeed defaults n to 6 and tolerates non-arrays', () => {
  assert.equal(Banco.latestFeed(SAMPLE).length, 3);
  assert.deepEqual(Banco.latestFeed(null), []);
});

test('constants carry the fixed license and config', () => {
  assert.equal(Banco.LICENSE, 'CC BY-SA 4.0');
  assert.equal(Banco.BANCO_URL, 'https://risa.liberada.net/risa.json');
  assert.equal(Banco.TELEGRAM_BOT, 'https://t.me/RisaLiberadaBot');
});
