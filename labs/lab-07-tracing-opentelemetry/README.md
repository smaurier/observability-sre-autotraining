# Lab 07 — Premiers traces OpenTelemetry

## Objectifs

- Comprendre la structure d'un Span (spanId, traceId, parentSpanId, attributs, evenements)
- Creer une Trace composee de spans parent-enfant
- Implementer la propagation de contexte (inject/extract dans les headers HTTP)
- Ajouter des attributs et des evenements a un span
- Construire une trace complete multi-services

## Exercices

Le fichier `exercise.ts` contient 5 exercices progressifs :

1. **Classe Span** — Creer une classe Span avec spanId, traceId, parentSpanId, operationName, timing, attributes, events.
2. **Classe Trace** — Creer une classe Trace qui gere les relations parent-enfant entre spans.
3. **Context Propagation** — Implementer inject/extract pour propager traceId et spanId dans des headers.
4. **Attributs et evenements** — Ajouter des attributs et des evenements a un span.
5. **Trace multi-services** — Construire une trace complete API -> Order Service -> Payment Service.

> **Note** : Tous les concepts sont implementes en TypeScript pur, sans dependance OpenTelemetry.

## Instructions

1. Ouvrez `exercise.ts`
2. Recherchez les commentaires `// TODO` et completez le code demande
3. Executez le fichier pour verifier vos reponses : `npx tsx exercise.ts`
4. Comparez avec `solution.ts` si besoin

## Criteres de reussite

Tous les tests du fichier doivent passer (affichage vert dans la console).
