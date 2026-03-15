// =============================================================================
// Lab 04 — Métriques et Prometheus (simulation en TypeScript)
// =============================================================================
// Executer avec : npx tsx exercise.ts
// =============================================================================

// =============================================================================
// Types
// =============================================================================

type MetricType = 'counter' | 'gauge' | 'histogram';

interface MetricSample {
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

// =============================================================================
// PARTIE 1 — Counter
// =============================================================================
// Objectif : Implementer un compteur qui ne fait qu'augmenter.
//
// TODO: Implementez Counter avec :
//   - inc(labels, amount=1) : incremente le compteur
//   - get(labels) : retourne la valeur actuelle
//   - Le compteur est indexe par la combinaison de labels serialisee
//
// 💡 Indice : Serialisez les labels avec JSON.stringify(sorted keys)

class Counter {
  name: string;
  private values = new Map<string, number>();

  constructor(name: string) { this.name = name; }

  inc(_labels: Record<string, string> = {}, _amount = 1): void {
    // TODO
    console.log('  TODO: Implementer Counter.inc()');
  }

  get(_labels: Record<string, string> = {}): number {
    // TODO
    console.log('  TODO: Implementer Counter.get()');
    return 0;
  }

  private labelKey(labels: Record<string, string>): string {
    return JSON.stringify(Object.entries(labels).sort());
  }
}

// =============================================================================
// PARTIE 2 — Gauge
// =============================================================================
// Objectif : Implementer une jauge (valeur qui monte et descend).
//
// TODO: Implementez Gauge avec :
//   - set(value) : definit la valeur
//   - inc(amount=1) / dec(amount=1) : incremente/decremente
//   - get() : retourne la valeur

class Gauge {
  name: string;
  private value = 0;

  constructor(name: string) { this.name = name; }

  set(_value: number): void { console.log('  TODO: Implementer Gauge.set()'); }
  inc(_amount = 1): void { console.log('  TODO: Implementer Gauge.inc()'); }
  dec(_amount = 1): void { console.log('  TODO: Implementer Gauge.dec()'); }
  get(): number { return this.value; }
}

// =============================================================================
// PARTIE 3 — Histogram
// =============================================================================
// Objectif : Implementer un histogramme avec des buckets.
//
// TODO: Implementez Histogram avec :
//   - observe(value) : enregistre une observation dans le bon bucket
//   - Les buckets sont des seuils : [0.01, 0.05, 0.1, 0.5, 1, 5]
//   - Chaque bucket compte le nombre d'observations <= seuil
//   - Garder aussi sum et count totaux
//
// 💡 Indice : Un bucket 0.5 contient TOUTES les observations <= 0.5

class Histogram {
  name: string;
  private bucketThresholds: number[];
  private bucketCounts: number[];
  private sum = 0;
  private count = 0;

  constructor(name: string, buckets: number[] = [0.01, 0.05, 0.1, 0.5, 1, 5]) {
    this.name = name;
    this.bucketThresholds = [...buckets].sort((a, b) => a - b);
    this.bucketCounts = new Array(buckets.length).fill(0);
  }

  observe(_value: number): void {
    // TODO: Incrementer sum, count, et les buckets appropriés
    console.log('  TODO: Implementer Histogram.observe()');
  }

  // Retourne le percentile approximatif
  percentile(p: number): number {
    const target = this.count * p;
    for (let i = 0; i < this.bucketCounts.length; i++) {
      if (this.bucketCounts[i] >= target) {
        return this.bucketThresholds[i];
      }
    }
    return this.bucketThresholds[this.bucketThresholds.length - 1];
  }

  getCount(): number { return this.count; }
  getSum(): number { return this.sum; }
}

// =============================================================================
// PARTIE 4 — PromQL rate() simulation
// =============================================================================
// Objectif : Calculer le taux par seconde (rate) sur une fenetre de temps.
//
// TODO: Implementez computeRate(samples, windowMs) qui :
//   1. Filtre les samples dans la fenetre [now - windowMs, now]
//   2. Calcule (derniere valeur - premiere valeur) / (duree en secondes)

function computeRate(_samples: MetricSample[], _windowMs: number): number {
  // TODO
  console.log('  TODO: Implementer computeRate()');
  return 0;
}

// =============================================================================
// Tests
// =============================================================================

async function runTests() {
  console.log('\n=== Lab 04 — Métriques et Prometheus ===\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Counter
  const httpReqs = new Counter('http_requests_total');
  httpReqs.inc({ method: 'GET', status: '200' });
  httpReqs.inc({ method: 'GET', status: '200' });
  httpReqs.inc({ method: 'POST', status: '500' });
  if (httpReqs.get({ method: 'GET', status: '200' }) === 2 && httpReqs.get({ method: 'POST', status: '500' }) === 1) {
    console.log('  ✅ Test 1: Counter fonctionne (GET=2, POST=1)');
    passed++;
  } else {
    console.log('  ❌ Test 1: Counter echoue');
    failed++;
  }

  // Test 2: Gauge
  const connections = new Gauge('active_connections');
  connections.set(10);
  connections.inc(5);
  connections.dec(3);
  if (connections.get() === 12) {
    console.log('  ✅ Test 2: Gauge fonctionne (10+5-3=12)');
    passed++;
  } else {
    console.log(`  ❌ Test 2: Gauge echoue (${connections.get()})`);
    failed++;
  }

  // Test 3: Histogram
  const latency = new Histogram('request_duration_seconds');
  [0.005, 0.02, 0.08, 0.15, 0.3, 0.7, 2, 0.04, 0.09, 0.5].forEach((v) => latency.observe(v));
  const p50 = latency.percentile(0.5);
  const p99 = latency.percentile(0.99);
  if (latency.getCount() === 10 && p50 <= 0.5 && p99 >= 1) {
    console.log(`  ✅ Test 3: Histogram fonctionne (count=10, P50=${p50}, P99=${p99})`);
    passed++;
  } else {
    console.log(`  ❌ Test 3: Histogram echoue (count=${latency.getCount()}, P50=${p50}, P99=${p99})`);
    failed++;
  }

  // Test 4: Rate
  const now = Date.now();
  const samples: MetricSample[] = [
    { value: 100, labels: {}, timestamp: now - 5000 },
    { value: 110, labels: {}, timestamp: now - 4000 },
    { value: 130, labels: {}, timestamp: now - 3000 },
    { value: 160, labels: {}, timestamp: now - 2000 },
    { value: 200, labels: {}, timestamp: now - 1000 },
  ];
  const rate = computeRate(samples, 5000);
  // (200 - 100) / 4 seconds = 25 req/s
  if (Math.abs(rate - 25) < 1) {
    console.log(`  ✅ Test 4: Rate = ${rate.toFixed(1)} req/s (attendu ~25)`);
    passed++;
  } else {
    console.log(`  ❌ Test 4: Rate = ${rate.toFixed(1)} (attendu ~25)`);
    failed++;
  }

  console.log(`\n  Resultats: ${passed}/${passed + failed} tests passes\n`);
}

setTimeout(runTests, 0);
