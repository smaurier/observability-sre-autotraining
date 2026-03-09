# Lab 10 — Definir et mesurer des SLOs

## Objectifs

- Definir les types de SLI (disponibilite, latence, qualite)
- Calculer la conformite SLO a partir de donnees de requetes
- Calculer et suivre le budget d'erreur (total, consomme, restant)
- Implementer le calcul SLO sur fenetre glissante (rolling window)
- Definir une politique de budget d'erreur (gel des deploiements)
- Calculer un SLO composite a partir de plusieurs SLOs

## Prerequis

- Lab 04 (metriques fondamentales)
- Notions de base sur SLI / SLO / SLA

## Exercices

| # | Sujet | Difficulte |
|---|-------|------------|
| 1 | Definir les types de SLI | * |
| 2 | Calculer la conformite SLO | ** |
| 3 | Calculer le budget d'erreur | ** |
| 4 | SLO sur fenetre glissante | *** |
| 5 | Politique de budget d'erreur | ** |
| 6 | SLO composite | *** |

## Lancer les tests

```bash
npx tsx exercise.ts   # version avec TODOs
npx tsx solution.ts   # version complete
```
