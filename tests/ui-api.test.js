/* Vérifie que l'UI ne référence que des choses qui existent vraiment :
 *   - méthodes du moteur / IA / paquet / règles réellement exportées
 *   - identifiants HTML présents dans index.html
 * Ça attrape les fautes de frappe sans lancer de navigateur.
 *   node tests/ui-api.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

var ui = fs.readFileSync(path.join(root, 'js', 'ui.js'), 'utf8');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

var Deck = require(path.join(root, 'js', 'deck.js'));
var Rules = require(path.join(root, 'js', 'rules.js'));
var Engine = require(path.join(root, 'js', 'engine.js'));
var AI = require(path.join(root, 'js', 'ai.js'));
var Assets = require(path.join(root, 'js', 'assets.js'));

var pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  \u2713 ' + label); }
  else { fail++; console.log('  \u2717 ' + label); }
}

console.log('\nAPI utilisée par js/ui.js');
var mods = { Engine: Engine, AI: AI, Deck: Deck, Rules: Rules, Assets: Assets };
Object.keys(mods).forEach(function (name) {
  var re = new RegExp(name + '\\.([A-Za-z_$][\\w$]*)', 'g');
  var seen = {}, missing = [], m;
  while ((m = re.exec(ui))) {
    var key = m[1];
    if (seen[key]) continue;
    seen[key] = true;
    if (!(key in mods[name])) missing.push(key);
  }
  ok(missing.length === 0, name + ' : ' + Object.keys(seen).length + ' références, ' +
    (missing.length ? 'MANQUANT -> ' + missing.join(', ') : 'toutes existent'));
});

console.log('\nIdentifiants HTML utilisés par js/ui.js');
var ids = {}, m2;
var reId = /\$\(\s*'([A-Za-z0-9_\-]+)'\s*\)/g;
while ((m2 = reId.exec(ui))) ids[m2[1]] = true;
var reGet = /getElementById\(\s*'([A-Za-z0-9_\-]+)'\s*\)/g;
while ((m2 = reGet.exec(ui))) ids[m2[1]] = true;

var missingIds = Object.keys(ids).filter(function (id) {
  return html.indexOf('id="' + id + '"') === -1;
});
ok(missingIds.length === 0, Object.keys(ids).length + ' identifiants statiques' +
  (missingIds.length ? ' — MANQUANTS : ' + missingIds.join(', ') : ' — tous présents dans index.html'));

// Identifiants construits dynamiquement (un_<suit>_draw / _skip)
var dynMissing = [];
Deck.SUITS.forEach(function (s) {
  ['one_' + s.id + '_draw', 'one_' + s.id + '_skip'].forEach(function (id) {
    if (html.indexOf('id="' + id + '"') === -1) dynMissing.push(id);
  });
});
ok(dynMissing.length === 0, 'les 8 champs de règles des 1 existent' +
  (dynMissing.length ? ' — MANQUANTS : ' + dynMissing.join(', ') : ''));

// Les scripts sont bien chargés dans le bon ordre
var order = ['js/deck.js', 'js/rules.js', 'js/engine.js', 'js/ai.js', 'js/assets.js', 'js/ui.js'];
var positions = order.map(function (f) { return html.indexOf(f); });
ok(positions.every(function (p) { return p !== -1; }), 'les ' + order.length + ' scripts sont inclus dans index.html');
ok(positions.every(function (p, i) { return i === 0 || p > positions[i - 1]; }), 'les scripts sont chargés dans l\'ordre des dépendances');
ok(html.indexOf('js/rules.js') < html.indexOf('js/engine.js'), 'rules.js est chargé avant engine.js');
ok(html.indexOf('js/assets.js') < html.indexOf('js/ui.js'), 'assets.js est chargé avant ui.js');
ok(html.indexOf('css/style.css') !== -1, 'la feuille de style est liée dans index.html');

console.log('\nConvention des images (assets/cards/)');
ok(Assets.urlSvg({ suit: 'dhab', rank: 1 }) === 'assets/cards/dhab-1.svg', 'dhab-1.svg');
ok(Assets.urlPng({ suit: 'dhab', rank: 1 }) === 'assets/cards/dhab-1.png', 'repli .png');
ok(Assets.urlJpg({ suit: 'kass', rank: 10 }) === 'assets/cards/kass-10.jpg', 'repli .jpg');
ok(Assets.EXTENSIONS[0] === 'svg', 'le SVG est essayé en premier (vectoriel)');
var keys = Deck.makeDeck().map(Assets.key);
ok(Object.keys(keys.reduce(function (a, k) { a[k] = 1; return a; }, {})).length === 40,
  '40 clés uniques pour les 40 cartes (pas de collision)');

Assets.reset();
ok(!Assets.has({ suit: 'dhab', rank: 1 }) && Assets.state({ suit: 'dhab', rank: 1 }) === 'unknown',
  'avant chargement, aucune image n\'est annoncée disponible');
var probeResult = null;
Assets.probe({ suit: 'dhab', rank: 1 }, function (v) { probeResult = v; });
ok(probeResult === 'fail', 'hors navigateur, probe échoue proprement (aucune exception)');
ok(Assets.state({ suit: 'dhab', rank: 1 }) === 'fail', 'l\'échec est mémorisé (pas de requête répétée)');
var again = null;
Assets.probe({ suit: 'dhab', rank: 1 }, function (v) { again = v; });
ok(again === 'fail', 'un second probe répond depuis le cache');
Assets.reset();

console.log('\nClasses CSS utilisées par js/ui.js');
var css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
var used = {}, m3;
var reAdd = /classList\.add\(\s*'([\w-]+)'/g;
while ((m3 = reAdd.exec(ui))) used[m3[1]] = true;
var reMake = /make\(\s*'[a-z]+'\s*,\s*'([^']+)'/g;
while ((m3 = reMake.exec(ui))) {
  m3[1].split(/\s+/).forEach(function (t) {
    // on ignore les fragments dynamiques du genre 'seat seat-' + pos
    if (t && /^[\w-]+$/.test(t) && !/-$/.test(t)) used[t] = true;
  });
}
var noCss = Object.keys(used).filter(function (c) { return css.indexOf('.' + c) === -1; });
ok(noCss.length === 0, Object.keys(used).length + ' classes référencées' +
  (noCss.length ? ' — SANS RÈGLE CSS : ' + noCss.join(', ') : ' — toutes définies dans style.css'));

// Les règles clés du nouveau rendu du plateau doivent exister.
['.center::before', '.discard .card', '@keyframes land', 'transform-origin: 50% calc(100% + var(--fan-r',
  '.hand .card.is-playable', '.hand .card.is-disabled', '.card.has-img', '--fan-rot', '--fan-y',
  '.felt::before', '.seat-top', '.seat-left', '.seat-right', '.avatar', '.avatar-mini',
  '.draw-pile::before', '.play-area', '.hidden', '.suit-dot', '.btn-icon', '.wait-label',
  '--bottom-ui', '--opp-w', '--opp-h', '--top-ui', '--card-back-img',
  '--hand-w', '--hand-h', '--hand-scale',
  '.seat-cards .mini-card + .mini-card'
].forEach(function (rule) {
  ok(css.indexOf(rule) !== -1, 'règle CSS présente : ' + rule);
});

// Tes cartes doivent être plus grandes que celles de la table.
var handScale = /--hand-scale:\s*([\d.]+)/.exec(css);
ok(!!handScale && Number(handScale[1]) > 1.4,
  'tes cartes font ' + (handScale ? Math.round(Number(handScale[1]) * 100) + '%' : '?') +
  ' de la taille de base');
ok(/\.hand \.card \{[\s\S]{0,80}width: var\(--hand-w\)/.test(css),
  'la main utilise bien --hand-w / --hand-h');
ok(/\.hand-section \{[\s\S]{0,160}z-index: 6/.test(css),
  'la main passe AU-DESSUS du tapis, du talon et des sièges');
ok(/\.actions \{[\s\S]{0,80}z-index: 20/.test(css),
  'les boutons restent au-dessus des cartes (donc cliquables)');
ok(/z-index: (?:7|25)/.test(css) && /#bubble/.test(css), 'la bulle reste au-dessus des cartes');

// Les cartes des adversaires doivent être proches de la taille des tiennes.
var oppScale = /--opp-w:\s*calc\(var\(--card-w\)\s*\*\s*([\d.]+)\)/.exec(css);
ok(!!oppScale && Number(oppScale[1]) >= 0.7 && Number(oppScale[1]) <= 0.95,
  'les cartes adverses font ' + (oppScale ? Math.round(Number(oppScale[1]) * 100) + '%' : '?') +
  ' de la taille des tiennes');

// Adaptatif : la taille des cartes doit dépendre de la largeur ET de la hauteur.
console.log('\nMise en page adaptative');
ok(/@media \(min-width: 620px\) and \(min-height: 720px\)/.test(css), 'grande carte seulement si large ET haut (620/720)');
ok(/@media \(min-width: 900px\) and \(min-height: 860px\)/.test(css), 'très grande carte seulement si large ET haut (900/860)');
ok(/@media \(max-height: 660px\)/.test(css), 'réduction sur écran bas (≤660px de haut)');
ok(/@media \(max-height: 560px\)/.test(css), 'réduction supplémentaire sur écran très bas (≤560px)');
ok(/@media \(max-width: 372px\)/.test(css), 'réduction sur écran étroit (≤372px)');
// Les sièges ne doivent pas être décalés vers le bas (sinon ils recouvrent le plateau).
ok(/\.seats \{ position: absolute; inset: 0;/.test(css), 'la couche des sièges couvre toute la zone de jeu');
ok(/\.seat-top \{ top: 3px/.test(css), 'le siège du haut est collé en haut (zone réservée)');
ok(css.indexOf('inset: var(--top-ui) 0 var(--bottom-ui) 0') === -1,
  'les sièges ne sont plus poussés dans la zone du plateau');

// Les boutons d'action doivent rester collés à la main (pas au milieu de la table).
var handBlock = /<section class="hand-section">([\s\S]*?)<\/section>/.exec(html);
var inHand = !!handBlock &&
  handBlock[1].indexOf('id="actions"') !== -1 && handBlock[1].indexOf('id="hand"') !== -1;
ok(inHand, '#actions et #hand sont bien tous les deux dans .hand-section');
ok(/\.hand-row \{ position: relative/.test(css), '.hand-row sert de repère aux boutons');
ok(/\.actions \{[\s\S]{0,140}position: absolute; left: 0; bottom: 2px/.test(css),
  'les boutons flottent en bas à gauche -> l\'éventail reste centré');

// Aucun id en double : un doublon faisait pointer getElementById sur le mauvais bloc.
var allIds = [], mid, reAnyId = /id="([\w-]+)"/g;
while ((mid = reAnyId.exec(html))) allIds.push(mid[1]);
var dupIds = allIds.filter(function (id, i) { return allIds.indexOf(id) !== i; });
ok(dupIds.length === 0, allIds.length + ' id uniques dans index.html' +
  (dupIds.length ? ' — DOUBLONS : ' + dupIds.join(', ') : ''));

// Les emojis trop récents s'affichent en carré sur certains Windows :
// on n'autorise que ceux qui existent depuis longtemps.
console.log('\nEmojis utilisés (compatibilité)');
var RECENT = ['🪙', '🪵', '🫖', '🫳', '🫴', '🫰', '🪄', '🪅', '🩷', '🫨', '🪿', '🫠', '🫡', '🤫'];
var srcAll = ui + fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8') +
  fs.readFileSync(path.join(root, 'js', 'deck.js'), 'utf8') + html;
var foundRecent = RECENT.filter(function (e) { return srcAll.indexOf(e) !== -1; });
ok(foundRecent.length === 0, 'aucun emoji récent (Emoji 13+) dans le code' +
  (foundRecent.length ? ' — À REMPLACER : ' + foundRecent.join(' ') : ''));
ok(srcAll.indexOf('🪙') === -1 && srcAll.indexOf('🪵') === -1,
  'les symboles de couleur sont des pastilles CSS, pas des emojis');

console.log('\nFichiers réellement présents dans assets/cards/');
var cardsDir = path.join(root, 'assets', 'cards');
var cardFiles = fs.existsSync(cardsDir)
  ? fs.readdirSync(cardsDir).filter(function (f) {
    // back.png est le dos de carte, pas une carte du paquet
    return /\.(svg|png|jpg|jpeg)$/i.test(f) && f.toLowerCase() !== 'back.png';
  })
  : [];
var expected = /^(dhab|kass|syouf|zrawet)-(1|2|3|4|5|6|7|10|11|12)\.(svg|png|jpg|jpeg)$/i;
var badNames = cardFiles.filter(function (f) { return !expected.test(f); });
ok(badNames.length === 0, cardFiles.length + ' fichiers, tous au bon format' +
  (badNames.length ? ' — INCONNUS : ' + badNames.join(', ') : ''));

var present = {};
cardFiles.forEach(function (f) { present[f.replace(/\.(svg|png|jpg|jpeg)$/i, '')] = true; });
var missingCards = [];
Deck.SUITS.forEach(function (s) {
  Deck.RANKS.forEach(function (r) {
    if (!present[s.id + '-' + r]) missingCards.push(s.id + '-' + r);
  });
});
ok(cardFiles.length > 0, 'couverture : ' + cardFiles.length + '/40 cartes' +
  (missingCards.length ? ' — manquantes : ' + missingCards.join(', ') : ' — paquet complet \u2705'));

var extSet = {};
cardFiles.forEach(function (f) { extSet[path.extname(f).toLowerCase()] = true; });
ok(Object.keys(extSet).length <= 1 || cardFiles.length > 0,
  'extensions utilisées : ' + Object.keys(extSet).join(', '));

console.log('\nDos de carte (assets/cards/back.png)');
var backPath = path.join(cardsDir, 'back.png');
ok(fs.existsSync(backPath), 'le fichier assets/cards/back.png existe');
if (fs.existsSync(backPath)) {
  var backBuf = fs.readFileSync(backPath);
  var bw = backBuf.readUInt32BE(16), bh = backBuf.readUInt32BE(20);
  ok(Math.abs((bw / bh) - 0.625) < 0.02,
    'même ratio que les cartes (' + bw + 'x' + bh + ' = ' + (bw / bh).toFixed(3) + ')');
  ok(backBuf.length < 800 * 1024, 'poids raisonnable (' + (backBuf.length / 1024).toFixed(0) + ' KB)');
}
ok(css.indexOf('--card-back-img') !== -1, 'le CSS définit --card-back-img');
ok(css.indexOf('../assets/cards/back.png') !== -1, 'chemin correct depuis css/style.css');
var backsUsingImg = (css.match(/var\(--card-back-img\)/g) || []).length;
ok(backsUsingImg >= 3, 'l\'image sert pour la pioche, ses cartes du dessous et les mains adverses (' + backsUsingImg + ' endroits)');
ok(css.indexOf('repeating-linear-gradient(45deg, #5b3f96') === -1, 'plus aucun dos violet dessiné en CSS');

console.log('\nHabillage de la table (façon jeu de référence)');
ok(css.indexOf('border-image: url("../assets/table/frame.svg")') !== -1, 'cadre orné en border-image (9 tranches)');
ok(fs.existsSync(path.join(root, 'assets', 'table', 'frame.svg')), 'assets/table/frame.svg existe');
ok(fs.existsSync(path.join(root, 'assets', 'table', 'teapot.svg')), 'assets/table/teapot.svg existe');
ok(/felt-decor[\s\S]{0,120}width: 104px/.test(css), 'la théière est posée sur le tapis');
ok(/assets\/table\/teapot\.svg/.test(html), 'index.html charge la théière en SVG');
ok(css.indexOf('.felt::after') !== -1, 'le cadre est peint dans .felt::after');
ok(css.indexOf('.seat-name') !== -1 && css.indexOf('linear-gradient(180deg, #96602c') !== -1,
  'les noms des joueurs sont sur des plaques dorées');
ok(css.indexOf('.score-cols') !== -1 && css.indexOf('.score-nums') !== -1, 'panneau de score à deux lignes');
ok(css.indexOf('#bubble') !== -1 && css.indexOf('bubble-top') !== -1, 'bulle de dialogue (4 positions)');
ok(html.indexOf('id="bubble"') !== -1, 'index.html contient la bulle');
ok(/#bubble[\s\S]{0,200}bubble-left/.test(css) && /#bubble[\s\S]{0,400}bubble-right/.test(css),
  'la bulle peut se placer à gauche et à droite');
ok(/showBubble\(/.test(ui) && /bubbleFromEvents\(/.test(ui), 'ui.js affiche la bulle sur les actions');

ok(html.indexOf('id="btnDefaults"') !== -1 && /btnDefaults/.test(ui),
  'bouton « الأصلي » pour revenir aux réglages par défaut');

console.log('\nÉventail circulaire de la main');
ok(/R = Math\.max\(cardW \* HAND_FAN\.radius/.test(ui), 'le rayon du cercle se règle par HAND_FAN.radius');
ok(/dTheta = stepWanted \/ R/.test(ui), 'pas angulaire = espacement / rayon');
ok(/radius: 3/.test(ui), 'rayon serré -> rotation marquée');
ok(/liftRatio: 0\.14/.test(ui), 'les cartes jouables ne montent que légèrement (14 %)');
ok(/theta = \(center - i\) \* dTheta/.test(ui), 'angle de chaque carte (signe adapté au RTL)');
ok(/--fan-r/.test(ui) && /--fan-rot/.test(ui), 'le JS transmet le rayon et la rotation');
ok(/transform-origin: 50% calc\(100% \+ var\(--fan-r/.test(css),
  'le pivot du cercle est SOUS la main -> les bas convergent');
ok(/marginInlineStart = \(i === 0 \? 0 : -cardW\)/.test(ui), 'les cartes sont empilées au même endroit avant rotation');
ok(/card\.fanAngle = angle/.test(ui), 'l\'angle du moment est mémorisé pour le talon');
ok(ui.indexOf('Math.random() * 2 - 1') === -1, 'plus aucun angle aléatoire');
ok(/typeof card\.fanAngle === 'number'\)\s*\n?\s*\?\s*card\.fanAngle/.test(ui),
  'une carte jouée part vers le talon avec le même angle');

console.log('\n' + (fail === 0 ? '\u2705' : '\u274c') + ' ' + pass + ' vérifications OK, ' + fail + ' échec(s)');
process.exit(fail === 0 ? 0 : 1);
