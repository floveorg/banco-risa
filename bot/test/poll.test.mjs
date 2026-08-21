import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAction } from '../poll.mjs';

// Minimal Telegram double: records calls, resolves message ids.
function tgMock() {
  const calls = [];
  let mid = 100;
  const tg = {
    calls,
    async sendMessage(chatId, text, opts) {
      calls.push(['sendMessage', chatId, text, opts]);
      return { message_id: ++mid };
    },
    async editMessageText(chatId, msgId, text, opts) {
      calls.push(['editMessageText', chatId, msgId, text]);
      return { message_id: msgId };
    },
    async editReplyMarkupClear(chatId, msgId) {
      calls.push(['editReplyMarkupClear', chatId, msgId]);
      return true;
    },
    async answerCallback(id, text) { calls.push(['answerCallback', id, text]); return true; },
    async copyMessage(to, from, msgId, ...rest) {
      calls.push(['copyMessage', to, from, msgId]);
      return { message_id: ++mid };
    }
  };
  return tg;
}

const RISAS = [
  { id: 'q_1', t: 'Surreal', src: 'a.mp3' },
  { id: 'q_2', t: 'Risa Maliciosa', src: 'b.mp3' }
];
const CFG = { modGroupId: -100, limits: { maxPerDay: 5, maxPending: 5 } };
const baseDraft = (over = {}) => ({
  id: 'q_9', fileId: 'FID', name: 'Marc', username: 'marcflove', video: false,
  title: 'Gud mornin', tags: [], sel: {}, fromChatId: 'c1', fromMsgId: 1,
  draftMsgId: 42, awaitingTitle: false, awaitingTags: false,
  parent: 'q_1', parentTitle: 'Surreal', remix: true, ...over
});

test('remix-start reparents an OPEN draft and re-renders it', async () => {
  const state = { queue: {}, drafts: { c1: baseDraft() }, risas: RISAS, uploads: {} };
  const tg = tgMock();
  await handleAction({ kind: 'remix-start', chatId: 'c1', clipId: 'q_2' }, tg, CFG, state);
  const d = state.drafts.c1;
  assert.equal(d.parent, 'q_2');
  assert.equal(d.parentTitle, 'Risa Maliciosa');
  assert.equal(d.remix, true);
  assert.equal(d.pendingParent, undefined);
  assert.ok(tg.calls.some((c) => c[0] === 'editMessageText' && c[3] !== undefined));
});

test('remix-start without a draft leaves a pendingParent holder with title', async () => {
  const state = { queue: {}, drafts: {}, risas: RISAS, uploads: {} };
  const tg = tgMock();
  await handleAction({ kind: 'remix-start', chatId: 'c1', clipId: 'q_2' }, tg, CFG, state);
  const d = state.drafts.c1;
  assert.deepEqual(d.pendingParent, { id: 'q_2', remix: true, title: 'Risa Maliciosa' });
  assert.ok(!tg.calls.some((c) => c[0] === 'editMessageText'));
});

test('draft-send honours a stale pendingParent (heal) in the queued entry', async () => {
  const state = {
    queue: {}, risas: RISAS, uploads: {}, uploaders: {}, tgpub: {},
    drafts: { c1: baseDraft({ pendingParent: { id: 'q_2', remix: true, title: 'Risa Maliciosa' } }) }
  };
  const tg = tgMock();
  await handleAction({ kind: 'draft-send', chatId: 'c1', callbackId: 'cb' }, tg, CFG, state);
  const q = state.queue.q_9;
  assert.equal(q.parent, 'q_2');
  assert.equal(q.remix, true);
  assert.equal(state.drafts.c1, undefined);
});

test('draft-cancel deletes the draft so the uploader is free again', async () => {
  const state = { queue: {}, drafts: { c1: baseDraft() }, risas: RISAS, uploads: {} };
  const tg = tgMock();
  await handleAction({ kind: 'draft-cancel', chatId: 'c1', draftMsgId: 42 }, tg, CFG, state);
  assert.equal(state.drafts.c1, undefined);
  const said = tg.calls.find((c) => c[0] === 'editMessageText');
  assert.ok(said && /cancelada/i.test(said[3]));
});

test('draft action consumes a pendingParent holder including its title', async () => {
  const state = {
    queue: {}, risas: RISAS, uploads: {},
    drafts: { c1: { pendingParent: { id: 'q_2', remix: true, title: 'Risa Maliciosa' } } }
  };
  const tg = tgMock();
  await handleAction({
    kind: 'draft', id: 'q_10', chatId: 'c1', fileId: 'FID2',
    fromChatId: 'c1', fromMsgId: 2, name: 'Marc', username: 'marcflove'
  }, tg, CFG, state);
  const d = state.drafts.c1;
  assert.equal(d.parent, 'q_2');
  assert.equal(d.parentTitle, 'Risa Maliciosa');
  assert.equal(d.remix, true);
});

// ── Overlap: la risa nueva no se pierde y el formulario siempre vuelve ──

test('draft-overlap keeps the incoming media and offers resume/replace buttons', async () => {
  const state = { queue: {}, drafts: { c1: baseDraft() }, risas: RISAS, uploads: {} };
  const tg = tgMock();
  await handleAction({
    kind: 'draft-overlap', id: 'q_11', chatId: 'c1', fileId: 'FID2',
    fromChatId: 'c1', fromMsgId: 3, name: 'Marc', username: 'marcflove'
  }, tg, CFG, state);
  const d = state.drafts.c1;
  assert.equal(d.pendingMedia.fileId, 'FID2');       // la nueva queda guardada
  assert.equal(d.fileId, 'FID');                     // el borrador no cambia solo
  const said = tg.calls.find((c) => c[0] === 'sendMessage');
  assert.ok(said && /borrador/i.test(said[2]));
});

test('draft-resume re-renders the form even when the old card is gone (stale edit → fresh send)', async () => {
  const state = { queue: {}, drafts: { c1: baseDraft({ draftMsgId: 999 }) }, risas: RISAS, uploads: {} };
  const tg = tgMock();
  tg.editMessageText = async (...args) => {
    tg.calls.push(['editMessageText', ...args]);
    throw new Error('editMessageText failed: {"ok":false,"error_code":400,"description":"Bad Request: message to edit not found"}');
  };
  await handleAction({ kind: 'draft-resume', chatId: 'c1', callbackId: 'cb' }, tg, CFG, state);
  const resent = tg.calls.find((c) => c[0] === 'sendMessage' && /Risa recibida/.test(c[2]));
  assert.ok(resent, 'la ficha se reenvía como mensaje nuevo');
  assert.equal(state.drafts.c1.draftMsgId !== 999, true);   // id actualizado
});

test('draft-replace swaps the open draft for the pending media (parent intent kept)', async () => {
  const state = {
    queue: {}, risas: RISAS, uploads: {},
    drafts: { c1: baseDraft({ pendingMedia: {
      id: 'q_12', fileId: 'NEW', video: false, name: 'Marc', username: 'marcflove',
      fromChatId: 'c1', fromMsgId: 4, title: '', parent: 'q_2', parentTitle: 'Risa Maliciosa', remix: false
    } }) }
  };
  const tg = tgMock();
  // La ficha vieja ya no existe (el usuario la borró): el render cae a un
  // mensaje nuevo y la vieja debe quedarse sin botones.
  tg.editMessageText = async (...args) => {
    tg.calls.push(['editMessageText', ...args]);
    throw new Error('editMessageText failed: {"ok":false,"error_code":400,"description":"Bad Request: message to edit not found"}');
  };
  await handleAction({ kind: 'draft-replace', chatId: 'c1', callbackId: 'cb' }, tg, CFG, state);
  const d = state.drafts.c1;
  assert.equal(d.fileId, 'NEW');
  assert.equal(d.parent, 'q_2');
  assert.equal(d.remix, false);
  assert.equal(d.pendingMedia, undefined);
  const cleared = tg.calls.find((c) => c[0] === 'editReplyMarkupClear');
  assert.ok(cleared, 'la ficha vieja queda sin botones');
});

test('welcome offers «Abrir mi borrador» when a draft is open', async () => {
  const state = { queue: {}, drafts: { c1: baseDraft() }, risas: RISAS, uploads: {} };
  const tg = tgMock();
  await handleAction({ kind: 'welcome', chatId: 'c1' }, tg, CFG, state);
  const said = tg.calls.find((c) => c[0] === 'sendMessage');
  assert.ok(said && JSON.stringify(said).includes('draft:resume'));
});
