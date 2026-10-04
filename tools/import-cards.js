/* Hez 2 — import des cartes vers assets/cards/
 *
 * Prend un dossier de fichiers nommés librement et les copie avec les bons noms :
 *     "10 jben-vector-SK9eaWrX.svg"  ->  assets/cards/kass-10.svg
 *     "7 dheb-vector-zqUU2y6c.svg"   ->  assets/cards/dhab-7.svg
 *
 * Usage :
 *     node tools/import-cards.js              # source : ./cart
 *     node tools/import-cards.js --dry        # montre sans copier
 *     node tools/import-cards.js --src=chemin --dest=assets/cards
 *
 * Aucune dépendance. Accepte .svg, .png, .jpg, .jpeg.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

// Nom de fichier -> id utilisé dans le code.
var SUIT_MAP = {
  dheb: 'dhab',
  dhab: 'dhab',
  flous: 'dhab',
  jben: 'kass',
  jban: 'kass',
  kass: 'kass',
  kisan: 'kass',
  syouf: 'syouf',
  zrawet: 'zrawet',
  zrabet: 'zrawet'
};

var EXT_OK = { '.svg': true, '.png': true, '.jpg': true, '.jpeg': true };

var args = {};
process.argv.slice(2).forEach(function (a) {
  var m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
});

var SRC = path.resolve(ROOT, args.src || 'cart');
var DEST = path.resolve(ROOT, args.dest || 'assets/cards');
var DRY = !!args.dry;

function listSource(dir) {
  if (!fs.existsSync(dir)) {
    console.error('Dossier source introuvable : ' + dir);
    process.exit(1);
  }
  return fs.readdirSync(dir).filter(function (f) {
    return EXT_OK[path.extname(f).toLowerCase()] && fs.statSync(path.join(dir, f)).isFile();
  });
}

function parseName(file) {
  var m = /^(\d+)[\s_-]+([A-Za-z]+)/.exec(file);
  if (!m) return null;
  var rank = Number(m[1]);
  var suit = SUIT_MAP[m[2].toLowerCase()];
  if (!suit) return null;
  if ([1, 2, 3, 4, 5, 6, 7, 10, 11, 12].indexOf(rank) === -1) return null;
  return { rank: rank, suit: suit, ext: path.extname(file).toLowerCase() };
}

// Dimensions déclarées dans le SVG (pour repérer un format inattendu).
function svgInfo(file) {
  var fd, buf, head;
  try {
    fd = fs.openSync(file, 'r');
    buf = Buffer.alloc(1500);
    var n = fs.readSync(fd, buf, 0, 1500, 0);
    head = buf.slice(0, n).toString('utf8');
  } catch (e) {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  var vb = /viewBox\s*=\s*"([^"]+)"/.exec(head);
  var w = /\swidth\s*=\s*"([\d.]+)/.exec(head);
  var h = /\sheight\s*=\s*"([\d.]+)/.exec(head);
  var v = vb ? vb[1].trim().split(/[\s,]+/).map(Number) : null;
  var width = v ? v[2] : (w ? Number(w[1]) : null);
  var height = v ? v[3] : (h ? Number(h[1]) : null);
  return { width: width, height: height, viewBox: vb ? vb[1] : null };
}

// ---------------------------------------------------------------- exécution
var files = listSource(SRC);
var found = {};      // 'dhab-1' -> { file, ext }
var duplicates = [], unknown = [], ratioWarn = [];

// Les doublons " (1)" passent en dernier.
files.sort(function (a, b) {
  var pa = /\(\d+\)/.test(a) ? 1 : 0, pb = /\(\d+\)/.test(b) ? 1 : 0;
  return pa - pb || a.localeCompare(b);
});

files.forEach(function (f) {
  var p = parseName(f);
  if (!p) { unknown.push(f); return; }
  var key = p.suit + '-' + p.rank;
  if (found[key]) { duplicates.push(f + '  (doublon de ' + found[key].file + ')'); return; }
  found[key] = { file: f, ext: p.ext, rank: p.rank, suit: p.suit };
});

var SUITS = ['dhab', 'kass', 'syouf', 'zrawet'];
var RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
var missing = [];
SUITS.forEach(function (s) {
  RANKS.forEach(function (r) {
    if (!found[s + '-' + r]) missing.push(s + '-' + r);
  });
});

if (!fs.existsSync(DEST) && !DRY) fs.mkdirSync(DEST, { recursive: true });

var copied = 0, bytes = 0;
Object.keys(found).sort().forEach(function (key) {
  var item = found[key];
  var src = path.join(SRC, item.file);
  var out = path.join(DEST, key + item.ext);
  var size = fs.statSync(src).size;
  bytes += size;

  if (item.ext === '.svg') {
    var info = svgInfo(src);
    if (info && info.width && info.height) {
      var ratio = info.width / info.height;
      if (ratio < 0.6 || ratio > 0.75) {
        ratioWarn.push(key + ' : ' + info.width + 'x' + info.height +
          ' (ratio ' + ratio.toFixed(3) + ', attendu ~0.667)');
      }
    }
  }

  if (!DRY) fs.copyFileSync(src, out);
  copied++;
  console.log((DRY ? '  [dry] ' : '  \u2713 ') + item.file + '  ->  assets/cards/' + key + item.ext);
});

console.log('\n--- R\u00e9sum\u00e9 ---');
console.log('Source        : ' + SRC);
console.log('Destination   : ' + DEST);
console.log('Fichiers lus  : ' + files.length);
console.log((DRY ? 'À copier' : 'Copiés') + '       : ' + copied + ' cartes (' + (bytes / 1048576).toFixed(1) + ' Mo)');
console.log('Doublons      : ' + duplicates.length);
duplicates.forEach(function (d) { console.log('   - ' + d); });
console.log('Manquants     : ' + missing.length + (missing.length ? ' -> ' + missing.join(', ') : ' (\u2705 paquet complet)'));
if (unknown.length) {
  console.log('Noms ignor\u00e9s  : ' + unknown.length);
  unknown.forEach(function (u) { console.log('   - ' + u); });
}
if (ratioWarn.length) {
  console.log('Ratios suspects : ' + ratioWarn.length);
  ratioWarn.forEach(function (r) { console.log('   - ' + r); });
}
process.exit(missing.length === 0 ? 0 : 0);
