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
      calls.push(['sendMessage', chatId, text]);
      return { message_id: ++mid };
    },
    async editMessageText(chatId, msgId, text, opts) {
      calls.push(['editMessageText', chatId, msgId, text]);
      return { message_id: msgId };
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
