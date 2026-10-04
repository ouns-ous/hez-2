/* Hez 2 — IA simple mais correcte.
 * Heuristique : attaquer quand l'adversaire est proche de la victoire,
 * sinon se débarrasser des grosses cartes ; garder les 1 et les 2 pour la fin.
 */
(function (global) {
  'use strict';

  var Engine = global.Hez2Engine;
  var Deck = global.Hez2Deck;

  function minOpponentHand(state, me) {
    var min = Infinity;
    for (var i = 0; i < state.players.length; i++) {
      if (i === me) continue;
      min = Math.min(min, state.players[i].hand.length);
    }
    return min === Infinity ? 0 : min;
  }

  function scoreCard(state, card, me) {
    var rules = state.rules;
    var oppMin = minOpponentHand(state, me);
    var pressure = oppMin <= 2 ? 1 : 0;
    var s = card.rank; // se débarrasser des grosses valeurs

    if (card.rank === 1) {
      var r = rules.ones[card.suit] || { draw: 0, skip: false };
      if (r.draw > 0) return 100 + pressure * 50;   // 1 الذهب : la plus forte
      if (r.skip) return 60 + pressure * 30;        // 1 الزراوط : skip
      return 5;                                     // 1 normal : à garder
    }
    if (card.rank === 2 && rules.stackTwos) return 80 + pressure * 40;
    if (card.rank === 10 && rules.tenSkips) return 55 + pressure * 30;
    if (card.rank === 7) return 18 + s;             // flexible, on la garde un peu
    return s;
  }

  function chooseIndex(state, me) {
    var idxs = Engine.playableIndices(state, me);
    if (!idxs.length) return null;
    var hand = state.players[me].hand;
    var best = idxs[0], bestScore = -Infinity;
    for (var i = 0; i < idxs.length; i++) {
      var sc = scoreCard(state, hand[idxs[i]], me);
      if (sc > bestScore) { bestScore = sc; best = idxs[i]; }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Version à base de politique (utilisée par l'UI pour jouer avec un délai)
  // ---------------------------------------------------------------------------

  function decide(state) {
    var me = state.turn;
    if (state.over) return { action: 'none' };

    // 1) Répondre à un « hez »
    if (state.pendingDraw > 0) {
      var idxs = Engine.playableIndices(state, me);
      if (idxs.length) return { action: 'play', handIndex: idxs[0] };
      return { action: 'resolvePending' };
    }

    // 2) Poser une carte
    var idx = chooseIndex(state, me);
    if (idx !== null) {
      var card = state.players[me].hand[idx];
      var out = { action: 'play', handIndex: idx };
      if (card.rank === 7) out.chosenSuit = Engine.mostCommonSuit(state, me);
      return out;
    }

    // 3) Piocher, puis rejouer si la carte tirée est jouable
    if (state.drawPile.length > 0 || state.discard.length > 1) {
      return { action: 'draw' };
    }

    // 4) Rien à faire
    return { action: 'pass' };
  }

  // Joue le tour complet du joueur courant (mode simulation / tests).
  function takeTurn(state) {
    if (state.over) return { action: 'none' };
    var d = decide(state);
    if (d.action === 'play') {
      var res = Engine.playCard(state, d.handIndex, d.chosenSuit);
      if (!res.ok) { Engine.passTurn(state); return { action: 'pass', error: res.error }; }
      return { action: 'play', card: res.card, events: res.events };
    }
    if (d.action === 'resolvePending') return Engine.resolvePendingDraw(state);
    if (d.action === 'draw') {
      var me = state.turn;
      var dr = Engine.drawOne(state);
      if (dr.card && Engine.playable(state, dr.card)) {
        var handIndex = state.players[me].hand.length - 1;
        var out = { action: 'drawPlay', card: dr.card };
        if (dr.card.rank === 7) out.chosenSuit = Engine.mostCommonSuit(state, me);
        var r2 = Engine.playCard(state, handIndex, out.chosenSuit);
        out.ok = r2.ok;
        if (!r2.ok) Engine.passTurn(state);
        return out;
      }
      Engine.passTurn(state);
      return { action: 'drawPass', card: dr.card };
    }
    Engine.passTurn(state);
    return { action: 'pass' };
  }

  var api = { decide: decide, takeTurn: takeTurn, chooseIndex: chooseIndex, scoreCard: scoreCard };

  global.Hez2AI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
