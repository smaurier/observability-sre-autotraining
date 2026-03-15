# Lab 04 - Metriques et Prometheus

## Objectifs

- Comprendre les trois types fondamentaux de metriques : Counter, Gauge, Histogram
- Implementer chaque type de metrique from scratch en TypeScript
- Creer un middleware de comptage de requetes HTTP
- Mesurer la duree des requetes avec un Histogram
- Suivre les requetes en cours (in-flight) avec un Gauge
- Generer une sortie au format Prometheus /metrics

## Exercices

1. **Counter** - Implementer une classe Counter avec inc(), get() et reset().
2. **Gauge** - Implementer une classe Gauge avec inc(), dec(), set() et get().
3. **Histogram** - Implementer observe(), getCount(), getSum() et getBuckets().
4. **Counter HTTP** - Compter des requetes par status code.
5. **Gauge connexions** - Suivre les connexions actives.
6. **Middleware compteur** - Counter par route et status.
7. **Middleware duree** - Mesurer la duree avec un Histogram.
8. **Format Prometheus** - Generer le texte /metrics.

## Instructions

1. Ouvrez exercise.ts
2. Recherchez les commentaires // TODO
3. Executez : npx tsx exercise.ts
4. Comparez avec solution.ts si besoin
