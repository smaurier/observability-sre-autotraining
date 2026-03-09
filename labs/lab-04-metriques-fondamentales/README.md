# Lab 04 — Premiers pas metriques

## Objectifs

- Comprendre les trois types fondamentaux de metriques : Counter, Gauge, Histogram
- Implementer chaque type de metrique from scratch en TypeScript
- Utiliser un Counter pour compter des requetes HTTP par code de status
- Utiliser un Gauge pour suivre des connexions actives
- Utiliser un Histogram pour mesurer des durees et calculer des percentiles

## Exercices

Le fichier `exercise.ts` contient 6 exercices progressifs :

1. **Counter** — Implementer une classe Counter avec les methodes inc(), get() et reset().
2. **Gauge** — Implementer une classe Gauge avec inc(), dec(), set() et get().
3. **Histogram** — Implementer une classe Histogram avec observe(), getCount(), getSum() et getBuckets().
4. **Counter HTTP** — Utiliser le Counter pour compter des requetes par status code.
5. **Gauge connexions** — Utiliser le Gauge pour suivre les connexions actives.
6. **Histogram durees** — Utiliser le Histogram pour mesurer des durees et calculer des percentiles.

## Instructions

1. Ouvrez `exercise.ts`
2. Recherchez les commentaires `// TODO` et completez le code demande
3. Executez le fichier pour verifier vos reponses : `npx tsx exercise.ts`
4. Comparez avec `solution.ts` si besoin

## Criteres de reussite

Tous les tests du fichier doivent passer (affichage vert dans la console).
