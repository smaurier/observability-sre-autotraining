# Screencast 25 — Panorama APM

> **Durée** : ~15 min
> **Module** : [Module 25 — Panorama APM](/modules/25-panorama-apm)

## Informations

- **Format** : screencast (enregistrement d'écran + voix)
- **Outils** : navigateur (Datadog, Grafana Cloud), VS Code, terminal

## Script

### [00:00] Introduction

> Bienvenue dans ce tour d'horizon des solutions APM. On va comparer trois approches : Datadog en tant que SaaS commercial leader, Grafana Cloud en tant qu'offre cloud basée sur l'open source, et une stack self-hosted avec Prometheus, Grafana, Loki, Tempo et l'OTel Collector. L'objectif est de comprendre les forces de chacune pour faire un choix éclairé.

### [02:00] Datadog — Tour du dashboard

> Datadog est la référence du marché APM. On va explorer l'interface : le Service Map montre les dépendances entre services, la Trace page permet de naviguer dans les traces distribuées avec le flame graph, et les dashboards combinent métriques, logs et traces dans une vue unifiée.

**Action** : naviguer dans Datadog > APM > Service Map, cliquer sur un service, explorer une trace avec le flame graph, montrer la corrélation logs-traces

### [04:30] Datadog — Points forts et coûts

> Les points forts de Datadog : corrélation automatique entre les trois piliers (métriques, logs, traces), détection d'anomalies par ML, profilage continu, et une intégration native avec 750+ technologies. Le revers : le pricing est par host et par volume, ce qui peut devenir très coûteux à l'échelle. Comptez environ 30 $/host/mois pour l'APM seul.

### [06:00] Grafana Cloud — Tour du dashboard

> Grafana Cloud offre une expérience similaire basée sur les projets open source de Grafana Labs. On retrouve Grafana pour les dashboards, Mimir pour les métriques (compatible Prometheus), Loki pour les logs, et Tempo pour les traces. L'avantage : les mêmes outils qu'en self-hosted, avec la gestion opérationnelle en moins.

**Action** : naviguer dans Grafana Cloud > Explore > sélectionner la data source Tempo, rechercher une trace, montrer le passage Tempo → Loki pour voir les logs corrélés

### [08:30] Grafana Cloud — Points forts et coûts

> Grafana Cloud propose un free tier généreux : 50 Go de logs, 10 000 séries métriques et 50 Go de traces par mois. Au-delà, le pricing est à l'usage, ce qui est souvent plus avantageux que Datadog pour les petites et moyennes équipes. L'écosystème est 100% compatible OpenTelemetry.

### [09:30] Stack self-hosted — Architecture

> Pour les organisations qui veulent un contrôle total et minimiser les coûts, la stack self-hosted est une option sérieuse. On déploie Prometheus (métriques), Grafana (dashboards), Loki (logs), Tempo (traces) et l'OTel Collector (ingestion). Tout communique via des protocoles ouverts.

**Action** : afficher le fichier `docker-compose.yml` avec tous les services de la stack, montrer la configuration de l'OTel Collector qui route les signaux vers les bons backends

### [11:30] Stack self-hosted — Avantages et défis

> L'avantage principal : zéro coût de licence, les données restent chez vous (conformité RGPD), et la flexibilité est totale. Les défis : il faut gérer la haute disponibilité, le scaling, les mises à jour, et le stockage long terme. Comptez au minimum un demi-ETP SRE pour maintenir cette stack.

### [12:30] Tableau comparatif

> Résumons dans un tableau. En termes de coût de démarrage : self-hosted gagne. En facilité de mise en place : Datadog gagne. En flexibilité : self-hosted gagne. En corrélation automatique : Datadog et Grafana Cloud sont au coude à coude. En conformité RGPD : self-hosted est le choix naturel.

**Action** : afficher un tableau comparatif dans un slide avec les critères : coût, setup, flexibilité, corrélation, RGPD, support, scaling

### [14:00] Comment choisir

> Mon conseil : si vous êtes une startup ou une petite équipe sans SRE dédié, commencez par Grafana Cloud free tier. Si vous avez du budget et voulez une solution clé en main, Datadog est excellent. Si vous avez des contraintes de souveraineté des données ou une équipe SRE mature, partez sur du self-hosted. Et surtout, instrumentez en OpenTelemetry dès le départ : cela vous permet de changer de backend sans toucher au code applicatif.

### [15:00] Récapitulatif

> En résumé : il n'y a pas de solution universelle. Le choix dépend de votre contexte — budget, taille d'équipe, contraintes réglementaires. L'essentiel est d'instrumenter avec OpenTelemetry pour garder la portabilité. Dans le prochain screencast, on abordera les feature flags et leur lien avec l'observabilité.
