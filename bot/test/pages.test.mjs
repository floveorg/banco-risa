import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorKeyOf, pageUrlOf, authorPageOf } from '../pages.mjs';
import { hashId } from '../logic.mjs';

test('authorKeyOf es el hash salado del id (estable, unidireccional)', () => {
  const a = authorKeyOf(12345, 'secret');
  assert.equal(a, hashId(12345, 'secret'));
  assert.equal(a, authorKeyOf(12345, 'secret'));
  assert.equal(a.length, 64);
  assert.notEqual(a, authorKeyOf(12346, 'secret'));
  assert.notEqual(a, authorKeyOf(12345, 'other'));
  assert.notEqual(a, String(12345));
});

test('pageUrlOf construye la URL de la página de autor (#/u/<key>)', () => {
  const key = authorKeyOf(12345, 'secret');
  const url = pageUrlOf(key, 'https://risa.liberada.net');
  assert.equal(url, 'https://risa.liberada.net/#/u/' + encodeURIComponent(key));
  assert.ok(url.startsWith('https://risa.liberada.net/#/u/'));
});

test('pageUrlOf normaliza la base (sin / final y default)', () => {
  assert.equal(pageUrlOf('k', 'https://risa.liberada.net/'), 'https://risa.liberada.net/#/u/k');
  assert.ok(pageUrlOf('k').startsWith('https://risa.liberada.net/#/u/'));
});

test('authorPageOf devuelve key + url coherentes', () => {
  const page = authorPageOf(12345, 'secret', 'https://risa.liberada.net');
  assert.equal(page.key, authorKeyOf(12345, 'secret'));
  assert.equal(page.url, pageUrlOf(page.key, 'https://risa.liberada.net'));
});
