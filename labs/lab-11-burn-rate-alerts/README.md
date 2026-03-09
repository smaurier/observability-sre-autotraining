# Lab 11 — Alertes Burn Rate

## Objectifs

- Comprendre le concept de burn rate et son lien avec les SLOs
- Implémenter le calcul de burn rate à partir du taux d'erreur et du budget d'erreur
- Maîtriser l'approche multi-fenêtre (multi-window) pour les alertes
- Déterminer la sévérité d'une alerte en fonction du burn rate
- Implémenter la logique d'alerte multi-window multi-burn-rate de Google
- Générer des règles d'alerte Prometheus au format YAML

## Pré-requis

- Avoir complété le Lab 10 (Définir des SLOs)
- Comprendre les concepts de budget d'erreur et de SLO target

## Exercices

### Exercice 1 — Calculer le burn rate

Implémentez une fonction `calculateBurnRate` qui calcule le burn rate à partir d'un taux d'erreur observé et d'un SLO target.

**Formule** : `burn_rate = error_rate / (1 - slo_target)`

Un burn rate de 1 signifie qu'on consomme le budget au rythme prévu sur 30 jours. Un burn rate de 14.4 signifie qu'on épuisera le budget en ~2 heures.

### Exercice 2 — Multi-window burn rate

Implémentez `multiWindowBurnRate` qui calcule le burn rate sur deux fenêtres temporelles (ex: 1h et 6h). Les deux fenêtres doivent dépasser le seuil pour déclencher une alerte.

### Exercice 3 — Sévérité des alertes

Implémentez `determineAlertSeverity` qui retourne la sévérité d'une alerte en fonction du burn rate :
- burn rate >= 14.4 → `'page'` (consomme 100% du budget en 2h)
- burn rate >= 6 → `'page'` (consomme 100% du budget en 5h)
- burn rate >= 3 → `'ticket'` (consomme 100% du budget en 10h)
- burn rate >= 1 → `'ticket'` (consomme 100% du budget en 30 jours)
- sinon → `'none'`

### Exercice 4 — Logique multi-window multi-burn-rate (Google)

Implémentez `multiWindowMultiBurnRateAlert` selon le modèle Google SRE :
| Sévérité | Long window | Short window | Burn rate |
|----------|-------------|--------------|-----------|
| page     | 1h          | 5m           | 14.4      |
| page     | 6h          | 30m          | 6         |
| ticket   | 1d          | 2h           | 3         |
| ticket   | 3d          | 6h           | 1         |

### Exercice 5 — Générer des règles Prometheus

Implémentez `generatePrometheusAlertRules` qui génère des règles d'alerte Prometheus au format YAML string à partir de définitions TypeScript.

## Lancer les tests

```bash
npx tsx exercise.ts
```

## Critères de réussite

- Tous les tests passent (5/5 exercices)
- Le burn rate est calculé correctement selon la formule standard
- Les fenêtres multiples sont correctement combinées
- Les sévérités correspondent aux seuils définis
- Les règles Prometheus générées sont valides
