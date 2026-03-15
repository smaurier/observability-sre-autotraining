# Lab 26 — Feature Flags et Observabilité

## Objectifs

- Implémenter un service de feature flags avec rollout progressif
- Évaluer les flags par utilisateur (pourcentage, whitelist, attributs)
- Collecter les métriques d'impact par flag (taux d'erreur, latence)
- Implémenter un kill switch automatique basé sur les métriques

## Prérequis

- Module 26 (Feature Flags et Observabilité)
- Node.js 20+, npx tsx

## Instructions

```bash
# Lancer l'exercice
npx tsx exercise.ts

# Vérifier avec la solution
npx tsx solution.ts
```

## Parties

1. **Flag evaluation** — Évaluer un flag pour un utilisateur (on/off/pourcentage)
2. **Progressive rollout** — Augmenter progressivement le pourcentage
3. **Metrics per flag** — Collecter taux d'erreur et latence par variante
4. **Kill switch** — Désactiver automatiquement un flag si les métriques dépassent un seuil
