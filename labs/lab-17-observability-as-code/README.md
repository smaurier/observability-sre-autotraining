# Lab 17 — Observability as Code

## Objectifs

- Generer des panels et dashboards Grafana de maniere programmatique
- Generer des regles d'alerte Prometheus au format YAML
- Generer des regles d'enregistrement SLO (recording rules)
- Valider les configurations generees (champs requis, coherence)

## Prerequis

- Lab 09 (PromQL & Grafana)
- Lab 10 (SLOs)
- Notions de base sur les alerting rules Prometheus

## Exercices

| # | Sujet | Difficulte |
|---|-------|------------|
| 1 | Generer un panel Grafana JSON | ** |
| 2 | Generer un dashboard Grafana complet | ** |
| 3 | Generer des alerting rules Prometheus YAML | *** |
| 4 | Generer des SLO recording rules | *** |
| 5 | Valider les configurations generees | ** |

## Lancer les tests

```bash
npx tsx exercise.ts   # version avec TODOs
npx tsx solution.ts   # version complete
```
