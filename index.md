---
layout: home

hero:
  name: "Observability & SRE Course"
  text: "Formation complete Observabilite & SRE"
  tagline: "Du logging structure au chaos engineering — Maitrisez l'ingenierie de production de A a Z (debutant → expert)"
  actions:
    - theme: brand
      text: Commencer le cours
      link: /modules/00-prerequis-et-introduction
    - theme: alt
      text: Voir les labs
      link: /labs/lab-01-console-log-vs-structured/README

features:
  - title: 22 Modules theoriques
    details: Du logging structure au chaos engineering, en passant par les metriques, le tracing, les SLOs et l'incident management.
  - title: 21 Labs pratiques
    details: Exercices progressifs avec corrections — console.log vs structured logging, Prometheus, OpenTelemetry, Grafana, k6, et plus.
  - title: 5 Visualisations animees
    details: Diagrammes interactifs pour comprendre les trois piliers, les types de metriques, le tracing distribue, les error budgets et le cycle de vie d'un incident.
  - title: 22 Quizzes
    details: Testez vos connaissances apres chaque module avec des quiz interactifs.
---

## Plan du cours

| # | Module | Niveau | Lab | Quiz |
|---|--------|--------|-----|------|
| | **Phase 1 — Fondamentaux de l'Observabilite** | | | |
| 00 | [Prerequis et introduction](/modules/00-prerequis-et-introduction) | Debutant | — | [Quiz](/quizzes/quiz-00-prerequis.html) |
| 01 | [Pourquoi l'observabilite](/modules/01-pourquoi-observabilite) | Debutant | [Lab 01](/labs/lab-01-console-log-vs-structured/README) | [Quiz](/quizzes/quiz-01-pourquoi-observabilite.html) |
| 02 | [Logging structure](/modules/02-logging-structure) | Debutant | [Lab 02](/labs/lab-02-pino-logger/README) | [Quiz](/quizzes/quiz-02-logging-structure.html) |
| 03 | [Niveaux de log et contexte](/modules/03-niveaux-de-log-et-contexte) | Debutant | [Lab 03](/labs/lab-03-correlation-context/README) | [Quiz](/quizzes/quiz-03-niveaux-de-log-et-contexte.html) |
| 04 | [Introduction aux metriques](/modules/04-introduction-metriques) | Debutant | [Lab 04](/labs/lab-04-metriques-fondamentales/README) | [Quiz](/quizzes/quiz-04-introduction-metriques.html) |
| | **Phase 2 — Instrumentation & Outils** | | | |
| 05 | [Metriques Prometheus](/modules/05-metriques-prometheus) | Intermediaire | [Lab 05](/labs/lab-05-instrumenter-express/README) | [Quiz](/quizzes/quiz-05-metriques-prometheus.html) |
| 06 | [Methodes RED & USE](/modules/06-red-use-methodes) | Intermediaire | [Lab 06](/labs/lab-06-red-use-dashboard/README) | [Quiz](/quizzes/quiz-06-red-use-methodes.html) |
| 07 | [Distributed Tracing](/modules/07-distributed-tracing) | Intermediaire | [Lab 07](/labs/lab-07-tracing-opentelemetry/README) | [Quiz](/quizzes/quiz-07-distributed-tracing.html) |
| 08 | [OTel Collector Pipeline](/modules/08-otel-collector-pipeline) | Intermediaire | [Lab 08](/labs/lab-08-otel-collector/README) | [Quiz](/quizzes/quiz-08-otel-collector-pipeline.html) |
| 09 | [Grafana Dashboards](/modules/09-grafana-dashboards) | Intermediaire | [Lab 09](/labs/lab-09-promql-grafana/README) | [Quiz](/quizzes/quiz-09-grafana-dashboards.html) |
| | **Phase 3 — Pratiques SRE** | | | |
| 10 | [SLI, SLO, SLA](/modules/10-sli-slo-sla) | Avance | [Lab 10](/labs/lab-10-definir-slos/README) | [Quiz](/quizzes/quiz-10-sli-slo-sla.html) |
| 11 | [Alerting Strategies](/modules/11-alerting-strategies) | Avance | [Lab 11](/labs/lab-11-burn-rate-alerts/README) | [Quiz](/quizzes/quiz-11-alerting-strategies.html) |
| 12 | [Incident Management](/modules/12-incident-management) | Avance | [Lab 12](/labs/lab-12-incident-simulation/README) | [Quiz](/quizzes/quiz-12-incident-management.html) |
| 13 | [Postmortems](/modules/13-postmortems) | Avance | [Lab 13](/labs/lab-13-postmortem/README) | [Quiz](/quizzes/quiz-13-postmortems.html) |
| 14 | [Capacity Planning](/modules/14-capacity-planning) | Avance | [Lab 14](/labs/lab-14-load-testing-k6/README) | [Quiz](/quizzes/quiz-14-capacity-planning.html) |
| | **Phase 4 — Expert** | | | |
| 15 | [Chaos Engineering](/modules/15-chaos-engineering) | Expert | [Lab 15](/labs/lab-15-chaos-middleware/README) | [Quiz](/quizzes/quiz-15-chaos-engineering.html) |
| 16 | [DORA Metrics](/modules/16-dora-metrics) | Expert | [Lab 16](/labs/lab-16-dora-tracker/README) | [Quiz](/quizzes/quiz-16-dora-metrics.html) |
| 17 | [Observability as Code](/modules/17-observability-as-code) | Expert | [Lab 17](/labs/lab-17-observability-as-code/README) | [Quiz](/quizzes/quiz-17-observability-as-code.html) |
| 18 | [Production Readiness](/modules/18-production-readiness) | Expert | [Lab 18](/labs/lab-18-production-readiness/README) | [Quiz](/quizzes/quiz-18-production-readiness.html) |
| 19 | [Projet Final](/modules/19-projet-final) | Expert | [Lab 19](/labs/lab-19-projet-final/README) | [Quiz](/quizzes/quiz-19-projet-final.html) |
| | **Phase 5 — Bonus Expert** | | | |
| 20 | [Kubernetes & Container Observability](/modules/20-kubernetes-observability) | Expert | [Lab 21](/labs/lab-21-kubernetes-observability/README) | [Quiz](/quizzes/quiz-20-kubernetes-observability.html) |
| 21 | [FinOps — Cout de l'Observabilite](/modules/21-finops-observability) | Expert | [Lab 22](/labs/lab-22-finops-observability/README) | [Quiz](/quizzes/quiz-21-finops-observability.html) |

## Annexes

| Ressource | Description |
|-----------|-------------|
| [Lab 20 — Integration Docker](/labs/lab-20-docker-integration/README) | Lancer la stack complete (Prometheus, Grafana, Jaeger) et observer la demo-app en vrai |
| [References & Lectures](/modules/99-references-et-lectures) | Google SRE Book, SRE Workbook, outils, communaute — guide de lecture par phase |
| [Glossaire](/glossaire) | ~65 termes techniques definis et illustres |
