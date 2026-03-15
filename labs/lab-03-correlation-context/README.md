# Lab 03 — Correlation IDs et contexte

## Objectifs

- Générer des identifiants de requête uniques (request IDs)
- Utiliser AsyncLocalStorage pour propager du contexte a travers les appels asynchrones
- Créer un middleware qui injecte un requestId dans le contexte
- Logger automatiquement le requestId dans chaque message
- Suivre une requête a travers plusieurs services grâce à la correlation

## Exercices

Le fichier `exercise.ts` contient 5 exercices progressifs :

1. **generateRequestId** — Implementer une fonction qui généré un UUID unique.
2. **AsyncLocalStorage context store** — Créer un store de contexte base sur AsyncLocalStorage.
3. **Middleware de correlation** — Créer un middleware qui injecte un requestId dans le contexte.
4. **Logging avec requestId** — Créer une fonction de logging qui inclut automatiquement le requestId.
5. **Correlation multi-services** — Simuler le passage d'une requête a travers plusieurs services.

## Instructions

1. Ouvrez `exercise.ts`
2. Recherchez les commentaires `// TODO` et completez le code demandé
3. Executez le fichier pour vérifier vos réponses : `npx tsx exercise.ts`
4. Comparez avec `solution.ts` si besoin

## Criteres de reussite

Tous les tests du fichier doivent passer (affichage vert dans la console).
