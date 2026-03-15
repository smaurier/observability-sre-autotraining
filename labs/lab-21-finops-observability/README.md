# Lab 22 — FinOps : Cout de l'Observabilité

## Objectifs

- Auditer la cardinalite des metriques et identifier les series inutiles ou a haute cardinalite
- Implementer une stratégie de sampling des logs (limitation par pattern)
- Calculer les economies realisees grâce à différents taux de sampling
- Comparer les architectures d'observabilité en termes de cout
- Implementer un calculateur de cout pour la stack d'observabilité

## Pre-requis

- Avoir complete les Labs 10-11 (SLOs et burn rate)
- Comprendre les concepts de metriques Prometheus (series temporelles, labels)
- Comprendre les concepts de logs structures

## Exercices

### Exercice 1 — Calcul de l'explosion de cardinalite

Calculez le nombre total de series temporelles generees à partir de combinaisons de labels. Identifiez les labels qui contribuent le plus a l'explosion de cardinalite.

### Exercice 2 — Audit de metriques

Analysez un ensemble de metriques pour identifier les series inutilisees, les series a haute cardinalite, et les series avec des labels redondants.

### Exercice 3 — Stratégie de sampling des logs

Implementez une stratégie de sampling intelligent qui limite le debit de logs par pattern tout en preservant les logs d'erreur et les logs de debug en echantillonnage.

### Exercice 4 — Calcul d'economies de sampling

Calculez les economies realisees en appliquant différents taux de sampling aux logs et aux traces, en tenant compte des couts d'ingestion et de stockage.

### Exercice 5 — Calculateur de cout de la stack d'observabilité

Implementez un calculateur complet qui estime le cout mensuel d'une stack d'observabilité en fonction du volume de metriques, logs et traces.

## Lancer les tests

```bash
npx tsx exercise.ts
```

## Criteres de reussite

- Tous les tests passent (5 exercices)
- Le calcul de cardinalite est mathematiquement correct (produit des valeurs distinctes par label)
- L'audit identifie correctement les metriques problematiques
- Le sampling preserve les logs importants (erreurs) tout en reduisant le volume
- Les calculs d'economies sont coherents
- Le calculateur de cout produit des estimations realistes
