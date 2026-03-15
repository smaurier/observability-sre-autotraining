# Lab 23 — Observabilité Frontend

## Objectifs

- Classifier les Core Web Vitals (LCP, INP, CLS) en good/needs-improvement/poor
- Implémenter un collecteur RUM (Real User Monitoring)
- Calculer le P75 d'une métrique à partir de sessions
- Grouper et dédupliquer les erreurs frontend par fingerprint

## Prérequis

- Module 23 (Observabilité Frontend)
- Node.js 20+, npx tsx

## Instructions

```bash
# Lancer l'exercice
npx tsx exercise.ts

# Vérifier avec la solution
npx tsx solution.ts
```

## Parties

1. **CWV Rating** — Classifier une valeur LCP/INP/CLS selon les seuils Google
2. **RUM Collector** — Collecter et stocker des sessions avec leurs métriques
3. **P75 Computation** — Calculer le 75e percentile d'une métrique sur les sessions
4. **Error Grouping** — Dédupliquer des erreurs par fingerprint (hash message + stack)
