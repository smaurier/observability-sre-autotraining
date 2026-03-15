# Lab 08 — OTel Collector : Pipeline, Processors, Sampling

## Objectifs

- Comprendre l'architecture du OpenTelemetry Collector (receivers, processors, exporters)
- Parser et valider une configuration Collector
- Implementer un **BatchProcessor** qui regroupe les items avant export
- Implementer un **FilterProcessor** qui filtre les spans par attribut
- Construire une **Pipeline** chainant reception, traitement et export
- Implementer un **TailSampler** pour l'echantillonnage intelligent des traces

## Prérequis

- Lab 07 (tracing) termine
- Notions de base sur les pipelines de donnees

## Exercices

| # | Sujet | Difficulte |
|---|-------|------------|
| 1 | Parser une config OTel Collector | * |
| 2 | Implementer BatchProcessor | ** |
| 3 | Implementer FilterProcessor | ** |
| 4 | Implementer Pipeline | *** |
| 5 | Implementer TailSampler | *** |

## Lancer les tests

```bash
npx tsx exercise.ts   # version avec TODOs
npx tsx solution.ts   # version complete
```
