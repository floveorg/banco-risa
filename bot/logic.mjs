// Pure logic: Telegram getUpdates -> ordered actions + new offset. No I/O.

export function parseUpdates(updates, ctx, currentOffset = 0) {
  const actions = [];
  let maxId = -1;
  for (const u of updates) {
    if (typeof u.update_id === 'number') maxId = Math.max(maxId, u.update_id);

    const cb = u.callback_query;
    if (cb && cb.message && cb.message.chat && cb.message.chat.id === ctx.modGroupId) {
      const m = /^(ok|no):(.+)$/.exec(cb.data || '');
      if (m) {
        actions.push({
          kind: m[1] === 'ok' ? 'approve' : 'reject',
          id: m[2], callbackId: cb.id, modMsgId: cb.message.message_id
        });
      }
      continue;
    }

    const msg = u.message;
    if (msg && msg.chat && msg.chat.type === 'private') {
      const media = msg.voice || msg.audio;
      if (media && media.file_id) {
        actions.push({
          kind: 'ingest', id: 'q_' + u.update_id,
          fileId: media.file_id,
          fromChatId: msg.chat.id, fromMsgId: msg.message_id,
          name: (msg.from && msg.from.first_name) || 'Anónima',
          tags: (msg.caption || '').trim(),
          uploaderChatId: msg.chat.id
        });
      }
    }
  }
  const offset = maxId >= 0 ? maxId + 1 : currentOffset;
  return { actions, offset };
}

export function bancoEntry({ id, name, tags, when, src }) {
  // `src` is the absolute audio URL (Cloudinary secure_url). The website composes
  // the license (`by`, `orig`) from `name`; the bot never writes those (see spec §4).
  const e = {
    id,
    name: name || 'Anónima',
    src,
    when
  };
  if (tags) e.tags = tags;
  return e;
}

export function prependClip(banco, entry) {
  return [entry, ...(Array.isArray(banco) ? banco : [])];
}
