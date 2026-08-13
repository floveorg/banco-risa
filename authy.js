/* authy — identidad canal-agnóstica (v1).
   Núcleo puro, sin I/O: define los niveles, deriva la key inmutable (hash
   salado, nunca expone el id en claro) y traduce la identidad de un canal a lo
   que se guarda. Driver Telegram real; email y phone quedan definidos como
   stubs para v2. El bot conserva su hashId síncrono como gemelo de keyOf.
   Se carga como <script src="authy.js"> (expone window.Authy) y como módulo Node. */
(function (global) {
  'use strict';

  var LEVELS = { anonima: 1, presencia: 2, verificada: 3, telefono: 4, biometria: 5 };

  // sha256 hex vía SubtleCrypto: navegador y Node 20+ (globalThis.crypto).
  function sha256(text) {
    return global.crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(String(text)))
      .then(function (buf) {
        return Array.from(new Uint8Array(buf))
          .map(function (b) { return b.toString(16).padStart(2, '0'); })
          .join('');
      });
  }

  // Key inmutable del usuario: nunca cambia, salada por canal e instalación.
  function keyOf(canal, idCanal, secret) {
    return sha256([secret, canal, idCanal].join(':'));
  }

  // Qué se guarda por identidad (mismo contrato que bot/identityOf):
  //   ①+② -> {idHash}   solo ① -> {idDirect}   anónima/②/nada -> {}
  // sel = { tg:bool, name:bool, anon:bool, name, username }.
  function identityOf(canal, idCanal, sel, secret) {
    var s = sel || {};
    if (s.anon) return Promise.resolve({ canal: canal, nivel: LEVELS.anonima, display: 'Anónima' });
    return keyOf(canal, idCanal, secret).then(function (key) {
      var d = s.username || s.name || String(idCanal);
      if (s.tg && s.name) return { canal: canal, nivel: LEVELS.presencia, display: d, idHash: key };
      if (s.tg) return { canal: canal, nivel: LEVELS.presencia, display: d, idDirect: String(idCanal) };
      return { canal: canal, nivel: LEVELS.anonima, display: s.name || 'Anónima' };
    });
  }

  // Driver Telegram: identifica por id numérico + username/nombre (L1–L3).
  var telegram = {
    nombre: 'telegram',
    nivelMax: LEVELS.verificada,
    stub: false,
    describe: function (u) { return u && (u.username ? '@' + u.username : u.first_name) || 'Anónima'; }
  };

  // Stubs de v2: definidos pero sin canal activo en v1 (email -> L4, phone -> L5).
  var email = { nombre: 'email', nivelMax: LEVELS.telefono, stub: true, describe: function () { return ''; } };
  var phone = { nombre: 'phone', nivelMax: LEVELS.biometria, stub: true, describe: function () { return ''; } };

  var api = {
    LEVELS: LEVELS,
    keyOf: keyOf,
    identityOf: identityOf,
    DRIVERS: { telegram: telegram, email: email, phone: phone }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Authy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
