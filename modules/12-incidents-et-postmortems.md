# Module 12 — Gestion d'incidents et postmortems

> **Durée estimée** : 3h30
> **Difficulté** : 2/5
> **Prérequis** : Module 10 (SLI/SLO/SLA), Module 11 (Alerting)
> **Objectifs** :
> - Comprendre le cycle de vie d'un incident (détection → résolution → postmortem)
> - Définir les rôles dans une équipe d'astreinte (Incident Commander, Communication Lead)
> - Classifier les incidents par sévérité
> - Rédiger un postmortem blameless
> - Extraire des action items actionnables

---

## 1. Anatomie d'un incident

Un incident traverse 5 phases :

```
Détection → Triage → Mitigation → Résolution → Postmortem
   (alerte)  (sévérité)  (limiter l'impact)  (fix root cause)  (apprendre)
```

### Classification par sévérité

| Sévérité | Impact | Exemple | Temps de réponse |
|----------|--------|---------|-----------------|
| SEV-1 | Service down, tous les utilisateurs affectés | API principale retourne 500 | < 15 min |
| SEV-2 | Dégradation majeure, une feature critique down | Paiements échouent | < 30 min |
| SEV-3 | Dégradation mineure, workaround possible | Recherche lente (>5s) | < 2h |
| SEV-4 | Cosmétique ou impact limité | Favicon manquant en prod | Next business day |

---

## 2. Rôles pendant un incident

### Incident Commander (IC)

- Coordonne la réponse
- Décide de l'escalade
- Ne debug PAS (il orchestre)
- Communique les deadlines de mise à jour

### Communication Lead

- Met à jour la status page
- Informe les parties prenantes (PO, clients, direction)
- Rédige les communications externes

### Technical Lead(s)

- Debuggent le problème
- Proposent et implémentent la mitigation
- Documentent les actions en temps réel

### Scribe

- Note la timeline des événements
- Capture les décisions et hypothèses
- Produit la base du postmortem

---

## 3. Processus de réponse

### 3.1. Détection

```
Alerte Prometheus → PagerDuty/OpsGenie → Notification on-call
                                              ↓
                                    Acknowledge dans les 5 min
                                              ↓
                                    Évaluer la sévérité
```

### 3.2. Triage

Questions clés :
1. **Qui est impacté ?** (tous les users, un segment, une région)
2. **Depuis quand ?** (premier signal dans les métriques/logs)
3. **Qu'est-ce qui a changé ?** (déploiement récent, config change, pic de trafic)

### 3.3. Mitigation

La mitigation ≠ la résolution. L'objectif est de **limiter l'impact** rapidement :

- **Rollback** le dernier déploiement
- **Feature flag off** pour la feature cassée
- **Scale up** si c'est un problème de charge
- **Rediriger** le trafic vers un datacenter sain
- **Activer** le mode dégradé (cache stale, page statique)

### 3.4. Résolution

Après la mitigation, corriger la root cause :
- Fix le bug, déployer le patch
- Corriger la config
- Mettre à jour l'infrastructure

---

## 4. Postmortem blameless

Le postmortem n'est PAS une chasse aux coupables. C'est un outil d'apprentissage organisationnel.

### Principe blameless

> « Les humains ne sont pas la root cause. Les systèmes qui permettent aux humains de faire des erreurs sont la root cause. »

Mauvais : « Jean a déployé sans tester → production down. »
Bon : « Le pipeline CI/CD n'avait pas de tests d'intégration, permettant un déploiement de code non vérifié. »

### Template de postmortem

```markdown
# Postmortem — [Titre de l'incident]
**Date** : 2025-03-15
**Durée** : 2h15 (14:30 → 16:45 UTC)
**Sévérité** : SEV-2
**Auteur** : [Nom]
**Reviewers** : [Noms]

## Résumé
En une phrase : quoi, pendant combien de temps, quel impact.

## Impact
- X utilisateurs affectés
- Y requêtes en erreur
- Z€ de revenu perdu (si applicable)

## Timeline
| Heure | Événement |
|-------|-----------|
| 14:30 | Déploiement v2.3.1 |
| 14:35 | Alerte error_rate > 5% |
| 14:40 | IC assigné, triage commence |
| 14:55 | Root cause identifiée : migration DB incomplète |
| 15:10 | Rollback v2.3.0 |
| 15:15 | Taux d'erreur revient à la normale |
| 16:45 | Fix déployé (v2.3.2 avec migration corrigée) |

## Root cause
La migration de la table `orders` ajoutait une colonne NOT NULL sans valeur par défaut.
Les requêtes INSERT échouaient pour les commandes existantes.

## Ce qui a bien fonctionné
- L'alerte a détecté le problème en 5 minutes
- Le rollback était simple (feature flag + revert)

## Ce qui peut être amélioré
- Le pipeline CI n'exécutait pas les migrations sur une copie de prod
- Pas de canary deployment pour valider progressivement

## Action items
| Action | Responsable | Date limite | Priorité |
|--------|-------------|-------------|----------|
| Ajouter un check de migration dans le CI | @alice | 2025-03-22 | P1 |
| Implémenter canary deployment | @bob | 2025-04-01 | P2 |
| Documenter le processus de rollback | @charlie | 2025-03-20 | P3 |
```

---

## 5. Action items efficaces

Un bon action item est :
- **Spécifique** : « Ajouter un test d'intégration pour les migrations » (pas « améliorer les tests »)
- **Assigné** : un responsable nommé
- **Daté** : une date limite réaliste
- **Priorisé** : P1 (cette semaine), P2 (ce sprint), P3 (ce trimestre)
- **Vérifiable** : on peut vérifier si c'est fait ou non

### Catégories d'action items

| Catégorie | Exemple | Impact |
|-----------|---------|--------|
| **Détection** | Ajouter une alerte sur le lag de réplication | Détecter plus tôt |
| **Mitigation** | Créer un runbook de rollback | Réagir plus vite |
| **Prévention** | Ajouter un test de charge dans le CI | Empêcher la récurrence |
| **Process** | Documenter le processus d'escalade | Réduire le MTTR |

---

## 6. Métriques d'incidents

| Métrique | Définition | Cible typique |
|----------|------------|---------------|
| MTTD (Mean Time To Detect) | Temps entre le début du problème et la première alerte | < 5 min |
| MTTA (Mean Time To Acknowledge) | Temps entre l'alerte et le premier humain qui regarde | < 15 min |
| MTTR (Mean Time To Resolve) | Temps entre le début et la résolution complète | < 4h (SEV-1) |
| MTBF (Mean Time Between Failures) | Temps entre deux incidents | > 30 jours |

---

## 7. Récapitulatif

- Les incidents suivent un cycle : **Détection → Triage → Mitigation → Résolution → Postmortem**
- L'IC coordonne, il ne debug pas — séparation des rôles
- **Mitigation d'abord**, résolution ensuite — limiter l'impact est la priorité
- Les postmortems sont **blameless** — les systèmes sont responsables, pas les individus
- Les action items doivent être spécifiques, assignés et datés
- MTTD, MTTA, MTTR sont les métriques clés de la maturité incident
