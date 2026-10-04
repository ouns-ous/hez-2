/* Hez 2 — interface (DOM pur, aucune dépendance). */
(function () {
  'use strict';

  var Deck = window.Hez2Deck;
  var Rules = window.Hez2Rules;
  var Engine = window.Hez2Engine;
  var AI = window.Hez2AI;
  var Assets = window.Hez2Assets;

  var state = null;
  var playerCount = 2;
  var timers = { ai: null, carta: null, autoPass: null, rerender: null };
  var pendingCarta = false;   // le joueur humain n'a pas encore dit « Carta! »
  var aiForgot = null;        // index de l'IA qui a oublié de dire « Carta! »
  var suitPickerCb = null;
  var lastDiscardLength = 0;  // pour l'animation d'arrivée d'une carte
  var PILE_VISIBLE = 5;       // nombre de cartes visibles dans le tas du milieu
  var bubbleTimer = null;
  var seatByPlayer = {};      // index du joueur -> 'top' | 'left' | 'right' | 'bottom'

  // Réglages de l'éventail de la main (circulaire exact, comme une vraie main).
  var HAND_FAN = {
    cardW: 64,       // largeur d'une carte en px (repli si le CSS manque)
    minStep: 14,     // écart minimum entre deux cartes (très grande main)
    overlap: 0.62,   // largeur VISIBLE de chaque carte (0.62 -> elles se chevauchent)
    radius: 3,       // rayon du cercle : PETIT = rotation marquée, GRAND = arc doux
    liftRatio: 0.14  // les cartes jouables montent juste un peu (fraction de la largeur)
  };

  // Avatars des adversaires, par index de joueur.
  var AVATARS = ['🧑', '🧔', '👩', '🧓', '👦', '🧕'];

  // Score de session : toi contre les IA (gardé sur l'appareil).
  var SCORE_KEY = 'hez2.score.v1';
  var wins = { us: 0, them: 0 };
  var scoreCounted = false;

  // ---------------------------------------------------------------- utilitaires
  function $(id) { return document.getElementById(id); }
  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function humanIndex() {
    for (var i = 0; i < state.players.length; i++) if (!state.players[i].isAI) return i;
    return 0;
  }
  function clearTimers() {
    clearTimeout(timers.ai); clearTimeout(timers.carta);
    clearTimeout(timers.autoPass); clearTimeout(timers.rerender);
    timers.ai = timers.carta = timers.autoPass = timers.rerender = null;
  }
  function isHumanTurn() { return state && !state.over && state.turn === humanIndex(); }

  // ------------------------------------------------------------- score
  function loadScore() {
    try {
      if (typeof localStorage === 'undefined') return;
      var raw = localStorage.getItem(SCORE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      wins.us = Number(s.us) || 0;
      wins.them = Number(s.them) || 0;
    } catch (e) { /* profil neuf */ }
  }

  function saveScore() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SCORE_KEY, JSON.stringify(wins));
    } catch (e) { /* mode privé */ }
  }

  function renderScore() {
    var us = $('scoreUs'), them = $('scoreThem');
    if (us) us.textContent = String(wins.us);
    if (them) them.textContent = String(wins.them);
    var homeUs = $('homeScoreUs'), homeThem = $('homeScoreThem');
    if (homeUs) homeUs.textContent = String(wins.us);
    if (homeThem) homeThem.textContent = String(wins.them);
  }

  // Une image vient d'arriver (ou a échoué) : on redessine une seule fois.
  function scheduleRerender() {
    if (timers.rerender) return;
    timers.rerender = setTimeout(function () {
      timers.rerender = null;
      render();
    }, 120);
  }

  function cardEl(card, extraClass) {
    var suit = Deck.suitById(card.suit);
    var c = make('div', 'card' + (extraClass ? ' ' + extraClass : ''));
    c.setAttribute('data-suit', card.suit);

    // Image réelle de la carte si elle existe dans assets/cards/
    if (Assets) {
      if (Assets.has(card)) {
        c.classList.add('has-img');
        var img = document.createElement('img');
        img.className = 'card-img';
        img.alt = Deck.cardLabel(card);
        img.src = Assets.src(card);
        c.appendChild(img);
        c.appendChild(make('span', 'corner corner-img', specialTag(card)));
        return c;
      }
      if (Assets.state(card) === 'unknown') Assets.probe(card, scheduleRerender);
    }

    // Sinon : la carte « dessinée » (rang + emoji)
    c.appendChild(make('span', 'corner', specialTag(card)));
    c.appendChild(make('span', 'rank', String(card.rank)));
    c.appendChild(make('span', 'suit', suit ? suit.emoji : '?'));
    return c;
  }

  function specialTag(card) {
    if (card.rank === 2) return 'هز2';
    if (card.rank === 7) return 'سيّار';
    if (card.rank === 10) return 'سكيب';
    if (card.rank === 1) return 'تبق';
    return '';
  }

  // ------------------------------------------------------- bulle de dialogue
  function showBubble(playerIndex, text, ms) {
    var host = $('bubble');
    if (!host || !text) return;
    var pos = seatByPlayer[playerIndex] || 'bl';
    if (pos === 'bottom') pos = 'bl';
    host.className = 'bubble bubble-' + pos;
    host.textContent = text;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { host.classList.add('hidden'); }, ms || 1700);
  }

  function bubbleFromEvents(events, playerIndex) {
    if (!events) return;
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === 'stack2') { showBubble(playerIndex, 'هز ' + e.total + '!'); return; }
      if (e.type === 'forceDraw') { showBubble(playerIndex, 'هز ' + e.count + '!'); return; }
      if (e.type === 'skip') { showBubble(playerIndex, 'سكيب!'); return; }
      if (e.type === 'suit') {
        var s = Deck.suitById(e.suit);
        showBubble(playerIndex, s ? s.ar : 'سيّار');
        return;
      }
    }
  }

  // ------------------------------------------------------------------- le jeu
  function newGame(count) {
    clearTimers();
    if (count) playerCount = count;
    var rules = Rules.load();
    rules.players = playerCount;
    var names = playerCount === 2
      ? ['SanduSlow', 'Kim']
      : ['SanduSlow', 'Drishti', 'Kim', 'Okan'];

    state = Engine.createGame({
      rules: rules,
      playerCount: playerCount,
      humanIndex: 0,
      names: names
    });

    pendingCarta = false;
    aiForgot = null;
    lastDiscardLength = 0;
    scoreCounted = false;
    closeOverlays();
    render();
    scheduleAI();
  }

  function scheduleAI() {
    clearTimeout(timers.ai);
    timers.ai = setTimeout(aiStep, 850);
  }

  function aiStep() {
    if (!state || state.over) return;
    var actor = state.turn;
    if (!state.players[actor].isAI) { render(); return; }

    // L'IA rejoue : l'occasion de l'attraper est passée.
    if (aiForgot !== null && actor === aiForgot) aiForgot = null;

    var before = state.players[actor].hand.length;
    var aiRes = AI.takeTurn(state);
    var after = state.players[actor].hand.length;

    if (aiRes && aiRes.events) bubbleFromEvents(aiRes.events, actor);
    else if (aiRes && aiRes.action === 'drawPass') showBubble(actor, 'سحب');

    if (state.rules.cartaRule && after === 1 && before > 1) {
      if (Math.random() < state.rules.aiForgetsCarta) {
        aiForgot = actor;
        state.log.push('🙈 ' + state.players[actor].name + ' نسا يقول «Carta!» — عاقبو!');
      } else {
        state.log.push('✋ ' + state.players[actor].name + ' قال «Carta!»');
        showBubble(actor, 'Carta!');
      }
    }

    render();
    if (state.over) return onGameOver();
    scheduleAI();
  }

  function doPlay(handIndex, chosenSuit) {
    var me = humanIndex();
    var res = Engine.playCard(state, handIndex, chosenSuit);
    if (!res.ok) { render(); return; }
    render();

    if (state.over) return onGameOver();

    bubbleFromEvents(res.events, me);

    if (state.players[me].hand.length === 1 && state.rules.cartaRule) startCartaWindow();
    scheduleAI();
  }

  function onCardClick(handIndex) {
    if (!isHumanTurn()) return;
    var me = humanIndex();
    var card = state.players[me].hand[handIndex];
    if (!card) return;
    if (!Engine.playable(state, card)) {
      state.log.push('⛔ ' + Deck.cardLabel(card) + ' ما كتلعبش دابا');
      return render();
    }
    if (card.rank === 7 && state.rules.sevenChangesSuit) {
      openSuitPicker(function (suit) { doPlay(handIndex, suit); });
    } else {
      doPlay(handIndex);
    }
  }

  function onDrawClick() {
    if (!isHumanTurn()) return;
    if (state.pendingDraw > 0) return resolveHumanPending();
    if (state.drewThisTurn) return;

    var me = humanIndex();
    var res = Engine.drawOne(state);
    if (!res.ok) return render();

    if (res.empty) {
      Engine.passTurn(state);
      render();
      return scheduleAI();
    }

    var drawnIndex = state.players[me].hand.length - 1;
    var card = state.players[me].hand[drawnIndex];
    render();

    if (!state.rules.playAfterDraw || !Engine.playable(state, card)) {
      // On laisse le temps de voir la carte, puis le tour passe tout seul.
      timers.autoPass = setTimeout(function () {
        if (!state || state.over || state.turn !== humanIndex()) return;
        state.log.push('⏭️ ما كاين ما نلعب — داز الدور');
        Engine.passTurn(state);
        render();
        scheduleAI();
      }, 1500);
    }
  }

  function resolveHumanPending() {
    var me = humanIndex();
    var res = Engine.resolvePendingDraw(state);
    if (!res.ok) return render();
    render();
    if (state.over) return onGameOver();
    scheduleAI();
  }

  function passHumanTurn() {
    if (!isHumanTurn()) return;
    clearTimeout(timers.autoPass);
    Engine.passTurn(state);
    render();
    scheduleAI();
  }

  // « Carta! » côté humain
  function startCartaWindow() {
    pendingCarta = true;
    render();
    clearTimeout(timers.carta);
    timers.carta = setTimeout(function () {
      if (!pendingCarta || !state || state.over) return;
      pendingCarta = false;
      var got = Engine.giveCards(state, humanIndex(), state.rules.cartaPenalty);
      state.log.push('😬 ما قلتش «Carta!» ف الوقت → هزيت ' + got.length + ' ورقات');
      showBubble(humanIndex(), '😬 Carta!');
      render();
    }, 4000);
  }

  function sayCarta() {
    if (!pendingCarta) return;
    pendingCarta = false;
    clearTimeout(timers.carta);
    state.log.push('✋ قلت «Carta!» 👌');
    showBubble(humanIndex(), 'Carta!');
    render();
  }

  function catchAI() {
    if (aiForgot === null || !state) return;
    var target = aiForgot;
    aiForgot = null;
    var got = Engine.giveCards(state, target, state.rules.cartaPenalty);
    state.log.push('👀 عاقبتي ' + state.players[target].name + '! ما قالش «Carta» → هز ' + got.length + ' ورقات');
    showBubble(target, '😬');
    render();
  }

  function onGameOver() {
    var me = humanIndex();
    var won = state.winner === me;

    if (!scoreCounted) {
      scoreCounted = true;
      if (won) wins.us += 1; else wins.them += 1;
      saveScore();
      renderScore();
    }

    $('winTitle').textContent = won ? '🏆 ربحتي!' : '😵 ربح ' + state.players[state.winner].name;
    $('winSub').textContent = won
      ? 'خرّجتي كل الورق. مزيان! (نتا ' + wins.us + ' – ' + wins.them + ' خصومك)'
      : 'بقاو ليك ' + state.players[me].hand.length + ' ورقات. عاود جرب. (نتا ' + wins.us + ' – ' + wins.them + ' خصومك)';
    showOverlay('winModal');
  }

  // ---------------------------------------------------------------- rendu
  function render() {
    if (!state) return;
    renderScore();
    renderOpponents();
    renderMySeat();
    renderBoard();
    renderActions();   // avant la main : elle a besoin de la largeur des boutons
    renderHand();
    renderLog();
  }

  function renderOpponents() {
    var host = $('opponents');
    host.innerHTML = '';
    var me = humanIndex();

    var others = [];
    for (var i = 0; i < state.players.length; i++) if (i !== me) others.push(i);
    seatByPlayer = {};
    seatByPlayer[me] = 'bl';

    // Place les adversaires aux coins du tapis (br = Drishti, tr = Kim, tl = Okan)
    var seats = others.length === 1 ? ['top']
      : others.length === 2 ? ['tr', 'tl']
        : ['br', 'tr', 'tl'];

    function seat(pos, player, idx, showCards) {
      var box = make('div', 'seat seat-' + pos + (state.turn === idx && !state.over ? ' is-turn' : ''));
      var avName = (player.name || '').toLowerCase();
      var avCls = 'avatar';
      if (avName === 'kim' || avName === 'okan' || avName === 'drishti' || avName === 'sanduslow') {
        avCls += ' avatar-' + avName;
      } else {
        avCls += ' avatar-' + (idx % 4);
      }
      box.appendChild(make('div', avCls));
      // nom + nombre de cartes sur une seule ligne
      var label = player.name + (showCards ? ' · ' + player.hand.length : '');
      box.appendChild(make('div', 'seat-name', label));

      if (showCards) {
        var row = make('div', 'seat-cards');
        var maxShown = pos === 'top' ? 7 : 5;
        var shown = Math.min(player.hand.length, maxShown);
        for (var c = 0; c < shown; c++) row.appendChild(make('div', 'mini-card'));
        if (player.hand.length > shown) {
          row.appendChild(make('div', 'seat-count', '+' + (player.hand.length - shown)));
        }
        box.appendChild(row);
      }
      host.appendChild(box);
    }

    others.forEach(function (idx, k) {
      var pos = seats[k] || 'top';
      seatByPlayer[idx] = pos;
      seat(pos, state.players[idx], idx, true);
    });
  }

  function renderMySeat() {
    var mySeat = $('mySeat');
    if (!mySeat || !state) return;
    var me = humanIndex();
    var p = state.players[me];
    if (!p) return;

    var isTurn = state.turn === me && !state.over;
    mySeat.className = 'seat seat-bl' + (isTurn ? ' is-turn' : '');

    var myAv = $('myAvatar');
    if (myAv) {
      var avName = (p.name || '').toLowerCase();
      if (avName === 'sanduslow') {
        myAv.className = 'avatar avatar-sanduslow';
      } else {
        myAv.className = 'avatar avatar-' + (me % 4);
      }
      myAv.textContent = '';
    }

    var myName = $('myName');
    if (myName) {
      myName.innerHTML = p.name + ' · <span id="handCount">' + p.hand.length + '</span>';
    }
  }

  function renderBoard() {
    var top = Engine.topCard(state);
    var host = $('discardTop');
    host.innerHTML = '';

    // Le talon du milieu : les dernières cartes jetées, chacune avec sa rotation.
    var justLanded = state.discard.length !== lastDiscardLength;
    lastDiscardLength = state.discard.length;
    var pile = state.discard.slice(-PILE_VISIBLE);

    pile.forEach(function (card, i) {
      var depth = pile.length - 1 - i;              // 0 = la plus récente
      var seed = state.discard.length - depth;      // stable d'un rendu à l'autre
      // La carte arrive sur le talon avec l'angle qu'elle avait dans ta main.
      var rot = (typeof card.fanAngle === 'number')
        ? card.fanAngle
        : ((seed * 37) % 19) - 9;                   // sinon : angle stable, -9° .. +9°
      var dx = ((seed * 53) % 11) - 5;
      var dy = ((seed * 29) % 9) - 4;
      var el = cardEl(card);
      el.style.zIndex = String(i + 1);
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)';
      if (depth === 3) el.style.opacity = '.82';
      if (depth === 4) el.style.opacity = '.6';
      if (depth === 0 && justLanded) el.classList.add('is-new');
      host.appendChild(el);
    });

    $('drawCount').textContent = String(state.drawPile.length);
    var pileEl = $('drawPile');
    if (pileEl) {
      var mustDraw = isHumanTurn() && (state.pendingDraw > 0 || (!state.drewThisTurn && Engine.playableIndices(state, humanIndex()).length === 0));
      if (mustDraw) pileEl.classList.add('anim-tilt');
      else pileEl.classList.remove('anim-tilt');
    }

    var suit = Deck.suitById(state.currentSuit);
    var chip = $('suitChip');
    chip.innerHTML = '';
    if (!suit) {
      chip.textContent = '—';
    } else {
      // un point de couleur plutôt qu'un emoji : ça s'affiche partout
      var dot = make('span', 'suit-dot');
      dot.style.background = suit.color;
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(
        suit.ar + (top && state.currentSuit !== top.suit ? ' (مبدّل)' : '')
      ));
    }

    var pend = $('pendingChip');
    if (state.pendingDraw > 0) {
      pend.classList.remove('hidden');
      pend.textContent = 'هز ' + state.pendingDraw;
    } else {
      pend.classList.add('hidden');
    }

    $('turnLabel').textContent = state.over
      ? '🏁 سالات'
      : (state.turn === humanIndex() ? '🎯 دورك' : '⏳ ' + state.players[state.turn].name);
  }

  function renderHand() {
    var me = humanIndex();
    var hand = state.players[me].hand;
    var host = $('hand');
    host.innerHTML = '';
    $('handCount').textContent = String(hand.length);

    var canPlayNow = isHumanTurn();
    var n = hand.length;

    // ton avatar
    var myAv = $('myAvatar');
    if (myAv) myAv.textContent = '';

    // Largeur visuelle de chaque carte : on serre juste ce qu'il faut pour que
    // l'éventail tienne à l'écran (pas de scroll horizontal).
    // Tes cartes sont plus grandes que celles de la table (--hand-w).
    var cardW = HAND_FAN.cardW;
    try {
      var cs = getComputedStyle(document.documentElement);
      var hw = parseFloat(cs.getPropertyValue('--hand-w'));
      var cw = parseFloat(cs.getPropertyValue('--card-w'));
      if (hw > 0) cardW = hw;
      else if (cw > 0) cardW = cw;
    } catch (e) { /* on garde la valeur par défaut */ }
    var lift = Math.round(cardW * HAND_FAN.liftRatio);   // petit soulèvement, juste pour se voir
    // Les boutons flottent à gauche : on leur réserve la place des deux côtés
    // pour que l'éventail reste centré sur la table.
    var actEl = $('actions');
    var actW = (actEl && actEl.offsetWidth) ? actEl.offsetWidth : 0;
    var avail = (host.clientWidth || (window.innerWidth ? window.innerWidth - 34 : 330)) - 22 - (actW * 2);
    avail = Math.max(120, avail);

    // ------------------------------------------- éventail circulaire exact
    // Toutes les cartes sont empilées au MÊME endroit, puis tournées autour du
    // centre du cercle (situé SOUS la main, via transform-origin). Elles se
    // placent alors d'elles-mêmes sur l'arc : les sommets s'écartent et les bas
    // convergent, exactement comme une main qui tient les cartes.
    var R = Math.max(cardW * HAND_FAN.radius, 40);
    var stepWanted = n > 1 ? (avail - cardW) / (n - 1) : cardW;
    stepWanted = Math.max(HAND_FAN.minStep, Math.min(cardW * HAND_FAN.overlap, stepWanted));
    var dTheta = stepWanted / R;              // pas angulaire (radians)
    var center = (n - 1) / 2;

    // AUCUN tri : chaque carte garde sa place. Les jouables sont juste soulevées.
    hand.forEach(function (card, i) {
      var ok = canPlayNow && Engine.playable(state, card);
      // signe inversé car la main est en RTL : la 1re carte (à droite) part à droite
      var theta = (center - i) * dTheta;
      var angle = theta * 180 / Math.PI;

      // on garde l'angle du moment : la carte partira avec lui vers le talon
      card.fanAngle = angle;

      var cls = ok ? 'is-playable' : (canPlayNow ? 'is-disabled' : '');
      var el = cardEl(card, cls);
      el.style.zIndex = String(i + 1);
      el.style.marginInlineStart = (i === 0 ? 0 : -cardW) + 'px';   // empilées
      el.style.setProperty('--fan-r', R.toFixed(1) + 'px');
      el.style.setProperty('--fan-rot', angle.toFixed(2) + 'deg');
      el.style.setProperty('--fan-y', (ok ? -lift : 0) + 'px');
      el.setAttribute('role', 'button');
      el.addEventListener('click', function () { onCardClick(i); });
      host.appendChild(el);
    });
  }

  function renderActions() {
    var host = $('actions');
    host.innerHTML = '';

    if (state.over) {
      var b = make('button', 'btn btn-primary', '🔄 لعبة جديدة');
      b.type = 'button';
      b.addEventListener('click', function () { newGame(playerCount); });
      return host.appendChild(b);
    }

    if (pendingCarta) {
      var bc = make('button', 'btn btn-danger pulse', '✋ Carta!');
      bc.type = 'button';
      bc.addEventListener('click', sayCarta);
      host.appendChild(bc);
    }

    if (aiForgot !== null) {
      var ba = make('button', 'btn btn-primary', '👀 عاقبو! ما قالش Carta');
      ba.type = 'button';
      ba.addEventListener('click', catchAI);
      host.appendChild(ba);
    }

    if (state.pendingDraw > 0) {
      var bp = make('button', 'btn btn-danger' + (isHumanTurn() ? ' anim-tilt' : ''), '😵 هز ' + state.pendingDraw);
      bp.type = 'button';
      bp.disabled = !isHumanTurn();
      bp.addEventListener('click', resolveHumanPending);
      host.appendChild(bp);
    } else {
      // Le joueur peut TOUJOURS piocher à son tour au lieu de jouer.
      var canDraw = isHumanTurn() && !state.drewThisTurn;
      // Animation katmil (tangage) seulement quand le tirage est obligatoire (aucune carte jouable).
      var mustDraw = canDraw && Engine.playableIndices(state, humanIndex()).length === 0;

      var cls = 'btn btn-primary' + (mustDraw ? ' anim-tilt' : '');
      var hint = make('button', cls, '👋 سحب ورقة');
      hint.type = 'button';
      hint.disabled = !canDraw;
      hint.title = canDraw ? (mustDraw ? 'خاصك تسحب ورقة' : 'تقدر تسحب ورقة بلاصت ما تلعب') : (isHumanTurn() ? 'سحبتي فهاد الدور' : 'ماشي دورك');
      hint.addEventListener('click', onDrawClick);
      host.appendChild(hint);
    }

    if (isHumanTurn() && state.drewThisTurn) {
      var bd = make('button', 'btn btn-ghost', '⏭️ دوز الدور');
      bd.type = 'button';
      bd.addEventListener('click', passHumanTurn);
      host.appendChild(bd);
    }

    if (!isHumanTurn()) {
      host.appendChild(make('span', 'wait-label', '⏳ دور ' + state.players[state.turn].name));
    }
  }

  function renderLog() {
    var host = $('log');
    host.innerHTML = '';
    var last = state.log.slice(-40).reverse();
    last.slice(0, 14).forEach(function (line) {
      host.appendChild(make('li', null, line));
    });
  }

  // ---------------------------------------------------------------- overlays
  function showOverlay(id) { $(id).classList.remove('hidden'); }
  function hideOverlay(id) { $(id).classList.add('hidden'); }
  function closeOverlays() {
    ['suitPicker', 'rulesModal', 'winModal', 'logModal'].forEach(hideOverlay);
  }

  // ------------------------------------------------------------- page d'accueil
  function updateHomeUi() {
    var b2 = $('btnMode2'), b4 = $('btnMode4');
    if (b2) b2.classList.toggle('is-active', playerCount === 2);
    if (b4) b4.classList.toggle('is-active', playerCount === 4);
    var playBtn = $('btnPlayNow');
    if (playBtn) {
      var titleEl = playBtn.querySelector('.btn-play-title');
      var isOngoing = state && !state.over && state.players.length === playerCount;
      if (titleEl) {
        titleEl.textContent = isOngoing ? 'كمّل اللعب' : 'ابدا اللعب';
      }
    }
    renderScore();
  }

  function showHomeScreen() {
    var home = $('homeScreen');
    if (!home) return;
    home.classList.remove('hidden');
    updateHomeUi();
  }

  function hideHomeScreen() {
    var home = $('homeScreen');
    if (!home) return;
    home.classList.add('hidden');
  }

  function openSuitPicker(cb) {
    suitPickerCb = cb;
    var grid = $('suitGrid');
    grid.innerHTML = '';
    Deck.SUITS.forEach(function (s) {
      var b = make('button', 'suit-btn');
      b.type = 'button';
      var dot = make('span', 'dot');
      dot.style.background = s.color;
      b.appendChild(dot);
      b.appendChild(make('span', null, s.ar));
      b.addEventListener('click', function () {
        hideOverlay('suitPicker');
        var fn = suitPickerCb; suitPickerCb = null;
        if (fn) fn(s.id);
      });
      grid.appendChild(b);
    });
    showOverlay('suitPicker');
  }

  // ---------------------------------------------------------------- règles
  function buildPresetButtons() {
    var host = $('presetRow');
    if (host.childElementCount) return;
    Object.keys(Rules.PRESETS).forEach(function (key) {
      var b = make('button', 'btn btn-preset', Rules.PRESETS[key].label);
      b.type = 'button';
      b.setAttribute('data-preset', key);
      b.addEventListener('click', function () {
        applyRulesToForm(Rules.PRESETS[key].build());
        markActivePreset(key);
      });
      host.appendChild(b);
    });
  }

  function markActivePreset(key) {
    var btns = $('presetRow').querySelectorAll('[data-preset]');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-preset') === key);
    });
  }

  function markActivePlayers(n) {
    var btns = $('playerRow').querySelectorAll('[data-players]');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-players')) === n);
    });
  }

  function applyRulesToForm(r) {
    $('r_stackTwos').checked = !!r.stackTwos;
    $('r_sevenChangesSuit').checked = !!r.sevenChangesSuit;
    $('r_tenSkips').checked = !!r.tenSkips;
    $('r_playAfterDraw').checked = !!r.playAfterDraw;
    $('r_cartaRule').checked = !!r.cartaRule;
    Deck.SUITS.forEach(function (s) {
      var one = r.ones[s.id] || { draw: 0, skip: false };
      var sel = $('one_' + s.id + '_draw');
      if (sel) sel.value = String(one.draw);
      var chk = $('one_' + s.id + '_skip');
      if (chk) chk.checked = !!one.skip;
    });
  }

  function readRulesFromForm() {
    var r = Rules.defaults();
    r.stackTwos = $('r_stackTwos').checked;
    r.sevenChangesSuit = $('r_sevenChangesSuit').checked;
    r.tenSkips = $('r_tenSkips').checked;
    r.playAfterDraw = $('r_playAfterDraw').checked;
    r.cartaRule = $('r_cartaRule').checked;
    Deck.SUITS.forEach(function (s) {
      if (!r.ones[s.id]) r.ones[s.id] = { draw: 0, skip: false };
      r.ones[s.id].draw = Number($('one_' + s.id + '_draw').value || 0);
      r.ones[s.id].skip = $('one_' + s.id + '_skip').checked;
    });
    r.players = playerCount;
    return r;
  }

  function openRules() {
    buildPresetButtons();
    applyRulesToForm(state ? state.rules : Rules.load());
    markActivePlayers(playerCount);
    markActivePreset('B');
    showOverlay('rulesModal');
  }

  // ---------------------------------------------------------------- démarrage
  function boot() {
    loadScore();
    $('btnNew').addEventListener('click', function () { newGame(playerCount); });
    $('btnLog').addEventListener('click', function () { renderLog(); showOverlay('logModal'); });
    $('btnCloseLog').addEventListener('click', function () { hideOverlay('logModal'); });
    $('btnRules').addEventListener('click', openRules);
    $('btnCloseRules').addEventListener('click', function () { hideOverlay('rulesModal'); });
    if ($('btnDefaults')) {
      $('btnDefaults').addEventListener('click', function () {
        applyRulesToForm(Rules.defaults());
        markActivePreset('B');
        markActivePlayers(Rules.defaults().players);
      });
    }
    $('btnWinNew').addEventListener('click', function () { newGame(playerCount); });
    $('btnSaveRules').addEventListener('click', function () {
      var r = readRulesFromForm();
      Rules.save(r);
      hideOverlay('rulesModal');
      newGame(r.players);
    });

    // Boutons de la page d'accueil
    if ($('btnHome')) {
      $('btnHome').addEventListener('click', showHomeScreen);
    }
    if ($('btnPlayNow')) {
      $('btnPlayNow').addEventListener('click', function () {
        hideHomeScreen();
        if (!state || state.over || state.players.length !== playerCount) {
          newGame(playerCount);
        }
      });
    }
    if ($('btnMode2')) {
      $('btnMode2').addEventListener('click', function () {
        playerCount = 2;
        markActivePlayers(2);
        updateHomeUi();
      });
    }
    if ($('btnMode4')) {
      $('btnMode4').addEventListener('click', function () {
        playerCount = 4;
        markActivePlayers(4);
        updateHomeUi();
      });
    }
    if ($('btnHomeRules')) {
      $('btnHomeRules').addEventListener('click', openRules);
    }
    if ($('btnHomeLog')) {
      $('btnHomeLog').addEventListener('click', function () {
        renderLog();
        showOverlay('logModal');
      });
    }

    var pile = $('drawPile');
    pile.addEventListener('click', onDrawClick);
    pile.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDrawClick(); }
    });

    Array.prototype.forEach.call($('playerRow').querySelectorAll('[data-players]'), function (b) {
      b.addEventListener('click', function () {
        playerCount = Number(b.getAttribute('data-players')) === 4 ? 4 : 2;
        markActivePlayers(playerCount);
        updateHomeUi();
      });
    });

    var initR = Rules.load();
    playerCount = initR.players || 2;
    newGame(playerCount);
    showHomeScreen();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
