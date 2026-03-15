# Lab 24 — Instrumentation Nuxt / Next.js

## Objectifs

- Implémenter un SDK OpenTelemetry simplifié (tracer, span, context)
- Tracer les requêtes SSR avec propagation de contexte W3C
- Instrumenter les routes API avec métriques de latence
- Corréler les traces frontend ↔ backend

## Prérequis

- Module 24 (Instrumentation Nuxt/Next)
- Node.js 20+, npx tsx

## Instructions

```bash
# Lancer l'exercice
npx tsx exercise.ts

# Vérifier avec la solution
npx tsx solution.ts
```

## Parties

1. **OTel SDK simplifié** — Tracer, SpanContext, propagation
2. **SSR Tracing** — Instrumenter le rendu serveur
3. **API Route Monitoring** — Métriques et traces sur les endpoints
4. **Corrélation frontend-backend** — Injecter/extraire le traceparent
