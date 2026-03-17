# Module 21 — FinOps : Maîtriser le Cout de l'Observabilité

## Objectifs pedagogiques

- Comprendre pourquoi l'observabilité peut devenir l'un des postes de depense les plus eleves de l'infrastructure
- Identifier les drivers de cout pour chaque pilier (logs, metriques, traces)
- Maîtriser les stratégies de reduction des couts : sampling, filtrage, retention, downsampling
- Concevoir une architecture d'observabilité cost-effective (open source vs SaaS vs hybride)
- Mettre en place une gouvernance FinOps appliquee a l'observabilité
- Mesurer et justifier le ROI de l'observabilité aupres du management
- Appliquer la regle "bonne couverture, pas couverture maximale"

---

## Le paradoxe de l'observabilité : plus on observe, plus ça coute

### Le cout cache de l'observabilité

L'observabilité est souvent presentee comme un investissement indispensable — et elle l'est. Mais personne ne vous previent que la facture peut exploser silencieusement. Chaque requête HTTP, chaque appel de fonction, chaque événement système peut générer des logs, incrementer des metriques et produire des spans de trace. A l'echelle d'un système distribue, ces donnees representent un **volume colossal**.

```typescript
interface ObservabilityCostDrivers {
  category: string;
  description: string;
  typicalShare: string;
}

const costDrivers: ObservabilityCostDrivers[] = [
  {
    category: 'Ingestion',
    description: 'Le cout de recevoir et parser les donnees (logs, metriques, traces)',
    typicalShare: '30-40% de la facture',
  },
  {
    category: 'Stockage',
    description: 'Le cout de stocker les donnees brutes et indexees',
    typicalShare: '20-30% de la facture',
  },
  {
    category: 'Requetes / Indexation',
    description: 'Le cout de requeter, agreger et indexer les donnees',
    typicalShare: '15-25% de la facture',
  },
  {
    category: 'Retention',
    description: 'Le cout de conserver les donnees au-dela de la periode minimale',
    typicalShare: '10-20% de la facture',
  },
  {
    category: 'Reseau',
    description: 'Le cout de transferer les donnees entre services, regions et providers',
    typicalShare: '5-10% de la facture',
  },
];
```

### Ordres de grandeur : combien coute l'observabilité ?

Les prix varient selon les fournisseurs, mais voici des ordres de grandeur representatifs (tarifs publics, 2024-2025) :

| Pilier | Fournisseur | Cout approximatif | Unite |
|--------|------------|-------------------|-------|
| **Logs** | Datadog | ~0.10 $/Go ingere | Par Go/mois |
| **Logs** | Grafana Cloud | ~0.50 $/Go ingere | Par Go/mois |
| **Logs** | Elastic Cloud | ~0.08-0.15 $/Go | Par Go/mois (stockage + ingestion) |
| **Logs** | New Relic | ~0.30 $/Go ingere | Par Go/mois (au-dela du quota gratuit) |
| **Metriques** | Datadog | ~0.05 $/serie custom | Par serie active/mois |
| **Metriques** | Grafana Cloud | ~8 $/1000 series | Par 1000 series actives/mois |
| **Metriques** | New Relic | Inclus | Facturation par Go ingere |
| **Traces** | Datadog | ~0.20 $/million de spans | Par million de spans ingerees |
| **Traces** | Grafana Cloud | ~0.50 $/Go | Par Go de traces ingerees |
| **Traces** | New Relic | Inclus | Facturation par Go ingere |

::: warning Les prix changent frequemment
Ces chiffres sont des ordres de grandeur pour donner une intuition. Consultez toujours les tarifs officiels a jour. Les remises volume, les engagements annuels et les modèles de facturation varient enormement.
:::

### La regle des 90 %

Une étude recurrente dans l'industrie montre que **90 % des donnees d'observabilité collectees ne sont jamais consultees**. Autrement dit, pour chaque euro depense en observabilité, 90 centimes financent des donnees qui dorment dans un stockage couteux sans jamais etre lues.

```typescript
interface DataUsageAnalysis {
  dataType: string;
  volumePerDay: string;
  percentQueried: number;
  percentNeverTouched: number;
  wastedCostPerMonth: string;
}

const usageAnalysis: DataUsageAnalysis[] = [
  {
    dataType: 'Logs DEBUG/TRACE',
    volumePerDay: '500 Go',
    percentQueried: 2,
    percentNeverTouched: 98,
    wastedCostPerMonth: '~1 470 $',
  },
  {
    dataType: 'Logs INFO (requetes normales)',
    volumePerDay: '200 Go',
    percentQueried: 5,
    percentNeverTouched: 95,
    wastedCostPerMonth: '~570 $',
  },
  {
    dataType: 'Metriques a haute cardinalite',
    volumePerDay: '50 000 series',
    percentQueried: 10,
    percentNeverTouched: 90,
    wastedCostPerMonth: '~2 250 $',
  },
  {
    dataType: 'Traces de requetes normales (200 OK)',
    volumePerDay: '100 Go',
    percentQueried: 1,
    percentNeverTouched: 99,
    wastedCostPerMonth: '~600 $',
  },
];

// Total gaspille par mois
const totalWasted = usageAnalysis.reduce((sum, item) => {
  const cost = parseFloat(item.wastedCostPerMonth.replace(/[^0-9.]/g, ''));
  return sum + cost;
}, 0);

console.log(`Cout mensuel gaspille estime : ~${totalWasted.toLocaleString()} $`);
// Cout mensuel gaspille estime : ~4 890 $
```

### Analogie : l'observabilité comme une assurance

L'observabilité fonctionne comme une **assurance**. Vous payez un cout récurrent en esperant ne jamais en avoir besoin (un incident grave). Mais :

- **Trop peu d'assurance** : quand l'incident arrive, vous n'avez pas les donnees pour le diagnostiquer. Le MTTR explose. Le cout de l'incident dépasse largement le cout de l'observabilité que vous auriez du avoir.
- **Trop d'assurance** : vous collectez tout, à la granularite maximale, avec une retention de 2 ans. Votre facture mensuelle pourrait financer un ingenieur supplementaire.
- **La bonne assurance** : vous collectez les donnees critiques en detail, vous echantillonnez le reste, et vous ajustez la couverture en fonction des risques.

Le FinOps applique a l'observabilité, c'est exactement cette demarche : **trouver le bon niveau de couverture pour chaque type de donnee**.

---

## Anatomie des couts par pilier

### Logs

Le **volume** est le principal driver de cout pour les logs. Chaque ligne de log ingeree est parsee, indexee et stockee. Le cout suit une formule simple :

```
Cout mensuel logs = Volume ingere (Go/jour) x 30 x Prix par Go
```

```typescript
interface LogCostCalculation {
  appName: string;
  requestsPerSecond: number;
  logLinesPerRequest: number;
  avgLogLineSizeBytes: number;
  logLevel: string;
}

function calculateLogCost(app: LogCostCalculation, pricePerGbIngested: number): void {
  const bytesPerSecond = app.requestsPerSecond * app.logLinesPerRequest * app.avgLogLineSizeBytes;
  const gbPerDay = (bytesPerSecond * 86400) / (1024 ** 3);
  const gbPerMonth = gbPerDay * 30;
  const costPerMonth = gbPerMonth * pricePerGbIngested;

  console.log(`=== ${app.appName} (${app.logLevel}) ===`);
  console.log(`  ${app.requestsPerSecond} req/s x ${app.logLinesPerRequest} lignes/req x ${app.avgLogLineSizeBytes} octets/ligne`);
  console.log(`  Volume : ${gbPerDay.toFixed(1)} Go/jour = ${gbPerMonth.toFixed(0)} Go/mois`);
  console.log(`  Cout : ${costPerMonth.toFixed(0)} $/mois (a ${pricePerGbIngested} $/Go)`);
}

// Scenario 1 : application avec log level INFO
calculateLogCost({
  appName: 'API Gateway',
  requestsPerSecond: 1000,
  logLinesPerRequest: 2,     // 1 log entree + 1 log sortie
  avgLogLineSizeBytes: 500,  // Log structure JSON
  logLevel: 'INFO',
}, 0.10);
// Volume : 86.4 Go/jour = 2 592 Go/mois
// Cout : 259 $/mois

// Scenario 2 : MEME application avec log level DEBUG
calculateLogCost({
  appName: 'API Gateway',
  requestsPerSecond: 1000,
  logLinesPerRequest: 15,    // DEBUG = beaucoup plus de lignes
  avgLogLineSizeBytes: 800,  // Messages plus detailles
  logLevel: 'DEBUG',
}, 0.10);
// Volume : 1 007.1 Go/jour = 30 213 Go/mois
// Cout : 3 021 $/mois
```

::: danger DEBUG en production = catastrophe financiere
Passer de INFO a DEBUG multiplie le volume de logs par **10 a 20 fois**. Un développeur qui oublie de retirer un `logger.debug()` en boucle peut a lui seul générer des milliers d'euros de cout supplementaire par mois. C'est l'équivalent d'ouvrir un robinet d'eau dans une piece et d'oublier de le fermer.
:::

La decomposition du cout des logs se fait en trois phases :

| Phase | Description | Cout relatif |
|-------|-------------|-------------|
| **Ingestion** | Reception, parsing, enrichissement | Eleve (facturation au volume) |
| **Stockage** | Écriture sur disque, indexation | Moyen (indexation couteuse) |
| **Requête** | Recherche full-text, agregation | Variable (selon la frequence) |

### Metriques

La **cardinalite** est le principal driver de cout pour les metriques. Chaque combinaison unique de labels créé une **serie temporelle** (time series) distincte. Le cout est proportionnel au nombre de series actives, pas au nombre de metriques definies.

```typescript
interface MetricCardinalityCalculation {
  metricName: string;
  labels: Record<string, number>; // label -> nombre de valeurs uniques
}

function calculateCardinality(metric: MetricCardinalityCalculation): number {
  const values = Object.values(metric.labels);
  return values.reduce((product, count) => product * count, 1);
}

function analyzeMetricCost(metric: MetricCardinalityCalculation, costPerSeries: number): void {
  const cardinality = calculateCardinality(metric);
  const monthlyCost = cardinality * costPerSeries;

  console.log(`\n=== ${metric.metricName} ===`);
  console.log('Labels :');
  for (const [label, count] of Object.entries(metric.labels)) {
    console.log(`  ${label}: ${count} valeurs uniques`);
  }
  console.log(`Cardinalite : ${cardinality.toLocaleString()} series`);
  console.log(`Cout mensuel : ${monthlyCost.toFixed(2)} $ (a ${costPerSeries} $/serie)`);
}

// Metrique bien concue
analyzeMetricCost({
  metricName: 'http_requests_total',
  labels: {
    method: 4,        // GET, POST, PUT, DELETE
    route: 10,        // 10 endpoints
    status_code: 5,   // 200, 201, 400, 404, 500
  },
}, 0.05);
// Cardinalite : 200 series
// Cout mensuel : 10.00 $

// Meme metrique dans un environnement Kubernetes
analyzeMetricCost({
  metricName: 'http_requests_total (Kubernetes)',
  labels: {
    method: 4,
    route: 10,
    status_code: 5,
    pod: 50,           // 50 pods (autoscaling)
  },
}, 0.05);
// Cardinalite : 10 000 series
// Cout mensuel : 500.00 $

// Metrique avec label a haute cardinalite (DANGER)
analyzeMetricCost({
  metricName: 'http_requests_total (avec user_id)',
  labels: {
    method: 4,
    route: 10,
    status_code: 5,
    user_id: 100000,   // 100 000 utilisateurs actifs
  },
}, 0.05);
// Cardinalite : 20 000 000 series
// Cout mensuel : 1 000 000.00 $
```

L'explosion combinatoire est le danger principal :

```
10 endpoints x 50 pods x 5 status codes x 4 methodes = 10 000 series
```

Et cela, c'est pour **une seule metrique**. Multipliez par le nombre de metriques custom de votre application et le chiffre grimpe vite.

### Traces

Pour les traces, le cout est proportionnel au **volume multiplie par la taille des spans** :

```
Cout mensuel traces = Nombre de spans/jour x Taille moyenne span x 30 x Prix par Go
```

```typescript
interface TraceCostScenario {
  name: string;
  requestsPerSecond: number;
  avgSpansPerRequest: number;
  avgSpanSizeBytes: number;
  samplingRate: number; // 1.0 = tout garder, 0.01 = 1%
}

function calculateTraceCost(scenario: TraceCostScenario, pricePerGb: number): void {
  const spansPerDay = scenario.requestsPerSecond * scenario.avgSpansPerRequest
    * scenario.samplingRate * 86400;
  const gbPerDay = (spansPerDay * scenario.avgSpanSizeBytes) / (1024 ** 3);
  const gbPerMonth = gbPerDay * 30;
  const costPerMonth = gbPerMonth * pricePerGb;

  console.log(`\n=== ${scenario.name} ===`);
  console.log(`  ${scenario.requestsPerSecond} req/s x ${scenario.avgSpansPerRequest} spans/req`);
  console.log(`  Sampling : ${(scenario.samplingRate * 100).toFixed(1)} %`);
  console.log(`  Spans/jour : ${(spansPerDay / 1_000_000).toFixed(1)} millions`);
  console.log(`  Volume : ${gbPerDay.toFixed(1)} Go/jour = ${gbPerMonth.toFixed(0)} Go/mois`);
  console.log(`  Cout : ${costPerMonth.toFixed(0)} $/mois (a ${pricePerGb} $/Go)`);
}

// Sans sampling : on garde tout
calculateTraceCost({
  name: 'Traces sans sampling',
  requestsPerSecond: 500,
  avgSpansPerRequest: 25,     // systeme distribue avec 5-6 services
  avgSpanSizeBytes: 1024,     // 1 Ko par span (attributs riches)
  samplingRate: 1.0,
}, 0.50);
// Spans/jour : 1 080.0 millions
// Volume : 1 007.1 Go/jour = 30 213 Go/mois
// Cout : 15 107 $/mois

// Avec 5% de sampling
calculateTraceCost({
  name: 'Traces avec 5% sampling',
  requestsPerSecond: 500,
  avgSpansPerRequest: 25,
  avgSpanSizeBytes: 1024,
  samplingRate: 0.05,
}, 0.50);
// Spans/jour : 54.0 millions
// Volume : 50.4 Go/jour = 1 511 Go/mois
// Cout : 755 $/mois
```

Une seule requête HTTP dans un système distribue peut générer entre 20 et 100 spans. Quand chaque span porte des attributs riches (headers HTTP, paramètres de requête, résultats de base de donnees), la taille par span peut facilement atteindre 1 a 5 Ko.

---

## Stratégies de reduction des couts — Logs

### Niveaux de log dynamiques

Pouvoir changer le niveau de log **sans redeployer** est l'une des stratégies les plus efficaces. En fonctionnement normal, on reste en INFO. Lors d'un incident, on passe temporairement en DEBUG pour le service concerne, puis on revient en INFO.

```typescript
import { createServer, IncomingMessage, ServerResponse } from 'http';

// Systeme de log level dynamique
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

class DynamicLogger {
  private currentLevel: LogLevel = 'info';
  private levelOverrides: Map<string, { level: LogLevel; expiresAt: number }> = new Map();

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
    console.log(`[LOGGER] Niveau global change a : ${level}`);
  }

  // Surcharge temporaire pour un module specifique
  setTemporaryOverride(module: string, level: LogLevel, durationMinutes: number): void {
    this.levelOverrides.set(module, {
      level,
      expiresAt: Date.now() + durationMinutes * 60 * 1000,
    });
    console.log(`[LOGGER] Override ${module} -> ${level} pour ${durationMinutes} min`);
  }

  private getEffectiveLevel(module: string): LogLevel {
    const override = this.levelOverrides.get(module);
    if (override) {
      if (Date.now() > override.expiresAt) {
        this.levelOverrides.delete(module);
        console.log(`[LOGGER] Override expire pour ${module}, retour a ${this.currentLevel}`);
        return this.currentLevel;
      }
      return override.level;
    }
    return this.currentLevel;
  }

  log(level: LogLevel, module: string, message: string, context?: Record<string, unknown>): void {
    const effectiveLevel = this.getEffectiveLevel(module);
    if (LOG_LEVELS[level] >= LOG_LEVELS[effectiveLevel]) {
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        module,
        message,
        ...context,
      };
      console.log(JSON.stringify(entry));
    }
    // Sinon, le log est silencieusement ignore = economie de volume
  }
}

// Endpoint HTTP pour changer le niveau a chaud
const logger = new DynamicLogger();

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'POST' && req.url === '/admin/log-level') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const { level, module, durationMinutes } = JSON.parse(body);
      if (module && durationMinutes) {
        logger.setTemporaryOverride(module, level, durationMinutes);
      } else {
        logger.setLevel(level);
      }
      res.writeHead(200);
      res.end('OK');
    });
    return;
  }

  // Votre logique applicative ici
  logger.log('info', 'http', 'Request received', { method: req.method, url: req.url });
  res.writeHead(200);
  res.end('Hello');
});
```

### Log sampling

Pour les événements a haute frequence, on peut n'enregistrer qu'un echantillon :

```typescript
class SampledLogger {
  private counters: Map<string, number> = new Map();

  constructor(private logger: DynamicLogger) {}

  // Loggue 1 evenement sur N pour les evenements frequents
  logSampled(
    level: LogLevel,
    module: string,
    eventKey: string,
    message: string,
    sampleRate: number,   // ex: 100 = 1 sur 100
    context?: Record<string, unknown>,
  ): void {
    const count = (this.counters.get(eventKey) || 0) + 1;
    this.counters.set(eventKey, count);

    if (count % sampleRate === 0) {
      this.logger.log(level, module, message, {
        ...context,
        _sampled: true,
        _sampleRate: sampleRate,
        _totalCount: count,
      });
    }
  }

  // Toujours logguer les erreurs (jamais de sampling sur les erreurs)
  logError(module: string, message: string, context?: Record<string, unknown>): void {
    this.logger.log('error', module, message, context);
  }
}

// Utilisation
const sampledLogger = new SampledLogger(logger);

// Dans un middleware Express, par exemple :
function requestHandler(req: { method: string; url: string; statusCode: number }): void {
  if (req.statusCode >= 500) {
    // Toujours logguer les erreurs 5xx
    sampledLogger.logError('http', 'Server error', {
      method: req.method,
      url: req.url,
      status: req.statusCode,
    });
  } else {
    // Logguer 1 requete sur 100 pour le trafic normal
    sampledLogger.logSampled(
      'info',
      'http',
      `${req.method}:${req.url}`,
      'Request completed',
      100,
      { method: req.method, url: req.url, status: req.statusCode },
    );
  }
}
```

### Filtrage à la source avec OTel Collector

Le filtre le plus efficace est celui qui agit **avant** l'ingestion dans le backend payant. L'OpenTelemetry Collector permet de filtrer les logs à la source :

```yaml
# otel-collector-config.yaml — filtrage des logs
processors:
  # Supprimer les logs de health check (enorme volume, aucune valeur)
  filter/drop-healthchecks:
    logs:
      exclude:
        match_type: regexp
        bodies:
          - ".*GET /health.*"
          - ".*GET /ready.*"
          - ".*GET /metrics.*"

  # Supprimer les logs DEBUG en production
  filter/drop-debug:
    logs:
      exclude:
        match_type: strict
        severity_texts:
          - "DEBUG"
          - "TRACE"

  # Reduire la taille des logs en supprimant les champs inutiles
  transform/reduce-size:
    log_statements:
      - context: log
        statements:
          - delete_key(attributes, "http.request.headers")
          - delete_key(attributes, "http.response.body")
          - truncate_all(attributes, 256)

service:
  pipelines:
    logs:
      receivers: [otlp]
      processors:
        - filter/drop-healthchecks
        - filter/drop-debug
        - transform/reduce-size
      exporters: [loki]
```

### Politique de retention tiered

Toutes les donnees n'ont pas la même valeur dans le temps. Une politique de retention a plusieurs niveaux optimise les couts :

| Tier | Duree | Stockage | Acces | Cout relatif |
|------|-------|----------|-------|-------------|
| **Hot** | 0-7 jours | SSD, indexe | Temps réel, requêtes ad hoc | Eleve |
| **Warm** | 7-30 jours | HDD, indexe | Requetes lentes autorisees | Moyen |
| **Cold** | 30-90 jours | Object storage (S3) | Requetes batch uniquement | Faible |
| **Archive** | 90 jours - 1 an | Glacier / Archive | Restauration en heures | Très faible |
| **Delete** | > 1 an | Supprime | N/A | Zero |

```typescript
interface RetentionPolicy {
  tier: string;
  maxAgeDays: number;
  storageType: string;
  costPerGbMonth: number;
}

const retentionPolicies: RetentionPolicy[] = [
  { tier: 'hot', maxAgeDays: 7, storageType: 'SSD indexe', costPerGbMonth: 0.50 },
  { tier: 'warm', maxAgeDays: 30, storageType: 'HDD indexe', costPerGbMonth: 0.15 },
  { tier: 'cold', maxAgeDays: 90, storageType: 'S3 Standard', costPerGbMonth: 0.023 },
  { tier: 'archive', maxAgeDays: 365, storageType: 'S3 Glacier', costPerGbMonth: 0.004 },
];

function calculateRetentionCost(dailyVolumeGb: number, policies: RetentionPolicy[]): void {
  let totalMonthlyCost = 0;

  console.log(`\nVolume quotidien : ${dailyVolumeGb} Go/jour\n`);

  for (const policy of policies) {
    const daysInTier = policy.maxAgeDays - (policies.indexOf(policy) > 0
      ? policies[policies.indexOf(policy) - 1].maxAgeDays
      : 0);
    const volumeInTier = dailyVolumeGb * daysInTier;
    const monthlyCost = volumeInTier * policy.costPerGbMonth;
    totalMonthlyCost += monthlyCost;

    console.log(`  ${policy.tier.toUpperCase()} (${daysInTier}j) : ${volumeInTier.toFixed(0)} Go x ${policy.costPerGbMonth} $ = ${monthlyCost.toFixed(2)} $/mois`);
  }

  console.log(`\n  TOTAL : ${totalMonthlyCost.toFixed(2)} $/mois`);

  // Comparer avec tout en hot
  const allHotCost = dailyVolumeGb * 365 * 0.50;
  console.log(`  Si tout en hot : ${allHotCost.toFixed(2)} $/mois`);
  console.log(`  Economie : ${((1 - totalMonthlyCost / allHotCost) * 100).toFixed(0)} %`);
}

calculateRetentionCost(100, retentionPolicies);
```

---

## Stratégies de reduction des couts — Metriques

### Identifier les metriques inutilisees

La première étape est de faire l'inventaire : quelles metriques existent, lesquelles sont réellement utilisees dans des dashboards ou des alertes ?

```typescript
interface MetricUsageReport {
  metricName: string;
  cardinality: number;
  usedInDashboards: number;
  usedInAlerts: number;
  usedInRecordingRules: number;
  lastQueried: Date | null;
  recommendation: 'keep' | 'reduce' | 'remove';
}

function auditMetricUsage(metrics: MetricUsageReport[]): void {
  const unused = metrics.filter(
    (m) => m.usedInDashboards === 0 && m.usedInAlerts === 0 && m.usedInRecordingRules === 0,
  );
  const highCardUnused = unused.filter((m) => m.cardinality > 1000);
  const totalCardinality = metrics.reduce((sum, m) => sum + m.cardinality, 0);
  const unusedCardinality = unused.reduce((sum, m) => sum + m.cardinality, 0);

  console.log(`\n=== Audit de cardinalite ===`);
  console.log(`Metriques totales : ${metrics.length}`);
  console.log(`Cardinalite totale : ${totalCardinality.toLocaleString()} series`);
  console.log(`Metriques jamais utilisees : ${unused.length} (${unusedCardinality.toLocaleString()} series)`);
  console.log(`Metriques inutilisees a haute cardinalite (> 1000) : ${highCardUnused.length}`);
  console.log(`Economie potentielle : ${((unusedCardinality / totalCardinality) * 100).toFixed(0)} % de la cardinalite`);

  console.log('\n--- Top 5 metriques inutilisees par cardinalite ---');
  unused
    .sort((a, b) => b.cardinality - a.cardinality)
    .slice(0, 5)
    .forEach((m) => {
      console.log(`  ${m.metricName} : ${m.cardinality.toLocaleString()} series`);
    });
}

// Exemple d'audit
const metricsAudit: MetricUsageReport[] = [
  {
    metricName: 'http_requests_total',
    cardinality: 200,
    usedInDashboards: 3,
    usedInAlerts: 2,
    usedInRecordingRules: 1,
    lastQueried: new Date(),
    recommendation: 'keep',
  },
  {
    metricName: 'custom_cache_operations_total',
    cardinality: 15000,
    usedInDashboards: 0,
    usedInAlerts: 0,
    usedInRecordingRules: 0,
    lastQueried: null,
    recommendation: 'remove',
  },
  {
    metricName: 'db_query_duration_by_table',
    cardinality: 8000,
    usedInDashboards: 0,
    usedInAlerts: 0,
    usedInRecordingRules: 0,
    lastQueried: null,
    recommendation: 'remove',
  },
  {
    metricName: 'http_request_duration_seconds',
    cardinality: 500,
    usedInDashboards: 2,
    usedInAlerts: 1,
    usedInRecordingRules: 2,
    lastQueried: new Date(),
    recommendation: 'keep',
  },
];

auditMetricUsage(metricsAudit);
```

### Reduire la cardinalite : agreger les labels

L'approche la plus efficace est de remplacer les labels a haute cardinalite par des labels a faible cardinalite :

```typescript
// AVANT : label user_id avec 100 000 valeurs possibles
// http_requests_total{method="GET", route="/api/orders", user_id="usr-abc123"}
// -> 100 000 series pour cette seule route/methode

// APRES : label user_tier avec 3 valeurs possibles
// http_requests_total{method="GET", route="/api/orders", user_tier="premium"}
// -> 3 series pour cette route/methode

function mapUserIdToTier(userId: string, userDatabase: Map<string, string>): string {
  const tier = userDatabase.get(userId);
  return tier || 'unknown';
  // Valeurs possibles : 'free', 'premium', 'enterprise', 'unknown'
  // 4 valeurs au lieu de 100 000
}

// Autre exemple : remplacer des URLs dynamiques par des patterns
function normalizeRoute(url: string): string {
  return url
    .replace(/\/users\/[a-zA-Z0-9-]+/, '/users/:id')
    .replace(/\/orders\/[a-zA-Z0-9-]+/, '/orders/:id')
    .replace(/\/products\/\d+/, '/products/:id');
  // "/users/abc-123/orders/xyz-456" -> "/users/:id/orders/:id"
  // Reduit les valeurs uniques de milliers a quelques dizaines
}
```

### Downsampling temporel

Les metriques recentes doivent etre granulaires (echantillonnage toutes les 15 secondes). Les metriques anciennes peuvent etre agregees :

| Age des donnees | Resolution | Raison |
|-----------------|-----------|--------|
| 0-2 heures | 15s | Debug en temps réel |
| 2h-24h | 1 min | Analyse intrajournaliere |
| 1-7 jours | 5 min | Tendances hebdomadaires |
| 7-30 jours | 15 min | Tendances mensuelles |
| 30-90 jours | 1 heure | Analyse historique |
| 90+ jours | 1 jour | Capacité planning long terme |

```typescript
interface DownsamplingRule {
  maxAgeHours: number;
  resolutionSeconds: number;
  dataPointsPer24h: number;
}

const downsamplingRules: DownsamplingRule[] = [
  { maxAgeHours: 2, resolutionSeconds: 15, dataPointsPer24h: 5760 },
  { maxAgeHours: 24, resolutionSeconds: 60, dataPointsPer24h: 1440 },
  { maxAgeHours: 168, resolutionSeconds: 300, dataPointsPer24h: 288 },
  { maxAgeHours: 720, resolutionSeconds: 900, dataPointsPer24h: 96 },
  { maxAgeHours: 2160, resolutionSeconds: 3600, dataPointsPer24h: 24 },
];

function calculateStorageSavings(rules: DownsamplingRule[]): void {
  const fullResolution = 5760; // 15s pendant 24h
  let totalPoints = 0;
  let fullResPoints = 0;

  for (let i = 0; i < rules.length; i++) {
    const daysInTier = (rules[i].maxAgeHours - (i > 0 ? rules[i - 1].maxAgeHours : 0)) / 24;
    totalPoints += rules[i].dataPointsPer24h * daysInTier;
    fullResPoints += fullResolution * daysInTier;
  }

  const savings = ((1 - totalPoints / fullResPoints) * 100).toFixed(1);
  console.log(`Points de donnees totaux : ${totalPoints.toLocaleString()}`);
  console.log(`Sans downsampling : ${fullResPoints.toLocaleString()}`);
  console.log(`Reduction du stockage : ${savings} %`);
}

calculateStorageSavings(downsamplingRules);
```

### Recording rules pour pre-calculer les agregations

Plutot que de stocker les metriques brutes a haute cardinalite et de les agreger à chaque requête, les recording rules pre-calculent les agregations :

```yaml
# prometheus-recording-rules.yaml
groups:
  - name: http_aggregations
    interval: 30s
    rules:
      # Pre-calculer le taux de requetes par service (sans le label pod)
      - record: service:http_requests:rate5m
        expr: sum(rate(http_requests_total[5m])) by (job, method, status_code)

      # Pre-calculer les percentiles de latence par service
      - record: service:http_request_duration:p99
        expr: |
          histogram_quantile(0.99,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (job, le)
          )

      # Pre-calculer le taux d'erreur par service
      - record: service:http_error_rate:ratio5m
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)
          /
          sum(rate(http_requests_total[5m])) by (job)
```

L'avantage est double : les requêtes de dashboard sont plus rapides (elles lisent des series pre-calculees) et on peut eventuellement supprimer les metriques brutes après un delai court.

---

## Stratégies de reduction des couts — Traces

### Head-based sampling vs Tail-based sampling

Le **sampling** est la stratégie la plus impactante pour reduire le cout des traces. Il existe deux approches fondamentalement différentes :

```typescript
interface SamplingComparison {
  strategy: string;
  decisionPoint: string;
  pros: string[];
  cons: string[];
  bestFor: string;
}

const samplingStrategies: SamplingComparison[] = [
  {
    strategy: 'Head-based sampling',
    decisionPoint: 'Au debut de la trace (premier service)',
    pros: [
      'Simple a implementer',
      'Faible overhead (decision immediate)',
      'Pas besoin de buffer les spans',
    ],
    cons: [
      'Perte d\'information : on peut rater des erreurs',
      'Decision prise sans connaitre le resultat de la requete',
      'Sampling uniforme = pas de priorisation intelligente',
    ],
    bestFor: 'Petites equipes, budget limite, systemes simples',
  },
  {
    strategy: 'Tail-based sampling',
    decisionPoint: 'A la fin de la trace (apres tous les spans)',
    pros: [
      'Decision informee : on connait le resultat, la duree, les erreurs',
      'Peut garder 100% des erreurs et requetes lentes',
      'Sampling intelligent base sur des criteres metier',
    ],
    cons: [
      'Plus complexe (necessite un OTel Collector centralise)',
      'Overhead memoire (buffer toutes les spans en attendant)',
      'Latence supplementaire avant l\'export',
    ],
    bestFor: 'Systemes distribues matures, equipes avec expertise OTel',
  },
];
```

### Stratégies de sampling intelligentes

La stratégie optimale combine plusieurs criteres pour garder les traces les plus precieuses :

```typescript
interface SamplingPolicy {
  name: string;
  condition: string;
  sampleRate: number;  // 1.0 = tout garder
  rationale: string;
}

const samplingPolicies: SamplingPolicy[] = [
  {
    name: 'Erreurs',
    condition: 'status_code >= 500 ou span.status = ERROR',
    sampleRate: 1.0,
    rationale: 'Toujours garder les erreurs pour le debug',
  },
  {
    name: 'Requetes lentes',
    condition: 'duree > p99 (ou > seuil fixe, ex: 2 secondes)',
    sampleRate: 1.0,
    rationale: 'Les outliers de latence revelent des problemes',
  },
  {
    name: 'Endpoints critiques',
    condition: 'route in [/api/payment, /api/checkout, /api/auth]',
    sampleRate: 0.50,
    rationale: 'Garder 50% des traces des flux critiques business',
  },
  {
    name: 'Nouvelles versions',
    condition: 'service.version != version_precedente (dans les 24h post-deploy)',
    sampleRate: 0.25,
    rationale: 'Plus de visibilite apres un deploiement',
  },
  {
    name: 'Trafic normal',
    condition: 'Tout le reste',
    sampleRate: 0.01,
    rationale: '1% suffit pour les statistiques sur le trafic nominal',
  },
];

function estimateSamplingImpact(
  totalRequestsPerDay: number,
  policies: SamplingPolicy[],
  percentErrorRequests: number,
  percentSlowRequests: number,
  percentCriticalEndpoints: number,
): void {
  const breakdown = [
    { name: 'Erreurs', volume: totalRequestsPerDay * (percentErrorRequests / 100), rate: 1.0 },
    { name: 'Lentes', volume: totalRequestsPerDay * (percentSlowRequests / 100), rate: 1.0 },
    { name: 'Critiques', volume: totalRequestsPerDay * (percentCriticalEndpoints / 100), rate: 0.50 },
    { name: 'Normales', volume: totalRequestsPerDay * (1 - (percentErrorRequests + percentSlowRequests + percentCriticalEndpoints) / 100), rate: 0.01 },
  ];

  const totalSampled = breakdown.reduce((sum, b) => sum + b.volume * b.rate, 0);
  const overallRate = totalSampled / totalRequestsPerDay;

  console.log(`\n=== Impact du sampling intelligent ===`);
  console.log(`Requetes totales/jour : ${totalRequestsPerDay.toLocaleString()}`);

  for (const b of breakdown) {
    console.log(`  ${b.name} : ${b.volume.toLocaleString()} x ${(b.rate * 100).toFixed(0)}% = ${(b.volume * b.rate).toLocaleString()} conservees`);
  }

  console.log(`\nTraces conservees/jour : ${totalSampled.toLocaleString()}`);
  console.log(`Taux de sampling effectif : ${(overallRate * 100).toFixed(2)} %`);
  console.log(`Reduction de cout : ${((1 - overallRate) * 100).toFixed(1)} %`);
}

estimateSamplingImpact(
  10_000_000,  // 10 millions de requetes/jour
  samplingPolicies,
  0.5,         // 0.5% d'erreurs
  1.0,         // 1% de requetes lentes
  10.0,        // 10% sur des endpoints critiques
);
```

### Configuration OTel Collector — tail_sampling

```yaml
# otel-collector-config.yaml — tail-based sampling
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: "0.0.0.0:4317"

processors:
  # Le tail_sampling necessite de voir la trace complete
  # Il faut donc un collector centralise (pas un agent par noeud)
  tail_sampling:
    decision_wait: 10s              # Attendre 10s pour la trace complete
    num_traces: 100000              # Buffer max de traces en memoire
    expected_new_traces_per_sec: 1000
    policies:
      # Politique 1 : Toujours garder les erreurs
      - name: errors-policy
        type: status_code
        status_code:
          status_codes:
            - ERROR

      # Politique 2 : Toujours garder les traces lentes (> 2s)
      - name: latency-policy
        type: latency
        latency:
          threshold_ms: 2000

      # Politique 3 : Garder 50% des traces sur les routes critiques
      - name: critical-routes-policy
        type: and
        and:
          and_sub_policy:
            - name: critical-route-filter
              type: string_attribute
              string_attribute:
                key: http.route
                values:
                  - /api/payment
                  - /api/checkout
                  - /api/auth
            - name: critical-route-rate
              type: probabilistic
              probabilistic:
                sampling_percentage: 50

      # Politique 4 : 1% du trafic normal
      - name: baseline-policy
        type: probabilistic
        probabilistic:
          sampling_percentage: 1

exporters:
  otlp/tempo:
    endpoint: "tempo:4317"
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [tail_sampling]
      exporters: [otlp/tempo]
```

### Calcul du ratio cout/benefice du sampling

```typescript
interface SamplingROI {
  scenarioName: string;
  costWithout: number;      // $/mois sans sampling
  costWith: number;          // $/mois avec sampling
  percentErrorsRetained: number;
  percentSlowRetained: number;
  debugCapabilityScore: number; // 0-100
}

function evaluateSamplingROI(scenarios: SamplingROI[]): void {
  console.log('\n=== Analyse cout/benefice du sampling ===\n');
  console.log('Scenario                  | Sans    | Avec    | Economie | Erreurs | Lentes | Debug');
  console.log('--------------------------|---------|---------|----------|---------|--------|------');

  for (const s of scenarios) {
    const savings = ((1 - s.costWith / s.costWithout) * 100).toFixed(0);
    console.log(
      `${s.scenarioName.padEnd(26)}| ${s.costWithout.toLocaleString().padStart(7)} $| ` +
      `${s.costWith.toLocaleString().padStart(7)} $| ${savings.padStart(7)} % | ` +
      `${s.percentErrorsRetained.toString().padStart(5)} % | ` +
      `${s.percentSlowRetained.toString().padStart(4)} % | ${s.debugCapabilityScore}/100`,
    );
  }
}

evaluateSamplingROI([
  {
    scenarioName: 'Pas de sampling',
    costWithout: 15000,
    costWith: 15000,
    percentErrorsRetained: 100,
    percentSlowRetained: 100,
    debugCapabilityScore: 100,
  },
  {
    scenarioName: 'Head-based 10%',
    costWithout: 15000,
    costWith: 1500,
    percentErrorsRetained: 10,
    percentSlowRetained: 10,
    debugCapabilityScore: 30,
  },
  {
    scenarioName: 'Tail-based intelligent',
    costWithout: 15000,
    costWith: 2200,
    percentErrorsRetained: 100,
    percentSlowRetained: 100,
    debugCapabilityScore: 90,
  },
]);
```

---

## Architecture d'observabilité cost-effective

### Open source vs SaaS : comparaison honnete

Le choix entre open source et SaaS n'est pas binaire. Voici une comparaison pour une application typique de **10 microservices, 50 pods, 500 req/s** :

```typescript
interface ArchitectureComparison {
  name: string;
  stack: string;
  monthlyLicenseCost: number;
  monthlyInfraCost: number;
  monthlyOpsCost: number;        // Cout de l'equipe pour operer
  setupTimeWeeks: number;
  maintenanceHoursPerMonth: number;
  totalMonthlyCost: number;
}

const architectures: ArchitectureComparison[] = [
  {
    name: 'Full Open Source',
    stack: 'Prometheus + Grafana + Loki + Tempo',
    monthlyLicenseCost: 0,
    monthlyInfraCost: 800,         // 3-4 VMs dediees
    monthlyOpsCost: 3000,          // ~20h/mois d'ops a 150$/h
    setupTimeWeeks: 4,
    maintenanceHoursPerMonth: 20,
    totalMonthlyCost: 3800,
  },
  {
    name: 'Grafana Cloud',
    stack: 'Grafana Cloud (Mimir + Loki + Tempo manages)',
    monthlyLicenseCost: 2500,
    monthlyInfraCost: 200,         // OTel Collectors seulement
    monthlyOpsCost: 750,           // ~5h/mois a 150$/h
    setupTimeWeeks: 1,
    maintenanceHoursPerMonth: 5,
    totalMonthlyCost: 3450,
  },
  {
    name: 'Datadog',
    stack: 'Datadog APM + Logs + Metrics',
    monthlyLicenseCost: 5000,
    monthlyInfraCost: 100,         // Agent seulement
    monthlyOpsCost: 300,           // ~2h/mois a 150$/h
    setupTimeWeeks: 0.5,
    maintenanceHoursPerMonth: 2,
    totalMonthlyCost: 5400,
  },
  {
    name: 'Hybride',
    stack: 'Prometheus+Grafana (metriques) + Datadog (traces)',
    monthlyLicenseCost: 2000,
    monthlyInfraCost: 400,
    monthlyOpsCost: 1500,          // ~10h/mois
    setupTimeWeeks: 2,
    maintenanceHoursPerMonth: 10,
    totalMonthlyCost: 3900,
  },
];
```

| Architecture | Licence | Infra | Ops | Total/mois | Setup | Maintenance |
|-------------|---------|-------|-----|------------|-------|-------------|
| **Full Open Source** | 0 $ | 800 $ | 3 000 $ | **3 800 $** | 4 sem. | 20h/mois |
| **Grafana Cloud** | 2 500 $ | 200 $ | 750 $ | **3 450 $** | 1 sem. | 5h/mois |
| **Datadog** | 5 000 $ | 100 $ | 300 $ | **5 400 $** | 3 jours | 2h/mois |
| **Hybride** | 2 000 $ | 400 $ | 1 500 $ | **3 900 $** | 2 sem. | 10h/mois |

::: tip Le cout cache du self-hosted
L'open source est "gratuit" en termes de licence, mais le cout operationnel est souvent sous-estime. Maintenir un cluster Prometheus en haute disponibilité, gérer les upgrades de Loki, debugger les pannes du Tempo backend — tout cela consomme du temps d'ingenieur. A 150 $/h charge, 20 heures de maintenance par mois representent 3 000 $/mois. C'est parfois plus cher que le SaaS.
:::

### Architecture hybride recommandee

Pour la plupart des organisations, l'architecture hybride offre le meilleur compromis :

```typescript
interface HybridArchitecture {
  pillar: string;
  solution: string;
  rationale: string;
  estimatedMonthlyCost: string;
}

const hybridArch: HybridArchitecture[] = [
  {
    pillar: 'Metriques',
    solution: 'Prometheus self-hosted (ou Mimir/Thanos pour le long terme)',
    rationale: 'Les metriques sont le pilier le moins couteux a operer. Prometheus est mature et fiable.',
    estimatedMonthlyCost: '200-500 $',
  },
  {
    pillar: 'Logs',
    solution: 'Loki (self-hosted ou Grafana Cloud)',
    rationale: 'Loki est economique car il n\'indexe que les labels, pas le contenu. Bien moins cher que Elasticsearch.',
    estimatedMonthlyCost: '300-1 000 $',
  },
  {
    pillar: 'Traces',
    solution: 'SaaS (Grafana Cloud Tempo, Datadog APM, ou Honeycomb)',
    rationale: 'Le tracing distribue est le plus complexe a operer. Deleguer au SaaS economise beaucoup de temps.',
    estimatedMonthlyCost: '500-2 000 $',
  },
  {
    pillar: 'Collection',
    solution: 'OpenTelemetry Collector (self-hosted)',
    rationale: 'Vendor-neutral, permet de changer de backend sans re-instrumenter. Le Collector est simple a operer.',
    estimatedMonthlyCost: '100-200 $',
  },
];
```

### Le modèle "phased rollout"

Ne déployer qu'au rythme du besoin réel permet d'éviter le surinvestissement :

| Phase | Ce qu'on deploie | Quand | Cout mensuel estime |
|-------|-----------------|-------|-------------------|
| **Phase 1** | Metriques RED + 3 dashboards + alertes SLO | Jour 1 | 200-500 $ |
| **Phase 2** | Logs structures (INFO uniquement) + correlation traceId | Mois 1-2 | +300-800 $ |
| **Phase 3** | Tracing distribue (sampling 5%) sur les services critiques | Mois 3-4 | +500-1 500 $ |
| **Phase 4** | Tracing complet avec tail-based sampling | Mois 6+ | +500-1 000 $ |
| **Phase 5** | Profiling continu, eBPF, observabilité avancee | Quand nécessaire | +500-2 000 $ |

---

## Gouvernance et politiques

### Budget d'observabilité par équipe

Attribuer un budget d'observabilité par équipe ou par service responsabilise les développeurs :

```typescript
interface ObservabilityBudget {
  team: string;
  services: string[];
  monthlyBudget: number;
  currentSpend: number;
  logVolumeQuotaGbPerDay: number;
  metricSeriesQuota: number;
  traceSpanQuotaPerDay: number;
}

const budgets: ObservabilityBudget[] = [
  {
    team: 'Platform',
    services: ['api-gateway', 'auth-service'],
    monthlyBudget: 1500,
    currentSpend: 1200,
    logVolumeQuotaGbPerDay: 50,
    metricSeriesQuota: 5000,
    traceSpanQuotaPerDay: 10_000_000,
  },
  {
    team: 'Commerce',
    services: ['order-service', 'payment-service', 'cart-service'],
    monthlyBudget: 2000,
    currentSpend: 2350,
    logVolumeQuotaGbPerDay: 80,
    metricSeriesQuota: 8000,
    traceSpanQuotaPerDay: 15_000_000,
  },
  {
    team: 'Data',
    services: ['analytics-service', 'etl-pipeline'],
    monthlyBudget: 800,
    currentSpend: 600,
    logVolumeQuotaGbPerDay: 30,
    metricSeriesQuota: 2000,
    traceSpanQuotaPerDay: 5_000_000,
  },
];

function generateBudgetReport(budgets: ObservabilityBudget[]): void {
  console.log('\n=== Rapport budgetaire observabilite ===\n');

  for (const budget of budgets) {
    const usage = (budget.currentSpend / budget.monthlyBudget) * 100;
    const status = usage > 100 ? 'DEPASSEMENT' : usage > 80 ? 'ATTENTION' : 'OK';

    console.log(`Equipe : ${budget.team} (${budget.services.join(', ')})`);
    console.log(`  Budget : ${budget.monthlyBudget} $/mois`);
    console.log(`  Depense : ${budget.currentSpend} $/mois (${usage.toFixed(0)} %)`);
    console.log(`  Statut : ${status}`);

    if (usage > 100) {
      console.log(`  ACTION REQUISE : depassement de ${(budget.currentSpend - budget.monthlyBudget)} $/mois`);
    }

    console.log('');
  }
}

generateBudgetReport(budgets);
```

### Alertes sur les couts d'observabilité (meta-observabilité)

Il est essentiel de **monitorer les couts du monitoring lui-même** :

```yaml
# prometheus-cost-alerts.yaml
groups:
  - name: observability-cost-alerts
    rules:
      # Alerte si le volume de logs depasse le quota
      - alert: LogVolumeExceedsQuota
        expr: |
          sum(rate(loki_distributor_bytes_received_total[1h])) by (tenant)
          * 3600 * 24 / (1024 * 1024 * 1024)
          > 100
        for: 30m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "Volume de logs depasse 100 Go/jour pour le tenant {{ $labels.tenant }}"
          description: "Volume actuel : {{ $value | printf \"%.1f\" }} Go/jour. Verifier les niveaux de log."

      # Alerte si la cardinalite des metriques explose
      - alert: MetricCardinalityExplosion
        expr: |
          prometheus_tsdb_head_series > 500000
        for: 15m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Cardinalite des metriques depasse 500 000 series"
          description: "Nombre actuel de series : {{ $value }}. Risque de crash Prometheus."

      # Alerte si le cout estime depasse le budget
      - alert: ObservabilityCostOverBudget
        expr: |
          observability_estimated_monthly_cost_dollars
          > observability_monthly_budget_dollars * 1.1
        for: 1h
        labels:
          severity: warning
          team: finops
        annotations:
          summary: "Cout d'observabilite depasse le budget de 10%"
          description: "Cout estime : {{ $value | printf \"%.0f\" }} $. Budget : {{ $labels.budget }} $."
```

### Template de politique d'observabilité

```typescript
interface ObservabilityPolicy {
  section: string;
  rules: string[];
}

const organizationPolicy: ObservabilityPolicy[] = [
  {
    section: 'Niveaux de log',
    rules: [
      'Production : niveau INFO par defaut',
      'DEBUG uniquement active temporairement (max 30 min) via endpoint admin',
      'Les logs de health check et readiness probe sont exclus a la source',
      'Taille maximale d\'un message de log : 4 Ko',
    ],
  },
  {
    section: 'Metriques',
    rules: [
      'Cardinalite maximale par metrique custom : 1 000 series',
      'Interdiction des labels user_id, session_id, request_id sur les metriques',
      'Toute nouvelle metrique custom doit etre approuvee par le lead SRE',
      'Review trimestrielle des metriques inutilisees',
    ],
  },
  {
    section: 'Traces',
    rules: [
      'Sampling rate par defaut : 5% (head-based)',
      'Tail-based sampling pour les services tier-1 (100% erreurs, 100% lentes)',
      'Taille maximale des attributs de span : 256 caracteres',
      'Les corps de requete/reponse ne doivent PAS etre inclus dans les spans',
    ],
  },
  {
    section: 'Retention',
    rules: [
      'Logs : 7 jours hot, 30 jours warm, 90 jours cold',
      'Metriques : 15 jours full resolution, 90 jours downsample, 1 an agregat',
      'Traces : 7 jours',
      'Exception : les traces d\'incidents sont archivees pendant 1 an',
    ],
  },
  {
    section: 'Budget',
    rules: [
      'Chaque equipe a un budget observabilite mensuel',
      'Depassement > 10% : notification automatique au team lead',
      'Depassement > 25% : review obligatoire sous 48h',
      'Review budgetaire globale chaque trimestre',
    ],
  },
  {
    section: 'Dashboards et alertes',
    rules: [
      'Un dashboard inutilise depuis 90 jours est automatiquement archive',
      'Chaque alerte doit avoir un runbook associe',
      'Review des alertes chaque trimestre : supprimer celles qui n\'ont jamais fire',
      'Maximum 20 alertes actives par service',
    ],
  },
];
```

### Review periodique

Planifiez une revue trimestrielle qui couvre :

1. **Dashboards** : lesquels sont utilises ? Lesquels n'ont pas ete ouverts depuis 90 jours ?
2. **Alertes** : lesquelles ont fire ? Lesquelles sont du bruit (toujours en firing ou jamais) ?
3. **Metriques** : quelles sont les top 10 metriques par cardinalite ? Sont-elles toutes nécessaires ?
4. **Logs** : quel est le top 10 des sources de volume ? Y a-t-il des logs DEBUG ou TRACE en production ?
5. **Budget** : sommes-nous dans les limites ? Ou sont les depassements ?

---

## Mesurer le ROI de l'observabilité

### Les metriques du ROI

Pour convaincre le management que l'observabilité vaut son cout, il faut la quantifier :

```typescript
interface ObservabilityROI {
  metric: string;
  before: string;
  after: string;
  improvement: string;
  financialImpact: string;
}

const roiMetrics: ObservabilityROI[] = [
  {
    metric: 'MTTR (Mean Time To Resolve)',
    before: '4 heures en moyenne',
    after: '25 minutes en moyenne',
    improvement: '-90%',
    financialImpact: 'Chaque heure d\'incident P1 coute ~10 000 $. Gain : ~37 500 $/incident',
  },
  {
    metric: 'Detection proactive vs reactive',
    before: '90% des incidents signales par les utilisateurs',
    after: '75% des incidents detectes avant impact utilisateur',
    improvement: '+65 points',
    financialImpact: 'Incidents evites = reputation preservee = retention client',
  },
  {
    metric: 'Temps de debug moyen',
    before: '2 heures (lecture de logs, reproduction)',
    after: '15 minutes (trace distribuee + correlation)',
    improvement: '-87%',
    financialImpact: '50 incidents/mois x 1.75h gagnees x 150 $/h = 13 125 $/mois',
  },
  {
    metric: 'Deployments annules/rollback',
    before: '15% des deployments annules (probleme detecte trop tard)',
    after: '3% des deployments annules (SLO-based deployment gate)',
    improvement: '-80%',
    financialImpact: 'Chaque rollback coute ~2h d\'equipe x 4 devs = economie significative',
  },
];
```

### Formule ROI

La formule fondamentale :

```
ROI = (Valeur generee - Cout de l'observabilite) / Cout de l'observabilite x 100
```

Ou plus concretement :

```
ROI = (Cout_incidents_evites + Gain_productivite - Cout_observabilite) / Cout_observabilite x 100
```

### Exemple concret avec chiffres

```typescript
interface ROICalculation {
  label: string;
  monthlyCost: number;
  description: string;
}

// Couts
const costs: ROICalculation[] = [
  { label: 'Plateforme SaaS (Grafana Cloud)', monthlyCost: 3000, description: 'Licence metriques + logs + traces' },
  { label: 'Infrastructure (OTel Collectors)', monthlyCost: 500, description: '2 VMs pour les collectors' },
  { label: 'Temps ingenieur (maintenance)', monthlyCost: 1500, description: '~10h/mois a 150$/h' },
];

// Gains
const gains: ROICalculation[] = [
  { label: 'Reduction MTTR', monthlyCost: 12500, description: '5 incidents P1/mois x 2.5h gagnees x 1 000 $/h (cout incident)' },
  { label: 'Detection proactive', monthlyCost: 8000, description: '2 incidents P1 evites/mois x 4 000 $ cout moyen' },
  { label: 'Productivite dev', monthlyCost: 6000, description: '40h de debug economisees/mois x 150 $/h' },
  { label: 'Deployments plus surs', monthlyCost: 2000, description: 'Reduction des rollbacks, moins de travail perdu' },
];

function calculateROI(costs: ROICalculation[], gains: ROICalculation[]): void {
  const totalCost = costs.reduce((sum, c) => sum + c.monthlyCost, 0);
  const totalGain = gains.reduce((sum, g) => sum + g.monthlyCost, 0);
  const roi = ((totalGain - totalCost) / totalCost) * 100;

  console.log('\n=== Calcul ROI de l\'observabilite ===\n');

  console.log('COUTS MENSUELS :');
  for (const cost of costs) {
    console.log(`  ${cost.label}: ${cost.monthlyCost.toLocaleString()} $ — ${cost.description}`);
  }
  console.log(`  TOTAL COUTS : ${totalCost.toLocaleString()} $/mois\n`);

  console.log('GAINS MENSUELS :');
  for (const gain of gains) {
    console.log(`  ${gain.label}: ${gain.monthlyCost.toLocaleString()} $ — ${gain.description}`);
  }
  console.log(`  TOTAL GAINS : ${totalGain.toLocaleString()} $/mois\n`);

  console.log(`BENEFICE NET : ${(totalGain - totalCost).toLocaleString()} $/mois`);
  console.log(`ROI : ${roi.toFixed(0)} %`);
  console.log(`\nPour chaque dollar investi en observabilite, l'organisation recupere ${(totalGain / totalCost).toFixed(1)} $.`);
}

calculateROI(costs, gains);
// TOTAL COUTS : 5 000 $/mois
// TOTAL GAINS : 28 500 $/mois
// BENEFICE NET : 23 500 $/mois
// ROI : 470 %
```

::: tip Presenter le ROI au management
Les chiffres de ROI sont impressionnants, mais le management aura confiance si vous pouvez montrer des **donnees reelles** : le MTTR avant et après l'implementation de l'observabilité, le nombre d'incidents detectes proactivement, le temps moyen de debug. Collectez ces donnees des le premier jour.
:::

---

## Aller plus loin

### OpenCost et Kubecost

Pour les environnements Kubernetes, des outils dedies permettent de mesurer et d'optimiser les couts :

- **OpenCost** (CNCF) : projet open source qui attribue les couts Kubernetes (CPU, mémoire, stockage, réseau) à chaque pod, namespace et deployment. Il peut s'intégrer avec Prometheus pour exposer des metriques de cout.
- **Kubecost** : version commerciale plus riche, avec des recommandations d'optimisation, des alertes budgetaires et des rapports de chargeback par équipe.

### FinOps Foundation

La [FinOps Foundation](https://www.finops.org/) (membre de la Linux Foundation) définit un cadre de pratiques pour gérer les couts cloud. Ses principes s'appliquent directement a l'observabilité :

1. **Equipes et collaboration** : les équipes doivent etre responsables de leurs couts d'observabilité
2. **Decisions basees sur la valeur business** : chaque investissement en observabilité doit etre justifie par un gain mesurable
3. **Modèle de responsabilite centralisee** : une équipe FinOps/Platform définit les politiques, les équipes produit les appliquent
4. **Rapports accessibles et en temps réel** : les couts d'observabilité doivent etre visibles par tous
5. **Optimisation continue** : les couts ne sont jamais "regles" — ils doivent etre revus regulierement

### Observabilité "on-demand"

Une approche avancee consiste a operer avec une granularite reduite en temps normal, et a **augmenter temporairement** la granularite en cas d'incident :

```typescript
interface OnDemandObservability {
  trigger: string;
  action: string;
  duration: string;
  costImpact: string;
}

const onDemandPolicies: OnDemandObservability[] = [
  {
    trigger: 'Alerte P1 sur un service',
    action: 'Passer le log level a DEBUG + sampling traces 100% pour le service',
    duration: '30 minutes (auto-reset)',
    costImpact: 'Temporaire, negligeable sur la facture mensuelle',
  },
  {
    trigger: 'Deploiement d\'une nouvelle version',
    action: 'Augmenter le sampling de traces a 25% pendant le canary',
    duration: '1 heure post-deployment',
    costImpact: '~5% du cout mensuel de traces en plus (amortissable)',
  },
  {
    trigger: 'Pic de trafic prevu (Black Friday)',
    action: 'Pre-scale les collectors, augmenter les quotas temporairement',
    duration: 'Duree de l\'evenement',
    costImpact: 'Budget dedie "evenement" prevu a l\'avance',
  },
];
```

### Références

- **"Controlling Observability Costs"** — talk de Charity Majors (Honeycomb), KubeCon 2023
- **FinOps Foundation** — [finops.org](https://www.finops.org/)
- **OpenCost** — [opencost.io](https://www.opencost.io/)
- **"Observability Engineering"** — Charity Majors, Liz Fong-Jones, George Miranda (O'Reilly) — Chapitre 14 sur les couts
- **Google SRE Workbook**, Chapitre 4 : "Service Level Objectives" — comprendre le rapport entre investissement et fiabilité
- **"The Hidden Costs of Observability"** — blog post Honeycomb
- **Datadog Pricing Calculator** — [datadoghq.com/pricing](https://www.datadoghq.com/pricing/)
- **Grafana Cloud Pricing** — [grafana.com/pricing](https://grafana.com/pricing/)

---

## Résumé

### Checklist FinOps Observabilité

- [ ] **Inventaire** : lister tous les couts d'observabilité (ingestion, stockage, requêtes, licences, ops)
- [ ] **Audit des logs** : vérifier les niveaux de log en production (pas de DEBUG !), filtrer les health checks
- [ ] **Audit de cardinalite** : identifier les metriques a haute cardinalite, eliminer les labels inutiles
- [ ] **Sampling des traces** : implementer un tail-based sampling qui garde les erreurs et les requêtes lentes
- [ ] **Retention tiered** : configurer hot/warm/cold/archive pour chaque type de donnee
- [ ] **Budget par équipe** : attribuer un quota et alerter sur les depassements
- [ ] **Recording rules** : pre-calculer les agregations pour reduire la cardinalite a long terme
- [ ] **Downsampling** : reduire la résolution des metriques anciennes
- [ ] **Review trimestrielle** : supprimer les dashboards, alertes et metriques inutilises
- [ ] **Mesurer le ROI** : collecter les metriques avant/après pour justifier l'investissement
- [ ] **Politique ecrite** : documenter et faire appliquer la politique d'observabilité de l'organisation
- [ ] **Meta-observabilité** : monitorer les couts du monitoring lui-même

---

::: tip A retenir
- L'observabilité peut devenir un poste de depense majeur si elle n'est pas gérée activement
- **90% des donnees collectees ne sont jamais consultees** — concentrez-vous sur les donnees a forte valeur
- Les trois leviers principaux : **filtrage à la source**, **sampling intelligent**, **retention tiered**
- Le **tail-based sampling** est le meilleur compromis cout/visibilite pour les traces
- La **cardinalite** est le piege principal des metriques — chaque label est un multiplicateur de cout
- Le **ROI** de l'observabilité est généralement très eleve (4x a 10x), mais il faut le mesurer
- La **gouvernance** (budgets, quotas, reviews) est aussi importante que la technique
- Privilegiez une approche **phased rollout** : commencez simple, ajoutez au fur et à mesure des besoins réels
:::

---

## Prochaines étapes

- [Lab 21 — Audit FinOps et optimisation des couts d'observabilité](/labs/lab-21-finops-observability/README)
- [Quiz 20 — FinOps et Cout de l'Observabilité](/quizzes/quiz-20-finops-observability)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 20 finops observability](../screencasts/screencast-20-finops-observability.md)
2. **Lab** : [lab-21-finops-observability](../labs/lab-21-finops-observability/README)
3. **Quiz** : [quiz 20 finops observability](../quizzes/quiz-20-finops-observability.html)
:::
