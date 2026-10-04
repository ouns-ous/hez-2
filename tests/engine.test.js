/* Tests du moteur Hez 2 — sans framework : node tests/engine.test.js */
'use strict';

var path = require('path');
function load(f) { return require(path.join(__dirname, '..', 'js', f)); }

var Deck = load('deck.js');
var Rules = load('rules.js');
var Engine = load('engine.js');
var AI = load('ai.js');

var pass = 0, fail = 0;
function group(name) { console.log('\n' + name); }
function ok(cond, label) {
  if (cond) { pass++; console.log('  \u2713 ' + label); }
  else { fail++; console.log('  \u2717 ' + label); }
}
function eq(a, b, label) { ok(a === b, label + '  (attendu ' + b + ', obtenu ' + a + ')'); }

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// État construit à la main : indispensable pour tester un effet précis.
function fixture(opts) {
  var rules = Rules.merge(Rules.defaults(), opts.rules || {});
  var filler = [];
  for (var i = 0; i < (opts.drawCount === undefined ? 20 : opts.drawCount); i++) {
    filler.push({ suit: 'syouf', rank: 4 });
  }
  return {
    rules: rules,
    rng: mulberry32(42),
    players: opts.hands.map(function (h, i) {
      return { name: 'P' + i, isAI: true, hand: h.slice() };
    }),
    drawPile: filler,
    discard: [opts.top],
    turn: opts.turn || 0,
    currentSuit: opts.currentSuit || opts.top.suit,
    pendingDraw: opts.pendingDraw || 0,
    drewThisTurn: false,
    over: false,
    winner: null,
    log: []
  };
}

// ---------------------------------------------------------------- paquet
group('Paquet espagnol');
(function () {
  var d = Deck.makeDeck();
  eq(d.length, 40, 'le paquet compte 40 cartes');
  eq(Deck.SUITS.length, 4, '4 couleurs (Dhab, Kass, Syouf, Zrawet)');
  ok(d.every(function (c) { return c.rank !== 8 && c.rank !== 9; }), 'pas de 8 ni de 9');
  ok(d.some(function (c) { return c.rank === 10; }) && d.some(function (c) { return c.rank === 12; }), 'contient 10 (Sota) et 12 (Rey)');
  var suits = {};
  d.forEach(function (c) { suits[c.suit] = (suits[c.suit] || 0) + 1; });
  ok(Object.keys(suits).every(function (k) { return suits[k] === 10; }), '10 cartes par couleur');
})();

// ---------------------------------------------------------------- distribution
group('Distribution');
(function () {
  var st = Engine.createGame({ rules: Rules.defaults(), playerCount: 2, rng: mulberry32(7) });
  eq(st.players.length, 2, '2 joueurs');
  eq(st.players[0].hand.length, 4, '4 cartes par joueur');
  eq(st.discard.length, 1, '1 carte au centre');
  eq(st.drawPile.length, 31, '31 cartes dans la pioche (40 - 8 - 1)');
  eq(st.turn, 0, 'le joueur 0 commence');
  ok(st.currentSuit === st.discard[0].suit, 'la couleur de départ est celle de la carte du centre');
  var starterCards = [];
  for (var i = 0; i < 40; i++) {
    var s = Engine.createGame({ rules: Rules.defaults(), playerCount: 4, rng: mulberry32(i) });
    starterCards.push(s.discard[0]);
  }
  var dflt = Rules.defaults();
  ok(starterCards.every(function (c) { return c.rank !== 7; }), 'la carte de départ n\'est jamais un 7');
  ok(starterCards.every(function (c) {
    if (c.rank !== 1) return true;
    var r = dflt.ones[c.suit];
    return !(r.draw > 0 || r.skip);
  }), 'un 1 à effet (Dhab / Zrawet) n\'est jamais la carte de départ');
  ok(starterCards.every(function (c) { return c.rank !== 2; }), 'la carte de départ n\'est jamais un 2');
})();

// ---------------------------------------------------------------- jouabilité
group('Cartes jouables');
(function () {
  var st = fixture({ top: { suit: 'dhab', rank: 5 }, hands: [[{ suit: 'dhab', rank: 12 }, { suit: 'kass', rank: 5 }, { suit: 'zrawet', rank: 3 }]] });
  ok(Engine.playable(st, { suit: 'dhab', rank: 3 }), 'même couleur = jouable');
  ok(Engine.playable(st, { suit: 'zrawet', rank: 5 }), 'même rang = jouable');
  ok(!Engine.playable(st, { suit: 'zrawet', rank: 3 }), 'ni couleur ni rang = bloquée');
  eq(Engine.playableIndices(st).length, 2, '2 cartes jouables sur 3');
})();

group('Couleur changée par un 7');
(function () {
  var st = fixture({
    top: { suit: 'zrawet', rank: 7 }, currentSuit: 'syouf',
    hands: [[{ suit: 'syouf', rank: 3 }, { suit: 'zrawet', rank: 2 }, { suit: 'zrawet', rank: 7 }]]
  });
  ok(Engine.playable(st, { suit: 'syouf', rank: 3 }), 'après un 7, on suit la couleur annoncée');
  ok(!Engine.playable(st, { suit: 'zrawet', rank: 2 }), 'un 2 de l\'ancienne couleur n\'est pas jouable');
  ok(Engine.playable(st, { suit: 'zrawet', rank: 7 }), 'un autre 7 reste jouable (même rang)');
})();

// ---------------------------------------------------------------- effets
group('Effet du 2 (cumul)');
(function () {
  var st = fixture({
    top: { suit: 'kass', rank: 3 },
    hands: [
      [{ suit: 'kass', rank: 2 }, { suit: 'kass', rank: 6 }],
      [{ suit: 'dhab', rank: 2 }, { suit: 'dhab', rank: 5 }],
      [{ suit: 'syouf', rank: 6 }]
    ]
  });
  var r = Engine.playCard(st, 0);
  ok(r.ok, 'le 2 se pose');
  eq(st.pendingDraw, 2, 'le suivant doit piocher 2');
  eq(st.turn, 1, 'le tour passe au suivant');
  var r2 = Engine.playCard(st, 0);
  ok(r2.ok, 'le suivant peut cumuler avec un autre 2');
  eq(st.pendingDraw, 4, 'le compteur monte à 4');
  var r3 = Engine.resolvePendingDraw(st);
  ok(r3.ok, 'le 3e joueur subit le hez');
  eq(st.pendingDraw, 0, 'le compteur se remet à zéro');
  ok(r3.cards.length === 4, 'il pioche bien 4 cartes');
})();

group('Effet du 1 الذهب (pioche 5 + skip)');
(function () {
  var st = fixture({
    top: { suit: 'dhab', rank: 3 },
    hands: [[{ suit: 'dhab', rank: 1 }, { suit: 'dhab', rank: 5 }], [], []],
    turn: 0
  });
  var r = Engine.playCard(st, 0);
  ok(r.ok, 'le 1 Dhab se pose');
  eq(st.players[1].hand.length, 5, 'le joueur suivant pioche 5');
  eq(st.turn, 2, 'il est sauté, c\'est au 3e de jouer');
  eq(st.pendingDraw, 0, 'pas de hez en attente');
})();

group('Effet du 1 الزراوط (skip, si activé)');
(function () {
  var b = { ones: { zrawet: { draw: 0, skip: true } } };
  var st = fixture({ rules: b, top: { suit: 'zrawet', rank: 4 }, hands: [[{ suit: 'zrawet', rank: 1 }, { suit: 'zrawet', rank: 5 }], [], []], turn: 0 });
  var r = Engine.playCard(st, 0);
  ok(r.ok, 'le 1 Zrawet se pose');
  eq(st.turn, 2, 'le suivant est sauté');
  eq(st.players[1].hand.length, 0, 'et il ne pioche rien');
})();

group('Effet du 1 normal (preset B : Syouf)');
(function () {
  var st = fixture({ top: { suit: 'syouf', rank: 4 }, hands: [[{ suit: 'syouf', rank: 1 }, { suit: 'syouf', rank: 5 }], [], []], turn: 0 });
  Engine.playCard(st, 0);
  eq(st.turn, 1, 'aucun effet : le tour passe normalement');
})();

group('Preset A : tous les 1 skippent');
(function () {
  var a = Rules.PRESETS.A.build();
  var st = fixture({ rules: a, top: { suit: 'syouf', rank: 4 }, hands: [[{ suit: 'syouf', rank: 1 }, { suit: 'syouf', rank: 5 }], [], []], turn: 0 });
  Engine.playCard(st, 0);
  eq(st.turn, 2, 'le 1 Syouf skippe aussi');
})();

group('Effet du 10 (skip)');
(function () {
  var st = fixture({ top: { suit: 'dhab', rank: 3 }, hands: [[{ suit: 'dhab', rank: 10 }, { suit: 'dhab', rank: 4 }], [], []], turn: 0 });
  Engine.playCard(st, 0);
  eq(st.turn, 2, 'le 10 saute le joueur suivant');
})();

group('Effet du 7 (changement de couleur)');
(function () {
  var st = fixture({ top: { suit: 'dhab', rank: 3 }, hands: [[{ suit: 'dhab', rank: 7 }], [], []], turn: 0 });
  Engine.playCard(st, 0, 'zrawet');
  eq(st.currentSuit, 'zrawet', 'la couleur demandée est appliquée');
  var st2 = fixture({ top: { suit: 'dhab', rank: 3 }, hands: [[{ suit: 'dhab', rank: 7 }, { suit: 'kass', rank: 4 }, { suit: 'kass', rank: 6 }], [], []] });
  Engine.playCard(st2, 0);
  eq(st2.currentSuit, 'kass', 'sans choix explicite, l\'IA prend la couleur majoritaire');
})();

group('Fin de partie');
(function () {
  var st = fixture({ top: { suit: 'kass', rank: 4 }, hands: [[{ suit: 'kass', rank: 6 }], [{ suit: 'dhab', rank: 2 }]], turn: 0 });
  var r = Engine.playCard(st, 0);
  ok(r.ok && st.over, 'poser sa dernière carte termine la partie');
  eq(st.winner, 0, 'le vainqueur est enregistré');
  var again = Engine.playCard(st, 0);
  ok(!again.ok, 'on ne peut plus jouer après la fin');
})();

group('Coup invalide');
(function () {
  var st = fixture({ top: { suit: 'dhab', rank: 5 }, hands: [[{ suit: 'zrawet', rank: 3 }]], turn: 0 });
  var r = Engine.playCard(st, 0);
  ok(!r.ok, 'jouer une carte illégale est refusé');
  eq(st.players[0].hand.length, 1, 'et la main n\'est pas modifiée');
})();

group('Pioche et recyclage du talon');
(function () {
  var st = fixture({ top: { suit: 'dhab', rank: 5 }, hands: [[], []], drawCount: 0, turn: 0 });
  st.discard.push({ suit: 'kass', rank: 6 }, { suit: 'syouf', rank: 7 });
  var got = Engine.giveCards(st, 0, 3);
  eq(got.length, 2, 'on pioche les 2 cartes recyclables du talon');
  eq(st.drawPile.length, 0, 'la pioche se vide');
  ok(st.discard.length === 1, 'la carte du dessus reste visible au centre');
})();

group('Parties complètes (IA contre IA)');
(function () {
  var games = 2000, blocked = 0, maxTurns = 0, winners = [0, 0, 0, 0];
  for (var g = 0; g < games; g++) {
    var n = 2 + (g % 3);
    var st = Engine.createGame({ rules: Rules.defaults(), playerCount: n, rng: mulberry32(g + 1) });
    var t = 0;
    while (!st.over && t < 900) { AI.takeTurn(st); t++; }
    if (!st.over) blocked++;
    if (t > maxTurns) maxTurns = t;
    if (st.winner !== null) winners[st.winner]++;
  }
  eq(blocked, 0, games + ' parties se terminent toutes (aucune bloquée)');
  ok(maxTurns < 900, 'la plus longue partie fait ' + maxTurns + ' tours');
  ok(winners.every(function (w) { return w > 0; }), 'les 4 positions gagnent au moins une fois');
})();

// ---------------------------------------------------------------- résumé
console.log('\n' + (fail === 0 ? '\u2705' : '\u274c') + ' ' + pass + ' tests OK, ' + fail + ' échec(s)');
process.exit(fail === 0 ? 0 : 1);
