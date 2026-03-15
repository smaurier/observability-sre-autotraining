# Lab 17 — Observability as Code

## Objectifs

- Générer des panels et dashboards Grafana de manière programmatique
- Générer des regles d'alerte Prometheus au format YAML
- Générer des regles d'enregistrement SLO (recording rules)
- Valider les configurations generees (champs requis, coherence)

## Prérequis

- Lab 09 (PromQL & Grafana)
- Lab 10 (SLOs)
- Notions de base sur les alerting rules Prometheus

## Exercices

| # | Sujet | Difficulte |
|---|-------|------------|
| 1 | Générer un panel Grafana JSON | ** |
| 2 | Générer un dashboard Grafana complet | ** |
| 3 | Générer des alerting rules Prometheus YAML | *** |
| 4 | Générer des SLO recording rules | *** |
| 5 | Valider les configurations generees | ** |

## Lancer les tests

```bash
npx tsx exercise.ts   # version avec TODOs
npx tsx solution.ts   # version complete
```
