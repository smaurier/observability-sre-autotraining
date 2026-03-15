// =============================================================================
// Lab 04 — Métriques et Prometheus (Solution)
// =============================================================================
// Executer avec : npx tsx solution.ts
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

class Counter {
  name: string;
  private values = new Map<string, number>();

  constructor(name: string) { this.name = name; }

  inc(labels: Record<string, string> = {}, amount = 1): void {
    // POURQUOI : Un counter ne peut qu'augmenter. On l'utilise pour les
    // requêtes totales, les erreurs totales, les octets transmis, etc.
    // La clé est la combinaison de labels sérialisée — chaque combinaison
    // unique (method=GET, status=200) a sa propre série temporelle.
    const key = this.labelKey(labels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current + amount);
  }

  get(labels: Record<string, string> = {}): number {
    // POURQUOI : On retourne 0 si la combinaison de labels n'existe pas encore.
    // C'est cohérent avec Prometheus qui traite les séries absentes comme 0.
    const key = this.labelKey(labels);
    return this.values.get(key) ?? 0;
  }

  private labelKey(labels: Record<string, string>): string {
    // POURQUOI : On trie les clés pour que {method:"GET", status:"200"}
    // et {status:"200", method:"GET"} donnent la même clé.
    return JSON.stringify(Object.entries(labels).sort());
  }
}

// =============================================================================
// PARTIE 2 — Gauge
// =============================================================================

class Gauge {
  name: string;
  private value = 0;

  constructor(name: string) { this.name = name; }

  set(value: number): void {
    // POURQUOI : Un gauge peut monter ET descendre. On l'utilise pour les
    // valeurs instantanées : connexions actives, température, mémoire utilisée.
    this.value = value;
  }

  inc(amount = 1): void {
    // POURQUOI : Raccourci pour set(get() + amount). Pratique pour
    // tracker des connexions qui s'ouvrent.
    this.value += amount;
  }

  dec(amount = 1): void {
    // POURQUOI : Raccourci pour set(get() - amount). Pratique pour
    // tracker des connexions qui se ferment.
    this.value -= amount;
  }

  get(): number { return this.value; }
}

// =============================================================================
// PARTIE 3 — Histogram
// =============================================================================

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

  observe(value: number): void {
    // POURQUOI : L'histogramme est cumulatif — le bucket 0.5 contient TOUTES
    // les observations <= 0.5 (pas seulement celles entre 0.1 et 0.5).
    // C'est ce qui permet à Prometheus de calculer les percentiles avec
    // histogram_quantile() même après agrégation.
    this.sum += value;
    this.count++;
    for (let i = 0; i < this.bucketThresholds.length; i++) {
      if (value <= this.bucketThresholds[i]) {
        this.bucketCounts[i]++;
      }
    }
  }

  percentile(p: number): number {
    // POURQUOI : On cherche le premier bucket dont le count cumulé >= p * total.
    // C'est une approximation — on sait seulement que la valeur est <= au seuil
    // du bucket, pas sa valeur exacte. Plus les buckets sont fins, plus c'est précis.
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

function computeRate(samples: MetricSample[], windowMs: number): number {
  // POURQUOI : rate() est LA fonction fondamentale de PromQL pour les counters.
  // Elle calcule le taux de changement par seconde sur une fenêtre de temps.
  // Formule : (dernière valeur - première valeur) / (durée en secondes)
  //
  // En vrai Prometheus, rate() gère aussi les resets de counter (quand un
  // process redémarre, le counter repart à 0). Ici on simplifie.
  const now = Date.now();
  const windowStart = now - windowMs;

  // Filtrer les samples dans la fenêtre
  const inWindow = samples
    .filter((s) => s.timestamp >= windowStart && s.timestamp <= now)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (inWindow.length < 2) return 0;

  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const durationSeconds = (last.timestamp - first.timestamp) / 1000;

  if (durationSeconds === 0) return 0;

  return (last.value - first.value) / durationSeconds;
}

// =============================================================================
// Tests
// =============================================================================

async function runTests() {
  console.log('\n=== Lab 04 — Métriques et Prometheus (Solution) ===\n');

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
