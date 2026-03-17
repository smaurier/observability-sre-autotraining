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
  - title: 28 Modules theoriques
    details: Du logging structure au chaos engineering, en passant par les metriques, le tracing, les SLOs, l'incident management, le continuous profiling et plus.
  - title: 26 Labs pratiques
    details: Exercices progressifs avec corrections — console.log vs structured logging, Prometheus, OpenTelemetry, Grafana, k6, et plus.
  - title: 5 Visualisations animees
    details: Diagrammes interactifs pour comprendre les trois piliers, les types de metriques, le tracing distribue, les error budgets et le cycle de vie d'un incident.
  - title: 27 Quizzes
    details: Testez vos connaissances apres chaque module avec des quiz interactifs.
---

## Plan du cours

| # | Module | Niveau | Lab | Quiz |
|---|--------|--------|-----|------|
| | **Phase 1 — Fondamentaux de l'Observabilité** | | | |
| 00 | [Prérequis et introduction](/modules/00-prerequis-et-introduction) | Débutant | — | [Quiz](/quizzes/quiz-00-prerequis.html) |
| 01 | [Pourquoi l'observabilité](/modules/01-pourquoi-observabilite) | Débutant | [Lab 01](/labs/lab-01-console-log-vs-structured/README) | [Quiz](/quizzes/quiz-01-pourquoi-observabilite.html) |
| 02 | [Logging structuré](/modules/02-logging-structure) | Débutant | [Lab 02](/labs/lab-02-pino-logger/README) | [Quiz](/quizzes/quiz-02-logging-structure.html) |
| 03 | [Niveaux de log et contexte](/modules/03-niveaux-de-log-et-contexte) | Débutant | [Lab 03](/labs/lab-03-correlation-context/README) | [Quiz](/quizzes/quiz-03-niveaux-de-log-et-contexte.html) |
| 04 | [Métriques et Prometheus](/modules/04-metriques-et-prometheus) | Débutant | [Lab 04](/labs/lab-04-metriques-et-prometheus/README) | [Quiz](/quizzes/quiz-04-metriques-et-prometheus.html) |
| | **Phase 2 — Instrumentation & Outils** | | | |
| 05 | [Méthodes RED & USE](/modules/05-red-use-methodes) | Intermédiaire | [Lab 05](/labs/lab-05-red-use-dashboard/README) | [Quiz](/quizzes/quiz-05-red-use-methodes.html) |
| 06 | [Distributed Tracing](/modules/06-distributed-tracing) | Intermédiaire | [Lab 06](/labs/lab-06-tracing-opentelemetry/README) | [Quiz](/quizzes/quiz-06-distributed-tracing.html) |
| 07 | [Sentry Error Tracking](/modules/07-sentry-error-tracking) | Intermédiaire | [Lab 07](/labs/lab-07-sentry-error-tracking/README) | [Quiz](/quizzes/quiz-07-sentry-error-tracking.html) |
| 08 | [OTel Collector Pipeline](/modules/08-otel-collector-pipeline) | Intermédiaire | [Lab 08](/labs/lab-08-otel-collector/README) | [Quiz](/quizzes/quiz-08-otel-collector-pipeline.html) |
| 09 | [Grafana Dashboards](/modules/09-grafana-dashboards) | Intermédiaire | [Lab 09](/labs/lab-09-promql-grafana/README) | [Quiz](/quizzes/quiz-09-grafana-dashboards.html) |
| | **Phase 3 — Pratiques SRE** | | | |
| 10 | [SLI, SLO, SLA](/modules/10-sli-slo-sla) | Avancé | [Lab 10](/labs/lab-10-definir-slos/README) | [Quiz](/quizzes/quiz-10-sli-slo-sla.html) |
| 11 | [Alerting Strategies](/modules/11-alerting-strategies) | Avancé | [Lab 11](/labs/lab-11-burn-rate-alerts/README) | [Quiz](/quizzes/quiz-11-alerting-strategies.html) |
| 12 | [Incidents et Postmortems](/modules/12-incidents-et-postmortems) | Avancé | [Lab 12](/labs/lab-12-incidents-et-postmortems/README) | [Quiz](/quizzes/quiz-12-incidents-et-postmortems.html) |
| 13 | [Capacity Planning](/modules/13-capacity-planning) | Avancé | [Lab 13](/labs/lab-13-load-testing-k6/README) | [Quiz](/quizzes/quiz-13-capacity-planning.html) |
| 14 | [Chaos Engineering](/modules/14-chaos-engineering) | Avancé | [Lab 14](/labs/lab-14-chaos-middleware/README) | [Quiz](/quizzes/quiz-14-chaos-engineering.html) |
| 15 | [DORA Metrics](/modules/15-dora-metrics) | Avancé | [Lab 15](/labs/lab-15-dora-tracker/README) | [Quiz](/quizzes/quiz-15-dora-metrics.html) |
| | **Phase 4 — Expert** | | | |
| 16 | [Observability as Code](/modules/16-observability-as-code) | Expert | [Lab 16](/labs/lab-16-observability-as-code/README) | [Quiz](/quizzes/quiz-16-observability-as-code.html) |
| 17 | [Production Readiness](/modules/17-production-readiness) | Expert | [Lab 17](/labs/lab-17-production-readiness/README) | [Quiz](/quizzes/quiz-17-production-readiness.html) |
| 18 | [Projet Final](/modules/18-projet-final) | Expert | [Lab 18](/labs/lab-18-projet-final/README) | [Quiz](/quizzes/quiz-18-projet-final.html) |
| | **Phase 5 — Bonus Expert** | | | |
| 19 | [Kubernetes & Container Observability](/modules/19-kubernetes-observability) | Expert | [Lab 20](/labs/lab-20-kubernetes-observability/README) | [Quiz](/quizzes/quiz-19-kubernetes-observability.html) |
| 20 | [FinOps & Cout de l'Observabilité](/modules/20-finops-observability) | Expert | [Lab 21](/labs/lab-21-finops-observability/README) | [Quiz](/quizzes/quiz-20-finops-observability.html) |
| 21 | [ELK Stack & Kibana](/modules/21-elk-stack-kibana) | Expert | — | [Quiz](/quizzes/quiz-21-elk-stack-kibana.html) |
| 22 | [RGPD & Observabilité](/modules/22-rgpd-observabilite) | Expert | [Lab 22](/labs/lab-22-rgpd-observabilite/README) | [Quiz](/quizzes/quiz-22-rgpd-observabilite.html) |
| 23 | [Observabilité Frontend](/modules/23-observabilite-frontend) | Expert | [Lab 23](/labs/lab-23-observabilite-frontend/README) | [Quiz](/quizzes/quiz-23-observabilite-frontend.html) |
| 24 | [Instrumentation Nuxt/Next](/modules/24-instrumentation-nuxt-next) | Expert | [Lab 24](/labs/lab-24-instrumentation-nuxt-next/README) | [Quiz](/quizzes/quiz-24-instrumentation-nuxt-next.html) |
| 25 | [Panorama APM](/modules/25-panorama-apm) | Expert | [Lab 25](/labs/lab-25-panorama-apm/README) | [Quiz](/quizzes/quiz-25-panorama-apm.html) |
| 26 | [Feature Flags & Observabilité](/modules/26-feature-flags-observabilite) | Expert | [Lab 26](/labs/lab-26-feature-flags-observabilite/README) | [Quiz](/quizzes/quiz-26-feature-flags-observabilite.html) |
| 27 | [Continuous Profiling](/modules/27-continuous-profiling) | Expert | — | — |

> **Liens avec d'autres cours** :
> - **06-PostgreSQL module 17** (Monitoring & Observabilité) couvre le monitoring spécifique aux bases de donnees (pg_stat, slow queries). Ce cours couvre l'observabilité applicative et infrastructure.
> - **11-Distributed Systems module 18** (Observabilité distribuee) couvre le tracing dans un contexte multi-services. Ce cours couvre les fondamentaux et la stack complete (Prometheus, Grafana, OTel).

## Annexes

| Ressource | Description |
|-----------|-------------|
| [Lab 19 — Intégration Docker](/labs/lab-19-docker-integration/README) | Lancer la stack complete (Prometheus, Grafana, Jaeger) et observer la demo-app en vrai |
| [Références & Lectures](/modules/99-references-et-lectures) | Google SRE Book, SRE Workbook, outils, communaute — guide de lecture par phase |
| [Glossaire](/glossaire) | ~65 termes techniques définis et illustres |
