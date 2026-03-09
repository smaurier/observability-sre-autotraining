# Lab 01 — Console.log vs Logging structure

## Objectifs

- Comprendre pourquoi console.log n'est pas adapte a la production
- Creer des logs structures avec des champs standardises
- Parser et extraire des informations a partir de logs JSON
- Distinguer un log structure d'un log non structure
- Formater des logs en JSON pour une ingestion automatisee
- Filtrer des logs par niveau de severite

## Exercices

Le fichier `exercise.ts` contient 6 exercices progressifs :

1. **Console.log non parseable** — Observer que la sortie de console.log n'est pas facilement exploitable par des outils.
2. **Objet log structure** — Creer un objet log avec timestamp, level, message et context.
3. **Parser un log JSON** — Extraire les champs d'une ligne de log JSON.
4. **Detecter le format** — Determiner si une ligne de log est structuree ou non.
5. **Formater en JSON** — Creer une fonction qui transforme des logs structures en chaines JSON.
6. **Filtrer par niveau** — Filtrer un tableau de logs par niveau de severite.

## Instructions

1. Ouvrez `exercise.ts`
2. Recherchez les commentaires `// TODO` et completez le code demande
3. Executez le fichier pour verifier vos reponses : `npx tsx exercise.ts`
4. Comparez avec `solution.ts` si besoin

## Criteres de reussite

Tous les tests du fichier doivent passer (affichage vert dans la console).
