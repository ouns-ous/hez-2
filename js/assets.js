/* Hez 2 — chargement des images de cartes (assets/cards/<suit>-<rank>.<ext>).
 *
 * Ordre essayé : .svg -> .png -> .jpg. Le premier qui répond est mémorisé.
 * Si aucun ne répond -> l'UI garde la carte dessinée (rang + emoji).
 * La partie ne casse jamais, même sans une seule image.
 */
(function (global) {
  'use strict';

  var EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg'];
  var cache = {};          // 'dhab-1' -> 'svg' | 'png' | 'jpg' | 'jpeg' | 'fail'
  var forceFail = false;   // désactive les images (tests / mode émoji)

  function key(card) { return card.suit + '-' + card.rank; }
  function url(card, ext) { return 'assets/cards/' + key(card) + '.' + ext; }
  function urlSvg(card) { return url(card, 'svg'); }
  function urlPng(card) { return url(card, 'png'); }
  function urlJpg(card) { return url(card, 'jpg'); }

  function state(card) { return forceFail ? 'fail' : (cache[key(card)] || 'unknown'); }
  function has(card) {
    var s = state(card);
    return s !== 'unknown' && s !== 'fail';
  }
  function src(card) {
    var s = state(card);
    return url(card, (s === 'unknown' || s === 'fail') ? EXTENSIONS[0] : s);
  }
  function remember(card, value) { cache[key(card)] = value; }

  // Cherche .svg, puis .png, puis .jpg. `done(value)` est appelé exactement une fois.
  function probe(card, done) {
    var already = state(card);
    if (already !== 'unknown') { if (done) done(already); return; }

    if (typeof Image === 'undefined') { remember(card, 'fail'); if (done) done('fail'); return; }

    var i = 0;
    function next() {
      if (i >= EXTENSIONS.length) { remember(card, 'fail'); if (done) done('fail'); return; }
      var ext = EXTENSIONS[i++];
      var img = new Image();
      img.onload = function () { remember(card, ext); if (done) done(ext); };
      img.onerror = next;
      img.src = url(card, ext);
    }
    next();
  }

  function probeAll(cards, done) {
    var pending = 1, fired = false;
    function finish() { if (pending === 0 && !fired) { fired = true; if (done) done(); } }
    cards.forEach(function (c) { pending++; probe(c, function () { pending--; finish(); }); });
    pending--; finish();
  }

  function reset() { cache = {}; }
  function stats() {
    var out = { svg: 0, png: 0, jpg: 0, jpeg: 0, fail: 0 };
    Object.keys(cache).forEach(function (k) { out[cache[k]] = (out[cache[k]] || 0) + 1; });
    return out;
  }

  var api = {
    EXTENSIONS: EXTENSIONS,
    key: key, url: url, urlSvg: urlSvg, urlPng: urlPng, urlJpg: urlJpg,
    state: state, has: has, src: src,
    probe: probe, probeAll: probeAll,
    reset: reset, stats: stats,
    setEnabled: function (v) { forceFail = !v; }
  };

  global.Hez2Assets = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
