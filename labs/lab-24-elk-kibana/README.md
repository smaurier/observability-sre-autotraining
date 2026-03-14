# Lab 24 — ELK Stack & Kibana

## Objectifs

- Definir des mappings Elasticsearch optimises pour les logs applicatifs
- Parser des logs avec des patterns Grok (format Apache access log)
- Construire des requetes KQL (Kibana Query Language) a partir de filtres structures
- Configurer des politiques ILM (Index Lifecycle Management) pour gerer la retention
- Construire des aggregations Elasticsearch (terms, date_histogram, avg, percentiles)
- Dimensionner les shards et enrichir les entrees de logs avec des champs derives

## Pre-requis

- Avoir complete les Labs 01-03 (logs structures, Pino, contexte de correlation)
- Comprendre les concepts d'indexation et de recherche full-text

## Exercices

### Exercice 1 — Mapping Elasticsearch

Definissez un mapping Elasticsearch pour des logs applicatifs avec les types de champs corrects (date, keyword, text, float, integer).

### Exercice 2 — Parsing Grok

Simulez le parsing Grok pour extraire les champs d'une ligne de log Apache (IP, methode, path, status, bytes).

### Exercice 3 — Construction KQL

Convertissez des filtres structures en requetes KQL (egalite, comparaisons, existence, wildcards).

### Exercice 4 — Politique ILM

Generez une politique ILM avec les phases hot, warm, cold et delete a partir d'une configuration simplifiee.

### Exercice 5 — Aggregations Elasticsearch

Construisez des requetes d'aggregation Elasticsearch (terms, date_histogram, avg, percentiles).

### Exercice 6 — Dimensionnement des shards

Calculez le nombre optimal de shards primaires et replicas en fonction du volume de donnees.

### Exercice 7 — Enrichissement de logs

Ajoutez des champs derives a une entree de log : geo-localisation par IP, parsing du user-agent, normalisation du timestamp, detection d'erreurs.

## Lancer les tests

```bash
npx tsx exercise.ts
```

## Criteres de reussite

- Tous les tests passent (7 exercices)
- Les mappings utilisent les types Elasticsearch corrects
- Le parsing Grok extrait correctement tous les champs de l'access log Apache
- Les requetes KQL sont syntaxiquement correctes
- La politique ILM couvre toutes les phases du cycle de vie
- Le dimensionnement des shards respecte le minimum de 1 shard primaire
- L'enrichissement detecte correctement les plages IP privees et locales
