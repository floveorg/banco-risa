import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUpdates } from '../logic.mjs';

const CTX = { modGroupId: -1001234 };

test('a private voice message becomes an ingest action', () => {
  const updates = [{
    update_id: 10,
    message: { message_id: 5, chat: { id: 777, type: 'private' },
      from: { first_name: 'Marta' }, voice: { file_id: 'AAA', duration: 3 } }
  }];
  const { actions, offset } = parseUpdates(updates, CTX);
  assert.equal(offset, 11);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], {
    kind: 'ingest', id: 'q_10', fromChatId: 777, fromMsgId: 5,
    name: 'Marta', tags: '', uploaderChatId: 777
  });
});

test('an audio message with a caption carries the caption as tags', () => {
  const updates = [{
    update_id: 12,
    message: { message_id: 6, chat: { id: 888, type: 'private' },
      from: { first_name: 'Yusuf' }, audio: { file_id: 'BBB' }, caption: 'de vientre' }
  }];
  const { actions } = parseUpdates(updates, CTX);
  assert.equal(actions[0].kind, 'ingest');
  assert.equal(actions[0].tags, 'de vientre');
  assert.equal(actions[0].id, 'q_12');
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

test('empty batch keeps the current offset', () => {
  assert.deepEqual(parseUpdates([], CTX, 500), { actions: [], offset: 500 });
});
