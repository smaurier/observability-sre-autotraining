# Screencast 20 — Kubernetes & Container Observability

## Informations
- **Duree estimee** : 8-10 min
- **Module** : `modules/20-kubernetes-observability.md`
- **Lab associe** : Lab 21
- **Prérequis** : Screencast 15

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal intégré ouvert
- [ ] Un cluster Kubernetes accessible (minikube, kind ou distant)
- [ ] kubectl configure et fonctionnel
- [ ] Helm installe pour le déploiement de Prometheus Operator

## Script

### [00:00-01:30] Introduction

> Dans les modules précédents, nous avons instrumente une application Node.js avec des metriques, des logs et des traces. Mais en production, vos applications tournent rarement seules sur un serveur — elles tournent dans des conteneurs, orchestres par Kubernetes. Et Kubernetes ajoute une couche entière de metriques et de signaux qu'il faut observer.

> L'observabilité Kubernetes se situe a trois niveaux : l'infrastructure (noeuds, CPU, mémoire), l'orchestration (deployments, pods, replicas) et l'application (vos metriques custom). Aujourd'hui, nous allons couvrir les deux premiers niveaux et voir comment les intégrer dans votre stack d'observabilité.

### [01:30-03:00] Le paysage des metriques Kubernetes

> Kubernetes expose ses metriques via plusieurs composants complementaires.

```
+-------------------+     +----------------------+     +------------------+
|     cAdvisor      |     |  kube-state-metrics  |     |  metrics-server  |
| (dans le kubelet) |     |   (deploiement)      |     |  (deploiement)   |
+-------------------+     +----------------------+     +------------------+
| CPU, memoire,     |     | Etat des objets K8s: |     | Metriques temps  |
| reseau, filesystem|     | pods, deployments,   |     | reel pour HPA    |
| par conteneur     |     | nodes, jobs, etc.    |     | et kubectl top   |
+-------------------+     +----------------------+     +------------------+
```

> cAdvisor est intégré dans le kubelet. Il collecte automatiquement les metriques de ressources de chaque conteneur : CPU, mémoire, réseau, disque. Pas besoin de l'installer — il est la par defaut.

> kube-state-metrics est un service à déployer separement. Il ecoute l'API server et généré des metriques sur l'état des objets Kubernetes. Par exemple : combien de replicas sont desirees vs disponibles, dans quelle phase est un pod, quels sont les conditions d'un noeud.

> metrics-server fournit les metriques en temps réel utilisees par le Horizontal Pod Autoscaler et la commande `kubectl top`. Il n'est pas concu pour la retention — c'est du temps réel uniquement.

### [03:00-05:00] Déployer Prometheus Operator avec un ServiceMonitor

> Pour scraper ces metriques avec Prometheus, la meilleure approche est le Prometheus Operator. Il introduit des CRDs (Custom Resource Definitions) qui permettent de configurer Prometheus de manière declarative.

**Action** : Montrer un fichier ServiceMonitor.

```yaml
# service-monitor-demo.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: demo-app-monitor
  namespace: monitoring
  labels:
    app: demo-app
spec:
  selector:
    matchLabels:
      app: demo-app
  endpoints:
    - port: metrics
      interval: 30s
      path: /metrics
  namespaceSelector:
    matchNames:
      - production
      - staging
```

> Le ServiceMonitor dit a Prometheus : "Scrape tous les services qui ont le label app=demo-app, sur le port nomme metrics, toutes les 30 secondes, dans les namespaces production et staging." Quand un nouveau pod apparait avec ce label, Prometheus le découvre automatiquement. Quand il disparait, Prometheus arrete de le scraper. C'est la découverte de service native Kubernetes.

### [05:00-06:30] Dashboard kube-state-metrics

> Voyons les requêtes PromQL essentielles pour surveiller un cluster Kubernetes.

```promql
# CPU par namespace
sum(rate(container_cpu_usage_seconds_total{container!=""}[5m])) by (namespace)

# Memoire par namespace
sum(container_memory_working_set_bytes{container!=""}) by (namespace)

# Pods qui redemarrent
sum(rate(kube_pod_container_status_restarts_total[15m])) by (namespace, pod) > 0

# Pods pas prets
kube_pod_status_ready{condition="false"}

# Conteneurs tues par OOMKiller
kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}

# Top 10 pods par CPU
topk(10, sum(rate(container_cpu_usage_seconds_total{container!=""}[5m])) by (namespace, pod))
```

> Ces requêtes forment la base d'un dashboard Kubernetes. La première montre la consommation CPU par namespace — utile pour identifier quel namespace consomme le plus. Les pods qui redemarrent frequemment sont un signal d'alerte : CrashLoopBackOff, OOMKilled. La requête OOMKilled est particulierement importante — elle montre les conteneurs qui se font tuer par le noyau parce qu'ils depassent leur limite mémoire.

### [06:30-08:00] Alerting sur les defaillances de pods

> Configurons des alertes Prometheus pour les problèmes les plus courants en Kubernetes.

```yaml
# PrometheusRule pour les alertes K8s
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: kubernetes-pod-alerts
spec:
  groups:
    - name: kubernetes-pods
      rules:
        - alert: PodCrashLooping
          expr: rate(kube_pod_container_status_restarts_total[15m]) * 60 * 15 > 0
          for: 1h
          labels:
            severity: warning
          annotations:
            summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} redemarre frequemment"

        - alert: PodOOMKilled
          expr: kube_pod_container_status_last_terminated_reason{reason="OOMKilled"} == 1
          for: 0m
          labels:
            severity: critical
          annotations:
            summary: "Conteneur {{ $labels.container }} OOMKilled dans {{ $labels.namespace }}/{{ $labels.pod }}"

        - alert: NodeNotReady
          expr: kube_node_status_condition{condition="Ready",status="true"} == 0
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Noeud {{ $labels.node }} n'est pas Ready depuis 5 minutes"
```

> Trois alertes essentielles. PodCrashLooping détecté les pods qui redemarrent en boucle — le `for: 1h` evite les faux positifs lors des deployments. PodOOMKilled est immediate (`for: 0m`) car un OOM est toujours un problème a traiter. NodeNotReady détecté quand un noeud du cluster devient indisponible.

### [08:00-09:00] Récapitulatif

> Recapitulons. L'observabilité Kubernetes repose sur trois composants clés : cAdvisor pour les metriques de conteneurs, kube-state-metrics pour l'état des objets K8s, et metrics-server pour le temps réel.

> Le Prometheus Operator avec les ServiceMonitors permet une découverte automatique et declarative des cibles de scrape. Les requêtes PromQL que nous avons vues forment la base d'un dashboard Kubernetes operationnel.

> Les alertes sur CrashLoopBackOff, OOMKilled et NodeNotReady couvrent les problèmes les plus frequents. Pour aller plus loin, des outils bases sur eBPF comme Cilium Hubble et Pixie offrent une observabilité au niveau du noyau sans instrumentation.

> Faites le Lab 21 pour simuler des metriques Kubernetes, détecter les CrashLoopBackOff et OOMKilled, et construire vos propres requêtes PromQL de dashboard !

## Points d'attention pour l'enregistrement
- Le schema des trois composants (cAdvisor, kube-state-metrics, metrics-server) doit etre clair et distinct
- Le ServiceMonitor est le concept central — expliquer la découverte automatique
- Les requêtes PromQL doivent etre expliquees une par une, pas survolees
- Les alertes PrometheusRule montrent la continuite avec les modules précédents (alerting)
- Mentionner eBPF comme perspective d'avenir, sans entrer dans les details
- Le lab associe est le Lab 21 (simulation), pas une manipulation de cluster réel
