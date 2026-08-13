import { test } from 'node:test';
import assert from 'node:assert/strict';
import Risa from '../risa.js';

const SAMPLE = [
  { id: 'b_1', t: 'Risa de Marta', name: 'Marta', tags: 'contagiosa', src: 'audio/a.mp3', when: '2026-07-19' },
  { id: 'b_2', name: 'Yusuf', src: 'audio/b.mp3' },              // no t, no tags, no when
  { id: 'b_3', name: 'SinAudio', tags: 'x' },                   // no src -> dropped from tracks
];

test('buildRisaTracks maps fields and composes by/orig from the license', () => {
  const tracks = Risa.buildRisaTracks(SAMPLE);
  assert.equal(tracks.length, 2);                               // b_3 dropped (no src)
  assert.deepEqual(tracks[0], {
    t: 'Risa de Marta', src: 'audio/a.mp3', tags: 'contagiosa',
    by: 'Marta · CC BY-SA 4.0',
    orig: 'https://creativecommons.org/licenses/by-sa/4.0/deed.es',
    origLabel: 'licencia',
    clip: SAMPLE[0],
  });
});

test('buildRisaTracks derives a title and defaults tags when missing', () => {
  const tracks = Risa.buildRisaTracks(SAMPLE);
  assert.equal(tracks[1].t, 'Risa de Yusuf');
  assert.equal(tracks[1].tags, 'risa libre');
});

test('buildRisaTracks tolerates non-arrays', () => {
  assert.deepEqual(Risa.buildRisaTracks(null), []);
  assert.deepEqual(Risa.buildRisaTracks(undefined), []);
});

test('latestFeed returns first n as feed items with defaults', () => {
  const feed = Risa.latestFeed(SAMPLE, 2);
  assert.equal(feed.length, 2);
  assert.deepEqual(feed[0], { name: 'Marta', tags: 'contagiosa', when: '2026-07-19' });
  assert.deepEqual(feed[1], { name: 'Yusuf', tags: 'risa libre', when: 'ahora' });
});

test('latestFeed defaults n to 6 and tolerates non-arrays', () => {
  assert.equal(Risa.latestFeed(SAMPLE).length, 3);
  assert.deepEqual(Risa.latestFeed(null), []);
});

test('constants carry the fixed license and config', () => {
  assert.equal(Risa.LICENSE, 'CC BY-SA 4.0');
  assert.equal(Risa.RISA_URL, 'https://risa.liberada.net/risa.json');
  assert.equal(Risa.TELEGRAM_BOT, 'https://t.me/RisaLiberadaBot');
});
