# Lab 09 — PromQL & Grafana Dashboard Génération

## Objectifs

- Comprendre les fonctions PromQL fondamentales : `rate()`, `increase()`, `histogram_quantile()`
- Implementer des aggregations comme `sum by()`
- Générer des panels Grafana en JSON
- Construire un dashboard complet de manière programmatique

## Prérequis

- Lab 04 (metriques fondamentales) termine
- Notions de compteurs, histogrammes, gauges Prometheus

## Exercices

| # | Sujet | Difficulte |
|---|-------|------------|
| 1 | Implementer rate() | ** |
| 2 | Implementer increase() | ** |
| 3 | Implementer histogram_quantile() | *** |
| 4 | Implementer sum_by() | ** |
| 5 | Générer un panel Grafana JSON | ** |
| 6 | Générer un dashboard complet | *** |

## Lancer les tests

```bash
npx tsx exercise.ts   # version avec TODOs
npx tsx solution.ts   # version complete
```
