# Lab 15 — Chaos Engineering Middleware

## Objectifs

- Comprendre les principes du Chaos Engineering
- Implémenter un middleware d'injection de latence
- Implémenter un middleware d'injection d'erreurs
- Simuler l'épuisement de ressources (event loop blocking)
- Implémenter un circuit breaker avec ses 3 états (closed, open, half-open)
- Créer un runner d'expériences chaos qui mesure l'impact sur les SLOs

## Pré-requis

- Avoir complété les Labs 10-11 (SLOs et burn rate)
- Comprendre les concepts de middleware et de résilience

## Exercices

### Exercice 1 — Injection de latence

Créez un middleware qui ajoute un délai aléatoire aux requêtes, simulant une dégradation réseau.

### Exercice 2 — Injection d'erreurs

Créez un middleware qui retourne aléatoirement des erreurs 500, simulant une défaillance de service.

### Exercice 3 — Simulation d'épuisement de ressources

Simulez le blocage de l'event loop pour mesurer l'impact sur les temps de réponse.

### Exercice 4 — Circuit Breaker

Implémentez un circuit breaker avec les transitions : closed -> open -> half-open -> closed/open.

### Exercice 5 — Chaos Experiment Runner

Créez un runner qui applique des fautes chaos et mesure l'impact sur la conformité SLO.

## Lancer les tests

```bash
npx tsx exercise.ts
```

## Critères de réussite

- Tous les tests passent (5/5 exercices)
- Le middleware de latence ajoute du délai mesurable
- Le middleware d'erreur génère des codes 500
- Le circuit breaker change d'état correctement
- Le chaos runner mesure correctement l'impact sur les SLOs
