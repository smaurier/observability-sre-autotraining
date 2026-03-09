# Screencast 19 — Projet Final

## Informations
- **Duree estimee** : 25-30 min
- **Module** : `modules/19-projet-final.md`
- **Lab associe** : Lab 19
- **Prerequis** : Screencast 18

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert (3 terminaux)
- [ ] Docker Desktop lance avec suffisamment de ressources (4 Go RAM minimum)
- [ ] Fichier `docker-compose.full.yml` ouvert
- [ ] Navigateur ouvert avec onglets prets pour : demo-app (`:3000`), Prometheus (`:9090`), Grafana (`:3001`), Jaeger (`:16686`)
- [ ] k6 installe et fonctionnel
- [ ] Scripts k6 prets dans `scripts/k6/`
- [ ] Document vide pour le postmortem final

## Script

### [00:00-03:00] Introduction

> Nous voici au module final. En 18 modules, nous avons construit un systeme d'observabilite complet : logging structure, metriques Prometheus, traces OpenTelemetry, dashboards Grafana, SLOs, alerting, incident management, postmortems, tests de charge, chaos engineering, metriques DORA, observability as code, production readiness.

> Aujourd'hui, nous assemblons tout. Ce screencast est une demonstration de bout en bout : de l'infrastructure au chaos, en passant par la mesure, l'alerte et la resolution. C'est la validation de tout ce que vous avez appris.

### [03:00-06:00] Lancer la stack complete avec Docker Compose

**Action** : Afficher le `docker-compose.full.yml` et rappeler les services.

```
Stack complete :
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  demo-app    │  │  Prometheus  │  │  Grafana     │
│  :3000       │  │  :9090       │  │  :3001       │
└──────┬───────┘  └──────────────┘  └──────────────┘
       │
       │ OTLP
       ▼
┌──────────────┐  ┌──────────────┐
│  OTel        │  │  Jaeger      │
│  Collector   │──│  :16686      │
│  :4317/:4318 │  └──────────────┘
└──────────────┘
```

**Action** : Lancer la stack.

```bash
docker compose -f docker-compose.full.yml up -d
```

**Action** : Verifier que tous les services sont up.

```bash
docker compose -f docker-compose.full.yml ps
```

> Cinq services : demo-app, prometheus, grafana, otel-collector, jaeger. Tous en etat running. Verifions chacun.

**Action** : Tester chaque service.

```bash
# demo-app
curl http://localhost:3000/health/live
# {"status":"ok","timestamp":"..."}

# demo-app readiness
curl http://localhost:3000/health/ready
# {"status":"ready","checks":{"database":{"status":"ok"},"cache":{"status":"ok"}}}

# Prometheus targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets | length'
# 2 targets actives (prometheus + demo-app)

# Metriques demo-app
curl -s http://localhost:3000/metrics | head -5
```

> Tout est operationnel. Les metriques sont exposees, Prometheus scrape la demo-app, le Collector est pret a recevoir des traces.

### [06:00-10:00] Montrer l'instrumentation — Logs, Metriques, Traces

**Action** : Envoyer des requetes et observer les trois piliers.

```bash
# Generer du trafic varie
for i in $(seq 1 50); do
  curl -s http://localhost:3000/api/products > /dev/null
  curl -s http://localhost:3000/api/orders > /dev/null
  curl -s -X POST http://localhost:3000/api/orders \
    -H "Content-Type: application/json" \
    -d '{"item":"laptop","quantity":1}' > /dev/null
done
```

**Action** : Montrer les logs structures dans le terminal Docker.

```bash
docker compose -f docker-compose.full.yml logs demo-app --tail 10
```

> Les logs sont structures en JSON avec Pino : timestamp, level, requestId, method, route, statusCode, duration. Chaque requete est tracable grace au requestId. C'est le premier pilier — logging structure (modules 02-03).

**Action** : Montrer les metriques dans Prometheus.

```
# Les 6 requetes du dashboard mental RED + USE
# RED
sum(rate(demo_app_http_requests_total[5m]))
sum(rate(demo_app_http_requests_total{status_code=~"5.."}[5m])) / sum(rate(demo_app_http_requests_total[5m])) * 100
histogram_quantile(0.99, sum(rate(demo_app_http_request_duration_seconds_bucket[5m])) by (le))

# USE
demo_app_nodejs_heap_size_used_bytes / demo_app_nodejs_heap_size_total_bytes
demo_app_nodejs_eventloop_lag_seconds
rate(demo_app_http_requests_total{status_code="503"}[5m])
```

> Les metriques sont collectees. Le Rate montre le debit, le taux d'erreur est a 0%, la latence p99 est saine. Le heap est stable, l'event loop lag est minimal. C'est le deuxieme pilier — metriques (modules 04-06).

**Action** : Ouvrir Jaeger sur `http://localhost:16686` et montrer les traces.

> Les traces arrivent dans Jaeger via le Collector. Selectionnons `demo-app` et cliquons sur une trace POST /api/orders. La vue waterfall montre le parcours complet : le middleware Express, le span createOrder, les sous-spans validateOrder et saveOrder. C'est le troisieme pilier — tracing distribue (modules 07-08).

### [10:00-14:00] SLOs configures et mesures

**Action** : Ouvrir Grafana et montrer le dashboard RED genere.

> Voici le dashboard RED que nous avons genere automatiquement dans le module 17. Les cinq panels : Request Rate, Error Rate, Latency Percentiles, SLO Availability, Error Budget Consumption. Tout est au vert.

**Action** : Montrer les SLOs dans Prometheus.

```
# SLI Disponibilite
sum(rate(demo_app_http_requests_total{status_code!~"5.."}[30m]))
/
sum(rate(demo_app_http_requests_total[30m]))
# Resultat : 1.0 (100%) — SLO 99.9% respecte

# SLI Latence
sum(rate(demo_app_http_request_duration_seconds_bucket{le="0.5"}[30m]))
/
sum(rate(demo_app_http_request_duration_seconds_count[30m]))
# Resultat : 1.0 (100%) — SLO 99% respecte

# Error budget consomme
# 0% — budget intact
```

> Les SLOs sont definis (module 10), mesures en continu et affiches dans le dashboard. L'error budget est intact — 0% consomme.

**Action** : Verifier les alertes dans Prometheus.

```bash
curl -s http://localhost:9090/api/v1/rules | jq '.data.groups[].rules[] | {alert: .name, state: .state}'
```

> Toutes les alertes sont en etat "inactive" — aucune violation du burn rate. Les regles sont celles generees automatiquement dans le module 17.

### [14:00-18:00] Test de charge avec k6

**Action** : Lancer un test de charge complet.

```bash
k6 run scripts/k6/load-test.ts
```

**Action** : Observer en temps reel dans Grafana.

> Pendant le test, observez le dashboard RED. Le Request Rate monte pendant le ramp-up. La latence augmente legerement sous charge. Le taux d'erreur reste a 0%. Le SLO est maintenu.

**Action** : Analyser les resultats k6.

```
# Resultats typiques
     checks.........................: 100.00%
     http_req_duration..............: avg=35ms  p(95)=150ms  p(99)=320ms
     http_req_failed................: 0.00%
     http_reqs......................: 2456    40.9/s
     vus............................: 50      max=50
```

> Le test de charge confirme que le service supporte la charge prevue. p99 a 320ms, bien en dessous du seuil SLO de 500ms. Zero erreurs. Le service est capable (module 14).

### [18:00-23:00] Chaos engineering — Injection et observation

**Action** : Activer le chaos — injection de 30% d'erreurs.

```bash
curl -X POST http://localhost:3000/admin/chaos \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "errorRate": 0.3, "latencyMs": 200, "latencyJitter": 100}'
```

**Action** : Generer du trafic continu.

```bash
# Terminal 2 : trafic continu
while true; do
  curl -s http://localhost:3000/api/products > /dev/null
  curl -s http://localhost:3000/api/orders > /dev/null
  sleep 0.1
done
```

**Action** : Observer l'impact dans Grafana.

> Le dashboard RED change immediatement. Le taux d'erreur monte a environ 30%. La latence augmente a cause de l'injection de 200ms. L'error budget se consomme rapidement. L'alerte de burn rate devrait se declencher.

**Action** : Montrer l'alerte firing dans Prometheus.

> L'alerte `HighErrorBudgetBurn_Page_Fast` passe en firing. Le burn rate est largement superieur a 14.4x. C'est l'alerte qui declencherait un appel a la personne d'astreinte (module 11).

**Action** : Pratiquer le triage rapide.

> Workflow de triage : le dashboard RED montre un error rate de 30%. Jaeger montre des traces en erreur avec le message "Chaos injection". Les logs confirment le chaos middleware actif. Cause identifiee en moins de 5 minutes.

**Action** : Desactiver le chaos et observer la recuperation.

```bash
curl -X POST http://localhost:3000/admin/chaos \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

> Le service se retablit. Le taux d'erreur redescend a 0%. L'alerte passe de "firing" a "resolved". Le circuit breaker, s'il etait actif, revient en etat "closed". La recuperation est complete (module 15).

### [23:00-26:00] Postmortem et evaluation de la production readiness

**Action** : Esquisser le postmortem de l'incident simule.

```typescript
// Postmortem eclair de l'incident simule
const quickPostmortem = {
  title: 'SEV2 — 30% erreurs + latence elevee pendant chaos test',
  duration: '~5 minutes',
  rootCause: 'Chaos middleware active avec 30% error rate et 200ms de latence',

  fiveWhys: [
    'Pourquoi 30% d erreurs ? → Chaos middleware actif',
    'Pourquoi le chaos etait actif ? → Active volontairement pour le test',
    'Pourquoi pas d expiration ? → Expiration a 30 min, test plus court',
  ],

  lessonsLearned: {
    whatWentWell: [
      'Alerte burn rate detectee en < 2 minutes',
      'Triage complet en < 5 minutes',
      'Recuperation immediate apres desactivation',
    ],
    whatWentWrong: [
      'Rien — c etait un test planifie',
    ],
  },

  actionItems: [
    'Documenter les resultats du chaos test',
    'Verifier que le circuit breaker se declenche correctement',
  ],
};
```

> Le postmortem suit la structure du module 13 : timeline, analyse de cause racine avec 5 Whys, lecons apprises et action items SMART.

**Action** : Evaluer rapidement la production readiness.

```typescript
// Score PRR rapide
const prrScore = {
  observabilite: { score: '7/7', status: 'pass' },
  fiabilite: { score: '6/7', status: 'conditional (timeouts manquants)' },
  securite: { score: '2.5/4', status: 'conditional (rate limiting manquant)' },
  operationnel: { score: '3/4', status: 'conditional (astreinte non definie)' },
  overall: { score: '18.5/22 = 84%', recommendation: 'CONDITIONAL GO' },
};
```

> Score de 84% — recommandation "conditional". Le service peut aller en production avec un plan d'action pour les items restants.

### [26:00-29:00] Resume du cours complet

**Action** : Recapituler chaque module.

```typescript
// Parcours complet — 20 modules
const courseJourney = {
  foundations: {
    modules: ['00-Prerequis', '01-Pourquoi Observabilite'],
    takeaway: 'L observabilite est une propriete du systeme, pas un outil',
  },
  logging: {
    modules: ['02-Logging Structure', '03-Niveaux de Log et Contexte'],
    takeaway: 'Pino + correlation IDs + niveaux de severite = logs exploitables',
  },
  metrics: {
    modules: ['04-Introduction Metriques', '05-Prometheus', '06-RED/USE'],
    takeaway: 'Counter, Gauge, Histogram + PromQL + RED (symptomes) + USE (causes)',
  },
  tracing: {
    modules: ['07-Distributed Tracing', '08-OTel Collector'],
    takeaway: 'OpenTelemetry SDK + auto-instrumentation + Jaeger + Collector pipeline',
  },
  dashboards: {
    modules: ['09-Grafana Dashboards'],
    takeaway: 'PromQL avance + dashboard RED operationnel + template variables',
  },
  sre: {
    modules: ['10-SLI/SLO/SLA', '11-Alerting', '12-Incident Management', '13-Postmortems'],
    takeaway: 'SLOs + error budgets + burn rate alerts + incident response + blameless postmortems',
  },
  advanced: {
    modules: ['14-Capacity Planning', '15-Chaos Engineering', '16-DORA Metrics'],
    takeaway: 'predict_linear + k6 + chaos middleware + circuit breaker + DORA tracker + toil reduction',
  },
  production: {
    modules: ['17-Observability as Code', '18-Production Readiness', '19-Projet Final'],
    takeaway: 'Generation automatique + PRR checklist + FMEA + validation complete',
  },
};
```

> Ce cours vous a emmene du `console.log` a une stack d'observabilite complete en production. Chaque module a construit sur le precedent. Les logs donnent du contexte. Les metriques donnent des tendances. Les traces donnent le parcours de chaque requete. Les SLOs donnent un objectif. Les alertes detectent les degradations. Les incidents sont geres avec methode. Les postmortems generent de l'apprentissage. Les tests de charge anticipent les limites. Le chaos valide la resilience. Les metriques DORA mesurent la progression de l'equipe. L'observability as code scale l'automatisation. La PRR valide la production readiness.

### [29:00-30:00] Conclusion

> Felicitations. Vous avez parcouru les 20 modules de cette formation. Vous maitrisez les trois piliers de l'observabilite, le framework SLI/SLO/SLA, le cycle de vie des incidents, le chaos engineering et la production readiness.

> La prochaine etape est d'appliquer tout cela a vos propres projets. Commencez petit : ajoutez du logging structure. Puis des metriques. Puis des traces. Definissez un SLO. Configurez une alerte. Chaque etape rend votre systeme un peu plus observable, un peu plus fiable, un peu plus resilient.

> Bonne route en production.

**Action** : Arreter Docker Compose.

```bash
docker compose -f docker-compose.full.yml down
```

## Points d'attention pour l'enregistrement
- Ce screencast est la synthese de tout le cours — il doit etre fluide et rythme
- Chaque etape (logs, metriques, traces, SLOs, chaos) doit rappeler le module correspondant
- La stack Docker Compose doit demarrer sans erreur — tester avant l'enregistrement
- Avoir suffisamment de RAM pour les 5 conteneurs (4 Go minimum)
- Le test k6 doit montrer le dashboard RED en temps reel — split screen recommande
- L'injection de chaos et l'observation de l'alerte firing sont le point culminant
- Le postmortem eclair montre que la methode fonctionne meme en quelques minutes
- Le recapitulatif final doit lier tous les modules — c'est la conclusion du cours
- Terminer sur une note positive et motivante — les apprenants ont accompli un parcours complet
- Ne pas oublier d'arreter Docker Compose a la fin
