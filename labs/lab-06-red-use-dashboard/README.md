# Lab 06 — Calculer RED & USE

## Objectifs

- Comprendre les methodologies RED (Rate, Errors, Duration) et USE (Utilization, Saturation, Errors)
- Calculer chaque metrique a partir de donnees brutes
- Calculer des percentiles (p50, p95, p99) pour la duree
- Mesurer l'utilisation et la saturation d'une ressource
- Construire un objet "dashboard" combinant toutes les metriques

## Exercices

Le fichier `exercise.ts` contient 6 exercices progressifs :

1. **Request Rate** — Calculer le taux de requetes par seconde a partir de timestamps.
2. **Error Rate** — Calculer le taux d'erreur a partir de resultats de requetes.
3. **Duration Percentiles** — Calculer p50, p95 et p99 a partir de durees.
4. **Utilization** — Calculer l'utilisation a partir d'echantillons d'usage.
5. **Saturation** — Calculer la saturation (profondeur de queue) a partir d'une serie temporelle.
6. **Dashboard RED+USE** — Construire un objet dashboard combinant toutes les metriques.

## Instructions

1. Ouvrez `exercise.ts`
2. Recherchez les commentaires `// TODO` et completez le code demande
3. Executez le fichier pour verifier vos reponses : `npx tsx exercise.ts`
4. Comparez avec `solution.ts` si besoin

## Criteres de reussite

Tous les tests du fichier doivent passer (affichage vert dans la console).
