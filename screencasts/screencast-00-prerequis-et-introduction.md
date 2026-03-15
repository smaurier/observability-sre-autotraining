# Screencast 00 — Prérequis & Introduction a l'Observabilité

## Informations
- **Duree estimee** : 12-15 min
- **Module** : `modules/00-prerequis-et-introduction.md`
- **Lab associe** : Lab 01
- **Prérequis** : Aucun

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal intégré ouvert (bash)
- [ ] Node.js 20+ installe (`node --version`)
- [ ] npm installe (`npm --version`)
- [ ] Docker Desktop lance (optionnel mais recommande)
- [ ] Navigateur ouvert sur `http://localhost:3000` (pret à tester)

## Script

### [00:00-01:30] Introduction et objectifs

> Bienvenue dans ce premier screencast de la formation Observabilité et SRE. Aujourd'hui, nous allons preparer notre environnement de travail, lancer la demo-app pour la première fois, et comprendre pourquoi les simples console.log ne suffisent pas en production.

**Action** : Afficher le fichier `modules/00-prerequis-et-introduction.md` dans VS Code pour montrer le plan du module.

> Cette formation est structuree en 20 modules progressifs. Chaque module comprend un cours, un lab pratique et un quiz. A la fin, vous saurez instrumenter une application Node.js de bout en bout : logging structure, metriques Prometheus, tracing distribue, SLOs, alerting et gestion d'incidents.

### [01:30-03:30] Vérification des prérequis

> Commencons par vérifier que notre environnement est pret.

**Action** : Ouvrir le terminal intégré et vérifier les versions.

```bash
node --version
# Attendu : v20.x ou superieur

npm --version
# Attendu : 10.x

npx tsx --version
# Attendu : 4.x
```

> Node.js 20 est requis car nous utiliserons AsyncLocalStorage et les ES Modules natifs. tsx est notre runner TypeScript — il remplace ts-node et exécuté directement les fichiers .ts sans étape de compilation.

**Action** : Vérifier Docker si disponible.

```bash
docker --version
docker compose version
```

> Docker nous servira a lancer Prometheus, Grafana et Jaeger dans les modules suivants. Si vous ne l'avez pas, des alternatives seront proposees.

### [03:30-05:30] Cloner et installer le projet

> Installons maintenant les dépendances du projet.

**Action** : Ouvrir le `package.json` à la racine et montrer les dépendances.

```bash
npm install
```

> Le package.json contient les scripts pour lancer chaque lab. Par exemple, `npm run lab:01` lancera le premier exercice. Nous avons aussi tsx pour exécuter du TypeScript, pino pour le logging structure, et prom-client pour les metriques Prometheus.

**Action** : Montrer la structure du projet dans l'explorateur VS Code.

```
observability-sre-course/
├── demo-app/          ← L'application que nous instrumenterons
├── modules/           ← Les cours (ce que vous lisez)
├── labs/              ← Les exercices pratiques
├── quizzes/           ← Les quiz d'auto-evaluation
├── config/            ← Configurations Prometheus, Grafana, etc.
├── docker-compose.*.yml
└── package.json
```

### [05:30-08:00] Decouvrir la demo-app

> La demo-app est une API REST Express simulant un service de gestion de commandes. C'est sur cette application que nous appliquerons chaque concept.

**Action** : Ouvrir `demo-app/src/index.ts` et parcourir le code.

```typescript
// demo-app/src/index.ts
import express from 'express';
import { logger } from './lib/logger.ts';
import { register } from './lib/metrics.ts';
import { requestIdMiddleware } from './middleware/request-id.ts';
import { requestLoggerMiddleware } from './middleware/request-logger.ts';
import { metricsMiddleware } from './middleware/metrics.ts';
import { errorHandlerMiddleware } from './middleware/error-handler.ts';
import productsRouter from './routes/products.ts';
import ordersRouter from './routes/orders.ts';
import healthRouter from './routes/health.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(metricsMiddleware);

app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/health', healthRouter);

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use(errorHandlerMiddleware);

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'demo-app started');
});
```

> Remarquez les middleware : request-id pour la correlation, request-logger pour le logging, metrics pour les metriques Prometheus. Nous allons construire chacun de ces éléments au fil des modules.

### [08:00-10:30] Lancer la demo-app et observer la sortie

> Lancons l'application et envoyons quelques requêtes.

**Action** : Lancer la demo-app dans le terminal.

```bash
npx tsx demo-app/src/index.ts
```

**Action** : Ouvrir un second terminal et envoyer des requêtes.

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/products
curl http://localhost:3000/api/orders
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"item":"laptop","quantity":1}'
```

> Regardez la sortie dans le premier terminal. Vous voyez des logs structures en JSON avec des timestamps, des niveaux de severite, des requestId. C'est exactement ce que nous allons apprendre à construire module par module.

**Action** : Montrer la sortie du terminal et commenter les champs JSON.

> Comparez cela avec ce que donnerait un simple console.log : juste du texte brut, sans timestamp, sans niveau, sans contexte. Imaginez maintenant 10 000 requêtes par seconde avec 15 services — vous comprenez pourquoi console.log ne suffit pas.

### [10:30-12:30] Voir vs Comprendre un système

> L'analogie du tableau de bord d'une voiture est parlante. console.log, c'est regarder par la fenêtre et constater que la voiture roule. L'observabilité, c'est avoir un compteur de vitesse, une jauge d'essence, un temoin de temperature moteur.

**Action** : Montrer le endpoint `/metrics` dans le navigateur.

```bash
curl http://localhost:3000/metrics
```

> Regardez : notre application expose déjà des metriques Prometheus. Nombre de requêtes, duree, erreurs. Ce sont ces donnees que Prometheus viendra collecter et que Grafana affichera dans des dashboards.

> L'observabilité n'est pas un outil — c'est une propriété de votre système. Un système est observable quand vous pouvez comprendre son état interne en examinant ses sorties : logs, metriques, traces.

### [12:30-14:00] Récapitulatif et prochaines étapes

> Recapitulons ce que nous avons fait dans ce premier screencast. Nous avons vérifié notre environnement, installe les dépendances, decouvert la structure de la demo-app, et observe la différence entre une sortie brute et une sortie instrumentee.

**Action** : Arreter la demo-app avec Ctrl+C.

> Dans le prochain module, nous approfondirons les 3 piliers de l'observabilité : logs, metriques et traces. Nous verrons comment ils se completent et pourquoi aucun ne suffit seul.

> N'oubliez pas de faire le Lab 01 pour pratiquer. A bientot !

## Points d'attention pour l'enregistrement
- Vérifier que Node.js 20+ est installe avant de commencer
- Montrer clairement la différence entre sortie console.log et sortie structuree Pino
- Prendre le temps de parcourir la structure du projet dans l'explorateur
- S'assurer que curl est disponible dans le terminal
- Ne pas aller trop vite sur le package.json — les apprenants doivent voir les dépendances
- Insister sur l'analogie "voir vs comprendre" qui servira de fil rouge tout au long du cours
