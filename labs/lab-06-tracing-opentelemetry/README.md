# Lab 07 — Premiers traces OpenTelemetry

## Objectifs

- Comprendre la structure d'un Span (spanId, traceId, parentSpanId, attributs, événements)
- Créer une Trace composee de spans parent-enfant
- Implementer la propagation de contexte (inject/extract dans les headers HTTP)
- Ajouter des attributs et des événements à un span
- Construire une trace complete multi-services

## Exercices

Le fichier `exercise.ts` contient 5 exercices progressifs :

1. **Classe Span** — Créer une classe Span avec spanId, traceId, parentSpanId, operationName, timing, attributes, events.
2. **Classe Trace** — Créer une classe Trace qui géré les relations parent-enfant entre spans.
3. **Context Propagation** — Implementer inject/extract pour propager traceId et spanId dans des headers.
4. **Attributs et événements** — Ajouter des attributs et des événements à un span.
5. **Trace multi-services** — Construire une trace complete API -> Order Service -> Payment Service.

> **Note** : Tous les concepts sont implementes en TypeScript pur, sans dépendance OpenTelemetry.

## Instructions

1. Ouvrez `exercise.ts`
2. Recherchez les commentaires `// TODO` et completez le code demandé
3. Executez le fichier pour vérifier vos réponses : `npx tsx exercise.ts`
4. Comparez avec `solution.ts` si besoin

## Criteres de reussite

Tous les tests du fichier doivent passer (affichage vert dans la console).
