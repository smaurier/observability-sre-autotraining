# Screencast 21 — FinOps : Cout de l'Observabilite

## Informations
- **Duree estimee** : 8-10 min
- **Module** : `modules/21-finops-observability.md`
- **Lab associe** : Lab 22
- **Prerequis** : Screencast 20

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert
- [ ] Tableur ou calculatrice pour les demonstrations de cout
- [ ] Dashboard Grafana avec les metriques de cardinalite (optionnel)

## Script

### [00:00-01:30] Introduction

> Nous avons construit une stack d'observabilite complete : metriques, logs, traces, alertes, dashboards. Mais cette stack a un cout — et ce cout peut devenir le deuxieme ou troisieme poste de depense apres le compute et le stockage. Aujourd'hui, nous allons apprendre a mesurer, auditer et optimiser le cout de l'observabilite.

> Le FinOps applique a l'observabilite ne consiste pas a couper dans le signal — c'est optimiser le rapport cout/valeur. L'objectif : garder ce qui compte pour les SLOs et le debugging, eliminer le bruit.

### [01:30-03:30] Calculer la cardinalite des metriques

> Le premier levier est la cardinalite des metriques. La cardinalite, c'est le nombre de series temporelles uniques. Chaque combinaison unique de labels cree une serie.

**Action** : Montrer un calcul de cardinalite.

```typescript
// Calcul de cardinalite
const labels = {
  endpoint: 10,    // 10 endpoints distincts
  pod: 50,         // 50 pods
  status: 5,       // 5 codes status
  method: 4,       // 4 methodes HTTP
};

const cardinality = 10 * 50 * 5 * 4;
// = 10 000 series temporelles pour UNE SEULE metrique

// Maintenant, ajoutons un label user_id avec 100 000 utilisateurs...
const cardinalityExplosion = 10 * 50 * 5 * 4 * 100_000;
// = 1 000 000 000 series — EXPLOSION !
```

> Voyez le probleme : ajouter un seul label a haute cardinalite multiplie le nombre de series par 100 000. C'est l'explosion de cardinalite — le piege le plus couteux en observabilite. Un user_id, un request_id, un trace_id ne doivent JAMAIS etre des labels Prometheus.

> Pour identifier les metriques problematiques dans votre cluster :

```promql
# Nombre de series par metrique
count({__name__=~".+"}) by (__name__)

# Top 10 des metriques par cardinalite
topk(10, count by (__name__)({__name__=~".+"}))
```

### [03:30-05:30] Implementer le sampling des logs

> Le deuxieme levier est le sampling des logs. Les logs sont souvent le poste le plus cher car le volume est enorme.

**Action** : Montrer une strategie de sampling intelligente.

```typescript
// Strategie de sampling intelligente
const samplingRules = {
  // Les erreurs : TOUJOURS garder (100%)
  error: 1.0,

  // Les warnings : garder la moitie (50%)
  warn: 0.5,

  // Les info : garder 10%
  info: 0.1,

  // Le debug : garder 1% (uniquement pour investigation)
  debug: 0.01,

  // Rate limiting par pattern
  patterns: {
    'GET /health': '10/min',      // Health checks : max 10 par minute
    'GET /api/users': '100/min',  // Endpoint frequent : cap a 100/min
  },
};
```

> La regle d'or : ne jamais perdre les erreurs. Les erreurs representent generalement moins de 1% du volume mais 90% de la valeur diagnostique. On peut echantillonner le reste agressivement.

> Avec ces regles, on passe de 50 Go/jour a environ 7 Go/jour. A $0.50/Go d'ingestion, c'est une economie de $21.50 par jour, soit $645 par mois.

### [05:30-07:00] Tail-based sampling des traces

> Pour les traces, le head-based sampling (decision au debut) perd les traces interessantes. Le tail-based sampling attend la fin de la trace pour decider.

**Action** : Montrer la configuration OpenTelemetry Collector.

```yaml
# otel-collector-config.yaml
processors:
  tail_sampling:
    decision_wait: 10s
    num_traces: 100000
    policies:
      # Garder toutes les traces en erreur
      - name: errors
        type: status_code
        status_code:
          status_codes:
            - ERROR

      # Garder les traces lentes (> 2s)
      - name: slow-traces
        type: latency
        latency:
          threshold_ms: 2000

      # Echantillonner 5% des traces normales
      - name: normal-traffic
        type: probabilistic
        probabilistic:
          sampling_percentage: 5
```

> Avec cette configuration, on garde 100% des erreurs, 100% des traces lentes, et 5% du trafic normal. Pour 10 millions de spans par jour, on passe de 10M a environ 600K spans ingeres — une reduction de 94% du volume sans perdre aucune trace d'incident.

### [07:00-08:30] Dashboard de cout et calcul de ROI

> Construisons un dashboard de suivi des couts.

**Action** : Montrer les formules de cout.

```typescript
// Calculateur de cout mensuel
function calculateMonthlyCost(config) {
  // Metriques : $0.10 / 1000 series + $0.01 / 1000 series / jour retention
  const metricsCost =
    (config.activeSeries / 1000) * 0.10 +
    (config.activeSeries / 1000) * config.retentionDays * 0.01;

  // Logs : $0.50 / Go ingere + $0.03 / Go / jour retention
  const logsCost =
    config.dailyLogGB * 30 * 0.50 +
    config.dailyLogGB * config.logRetentionDays * 0.03;

  // Traces : $0.30 / M spans + $0.02 / M spans / jour retention
  const sampledSpans = config.dailySpans * config.samplingRate;
  const tracesCost =
    (sampledSpans * 30 / 1_000_000) * 0.30 +
    (sampledSpans * config.traceRetentionDays / 1_000_000) * 0.02;

  return { metricsCost, logsCost, tracesCost, total: metricsCost + logsCost + tracesCost };
}

// Avant optimisation
const before = calculateMonthlyCost({
  activeSeries: 100_000,
  retentionDays: 30,
  dailyLogGB: 50,
  logRetentionDays: 30,
  dailySpans: 10_000_000,
  samplingRate: 1.0,
  traceRetentionDays: 14,
});
// Total : ~$1,879 / mois

// Apres optimisation
const after = calculateMonthlyCost({
  activeSeries: 60_000,     // -40% apres audit cardinalite
  retentionDays: 15,        // Retention reduite
  dailyLogGB: 15,           // Sampling a 30%
  logRetentionDays: 14,     // Retention logs reduite
  dailySpans: 10_000_000,
  samplingRate: 0.1,        // Tail-based sampling a 10%
  traceRetentionDays: 7,    // Retention traces reduite
});
// Total : ~$381 / mois — economie de 80%
```

> L'economie est considerable : de $1,879 a $381 par mois, soit $18,000 par an. Et le signal n'est pas degrade — on garde toutes les erreurs, toutes les traces lentes, et suffisamment de metriques pour les SLOs.

### [08:30-09:30] Recapitulatif

> Recapitulons. L'explosion de cardinalite est le piege numero un : un label a haute cardinalite peut multiplier vos couts par 1000. Auditez regulierement avec `count by (__name__)`.

> Le sampling intelligent des logs preserve les erreurs (100%) tout en echantillonnant le reste. Le tail-based sampling des traces est superieur au head-based car il garde ce qui est interessant.

> Les trois leviers d'optimisation sont : reduire la cardinalite des metriques, sampler les logs et les traces intelligemment, et ajuster les periodes de retention.

> Le FinOps applique a l'observabilite, c'est optimiser le cout sans perdre le signal. Ce n'est pas couper dans le vif — c'est eliminer le bruit.

> Faites le Lab 22 pour calculer la cardinalite, implementer le sampling, et construire votre propre calculateur de cout !

## Points d'attention pour l'enregistrement
- Le calcul de cardinalite doit etre fait en direct, pas juste montre — l'etudiant doit voir la multiplication
- L'explosion de cardinalite avec user_id est le moment "aha" du screencast — insister sur le danger
- Les formules de cout doivent etre montrees clairement avec les unites
- Le calcul avant/apres optimisation est le moment cle — montrer les chiffres concrets
- Ne pas diaboliser l'observabilite — le message est "optimiser", pas "reduire a tout prix"
- Le lab associe est le Lab 22 qui implemente ces calculs en TypeScript
