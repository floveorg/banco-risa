// Páginas de autor (v1) — tag-url automática por autor, desacoplada de authy.
//
// Cada clip publicado lleva la `key` de su autor: hash salado de su id de
// Telegram (estable, nunca en claro). Con esa key la web sirve su página de
// autor (#/u/<key>) y el bot se la regala en el aviso de publicación.
//
// authy es OTRA cosa (identidad real: varios ids, claims, niveles) y se
// construye en v2. Este módulo es general: cualquier app puede derivar su key
// y su URL de página sin depender de authy.

import { hashId } from './logic.mjs';

// Key estable de la página de autor (misma derivación que el hash anti-abuso:
// sha256 salado del id de Telegram, unidireccional).
export function authorKeyOf(chatId, secret) {
  return hashId(chatId, secret);
}

// URL de la página de autor, p. ej. https://risa.liberada.net/#/u/<key>
export function pageUrlOf(key, webUrl) {
  const base = String(webUrl || 'https://risa.liberada.net').replace(/\/+$/, '');
  return base + '/#/u/' + encodeURIComponent(key);
}

// Conveniencia: la página completa de un autor desde su chat id.
export function authorPageOf(chatId, secret, webUrl) {
  const key = authorKeyOf(chatId, secret);
  return { key, url: pageUrlOf(key, webUrl) };
}
