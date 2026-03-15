# Lab 23 — Sentry Error Tracking

## Objectifs

- Comprendre la configuration et l'initialisation du SDK Sentry (DSN, sample rates, environnements)
- Capturer et structurer des exceptions avec contexte (tags, user, extra)
- Implementer un systeme de breadcrumbs pour retracer le parcours utilisateur avant une erreur
- Appliquer le scrubbing de donnees sensibles (PII) avant l'envoi des evenements
- Maitriser le fingerprinting personnalise pour regrouper les erreurs intelligemment
- Configurer des regles d'alerte (frequence, nouvelle issue, regression)

## Pre-requis

- Avoir complete les Labs 10-13 (SLOs, alerting, incidents)
- Comprendre les concepts d'error tracking et de stack traces

## Exercices

### Exercice 1 — Initialisation Sentry

Validez la configuration Sentry : format du DSN, sample rates entre 0 et 1, et retournez l'etat d'initialisation.

### Exercice 2 — Capture d'exceptions

Creez un evenement Sentry structure a partir d'un objet Error JavaScript, avec support de contexte optionnel (tags, user, extra).

### Exercice 3 — Breadcrumb Trail

Implementez une classe qui enregistre les breadcrumbs (navigation, clics, requetes) avec une limite FIFO de 100 entrees.

### Exercice 4 — Scrubbing PII

Supprimez automatiquement les donnees personnelles (emails, numeros de carte bancaire) des evenements avant envoi.

### Exercice 5 — Fingerprinting personnalise

Generez des fingerprints personnalises pour regrouper les erreurs par type (timeout, validation) et endpoint.

### Exercice 6 — Strategie de sampling

Implementez la logique de sampling : toujours envoyer les erreurs critiques, adapter selon l'environnement.

### Exercice 7 — Regles d'alerte

Evaluez si un ensemble d'evenements declenche une regle d'alerte (frequence, nouvelle issue, regression).

## Lancer les tests

```bash
npx tsx exercise.ts
```

## Criteres de reussite

- Tous les tests passent (7 exercices)
- Le DSN est valide selon le format Sentry (https://...@...ingest.sentry.io/...)
- Le scrubbing PII detecte les emails et numeros de carte bancaire
- Les breadcrumbs respectent la limite FIFO de 100
- Le fingerprinting regroupe correctement les erreurs par type
- Le sampling respecte les regles par environnement et niveau de severite
