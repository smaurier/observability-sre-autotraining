# Lab 16 — Tracker DORA Metrics

## Objectifs

- Comprendre les 4 métriques DORA (Deployment Frequency, Lead Time for Changes, Change Failure Rate, MTTR)
- Modéliser les événements de déploiement et calculer la fréquence de déploiement
- Calculer le Lead Time for Changes (commit -> deploy)
- Calculer le Change Failure Rate à partir des résultats de déploiement
- Calculer le Mean Time to Recovery (MTTR) à partir des données d'incidents
- Classifier la performance d'une équipe selon les benchmarks DORA (elite, high, medium, low)

## Pré-requis

- Comprendre les concepts DevOps et les métriques de livraison logicielle

## Exercices

### Exercice 1 — Deployment Frequency

Modélisez des événements de déploiement et calculez la fréquence de déploiement sur une période.

### Exercice 2 — Lead Time for Changes

Calculez le temps entre un commit et son déploiement en production.

### Exercice 3 — Change Failure Rate

Calculez le pourcentage de déploiements qui causent des incidents.

### Exercice 4 — Mean Time to Recovery (MTTR)

Calculez le temps moyen de récupération à partir de données d'incidents.

### Exercice 5 — Classification DORA

Classifiez la performance d'une équipe selon les benchmarks DORA.

## Lancer les tests

```bash
npx tsx exercise.ts
```

## Critères de réussite

- Tous les tests passent (5/5 exercices)
- Les 4 métriques DORA sont correctement calculées
- La classification est conforme aux benchmarks officiels
