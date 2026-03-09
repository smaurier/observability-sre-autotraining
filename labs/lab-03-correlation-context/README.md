# Lab 03 — Correlation IDs et contexte

## Objectifs

- Generer des identifiants de requete uniques (request IDs)
- Utiliser AsyncLocalStorage pour propager du contexte a travers les appels asynchrones
- Creer un middleware qui injecte un requestId dans le contexte
- Logger automatiquement le requestId dans chaque message
- Suivre une requete a travers plusieurs services grace a la correlation

## Exercices

Le fichier `exercise.ts` contient 5 exercices progressifs :

1. **generateRequestId** — Implementer une fonction qui genere un UUID unique.
2. **AsyncLocalStorage context store** — Creer un store de contexte base sur AsyncLocalStorage.
3. **Middleware de correlation** — Creer un middleware qui injecte un requestId dans le contexte.
4. **Logging avec requestId** — Creer une fonction de logging qui inclut automatiquement le requestId.
5. **Correlation multi-services** — Simuler le passage d'une requete a travers plusieurs services.

## Instructions

1. Ouvrez `exercise.ts`
2. Recherchez les commentaires `// TODO` et completez le code demande
3. Executez le fichier pour verifier vos reponses : `npx tsx exercise.ts`
4. Comparez avec `solution.ts` si besoin

## Criteres de reussite

Tous les tests du fichier doivent passer (affichage vert dans la console).
