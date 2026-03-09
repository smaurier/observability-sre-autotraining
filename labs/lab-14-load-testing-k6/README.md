# Lab 14 — Load Testing k6

## Objectifs

- Comprendre les différents types de scénarios de test de charge (ramp-up, steady-state, spike, soak)
- Modéliser des scénarios k6 comme structures de données TypeScript
- Simuler l'exécution de tests de charge et générer des résultats réalistes
- Calculer des seuils (thresholds) de type k6 : p95 < 500ms, error_rate < 1%
- Déterminer le pass/fail des seuils à partir de résultats simulés
- Générer un rapport de test de charge complet avec statistiques

## Pré-requis

- Comprendre les concepts de base de test de charge
- Familiarité avec les métriques de latence et de débit

## Exercices

### Exercice 1 — Modéliser des scénarios k6

Créez des structures de données pour les 4 types de scénarios k6 : ramp-up, steady-state, spike, soak.

### Exercice 2 — Simuler l'exécution d'un test

Simulez l'exécution d'un test de charge en générant des résultats de requêtes basés sur un scénario donné.

### Exercice 3 — Calculer les thresholds k6

Calculez les métriques de seuil (p95 latency, error rate, throughput) à partir des résultats.

### Exercice 4 — Pass/fail des thresholds

Déterminez si les thresholds passent ou échouent en comparant les valeurs calculées aux seuils définis.

### Exercice 5 — Rapport de test de charge

Générez un rapport complet de test de charge avec statistiques résumées.

## Lancer les tests

```bash
npx tsx exercise.ts
```

## Critères de réussite

- Tous les tests passent (5/5 exercices)
- Les scénarios sont correctement modélisés
- La simulation produit des résultats cohérents
- Les thresholds sont correctement calculés
- Le rapport contient toutes les statistiques attendues
