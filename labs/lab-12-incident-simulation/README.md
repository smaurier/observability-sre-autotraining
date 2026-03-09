# Lab 12 — Simulation d'incident

## Objectifs

- Modéliser un incident avec ses différentes propriétés (sévérité, statut, timeline, rôles)
- Implémenter une machine à états pour gérer le cycle de vie d'un incident
- Comprendre les rôles clés dans la gestion d'incidents (Incident Commander, Comms Lead, Ops Lead)
- Créer une timeline de communication avec des mises à jour de statut
- Simuler un incident complet de la détection à la résolution

## Pré-requis

- Avoir complété les Labs 10-11 (SLOs et burn rate)
- Comprendre les bases de la gestion d'incidents

## Exercices

### Exercice 1 — Modéliser un incident

Créez un type `Incident` avec les champs suivants :
- `id`: identifiant unique
- `severity`: P1, P2, P3 ou P4
- `title`: titre descriptif
- `status`: detected, triaged, mitigating, resolved
- `timeline`: tableau d'événements avec timestamp et description
- `roles`: map des rôles assignés

### Exercice 2 — Machine à états d'incident

Implémentez une machine à états qui valide les transitions :
- `detected` → `triaged`
- `triaged` → `mitigating`
- `mitigating` → `resolved`
- Toute autre transition est invalide

### Exercice 3 — Assigner les rôles

Implémentez l'assignation des rôles d'incident :
- **Incident Commander (IC)** : coordonne la réponse
- **Comms Lead** : gère la communication
- **Ops Lead** : effectue les actions techniques

### Exercice 4 — Timeline de communication

Créez une timeline avec des mises à jour de statut horodatées pour communiquer l'état de l'incident aux stakeholders.

### Exercice 5 — Simulation complète

Simulez un incident complet avec timestamps automatiques, de la détection à la résolution.

## Lancer les tests

```bash
npx tsx exercise.ts
```

## Critères de réussite

- Tous les tests passent (5/5 exercices)
- Les transitions d'état sont correctement validées
- Les rôles sont correctement assignés
- La timeline contient tous les événements attendus
- La simulation produit un incident résolu avec des timestamps cohérents
