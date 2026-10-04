/* Hez 2 — deck espagnol marocain (40 cartes)
 * Fonctionne en navigateur (script classique) ET en Node (tests).
 */
(function (global) {
  'use strict';

  // الـ id كيبقا ثابت (dhab/kass/syouf/zrawet) — الاسم اللي كيبان هو اللي كيتبدل.
  // رموز قديمة (Emoji 1.0) باش يبانو ف كل الأنظمة — الرموز الجداد كيخرجو مربعين.
  var SUITS = [
    { id: 'dhab',   ar: 'الفلوس',  fr: 'Dhab (pièces)',  emoji: '💰', color: '#e8b21f', aliases: ['الذهب', 'الفلوس', 'فلوس', 'flous', 'fls'] },
    { id: 'kass',   ar: 'جْبن',    fr: 'Kass / Jben (coupes)', emoji: '🍷', color: '#d64545', aliases: ['جبن', 'الكأس', 'الكيسان', 'كاس', 'jben', 'jban', 'kass'] },
    { id: 'syouf',  ar: 'السيوف',  fr: 'Syouf (épées)',  emoji: '⚔️', color: '#3d7bd6', aliases: ['السيوف', 'سيوف'] },
    { id: 'zrawet', ar: 'الزراوط', fr: 'Zrawet (bâtons)', emoji: '🌳', color: '#2f9e5f', aliases: ['الزراوط', 'الزرابيط', 'العصي'] }
  ];

  // Pas de 8 ni 9 dans la carte espagnole : 10 = Sota, 11 = Caballo, 12 = Rey
  var RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
  var RANK_NAMES = { 10: 'Sota', 11: 'Caballo', 12: 'Rey' };

  function suitById(id) {
    for (var i = 0; i < SUITS.length; i++) if (SUITS[i].id === id) return SUITS[i];
    return null;
  }

  function makeDeck() {
    var d = [];
    for (var s = 0; s < SUITS.length; s++) {
      for (var r = 0; r < RANKS.length; r++) {
        d.push({ suit: SUITS[s].id, rank: RANKS[r] });
      }
    }
    return d; // 40 cartes
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function cardLabel(card) {
    var s = suitById(card.suit);
    return (RANK_NAMES[card.rank] || String(card.rank)) + ' ' + (s ? s.ar : card.suit);
  }

  var api = {
    SUITS: SUITS,
    RANKS: RANKS,
    RANK_NAMES: RANK_NAMES,
    suitById: suitById,
    makeDeck: makeDeck,
    shuffle: shuffle,
    cardLabel: cardLabel
  };

  global.Hez2Deck = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
