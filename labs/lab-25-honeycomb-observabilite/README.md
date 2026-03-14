# Lab 25 — Honeycomb & Observabilite Haute Cardinalite

## Objectifs

- Generer des evenements realistes avec des patterns d'erreur et de performance
- Construire des requetes d'exploration (COUNT, AVG, P99, MAX) avec filtres et regroupements
- Implementer BubbleUp pour identifier les dimensions correlees aux anomalies
- Calculer des metriques SLO (SLI, error budget, burn rate) a partir d'evenements bruts
- Analyser la cardinalite des champs pour detecter les dimensions a haute cardinalite
- Creer des colonnes derivees avec des expressions IF et BUCKET

## Pre-requis

- Avoir complete les Labs 10-11 (SLOs et burn rate)
- Comprendre les concepts d'observabilite et de tracing distribue

## Exercices

### Exercice 1 — Generation d'evenements

Generez N evenements realistes avec des distributions controlees : ~10% d'erreurs, ~20% de cache miss, et des durees correlees aux erreurs.

### Exercice 2 — Query Builder

Implementez un moteur de requete simplifie supportant les fonctions d'aggregation (COUNT, AVG, P99, MAX), les filtres WHERE et le GROUP BY.

### Exercice 3 — BubbleUp

Identifiez les dimensions qui correlent le plus avec un ensemble d'evenements anormaux par rapport a une baseline.

### Exercice 4 — Calcul SLO

Calculez les metriques SLO (SLI courant, budget d'erreur restant, burn rate) a partir d'un ensemble d'evenements.

### Exercice 5 — Analyse de cardinalite

Analysez la cardinalite de chaque champ et identifiez les dimensions a haute cardinalite depassant un seuil configurable.

### Exercice 6 — Colonnes derivees

Evaluez des expressions de type IF et BUCKET pour creer des champs calcules a partir des evenements existants.

## Lancer les tests

```bash
npx tsx exercise.ts
```

## Criteres de reussite

- Tous les tests passent (6 exercices)
- Les evenements generes respectent les distributions cibles (~10% erreurs, ~20% cache miss)
- Le query builder produit des resultats corrects pour toutes les fonctions d'aggregation
- BubbleUp identifie correctement les dimensions les plus correlees
- Les metriques SLO sont mathematiquement correctes
- L'analyse de cardinalite detecte correctement les champs a haute et basse cardinalite
- Les expressions derivees IF et BUCKET produisent les valeurs attendues
