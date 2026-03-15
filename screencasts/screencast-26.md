# Screencast 26 — Feature Flags et Observabilité

> **Durée** : ~15 min
> **Module** : [Module 26 — Feature Flags et Observabilité](/modules/26-feature-flags-observabilite)

## Informations

- **Format** : screencast (enregistrement d'écran + voix)
- **Outils** : VS Code, terminal, navigateur (Unleash UI, Grafana)

## Script

### [00:00] Introduction

> Bienvenue dans ce screencast sur les feature flags et leur lien avec l'observabilité. Les feature flags permettent d'activer ou désactiver des fonctionnalités sans redéployer. Mais sans monitoring, on déploie à l'aveugle. Aujourd'hui on va installer Unleash, configurer un rollout progressif, et mesurer l'impact de chaque flag dans Grafana.

### [01:30] Pourquoi lier feature flags et observabilité

> Un feature flag sans métriques, c'est comme un déploiement canary sans health check. On doit pouvoir répondre à : "est-ce que la nouvelle fonctionnalité dégrade le taux d'erreur ?", "est-ce que la latence augmente pour les utilisateurs exposés ?", "est-ce que le taux de conversion change ?". C'est l'observabilité qui répond à ces questions.

### [03:00] Installation d'Unleash avec Docker

> On va déployer Unleash en local avec Docker Compose. Unleash est open source, auto-hébergeable, et fournit une API REST pour évaluer les flags. Le setup inclut Unleash server et une base PostgreSQL.

**Action** : créer le fichier `docker-compose.yml` avec les services `unleash` et `postgres`, exécuter `docker compose up -d`

### [05:00] Création d'un feature flag

> Dans l'UI Unleash, on crée un nouveau flag `new-checkout-flow`. On configure la stratégie de rollout progressif : on commence à 10% des utilisateurs, avec un stickiness basé sur le `userId` pour que chaque utilisateur ait une expérience cohérente.

**Action** : dans Unleash UI, créer le toggle `new-checkout-flow`, ajouter la stratégie "Gradual rollout" à 10%, configurer le stickiness sur `userId`

### [07:00] Intégration dans le code Node.js

> On installe le SDK Unleash pour Node.js et on l'intègre dans notre application Express. Le SDK maintient un cache local des flags et se synchronise en arrière-plan toutes les 15 secondes. L'évaluation des flags est donc locale et ultra-rapide, sans appel réseau bloquant.

**Action** : installer `unleash-client`, initialiser le client avec l'URL et l'API token, utiliser `unleash.isEnabled('new-checkout-flow', { userId })` dans le handler de route

### [09:00] Émission de métriques par segment

> Voici la clé : on émet des métriques Prometheus différenciées selon l'état du flag. On ajoute un label `flag_new_checkout` avec la valeur `enabled` ou `disabled` sur nos métriques de latence et d'erreur. Cela permet de comparer les deux populations dans Grafana.

**Action** : dans le middleware Express, ajouter le label au histogram `http_request_duration_seconds` et au counter `http_errors_total`

### [10:30] Dashboard Grafana comparatif

> On crée un dashboard Grafana qui compare côte à côte les métriques des deux populations. Le panneau du haut montre le p95 de latence pour `flag=enabled` vs `flag=disabled`. Le panneau du bas montre le taux d'erreur. Si la nouvelle feature dégrade une métrique, on le voit immédiatement.

**Action** : dans Grafana, créer deux panneaux avec les requêtes PromQL filtrées par label `flag_new_checkout`, montrer la comparaison visuelle

### [12:00] Rollout progressif et alertes

> On augmente le rollout de 10% à 50%. Dans Grafana, on configure une alerte : si le taux d'erreur du segment `flag=enabled` dépasse 2x celui du segment `flag=disabled`, on reçoit une notification et on peut immédiatement désactiver le flag dans Unleash. C'est le kill switch.

**Action** : dans Unleash, passer le rollout à 50%. Dans Grafana Alerting, créer une alerte basée sur le ratio d'erreur entre les deux segments

### [13:30] Automatisation du rollback

> Pour aller plus loin, on peut automatiser le rollback. Via l'API REST d'Unleash, un webhook Grafana peut désactiver le flag automatiquement quand l'alerte se déclenche. On fait la démo : on simule une dégradation, l'alerte se déclenche, le webhook appelle l'API Unleash, et le flag est désactivé en quelques secondes.

**Action** : configurer un contact point Grafana de type webhook qui appelle `PATCH /api/admin/projects/default/features/new-checkout-flow/environments/production` avec `{ "enabled": false }`

### [14:30] Récapitulatif

> En résumé : les feature flags et l'observabilité sont complémentaires. Unleash gère l'activation progressive, les métriques segmentées par flag permettent de comparer les populations, et les alertes Grafana servent de filet de sécurité. Ce pattern — deploy, measure, decide — est au coeur du continuous delivery moderne. Vous avez maintenant tous les outils pour déployer en confiance.
