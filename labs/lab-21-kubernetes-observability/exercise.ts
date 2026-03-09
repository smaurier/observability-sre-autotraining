// =============================================================================
// Lab 21 — Kubernetes & Container Observability (Exercise)
// =============================================================================
// Lancez les tests : npx tsx exercise.ts
// =============================================================================

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, assertIncludes, summary } = createTestRunner('Lab 21 — Kubernetes Observability');

// =============================================================================
// Types
// =============================================================================

type PodPhase = 'Running' | 'Pending' | 'Succeeded' | 'Failed' | 'Unknown';

type ContainerStateReason = 'CrashLoopBackOff' | 'OOMKilled' | 'Completed' | 'Error' | 'Running';

interface PodMetrics {
  name: string;
  namespace: string;
  nodeName: string;
  phase: PodPhase;
  cpuUsageMillicores: number;      // Utilisation CPU en millicores
  cpuRequestMillicores: number;    // CPU request en millicores
  cpuLimitMillicores: number;      // CPU limit en millicores
  memoryUsageBytes: number;        // Utilisation memoire en bytes
  memoryRequestBytes: number;      // Memoire request en bytes
  memoryLimitBytes: number;        // Memoire limit en bytes
  restartCount: number;
  containerStateReason: ContainerStateReason;
  lastRestartTimestamps: number[]; // Timestamps des derniers redemarrages
}

interface NodeMetrics {
  name: string;
  cpuCapacityMillicores: number;
  memoryCapacityBytes: number;
  pods: PodMetrics[];
}

interface NodeUtilization {
  nodeName: string;
  cpuUsagePercent: number;
  cpuRequestPercent: number;
  memoryUsagePercent: number;
  memoryRequestPercent: number;
  podCount: number;
}

interface ServiceMonitorConfig {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    labels: Record<string, string>;
  };
  spec: {
    selector: {
      matchLabels: Record<string, string>;
    };
    endpoints: Array<{
      port: string;
      interval: string;
      path: string;
    }>;
    namespaceSelector: {
      matchNames: string[];
    };
  };
}

interface K8sDashboardQueries {
  cpuUsageByNamespace: string;
  memoryUsageByNamespace: string;
  podRestartRate: string;
  podsNotReady: string;
  containerOOMKilled: string;
  topCpuPods: string;
}

// =============================================================================
// Exercice 1 — Simulation de metriques de pods Kubernetes
// =============================================================================

function generatePodMetrics(
  count: number,
  namespace: string,
  nodeName: string,
  options?: {
    crashLoopCount?: number;
    oomKilledCount?: number;
  }
): PodMetrics[] {
  // TODO: Generer `count` pods avec des metriques realistes
  //
  // Pour chaque pod :
  // - name: `app-${namespace}-${i}` (i de 0 a count-1)
  // - namespace: le namespace fourni
  // - nodeName: le nodeName fourni
  // - phase: 'Running' par defaut
  // - cpuRequestMillicores: 100 + random * 400 (entre 100 et 500)
  // - cpuLimitMillicores: cpuRequest * 2
  // - cpuUsageMillicores: random * cpuLimit (entre 0 et le limit)
  // - memoryRequestBytes: (128 + random * 384) * 1024 * 1024 (entre 128Mi et 512Mi)
  // - memoryLimitBytes: memoryRequest * 2
  // - memoryUsageBytes: random * memoryLimit
  // - restartCount: 0
  // - containerStateReason: 'Running'
  // - lastRestartTimestamps: []
  //
  // Si options.crashLoopCount > 0 : les `crashLoopCount` premiers pods doivent etre en CrashLoopBackOff
  //   - restartCount: 5 + random entier * 10
  //   - containerStateReason: 'CrashLoopBackOff'
  //   - phase: 'Running' (K8s montre Running meme en CrashLoopBackOff)
  //   - lastRestartTimestamps: generer `restartCount` timestamps
  //     espacees de 10000ms a partir de Date.now() - restartCount * 10000
  //
  // Si options.oomKilledCount > 0 : les pods suivants (apres crashLoop) doivent etre OOMKilled
  //   - memoryUsageBytes: memoryLimitBytes (a la limite)
  //   - containerStateReason: 'OOMKilled'
  //   - restartCount: 1 + random entier * 3
  //   - phase: 'Running'
  //   - lastRestartTimestamps: generer les timestamps comme ci-dessus

  throw new Error('TODO: Implement generatePodMetrics');
}

// =============================================================================
// Exercice 2 — Detection de CrashLoopBackOff
// =============================================================================

function detectCrashLoopBackOff(
  pods: PodMetrics[],
  thresholds?: {
    minRestarts?: number;          // Nombre minimum de restarts (defaut: 3)
    windowMs?: number;             // Fenetre de temps en ms (defaut: 600000 = 10min)
  }
): PodMetrics[] {
  // TODO: Identifier les pods en CrashLoopBackOff
  //
  // Un pod est en CrashLoopBackOff si :
  // 1. containerStateReason === 'CrashLoopBackOff', OU
  // 2. restartCount >= minRestarts ET au moins `minRestarts` des lastRestartTimestamps
  //    sont dans la fenetre windowMs (Date.now() - windowMs)
  //
  // Retourner les pods qui matchent ces criteres

  throw new Error('TODO: Implement detectCrashLoopBackOff');
}

// =============================================================================
// Exercice 3 — Detection de OOMKilled
// =============================================================================

function detectOOMKilled(pods: PodMetrics[]): PodMetrics[] {
  // TODO: Identifier les pods termines par OOMKilled
  //
  // Un pod est OOMKilled si :
  // 1. containerStateReason === 'OOMKilled', OU
  // 2. memoryUsageBytes >= memoryLimitBytes * 0.95 ET restartCount > 0
  //    (le conteneur utilise plus de 95% de sa limite memoire et a deja redemarré)
  //
  // Retourner les pods qui matchent ces criteres

  throw new Error('TODO: Implement detectOOMKilled');
}

// =============================================================================
// Exercice 4 — Calcul d'utilisation des ressources du noeud
// =============================================================================

function calculateNodeUtilization(node: NodeMetrics): NodeUtilization {
  // TODO: Calculer l'utilisation des ressources du noeud
  //
  // - cpuUsagePercent: somme des cpuUsageMillicores de tous les pods / cpuCapacityMillicores * 100
  // - cpuRequestPercent: somme des cpuRequestMillicores / cpuCapacityMillicores * 100
  // - memoryUsagePercent: somme des memoryUsageBytes / memoryCapacityBytes * 100
  // - memoryRequestPercent: somme des memoryRequestBytes / memoryCapacityBytes * 100
  // - podCount: nombre de pods sur le noeud
  //
  // Attention : les pourcentages doivent etre entre 0 et 100

  throw new Error('TODO: Implement calculateNodeUtilization');
}

// =============================================================================
// Exercice 5 — Generation de configuration ServiceMonitor
// =============================================================================

function generateServiceMonitor(
  name: string,
  namespace: string,
  matchLabels: Record<string, string>,
  port: string,
  interval: string,
  metricsPath: string = '/metrics',
  targetNamespaces?: string[]
): ServiceMonitorConfig {
  // TODO: Generer une configuration ServiceMonitor YAML (en objet TypeScript)
  //
  // Structure attendue :
  // {
  //   apiVersion: 'monitoring.coreos.com/v1',
  //   kind: 'ServiceMonitor',
  //   metadata: {
  //     name: name,
  //     namespace: namespace,
  //     labels: { ...matchLabels }
  //   },
  //   spec: {
  //     selector: { matchLabels: { ...matchLabels } },
  //     endpoints: [{ port, interval, path: metricsPath }],
  //     namespaceSelector: {
  //       matchNames: targetNamespaces ?? [namespace]
  //     }
  //   }
  // }

  throw new Error('TODO: Implement generateServiceMonitor');
}

// =============================================================================
// Exercice 6 — Construction de requetes PromQL pour dashboards K8s
// =============================================================================

function buildK8sDashboardQueries(namespace?: string): K8sDashboardQueries {
  // TODO: Construire des requetes PromQL pour un dashboard Kubernetes
  //
  // Si un namespace est fourni, filtrer par namespace. Sinon, agreger tous les namespaces.
  //
  // Requetes attendues :
  //
  // cpuUsageByNamespace:
  //   Sans namespace: 'sum(rate(container_cpu_usage_seconds_total{container!=""}[5m])) by (namespace)'
  //   Avec namespace: 'sum(rate(container_cpu_usage_seconds_total{namespace="<ns>",container!=""}[5m])) by (pod)'
  //
  // memoryUsageByNamespace:
  //   Sans namespace: 'sum(container_memory_working_set_bytes{container!=""}) by (namespace)'
  //   Avec namespace: 'sum(container_memory_working_set_bytes{namespace="<ns>",container!=""}) by (pod)'
  //
  // podRestartRate:
  //   Sans namespace: 'sum(rate(kube_pod_container_status_restarts_total[15m])) by (namespace, pod) > 0'
  //   Avec namespace: 'sum(rate(kube_pod_container_status_restarts_total{namespace="<ns>"}[15m])) by (pod) > 0'
  //
  // podsNotReady:
  //   Sans namespace: 'kube_pod_status_ready{condition="false"}'
  //   Avec namespace: 'kube_pod_status_ready{namespace="<ns>",condition="false"}'
  //
  // containerOOMKilled:
  //   Sans namespace: 'kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}'
  //   Avec namespace: 'kube_pod_container_status_last_terminated_reason{namespace="<ns>",reason="OOMKilled"}'
  //
  // topCpuPods:
  //   Sans namespace: 'topk(10, sum(rate(container_cpu_usage_seconds_total{container!=""}[5m])) by (namespace, pod))'
  //   Avec namespace: 'topk(10, sum(rate(container_cpu_usage_seconds_total{namespace="<ns>",container!=""}[5m])) by (pod))'

  throw new Error('TODO: Implement buildK8sDashboardQueries');
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n☸️  Lab 21 — Kubernetes Observability\n');

  // --- Exercice 1 ---
  await test('Ex1: genere le bon nombre de pods', () => {
    const pods = generatePodMetrics(10, 'production', 'node-1');
    assertEqual(pods.length, 10);
  });

  await test('Ex1: les metriques de pods ont des valeurs realistes', () => {
    const pods = generatePodMetrics(5, 'production', 'node-1');
    for (const pod of pods) {
      assertEqual(pod.namespace, 'production');
      assertEqual(pod.nodeName, 'node-1');
      assertGreaterThan(pod.cpuRequestMillicores, 0);
      assertGreaterThan(pod.memoryRequestBytes, 0);
      assertLessThan(pod.cpuUsageMillicores, pod.cpuLimitMillicores + 1);
      assertLessThan(pod.memoryUsageBytes, pod.memoryLimitBytes + 1);
    }
  });

  await test('Ex1: genere des pods en CrashLoopBackOff', () => {
    const pods = generatePodMetrics(5, 'staging', 'node-2', { crashLoopCount: 2 });
    const crashPods = pods.filter(p => p.containerStateReason === 'CrashLoopBackOff');
    assertEqual(crashPods.length, 2);
    for (const pod of crashPods) {
      assertGreaterThan(pod.restartCount, 4);
      assertGreaterThan(pod.lastRestartTimestamps.length, 0);
    }
  });

  await test('Ex1: genere des pods OOMKilled', () => {
    const pods = generatePodMetrics(5, 'staging', 'node-2', { oomKilledCount: 1 });
    const oomPods = pods.filter(p => p.containerStateReason === 'OOMKilled');
    assertEqual(oomPods.length, 1);
    for (const pod of oomPods) {
      assertEqual(pod.memoryUsageBytes, pod.memoryLimitBytes);
      assertGreaterThan(pod.restartCount, 0);
    }
  });

  // --- Exercice 2 ---
  await test('Ex2: detecte les pods en CrashLoopBackOff', () => {
    const pods = generatePodMetrics(10, 'production', 'node-1', { crashLoopCount: 3 });
    const detected = detectCrashLoopBackOff(pods);
    assertGreaterThan(detected.length, 0);
    for (const pod of detected) {
      assert(
        pod.containerStateReason === 'CrashLoopBackOff' || pod.restartCount >= 3,
        `Pod ${pod.name} devrait etre en CrashLoopBackOff`
      );
    }
  });

  await test('Ex2: ne detecte pas les pods sains', () => {
    const pods = generatePodMetrics(5, 'production', 'node-1');
    const detected = detectCrashLoopBackOff(pods);
    assertEqual(detected.length, 0);
  });

  // --- Exercice 3 ---
  await test('Ex3: detecte les pods OOMKilled', () => {
    const pods = generatePodMetrics(10, 'production', 'node-1', { oomKilledCount: 2 });
    const detected = detectOOMKilled(pods);
    assertGreaterThan(detected.length, 0);
    for (const pod of detected) {
      assert(
        pod.containerStateReason === 'OOMKilled' || pod.memoryUsageBytes >= pod.memoryLimitBytes * 0.95,
        `Pod ${pod.name} devrait etre OOMKilled`
      );
    }
  });

  await test('Ex3: ne detecte pas les pods avec memoire normale', () => {
    const pods = generatePodMetrics(5, 'production', 'node-1');
    // Forcer la memoire a un niveau bas pour ce test
    for (const pod of pods) {
      pod.memoryUsageBytes = pod.memoryLimitBytes * 0.5;
      pod.containerStateReason = 'Running';
      pod.restartCount = 0;
    }
    const detected = detectOOMKilled(pods);
    assertEqual(detected.length, 0);
  });

  // --- Exercice 4 ---
  await test('Ex4: calcule l\'utilisation du noeud', () => {
    const pods = generatePodMetrics(5, 'production', 'node-1');
    const node: NodeMetrics = {
      name: 'node-1',
      cpuCapacityMillicores: 8000,    // 8 vCPUs
      memoryCapacityBytes: 16 * 1024 * 1024 * 1024, // 16 Gi
      pods,
    };
    const util = calculateNodeUtilization(node);
    assertEqual(util.nodeName, 'node-1');
    assertEqual(util.podCount, 5);
    assertGreaterThan(util.cpuUsagePercent, 0);
    assertLessThan(util.cpuUsagePercent, 101);
    assertGreaterThan(util.memoryUsagePercent, 0);
    assertLessThan(util.memoryUsagePercent, 101);
    assertGreaterThan(util.cpuRequestPercent, 0);
    assertGreaterThan(util.memoryRequestPercent, 0);
  });

  await test('Ex4: noeud sans pods retourne 0%', () => {
    const node: NodeMetrics = {
      name: 'node-empty',
      cpuCapacityMillicores: 4000,
      memoryCapacityBytes: 8 * 1024 * 1024 * 1024,
      pods: [],
    };
    const util = calculateNodeUtilization(node);
    assertEqual(util.cpuUsagePercent, 0);
    assertEqual(util.memoryUsagePercent, 0);
    assertEqual(util.podCount, 0);
  });

  // --- Exercice 5 ---
  await test('Ex5: genere un ServiceMonitor valide', () => {
    const sm = generateServiceMonitor(
      'my-app-monitor',
      'monitoring',
      { app: 'my-app' },
      'metrics',
      '30s'
    );
    assertEqual(sm.apiVersion, 'monitoring.coreos.com/v1');
    assertEqual(sm.kind, 'ServiceMonitor');
    assertEqual(sm.metadata.name, 'my-app-monitor');
    assertEqual(sm.metadata.namespace, 'monitoring');
    assertEqual(sm.spec.selector.matchLabels.app, 'my-app');
    assertEqual(sm.spec.endpoints.length, 1);
    assertEqual(sm.spec.endpoints[0].port, 'metrics');
    assertEqual(sm.spec.endpoints[0].interval, '30s');
    assertEqual(sm.spec.endpoints[0].path, '/metrics');
  });

  await test('Ex5: ServiceMonitor avec namespaces cibles', () => {
    const sm = generateServiceMonitor(
      'multi-ns-monitor',
      'monitoring',
      { team: 'platform' },
      'http-metrics',
      '15s',
      '/custom-metrics',
      ['production', 'staging']
    );
    assertEqual(sm.spec.namespaceSelector.matchNames.length, 2);
    assertIncludes(sm.spec.namespaceSelector.matchNames, 'production');
    assertIncludes(sm.spec.namespaceSelector.matchNames, 'staging');
    assertEqual(sm.spec.endpoints[0].path, '/custom-metrics');
  });

  // --- Exercice 6 ---
  await test('Ex6: requetes PromQL sans namespace', () => {
    const queries = buildK8sDashboardQueries();
    assertIncludes(queries.cpuUsageByNamespace, 'container_cpu_usage_seconds_total');
    assertIncludes(queries.cpuUsageByNamespace, 'by (namespace)');
    assertIncludes(queries.memoryUsageByNamespace, 'container_memory_working_set_bytes');
    assertIncludes(queries.podRestartRate, 'kube_pod_container_status_restarts_total');
    assertIncludes(queries.podsNotReady, 'kube_pod_status_ready');
    assertIncludes(queries.containerOOMKilled, 'OOMKilled');
    assertIncludes(queries.topCpuPods, 'topk');
  });

  await test('Ex6: requetes PromQL avec namespace', () => {
    const queries = buildK8sDashboardQueries('production');
    assertIncludes(queries.cpuUsageByNamespace, 'namespace="production"');
    assertIncludes(queries.cpuUsageByNamespace, 'by (pod)');
    assertIncludes(queries.memoryUsageByNamespace, 'namespace="production"');
    assertIncludes(queries.podRestartRate, 'namespace="production"');
    assertIncludes(queries.podsNotReady, 'namespace="production"');
    assertIncludes(queries.containerOOMKilled, 'namespace="production"');
    assertIncludes(queries.topCpuPods, 'namespace="production"');
  });

  summary();
}

main();
