# Kubernetes & Container Observability

## Objectifs pedagogiques

- Comprendre pourquoi l'observabilité dans Kubernetes est fondamentalement différente d'un environnement classique
- Maîtriser les metriques natives de Kubernetes (kubelet, cAdvisor, kube-state-metrics, node-exporter)
- Déployer et configurer Prometheus sur Kubernetes avec l'Operator et les CRDs
- Mettre en place une stratégie de logging adaptee aux conteneurs (DaemonSet, Fluent Bit, Loki)
- Instrumenter le tracing distribue avec l'OpenTelemetry Operator
- Construire les dashboards Grafana essentiels pour Kubernetes (USE par node, RED par service, control plane)
- Définir des alertes spécifiques Kubernetes (CrashLoopBackOff, OOMKilled, node NotReady, PVC full)
- Configurer l'auto-scaling base sur des metriques custom Prometheus (HPA, Prometheus Adapter, KEDA)
- Appliquer les principes d'Observability as Code dans un contexte GitOps Kubernetes

---

## Kubernetes — L'essentiel pour ce module

Ce module porte sur l'**observabilité** de Kubernetes, pas sur l'administration de clusters. Cependant, il suppose une familiarite minimale avec les concepts Kubernetes. Si vous venez du module 00 (Docker & Docker Compose) et n'avez jamais touche a Kubernetes, cette section vous donne les bases nécessaires pour suivre confortablement.

### Concepts clés

| Concept | Description |
|---------|-------------|
| **Cluster** | Ensemble de machines (nodes) géré par Kubernetes |
| **Node** | Une machine (physique ou VM) dans le cluster |
| **Pod** | Plus petite unite deployable — un ou plusieurs containers partageant réseau et stockage |
| **Deployment** | Gere les replicas d'un pod (scaling, rolling updates) |
| **Service** | Expose un ensemble de pods avec une IP stable et un nom DNS |
| **Namespace** | Isolation logique — comme des dossiers pour organiser les ressources (ex : `monitoring`, `default`) |
| **ConfigMap / Secret** | Configuration externalisee — équivalent des variables d'environnement et fichiers `.env` dans Docker Compose |
| **CRD (Custom Resource Definition)** | Extension du vocabulaire Kubernetes — permet de définir de nouveaux types de ressources (utilise massivement par Prometheus Operator) |
| **Label** | Paire clé-valeur attachee a tout objet Kubernetes — sert à la selection et au filtrage (ex : `app=prometheus`, `team=backend`) |
| **DaemonSet** | Garantit qu'un pod tourne sur **chaque** node du cluster — utilise pour la collecte de logs et metriques |

> **Analogie Docker → Kubernetes** : Si un container Docker est un processus, un Pod est un groupe de containers qui partagent le même réseau. Si `docker-compose.yml` decrit vos services, un **Deployment** YAML fait la même chose dans Kubernetes, mais avec du scaling, du self-healing et du rolling update integres.

### Commandes kubectl essentielles

`kubectl` est le CLI de Kubernetes — l'équivalent de `docker` pour Docker.

```bash
# Voir les ressources
kubectl get pods                    # lister les pods (namespace par defaut)
kubectl get pods -n monitoring      # lister les pods du namespace "monitoring"
kubectl get deployments             # lister les deployments
kubectl get services                # lister les services
kubectl get nodes                   # lister les nodes du cluster

# Details d'une ressource
kubectl describe pod <nom>          # infos detaillees (events, conditions, containers)
kubectl logs <pod>                  # logs du container principal
kubectl logs <pod> -c <container>   # logs d'un container specifique (pod multi-container)
kubectl top pods                    # metriques CPU/memoire en temps reel

# Appliquer une configuration declarative
kubectl apply -f manifest.yaml      # creer ou mettre a jour les ressources declarees
kubectl delete -f manifest.yaml     # supprimer les ressources declarees

# Port-forwarding (acceder a un service depuis votre machine locale)
kubectl port-forward svc/prometheus 9090:9090 -n monitoring
# → Prometheus sera accessible sur http://localhost:9090
```

### Architecture simplifiee

```
┌─────────────────── Cluster Kubernetes ───────────────────┐
│                                                           │
│  Control Plane (cerveau du cluster)                       │
│  ┌─────────────┬────────┬───────────┬──────────────────┐ │
│  │ API Server  │  etcd  │ Scheduler │ Controller Mgr   │ │
│  └─────────────┴────────┴───────────┴──────────────────┘ │
│                                                           │
│  ┌──── Node 1 ──────────┐   ┌──── Node 2 ──────────┐   │
│  │ kubelet    kube-proxy │   │ kubelet    kube-proxy │   │
│  │ ┌───────┐ ┌─────────┐│   │ ┌───────┐ ┌─────────┐│   │
│  │ │ Pod A │ │  Pod B  ││   │ │ Pod C │ │  Pod D  ││   │
│  │ │┌─────┐│ │┌───────┐││   │ │┌─────┐│ │┌───────┐││   │
│  │ ││cont.││ ││cont.  │││   │ ││cont.││ ││cont.  │││   │
│  │ │└─────┘│ │└───────┘││   │ │└─────┘│ │└───────┘││   │
│  │ └───────┘ └─────────┘│   │ └───────┘ └─────────┘│   │
│  └───────────────────────┘   └───────────────────────┘   │
│                                                           │
└───────────────────────────────────────────────────────────┘

Flux : vous → kubectl → API Server → Scheduler → kubelet → Pod
```

### Minikube / kind — Kubernetes en local

Pour suivre les exercices pratiques de ce module, vous avez besoin d'un cluster Kubernetes local. Trois options simples :

| Outil | Commande | Notes |
|-------|----------|-------|
| **Minikube** | `minikube start` | Le plus repandu, supporte plusieurs drivers (Docker, VirtualBox) |
| **kind** (Kubernetes IN Docker) | `kind create cluster` | Leger, tourne dans des containers Docker |
| **Docker Desktop** | Activer Kubernetes dans les preferences | Le plus simple si vous utilisez déjà Docker Desktop |

```bash
# Exemple avec Minikube
minikube start --memory=4096 --cpus=2
kubectl get nodes  # verifier que le cluster est pret

# Exemple avec kind
kind create cluster --name observability-lab
kubectl cluster-info
```

> **Ressources recommandees** : un cluster local avec 4 Go de RAM et 2 CPUs est suffisant pour déployer Prometheus, Grafana et les exporters de ce module.

### Fichier YAML Kubernetes — Anatomie rapide

Dans ce module, vous verrez beaucoup de manifests YAML. Voici la structure type :

```yaml
apiVersion: apps/v1          # Version de l'API Kubernetes
kind: Deployment             # Type de ressource
metadata:
  name: prometheus-server    # Nom de la ressource
  namespace: monitoring      # Namespace cible
  labels:                    # Labels pour le filtrage
    app: prometheus
spec:                        # Specification desiree
  replicas: 1               # Nombre de pods
  selector:
    matchLabels:
      app: prometheus        # Selectionne les pods avec ce label
  template:
    spec:
      containers:
      - name: prometheus
        image: prom/prometheus:v2.54.0
        ports:
        - containerPort: 9090
```

> Si vous connaissez `docker-compose.yml`, la logique est similaire : vous **declarez** l'état desire, et Kubernetes s'assure de le maintenir.

::: tip Pas besoin d'etre expert Kubernetes
Ce module se concentre sur l'**observabilité** de Kubernetes, pas sur son administration. Les concepts ci-dessus suffisent pour comprendre où et comment collecter les signaux (metriques, logs, traces). Si vous voulez approfondir Kubernetes, consultez la [documentation officielle](https://kubernetes.io/docs/tutorials/) ou le tutoriel interactif [Kubernetes Basics](https://kubernetes.io/docs/tutorials/kubernetes-basics/).
:::

---

## Pourquoi l'observabilité Kubernetes est différente

### L'ephemerite change tout

Dans un environnement classique (VM, bare metal), vos processus vivent des semaines, des mois, parfois des annees. Vous pouvez SSH sur la machine, consulter les logs sur disque, analyser un core dump. Dans Kubernetes, **tout est ephemere** : un pod peut naitre, vivre 30 secondes et mourir sans laisser de trace.

L'analogie : observer une infrastructure classique, c'est comme observer une ville. Les batiments sont stables, les adresses fixes. Observer Kubernetes, c'est comme observer un festival de musique. Les stands apparaissent et disparaissent, les gens bougent constamment, et si vous n'avez pas pris une photo a l'instant T, le moment est perdu.

```typescript
interface ObservabilityChallenge {
  challenge: string;
  classicInfra: string;
  kubernetes: string;
  implication: string;
}

const challenges: ObservabilityChallenge[] = [
  {
    challenge: 'Duree de vie des processus',
    classicInfra: 'Semaines/mois — les logs sont sur disque',
    kubernetes: 'Secondes/heures — les logs disparaissent avec le pod',
    implication: 'Collecte de logs en temps reel obligatoire (DaemonSet)',
  },
  {
    challenge: 'Adressage reseau',
    classicInfra: 'IPs fixes, DNS stable',
    kubernetes: 'IPs dynamiques, pods recrees avec de nouvelles IPs',
    implication: 'Service discovery dynamique pour Prometheus',
  },
  {
    challenge: 'Nombre d\'entites',
    classicInfra: '10-100 serveurs',
    kubernetes: '100-10000 pods, avec du churn constant',
    implication: 'Cardinalite des metriques a surveiller de pres',
  },
  {
    challenge: 'Couches d\'abstraction',
    classicInfra: 'OS → application',
    kubernetes: 'Node → kubelet → pod → container → application',
    implication: 'Observer chaque couche avec les bons outils',
  },
  {
    challenge: 'Debugging',
    classicInfra: 'SSH, strace, tcpdump directement',
    kubernetes: 'kubectl exec dans un container minimal sans outils',
    implication: 'Investir dans l\'observabilite proactive, pas reactive',
  },
];
```

### L'orchestration multi-couches

Kubernetes introduit plusieurs couches d'abstraction entre le hardware et votre application. Chacune doit etre observee differemment.

```
┌──────────────────────────────────────────────────────────────┐
│                     CLUSTER KUBERNETES                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Node (machine physique ou VM)                       │    │
│  │  → node-exporter : CPU, memoire, disque, reseau     │    │
│  │                                                      │    │
│  │  ┌──────────────────────────────────────────────┐    │    │
│  │  │  kubelet + cAdvisor                          │    │    │
│  │  │  → metriques par container (CPU, mem, I/O)   │    │    │
│  │  │                                              │    │    │
│  │  │  ┌────────────────────────────────────┐      │    │    │
│  │  │  │  Pod                               │      │    │    │
│  │  │  │  ┌──────────┐  ┌──────────┐       │      │    │    │
│  │  │  │  │Container │  │ Sidecar  │       │      │    │    │
│  │  │  │  │  (app)   │  │ (otel)   │       │      │    │    │
│  │  │  │  │ → prom   │  │ → traces │       │      │    │    │
│  │  │  │  │   client │  │          │       │      │    │    │
│  │  │  │  └──────────┘  └──────────┘       │      │    │    │
│  │  │  └────────────────────────────────────┘      │    │    │
│  │  └──────────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  kube-state-metrics → etat des objets K8s (Deployments,     │
│                       Pods, Nodes, Jobs, PVCs...)            │
│                                                              │
│  Control Plane → API server, etcd, scheduler, controller    │
└──────────────────────────────────────────────────────────────┘
```

### Observer l'orchestrateur vs observer les applications

C'est une distinction fondamentale. Les deux sont nécessaires, mais les outils et les metriques différent complètement.

```typescript
interface ObservabilityLayer {
  layer: string;
  question: string;
  tools: string[];
  metricsExamples: string[];
}

const layers: ObservabilityLayer[] = [
  {
    layer: 'Infrastructure (nodes)',
    question: 'Mes machines sont-elles en bonne sante ?',
    tools: ['node-exporter', 'cAdvisor'],
    metricsExamples: [
      'node_cpu_seconds_total',
      'node_memory_MemAvailable_bytes',
      'node_disk_io_time_seconds_total',
    ],
  },
  {
    layer: 'Orchestrateur (Kubernetes)',
    question: 'Kubernetes fait-il correctement son travail ?',
    tools: ['kube-state-metrics', 'API server metrics'],
    metricsExamples: [
      'kube_pod_status_phase',
      'kube_deployment_status_replicas_unavailable',
      'kube_node_status_condition',
    ],
  },
  {
    layer: 'Application (vos services)',
    question: 'Mes services repondent-ils correctement aux utilisateurs ?',
    tools: ['prom-client', 'OpenTelemetry', 'structured logging'],
    metricsExamples: [
      'http_requests_total',
      'http_request_duration_seconds',
      'orders_created_total',
    ],
  },
];
```

::: warning Piege classique
Beaucoup d'équipes installent Prometheus sur Kubernetes et pensent avoir "fait l'observabilité" parce qu'elles voient les metriques de CPU et mémoire des pods. Mais sans les metriques **applicatives** (taux d'erreur, latence, metriques metier), vous surveillez la tuyauterie sans savoir si l'eau qui en sort est potable.
:::

---

## Les metriques Kubernetes natives

### kubelet et cAdvisor

Chaque node Kubernetes exécuté un **kubelet** qui intégré **cAdvisor** (Container Advisor). cAdvisor collecte automatiquement les metriques de ressources pour chaque container en cours d'exécution, sans aucune instrumentation.

```typescript
interface CAdvisorMetric {
  name: string;
  type: 'counter' | 'gauge';
  description: string;
  usage: string;
}

const cadvisorMetrics: CAdvisorMetric[] = [
  {
    name: 'container_cpu_usage_seconds_total',
    type: 'counter',
    description: 'Temps CPU consomme par le container (en secondes)',
    usage: 'rate(container_cpu_usage_seconds_total{pod="my-app-xyz"}[5m])',
  },
  {
    name: 'container_memory_usage_bytes',
    type: 'gauge',
    description: 'Memoire totale utilisee par le container (RSS + cache)',
    usage: 'container_memory_usage_bytes{pod="my-app-xyz"}',
  },
  {
    name: 'container_memory_working_set_bytes',
    type: 'gauge',
    description: 'Memoire active du container (la valeur utilisee pour les OOM kills)',
    usage: 'container_memory_working_set_bytes{pod="my-app-xyz"}',
  },
  {
    name: 'container_network_receive_bytes_total',
    type: 'counter',
    description: 'Octets recus par le container sur le reseau',
    usage: 'rate(container_network_receive_bytes_total{pod="my-app-xyz"}[5m])',
  },
  {
    name: 'container_network_transmit_bytes_total',
    type: 'counter',
    description: 'Octets transmis par le container sur le reseau',
    usage: 'rate(container_network_transmit_bytes_total{pod="my-app-xyz"}[5m])',
  },
  {
    name: 'container_fs_usage_bytes',
    type: 'gauge',
    description: 'Espace disque utilise par le container',
    usage: 'container_fs_usage_bytes{pod="my-app-xyz"}',
  },
  {
    name: 'container_fs_reads_total',
    type: 'counter',
    description: 'Nombre de lectures disque',
    usage: 'rate(container_fs_reads_total{pod="my-app-xyz"}[5m])',
  },
];
```

::: tip Mémoire : usage vs working_set
`container_memory_usage_bytes` inclut le cache filesystem, qui peut etre libere par le kernel. La metrique qui compte vraiment pour les OOM kills est `container_memory_working_set_bytes`. Utilisez toujours cette dernière pour comparer aux limits de votre container.
:::

### kube-state-metrics

**kube-state-metrics** est un service qui interroge l'API Kubernetes et expose l'état des objets K8s sous forme de metriques Prometheus. C'est la source de verite pour savoir si vos Deployments, Pods, Nodes, Jobs et PVCs sont dans l'état attendu.

```typescript
interface KubeStateMetric {
  name: string;
  object: string;
  description: string;
  alertExample: string;
}

const kubeStateMetrics: KubeStateMetric[] = [
  {
    name: 'kube_pod_status_phase',
    object: 'Pod',
    description: 'Phase du pod (Pending, Running, Succeeded, Failed, Unknown)',
    alertExample: 'kube_pod_status_phase{phase="Pending"} > 0 for 15m → pod bloque en Pending',
  },
  {
    name: 'kube_pod_container_status_restarts_total',
    object: 'Pod',
    description: 'Nombre total de restarts d\'un container (CrashLoopBackOff)',
    alertExample: 'increase(kube_pod_container_status_restarts_total[1h]) > 5 → trop de restarts',
  },
  {
    name: 'kube_pod_container_status_waiting_reason',
    object: 'Pod',
    description: 'Raison pour laquelle un container est en attente (CrashLoopBackOff, ImagePullBackOff...)',
    alertExample: 'kube_pod_container_status_waiting_reason{reason="CrashLoopBackOff"} > 0',
  },
  {
    name: 'kube_pod_container_status_terminated_reason',
    object: 'Pod',
    description: 'Raison de terminaison (OOMKilled, Error, Completed...)',
    alertExample: 'kube_pod_container_status_terminated_reason{reason="OOMKilled"} > 0',
  },
  {
    name: 'kube_deployment_status_replicas_unavailable',
    object: 'Deployment',
    description: 'Nombre de replicas indisponibles pour un Deployment',
    alertExample: 'kube_deployment_status_replicas_unavailable > 0 for 10m',
  },
  {
    name: 'kube_deployment_spec_replicas',
    object: 'Deployment',
    description: 'Nombre de replicas desirees',
    alertExample: 'Comparer avec kube_deployment_status_replicas pour detecter un rollout bloque',
  },
  {
    name: 'kube_node_status_condition',
    object: 'Node',
    description: 'Condition du node (Ready, DiskPressure, MemoryPressure, PIDPressure)',
    alertExample: 'kube_node_status_condition{condition="Ready",status="true"} == 0 → node NotReady',
  },
  {
    name: 'kube_persistentvolumeclaim_status_phase',
    object: 'PVC',
    description: 'Phase du PVC (Bound, Pending, Lost)',
    alertExample: 'kube_persistentvolumeclaim_status_phase{phase="Pending"} > 0 for 15m',
  },
  {
    name: 'kube_job_status_failed',
    object: 'Job',
    description: 'Nombre de jobs en echec',
    alertExample: 'kube_job_status_failed > 0',
  },
  {
    name: 'kube_horizontalpodautoscaler_status_current_replicas',
    object: 'HPA',
    description: 'Nombre actuel de replicas geres par le HPA',
    alertExample: 'Comparer avec kube_horizontalpodautoscaler_spec_max_replicas pour detecter saturation',
  },
];
```

### node-exporter

**node-exporter** expose les metriques système de chaque node : CPU, mémoire, disque, réseau, et bien plus. Il est déployé en tant que DaemonSet pour couvrir chaque node du cluster.

```yaml
# DaemonSet node-exporter (simplifie)
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      hostNetwork: true
      hostPID: true
      containers:
        - name: node-exporter
          image: prom/node-exporter:v1.8.0
          ports:
            - containerPort: 9100
              hostPort: 9100
          args:
            - '--path.procfs=/host/proc'
            - '--path.sysfs=/host/sys'
            - '--path.rootfs=/host/root'
          volumeMounts:
            - name: proc
              mountPath: /host/proc
              readOnly: true
            - name: sys
              mountPath: /host/sys
              readOnly: true
            - name: root
              mountPath: /host/root
              readOnly: true
      volumes:
        - name: proc
          hostPath:
            path: /proc
        - name: sys
          hostPath:
            path: /sys
        - name: root
          hostPath:
            path: /
```

### Tableau récapitulatif des metriques essentielles

| Source | Metrique Prometheus | Description | Méthode |
|--------|-------------------|-------------|---------|
| cAdvisor | `container_cpu_usage_seconds_total` | CPU par container | USE |
| cAdvisor | `container_memory_working_set_bytes` | Mémoire active par container | USE |
| cAdvisor | `container_network_receive_bytes_total` | Trafic réseau entrant | USE |
| kube-state | `kube_pod_status_phase` | Phase du pod | État K8s |
| kube-state | `kube_pod_container_status_restarts_total` | Restarts du container | État K8s |
| kube-state | `kube_deployment_status_replicas_unavailable` | Replicas manquants | État K8s |
| kube-state | `kube_node_status_condition` | Sante du node | État K8s |
| node-exporter | `node_cpu_seconds_total` | CPU du node | USE |
| node-exporter | `node_memory_MemAvailable_bytes` | Mémoire disponible du node | USE |
| node-exporter | `node_filesystem_avail_bytes` | Espace disque disponible | USE |
| node-exporter | `node_disk_io_time_seconds_total` | Saturation I/O disque | USE |
| API Server | `apiserver_request_total` | Requetes vers l'API server | RED |
| API Server | `apiserver_request_duration_seconds` | Latence de l'API server | RED |
| etcd | `etcd_server_has_leader` | etcd a-t-il un leader ? | Sante |

---

## Prometheus sur Kubernetes

### Prometheus Operator et CRDs

Déployer Prometheus "à la main" sur Kubernetes est fastidieux : il faut gérer la configuration, le service discovery, les regles d'alerting, et les mises a jour. Le **Prometheus Operator** simplifie tout cela en introduisant des **Custom Resource Definitions** (CRDs) qui permettent de configurer Prometheus de manière declarative.

```typescript
interface PrometheusOperatorCRD {
  kind: string;
  description: string;
  usage: string;
}

const operatorCRDs: PrometheusOperatorCRD[] = [
  {
    kind: 'Prometheus',
    description: 'Deploie et configure une instance Prometheus',
    usage: 'Definir la retention, les ressources, le stockage, et les ServiceMonitors a utiliser',
  },
  {
    kind: 'ServiceMonitor',
    description: 'Definit comment scraper les metriques d\'un Service Kubernetes',
    usage: 'Associer un Service a un job Prometheus via des label selectors',
  },
  {
    kind: 'PodMonitor',
    description: 'Definit comment scraper les metriques directement depuis des pods',
    usage: 'Pour les pods sans Service (jobs, CronJobs, sidecar metrics)',
  },
  {
    kind: 'PrometheusRule',
    description: 'Definit des alerting rules et des recording rules',
    usage: 'Grouper les regles par service/equipe et les deployer de maniere GitOps',
  },
  {
    kind: 'Alertmanager',
    description: 'Deploie et configure un Alertmanager',
    usage: 'Definir les routes, receivers (Slack, PagerDuty, email)',
  },
  {
    kind: 'AlertmanagerConfig',
    description: 'Configure le routage d\'alertes de maniere namespace-scoped',
    usage: 'Permettre a chaque equipe de configurer ses propres routes d\'alertes',
  },
];
```

### Installation avec kube-prometheus-stack

La manière la plus courante de déployer l'ensemble est via le Helm chart **kube-prometheus-stack** qui installe en une commande : Prometheus Operator, Prometheus, Alertmanager, Grafana, node-exporter, kube-state-metrics, et un ensemble de dashboards et regles preconfigures.

```yaml
# values.yaml pour kube-prometheus-stack (extraits cles)
prometheus:
  prometheusSpec:
    retention: 15d
    resources:
      requests:
        cpu: 500m
        memory: 2Gi
      limits:
        cpu: 2000m
        memory: 8Gi
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: standard
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 50Gi
    # Selectionner tous les ServiceMonitors dans tous les namespaces
    serviceMonitorSelectorNilUsesHelmValues: false
    podMonitorSelectorNilUsesHelmValues: false
    ruleSelectorNilUsesHelmValues: false

grafana:
  adminPassword: "change-me-in-production"
  persistence:
    enabled: true
    size: 10Gi

alertmanager:
  alertmanagerSpec:
    resources:
      requests:
        cpu: 100m
        memory: 256Mi
```

```bash
# Installation avec Helm
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install kube-prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --values values.yaml
```

### Service discovery Kubernetes

L'un des avantages majeurs de Prometheus sur Kubernetes est le **service discovery natif**. Prometheus interroge l'API Kubernetes pour découvrir automatiquement les cibles a scraper. Plus besoin de maintenir une liste statique de targets.

```yaml
# Extrait de configuration Prometheus (genere par l'Operator)
scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      # Ne scraper que les pods avec l'annotation prometheus.io/scrape=true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      # Utiliser le port defini dans l'annotation
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        target_label: __address__
        regex: (.+)
        replacement: ${1}
      # Utiliser le path defini dans l'annotation
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      # Ajouter les labels Kubernetes aux metriques
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
      - source_labels: [__meta_kubernetes_pod_node_name]
        target_label: node
```

### Relabeling pour filtrer et enrichir

Le relabeling est le mécanisme qui rend Prometheus puissant sur Kubernetes. Il permet de transformer les metadonnees K8s en labels Prometheus.

```typescript
interface RelabelRule {
  description: string;
  sourceLabels: string[];
  action: string;
  targetLabel?: string;
  regex?: string;
}

const commonRelabelRules: RelabelRule[] = [
  {
    description: 'Filtrer : ne garder que les pods annotes pour le scraping',
    sourceLabels: ['__meta_kubernetes_pod_annotation_prometheus_io_scrape'],
    action: 'keep',
    regex: 'true',
  },
  {
    description: 'Enrichir : ajouter le namespace comme label',
    sourceLabels: ['__meta_kubernetes_namespace'],
    action: 'replace',
    targetLabel: 'namespace',
  },
  {
    description: 'Enrichir : ajouter le nom du pod comme label',
    sourceLabels: ['__meta_kubernetes_pod_name'],
    action: 'replace',
    targetLabel: 'pod',
  },
  {
    description: 'Enrichir : ajouter le label "app" du pod',
    sourceLabels: ['__meta_kubernetes_pod_label_app'],
    action: 'replace',
    targetLabel: 'app',
  },
  {
    description: 'Filtrer : exclure les namespaces systeme',
    sourceLabels: ['__meta_kubernetes_namespace'],
    action: 'drop',
    regex: 'kube-system|kube-public',
  },
];
```

### Exemple : ServiceMonitor pour une app Node.js

Voici comment créer un ServiceMonitor pour que Prometheus scrape automatiquement votre application Node.js.

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
  labels:
    app: order-service
    team: commerce
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
        team: commerce
    spec:
      containers:
        - name: order-service
          image: myregistry/order-service:1.2.0
          ports:
            - name: http
              containerPort: 3000
            - name: metrics
              containerPort: 9090
          env:
            - name: METRICS_PORT
              value: "9090"
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
---
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: production
  labels:
    app: order-service
    team: commerce
spec:
  selector:
    app: order-service
  ports:
    - name: http
      port: 3000
      targetPort: http
    - name: metrics
      port: 9090
      targetPort: metrics
---
# servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: order-service
  namespace: production
  labels:
    app: order-service
    team: commerce
spec:
  selector:
    matchLabels:
      app: order-service
  namespaceSelector:
    matchNames:
      - production
  endpoints:
    - port: metrics
      path: /metrics
      interval: 15s
      scrapeTimeout: 10s
      # Ajouter des labels supplementaires a chaque metrique scrapee
      relabelings:
        - sourceLabels: [__meta_kubernetes_pod_label_team]
          targetLabel: team
      # Supprimer les metriques inutiles pour reduire la cardinalite
      metricRelabelings:
        - sourceLabels: [__name__]
          regex: 'go_.*'
          action: drop
```

Le TypeScript correspondant pour l'endpoint de metriques cote application :

```typescript
// src/metrics-server.ts — serveur de metriques sur un port dedie
import express from 'express';
import { collectDefaultMetrics, register, Counter, Histogram } from 'prom-client';

const metricsApp = express();
const METRICS_PORT = process.env.METRICS_PORT || 9090;

collectDefaultMetrics({ prefix: 'order_service_' });

// Metriques applicatives
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requetes HTTP',
  labelNames: ['method', 'route', 'status_code'] as const,
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duree des requetes HTTP en secondes',
  labelNames: ['method', 'route'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const ordersTotal = new Counter({
  name: 'orders_created_total',
  help: 'Nombre total de commandes creees',
  labelNames: ['status', 'payment_method'] as const,
});

// Endpoint /metrics sur le port dedie
metricsApp.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end();
  }
});

metricsApp.listen(METRICS_PORT, () => {
  console.log(`Metrics server listening on port ${METRICS_PORT}`);
});
```

::: tip Port dedie pour les metriques
Bonne pratique : exposez vos metriques sur un **port différent** du port applicatif. Cela permet de configurer les Network Policies pour que seul Prometheus accede au port metriques, sans exposer vos metriques aux utilisateurs finaux.
:::

### Thanos et Cortex pour le stockage long terme

Prometheus stocke ses donnees localement avec une retention limitee (typiquement 15 jours). Pour un historique plus long et une vue multi-cluster, deux solutions dominent.

```typescript
interface LongTermStorage {
  name: string;
  approach: string;
  advantages: string[];
  complexity: 'moyenne' | 'elevee';
  useCase: string;
}

const longTermOptions: LongTermStorage[] = [
  {
    name: 'Thanos',
    approach: 'Sidecar sur Prometheus qui upload les blocs vers un object store (S3, GCS)',
    advantages: [
      'Vue globale multi-cluster via Thanos Query',
      'Deduplication des metriques',
      'Compaction pour reduire le stockage long terme',
      'Downsampling automatique (5m, 1h pour les vieilles donnees)',
      'Compatible PromQL a 100%',
    ],
    complexity: 'moyenne',
    useCase: 'Equipes avec 1-10 clusters Prometheus, besoin de retention longue',
  },
  {
    name: 'Cortex / Mimir',
    approach: 'Remote write depuis Prometheus vers un backend distribue',
    advantages: [
      'Scalabilite horizontale (multi-tenant)',
      'Haute disponibilite native',
      'Compatible avec Grafana Cloud',
      'Un seul endpoint de query pour tous les clusters',
    ],
    complexity: 'elevee',
    useCase: 'Grandes organisations, SaaS multi-tenant, tres gros volumes de metriques',
  },
];
```

---

## Logging dans Kubernetes

### stdout/stderr et la convention 12-Factor

La convention dans Kubernetes est simple et decoule directement du [12-Factor App](https://12factor.net/logs) : **votre application écrit ses logs sur stdout/stderr, et la plateforme se charge de les collecter**.

```typescript
// BON : logger sur stdout avec pino (structured logging)
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Pas de fichier, pas de transport custom — stdout uniquement
});

logger.info({ orderId: 'ORD-123', userId: 'USR-456' }, 'Order created');
// Sortie: {"level":30,"time":1710000000000,"orderId":"ORD-123","userId":"USR-456","msg":"Order created"}
```

```typescript
// MAUVAIS : ecrire dans un fichier a l'interieur du container
import fs from 'fs';

// Anti-pattern ! Le fichier disparait quand le pod est supprime.
// En plus, il consomme l'espace disque ephemere du container.
fs.appendFileSync('/var/log/app.log', 'Order created\n');
```

### Architecture de collecte : DaemonSet vs Sidecar

Deux architectures principales existent pour collecter les logs dans Kubernetes.

```
Architecture DaemonSet (recommandee pour la plupart des cas)
============================================================

Node 1                              Node 2
┌─────────────────────────┐        ┌─────────────────────────┐
│ Pod A → stdout → /var/  │        │ Pod C → stdout → /var/  │
│ Pod B → stdout → log/   │        │ Pod D → stdout → log/   │
│                         │        │                         │
│  ┌───────────────────┐  │        │  ┌───────────────────┐  │
│  │ Fluent Bit        │  │        │  │ Fluent Bit        │  │
│  │ (DaemonSet)       │──│────────│──│ (DaemonSet)       │  │
│  │ Lit /var/log/     │  │        │  │ Lit /var/log/     │  │
│  └───────────────────┘  │        │  └───────────────────┘  │
└─────────────────────────┘        └─────────────────────────┘
          │                                   │
          └───────────────┬───────────────────┘
                          ▼
                  ┌───────────────┐
                  │  Loki / ES /  │
                  │  CloudWatch   │
                  └───────────────┘


Architecture Sidecar (cas specifiques)
======================================

┌─────────────────────────────────────────┐
│  Pod                                    │
│  ┌──────────────┐  ┌────────────────┐  │
│  │  App         │  │  Fluent Bit    │  │
│  │  Container   │──│  Sidecar       │──│──→ Backend
│  │  (stdout)    │  │  (par pod)     │  │
│  └──────────────┘  └────────────────┘  │
└─────────────────────────────────────────┘
```

```typescript
interface LogArchitecture {
  name: string;
  description: string;
  advantages: string[];
  disadvantages: string[];
  useWhen: string;
}

const architectures: LogArchitecture[] = [
  {
    name: 'DaemonSet',
    description: 'Un agent de collecte par node, lit les fichiers de log de tous les pods',
    advantages: [
      'Un seul agent par node (economie de ressources)',
      'Configuration centralisee',
      'Pas de modification des Deployments applicatifs',
      'Le plus courant et le mieux supporte',
    ],
    disadvantages: [
      'Parsing multi-format peut etre complexe',
      'Un seul agent gere tous les pods du node',
    ],
    useWhen: 'Cas general — c\'est l\'architecture par defaut recommandee',
  },
  {
    name: 'Sidecar',
    description: 'Un agent de collecte par pod, cohabite avec le container applicatif',
    advantages: [
      'Parsing specifique a l\'application',
      'Isolation des ressources par pod',
      'Transformation avancee des logs avant envoi',
    ],
    disadvantages: [
      'Consomme plus de ressources (un agent par pod)',
      'Complexite de deploiement accrue',
      'Chaque Deployment doit inclure le sidecar',
    ],
    useWhen: 'Applications avec des formats de log non standards, besoin de transformation lourde',
  },
];
```

### Fluent Bit en DaemonSet

```yaml
# fluent-bit-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
  namespace: monitoring
data:
  fluent-bit.conf: |
    [SERVICE]
        Flush         5
        Log_Level     info
        Daemon        off
        Parsers_File  parsers.conf

    [INPUT]
        Name              tail
        Tag               kube.*
        Path              /var/log/containers/*.log
        Parser            cri
        DB                /var/log/flb_kube.db
        Mem_Buf_Limit     5MB
        Skip_Long_Lines   On
        Refresh_Interval  10

    [FILTER]
        Name                kubernetes
        Match               kube.*
        Kube_URL            https://kubernetes.default.svc:443
        Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
        Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
        Merge_Log           On
        K8S-Logging.Parser  On
        K8S-Logging.Exclude On

    [OUTPUT]
        Name            loki
        Match           kube.*
        Host            loki.monitoring.svc.cluster.local
        Port            3100
        Labels          job=fluent-bit, namespace=$kubernetes['namespace_name'], pod=$kubernetes['pod_name'], container=$kubernetes['container_name']
        Auto_Kubernetes_Labels On

  parsers.conf: |
    [PARSER]
        Name        cri
        Format      regex
        Regex       ^(?<time>[^ ]+) (?<stream>stdout|stderr) (?<logtag>[^ ]*) (?<message>.*)$
        Time_Key    time
        Time_Format %Y-%m-%dT%H:%M:%S.%L%z

    [PARSER]
        Name        json
        Format      json
        Time_Key    time
        Time_Format %Y-%m-%dT%H:%M:%S.%L%z
```

### Enrichissement automatique

Le filtre `kubernetes` de Fluent Bit enrichit automatiquement chaque ligne de log avec les metadonnees K8s. C'est l'un des gros avantages de Kubernetes pour l'observabilité.

```typescript
interface LogEnrichment {
  field: string;
  source: string;
  example: string;
}

// Champs ajoutes automatiquement par le filtre kubernetes de Fluent Bit
const autoEnrichment: LogEnrichment[] = [
  { field: 'kubernetes.namespace_name', source: 'API K8s', example: 'production' },
  { field: 'kubernetes.pod_name', source: 'API K8s', example: 'order-service-7b9f4d6c5-x2k9m' },
  { field: 'kubernetes.container_name', source: 'API K8s', example: 'order-service' },
  { field: 'kubernetes.pod_id', source: 'API K8s', example: 'a1b2c3d4-e5f6-...' },
  { field: 'kubernetes.labels.app', source: 'Labels du pod', example: 'order-service' },
  { field: 'kubernetes.labels.team', source: 'Labels du pod', example: 'commerce' },
  { field: 'kubernetes.labels.version', source: 'Labels du pod', example: 'v1.2.0' },
  { field: 'kubernetes.host', source: 'Node', example: 'worker-node-03' },
  { field: 'stream', source: 'Container runtime', example: 'stdout' },
];

// Resultat : un log enrichi dans Loki
const enrichedLog = {
  // Champs applicatifs (votre structured logging)
  level: 'info',
  msg: 'Order created',
  orderId: 'ORD-123',
  userId: 'USR-456',
  // Champs K8s (ajoutes automatiquement)
  kubernetes: {
    namespace_name: 'production',
    pod_name: 'order-service-7b9f4d6c5-x2k9m',
    container_name: 'order-service',
    labels: {
      app: 'order-service',
      team: 'commerce',
      version: 'v1.2.0',
    },
    host: 'worker-node-03',
  },
};
```

### Loki comme alternative legere a Elasticsearch

```typescript
interface LogBackendComparison {
  feature: string;
  elasticsearch: string;
  loki: string;
}

const comparison: LogBackendComparison[] = [
  {
    feature: 'Approche d\'indexation',
    elasticsearch: 'Full-text indexing de tout le contenu',
    loki: 'Indexe uniquement les labels, stocke les logs comprimes',
  },
  {
    feature: 'Ressources necessaires',
    elasticsearch: 'Tres gourmand (RAM, CPU, stockage SSD)',
    loki: 'Leger — stockage objet (S3) suffit',
  },
  {
    feature: 'Cout pour 1 TB/jour',
    elasticsearch: 'Eleve (cluster de 6-12 nodes dedies)',
    loki: 'Modere (stockage objet bon marche)',
  },
  {
    feature: 'Recherche full-text',
    elasticsearch: 'Excellent — c\'est sa raison d\'etre',
    loki: 'Basique — grep sur les chunks (plus lent)',
  },
  {
    feature: 'Integration Grafana',
    elasticsearch: 'Bonne (plugin)',
    loki: 'Native (meme equipe, LogQL integre)',
  },
  {
    feature: 'Query language',
    elasticsearch: 'Query DSL (JSON complexe) ou KQL',
    loki: 'LogQL (syntaxe proche de PromQL — familier)',
  },
  {
    feature: 'Complexite operationnelle',
    elasticsearch: 'Elevee (sharding, replicas, mapping, GC tuning)',
    loki: 'Faible a moyenne',
  },
];
```

::: tip Bonnes pratiques logging K8s
1. **Toujours sur stdout/stderr** — jamais dans des fichiers internes au container
2. **Structured logging JSON** — facilite le parsing et l'indexation
3. **DaemonSet par defaut** — Sidecar uniquement si nécessaire
4. **Labels K8s coherents** — `app`, `team`, `version` sur tous les pods
5. **Loki si vous etes déjà sur Grafana** — sinon Elasticsearch reste valable
6. **Retention differenciee** — logs d'erreur gardes plus longtemps que les logs info
:::

---

## Tracing distribue en environnement Kubernetes

### Auto-instrumentation avec l'OTel Operator

L'**OpenTelemetry Operator** pour Kubernetes permet d'instrumenter automatiquement vos applications sans modifier une seule ligne de code. Il injecte un agent d'instrumentation au démarrage du pod via un webhook d'admission.

```yaml
# 1. Installer l'OpenTelemetry Operator (via Helm)
# helm install otel-operator open-telemetry/opentelemetry-operator \
#   --namespace otel-system --create-namespace

# 2. Definir un Instrumentation resource
apiVersion: opentelemetry.io/v1alpha1
kind: Instrumentation
metadata:
  name: auto-instrumentation
  namespace: production
spec:
  exporter:
    endpoint: http://otel-collector.monitoring.svc.cluster.local:4317
  propagators:
    - tracecontext
    - baggage
    - b3
  sampler:
    type: parentbased_traceidratio
    argument: "0.1"  # Echantillonner 10% des traces
  nodejs:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-nodejs:latest
    env:
      - name: OTEL_NODE_ENABLED_INSTRUMENTATIONS
        value: "http,express,pg,redis,grpc"
  python:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-python:latest
  java:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-java:latest
```

```yaml
# 3. Annoter vos Deployments pour activer l'auto-instrumentation
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
spec:
  template:
    metadata:
      annotations:
        # Cette annotation suffit pour activer l'instrumentation Node.js
        instrumentation.opentelemetry.io/inject-nodejs: "true"
      labels:
        app: order-service
    spec:
      containers:
        - name: order-service
          image: myregistry/order-service:1.2.0
          # Pas besoin d'ajouter l'OTel SDK dans votre code !
```

### Injection de sidecar OTel Collector

Pour un controle plus fin sur la collecte de telemetrie, vous pouvez déployer un OTel Collector en sidecar. Il recoit les traces/metriques/logs de l'application et les exporte vers le backend.

```yaml
# OTel Collector en mode sidecar via l'Operator
apiVersion: opentelemetry.io/v1beta1
kind: OpenTelemetryCollector
metadata:
  name: sidecar-collector
  namespace: production
spec:
  mode: sidecar
  config:
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
          http:
            endpoint: 0.0.0.0:4318

    processors:
      batch:
        timeout: 5s
        send_batch_size: 1024
      # Ajouter les metadonnees K8s aux spans
      k8sattributes:
        extract:
          metadata:
            - k8s.namespace.name
            - k8s.pod.name
            - k8s.deployment.name
            - k8s.node.name
          labels:
            - tag_name: app
              key: app
              from: pod
            - tag_name: team
              key: team
              from: pod
      # Filtrer les traces non interessantes
      filter:
        traces:
          span:
            - 'attributes["http.route"] == "/health"'
            - 'attributes["http.route"] == "/metrics"'

    exporters:
      otlp:
        endpoint: tempo.monitoring.svc.cluster.local:4317
        tls:
          insecure: true
      prometheus:
        endpoint: 0.0.0.0:8889

    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [k8sattributes, filter, batch]
          exporters: [otlp]
        metrics:
          receivers: [otlp]
          processors: [k8sattributes, batch]
          exporters: [prometheus]
```

### Service mesh et observabilité gratuite

Un **service mesh** (Istio, Linkerd) place un proxy sidecar (Envoy, Linkerd-proxy) devant chaque pod. Ce proxy intercepte tout le trafic réseau et généré automatiquement des metriques L7 (HTTP, gRPC) et des traces distribuees — sans aucune instrumentation applicative.

```typescript
interface ServiceMeshObservability {
  feature: string;
  description: string;
  metricsGenerated: string[];
}

const meshObservability: ServiceMeshObservability[] = [
  {
    feature: 'Metriques RED automatiques',
    description: 'Le proxy mesure chaque requete entre services',
    metricsGenerated: [
      'istio_requests_total{source, destination, response_code}',
      'istio_request_duration_milliseconds{source, destination}',
      'istio_request_bytes{source, destination}',
    ],
  },
  {
    feature: 'Traces distribuees',
    description: 'Le proxy propage les headers de trace et cree des spans',
    metricsGenerated: [
      'Spans automatiques pour chaque hop service-a-service',
      'Propagation W3C TraceContext et B3',
    ],
  },
  {
    feature: 'mTLS et identite',
    description: 'Chaque connexion est authentifiee et chiffree',
    metricsGenerated: [
      'istio_tcp_connections_opened_total',
      'istio_tcp_connections_closed_total',
    ],
  },
];
```

::: warning Service mesh : cout vs benefice
Un service mesh ajoute de la complexite, de la latence (faible : ~1ms) et de la consommation mémoire (sidecar Envoy : ~50-100 MB par pod). Evaluez si les metriques L7 gratuites et le mTLS justifient ce cout pour votre contexte. Pour un petit cluster, l'instrumentation applicative directe peut suffire.
:::

### Correlation logs-traces-metriques via labels K8s

La clé de la correlation dans Kubernetes est la coherence des labels. Le même identifiant (`app`, `namespace`, `pod`) doit etre present dans les trois signaux.

```typescript
// Correlation via les labels K8s communs
interface CorrelationStrategy {
  signal: 'logs' | 'metriques' | 'traces';
  tool: string;
  commonLabels: string[];
  traceIdField?: string;
}

const correlationSetup: CorrelationStrategy[] = [
  {
    signal: 'logs',
    tool: 'Loki (via Fluent Bit)',
    commonLabels: ['namespace', 'pod', 'container', 'app', 'team'],
    traceIdField: 'traceId (extrait du JSON structured log)',
  },
  {
    signal: 'metriques',
    tool: 'Prometheus (via ServiceMonitor)',
    commonLabels: ['namespace', 'pod', 'container', 'app', 'team'],
  },
  {
    signal: 'traces',
    tool: 'Tempo (via OTel Collector)',
    commonLabels: ['k8s.namespace.name', 'k8s.pod.name', 'app', 'team'],
    traceIdField: 'traceID (natif OpenTelemetry)',
  },
];

// Dans Grafana : configurer les datasource correlations
// Loki → Tempo : extraire le traceId du log et lien vers Tempo
// Tempo → Loki : depuis un span, voir les logs du meme pod/timerange
// Tempo → Prometheus : depuis un span, voir les metriques du meme service
```

```typescript
// Exemple pratique : logger avec le traceId pour la correlation
import pino from 'pino';
import { trace, context } from '@opentelemetry/api';

const logger = pino({ level: 'info' });

function logWithTrace(message: string, extra: Record<string, unknown> = {}): void {
  const span = trace.getSpan(context.active());
  const spanContext = span?.spanContext();

  logger.info({
    ...extra,
    // Ces champs permettent la correlation Loki → Tempo
    traceId: spanContext?.traceId,
    spanId: spanContext?.spanId,
    // Ces champs sont aussi ajoutes par Fluent Bit, mais les avoir
    // dans le log structuree permet une recherche plus rapide
    service: process.env.OTEL_SERVICE_NAME || 'unknown',
  }, message);
}

// Utilisation
logWithTrace('Order created', { orderId: 'ORD-123', amount: 99.90 });
// Sortie: {"level":30,"traceId":"abc123...","spanId":"def456...","service":"order-service","orderId":"ORD-123","amount":99.9,"msg":"Order created"}
```

---

## Dashboards Kubernetes essentiels

### Dashboard USE par node

Le dashboard USE (Utilization, Saturation, Errors) par node repond à la question : "Mes machines ont-elles les ressources nécessaires ?"

```typescript
interface USEDashboardQuery {
  resource: string;
  utilization: string;
  saturation: string;
  errors: string;
}

const nodeUSEQueries: USEDashboardQuery[] = [
  {
    resource: 'CPU',
    utilization:
      '1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))',
    saturation:
      'node_load15 / count by(instance) (node_cpu_seconds_total{mode="idle"})',
    errors:
      'N/A (pas d\'erreur CPU directe — surveiller les throttled containers)',
  },
  {
    resource: 'Memoire',
    utilization:
      '1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)',
    saturation:
      'rate(node_vmstat_pgmajfault[5m])',
    errors:
      'N/A (surveiller les OOMKill via kube-state-metrics)',
  },
  {
    resource: 'Disque',
    utilization:
      '1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})',
    saturation:
      'rate(node_disk_io_time_weighted_seconds_total[5m])',
    errors:
      'rate(node_disk_io_time_seconds_total[5m]) == 0 AND rate(node_disk_reads_completed_total[5m]) > 0',
  },
  {
    resource: 'Reseau',
    utilization:
      'rate(node_network_receive_bytes_total{device!~"lo|veth.*|docker.*|br.*"}[5m])',
    saturation:
      'rate(node_network_receive_drop_total{device!~"lo"}[5m])',
    errors:
      'rate(node_network_receive_errs_total{device!~"lo"}[5m])',
  },
];
```

### Dashboard RED par service/namespace

Le dashboard RED (Rate, Errors, Duration) repond à la question : "Mes services fonctionnent-ils correctement pour les utilisateurs ?"

```
# Requetes PromQL pour un dashboard RED par namespace

# Rate (requetes par seconde par service dans un namespace)
sum by (app) (
  rate(http_requests_total{namespace="$namespace"}[5m])
)

# Errors (taux d'erreur par service)
sum by (app) (
  rate(http_requests_total{namespace="$namespace", status_code=~"5.."}[5m])
) / sum by (app) (
  rate(http_requests_total{namespace="$namespace"}[5m])
) * 100

# Duration (latence p99 par service)
histogram_quantile(0.99,
  sum by (app, le) (
    rate(http_request_duration_seconds_bucket{namespace="$namespace"}[5m])
  )
)
```

### Dashboard pods : sante et anomalies

Ce dashboard est spécifique a Kubernetes et n'a pas d'équivalent en infrastructure classique. Il repond a : "Mes pods sont-ils stables ?"

```typescript
interface PodDashboardPanel {
  title: string;
  query: string;
  type: 'stat' | 'timeseries' | 'table';
  severity: 'info' | 'warning' | 'critical';
}

const podDashboardPanels: PodDashboardPanel[] = [
  {
    title: 'Pods en CrashLoopBackOff',
    query: 'kube_pod_container_status_waiting_reason{reason="CrashLoopBackOff"} > 0',
    type: 'table',
    severity: 'critical',
  },
  {
    title: 'Pods OOMKilled (derniere heure)',
    query: 'increase(kube_pod_container_status_restarts_total[1h]) > 0 and on(pod, namespace) kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}',
    type: 'table',
    severity: 'critical',
  },
  {
    title: 'Pods en Pending',
    query: 'kube_pod_status_phase{phase="Pending"} > 0',
    type: 'table',
    severity: 'warning',
  },
  {
    title: 'Restarts par pod (24h)',
    query: 'sort_desc(increase(kube_pod_container_status_restarts_total[24h]) > 0)',
    type: 'table',
    severity: 'warning',
  },
  {
    title: 'Containers CPU throttled',
    query: 'rate(container_cpu_cfs_throttled_seconds_total[5m]) > 0',
    type: 'timeseries',
    severity: 'warning',
  },
  {
    title: 'Memoire vs limit par pod',
    query: 'container_memory_working_set_bytes / on(pod, namespace, container) kube_pod_container_resource_limits{resource="memory"} * 100',
    type: 'timeseries',
    severity: 'info',
  },
];
```

### Dashboard control plane

Le control plane de Kubernetes est le cerveau du cluster. S'il va mal, tout va mal.

```
# API Server
# Requetes par seconde vers l'API server
sum(rate(apiserver_request_total[5m])) by (verb, resource)

# Latence p99 de l'API server
histogram_quantile(0.99, sum(rate(apiserver_request_duration_seconds_bucket[5m])) by (le, verb))

# Requetes en erreur (4xx, 5xx)
sum(rate(apiserver_request_total{code=~"[45].."}[5m])) by (code)

# etcd
# etcd a-t-il un leader ?
etcd_server_has_leader

# Latence d'ecriture etcd (critique pour la performance du cluster)
histogram_quantile(0.99, sum(rate(etcd_disk_wal_fsync_duration_seconds_bucket[5m])) by (le))

# Nombre de proposals appliquees vs en attente
rate(etcd_server_proposals_applied_total[5m])
rate(etcd_server_proposals_pending[5m])

# Scheduler
# Tentatives de scheduling par seconde
sum(rate(scheduler_schedule_attempts_total[5m])) by (result)

# Latence du scheduling
histogram_quantile(0.99, sum(rate(scheduler_scheduling_algorithm_duration_seconds_bucket[5m])) by (le))
```

---

## Alerting spécifique Kubernetes

### Alertes pods

```yaml
# PrometheusRule pour les alertes de pods
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: pod-alerts
  namespace: monitoring
  labels:
    release: kube-prometheus
spec:
  groups:
    - name: kubernetes-pods
      rules:
        # CrashLoopBackOff — un container redemarre en boucle
        - alert: PodCrashLoopBackOff
          expr: |
            kube_pod_container_status_waiting_reason{reason="CrashLoopBackOff"} > 0
          for: 10m
          labels:
            severity: critical
          annotations:
            summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} en CrashLoopBackOff"
            description: >
              Le container {{ $labels.container }} du pod {{ $labels.pod }}
              dans le namespace {{ $labels.namespace }} est en CrashLoopBackOff
              depuis plus de 10 minutes. Verifiez les logs avec :
              kubectl logs -n {{ $labels.namespace }} {{ $labels.pod }} -c {{ $labels.container }} --previous
            runbook_url: "https://wiki.example.com/runbooks/pod-crashloopbackoff"

        # OOMKilled — un container a ete tue pour depassement memoire
        - alert: PodOOMKilled
          expr: |
            kube_pod_container_status_last_terminated_reason{reason="OOMKilled"} > 0
          for: 0m
          labels:
            severity: warning
          annotations:
            summary: "Container {{ $labels.container }} OOMKilled dans {{ $labels.namespace }}/{{ $labels.pod }}"
            description: >
              Le container {{ $labels.container }} a ete tue par l'OOM killer.
              Augmentez les resource limits ou optimisez la consommation memoire.

        # Pod not ready — le pod ne passe pas ses readiness probes
        - alert: PodNotReady
          expr: |
            kube_pod_status_ready{condition="true"} == 0
            and on(pod, namespace) kube_pod_status_phase{phase="Running"} == 1
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} not ready depuis 15 min"

        # ImagePullBackOff — impossible de telecharger l'image
        - alert: PodImagePullBackOff
          expr: |
            kube_pod_container_status_waiting_reason{reason="ImagePullBackOff"} > 0
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} : impossible de pull l'image"
```

### Alertes nodes

```yaml
        # Node NotReady
        - alert: KubeNodeNotReady
          expr: |
            kube_node_status_condition{condition="Ready", status="true"} == 0
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Node {{ $labels.node }} NotReady depuis 5 minutes"
            description: >
              Le node {{ $labels.node }} n'est plus en etat Ready.
              Les pods sur ce node risquent d'etre evictes.

        # Node DiskPressure
        - alert: KubeNodeDiskPressure
          expr: |
            kube_node_status_condition{condition="DiskPressure", status="true"} == 1
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Node {{ $labels.node }} en DiskPressure"
            description: >
              Le node {{ $labels.node }} manque d'espace disque.
              Kubernetes va commencer a evicter des pods.

        # Node MemoryPressure
        - alert: KubeNodeMemoryPressure
          expr: |
            kube_node_status_condition{condition="MemoryPressure", status="true"} == 1
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Node {{ $labels.node }} en MemoryPressure"

        # Filesystem bientot plein (prediction lineaire)
        - alert: NodeFilesystemAlmostFull
          expr: |
            predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[6h], 24*3600) < 0
          for: 1h
          labels:
            severity: warning
          annotations:
            summary: "Node {{ $labels.instance }} : disque plein dans moins de 24h"
```

### Alertes deployments et PVC

```yaml
        # Deployment replicas unavailable
        - alert: KubeDeploymentReplicasUnavailable
          expr: |
            kube_deployment_status_replicas_unavailable > 0
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "Deployment {{ $labels.namespace }}/{{ $labels.deployment }} : {{ $value }} replicas indisponibles"

        # Rollout stuck — le deployment ne progresse plus
        - alert: KubeDeploymentRolloutStuck
          expr: |
            kube_deployment_status_observed_generation != kube_deployment_metadata_generation
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "Le rollout de {{ $labels.namespace }}/{{ $labels.deployment }} est bloque"
            description: >
              Le deployment n'a pas atteint la generation souhaitee en 15 minutes.
              Verifiez avec : kubectl rollout status deployment/{{ $labels.deployment }} -n {{ $labels.namespace }}

        # PVC presque plein
        - alert: PersistentVolumeClaimAlmostFull
          expr: |
            kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes > 0.85
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "PVC {{ $labels.namespace }}/{{ $labels.persistentvolumeclaim }} utilise a {{ $value | humanizePercentage }}"
            description: >
              Le volume {{ $labels.persistentvolumeclaim }} est utilise a plus de 85%.
              Augmentez la taille du PVC ou nettoyez les donnees.

        # PVC plein critique
        - alert: PersistentVolumeClaimFull
          expr: |
            kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes > 0.95
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "PVC {{ $labels.namespace }}/{{ $labels.persistentvolumeclaim }} quasi plein ({{ $value | humanizePercentage }})"
```

### Bonnes pratiques : éviter l'alert fatigue en K8s

```typescript
interface AlertFatigueAntiPattern {
  antiPattern: string;
  problem: string;
  solution: string;
}

const alertAntiPatterns: AlertFatigueAntiPattern[] = [
  {
    antiPattern: 'Alerter sur chaque pod restart',
    problem: 'Les pods redemarrent normalement (deployments, scaling). Des dizaines d\'alertes par jour.',
    solution: 'Alerter sur le TAUX de restarts : increase(...[1h]) > 5, pas sur chaque restart individuel',
  },
  {
    antiPattern: 'Alerter sur CPU > 80% d\'un pod',
    problem: 'Un pod a 90% CPU peut etre parfaitement normal s\'il est correctement dimensionne.',
    solution: 'Alerter sur le CPU throttling (container_cpu_cfs_throttled_seconds_total) qui indique un vrai probleme',
  },
  {
    antiPattern: 'Alerter sur chaque pod Pending',
    problem: 'Les pods sont Pending pendant le scheduling normal (quelques secondes).',
    solution: 'Utiliser un delai "for: 15m" pour ne capter que les vrais blocages',
  },
  {
    antiPattern: 'Dupliquer les alertes K8s et applicatives',
    problem: 'Le meme incident declenche 5 alertes differentes (pod restart + error rate + latence + ...).',
    solution: 'Utiliser inhibition rules dans Alertmanager pour supprimer les alertes "symptome" quand la "cause" est deja active',
  },
  {
    antiPattern: 'Pas de runbook dans les annotations',
    problem: 'L\'oncall recoit une alerte "PodCrashLoopBackOff" a 3h du matin et ne sait pas quoi faire.',
    solution: 'Chaque alerte DOIT avoir un runbook_url avec les etapes de diagnostic et de remediation',
  },
];
```

---

## Auto-scaling base sur les metriques custom

### HPA avec metriques Prometheus

Le **Horizontal Pod Autoscaler** (HPA) de Kubernetes peut scaler vos pods non seulement sur CPU/mémoire, mais aussi sur des metriques custom provenant de Prometheus.

```
Architecture du custom metrics auto-scaling
=============================================

                    ┌────────────────────┐
                    │ HPA Controller     │
                    │ (Kubernetes)       │
                    └────────┬───────────┘
                             │ "Combien de req/s
                             │  sur order-service ?"
                             ▼
                    ┌────────────────────┐
                    │ custom.metrics.    │
                    │ k8s.io API         │
                    └────────┬───────────┘
                             │
                             ▼
                    ┌────────────────────┐
                    │ Prometheus Adapter │
                    │ (traduit PromQL    │
                    │  en API K8s)       │
                    └────────┬───────────┘
                             │ PromQL query
                             ▼
                    ┌────────────────────┐
                    │ Prometheus         │
                    └────────────────────┘
```

### Prometheus Adapter

Le **Prometheus Adapter** est le pont entre Prometheus et l'API custom metrics de Kubernetes. Il traduit les requêtes de l'API K8s en requêtes PromQL.

```yaml
# prometheus-adapter-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-adapter-config
  namespace: monitoring
data:
  config.yaml: |
    rules:
      # Regle 1 : requetes HTTP par seconde par pod
      - seriesQuery: 'http_requests_total{namespace!="",pod!=""}'
        resources:
          overrides:
            namespace: {resource: "namespace"}
            pod: {resource: "pod"}
        name:
          matches: "^(.*)_total$"
          as: "${1}_per_second"
        metricsQuery: 'sum(rate(<<.Series>>{<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>)'

      # Regle 2 : latence p99 par pod
      - seriesQuery: 'http_request_duration_seconds_bucket{namespace!="",pod!=""}'
        resources:
          overrides:
            namespace: {resource: "namespace"}
            pod: {resource: "pod"}
        name:
          as: "http_request_duration_p99"
        metricsQuery: 'histogram_quantile(0.99, sum(rate(<<.Series>>{<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>, le))'

      # Regle 3 : taille de la file d'attente (metrique metier)
      - seriesQuery: 'queue_messages_pending{namespace!="",pod!=""}'
        resources:
          overrides:
            namespace: {resource: "namespace"}
            pod: {resource: "pod"}
        name:
          as: "queue_messages_pending"
        metricsQuery: 'avg(<<.Series>>{<<.LabelMatchers>>}) by (<<.GroupBy>>)'
```

### Exemple : scaler sur les requêtes HTTP par seconde

```yaml
# hpa-http-rps.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 2
  maxReplicas: 20
  metrics:
    # Metrique 1 : requetes par seconde (custom, depuis Prometheus)
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"  # Scaler quand chaque pod recoit > 100 req/s
    # Metrique 2 : CPU comme filet de securite
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 75
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60   # Attendre 1 min avant de scaler up
      policies:
        - type: Percent
          value: 50                     # Augmenter de max 50% a la fois
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300  # Attendre 5 min avant de scaler down
      policies:
        - type: Percent
          value: 25                     # Reduire de max 25% a la fois
          periodSeconds: 120
```

Le TypeScript pour l'endpoint qui expose la metrique utilisee par le HPA :

```typescript
// src/metrics/custom-hpa-metrics.ts
import { Counter, Gauge } from 'prom-client';

// Ce counter est utilise par le Prometheus Adapter pour calculer le RPS
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total des requetes HTTP pour l\'auto-scaling',
  labelNames: ['method', 'route', 'status_code'] as const,
});

// Metrique metier : messages en attente dans la queue
// Utile pour scaler les workers de maniere event-driven
export const queueMessagesPending = new Gauge({
  name: 'queue_messages_pending',
  help: 'Nombre de messages en attente dans la file',
  labelNames: ['queue_name'] as const,
});

// Mise a jour periodique de la gauge de queue
async function updateQueueMetrics(): Promise<void> {
  // En production : interroger RabbitMQ, SQS, Kafka...
  const pendingMessages = await getQueueDepth('orders');
  queueMessagesPending.set({ queue_name: 'orders' }, pendingMessages);
}

async function getQueueDepth(queueName: string): Promise<number> {
  // Simuler la lecture depuis un message broker
  return Math.floor(Math.random() * 100);
}

// Mettre a jour toutes les 10 secondes
setInterval(updateQueueMetrics, 10_000);
```

### KEDA pour l'event-driven autoscaling

**KEDA** (Kubernetes Event-Driven Autoscaling) va plus loin que le HPA classique : il peut scaler de 0 a N et supporte nativement des dizaines de sources d'événements (Kafka, RabbitMQ, SQS, Prometheus, Cron...).

```yaml
# keda-scaledobject.yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-worker-scaler
  namespace: production
spec:
  scaleTargetRef:
    name: order-worker
  minReplicaCount: 0     # KEDA peut scaler a 0 (pas possible avec le HPA natif)
  maxReplicaCount: 50
  cooldownPeriod: 300     # 5 min avant de scaler down
  triggers:
    # Scaler sur la profondeur de la queue RabbitMQ
    - type: rabbitmq
      metadata:
        host: amqp://rabbitmq.production.svc.cluster.local:5672
        queueName: orders-to-process
        queueLength: "10"    # 1 pod pour 10 messages en attente

    # Scaler aussi sur une metrique Prometheus
    - type: prometheus
      metadata:
        serverAddress: http://prometheus.monitoring.svc.cluster.local:9090
        query: |
          sum(rate(http_requests_total{app="order-api", status_code=~"2.."}[2m]))
        threshold: "50"      # Scaler quand le RPS > 50
        activationThreshold: "5"  # Ne pas activer tant que RPS < 5
```

### Anti-patterns de l'auto-scaling

```typescript
interface ScalingAntiPattern {
  antiPattern: string;
  problem: string;
  solution: string;
}

const scalingAntiPatterns: ScalingAntiPattern[] = [
  {
    antiPattern: 'Scaler uniquement sur CPU',
    problem: 'Un pod peut avoir un CPU bas mais etre sature en connexions DB ou en memoire. Le HPA ne scale pas, mais le service est degrade.',
    solution: 'Combiner CPU + metriques applicatives (RPS, queue depth, latence)',
  },
  {
    antiPattern: 'Pas de maxReplicas raisonnable',
    problem: 'Un bug ou un pic de trafic DDoS fait scaler a 500 pods, saturant le cluster et explosant la facture cloud.',
    solution: 'Toujours definir un maxReplicas raisonnable + alerte quand on approche du max',
  },
  {
    antiPattern: 'Scaler down trop vite',
    problem: 'Le trafic fluctue naturellement. Scaler down immediatement puis re-scaler up cree du "flapping" et des interruptions.',
    solution: 'stabilizationWindowSeconds: 300 (5 min) pour le scale down',
  },
  {
    antiPattern: 'Pas de resource requests sur les pods',
    problem: 'Sans requests, le scheduler place les pods n\'importe ou. Le HPA CPU ne peut pas calculer le pourcentage d\'utilisation.',
    solution: 'Toujours definir des requests (et des limits) pour CPU et memoire',
  },
  {
    antiPattern: 'Ignorer le temps de startup',
    problem: 'Les nouveaux pods mettent 30 secondes a demarrer. Le HPA scale up, mais les nouveaux pods ne sont pas prets, donc il scale encore plus.',
    solution: 'Configurer startup probes correctement + stabilizationWindowSeconds pour le scale up',
  },
];
```

---

## Health checks Kubernetes pour l'observabilité

Un health check bien configure est la base de l'observabilité dans Kubernetes. Il permet a Kubernetes de savoir si votre pod est fonctionnel, pret a recevoir du trafic, et s'il a fini de démarrer.

```typescript
// src/health/health-checks.ts
import express, { Request, Response } from 'express';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, {
    status: 'pass' | 'fail' | 'warn';
    message?: string;
    duration_ms?: number;
  }>;
  version: string;
  uptime_seconds: number;
}

const startTime = Date.now();

// Verifier la connexion a la base de donnees
async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    // En production : pool.query('SELECT 1')
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

// Verifier la connexion au cache
async function checkRedis(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await new Promise((resolve) => setTimeout(resolve, 2));
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

const app = express();

// LIVENESS : "Mon processus est-il vivant ?"
// Si fail → Kubernetes tue et recree le pod
// Doit etre SIMPLE et RAPIDE — pas de dependances externes
app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

// READINESS : "Suis-je pret a recevoir du trafic ?"
// Si fail → Kubernetes retire le pod du Service (plus de trafic)
// Peut verifier les dependances (DB, cache)
app.get('/health/ready', async (_req: Request, res: Response) => {
  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);

  const status: HealthStatus = {
    status: db.ok && redis.ok ? 'healthy' : db.ok ? 'degraded' : 'unhealthy',
    checks: {
      database: {
        status: db.ok ? 'pass' : 'fail',
        duration_ms: db.latencyMs,
      },
      redis: {
        status: redis.ok ? 'pass' : 'warn',
        message: redis.ok ? undefined : 'Redis down — cache miss possible',
        duration_ms: redis.latencyMs,
      },
    },
    version: process.env.APP_VERSION || 'unknown',
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
  };

  // 200 si healthy ou degraded (Redis down = pas critique)
  // 503 si unhealthy (DB down = critique)
  const httpStatus = status.status === 'unhealthy' ? 503 : 200;
  res.status(httpStatus).json(status);
});

// STARTUP : "Ai-je fini de demarrer ?"
// Si fail → Kubernetes attend (pas de liveness/readiness check)
// Utile pour les apps avec un long temps de demarrage
let isStarted = false;

app.get('/health/startup', (_req: Request, res: Response) => {
  if (isStarted) {
    res.status(200).json({ started: true });
  } else {
    res.status(503).json({ started: false, message: 'Still initializing...' });
  }
});

// Marquer comme demarre apres l'initialisation
async function initialize(): Promise<void> {
  // Charger les caches, warmer les connexions DB, etc.
  await new Promise((resolve) => setTimeout(resolve, 5000));
  isStarted = true;
  console.log('Application initialized and ready');
}

initialize();
```

::: warning Piege classique des probes
Ne **jamais** vérifier les dépendances dans la liveness probe. Si votre base de donnees tombe, tous vos pods seront tues et recrees en boucle, aggravant le problème. La liveness doit uniquement vérifier que le processus est vivant (pas de deadlock). Les dépendances se verifient dans la readiness probe.
:::

---

## Aller plus loin : Observabilité GitOps et Platform Engineering

### Observabilité as Code dans un contexte Kubernetes

Dans un contexte Kubernetes, l'Observability as Code (vue au Module 17) prend une dimension supplementaire : les configurations d'observabilité sont elles-memes des objets Kubernetes, déployés via GitOps.

```typescript
interface K8sObservabilityAsCode {
  resource: string;
  format: string;
  deployment: string;
  example: string;
}

const observabilityResources: K8sObservabilityAsCode[] = [
  {
    resource: 'ServiceMonitor / PodMonitor',
    format: 'YAML CRD',
    deployment: 'Deploye avec le Helm chart de l\'application',
    example: 'Le developpeur ajoute un ServiceMonitor dans le meme chart que son Deployment',
  },
  {
    resource: 'PrometheusRule',
    format: 'YAML CRD',
    deployment: 'Deploye via Helm ou Kustomize, synced par ArgoCD/FluxCD',
    example: 'Les alertes sont dans le repo Git, revues par l\'equipe, et deployees automatiquement',
  },
  {
    resource: 'GrafanaDashboard',
    format: 'JSON (ConfigMap) ou CRD Grafana Operator',
    deployment: 'Grafana provisionne les dashboards depuis des ConfigMaps K8s',
    example: 'Dashboard JSON genere par TypeScript, stocke dans un ConfigMap, deploye par ArgoCD',
  },
  {
    resource: 'AlertmanagerConfig',
    format: 'YAML CRD',
    deployment: 'Chaque equipe deploie sa config dans son namespace',
    example: 'L\'equipe commerce configure ses routes Slack/PagerDuty dans son propre namespace',
  },
];
```

```yaml
# Exemple : deployer un dashboard Grafana via ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: order-service-dashboard
  namespace: monitoring
  labels:
    grafana_dashboard: "true"  # Le sidecar Grafana detecte ce label
data:
  order-service.json: |
    {
      "uid": "order-service-overview",
      "title": "Order Service Overview",
      "tags": ["auto-generated", "order-service"],
      "panels": [
        ...
      ]
    }
```

### Monitoring des pipelines CI/CD et des deploiements K8s

Observer vos deployments est aussi important qu'observer vos applications. Un déploiement qui prend 30 minutes au lieu de 5 est un signal d'alerte.

```typescript
// Metriques de deploiement a tracker
interface DeploymentMetric {
  name: string;
  description: string;
  promqlExample: string;
}

const deploymentMetrics: DeploymentMetric[] = [
  {
    name: 'Frequence de deploiement',
    description: 'Combien de fois par semaine on deploie (DORA metric)',
    promqlExample: 'count(changes(kube_deployment_status_observed_generation[7d])) by (deployment)',
  },
  {
    name: 'Duree du rollout',
    description: 'Temps entre le debut du rollout et la disponibilite de tous les replicas',
    promqlExample: 'Mesurer via des annotations Prometheus sur le deployment',
  },
  {
    name: 'Taux d\'echec des deploiements',
    description: 'Pourcentage de rollouts qui necessitent un rollback',
    promqlExample: 'Tracker via un counter custom incremente dans le pipeline CI/CD',
  },
  {
    name: 'Rollbacks',
    description: 'Nombre de rollbacks par semaine',
    promqlExample: 'Tracker via des events Kubernetes ou des metriques custom',
  },
];
```

### eBPF et observabilité sans instrumentation

**eBPF** (extended Berkeley Packet Filter) est une technologie du kernel Linux qui permet d'observer le système à un niveau très bas, sans modifier ni instrumenter les applications.

```typescript
interface EBPFTool {
  name: string;
  project: string;
  capabilities: string[];
  useCase: string;
}

const ebpfTools: EBPFTool[] = [
  {
    name: 'Cilium Hubble',
    project: 'Cilium (CNCF)',
    capabilities: [
      'Visibilite complete du trafic reseau L3/L4/L7',
      'Service map automatique (qui parle a qui)',
      'Metriques HTTP/gRPC/Kafka sans instrumentation',
      'Network policies observables',
    ],
    useCase: 'Alternative au service mesh pour la visibilite reseau, sans overhead sidecar',
  },
  {
    name: 'Pixie',
    project: 'Pixie (CNCF, rachete par New Relic)',
    capabilities: [
      'Capture automatique de requetes HTTP, MySQL, Postgres, Kafka, gRPC, DNS',
      'Flamegraphs CPU automatiques',
      'Traces distribuees sans instrumentation (via eBPF)',
      'Stockage in-cluster (pas d\'exfiltration de donnees)',
    ],
    useCase: 'Debugging instantane sans avoir besoin de redeploy avec de l\'instrumentation',
  },
  {
    name: 'Tetragon',
    project: 'Cilium / Isovalent',
    capabilities: [
      'Observabilite de securite (syscalls, file access, network)',
      'Detection de comportements anormaux au niveau kernel',
      'Enforcement de politique de securite en temps reel',
    ],
    useCase: 'Runtime security et observabilite de securite',
  },
];
```

### OpenCost pour le cost monitoring Kubernetes

L'observabilité inclut aussi les couts. **OpenCost** (projet CNCF) calcule le cout de chaque pod, namespace, label et deployment dans votre cluster.

```typescript
interface CostObservability {
  dimension: string;
  question: string;
  tool: string;
}

const costDimensions: CostObservability[] = [
  {
    dimension: 'Par namespace',
    question: 'Combien coute chaque equipe/environnement ?',
    tool: 'OpenCost expose des metriques Prometheus par namespace',
  },
  {
    dimension: 'Par deployment',
    question: 'Quel service coute le plus cher ?',
    tool: 'OpenCost ventile CPU, memoire, stockage, reseau par deployment',
  },
  {
    dimension: 'Requests vs usage reel',
    question: 'Combien de ressources sont reservees mais non utilisees ?',
    tool: 'Comparer kube_pod_container_resource_requests avec container_cpu_usage / container_memory_working_set',
  },
  {
    dimension: 'Cout par requete',
    question: 'Combien coute une requete API en infrastructure ?',
    tool: 'OpenCost + metriques applicatives pour le unit cost',
  },
];
```

```
# PromQL pour detecter le gaspillage de ressources

# CPU demandee mais non utilisee (par namespace)
sum by (namespace) (
  kube_pod_container_resource_requests{resource="cpu"}
) - sum by (namespace) (
  rate(container_cpu_usage_seconds_total[5m])
)

# Memoire demandee mais non utilisee (par namespace)
sum by (namespace) (
  kube_pod_container_resource_requests{resource="memory"}
) - sum by (namespace) (
  container_memory_working_set_bytes
)
```

::: tip Référence SRE
Le Google SRE Workbook, Chapitre 11 ("Managing Load") détaillé les stratégies de gestion de charge a l'echelle, incluant l'auto-scaling, le load shedding, et la gestion de capacité. Les principes decrits s'appliquent directement au HPA Kubernetes et au dimensionnement des clusters. Le Chapitre 18 du SRE Book ("Software Engineering in SRE") souligne l'importance d'automatiser l'observabilité plutot que de la configurer manuellement — ce qui rejoint directement l'approche GitOps decrite dans cette section.
:::

---

## Résumé

### Tableau récapitulatif

| Couche | Outil | Metriques clés | Dashboard |
|--------|-------|---------------|-----------|
| **Node (hardware)** | node-exporter | CPU, mémoire, disque, réseau | USE par node |
| **Container (runtime)** | cAdvisor (kubelet) | CPU/mem par container, fs, network | USE par pod |
| **Orchestrateur (K8s)** | kube-state-metrics | Pod phase, restarts, replicas, conditions | Pods health |
| **Control plane** | API server, etcd, scheduler | Request rate/latency, leader, proposals | Control plane |
| **Application** | prom-client, OTel | HTTP rate/errors/duration, metriques metier | RED par service |
| **Logs** | Fluent Bit + Loki | Structured JSON logs enrichis K8s metadata | LogQL dans Grafana |
| **Traces** | OTel Operator + Tempo | Spans, trace propagation, service map | Tempo dans Grafana |
| **Couts** | OpenCost | CPU/mem cost par namespace/deployment | Cost dashboard |

### Points clés à retenir

- L'ephemerite des pods impose une **collecte en temps réel** des logs, metriques et traces
- Observer **chaque couche** separement : node, container, orchestrateur, application
- **kube-prometheus-stack** est le point de depart recommande (Prometheus Operator + Grafana + alertes preconfigures)
- Les logs vont sur **stdout**, collectes par un DaemonSet Fluent Bit, stockes dans Loki
- L'**OTel Operator** permet l'auto-instrumentation sans modifier le code
- Les alertes K8s doivent etre **actionnables** avec un runbook, pas du bruit
- L'auto-scaling sur metriques custom (HPA + Prometheus Adapter) est plus pertinent que le scaling sur CPU seul
- **KEDA** permet le scale-to-zero pour les workloads event-driven
- L'observabilité elle-même se deploie en **GitOps** (ServiceMonitor, PrometheusRule, ConfigMap dashboards)
- **eBPF** est l'avenir de l'observabilité sans instrumentation (Cilium, Pixie)

---

## Pour aller plus loin

- [Lab 21 — Observabilité Kubernetes avec kube-prometheus-stack](/labs/lab-21-kubernetes-observability/README)
- [Quiz 20 — Kubernetes & Container Observability](/quizzes/quiz-20-kubernetes-observability)
- Google SRE Book, Chapitre 6 : "Monitoring Distributed Systems"
- Google SRE Workbook, Chapitre 11 : "Managing Load"
- Prometheus Operator Documentation : https://prometheus-operator.dev
- OpenTelemetry Operator : https://opentelemetry.io/docs/kubernetes/operator/
- KEDA Documentation : https://keda.sh
- OpenCost : https://www.opencost.io
- Kubernetes Monitoring with Prometheus (livre, O'Reilly)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 20 kubernetes observability](../screencasts/screencast-20-kubernetes-observability.md)
2. **Lab** : [lab-21-kubernetes-observability](../labs/lab-21-kubernetes-observability/README)
3. **Quiz** : [quiz 20 kubernetes observability](../quizzes/quiz-20-kubernetes-observability.html)
:::
