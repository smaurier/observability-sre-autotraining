# Lab 05 — Instrumenter une API Express

## Objectifs

- Comprendre comment instrumenter une API HTTP avec des metriques
- Creer un middleware de comptage de requetes
- Mesurer la duree des requetes avec un Histogram
- Suivre les requetes en cours (in-flight) avec un Gauge
- Generer une sortie au format Prometheus /metrics
- Instrumenter les taux d'erreur par route

## Exercices

Le fichier `exercise.ts` contient 5 exercices progressifs :

1. **Middleware compteur** — Creer un middleware qui compte les requetes (Counter par route et status).
2. **Middleware duree** — Mesurer la duree de chaque requete avec un Histogram.
3. **Requetes en cours** — Suivre le nombre de requetes actuellement en cours (Gauge).
4. **Format Prometheus** — Generer le texte /metrics au format Prometheus exposition.
5. **Taux d'erreur** — Instrumenter les erreurs par route.

> **Note** : Les objets Request/Response d'Express sont simules. Aucune dependance Express reelle n'est requise.

## Instructions

1. Ouvrez `exercise.ts`
2. Recherchez les commentaires `// TODO` et completez le code demande
3. Executez le fichier pour verifier vos reponses : `npx tsx exercise.ts`
4. Comparez avec `solution.ts` si besoin

## Criteres de reussite

Tous les tests du fichier doivent passer (affichage vert dans la console).
