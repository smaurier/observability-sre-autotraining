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
          text: 'Phase 1 — Fondamentaux',
          collapsed: false,
          items: [
            { text: '00 - Prerequis et introduction', link: '/modules/00-prerequis-et-introduction' },
            { text: '01 - Pourquoi l\'observabilite', link: '/modules/01-pourquoi-observabilite' },
            { text: '02 - Logging structure', link: '/modules/02-logging-structure' },
            { text: '03 - Niveaux de log et contexte', link: '/modules/03-niveaux-de-log-et-contexte' },
            { text: '04 - Metriques et Prometheus', link: '/modules/04-metriques-et-prometheus' },
          ],
        },
        {
          text: 'Phase 2 — Instrumentation & Outils',
          collapsed: false,
          items: [
            { text: '05 - Methodes RED & USE', link: '/modules/05-red-use-methodes' },
            { text: '06 - Distributed Tracing', link: '/modules/06-distributed-tracing' },
            { text: '07 - Sentry Error Tracking', link: '/modules/07-sentry-error-tracking' },
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
            { text: '12 - Incidents et Postmortems', link: '/modules/12-incidents-et-postmortems' },
            { text: '13 - Capacity Planning', link: '/modules/13-capacity-planning' },
          ],
        },
        {
          text: 'Phase 4 — Expert',
          collapsed: false,
          items: [
            { text: '14 - Chaos Engineering', link: '/modules/14-chaos-engineering' },
            { text: '15 - DORA Metrics', link: '/modules/15-dora-metrics' },
            { text: '16 - Observability as Code', link: '/modules/16-observability-as-code' },
            { text: '17 - Production Readiness', link: '/modules/17-production-readiness' },
            { text: '18 - Projet Final', link: '/modules/18-projet-final' },
          ],
        },
        {
          text: 'Phase 5 — Bonus Expert',
          collapsed: true,
          items: [
            { text: '19 - Kubernetes Observability', link: '/modules/19-kubernetes-observability' },
            { text: '20 - FinOps Observability', link: '/modules/20-finops-observability' },
            { text: '21 - ELK Stack & Kibana', link: '/modules/21-elk-stack-kibana' },
            { text: '22 - RGPD & Observabilite', link: '/modules/22-rgpd-observabilite' },
          ],
        },
        {
          text: 'Phase 6 — Frontend & APM',
          collapsed: true,
          items: [
            { text: '23 - Observabilite Frontend', link: '/modules/23-observabilite-frontend' },
            { text: '24 - Instrumentation Nuxt/Next', link: '/modules/24-instrumentation-nuxt-next' },
            { text: '25 - Panorama APM', link: '/modules/25-panorama-apm' },
            { text: '26 - Feature Flags et Observabilite', link: '/modules/26-feature-flags-observabilite' },
            { text: '27 - Continuous Profiling', link: '/modules/27-continuous-profiling' },
          ],
        },
        {
          text: 'Annexes',
          collapsed: true,
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
            { text: 'Quiz 04 - Metriques et Prometheus', link: '/quizzes/quiz-04-metriques-et-prometheus' },
            { text: 'Quiz 05 - RED & USE', link: '/quizzes/quiz-05-red-use-methodes' },
            { text: 'Quiz 06 - Distributed Tracing', link: '/quizzes/quiz-06-distributed-tracing' },
            { text: 'Quiz 07 - Sentry Error Tracking', link: '/quizzes/quiz-07-sentry-error-tracking' },
            { text: 'Quiz 08 - OTel Collector', link: '/quizzes/quiz-08-otel-collector-pipeline' },
            { text: 'Quiz 09 - Grafana Dashboards', link: '/quizzes/quiz-09-grafana-dashboards' },
            { text: 'Quiz 10 - SLI, SLO, SLA', link: '/quizzes/quiz-10-sli-slo-sla' },
            { text: 'Quiz 11 - Alerting Strategies', link: '/quizzes/quiz-11-alerting-strategies' },
            { text: 'Quiz 12 - Incidents et Postmortems', link: '/quizzes/quiz-12-incidents-et-postmortems' },
            { text: 'Quiz 13 - Capacity Planning', link: '/quizzes/quiz-13-capacity-planning' },
            { text: 'Quiz 14 - Chaos Engineering', link: '/quizzes/quiz-14-chaos-engineering' },
            { text: 'Quiz 15 - DORA Metrics', link: '/quizzes/quiz-15-dora-metrics' },
            { text: 'Quiz 16 - Observability as Code', link: '/quizzes/quiz-16-observability-as-code' },
            { text: 'Quiz 17 - Production Readiness', link: '/quizzes/quiz-17-production-readiness' },
            { text: 'Quiz 18 - Projet Final', link: '/quizzes/quiz-18-projet-final' },
            { text: 'Quiz 19 - Kubernetes Observability', link: '/quizzes/quiz-19-kubernetes-observability' },
            { text: 'Quiz 20 - FinOps Observability', link: '/quizzes/quiz-20-finops-observability' },
            { text: 'Quiz 21 - ELK Stack & Kibana', link: '/quizzes/quiz-21-elk-stack-kibana' },
            { text: 'Quiz 22 - RGPD & Observabilite', link: '/quizzes/quiz-22-rgpd-observabilite' },
            { text: 'Quiz 23 - Observabilite Frontend', link: '/quizzes/quiz-23-observabilite-frontend' },
            { text: 'Quiz 24 - Instrumentation Nuxt/Next', link: '/quizzes/quiz-24-instrumentation-nuxt-next' },
            { text: 'Quiz 25 - Panorama APM', link: '/quizzes/quiz-25-panorama-apm' },
            { text: 'Quiz 26 - Feature Flags', link: '/quizzes/quiz-26-feature-flags-observabilite' },
          ],
        },
      ],

      '/visualizations/': [
        {
          text: 'Visualisations',
          items: [
            { text: 'Three Pillars', link: '/visualizations/three-pillars.html' },
            { text: 'Metric Types', link: '/visualizations/metric-types.html' },
            { text: 'Distributed Trace', link: '/visualizations/distributed-trace.html' },
            { text: 'SLO Error Budget', link: '/visualizations/slo-error-budget.html' },
            { text: 'Incident Lifecycle', link: '/visualizations/incident-lifecycle.html' },
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
