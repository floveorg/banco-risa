import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUpdates, decisionOf } from '../logic.mjs';

const CTX = { modGroupId: -1001234 };

test('decisionOf maps approval/rejection words', () => {
  assert.equal(decisionOf('ok'), 'approve');
  assert.equal(decisionOf('SÍ'), 'approve');
  assert.equal(decisionOf('publicar'), 'approve');
  assert.equal(decisionOf('✅'), 'approve');
  assert.equal(decisionOf('no'), 'reject');
  assert.equal(decisionOf('borrar'), 'reject');
  assert.equal(decisionOf('🗑'), 'reject');
  assert.equal(decisionOf('qué risa'), null);
  assert.equal(decisionOf(''), null);
});

test('a private voice message becomes a draft action', () => {
  const updates = [{
    update_id: 10,
    message: { message_id: 5, chat: { id: 777, type: 'private' },
      from: { first_name: 'Marta' }, voice: { file_id: 'AAA', duration: 3 } }
  }];
  const { actions, offset } = parseUpdates(updates, CTX);
  assert.equal(offset, 11);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], {
    kind: 'draft', id: 'q_10', chatId: 777, fileId: 'AAA', fromChatId: 777, fromMsgId: 5,
    name: 'Marta', title: ''
  });
});

test('an audio message with a caption carries the caption as title', () => {
  const updates = [{
    update_id: 12,
    message: { message_id: 6, chat: { id: 888, type: 'private' },
      from: { first_name: 'Yusuf' }, audio: { file_id: 'BBB' }, caption: 'de vientre' }
  }];
  const { actions } = parseUpdates(updates, CTX);
  assert.equal(actions[0].kind, 'draft');
  assert.equal(actions[0].title, 'de vientre');
  assert.equal(actions[0].id, 'q_12');
  assert.equal(actions[0].fileId, 'BBB');
});

test('draft callbacks from a private chat are parsed', () => {
  const updates = [
    { update_id: 13, callback_query: { id: 'cb3', data: 'draft:title',
      message: { message_id: 20, chat: { id: 777, type: 'private' } }, from: { id: 777 } } },
    { update_id: 14, callback_query: { id: 'cb4', data: 'draft:anon',
      message: { message_id: 21, chat: { id: 777, type: 'private' } }, from: { id: 777 } } },
    { update_id: 15, callback_query: { id: 'cb5', data: 'draft:send',
      message: { message_id: 22, chat: { id: 777, type: 'private' } }, from: { id: 777 } } },
  ];
  const { actions, offset } = parseUpdates(updates, CTX);
  assert.equal(offset, 16);
  assert.deepEqual(actions[0], { kind: 'draft-title', chatId: 777, callbackId: 'cb3', draftMsgId: 20 });
  assert.deepEqual(actions[1], { kind: 'draft-anon', chatId: 777, callbackId: 'cb4', draftMsgId: 21 });
  assert.deepEqual(actions[2], { kind: 'draft-send', chatId: 777, callbackId: 'cb5', draftMsgId: 22 });
});

test('draft callbacks from another user or the mod group are ignored', () => {
  const updates = [
    { update_id: 16, callback_query: { id: 'cb6', data: 'draft:send',
      message: { message_id: 23, chat: { id: 777, type: 'private' } }, from: { id: 999 } } },
    { update_id: 17, callback_query: { id: 'cb7', data: 'draft:send',
      message: { message_id: 24, chat: { id: -1001234 } } } },
  ];
  const { actions, offset } = parseUpdates(updates, CTX);
  assert.equal(actions.length, 0);
  assert.equal(offset, 18);
});

test('a text reply while awaiting a title becomes a draft-title-text action', () => {
  const updates = [{
    update_id: 18,
    message: { message_id: 9, chat: { id: 777, type: 'private' },
      from: { first_name: 'Marta' }, text: 'la de la boda' }
  }];
  const ctx = { modGroupId: -1001234, awaitingTitle: { '777': true } };
  const { actions } = parseUpdates(updates, ctx);
  assert.deepEqual(actions[0], { kind: 'draft-title-text', chatId: 777, title: 'la de la boda' });
});

test('plain text without awaiting title is ignored', () => {
  const updates = [{
    update_id: 19,
    message: { message_id: 10, chat: { id: 777, type: 'private' },
      from: { first_name: 'Marta' }, text: 'hola' }
  }];
  const { actions, offset } = parseUpdates(updates, CTX);
  assert.equal(actions.length, 0);
  assert.equal(offset, 20);
});

test('approve/reject callbacks from the mod group are parsed', () => {
  const updates = [
    { update_id: 20, callback_query: { id: 'cb1', data: 'ok:q_10',
      message: { message_id: 99, chat: { id: -1001234 } } } },
    { update_id: 21, callback_query: { id: 'cb2', data: 'no:q_12',
      message: { message_id: 98, chat: { id: -1001234 } } } },
  ];
  const { actions, offset } = parseUpdates(updates, CTX);
  assert.equal(offset, 22);
  assert.deepEqual(actions[0], { kind:'approve', id:'q_10', callbackId:'cb1', modMsgId:99 });
  assert.deepEqual(actions[1], { kind:'reject',  id:'q_12', callbackId:'cb2', modMsgId:98 });
});

test('callbacks from other chats and non-audio messages are ignored', () => {
  const updates = [
    { update_id: 30, callback_query: { id:'x', data:'ok:q_1', message:{ message_id:1, chat:{ id: 999 } } } },
    { update_id: 31, message: { message_id: 7, chat:{ id: 5, type:'private' }, from:{ first_name:'A' }, text: 'hola' } },
  ];
  const { actions, offset } = parseUpdates(updates, CTX);
  assert.equal(actions.length, 0);
  assert.equal(offset, 32);
});

test('a reply to a mod message approves/rejects via text', () => {
  const ctx = { modGroupId: -1001234, modMsgToId: { 42: 'q_10', 43: 'q_12' } };
  const updates = [
    { update_id: 40, message: { message_id: 1, chat: { id: -1001234 },
      from: { first_name: 'Mod' }, text: 'ok',
      reply_to_message: { message_id: 42 } } },
    { update_id: 41, message: { message_id: 2, chat: { id: -1001234 },
      from: { first_name: 'Mod' }, text: 'borrar',
      reply_to_message: { message_id: 43 } } },
  ];
  const { actions } = parseUpdates(updates, ctx);
  assert.deepEqual(actions[0], { kind: 'approve', id: 'q_10', modMsgId: 42, via: 'reply' });
  assert.deepEqual(actions[1], { kind: 'reject', id: 'q_12', modMsgId: 43, via: 'reply' });
});

test('a reply to an unknown mod message or with unrelated text is ignored', () => {
  const ctx = { modGroupId: -1001234, modMsgToId: { 42: 'q_10' } };
  const updates = [
    { update_id: 50, message: { message_id: 1, chat: { id: -1001234 }, text: 'ok',
      reply_to_message: { message_id: 999 } } },
    { update_id: 51, message: { message_id: 2, chat: { id: -1001234 }, text: 'qué bien',
      reply_to_message: { message_id: 42 } } },
  ];
  const { actions, offset } = parseUpdates(updates, ctx);
  assert.equal(actions.length, 0);
  assert.equal(offset, 52);
});

test('empty batch keeps the current offset', () => {
  assert.deepEqual(parseUpdates([], CTX, 500), { actions: [], offset: 500 });
});
