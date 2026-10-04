/* Hez 2 — moteur de jeu (aucune dépendance, testable dans Node).
 * Toutes les actions renvoient { ok, error?, card?, events? } et ne lancent jamais d'exception
 * sur une action invalide — l'UI peut donc appeler sans try/catch.
 */
(function (global) {
  'use strict';

  var Deck = global.Hez2Deck;
  var RulesMod = global.Hez2Rules;

  function N(state) { return state.players.length; }
  function topCard(state) { return state.discard[state.discard.length - 1] || null; }
  function nextIndex(state, from, extra) { return (from + 1 + (extra || 0)) % N(state); }

  function mostCommonSuit(state, playerIndex) {
    var hand = state.players[playerIndex].hand;
    var counts = {};
    Deck.SUITS.forEach(function (s) { counts[s.id] = 0; });
    hand.forEach(function (c) { counts[c.suit] += 1; });
    var best = Deck.SUITS[0].id, bestN = -1;
    Deck.SUITS.forEach(function (s) {
      if (counts[s.id] > bestN) { bestN = counts[s.id]; best = s.id; }
    });
    return best;
  }

  function ensureDrawPile(state) {
    if (state.drawPile.length > 0) return true;
    if (state.discard.length <= 1) return false;
    var top = state.discard.pop();
    state.drawPile = Deck.shuffle(state.discard.splice(0, state.discard.length), state.rng);
    state.discard.push(top);
    state.log.push('خلّطنا الورق ورجع للصندوق');
    return state.drawPile.length > 0;
  }

  function giveCards(state, playerIndex, count) {
    var got = [];
    for (var i = 0; i < count; i++) {
      if (!ensureDrawPile(state)) break;
      var c = state.drawPile.pop();
      state.players[playerIndex].hand.push(c);
      got.push(c);
    }
    return got;
  }

  // La carte de départ ne doit pas déclencher d'effet.
  function isPlainStarter(card, rules) {
    if (card.rank === 7) return false;
    if (card.rank === 2 && rules.stackTwos) return false;
    if (card.rank === 10 && rules.tenSkips) return false;
    if (card.rank === 1) {
      var r = rules.ones[card.suit];
      if (r && (r.draw > 0 || r.skip)) return false;
    }
    return true;
  }

  function createGame(opts) {
    opts = opts || {};
    var rules = RulesMod.clone(opts.rules || RulesMod.defaults());
    var n = opts.playerCount || rules.players || 2;
    var rng = opts.rng || Math.random;

    var players = [];
    for (var i = 0; i < n; i++) {
      players.push({
        name: (opts.names && opts.names[i]) || ('لاعب ' + (i + 1)),
        isAI: true,
        hand: []
      });
    }
    if (typeof opts.humanIndex === 'number' && players[opts.humanIndex]) {
      players[opts.humanIndex].isAI = false;
    }

    var deck = Deck.shuffle(Deck.makeDeck(), rng);

    var state = {
      rules: rules,
      rng: rng,
      players: players,
      drawPile: deck,
      discard: [],
      turn: 0,
      currentSuit: null,
      pendingDraw: 0,
      drewThisTurn: false,
      over: false,
      winner: null,
      log: []
    };

    // Distribution
    for (var k = 0; k < rules.handSize; k++) {
      for (var p = 0; p < n; p++) players[p].hand.push(state.drawPile.pop());
    }

    // Carte de départ (on écarte les cartes à effet)
    var starter = state.drawPile.pop();
    var guard = 0;
    while (!isPlainStarter(starter, rules) && guard < 200) {
      state.drawPile.unshift(starter);
      starter = state.drawPile.pop();
      guard++;
    }
    state.discard.push(starter);
    state.currentSuit = starter.suit;

    state.log.push('بدات اللعبة — ' + n + ' لاعبين، ' + rules.handSize + ' ورقات لكل واحد');
    state.log.push('الورقة في الوسط: ' + Deck.cardLabel(starter));
    return state;
  }

  function playable(state, card) {
    var t = topCard(state);
    if (!t) return true;
    if (state.pendingDraw > 0) return card.rank === 2 && state.rules.stackTwos;
    if (card.rank === t.rank) return true;
    if (card.suit === state.currentSuit) return true;
    return false;
  }

  function playableIndices(state, playerIndex) {
    var idx = (typeof playerIndex === 'number') ? playerIndex : state.turn;
    var hand = state.players[idx].hand;
    var out = [];
    for (var i = 0; i < hand.length; i++) if (playable(state, hand[i])) out.push(i);
    return out;
  }

  function playCard(state, handIndex, chosenSuit) {
    if (state.over) return { ok: false, error: 'اللعبة سالات' };
    var p = state.players[state.turn];
    var card = p.hand[handIndex];
    if (!card) return { ok: false, error: 'ما كايناش هاد الورقة' };
    if (!playable(state, card)) return { ok: false, error: 'هاد الورقة ما كتلعبش دابا' };

    p.hand.splice(handIndex, 1);
    state.discard.push(card);
    state.currentSuit = card.suit;
    state.drewThisTurn = false;

    var events = [];
    var skip = 0;

    if (card.rank === 2 && state.rules.stackTwos) {
      state.pendingDraw += 2;
      events.push({ type: 'stack2', total: state.pendingDraw });
      state.log.push(p.name + ' لعب 2 → هز ' + state.pendingDraw + '!');
    } else if (card.rank === 7 && state.rules.sevenChangesSuit) {
      var suit = (chosenSuit && Deck.suitById(chosenSuit)) ? chosenSuit : mostCommonSuit(state, state.turn);
      state.currentSuit = suit;
      events.push({ type: 'suit', suit: suit });
      state.log.push(p.name + ' لعب 7 (السيّار) وبدّل الساري لـ ' + Deck.suitById(suit).ar);
    } else if (card.rank === 10 && state.rules.tenSkips) {
      skip = 1;
      events.push({ type: 'skip', by: 10, target: nextIndex(state, state.turn, 0) });
      state.log.push(p.name + ' لعب 10 (Sota) → تسكيب ' + state.players[nextIndex(state, state.turn, 0)].name);
    } else if (card.rank === 1) {
      var r = state.rules.ones[card.suit] || { draw: 0, skip: false };
      if (r.draw > 0) {
        var target = nextIndex(state, state.turn, 0);
        var got = giveCards(state, target, r.draw);
        skip = 1;
        events.push({ type: 'forceDraw', target: target, count: got.length });
        state.log.push(p.name + ' لعب 1 الذهب → ' + state.players[target].name + ' هز ' + got.length + ' ورقات وما لعبش');
      } else if (r.skip) {
        skip = 1;
        events.push({ type: 'skip', by: 1, target: nextIndex(state, state.turn, 0) });
        state.log.push(p.name + ' لعب 1 ' + Deck.suitById(card.suit).ar + ' → تسكيب');
      } else {
        state.log.push(p.name + ' لعب ' + Deck.cardLabel(card));
      }
    } else {
      state.log.push(p.name + ' لعب ' + Deck.cardLabel(card));
    }

    if (p.hand.length === 0) {
      state.over = true;
      state.winner = state.turn;
      events.push({ type: 'win', winner: state.turn });
      state.log.push(p.name + ' ربح اللعبة!');
    } else {
      state.turn = nextIndex(state, state.turn, skip);
      events.push({ type: 'turn', turn: state.turn });
    }

    return { ok: true, card: card, events: events };
  }

  function drawOne(state) {
    if (state.over) return { ok: false, error: 'اللعبة سالات' };
    var p = state.players[state.turn];
    var got = giveCards(state, state.turn, 1);
    state.drewThisTurn = true;
    if (!got.length) {
      state.log.push('ما بقا حتا ورق فالصندوق — ' + p.name + ' داز');
      return { ok: true, card: null, empty: true };
    }
    state.log.push(p.name + ' سحب ورقة');
    return { ok: true, card: got[0] };
  }

  function anyoneCanPlay(state) {
    for (var i = 0; i < N(state); i++) {
      if (playableIndices(state, i).length > 0) return true;
    }
    return false;
  }

  function passTurn(state) {
    if (state.over) return { ok: false, error: 'اللعبة سالات' };
    state.drewThisTurn = false;

    // Blocage : plus personne ne peut jouer, la pioche et le talon sont vides.
    if (state.drawPile.length === 0 && state.discard.length <= 1 && !anyoneCanPlay(state)) {
      var best = 0;
      for (var i = 1; i < N(state); i++) {
        if (state.players[i].hand.length < state.players[best].hand.length) best = i;
      }
      state.over = true;
      state.winner = best;
      state.log.push('الورق تحبس — ' + state.players[best].name + ' عندو أقل ورق وربح');
      return { ok: true, blocked: true, winner: best };
    }

    state.turn = nextIndex(state, state.turn, 0);
    return { ok: true, turn: state.turn };
  }

  function resolvePendingDraw(state) {
    if (state.over) return { ok: false, error: 'اللعبة سالات' };
    if (state.pendingDraw <= 0) return { ok: false, error: 'ما كاين حتا هز' };
    var p = state.players[state.turn];
    var count = state.pendingDraw;
    var got = giveCards(state, state.turn, count);
    state.pendingDraw = 0;
    state.log.push(p.name + ' هز ' + got.length + ' ورقات وداز الدور');
    var loser = state.turn;
    state.turn = nextIndex(state, state.turn, 0);
    state.drewThisTurn = false;
    return { ok: true, cards: got, player: loser, turn: state.turn };
  }

  // Le joueur courant a-t-il au moins une action possible (poser ou piocher) ?
  function legalMoves(state) {
    var idx = playableIndices(state);
    return { play: idx, canDraw: state.drawPile.length > 0 || state.discard.length > 1 };
  }

  var api = {
    createGame: createGame,
    topCard: topCard,
    playable: playable,
    playableIndices: playableIndices,
    playCard: playCard,
    drawOne: drawOne,
    passTurn: passTurn,
    resolvePendingDraw: resolvePendingDraw,
    giveCards: giveCards,
    mostCommonSuit: mostCommonSuit,
    legalMoves: legalMoves,
    nextIndex: nextIndex
  };

  global.Hez2Engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
