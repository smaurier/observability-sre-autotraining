import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Observability & SRE Course',
  description:
    'Formation complete Observabilite & SRE : logging, metriques, tracing, SLOs, incidents, chaos engineering (debutant → expert)',
  lang: 'fr-FR',
  srcDir: '.',

  themeConfig: {
    nav: [
      { text: 'Modules', link: '/modules/00-prerequis-et-introduction' },
      { text: 'Labs', link: '/labs/lab-01-console-log-vs-structured/README' },
      { text: 'Quizzes', link: '/quizzes/' },
      { text: 'Visualisations', link: '/visualizations/' },
      { text: 'Glossaire', link: '/glossaire' },
      { text: 'References', link: '/modules/99-references-et-lectures' },
    ],

    sidebar: {
      '/modules/': [
        {
          text: 'Phase 1 — Fondamentaux de l\'Observabilite',
          collapsed: false,
          items: [
            { text: '00 - Prerequis et introduction', link: '/modules/00-prerequis-et-introduction' },
            { text: '01 - Pourquoi l\'observabilite', link: '/modules/01-pourquoi-observabilite' },
            { text: '02 - Logging structure', link: '/modules/02-logging-structure' },
            { text: '03 - Niveaux de log et contexte', link: '/modules/03-niveaux-de-log-et-contexte' },
            { text: '04 - Introduction aux metriques', link: '/modules/04-introduction-metriques' },
          ],
        },
        {
          text: 'Mise en pratique',
          collapsed: false,
          items: [
            { text: 'Lab Docker — Lancer la stack', link: '/labs/lab-20-docker-integration/README' },
          ],
        },
        {
          text: 'Phase 2 — Instrumentation & Outils',
          collapsed: false,
          items: [
            { text: '05 - Metriques Prometheus', link: '/modules/05-metriques-prometheus' },
            { text: '06 - Methodes RED & USE', link: '/modules/06-red-use-methodes' },
            { text: '07 - Distributed Tracing', link: '/modules/07-distributed-tracing' },
            { text: '08 - OTel Collector Pipeline', link: '/modules/08-otel-collector-pipeline' },
            { text: '09 - Grafana Dashboards', link: '/modules/09-grafana-dashboards' },
          ],
        },
        {
          text: 'Phase 3 — Pratiques SRE',
          collapsed: false,
          items: [
            { text: '10 - SLI, SLO, SLA', link: '/modules/10-sli-slo-sla' },
            { text: '11 - Alerting Strategies', link: '/modules/11-alerting-strategies' },
            { text: '12 - Incident Management', link: '/modules/12-incident-management' },
            { text: '13 - Postmortems', link: '/modules/13-postmortems' },
            { text: '14 - Capacity Planning', link: '/modules/14-capacity-planning' },
          ],
        },
        {
          text: 'Phase 4 — Expert',
          collapsed: false,
          items: [
            { text: '15 - Chaos Engineering', link: '/modules/15-chaos-engineering' },
            { text: '16 - DORA Metrics', link: '/modules/16-dora-metrics' },
            { text: '17 - Observability as Code', link: '/modules/17-observability-as-code' },
            { text: '18 - Production Readiness', link: '/modules/18-production-readiness' },
            { text: '19 - Projet Final', link: '/modules/19-projet-final' },
          ],
        },
        {
          text: 'Phase 5 — Bonus Expert',
          collapsed: false,
          items: [
            { text: '20 - Kubernetes & Container Observability', link: '/modules/20-kubernetes-observability' },
            { text: '21 - FinOps — Cout de l\'Observabilite', link: '/modules/21-finops-observability' },
          ],
        },
        {
          text: 'Annexes',
          collapsed: false,
          items: [
            { text: 'References & Lectures', link: '/modules/99-references-et-lectures' },
          ],
        },
      ],

      '/quizzes/': [
        {
          text: 'Quizzes',
          items: [
            { text: 'Quiz 00 - Prerequis', link: '/quizzes/quiz-00-prerequis' },
            { text: 'Quiz 01 - Pourquoi l\'observabilite', link: '/quizzes/quiz-01-pourquoi-observabilite' },
            { text: 'Quiz 02 - Logging structure', link: '/quizzes/quiz-02-logging-structure' },
            { text: 'Quiz 03 - Niveaux de log et contexte', link: '/quizzes/quiz-03-niveaux-de-log-et-contexte' },
            { text: 'Quiz 04 - Introduction metriques', link: '/quizzes/quiz-04-introduction-metriques' },
            { text: 'Quiz 05 - Metriques Prometheus', link: '/quizzes/quiz-05-metriques-prometheus' },
            { text: 'Quiz 06 - RED & USE', link: '/quizzes/quiz-06-red-use-methodes' },
            { text: 'Quiz 07 - Distributed Tracing', link: '/quizzes/quiz-07-distributed-tracing' },
            { text: 'Quiz 08 - OTel Collector', link: '/quizzes/quiz-08-otel-collector-pipeline' },
            { text: 'Quiz 09 - Grafana Dashboards', link: '/quizzes/quiz-09-grafana-dashboards' },
            { text: 'Quiz 10 - SLI, SLO, SLA', link: '/quizzes/quiz-10-sli-slo-sla' },
            { text: 'Quiz 11 - Alerting Strategies', link: '/quizzes/quiz-11-alerting-strategies' },
            { text: 'Quiz 12 - Incident Management', link: '/quizzes/quiz-12-incident-management' },
            { text: 'Quiz 13 - Postmortems', link: '/quizzes/quiz-13-postmortems' },
            { text: 'Quiz 14 - Capacity Planning', link: '/quizzes/quiz-14-capacity-planning' },
            { text: 'Quiz 15 - Chaos Engineering', link: '/quizzes/quiz-15-chaos-engineering' },
            { text: 'Quiz 16 - DORA Metrics', link: '/quizzes/quiz-16-dora-metrics' },
            { text: 'Quiz 17 - Observability as Code', link: '/quizzes/quiz-17-observability-as-code' },
            { text: 'Quiz 18 - Production Readiness', link: '/quizzes/quiz-18-production-readiness' },
            { text: 'Quiz 19 - Projet Final', link: '/quizzes/quiz-19-projet-final' },
            { text: 'Quiz 20 - Kubernetes Observability', link: '/quizzes/quiz-20-kubernetes-observability' },
            { text: 'Quiz 21 - FinOps Observability', link: '/quizzes/quiz-21-finops-observability' },
          ],
        },
      ],

      '/visualizations/': [
        {
          text: 'Visualisations',
          items: [
            { text: 'Three Pillars', link: '/visualizations/three-pillars' },
            { text: 'Metric Types', link: '/visualizations/metric-types' },
            { text: 'Distributed Trace', link: '/visualizations/distributed-trace' },
            { text: 'SLO Error Budget', link: '/visualizations/slo-error-budget' },
            { text: 'Incident Lifecycle', link: '/visualizations/incident-lifecycle' },
          ],
        },
      ],
    },

    search: {
      provider: 'local',
    },

    outline: {
      level: [2, 3],
      label: 'Sur cette page',
    },

    docFooter: {
      prev: 'Page precedente',
      next: 'Page suivante',
    },
  },
});
