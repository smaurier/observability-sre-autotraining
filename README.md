# Observability & SRE Course

Formation complete Observabilité & SRE : logging, metriques, tracing, SLOs, incidents, chaos engineering (débutant vers expert).

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
