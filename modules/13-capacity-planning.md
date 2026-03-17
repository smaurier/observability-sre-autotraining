# Capacity Planning & Load Testing (k6)

## Objectifs pedagogiques

- Comprendre les fondamentaux du capacity planning
- Utiliser `predict_linear()` en PromQL pour anticiper les problèmes
- Decouvrir k6, un outil de load testing base sur JavaScript/TypeScript
- Maîtriser les scenarios k6 : ramp-up, steady-state, spike, soak
- Configurer des thresholds et checks dans k6
- Interpreter les résultats de tests de charge
- Intégrer le load testing dans un pipeline CI/CD

---

## Introduction : anticiper plutot que subir

Imaginez que vous gerez un parking de 100 places. Chaque jour, 10 nouvelles voitures s'inscrivent. Si vous ne faites rien, dans 10 jours le parking est plein et les clients sont furieux. Le capacity planning, c'est regarder la tendance **aujourd'hui** pour agir **avant** la saturation.

En SRE, le capacity planning repond a deux questions :
1. **Quand** nos ressources actuelles seront-elles insuffisantes ?
2. **Combien** de charge notre système peut-il supporter avant de degrader ?

---

## Fondamentaux du capacity planning

### Les dimensions a surveiller

```typescript
interface CapacityDimension {
  resource: string;
  currentUsage: number;
  maxCapacity: number;
  unit: string;
  growthRatePerDay: number;
}

const dimensions: CapacityDimension[] = [
  {
    resource: 'CPU',
    currentUsage: 65,
    maxCapacity: 100,
    unit: '%',
    growthRatePerDay: 0.5, // +0.5% par jour
  },
  {
    resource: 'Memoire',
    currentUsage: 12,
    maxCapacity: 32,
    unit: 'GB',
    growthRatePerDay: 0.05, // +50 MB par jour
  },
  {
    resource: 'Stockage (disque)',
    currentUsage: 450,
    maxCapacity: 1000,
    unit: 'GB',
    growthRatePerDay: 2, // +2 GB par jour
  },
  {
    resource: 'Connexions DB',
    currentUsage: 150,
    maxCapacity: 200,
    unit: 'connexions',
    growthRatePerDay: 1, // +1 connexion par jour
  },
];

function daysUntilSaturation(dim: CapacityDimension): number {
  const remaining = dim.maxCapacity - dim.currentUsage;
  return Math.floor(remaining / dim.growthRatePerDay);
}

// Rapport de capacite
for (const dim of dimensions) {
  const days = daysUntilSaturation(dim);
  const usagePercent = ((dim.currentUsage / dim.maxCapacity) * 100).toFixed(1);
  console.log(
    `${dim.resource}: ${dim.currentUsage}/${dim.maxCapacity} ${dim.unit} ` +
    `(${usagePercent}%) — saturation dans ${days} jours`,
  );
}
// CPU: 65/100 % (65.0%) — saturation dans 70 jours
// Memoire: 12/32 GB (37.5%) — saturation dans 400 jours
// Stockage: 450/1000 GB (45.0%) — saturation dans 275 jours
// Connexions DB: 150/200 connexions (75.0%) — saturation dans 50 jours
```

### predict_linear() en PromQL

La fonction `predict_linear()` de Prometheus extrapoler la tendance lineaire pour predire une valeur future :

```promql
# Predire l'utilisation disque dans 7 jours (en octets)
predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[7d], 7 * 24 * 3600)

# Alerter si le disque sera plein dans moins de 4 jours
node_filesystem_avail_bytes{mountpoint="/"} > 0
and
predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[7d], 4 * 24 * 3600) < 0
```

```promql
# Predire quand le pool de connexions sera sature
predict_linear(pg_stat_activity_count[24h], 7 * 24 * 3600)
> on() pg_settings_max_connections
```

```typescript
// Equivalent TypeScript de predict_linear
function predictLinear(
  dataPoints: Array<{ timestamp: number; value: number }>,
  futureSeconds: number,
): number {
  const n = dataPoints.length;
  if (n < 2) throw new Error('Au moins 2 points necessaires');

  // Regression lineaire simple (methode des moindres carres)
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

  for (const point of dataPoints) {
    sumX += point.timestamp;
    sumY += point.value;
    sumXY += point.timestamp * point.value;
    sumXX += point.timestamp * point.timestamp;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const futureTimestamp = dataPoints[n - 1].timestamp + futureSeconds;
  return slope * futureTimestamp + intercept;
}

// Utilisation : predire l'utilisation CPU dans 7 jours
const cpuHistory = [
  { timestamp: 0, value: 60 },
  { timestamp: 86400, value: 60.5 },
  { timestamp: 172800, value: 61.2 },
  { timestamp: 259200, value: 61.8 },
  { timestamp: 345600, value: 62.1 },
  { timestamp: 432000, value: 62.7 },
  { timestamp: 518400, value: 63.3 },
];

const prediction = predictLinear(cpuHistory, 7 * 86400);
console.log(`CPU prevu dans 7 jours: ${prediction.toFixed(1)}%`);
```

---

## k6 — Introduction

### Qu'est-ce que k6 ?

**k6** est un outil de load testing open source créé par Grafana Labs. Il se distingue par :
- Scripts en **JavaScript/TypeScript** (pas de XML ni de YAML)
- Faible consommation de ressources (écrit en Go)
- Metriques exposees au format Prometheus
- Intégration native avec Grafana Cloud

### Installation et premier test

```typescript
// k6-test.ts — Premier test de charge
import http from 'k6/http';
import { check, sleep } from 'k6';

// Configuration du test
export const options = {
  // 10 utilisateurs virtuels pendant 30 secondes
  vus: 10,
  duration: '30s',

  // Seuils de reussite
  thresholds: {
    http_req_duration: ['p(95)<300'], // 95% des requetes < 300ms
    http_req_failed: ['rate<0.01'],   // Moins de 1% d'echecs
  },
};

export default function () {
  // Simuler un utilisateur qui navigue
  const res = http.get('http://localhost:3000/api/products');

  // Verifications
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 300ms': (r) => r.timings.duration < 300,
    'body contains products': (r) => {
      const body = r.body as string;
      return body.includes('products');
    },
  });

  // Temps de reflexion (simule un vrai utilisateur)
  sleep(1);
}
```

---

## Scenarios k6

### Les quatre types de scenarios

```typescript
// scenario-rampup.ts — Montee en charge progressive
export const options = {
  stages: [
    { duration: '2m', target: 20 },   // Montee a 20 VUs en 2 min
    { duration: '5m', target: 20 },   // Stabilise a 20 VUs pendant 5 min
    { duration: '2m', target: 0 },    // Descente a 0 en 2 min
  ],
};
```

```typescript
// scenario-spike.ts — Test de pic de charge
export const options = {
  stages: [
    { duration: '1m', target: 10 },    // Warm-up
    { duration: '30s', target: 200 },   // SPIKE : montee brutale a 200 VUs
    { duration: '1m', target: 200 },    // Maintien du pic
    { duration: '30s', target: 10 },    // Retour a la normale
    { duration: '2m', target: 10 },     // Stabilisation
    { duration: '1m', target: 0 },      // Fin
  ],
};
```

```typescript
// scenario-soak.ts — Test d'endurance (fuite memoire, connexions)
export const options = {
  stages: [
    { duration: '5m', target: 50 },    // Montee
    { duration: '4h', target: 50 },    // SOAK : charge constante pendant 4 heures
    { duration: '5m', target: 0 },     // Descente
  ],
};
```

```typescript
// scenario-stress.ts — Test de stress (trouver le point de rupture)
export const options = {
  stages: [
    { duration: '2m', target: 50 },    // Palier 1
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },   // Palier 2
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },   // Palier 3
    { duration: '5m', target: 200 },
    { duration: '2m', target: 300 },   // Palier 4 (ou est le point de rupture ?)
    { duration: '5m', target: 300 },
    { duration: '5m', target: 0 },     // Cooldown
  ],
};
```

### Analogie des scenarios

| Scenario | Analogie | Objectif |
|----------|----------|----------|
| **Ramp-up** | Ouverture progressive d'un magasin | Vérifier le comportement sous charge normale |
| **Spike** | Black Friday : afflux soudain de clients | Tester la résilience aux pics |
| **Soak** | Un magasin ouvert 24h/24 pendant une semaine | Detecter les fuites (mémoire, connexions) |
| **Stress** | Ajouter des clients jusqu'a ce que le magasin soit submerge | Trouver les limites |

---

## Thresholds et Checks

### Thresholds (criteres de reussite globaux)

```typescript
export const options = {
  thresholds: {
    // Latence
    http_req_duration: [
      'p(50)<100',    // Mediane < 100ms
      'p(95)<300',    // p95 < 300ms
      'p(99)<500',    // p99 < 500ms
      'max<2000',     // Aucune requete > 2s
    ],

    // Taux d'erreur
    http_req_failed: [
      'rate<0.01',    // < 1% d'echecs
    ],

    // Throughput
    http_reqs: [
      'rate>100',     // Au moins 100 req/s
    ],

    // Checks passes
    checks: [
      'rate>0.95',    // 95% des checks passent
    ],
  },
};
```

### Checks (verifications par requête)

```typescript
import http from 'k6/http';
import { check } from 'k6';

export default function () {
  // Test de l'endpoint de sante
  const healthRes = http.get('http://localhost:3000/health');
  check(healthRes, {
    'health status 200': (r) => r.status === 200,
    'health response time < 50ms': (r) => r.timings.duration < 50,
  });

  // Test de l'endpoint principal
  const apiRes = http.get('http://localhost:3000/api/orders');
  check(apiRes, {
    'orders status 200': (r) => r.status === 200,
    'orders body is array': (r) => {
      try {
        const body = JSON.parse(r.body as string);
        return Array.isArray(body);
      } catch {
        return false;
      }
    },
    'orders response time < 300ms': (r) => r.timings.duration < 300,
  });
}
```

---

## Interpreter les résultats k6

### Sortie typique

```
          /\      |‾‾| /‾‾/   /‾‾/
     /\  /  \     |  |/  /   /  /
    /  \/    \    |     (   /   ‾‾\
   /          \   |  |\  \ |  (‾)  |
  / __________ \  |__| \__\ \_____/ .io

  execution: local
     script: load-test.ts
     output: -

  scenarios: (100.00%) 1 scenario, 50 max VUs, 10m30s max duration

     data_received..................: 12 MB   20 kB/s
     data_sent......................: 1.2 MB  2.0 kB/s
     http_req_blocked...............: avg=2.1ms  p(95)=8.5ms
     http_req_duration..............: avg=45ms   p(50)=38ms  p(95)=120ms  p(99)=280ms
       { expected_response:true }...: avg=42ms   p(50)=35ms  p(95)=110ms
     http_req_failed................: 0.23%   ✓ 23   ✗ 9977
     http_reqs......................: 10000   166.6/s
     checks.........................: 98.50%  ✓ 9850  ✗ 150
```

### Analyse en TypeScript

```typescript
interface K6Result {
  httpReqDuration: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
  httpReqFailed: number; // taux d'echec (0-1)
  httpReqs: number;      // req/s
  checksPassRate: number; // taux de checks reussis (0-1)
  dataSent: number;       // bytes
  dataReceived: number;   // bytes
}

function analyzeResults(result: K6Result): string[] {
  const findings: string[] = [];

  // Latence
  if (result.httpReqDuration.p95 > 300) {
    findings.push(
      `ALERTE: p95 latence (${result.httpReqDuration.p95}ms) depasse le seuil SLO de 300ms`,
    );
  }

  if (result.httpReqDuration.p99 / result.httpReqDuration.p50 > 10) {
    findings.push(
      `ATTENTION: ecart p99/p50 de ${(result.httpReqDuration.p99 / result.httpReqDuration.p50).toFixed(1)}x. ` +
      'Des outliers significatifs existent (verifier les requetes lentes).',
    );
  }

  // Taux d'erreur
  if (result.httpReqFailed > 0.001) {
    findings.push(
      `ALERTE: taux d'erreur de ${(result.httpReqFailed * 100).toFixed(2)}% (seuil SLO: 0.1%)`,
    );
  }

  // Throughput
  if (result.httpReqs < 100) {
    findings.push(
      `INFO: throughput de ${result.httpReqs} req/s. Verifier si c'est suffisant pour le trafic attendu.`,
    );
  }

  if (findings.length === 0) {
    findings.push('Tous les indicateurs sont dans les limites acceptables.');
  }

  return findings;
}
```

---

## Load testing dans le CI/CD

### Intégration dans un pipeline GitHub Actions

```yaml
# .github/workflows/load-test.yml
name: Load Test
on:
  pull_request:
    branches: [main]

jobs:
  load-test:
    runs-on: ubuntu-latest
    services:
      app:
        image: demo-app:latest
        ports:
          - 3000:3000

    steps:
      - uses: actions/checkout@v4

      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
            --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
            | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update && sudo apt-get install k6

      - name: Run load test
        run: k6 run --out json=results.json tests/load/smoke-test.ts

      - name: Check results
        run: |
          # Le test echoue si les thresholds ne sont pas respectes
          # k6 retourne un exit code != 0 dans ce cas
          echo "Load test passe avec succes"
```

### Stratégie de test par environnement

```typescript
interface LoadTestStrategy {
  environment: string;
  scenario: string;
  vus: number;
  duration: string;
  thresholds: Record<string, string[]>;
}

const strategies: LoadTestStrategy[] = [
  {
    environment: 'CI (Pull Request)',
    scenario: 'smoke',
    vus: 5,
    duration: '30s',
    thresholds: {
      http_req_duration: ['p(95)<500'],
      http_req_failed: ['rate<0.05'],
    },
  },
  {
    environment: 'Staging (pre-deploy)',
    scenario: 'load',
    vus: 50,
    duration: '5m',
    thresholds: {
      http_req_duration: ['p(95)<300'],
      http_req_failed: ['rate<0.01'],
    },
  },
  {
    environment: 'Performance (hebdomadaire)',
    scenario: 'stress + soak',
    vus: 200,
    duration: '2h',
    thresholds: {
      http_req_duration: ['p(95)<300', 'p(99)<1000'],
      http_req_failed: ['rate<0.001'],
    },
  },
];
```

---

## Identifier les bottlenecks

### Approche methodique

```typescript
interface BottleneckAnalysis {
  resource: string;
  metric: string;
  threshold: number;
  observed: number;
  isBottleneck: boolean;
  recommendation: string;
}

function analyzeBottlenecks(
  cpuPercent: number,
  memoryPercent: number,
  dbConnectionsPercent: number,
  diskIOPercent: number,
  networkBandwidthPercent: number,
): BottleneckAnalysis[] {
  const analyses: BottleneckAnalysis[] = [
    {
      resource: 'CPU',
      metric: 'utilisation',
      threshold: 80,
      observed: cpuPercent,
      isBottleneck: cpuPercent > 80,
      recommendation: 'Optimiser le code CPU-intensive ou augmenter les replicas',
    },
    {
      resource: 'Memoire',
      metric: 'utilisation',
      threshold: 85,
      observed: memoryPercent,
      isBottleneck: memoryPercent > 85,
      recommendation: 'Verifier les fuites memoire, augmenter la RAM ou les replicas',
    },
    {
      resource: 'Connexions DB',
      metric: 'pool usage',
      threshold: 75,
      observed: dbConnectionsPercent,
      isBottleneck: dbConnectionsPercent > 75,
      recommendation: 'Optimiser les requetes, augmenter le pool, ajouter du caching',
    },
    {
      resource: 'Disk I/O',
      metric: 'utilisation',
      threshold: 70,
      observed: diskIOPercent,
      isBottleneck: diskIOPercent > 70,
      recommendation: 'Passer en SSD, reduire les ecritures, augmenter le cache OS',
    },
    {
      resource: 'Reseau',
      metric: 'bande passante',
      threshold: 70,
      observed: networkBandwidthPercent,
      isBottleneck: networkBandwidthPercent > 70,
      recommendation: 'Compresser les reponses, utiliser un CDN, reduire le payload',
    },
  ];

  return analyses;
}

// Exemple apres un test k6
const bottlenecks = analyzeBottlenecks(92, 45, 88, 30, 15);
const issues = bottlenecks.filter((b) => b.isBottleneck);

for (const issue of issues) {
  console.log(`BOTTLENECK: ${issue.resource} a ${issue.observed}% (seuil: ${issue.threshold}%)`);
  console.log(`  Recommandation: ${issue.recommendation}`);
}
// BOTTLENECK: CPU a 92% (seuil: 80%)
//   Recommandation: Optimiser le code CPU-intensive ou augmenter les replicas
// BOTTLENECK: Connexions DB a 88% (seuil: 75%)
//   Recommandation: Optimiser les requetes, augmenter le pool, ajouter du caching
```

---

## Approche "Capacity Planning Spreadsheet"

```typescript
interface CapacityPlan {
  service: string;
  currentRPS: number;
  maxTestedRPS: number;
  growthRatePerMonth: number; // en %
  currentHeadroom: number;

  monthsUntilSaturation(): number;
  requiredCapacityInMonths(months: number): number;
}

function createCapacityPlan(
  service: string,
  currentRPS: number,
  maxTestedRPS: number,
  growthRatePerMonth: number,
): CapacityPlan {
  return {
    service,
    currentRPS,
    maxTestedRPS,
    growthRatePerMonth,
    currentHeadroom: maxTestedRPS / currentRPS,

    monthsUntilSaturation() {
      // currentRPS * (1 + growth)^n = maxTestedRPS
      // n = log(maxTestedRPS / currentRPS) / log(1 + growth)
      return Math.floor(
        Math.log(this.maxTestedRPS / this.currentRPS) /
        Math.log(1 + this.growthRatePerMonth / 100),
      );
    },

    requiredCapacityInMonths(months: number) {
      return this.currentRPS * Math.pow(1 + this.growthRatePerMonth / 100, months);
    },
  };
}

// Planification
const apiPlan = createCapacityPlan('API Gateway', 500, 2000, 10);

console.log(`Service: ${apiPlan.service}`);
console.log(`Headroom actuel: ${apiPlan.currentHeadroom.toFixed(1)}x`);
console.log(`Mois avant saturation: ${apiPlan.monthsUntilSaturation()}`);
console.log(`RPS requis dans 6 mois: ${apiPlan.requiredCapacityInMonths(6).toFixed(0)}`);
console.log(`RPS requis dans 12 mois: ${apiPlan.requiredCapacityInMonths(12).toFixed(0)}`);
```

---

## Bonnes pratiques

1. **Testez en conditions realistes** : memes donnees, même réseau, memes dépendances qu'en production
2. **Automatisez dans la CI** : un smoke test k6 sur chaque PR, un load test complet en staging
3. **Mesurez, ne devinez pas** : le bottleneck est rarement la ou vous pensez
4. **Gardez une marge (headroom)** : visez un facteur 2x-3x au minimum entre la charge actuelle et la capacité max
5. **Revisez mensuellement** : le capacity plan est un document vivant, pas un one-shot
6. **Utilisez predict_linear()** : pour des alertes proactives avant saturation
7. **Testez les pics** : les scenarios spike sont aussi importants que les scenarios load
8. **Documentez les limites** : "notre API supporte 2000 req/s avant degradation" est une info precieuse

---

::: tip A retenir
- Le **capacity planning** anticipe les besoins en ressources avant la saturation
- **predict_linear()** en PromQL extrapole les tendances pour alerter proactivement
- **k6** est un outil de load testing en JavaScript/TypeScript, leger et puissant
- Les 4 scenarios : **ramp-up** (normal), **spike** (pic), **soak** (endurance), **stress** (limites)
- Les **thresholds** definissent les criteres de reussite globaux, les **checks** verifient chaque requête
- Integrez le load testing dans la **CI/CD** : smoke en PR, load en staging, stress periodiquement
- Identifiez les **bottlenecks** systematiquement : CPU, mémoire, DB, disk I/O, réseau
:::

---

## Pour aller plus loin

- [Lab 13 — Load Testing avec k6](/labs/lab-13-load-testing-k6/README)
- [Quiz 13 — Capacity Planning](/quizzes/quiz-13-capacity-planning)
- k6 Documentation officielle : https://k6.io/docs/
- Google SRE Book, Chapitre 18 : "Software Engineering in SRE"

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 13 capacity planning](../screencasts/screencast-13-capacity-planning.md)
2. **Lab** : [lab-13-load-testing-k6](../labs/lab-13-load-testing-k6/README)
3. **Quiz** : [quiz 13 capacity planning](../quizzes/quiz-13-capacity-planning.html)
:::
