# Observability & SRE Course

![VitePress](https://img.shields.io/badge/-VitePress-646CFF?style=flat-square&logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
[![fullstack-autotraining](https://img.shields.io/badge/curriculum-fullstack--autotraining-4C1?style=flat-square)](https://github.com/smaurier/fullstack-autotraining)

Formation complete Observabilité & SRE : logging, metriques, tracing, SLOs, incidents, chaos engineering (débutant vers expert).

<!-- labs-gestes:start -->
## Labs — geste transverse sur 12-AWS / 15-CI-CD / 16-Observabilité

> **Un seul geste transverse sur les trois cours** (cible détaillée :
> [`docs/gestes-complets.md`](../docs/gestes-complets.md)) — le Z vit dans
> [`12-aws-cloud/labs/lab-01-deployer-tribuzen`](../12-aws-cloud/labs/lab-01-deployer-tribuzen/README.md)
> (Pino + Sentry y sont déjà). Ce cours porte l'intervention "alerte sur un SLI réel" — la
> seule des 4 I qui tourne sur de VRAIS conteneurs Docker (Prometheus réel, pas de mock).
> État au 10/10/2026 : écrit, vérification du run complet en cours (voir README du lab).

| Lab | Forme | Geste | Oracle |
|-----|-------|-------|--------|
| [`lab-geste-i3-alerte-sli-reel`](labs/lab-geste-i3-alerte-sli-reel/README.md) | Intervention | alerte Prometheus réelle sur un taux d'erreur injecté | ⏳ voir README du lab pour le statut exact |

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
