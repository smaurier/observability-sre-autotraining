# Lab 13 — Ecrire un Postmortem

## Objectifs

- Comprendre la structure d'un postmortem blameless
- Modéliser un postmortem complet avec tous les champs essentiels
- Maîtriser la technique des 5 Whys pour l'analyse de cause racine
- Construire un diagramme d'Ishikawa (fishbone) comme structure de données
- Définir des action items SMART et les valider
- Générer un document postmortem complet à partir de données d'incident

## Pré-requis

- Avoir complété le Lab 12 (Simulation d'incident)

## Exercices

### Exercice 1 — Type Postmortem

Créez un type `Postmortem` avec les champs : title, date, severity, summary, impact, timeline, rootCause, actionItems, lessonsLearned.

### Exercice 2 — Les 5 Whys

Implémentez la technique des 5 Whys : à partir d'un problème initial, construisez une chaîne de "pourquoi" jusqu'à la cause racine.

### Exercice 3 — Diagramme d'Ishikawa

Créez un diagramme d'Ishikawa comme structure de données avec 4 catégories : People, Process, Technology, Environment.

### Exercice 4 — Action Items SMART

Définissez des action items SMART (Specific, Measurable, Achievable, Relevant, Time-bound) et implémentez une validation.

### Exercice 5 — Générer un postmortem complet

À partir de données d'incident, générez un document postmortem complet au format texte.

## Lancer les tests

```bash
npx tsx exercise.ts
```

## Critères de réussite

- Tous les tests passent (5/5 exercices)
- Le type Postmortem contient tous les champs requis
- La chaîne des 5 Whys est correctement construite
- Le diagramme d'Ishikawa est structuré par catégories
- Les action items SMART sont validés correctement
- Le postmortem généré contient toutes les sections attendues
