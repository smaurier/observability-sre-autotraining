# Lab 10 — Définir et mesurer des SLOs

## Objectifs

- Définir les types de SLI (disponibilité, latence, qualite)
- Calculer la conformite SLO à partir de donnees de requêtes
- Calculer et suivre le budget d'erreur (total, consomme, restant)
- Implementer le calcul SLO sur fenêtre glissante (rolling window)
- Définir une politique de budget d'erreur (gel des deploiements)
- Calculer un SLO composite à partir de plusieurs SLOs

## Prérequis

- Lab 04 (metriques fondamentales)
- Notions de base sur SLI / SLO / SLA

## Exercices

| # | Sujet | Difficulte |
|---|-------|------------|
| 1 | Définir les types de SLI | * |
| 2 | Calculer la conformite SLO | ** |
| 3 | Calculer le budget d'erreur | ** |
| 4 | SLO sur fenêtre glissante | *** |
| 5 | Politique de budget d'erreur | ** |
| 6 | SLO composite | *** |

## Lancer les tests

```bash
npx tsx exercise.ts   # version avec TODOs
npx tsx solution.ts   # version complete
```
