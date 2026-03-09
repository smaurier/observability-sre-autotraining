// =============================================================================
// Lab 21 — Kubernetes & Container Observability (Solution)
// =============================================================================
// Lancez les tests : npx tsx solution.ts
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
  cpuUsageMillicores: number;
  cpuRequestMillicores: number;
  cpuLimitMillicores: number;
  memoryUsageBytes: number;
  memoryRequestBytes: number;
  memoryLimitBytes: number;
  restartCount: number;
  containerStateReason: ContainerStateReason;
  lastRestartTimestamps: number[];
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
  const pods: PodMetrics[] = [];
  const crashLoopCount = options?.crashLoopCount ?? 0;
  const oomKilledCount = options?.oomKilledCount ?? 0;

  for (let i = 0; i < count; i++) {
    const cpuRequestMillicores = 100 + Math.random() * 400;
    const cpuLimitMillicores = cpuRequestMillicores * 2;
    const memoryRequestBytes = (128 + Math.random() * 384) * 1024 * 1024;
    const memoryLimitBytes = memoryRequestBytes * 2;

    const pod: PodMetrics = {
      name: `app-${namespace}-${i}`,
      namespace,
      nodeName,
      phase: 'Running',
      cpuRequestMillicores,
      cpuLimitMillicores,
      cpuUsageMillicores: Math.random() * cpuLimitMillicores,
      memoryRequestBytes,
      memoryLimitBytes,
      memoryUsageBytes: Math.random() * memoryLimitBytes,
      restartCount: 0,
      containerStateReason: 'Running',
      lastRestartTimestamps: [],
    };

    // CrashLoopBackOff pods
    if (i < crashLoopCount) {
      pod.restartCount = 5 + Math.floor(Math.random() * 10);
      pod.containerStateReason = 'CrashLoopBackOff';
      pod.phase = 'Running';
      const now = Date.now();
      pod.lastRestartTimestamps = [];
      for (let r = 0; r < pod.restartCount; r++) {
        pod.lastRestartTimestamps.push(now - (pod.restartCount - r) * 10000);
      }
    }
    // OOMKilled pods
    else if (i < crashLoopCount + oomKilledCount) {
      pod.memoryUsageBytes = pod.memoryLimitBytes;
      pod.containerStateReason = 'OOMKilled';
      pod.restartCount = 1 + Math.floor(Math.random() * 3);
      pod.phase = 'Running';
      const now = Date.now();
      pod.lastRestartTimestamps = [];
      for (let r = 0; r < pod.restartCount; r++) {
        pod.lastRestartTimestamps.push(now - (pod.restartCount - r) * 10000);
      }
    }

    pods.push(pod);
  }

  return pods;
}

// =============================================================================
// Exercice 2 — Detection de CrashLoopBackOff
// =============================================================================

function detectCrashLoopBackOff(
  pods: PodMetrics[],
  thresholds?: {
    minRestarts?: number;
    windowMs?: number;
  }
): PodMetrics[] {
  const minRestarts = thresholds?.minRestarts ?? 3;
  const windowMs = thresholds?.windowMs ?? 600000;
  const now = Date.now();

  return pods.filter(pod => {
    // Critere 1 : etat explicite
    if (pod.containerStateReason === 'CrashLoopBackOff') {
      return true;
    }

    // Critere 2 : restarts recents dans la fenetre
    if (pod.restartCount >= minRestarts) {
      const recentRestarts = pod.lastRestartTimestamps.filter(
        ts => ts >= now - windowMs
      );
      if (recentRestarts.length >= minRestarts) {
        return true;
      }
    }

    return false;
  });
}

// =============================================================================
// Exercice 3 — Detection de OOMKilled
// =============================================================================

function detectOOMKilled(pods: PodMetrics[]): PodMetrics[] {
  return pods.filter(pod => {
    // Critere 1 : etat explicite
    if (pod.containerStateReason === 'OOMKilled') {
      return true;
    }

    // Critere 2 : memoire proche de la limite avec restarts
    if (pod.memoryUsageBytes >= pod.memoryLimitBytes * 0.95 && pod.restartCount > 0) {
      return true;
    }

    return false;
  });
}

// =============================================================================
// Exercice 4 — Calcul d'utilisation des ressources du noeud
// =============================================================================

function calculateNodeUtilization(node: NodeMetrics): NodeUtilization {
  const totalCpuUsage = node.pods.reduce((sum, pod) => sum + pod.cpuUsageMillicores, 0);
  const totalCpuRequest = node.pods.reduce((sum, pod) => sum + pod.cpuRequestMillicores, 0);
  const totalMemoryUsage = node.pods.reduce((sum, pod) => sum + pod.memoryUsageBytes, 0);
  const totalMemoryRequest = node.pods.reduce((sum, pod) => sum + pod.memoryRequestBytes, 0);

  return {
    nodeName: node.name,
    cpuUsagePercent: node.cpuCapacityMillicores > 0
      ? (totalCpuUsage / node.cpuCapacityMillicores) * 100
      : 0,
    cpuRequestPercent: node.cpuCapacityMillicores > 0
      ? (totalCpuRequest / node.cpuCapacityMillicores) * 100
      : 0,
    memoryUsagePercent: node.memoryCapacityBytes > 0
      ? (totalMemoryUsage / node.memoryCapacityBytes) * 100
      : 0,
    memoryRequestPercent: node.memoryCapacityBytes > 0
      ? (totalMemoryRequest / node.memoryCapacityBytes) * 100
      : 0,
    podCount: node.pods.length,
  };
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
  return {
    apiVersion: 'monitoring.coreos.com/v1',
    kind: 'ServiceMonitor',
    metadata: {
      name,
      namespace,
      labels: { ...matchLabels },
    },
    spec: {
      selector: {
        matchLabels: { ...matchLabels },
      },
      endpoints: [
        {
          port,
          interval,
          path: metricsPath,
        },
      ],
      namespaceSelector: {
        matchNames: targetNamespaces ?? [namespace],
      },
    },
  };
}

// =============================================================================
// Exercice 6 — Construction de requetes PromQL pour dashboards K8s
// =============================================================================

function buildK8sDashboardQueries(namespace?: string): K8sDashboardQueries {
  if (namespace) {
    return {
      cpuUsageByNamespace: `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}",container!=""}[5m])) by (pod)`,
      memoryUsageByNamespace: `sum(container_memory_working_set_bytes{namespace="${namespace}",container!=""}) by (pod)`,
      podRestartRate: `sum(rate(kube_pod_container_status_restarts_total{namespace="${namespace}"}[15m])) by (pod) > 0`,
      podsNotReady: `kube_pod_status_ready{namespace="${namespace}",condition="false"}`,
      containerOOMKilled: `kube_pod_container_status_last_terminated_reason{namespace="${namespace}",reason="OOMKilled"}`,
      topCpuPods: `topk(10, sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}",container!=""}[5m])) by (pod))`,
    };
  }

  return {
    cpuUsageByNamespace: 'sum(rate(container_cpu_usage_seconds_total{container!=""}[5m])) by (namespace)',
    memoryUsageByNamespace: 'sum(container_memory_working_set_bytes{container!=""}) by (namespace)',
    podRestartRate: 'sum(rate(kube_pod_container_status_restarts_total[15m])) by (namespace, pod) > 0',
    podsNotReady: 'kube_pod_status_ready{condition="false"}',
    containerOOMKilled: 'kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}',
    topCpuPods: 'topk(10, sum(rate(container_cpu_usage_seconds_total{container!=""}[5m])) by (namespace, pod))',
  };
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
      cpuCapacityMillicores: 8000,
      memoryCapacityBytes: 16 * 1024 * 1024 * 1024,
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
