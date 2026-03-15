# Lab 21 — Kubernetes & Container Observability

## Objectifs

- Comprendre le format des metriques kube-state-metrics
- Creer une configuration ServiceMonitor pour Prometheus Operator
- Calculer l'utilisation des ressources des pods (CPU, memoire)
- Detecter les patterns CrashLoopBackOff et OOMKilled
- Construire des requetes PromQL pour des dashboards Kubernetes
- Calculer l'utilisation des ressources au niveau du noeud

## Pre-requis

- Avoir complete les Labs 10-11 (SLOs et burn rate)
- Comprendre les concepts de base de Kubernetes (pods, deployments, nodes)
- Connaitre les bases de PromQL

## Exercices

### Exercice 1 — Simulation de metriques de pods Kubernetes

Simulez des metriques de pods incluant CPU, memoire, restarts et statut. Generez des donnees realistes pour un cluster Kubernetes.

### Exercice 2 — Detection de CrashLoopBackOff

Implementez une fonction qui detecte les pods en CrashLoopBackOff en analysant le nombre de redemarrages et les intervalles entre eux.

### Exercice 3 — Detection de OOMKilled

Implementez une fonction qui identifie les conteneurs termines par le noyau pour depassement de memoire (OOMKilled).

### Exercice 4 — Calcul d'utilisation des ressources du noeud

Calculez le taux d'utilisation CPU et memoire au niveau du noeud en agregeant les metriques des pods.

### Exercice 5 — Generation de configuration ServiceMonitor

Generez une configuration YAML de ServiceMonitor pour la decouverte automatique de services par Prometheus Operator.

### Exercice 6 — Construction de requetes PromQL pour dashboards K8s

Construisez des requetes PromQL pour surveiller un cluster Kubernetes : utilisation CPU/memoire par namespace, pods en erreur, taux de redemarrage.

## Lancer les tests

```bash
npx tsx exercise.ts
```

## Criteres de reussite

- Tous les tests passent (6 exercices)
- Les metriques de pods sont realistes (CPU 0-100%, memoire en bytes)
- La detection de CrashLoopBackOff identifie correctement les pods instables
- La detection de OOMKilled identifie les conteneurs termines par manque de memoire
- L'utilisation des ressources du noeud est calculee correctement
- Le ServiceMonitor YAML est valide
- Les requetes PromQL sont syntaxiquement correctes
