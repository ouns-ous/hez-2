# 🃏 هز 2 — Hez 2

**الكارطة البلدية · Le jeu de cartes marocain, en web app.**

Joue à **Hez 2** dans ton navigateur ou sur ton téléphone : 40 cartes espagnoles, 2 ou 4 joueurs,
IA incluse, **zéro dépendance**, **zéro build**, **zéro compte**.

![tests](https://github.com/VOTRE-USER/hez2/actions/workflows/tests.yml/badge.svg)
![license](https://img.shields.io/badge/license-MIT-2AA845)
![deps](https://img.shields.io/badge/dependencies-0-3D5BF0)

---

## ⚡ كيفاش تلعب (2 دقائق)

1. حلّ `index.html` فالمتصفح (double-clic، ما كتحتاجش تثبّت والو).
2. كتلقى **4 ورقات** ف يدك، وورقة واحدة باينة فالوسط.
3. كلّي على ورقة **كتشبه** الورقة اللي فالوسط ف **الرقم** ولا ف **النوع (الساري)**. يلا ما عندكش، كلّي على كومة **السحب**.
4. أول واحد كيسالي ورقو **كيربح**. 🏆

> على التليفون: شوف [Tester sur ton téléphone](#-tester-sur-ton-téléphone).

---

## 📜 القواعد

الرزمة: **40 ورقة** — 4 أنواع (الفلوس 💰، جْبن 🍷، السيوف ⚔️، الزراوط 🌳) × الأرقام **1-7 و 10-12**
(ما كايناش 8 و 9). 10 = *Sota*, 11 = *Caballo*, 12 = *Rey*.

| الورقة | المفعول |
|---|---|
| **2** | اللي موراك كيهز 2 وما كيلعبش. يلا كانت عندو 2 أخرى كيحطها → **هز 4**، وهي غادية (cumul) |
| **7** (السيّار) | كيبدّل الساري — كتختار من 4 أنواع |
| **10** (Sota) | كيسكيب اللاعب اللي موراك |
| **1 الفلوس** | اللي موراك كيهز **5** ورقات دقة واحدة وما كيلعبش |
| **1 الزراوط** | سكيب (بحال الـ 10) |
| **1 السيوف / 1 الكأس** | ورق عادي |

**Carta!** — ملي كتبقا ليك **ورقة وحدة**، خاصك تقول «Carta!» قبل ما يلعب اللي موراك.
يلا نسيتي → كتهز **ورقتين**. (بحال هكا كتقدر تعاقب حتى الـ IA يلا نسات 😉)

### 🏠 قواعد الدار (variantes)

كل قنت (quartier) كيلعب بقواعدو — داكشي علاش **كلشي قابل للتغيير** من زر ⚙️ **القواعد**:

- **الجوجور (preset) :**
  - **B** *(المقترح)* — كل 1 عندو مفعولو (الذهبية كتهز 5، الزراوط كيسكيب)
  - **A** — كل الـ 1 كيسكيبو، والذهبية زيادة على داكشي كتهز 5
  - **بسيطة** — الـ 1 بلا مفعول
- **خيارات :** cumul ديال الـ 2، الـ 7 كيبدّل الساري، الـ 10 كيسكيب، السحب ومن بعد تلعب، قاعدة «Carta!»
- **الـ 1 :** لكل نوع، اختار *عادي / يهز 2 / يهز 5* + سكيب ✅

الإعدادات كتّسجل ف الجهاز (localStorage) — مرة وحدة وكتبقا.

---

## 🚀 Démarrage rapide

```bash
git clone https://github.com/VOTRE-USER/hez2.git
cd hez2
# option 1 : double-clic sur index.html — rien d'autre à faire
# option 2 : petit serveur local (utile pour tester depuis le téléphone)
python -m http.server 8000     # ou : npm run serve
```

### 🧪 Tests

```bash
npm test                          # les deux suites
node tests/engine.test.js         # moteur : 52 tests
node tests/ui-api.test.js         # UI : 9 vérifications
```

**Moteur (52 tests)**, sans framework : paquet espagnol, distribution, cartes jouables, cumul des 2,
effets des 1 / 7 / 10, changement de sari, recyclage du talon, fin de partie, coups invalides,
et **2 000 parties complètes IA contre IA** (aucune partie bloquée).

**UI (24 vérifications)** : chaque méthode `Engine.*` / `AI.*` / `Deck.*` / `Rules.*` / `Assets.*`
appelée par `ui.js` existe vraiment, chaque `id` HTML utilisé est bien dans `index.html`, la
convention de nommage des cartes est vérifiée, et le script **liste les visuels manquants** —
le tout **sans navigateur**.

---

## 📱 Tester sur ton téléphone

**Méthode 1 — serveur local (Wi-Fi)**

```bash
cd hez2
python -m http.server 8000
ipconfig            # note l'adresse IPv4, ex. 192.168.1.20
```
Puis sur le téléphone : `http://192.168.1.20:8000`

**Méthode 2 — GitHub Pages**

Push le repo → **Settings → Pages → Branch: main / root** → l'app est en ligne en 1 minute.

**Méthode 3 — PWA**

Sur Chrome Android : **⋮ → Ajouter à l'écran d'accueil** → icône, plein écran, hors ligne.

---

## 🗂️ Structure

```
hez2/
├── index.html                  # écran unique : tapis, sièges autour, éventail (arabe RTL)
├── preview.html                # 🖼️ grille des 40 cartes (voir ce qui manque)
├── css/style.css               # thème sombre, cartes, overlays
├── js/
│   ├── deck.js                 # paquet espagnol 40 cartes (+ alias darija)
│   ├── rules.js                # règles configurables + presets A / B / simple
│   ├── engine.js               # moteur : pose, effets, cumul, fin de partie (pur, testable)
│   ├── ai.js                   # IA : attaque si l'adversaire est proche de gagner
│   ├── assets.js               # charge assets/cards/<suit>-<rank>.svg|png|jpg, sinon emoji
│   └── ui.js                   # DOM, animations, « Carta! », panneau de règles
├── assets/cards/               # 🖼️ les 40 visuels SVG (voir le README du dossier)
├── cart/                       # fichiers sources bruts à importer (tools/import-cards.js)
├── tools/import-cards.js       # renomme/copie une arborescence libre vers assets/cards/
├── tests/
│   ├── engine.test.js          # 52 tests du moteur
│   └── ui-api.test.js          # 24 vérifications UI / assets, sans navigateur
└── .github/workflows/          # CI : tests à chaque push
```

Le **moteur ne touche pas au DOM** : il s'exécute aussi bien dans le navigateur que dans Node,
ce qui permet de simuler des milliers de parties pour équilibrer les règles.

### 🖼️ Les cartes (visuels réels)

Les 40 visuels sont dans `assets/cards/`, nommés `<suit>-<rank>.svg` (dessins vectoriels,
donc nets à n'importe quelle taille) :

| id | couleur | nom affiché |
|---|---|---|
| `dhab` | 💰 pièces | **الفلوس** (flous) |
| `kass` | 🍷 coupes | **جْبن** (jben / kissan) |
| `syouf` | ⚔️ épées | السيوف |
| `zrawet` | 🌳 bâtons | الزراوط (zrawet) |

**Pour voir ce qui manque en 5 secondes :** ouvre [`preview.html`](preview.html) — la grille des
40 cartes, les manquantes sont encadrées en rouge.

**Pour ajouter / remplacer des cartes :**

```bash
node tools/import-cards.js --dry     # montre ce qui serait copié
node tools/import-cards.js           # source ./cart -> assets/cards/<suit>-<rank>.svg
```

Le script accepte `.svg`, `.png`, `.jpg`, comprend `dheb` comme `dhab` et `jben` comme `kass`,
ignore les doublons, et liste les cartes manquantes.

Si un fichier manque, la carte reste dessinée en émoji — **la partie ne casse jamais**.

---

## 🗺️ Roadmap

- [ ] **APK Android** — emballer la web app avec Capacitor, APK produit par GitHub Actions
- [ ] **4 joueurs 2 contre 2** — équipes et score cumulé (le moteur gère déjà N joueurs)
- [ ] **40 cartes SVG** dessinées (pièces, coupes, épées, bâtons) — sans problème de droits
- [ ] **Ronda** — l'autre grand jeu de la carte beldia, dans le même moteur
- [ ] **Multijoueur en ligne** — 2 téléphones, un petit serveur WebSocket
- [ ] **Sons + animations** de distribution, compteur de victoires

---

## 🤝 Contribuer

Les règles changent d'une ville à l'autre : si ta variante n'est pas dans les presets,
ouvre une **issue** avec le nom de ta ville + les règles, ou ajoute un preset dans
`js/rules.js`. Les pull requests sont bienvenues.

## 📄 Licence

MIT — voir [LICENSE](LICENSE).
