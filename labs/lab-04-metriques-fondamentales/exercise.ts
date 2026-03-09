// =============================================================================
// Lab 04 — Premiers pas metriques
// =============================================================================
// Objectifs :
//   - Implementer Counter, Gauge, Histogram from scratch
//   - Comprendre les cas d'usage de chaque type de metrique
//   - Calculer des percentiles a partir d'un Histogram
// =============================================================================

import { createTestRunner, calculatePercentile } from '../test-utils.ts';
const { test, assert, assertEqual, assertGreaterThan, assertLessThan, summary } =
  createTestRunner('Lab 04 — Premiers pas metriques');

// =============================================================================
// Exercice 1 : Counter
// Un compteur ne fait que monter (increment). Il ne peut jamais diminuer.
// Typiquement utilise pour : nombre de requetes, erreurs, octets envoyes.
// =============================================================================

// TODO: Implementez la classe Counter
// - Le constructeur prend un nom (string) et des labels optionnels
// - inc(value?: number) : incremente de value (defaut 1), erreur si value < 0
// - get() : retourne la valeur courante
// - reset() : remet le compteur a 0
class Counter {
  name: string;
  private value: number = 0;

  constructor(name: string) {
    this.name = name;
  }

  inc(value: number = 1): void {
    // TODO: Incrementez, mais rejetez les valeurs negatives (throw Error)
  }

  get(): number {
    // TODO: Retournez la valeur courante
    return 0;
  }

  reset(): void {
    // TODO: Remettez a zero
  }
}

// =============================================================================
// Exercice 2 : Gauge
// Une jauge peut monter et descendre. Elle represente une valeur instantanee.
// Typiquement utilise pour : temperature, connexions actives, memoire utilisee.
// =============================================================================

// TODO: Implementez la classe Gauge
// - Le constructeur prend un nom (string)
// - inc(value?: number) : incremente de value (defaut 1)
// - dec(value?: number) : decremente de value (defaut 1)
// - set(value: number) : fixe la valeur
// - get() : retourne la valeur courante
class Gauge {
  name: string;
  private value: number = 0;

  constructor(name: string) {
    this.name = name;
  }

  inc(value: number = 1): void {
    // TODO: Incrementez
  }

  dec(value: number = 1): void {
    // TODO: Decrementez
  }

  set(value: number): void {
    // TODO: Fixez la valeur
  }

  get(): number {
    // TODO: Retournez la valeur courante
    return 0;
  }
}

// =============================================================================
// Exercice 3 : Histogram
// Un histogramme observe des valeurs et les repartit dans des buckets.
// Typiquement utilise pour : durees de requetes, tailles de reponses.
// =============================================================================

// TODO: Implementez la classe Histogram
// - Le constructeur prend un nom et des limites de buckets (ex: [0.01, 0.05, 0.1, 0.5, 1])
// - observe(value: number) : enregistre une observation
// - getCount() : retourne le nombre total d'observations
// - getSum() : retourne la somme de toutes les observations
// - getBuckets() : retourne un Map<number, number> des buckets (borne -> nombre d'obs <= borne)
// - getValues() : retourne le tableau brut des observations
class Histogram {
  name: string;
  private bucketBounds: number[];
  private values: number[] = [];

  constructor(name: string, bucketBounds: number[]) {
    this.name = name;
    this.bucketBounds = bucketBounds.sort((a, b) => a - b);
  }

  observe(value: number): void {
    // TODO: Ajoutez la valeur au tableau des observations
  }

  getCount(): number {
    // TODO: Retournez le nombre d'observations
    return 0;
  }

  getSum(): number {
    // TODO: Retournez la somme des observations
    return 0;
  }

  getBuckets(): Map<number, number> {
    // TODO: Pour chaque borne, comptez le nombre d'observations <= borne
    // Ajoutez aussi un bucket +Inf qui contient toutes les observations
    return new Map();
  }

  getValues(): number[] {
    // TODO: Retournez le tableau brut des observations
    return [];
  }
}

// =============================================================================
// Exercice 4 : Counter HTTP
// Utilisez le Counter pour compter les requetes par status code.
// =============================================================================

// TODO: Implementez cette fonction
// Elle doit creer un Counter par status code et retourner un objet
// avec les compteurs pour chaque code de reponse observe
function countRequestsByStatus(
  requests: Array<{ status: number }>
): Map<number, number> {
  // TODO: Parcourez les requetes, creez/incrementez un Counter par status code
  // Retournez une Map<status, count>
  return new Map();
}

// =============================================================================
// Exercice 5 : Gauge connexions
// Utilisez le Gauge pour suivre les connexions actives.
// =============================================================================

// TODO: Implementez cette fonction
// Simulez des connexions et deconnexions. Retournez l'etat final du Gauge.
// events est un tableau de { type: 'connect' | 'disconnect' }
function trackConnections(events: Array<{ type: 'connect' | 'disconnect' }>): number {
  // TODO: Creez un Gauge, puis pour chaque event, inc ou dec
  // Retournez la valeur finale du Gauge
  return 0;
}

// =============================================================================
// Exercice 6 : Histogram durees
// Utilisez le Histogram pour mesurer des durees et calculer des percentiles.
// =============================================================================

// TODO: Implementez cette fonction
// Enregistrez les durees dans un Histogram, puis calculez p50, p95, p99
function analyzeLatencies(
  durations: number[]
): { p50: number; p95: number; p99: number; count: number; sum: number } {
  // TODO: Creez un Histogram avec des buckets adaptes
  // Observez chaque duree, puis calculez les percentiles avec calculatePercentile
  return { p50: 0, p95: 0, p99: 0, count: 0, sum: 0 };
}

// =============================================================================
// Tests — Ne modifiez pas cette section
// =============================================================================

async function main() {
  console.log('\n🧪 Lab 04 — Premiers pas metriques\n');

  // --- Exercice 1 ---
  await test('Ex1 — Counter increment', () => {
    const counter = new Counter('http_requests_total');
    counter.inc();
    assertEqual(counter.get(), 1);
    counter.inc(5);
    assertEqual(counter.get(), 6);
  });

  await test('Ex1 — Counter refuse les valeurs negatives', () => {
    const counter = new Counter('errors_total');
    let threw = false;
    try {
      counter.inc(-1);
    } catch {
      threw = true;
    }
    assert(threw, 'inc(-1) doit lever une erreur');
  });

  await test('Ex1 — Counter reset', () => {
    const counter = new Counter('test_counter');
    counter.inc(10);
    assertEqual(counter.get(), 10);
    counter.reset();
    assertEqual(counter.get(), 0);
  });

  // --- Exercice 2 ---
  await test('Ex2 — Gauge inc et dec', () => {
    const gauge = new Gauge('active_connections');
    gauge.inc();
    gauge.inc();
    gauge.dec();
    assertEqual(gauge.get(), 1);
  });

  await test('Ex2 — Gauge set', () => {
    const gauge = new Gauge('temperature');
    gauge.set(36.6);
    assertEqual(gauge.get(), 36.6);
    gauge.set(37.2);
    assertEqual(gauge.get(), 37.2);
  });

  await test('Ex2 — Gauge peut aller en negatif', () => {
    const gauge = new Gauge('balance');
    gauge.dec(5);
    assertEqual(gauge.get(), -5);
  });

  // --- Exercice 3 ---
  await test('Ex3 — Histogram observe et count', () => {
    const histogram = new Histogram('request_duration', [0.01, 0.05, 0.1, 0.5, 1]);
    histogram.observe(0.02);
    histogram.observe(0.08);
    histogram.observe(0.5);
    assertEqual(histogram.getCount(), 3);
  });

  await test('Ex3 — Histogram sum', () => {
    const histogram = new Histogram('response_size', [100, 500, 1000]);
    histogram.observe(50);
    histogram.observe(200);
    histogram.observe(800);
    assertEqual(histogram.getSum(), 1050);
  });

  await test('Ex3 — Histogram buckets', () => {
    const histogram = new Histogram('latency', [0.1, 0.5, 1.0]);
    histogram.observe(0.05);
    histogram.observe(0.3);
    histogram.observe(0.8);
    histogram.observe(1.5);
    const buckets = histogram.getBuckets();
    assertEqual(buckets.get(0.1), 1);  // 0.05 <= 0.1
    assertEqual(buckets.get(0.5), 2);  // 0.05, 0.3 <= 0.5
    assertEqual(buckets.get(1.0), 3);  // 0.05, 0.3, 0.8 <= 1.0
    assertEqual(buckets.get(Infinity), 4); // toutes
  });

  // --- Exercice 4 ---
  await test('Ex4 — countRequestsByStatus', () => {
    const requests = [
      { status: 200 },
      { status: 200 },
      { status: 404 },
      { status: 200 },
      { status: 500 },
      { status: 200 },
      { status: 404 },
    ];
    const counts = countRequestsByStatus(requests);
    assertEqual(counts.get(200), 4);
    assertEqual(counts.get(404), 2);
    assertEqual(counts.get(500), 1);
  });

  // --- Exercice 5 ---
  await test('Ex5 — trackConnections', () => {
    const events: Array<{ type: 'connect' | 'disconnect' }> = [
      { type: 'connect' },
      { type: 'connect' },
      { type: 'connect' },
      { type: 'disconnect' },
      { type: 'connect' },
      { type: 'disconnect' },
    ];
    assertEqual(trackConnections(events), 2);
  });

  // --- Exercice 6 ---
  await test('Ex6 — analyzeLatencies', () => {
    const durations = [
      10, 15, 20, 25, 30, 35, 40, 45, 50, 55,
      60, 70, 80, 90, 100, 150, 200, 250, 300, 500,
    ];
    const result = analyzeLatencies(durations);
    assertEqual(result.count, 20);
    assertGreaterThan(result.sum, 0);
    assertGreaterThan(result.p95, result.p50);
    assertGreaterThan(result.p99, result.p95);
  });

  summary();
}

main();
