# Module 27 — Continuous Profiling : comprendre ou va le temps CPU et la memoire

## Objectifs pedagogiques

- Comprendre ce qu'est le continuous profiling et pourquoi il complete le tracing et les metriques
- Installer et configurer Pyroscope pour profiler une application Node.js
- Lire et interpreter un flame graph (CPU, memoire, wall-clock)
- Distinguer CPU profiling, memory profiling et wall-clock profiling
- Integrer le profiling avec OpenTelemetry
- Savoir quand utiliser le profiling vs le tracing vs les metriques

---

## 1. Qu'est-ce que le continuous profiling ?

### Le probleme que le profiling resout

Les metriques te disent **quoi** (le CPU est a 80%). Le tracing te dit **ou** (la requete `/api/users` est lente). Le profiling te dit **pourquoi** (la fonction `JSON.parse` dans le middleware de serialisation consomme 40% du CPU).

```
METRIQUES           TRACING              PROFILING
=========           =======              =========
"Le CPU est         "La requete          "La fonction parseBody()
 a 80%"              /api/users           consomme 40% du CPU
                     prend 2s"            a cause d'un regex
                                          catastrophique"

Quoi ?              Ou ?                 Pourquoi ?
(symptome)          (localisation)       (cause racine)
```

> **Analogie medicale** : les metriques sont la temperature du patient (38.5°C — quelque chose ne va pas). Le tracing est la radiographie (on voit que le poumon droit est touche). Le profiling est la biopsie (on identifie exactement la bacterie responsable).

### Profiling traditionnel vs continuous profiling

```
PROFILING TRADITIONNEL                CONTINUOUS PROFILING
========================              =======================

- Lance manuellement                 - Tourne en permanence en production
  (quand on suspecte un probleme)      (avec un overhead < 1%)

- Sur un environnement de dev        - Sur les vrais serveurs de production
  (pas representatif)                   (trafic reel)

- Capture quelques secondes          - Capture 24h/24, stocke l'historique
  (on rate les problemes              (on peut comparer avant/apres
   intermittents)                       un deploiement)

- Resultat : un fichier local        - Resultat : un service centralise
  (difficile a partager)               avec interface web (flame graphs)
```

---

## 2. Les trois types de profiling

### 2.1 CPU profiling

Mesure le temps passe **sur le processeur** — ou le code execute-t-il reellement des calculs ?

```
CPU Profile : ou va le temps CPU ?

Total CPU time : 100%
├── 35%  JSON.parse (serialisation des reponses API)
│   └── 28% reviver function (transformation custom des dates)
├── 25%  bcrypt.hash (hashage des mots de passe)
├── 15%  RegExp.exec (validation des emails)
│   └── 12% catastrophic backtracking sur certains inputs
├── 10%  GC (garbage collection — nettoyage memoire)
├── 8%   TLS handshake (chiffrement des connexions)
└── 7%   Autre
```

**Quand l'utiliser ?** Quand le CPU est eleve mais que tu ne sais pas quelle fonction en est responsable.

### 2.2 Memory profiling (heap profiling)

Mesure les **allocations memoire** — quels objets sont crees et combien de memoire ils consomment ?

```
Memory Profile : qui alloue de la memoire ?

Total allocations : 500 Mo/min
├── 180 Mo  Buffer.alloc (lecture de fichiers)
│   └── 150 Mo  imageProcessor.resize() — images non liberees
├── 120 Mo  Array.push (accumulation de resultats)
│   └── 100 Mo  cacheService.store() — cache sans eviction
├── 80 Mo   JSON.parse (reponses API entrantes)
├── 60 Mo   String concatenation (construction de logs)
└── 60 Mo   Autre

Le profiling memoire revele :
- Les fuites de memoire (objets jamais liberes)
- Les allocations excessives (objets crees et detruits trop souvent)
- Les caches qui grandissent indefiniment
```

**Quand l'utiliser ?** Quand la memoire augmente avec le temps (fuite), ou quand le garbage collector consomme trop de CPU.

### 2.3 Wall-clock profiling

Mesure le temps **reel ecoule** (wall-clock = l'horloge murale), y compris le temps d'attente I/O :

```
Wall-clock Profile : ou passe le temps reel ?

Temps total d'une requete : 2000ms
├── 800ms  await database.query() — attente BDD
│   └── 600ms  slow query (SELECT * FROM logs WHERE...)
├── 500ms  await fetch('https://api.stripe.com') — appel externe
├── 300ms  await redis.get() — attente cache (cold miss)
├── 200ms  JSON.parse + JSON.stringify — CPU
├── 100ms  middleware auth — verification JWT
└── 100ms  Autre

Contrairement au CPU profiling, le wall-clock montre le temps
d'attente I/O. Le CPU profiling ignorerait les 1300ms d'attente
BDD + API + Redis car le CPU ne fait RIEN pendant ce temps.
```

**Quand l'utiliser ?** Quand les requetes sont lentes mais que le CPU n'est pas eleve (le probleme est dans l'I/O).

### Comparaison des trois types

| Type | Mesure | Overhead | Revele | Ignore |
|------|--------|----------|--------|--------|
| **CPU** | Temps CPU actif | ~1% | Fonctions gourmandes en calcul | Attente I/O |
| **Memory** | Allocations heap | ~2-5% | Fuites memoire, allocations excessives | Temps d'execution |
| **Wall-clock** | Temps reel ecoule | ~1-2% | I/O lent, attentes reseau/BDD | Rien (voit tout) |

---

## 3. Pyroscope : continuous profiling pour Node.js

### 3.1 Installation

```bash
# Installer Pyroscope server (Docker)
docker run -d -p 4040:4040 grafana/pyroscope:latest

# Installer le SDK Node.js
npm install @pyroscope/nodejs
```

### 3.2 Configuration dans une application Node.js

```typescript
import Pyroscope from '@pyroscope/nodejs';

// Initialiser le profiling continu
Pyroscope.init({
  serverAddress: 'http://localhost:4040',  // URL du serveur Pyroscope
  appName: 'mon-api-nestjs',               // Nom de l'application
  tags: {
    env: process.env.NODE_ENV ?? 'development',
    version: process.env.APP_VERSION ?? '0.0.0',
    region: process.env.REGION ?? 'eu-west-1',
  },
  // Types de profiling actives
  wall: true,     // Wall-clock profiling
  heap: true,     // Memory profiling (heap allocations)
});

// Demarrer le profiling
Pyroscope.start();

// A l'arret de l'application
process.on('SIGTERM', () => {
  Pyroscope.stop();
});
```

### 3.3 Profiling cible avec les labels

```typescript
import Pyroscope from '@pyroscope/nodejs';

// Ajouter des labels dynamiques pour filtrer les profils
// Exemple : profiler par endpoint
async function handleRequest(req: Request, res: Response): Promise<void> {
  Pyroscope.wrapWithLabels(
    {
      endpoint: req.path,
      method: req.method,
      userId: req.userId ?? 'anonymous',
    },
    async () => {
      // Le code ici est profile avec les labels ci-dessus
      const result = await processRequest(req);
      res.json(result);
    },
  );
}

// Dans Pyroscope, tu peux ensuite filtrer :
// "Montre-moi le flame graph uniquement pour l'endpoint /api/search"
// "Compare le profil CPU entre userId=premium et userId=free"
```

### 3.4 Lire un flame graph

Le flame graph est la visualisation principale du profiling. Voici comment le lire :

```
FLAME GRAPH (lecture de bas en haut)
=====================================

Largeur = proportion du temps total
Plus une barre est large, plus la fonction consomme de temps.

┌─────────────────────────────────────────────────────┐
│              JSON.parse (35%)                         │ ← Fonction la plus
├──────────────────────┬──────────────────────────────┤    consommatrice
│  reviver (28%)       │  native (7%)                 │
├───────────┬──────────┤                              │
│ dateP(15%)│ numP(13%)│                              │
└───────────┴──────────┴──────────────────────────────┘

┌──────────────────────────────────┐
│       bcrypt.hash (25%)          │
├──────────────────────────────────┤
│       hashRounds (25%)           │
└──────────────────────────────────┘

┌────────────────────┐
│  RegExp.exec (15%) │
└────────────────────┘

Comment lire :
1. Commence par les barres les PLUS LARGES → ce sont tes cibles d'optimisation
2. Remonte vers le haut pour voir la PILE D'APPELS (qui appelle qui)
3. Cherche les fonctions "inattendues" qui sont trop larges
4. Compare AVANT et APRES une optimisation (Pyroscope permet la comparaison)
```

### 3.5 Flame graph de comparaison (diff)

Pyroscope permet de comparer deux periodes (avant/apres un deploiement) :

```
DIFF FLAME GRAPH
=================

Rouge = plus lent qu'avant (regression)
Vert = plus rapide qu'avant (amelioration)
Gris = pas de changement

┌─────────────────────────────────────────────────────┐
│              JSON.parse (ROUGE +15%)                  │ ← Regression !
├──────────────────────┬──────────────────────────────┤
│  reviver (ROUGE +20%)│  native (gris)               │ ← Le reviver est le coupable
└──────────────────────┴──────────────────────────────┘

┌──────────────────────────────────┐
│    bcrypt.hash (VERT -30%)       │ ← Amelioration (on a reduit les rounds)
└──────────────────────────────────┘

Usage typique :
1. Deployer la version v2.1.0
2. Comparer les profils de v2.0.0 vs v2.1.0 sur les 2 dernieres heures
3. Identifier les regressions (rouge) et les ameliorations (vert)
```

---

## 4. Integration avec OpenTelemetry

### 4.1 Profiling + Tracing : la combinaison gagnante

OpenTelemetry travaille sur un signal de **profiling** (en cours de standardisation). L'idee est de lier les profils aux traces :

```
Trace d'une requete lente :
  Span: GET /api/search (2000ms)
  └── Span: database.query (800ms)    ← Pourquoi si lent ?
      └── LIEN VERS LE PROFIL         ← Le flame graph montre que
          CPU: indexScan() = 60%          la requete fait un full scan
          CPU: sortResults() = 30%        au lieu d'utiliser l'index
```

```typescript
// Configuration OpenTelemetry + Pyroscope
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import Pyroscope from '@pyroscope/nodejs';

// 1. Configurer OpenTelemetry (tracing)
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }),
});
sdk.start();

// 2. Configurer Pyroscope (profiling)
Pyroscope.init({
  serverAddress: 'http://localhost:4040',
  appName: 'mon-api',
  tags: { env: 'production' },
});
Pyroscope.start();

// 3. Dans Grafana, les deux sources sont liees :
// - Grafana Tempo pour les traces
// - Grafana Pyroscope pour les profils
// - Clic sur un span → "View profile" → flame graph du moment exact
```

### 4.2 Les trois piliers deviennent quatre

```
L'observabilite moderne a 4 signaux :

  LOGS          METRIQUES       TRACES          PROFILS
  ====          =========       ======          =======
  Evenements    Valeurs         Requetes        Fonctions
  discrets      numeriques      distribuees     et ressources

  "Error:       CPU = 80%       GET /api →      JSON.parse
   timeout"     p99 = 2s        DB → Cache      = 35% CPU

  Quoi s'est    Combien ?       Quel chemin ?   Pourquoi
  passe ?                                       c'est lent ?

                    ┌──────────────────────┐
                    │       GRAFANA        │
                    │                      │
                    │  Loki (logs)         │
                    │  Prometheus (metrics) │
                    │  Tempo (traces)      │
                    │  Pyroscope (profiles)│
                    └──────────────────────┘
```

---

## 5. Quand utiliser profiling vs tracing vs metriques

### Arbre de decision

```
Mon application est lente. Par ou commencer ?

1. METRIQUES (Prometheus/Grafana)
   → Le CPU est-il eleve ? La memoire augmente-t-elle ?
   ├─ CPU eleve → aller au profiling CPU (etape 3)
   ├─ Memoire qui augmente → aller au profiling memoire (etape 3)
   └─ CPU et memoire normaux → aller au tracing (etape 2)

2. TRACING (Tempo/Jaeger)
   → Quelle requete est lente ? Quel span prend du temps ?
   ├─ Un span specifique est lent → aller au profiling wall-clock (etape 3)
   └─ Tous les spans sont lents → probleme d'infrastructure (reseau, BDD)

3. PROFILING (Pyroscope)
   → Quelle FONCTION est responsable ?
   → Flame graph → identifier la cause racine
   → Optimiser → re-profiler pour valider
```

### Matrice de decision

| Symptome | Outil | Action |
|----------|-------|--------|
| "Le CPU est a 90%" | Metriques → CPU profiling | Identifier la fonction gourmande |
| "La memoire augmente avec le temps" | Metriques → Heap profiling | Trouver la fuite memoire |
| "Les requetes sont lentes" | Tracing → Wall-clock profiling | Identifier l'I/O bloquant |
| "Les erreurs augmentent" | Logs → Tracing | Correler erreurs et requetes |
| "Le p99 explose" | Metriques → Tracing → Profiling | Pipeline complet d'investigation |
| "Regression apres un deploiement" | Diff flame graph (Pyroscope) | Comparer avant/apres |

---

## 6. Bonnes pratiques

### Overhead et production

```
Le continuous profiling est concu pour la production.
L'overhead est minimal si bien configure :

| Type de profiling | Overhead typique | Frequence recommandee |
|-------------------|------------------|-----------------------|
| CPU sampling      | < 1% CPU         | 100 Hz (100 samples/s)|
| Wall-clock        | < 1-2% CPU       | 100 Hz               |
| Heap allocation   | 2-5% CPU         | Chaque 512 Ko alloue |
| Heap live objects  | 3-8% CPU         | Toutes les 30s       |

Regles :
1. Toujours activer en production (c'est la que les vrais problemes apparaissent)
2. Commencer par le CPU profiling (le moins couteux)
3. Ajouter le heap profiling si tu suspectes des fuites memoire
4. Utiliser les labels pour filtrer (pas besoin de profiler TOUT)
5. Definir une retention (garder 7-14 jours, pas plus)
```

### Integration dans le workflow de deploiement

```
1. AVANT le deploiement
   → Capturer le profil "baseline" pendant 30 minutes

2. APRES le deploiement (canary)
   → Capturer le profil du canary pendant 30 minutes

3. COMPARER (diff flame graph)
   → Rouge (regression) → investiguer avant d'elargir le rollout
   → Vert (amelioration) → continuer le rollout
   → Gris (pas de changement) → OK

4. ALERTER si une regression est detectee
   → Pyroscope peut envoyer des alertes si une fonction
     depasse un seuil de consommation CPU
```

---

## Resume

| Concept | Description |
|---------|-------------|
| Continuous profiling | Profiling en production 24h/24 avec overhead < 1% |
| CPU profiling | Identifie les fonctions qui consomment le plus de CPU |
| Memory profiling | Identifie les allocations excessives et les fuites memoire |
| Wall-clock profiling | Identifie les attentes I/O (BDD, reseau, disque) |
| Flame graph | Visualisation hierarchique : largeur = temps consomme |
| Diff flame graph | Compare deux periodes (rouge = regression, vert = amelioration) |
| Pyroscope | Outil de continuous profiling integre a Grafana |
| Profiling + Tracing | Lier un span lent a son flame graph pour trouver la cause racine |

---

## Exercices pratiques

1. **Setup** : Demarrez Pyroscope avec Docker, configurez le SDK Node.js, et verifiez que les profils apparaissent dans l'interface web
2. **Flame graph** : Creez une application Express avec une route volontairement lente (boucle CPU), profilez-la et identifiez la fonction coupable dans le flame graph
3. **Memory leak** : Creez une fuite memoire intentionnelle (cache sans eviction), utilisez le heap profiling pour l'identifier
4. **Diff** : Deployez une "v1" puis une "v2" avec un changement de performance, comparez les profils avec le diff flame graph
5. **OpenTelemetry** : Configurez Tempo + Pyroscope dans Grafana, tracez une requete lente et naviguez du span vers le flame graph
