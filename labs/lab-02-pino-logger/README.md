# Lab 02 — Logger production-ready Pino

## Objectifs

- Comprendre l'API d'un logger de production (Pino)
- Creer un logger avec differents niveaux de severite
- Utiliser des child loggers pour ajouter du contexte
- Implementer des serializers pour masquer les donnees sensibles
- Comprendre les redactors pour proteger les PII
- Logger des erreurs avec stack trace

## Exercices

Le fichier `exercise.ts` contient 6 exercices progressifs :

1. **Logger basique** — Creer un faux Pino logger et loguer a differents niveaux (info, warn, error).
2. **Child logger** — Creer un child logger avec des bindings (service, version).
3. **Custom serializer** — Implementer un serializer qui supprime les mots de passe des objets user.
4. **Redactor** — Implementer un redactor qui masque les numeros de carte de credit.
5. **Transports** — Creer un logger avec differents transports (stdout simulee vs fichier simule).
6. **Erreur avec stack trace** — Logger une erreur avec sa stack trace via le serializer d'erreurs.

> **Note** : Les exercices simulent le comportement de Pino avec des objets TypeScript. Aucune dependance externe n'est requise.

## Instructions

1. Ouvrez `exercise.ts`
2. Recherchez les commentaires `// TODO` et completez le code demande
3. Executez le fichier pour verifier vos reponses : `npx tsx exercise.ts`
4. Comparez avec `solution.ts` si besoin

## Criteres de reussite

Tous les tests du fichier doivent passer (affichage vert dans la console).
