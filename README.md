# Observability & SRE Course

![VitePress](https://img.shields.io/badge/-VitePress-646CFF?style=flat-square&logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
[![fullstack-autotraining](https://img.shields.io/badge/curriculum-fullstack--autotraining-4C1?style=flat-square)](https://github.com/smaurier/fullstack-autotraining)

Formation complete Observabilité & SRE : logging, metriques, tracing, SLOs, incidents, chaos engineering (débutant vers expert).

<!-- labs-gestes:start -->
## Labs — refonte du 22/09/2026 : un lab = un geste métier complet

> Règle qualité 5 du parcours : chaque lab est **un geste métier complet**, sous deux formes — **Zéro** (construire de zéro un artefact réel et entier) ou **Intervention** (modifier de l'existant avec consommateurs, findings avant code, non-régression). Un lab n'entre en file qu'avec un **oracle exécutable** (`src/` starter · `test/` · `solution/` séparée). Les labs historiques de ce cours (un concept par lab, sans oracle) restent dans `labs/` jusqu'à remplacement et **ne sont plus la file**. Cible détaillée : [`docs/gestes-complets.md`](../docs/gestes-complets.md). État : **0/3 avec oracle**.

| # | Lab | Forme | Geste | Oracle |
|---|-----|-------|-------|--------|
| 01 | `lab-01-observer-tribuzen` | Zéro | Pino, Sentry, dashboard — geste transverse avec 12 et 15 | · à écrire |
| 02 | `lab-02-alerte-sur-un-sli` | Intervention | réel | · à écrire |
| 03 | `lab-03-incident-a-remonter` | Intervention | traces, logs, cause | · à écrire |

<!-- labs-gestes:end -->

## Démarrage rapide

```bash
npm install
npm run docs:dev
```

Le site de cours sera accessible sur `http://localhost:5173`.

## Structure du projet

```
observability-sre-course/
├── modules/           # 20 modules theoriques (Markdown / VitePress)
├── labs/              # 19 labs pratiques (exercice + solution TypeScript)
├── quizzes/           # 20 quizzes interactifs (HTML)
├── visualizations/    # 5 visualisations animees (HTML)
├── demo-app/          # Application Express instrumentee (logging, metriques, tracing)
├── config/            # Configuration Prometheus, Grafana, OTel Collector
├── scripts/           # Scripts utilitaires (copy-assets, etc.)
├── docker-compose.base.yml     # Stack Prometheus + Grafana
├── docker-compose.tracing.yml  # Stack OTel Collector + Jaeger
├── docker-compose.full.yml     # Stack complete avec demo-app
└── .vitepress/        # Configuration VitePress
```

## Stack Docker

```bash
# Stack de base (Prometheus + Grafana)
docker compose -f docker-compose.base.yml up

# Stack tracing (OTel Collector + Jaeger)
docker compose -f docker-compose.tracing.yml up

# Stack complete (demo-app + toute l'infra)
docker compose -f docker-compose.full.yml up --build
```

## Demo App

L'application de demonstration est une API Express avec :
- Logging structure (pino)
- Metriques Prometheus (prom-client)
- Correlation IDs (AsyncLocalStorage)
- Routes : `/api/products`, `/api/orders`, `/health`, `/metrics`

```bash
cd demo-app
npm install
npm run dev
```

## Pre-requis

- Node.js >= 20
- Docker & Docker Compose (pour les labs infra)
- Un editeur de code (VS Code recommande)
