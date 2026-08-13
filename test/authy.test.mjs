import { test } from 'node:test';
import assert from 'node:assert/strict';
import Authy from '../authy.js';

test('LEVELS define los cinco niveles de identidad', () => {
  assert.deepEqual(Authy.LEVELS, { anonima: 1, presencia: 2, verificada: 3, telefono: 4, biometria: 5 });
});

test('keyOf deriva una key inmutable salada: determinista y distinta por canal/id/secret', async () => {
  const a = await Authy.keyOf('telegram', 42, 's');
  const b = await Authy.keyOf('telegram', 42, 's');
  const c = await Authy.keyOf('telegram', 43, 's');
  const d = await Authy.keyOf('email', 42, 's');
  const e = await Authy.keyOf('telegram', 42, 't');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.notEqual(a, e);
});

test('identityOf: tg+name guarda idHash (nivel presencia); tg solo, idDirect', async () => {
  const hashed = await Authy.identityOf('telegram', 7, { tg: true, name: true, username: 'mar' }, 's');
  assert.deepEqual(hashed, {
    canal: 'telegram', nivel: 2, display: 'mar',
    idHash: await Authy.keyOf('telegram', 7, 's'),
  });
  const direct = await Authy.identityOf('telegram', 7, { tg: true }, 's');
  assert.equal(direct.idHash, undefined);
  assert.equal(direct.idDirect, '7');
});

test('identityOf: anónima y name-solo no guardan identidad', async () => {
  const anon = await Authy.identityOf('telegram', 7, { anon: true }, 's');
  assert.deepEqual(anon, { canal: 'telegram', nivel: 1, display: 'Anónima' });
  const named = await Authy.identityOf('telegram', 7, { name: 'Marta' }, 's');
  assert.equal(named.idHash, undefined);
  assert.equal(named.idDirect, undefined);
  assert.equal(named.nivel, 1);
});

test('DRIVERS: telegram real, email/phone stubs para v2', () => {
  assert.equal(Authy.DRIVERS.telegram.stub, false);
  assert.equal(Authy.DRIVERS.telegram.nivelMax, 3);
  assert.equal(Authy.DRIVERS.email.stub, true);
  assert.equal(Authy.DRIVERS.email.nivelMax, 4);
  assert.equal(Authy.DRIVERS.phone.stub, true);
  assert.equal(Authy.DRIVERS.phone.nivelMax, 5);
  assert.equal(Authy.DRIVERS.telegram.describe({ username: 'mar' }), '@mar');
});
