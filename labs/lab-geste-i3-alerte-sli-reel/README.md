# Lab-geste I3 — Une alerte à poser sur un SLI réel

Intervention du bloc transverse 12-AWS/15-CI-CD/16-Observabilité. **Aucune simulation** :
une vraie stack Docker (app Node + Prometheus) tourne, un vrai trafic en erreur est injecté,
et l'oracle vérifie via l'API Prometheus que l'alerte passe réellement à `firing`.

## Le geste

`app/server.mjs` expose `POST /sorties` (créer une sortie, domaine TribuZen) et `/metrics`
au format Prometheus (`http_requests_total{route,status}`). Le SLI : **taux d'erreur sur
`POST /sorties` > 10% pendant 15s**.

## Faire

1. Lis `prometheus/starter-rules/alert.yml` — elle charge sans erreur dans Prometheus, mais
   elle ne se déclenchera JAMAIS correctement. Regarde bien quel `status` elle filtre.
2. Corrige la règle (dans `starter-rules/alert.yml`).
3. Lance l'oracle : `node test/oracle.mjs` — il monte la stack avec TES règles, injecte 60%
   d'erreurs sur `/sorties` pendant 25s, et vérifie que `TauxErreurSortiesEleve` passe à
   `firing` dans Prometheus (`http://localhost:9091/api/v1/alerts`).
4. Prérequis : Docker Desktop démarré (`docker info` doit répondre).

## Ce qui est vérifié — RÉELLEMENT, pas simulé

- Une vraie image Docker buildée, un vrai serveur HTTP qui répond.
- Un vrai Prometheus qui scrape `/metrics` toutes les 5s et évalue la règle toutes les 5s.
- Un vrai trafic généré (requêtes HTTP réelles, pas des mocks).
- La requête à l'API Prometheus `/api/v1/alerts` confirme l'état `firing` — pas une
  assertion sur le fichier de règles, une assertion sur le comportement observé du système.

**Statut au 10/10/2026** : stack et oracle écrits ; `docker compose up` confirmé fonctionnel
(la config est acceptée, l'image Prometheus se pull réellement). **Le run complet de
`test/oracle.mjs` n'a PAS fini dans cette session** — le réseau du bac à sable où ce chantier
a été fait pull les images Docker Hub à ~0.2 Mo/s (vs un débit normal), largement insuffisant
pour boucler les 2 scénarios (pull + 25s de trafic + jusqu'à 40s de poll, deux fois) dans le
temps disponible. **Reste à faire pour marquer ce lab GO** : sur un poste normal,
`cd 16-observability-sre/labs/lab-geste-i3-alerte-sli-reel && node test/oracle.mjs` — le
script est autonome, il monte/démonte la stack lui-même pour les deux scénarios. Si un
`docker compose -p labi3` est encore en cours de pull au moment où tu lis ceci (lancé en
arrière-plan pendant cette session), `docker compose -p labi3 down -v` avant de relancer
l'oracle pour repartir propre.

## Ce qui N'EST PAS vérifié ici

- Pas de vrai Grafana dashboard branché sur cette alerte (le dashboard réel est dans
  `16-observability-sre/config/grafana/`, cours de base — à connecter en pratique).
- Pas d'intégration Alertmanager → PagerDuty/Slack réelle (configuration seulement, pas de
  webhook réel déclenché).
- Aucune dépendance AWS ici — ce geste tourne entièrement en local, c'est un des 4 I qui
  N'ATTEND PAS de compte AWS pour être pratiqué.

## TribuZen

→ Le SLI `taux d'erreur POST /sorties` est le même geste métier que le circuit breaker du
cours 17-distributed-systems (déjà complet) — l'alerte est la détection, le breaker est la
protection. Les deux sur la même route réelle.
