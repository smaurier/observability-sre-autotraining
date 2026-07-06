import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Observability & SRE',
  description: 'Observabilité & SRE : logs, métriques Prometheus, traces OpenTelemetry, Grafana, SLO, alerting, incidents, chaos',
  lang: 'fr-FR',
  srcDir: '.',

  vite: {
    server: {
      port: 5181,
      strictPort: false
    }
  },

  // Docs statiques : neutralise l'interpolation Vue `{{ }}` en prose (et le templating
  // Prometheus/Grafana `{{ $value }}`) pour ne pas casser le build SSR.
  vue: {
    template: {
      compilerOptions: {
        delimiters: ['(%(', ')%)']
      }
    }
  },

  ignoreDeadLinks: true,

  // Refonte v1 : le cours vit dans modules/ + labs/. Le reste (demo-app, config,
  // docker-compose, quizzes, screencasts, visualizations, scripts) = outillage/archive,
  // exclu du build markdown.
  srcExclude: [
    'quizzes/**',
    'screencasts/**',
    'visualizations/**',
    'demo-app/**',
    'config/**',
    'scripts/**'
  ],

  themeConfig: {
    nav: [
      { text: 'Modules', link: '/modules/00-prerequis-et-introduction' },
      { text: 'Labs', link: '/labs/lab-00-prerequis-et-introduction/README' }
    ],

    sidebar: {
      '/modules/': [
        {
          text: 'Fondations',
          items: [
            { text: '00 · Introduction & 3 piliers', link: '/modules/00-prerequis-et-introduction' },
            { text: '01 · Logging structuré', link: '/modules/01-logging-structure' },
            { text: '02 · Métriques & Prometheus', link: '/modules/02-metriques-et-prometheus' },
            { text: '03 · RED / USE', link: '/modules/03-red-use-methodes' },
            { text: '04 · Distributed tracing', link: '/modules/04-distributed-tracing' },
            { text: '05 · OpenTelemetry', link: '/modules/05-opentelemetry-instrumentation' },
            { text: '06 · Error tracking (Sentry)', link: '/modules/06-error-tracking-sentry' }
          ]
        },
        {
          text: 'Dashboards, SLO & alerting',
          items: [
            { text: '07 · Grafana dashboards', link: '/modules/07-grafana-dashboards' },
            { text: '08 · SLI / SLO / SLA', link: '/modules/08-sli-slo-sla' },
            { text: '09 · Alerting', link: '/modules/09-alerting-strategies' }
          ]
        },
        {
          text: 'Fiabilité & résilience',
          items: [
            { text: '10 · Incidents & postmortems', link: '/modules/10-incidents-et-postmortems' },
            { text: '11 · Capacity planning', link: '/modules/11-capacity-planning' },
            { text: '12 · Chaos engineering', link: '/modules/12-chaos-engineering' },
            { text: '13 · Observability as code', link: '/modules/13-observability-as-code' }
          ]
        },
        {
          text: 'Plateformes & clients',
          items: [
            { text: '14 · Kubernetes observability', link: '/modules/14-kubernetes-observability' },
            { text: '15 · ELK / Kibana', link: '/modules/15-elk-stack-kibana' },
            { text: '16 · Observabilité frontend', link: '/modules/16-observabilite-frontend' },
            { text: '17 · APM & profiling', link: '/modules/17-apm-et-profiling' }
          ]
        },
        {
          text: 'Coût, conformité & clôture',
          items: [
            { text: '18 · FinOps & feature flags', link: '/modules/18-finops-et-feature-flags-observabilite' },
            { text: '19 · RGPD & observabilité', link: '/modules/19-rgpd-observabilite' },
            { text: '20 · DORA & production readiness', link: '/modules/20-dora-et-production-readiness' },
            { text: '21 · Projet final', link: '/modules/21-projet-final' }
          ]
        }
      ],
      '/labs/': [
        {
          text: 'Labs — pratique (docker-compose fournis)',
          items: [
            { text: 'Lab 00 · Introduction', link: '/labs/lab-00-prerequis-et-introduction/README' },
            { text: 'Lab 01 · Logging structuré', link: '/labs/lab-01-logging-structure/README' },
            { text: 'Lab 02 · Métriques & Prometheus', link: '/labs/lab-02-metriques-et-prometheus/README' },
            { text: 'Lab 03 · RED / USE', link: '/labs/lab-03-red-use-methodes/README' },
            { text: 'Lab 04 · Distributed tracing', link: '/labs/lab-04-distributed-tracing/README' },
            { text: 'Lab 05 · OpenTelemetry', link: '/labs/lab-05-opentelemetry-instrumentation/README' },
            { text: 'Lab 06 · Sentry', link: '/labs/lab-06-error-tracking-sentry/README' },
            { text: 'Lab 07 · Grafana', link: '/labs/lab-07-grafana-dashboards/README' },
            { text: 'Lab 08 · SLO', link: '/labs/lab-08-sli-slo-sla/README' },
            { text: 'Lab 09 · Alerting', link: '/labs/lab-09-alerting-strategies/README' },
            { text: 'Lab 10 · Incidents & postmortems', link: '/labs/lab-10-incidents-et-postmortems/README' },
            { text: 'Lab 11 · Capacity planning', link: '/labs/lab-11-capacity-planning/README' },
            { text: 'Lab 12 · Chaos engineering', link: '/labs/lab-12-chaos-engineering/README' },
            { text: 'Lab 13 · Observability as code', link: '/labs/lab-13-observability-as-code/README' },
            { text: 'Lab 14 · Kubernetes', link: '/labs/lab-14-kubernetes-observability/README' },
            { text: 'Lab 15 · ELK / Kibana', link: '/labs/lab-15-elk-stack-kibana/README' },
            { text: 'Lab 16 · Observabilité frontend', link: '/labs/lab-16-observabilite-frontend/README' },
            { text: 'Lab 17 · APM & profiling', link: '/labs/lab-17-apm-et-profiling/README' },
            { text: 'Lab 18 · FinOps & feature flags', link: '/labs/lab-18-finops-et-feature-flags-observabilite/README' },
            { text: 'Lab 19 · RGPD', link: '/labs/lab-19-rgpd-observabilite/README' },
            { text: 'Lab 20 · Production readiness', link: '/labs/lab-20-dora-et-production-readiness/README' },
            { text: 'Lab 21 · Projet final', link: '/labs/lab-21-projet-final/README' }
          ]
        }
      ]
    },

    search: { provider: 'local' },
    outline: { level: [2, 3], label: 'Sur cette page' },
    docFooter: { prev: 'Précédent', next: 'Suivant' }
  }
})
