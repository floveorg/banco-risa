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
    tg: '',
    key: '',
    orig: 'https://creativecommons.org/licenses/by-sa/4.0/deed.es',
    origLabel: 'licencia',
    isVideo: false,
    clip: SAMPLE[0],
  });
});

test('isVideo marks vídeo feeds by flag, kind or src extension', () => {
  const tracks = Risa.buildRisaTracks([
    { name: 'A', src: 'x.mp4' },
    { name: 'B', video: true, src: 'r2.dev/x' },
    { name: 'C', kind: 'video', src: 'r2.dev/y' },
    { name: 'D', src: 'audio/a.mp3' },
    { name: 'E', src: 'r2.dev/z.webm' },
  ]);
  assert.deepEqual(tracks.map(t => t.isVideo), [true, true, true, false, true]);
});

test('the tg opt-in link rides into the track (C19, never automatic)', () => {
  const [t] = Risa.buildRisaTracks([{ name: 'Marta', src: 'a.mp3', tg: '@mar' }]);
  assert.equal(t.tg, '@mar');
  const [t2] = Risa.buildRisaTracks([{ name: 'Yusuf', src: 'a.mp3' }]);
  assert.equal(t2.tg, '');
});

test('the author-page key rides into the track for the tag-url page', () => {
  const [t] = Risa.buildRisaTracks([{ name: 'sara-2', src: 'a.mp3', key: 'k_abc' }]);
  assert.equal(t.key, 'k_abc');
  const [t2] = Risa.buildRisaTracks([{ name: 'Anónima', src: 'a.mp3' }]);
  assert.equal(t2.key, '');
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

test('clipsOf accepts array (v1) or {flag,clips}/{schema,clips} object, and defaults to []', () => {
  assert.equal(Risa.clipsOf(SAMPLE), SAMPLE);
  assert.deepEqual(Risa.clipsOf({ flag: { flove: false }, clips: SAMPLE }), SAMPLE);
  assert.deepEqual(Risa.clipsOf({ schema: 'risa-feed/1', clips: SAMPLE }), SAMPLE);
  assert.deepEqual(Risa.clipsOf({ flag: { flove: false } }), []);
  assert.deepEqual(Risa.clipsOf(null), []);
  assert.deepEqual(Risa.clipsOf(undefined), []);
});

test('flagsOf reads the feed header flag and defaults to {}', () => {
  assert.deepEqual(Risa.flagsOf({ flag: { flove: false } }), { flove: false });
  assert.deepEqual(Risa.flagsOf({ clips: [] }), {});
  assert.deepEqual(Risa.flagsOf(SAMPLE), {});
  assert.deepEqual(Risa.flagsOf(null), {});
});

test('constants carry the fixed license and config', () => {
  assert.equal(Risa.LICENSE, 'CC BY-SA 4.0');
  assert.equal(Risa.RISA_URL, 'https://risa.liberada.net/risa.json');
  assert.equal(Risa.TELEGRAM_BOT, 'https://t.me/RisaLiberadaBot');
});
