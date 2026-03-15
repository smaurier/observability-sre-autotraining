# Lab 06 — Calculer RED & USE

## Objectifs

- Comprendre les methodologies RED (Rate, Errors, Duration) et USE (Utilization, Saturation, Errors)
- Calculer chaque metrique à partir de donnees brutes
- Calculer des percentiles (p50, p95, p99) pour la duree
- Mesurer l'utilisation et la saturation d'une ressource
- Construire un objet "dashboard" combinant toutes les metriques

## Exercices

Le fichier `exercise.ts` contient 6 exercices progressifs :

1. **Request Rate** — Calculer le taux de requêtes par seconde à partir de timestamps.
2. **Error Rate** — Calculer le taux d'erreur à partir de résultats de requêtes.
3. **Duration Percentiles** — Calculer p50, p95 et p99 à partir de durees.
4. **Utilization** — Calculer l'utilisation à partir d'echantillons d'usage.
5. **Saturation** — Calculer la saturation (profondeur de queue) à partir d'une serie temporelle.
6. **Dashboard RED+USE** — Construire un objet dashboard combinant toutes les metriques.

## Instructions

1. Ouvrez `exercise.ts`
2. Recherchez les commentaires `// TODO` et completez le code demandé
3. Executez le fichier pour vérifier vos réponses : `npx tsx exercise.ts`
4. Comparez avec `solution.ts` si besoin

## Criteres de reussite

Tous les tests du fichier doivent passer (affichage vert dans la console).
