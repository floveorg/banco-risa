/* Risa liberada — helpers puros (compartidos por la página y los tests).
   Se carga como <script src="risa.js"> (expone window.Risa) y como módulo Node. */
(function (global) {
  'use strict';

  var LICENSE = 'CC BY-SA 4.0';
  var LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/deed.es';

  // Clip publicado {id,t?,name,tags?,src,when?} -> pista del reproductor.
  function buildRisaTracks(risas) {
    if (!Array.isArray(risas)) return [];
    return risas
      .filter(function (c) { return c && c.src; })
      .map(function (c) {
        return {
          t: c.t || ('Risa de ' + (c.name || 'alguien')),
          src: c.src,
          tags: c.tags || 'risa libre',
          by: (c.name || 'Anónima') + ' · ' + LICENSE,
          orig: LICENSE_URL,
          origLabel: 'licencia',
          clip: c
        };
      });
  }

  // Clips publicados -> ítems del feed "Últimas risas".
  function latestFeed(risas, n) {
    if (!Array.isArray(risas)) return [];
    return risas.slice(0, n || 6).map(function (c) {
      return {
        name: (c && c.name) || 'Anónima',
        tags: (c && c.tags) || 'risa libre',
        when: (c && c.when) || 'ahora'
      };
    });
  }

  var api = {
    buildRisaTracks: buildRisaTracks,
    latestFeed: latestFeed,
    RISA_URL: 'https://risa.liberada.net/risa.json',
    TELEGRAM_BOT: 'https://t.me/RisaLiberadaBot',
    LICENSE: LICENSE,
    LICENSE_URL: LICENSE_URL
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Risa = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
