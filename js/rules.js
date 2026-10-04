/* Hez 2 — règles configurables.
 * Chaque quartier joue sa variante : tout est réglable ici, sans toucher au moteur.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'hez2.rules.v2';

  // Preset B (recommandé) : chaque 1 a son propre effet.
  //   1 الذهب  = le joueur suivant pioche 5 et perd son tour
  //   1 الزراوط = skip (comme le 10)
  //   1 السيوف / 1 الكأس = cartes normales
  function presetB() {
    return {
      players: 2,
      handSize: 4,
      playAfterDraw: false,   // après avoir pioché, le tour passe (décoché)
      stackTwos: true,       // 2 sur 2 → hez 4, hez 6…
      sevenChangesSuit: true,// le 7 (السيّار) change la couleur
      tenSkips: true,        // le 10 (Sota) skip
      ones: {
        dhab:   { draw: 5, skip: true },
        zrawet: { draw: 0, skip: false },
        syouf:  { draw: 0, skip: false },
        kass:   { draw: 0, skip: false }
      },
      cartaRule: false,      // désactivé par défaut
      cartaPenalty: 2,       // sinon tu pioches 2
      aiForgetsCarta: 0.15   // l'IA oublie de dire Carta 15 % du temps
    };
  }

  // Preset A : tous les 1 skippent, et en plus le 1 الذهب fait piocher 5.
  function presetA() {
    var r = presetB();
    r.ones.zrawet.skip = true;
    r.ones.syouf.skip = true;
    r.ones.kass.skip = true;
    return r;
  }

  // Preset « simple » : aucun effet sur les 1 (comme la version de base).
  function presetSimple() {
    var r = presetB();
    r.ones = {
      dhab:   { draw: 0, skip: false },
      zrawet: { draw: 0, skip: false },
      syouf:  { draw: 0, skip: false },
      kass:   { draw: 0, skip: false }
    };
    return r;
  }

  var PRESETS = {
    B: { label: 'B — كل 1 عندو مفعولو (مقترح)', build: presetB },
    A: { label: 'A — كل الـ 1 كيسكيبو + الذهب 5', build: presetA },
    simple: { label: 'بسيطة — بلا مفعول للـ 1', build: presetSimple }
  };

  function clone(r) { return JSON.parse(JSON.stringify(r)); }

  function defaults() { return presetB(); }

  function load() {
    try {
      if (typeof localStorage === 'undefined') return defaults();
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      var parsed = JSON.parse(raw);
      return merge(defaults(), parsed);
    } catch (e) {
      return defaults();
    }
  }

  function save(rules) {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
      return true;
    } catch (e) {
      return false;
    }
  }

  function merge(base, patch) {
    var out = clone(base);
    if (!patch) return out;
    Object.keys(patch).forEach(function (k) {
      if (k === 'ones' && patch.ones) {
        Object.keys(patch.ones).forEach(function (s) {
          if (out.ones[s]) {
            if (typeof patch.ones[s].draw === 'number') out.ones[s].draw = patch.ones[s].draw;
            if (typeof patch.ones[s].skip === 'boolean') out.ones[s].skip = patch.ones[s].skip;
          }
        });
      } else if (typeof patch[k] === typeof out[k] && typeof patch[k] !== 'object') {
        out[k] = patch[k];
      } else if (typeof patch[k] === 'object' && patch[k] !== null && typeof out[k] === 'object') {
        out[k] = patch[k];
      }
    });
    return out;
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    PRESETS: PRESETS,
    defaults: defaults,
    clone: clone,
    merge: merge,
    load: load,
    save: save
  };

  global.Hez2Rules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
