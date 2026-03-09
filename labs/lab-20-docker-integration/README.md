# Lab 20 — Integration Docker : la stack d'observabilite en vrai

## Objectifs

- Lancer la stack d'observabilite complete avec Docker Compose
- Verifier que Prometheus scrape la demo-app
- Explorer les metriques dans Prometheus UI
- Construire un dashboard RED dans Grafana
- Envoyer du trafic et observer les metriques en temps reel
- Visualiser des traces dans Jaeger
- Connecter Grafana a Jaeger pour le drill-down log→trace

## Prerequis

- Docker et Docker Compose installes
- Les modules 00 a 09 completes
- La demo-app fonctionnelle (`cd demo-app && npm install`)

## Instructions

Suivez le guide pas a pas dans `exercise.md`.

## Criteres de reussite

- [ ] `docker compose up` demarre sans erreur
- [ ] `http://localhost:9090/targets` montre la demo-app comme target UP
- [ ] `http://localhost:3001` (Grafana) affiche un dashboard avec au moins 3 panels
- [ ] `http://localhost:16686` (Jaeger) montre des traces de la demo-app
- [ ] Vous avez envoye 100+ requetes et observe les metriques changer en temps reel
