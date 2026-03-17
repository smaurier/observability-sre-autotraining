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
> - Mettre en place une culture blameless et de sécurité psychologique
> - Organiser les rotations d'astreinte et les runbooks
> - Maîtriser les techniques d'analyse de cause racine (5 Whys, Fishbone)

---

## 1. Anatomie d'un incident

Un incident traverse 5 phases :

```
Détection → Triage → Mitigation → Résolution → Postmortem
   (alerte)  (sévérité)  (limiter l'impact)  (fix root cause)  (apprendre)
```

L'analogie médicale est parlante : on détecte un symptôme (fièvre), on triage (urgences ou médecin de ville), on mitigue (paracétamol pour faire baisser la fièvre), on résout (traitement antibiotique), puis on fait le bilan (comment éviter la prochaine infection).

---

## 2. Classification par sévérité

### 2.1. Définitions SEV-1 à SEV-4

| Sévérité | Impact | Exemple | Temps de réponse | Escalade |
|----------|--------|---------|-----------------|----------|
| SEV-1 | Service down, tous les utilisateurs affectés | API principale retourne 500 | < 15 min | IC + management + comms externes |
| SEV-2 | Dégradation majeure, une feature critique down | Paiements échouent | < 30 min | IC + team lead |
| SEV-3 | Dégradation mineure, workaround possible | Recherche lente (>5s) | < 2h | Équipe on-call |
| SEV-4 | Cosmétique ou impact limité | Favicon manquant en prod | Next business day | Ticket Jira |

### 2.2. Critères de classification détaillés

La sévérité ne dépend pas seulement de la nature technique du problème. Elle dépend de **l'impact business** :

**SEV-1 — Critique (incident majeur)**
- Service entièrement indisponible pour tous les utilisateurs
- Perte de données confirmée
- Faille de sécurité active (données exposées)
- Violation réglementaire (RGPD, PCI-DSS)
- Impact financier > 10k€/heure (adapter à votre contexte)

**SEV-2 — Majeur**
- Feature critique dégradée (paiements, authentification)
- Performance dégradée affectant > 25% des utilisateurs
- Un service secondaire down avec impact sur le service principal
- Erreur rate > 5% sur un endpoint critique

**SEV-3 — Modéré**
- Feature non critique dégradée
- Performance dégradée affectant < 25% des utilisateurs
- Workaround disponible et documenté
- Un service non critique down

**SEV-4 — Mineur**
- Bug cosmétique en production
- Alerte non urgente (warning sans impact utilisateur)
- Maintenance planifiée qui cause un impact mineur

### 2.3. Escalade et désescalade

Un incident peut changer de sévérité au cours de sa vie :

```
SEV-3 → Investigation → Découverte que l'impact est plus large → Escalade SEV-1
SEV-1 → Mitigation appliquée → Impact réduit → Désescalade SEV-2
```

**Règle d'or** : en cas de doute, **escaladez**. Il vaut mieux sur-réagir et désescalader que sous-réagir et perdre du temps.

L'IC est responsable des décisions d'escalade/désescalade, mais **n'importe qui** dans l'équipe peut demander une escalade.

---

## 3. Rôles pendant un incident

### 3.1. Incident Commander (IC)

L'IC est le chef d'orchestre. Il ne joue d'aucun instrument — il dirige.

**Responsabilités** :
- Coordonne la réponse globale
- Décide de l'escalade et de la désescalade
- Ne debug PAS (il orchestre)
- Communique les deadlines de mise à jour
- Assigne les tâches aux autres rôles
- Décide quand l'incident est résolu

**Phrases clés de l'IC** :
```
"L'incident est classé SEV-2. Je suis l'IC. Alice est Comms Lead, Bob est Tech Lead."
"Prochain point de situation dans 15 minutes."
"Bob, peux-tu vérifier les logs du service payment entre 14h30 et 14h35 ?"
"La mitigation est en place. Je propose de désescalader en SEV-3."
"L'incident est déclaré résolu à 16h45. Le postmortem sera programmé demain."
```

**Qui peut être IC ?** N'importe quel ingénieur senior formé. L'IC n'a pas besoin d'être expert technique du système en panne — son rôle est la coordination.

### 3.2. Communication Lead (Comms Lead)

Le Comms Lead est l'interface entre l'équipe technique et le monde extérieur.

**Responsabilités** :
- Met à jour la status page
- Informe les parties prenantes (PO, clients, direction)
- Rédige les communications externes
- Gère le canal de communication incident (Slack channel dédié)

**Templates de communication** :

```markdown
# Communication interne (Slack #incident-xxx)
🔴 **SEV-1 — API principale indisponible**
**Impact** : 100% des utilisateurs ne peuvent pas accéder au service
**Depuis** : 14h30 UTC
**Équipe mobilisée** : IC @alice, Tech @bob @charlie, Comms @diane
**Prochain update** : 14h50 UTC

# Update interne
🟡 **Update SEV-1 — Mitigation en cours**
**Root cause identifiée** : Migration DB incomplète
**Action** : Rollback en cours (ETA 5 min)
**Prochain update** : 15h10 UTC

# Résolution interne
🟢 **RÉSOLU — SEV-1 API principale**
**Durée** : 2h15 (14h30 → 16h45)
**Root cause** : Migration DB sans valeur par défaut
**Postmortem** : programmé demain 10h
```

```markdown
# Communication externe — status page (initial)
**Incident en cours — Dégradation du service**
Nous avons identifié un problème affectant l'accès à notre plateforme.
Nos équipes travaillent activement à la résolution.
Prochain point de situation dans 30 minutes.

# Communication externe — status page (update)
**Mise à jour — Service en cours de restauration**
Nous avons identifié la cause du problème et une correction est en cours
de déploiement. Le service devrait être rétabli dans les prochaines minutes.

# Communication externe — status page (résolution)
**Résolu — Service rétabli**
Le service est entièrement rétabli depuis 16h45 UTC.
L'incident a duré 2h15 et a affecté l'accès à la plateforme.
Une analyse détaillée est en cours pour prévenir toute récurrence.
Nous présentons nos excuses pour la gêne occasionnée.
```

### 3.3. Technical Lead(s) / SME (Subject Matter Expert)

- Debuggent le problème
- Proposent et implémentent la mitigation
- Documentent les actions en temps réel
- Fournissent des updates techniques à l'IC

**Bon réflexe** : le Tech Lead annonce à voix haute (ou dans le chat) ce qu'il fait AVANT de le faire. Cela évite que deux personnes fassent la même chose ou que des actions conflictuelles soient menées en parallèle.

```
"Je vais vérifier les logs du service payment."
"Je lance un rollback vers v2.3.0."
"Je scale up le service order de 3 à 10 instances."
```

### 3.4. Scribe

Le rôle le plus sous-estimé et pourtant le plus précieux pour le postmortem.

**Responsabilités** :
- Note la timeline des événements avec l'heure exacte
- Capture les décisions et hypothèses
- Enregistre les commandes exécutées et leurs résultats
- Produit la base du postmortem

**Format de prise de notes** :

```markdown
14:30 - Alerte HighErrorRate déclenchée (error_rate = 12%)
14:32 - Alice acknowledge l'alerte
14:35 - Alice déclare SEV-2, se désigne IC. Bob = Tech Lead, Charlie = Comms
14:37 - Bob vérifie les logs : "Connection refused" vers la DB
14:40 - Bob : "Le dernier déploiement (v2.3.1) incluait une migration DB"
14:42 - IC décide de tenter un rollback vers v2.3.0
14:45 - Bob lance le rollback : `kubectl rollout undo deployment/order-service`
14:48 - Rollback effectif, error_rate redescend à 0.3%
14:50 - IC désescalade en SEV-3, continue l'investigation
15:30 - Root cause confirmée : migration ALTER TABLE sans DEFAULT
16:00 - Fix v2.3.2 prêt (migration corrigée avec DEFAULT)
16:30 - Déploiement v2.3.2 en canary (10%)
16:40 - Canary OK, déploiement complet
16:45 - IC déclare l'incident résolu
```

---

## 4. Processus de réponse détaillé

### 4.1. Détection

```
Alerte Prometheus → PagerDuty/OpsGenie → Notification on-call
                                              ↓
                                    Acknowledge dans les 5 min
                                              ↓
                                    Évaluer la sévérité
```

La détection peut venir de plusieurs sources :
- **Automatique** : alerte SLO, alerte sur les métriques, smoke tests
- **Utilisateurs** : signalement via support, réseaux sociaux
- **Interne** : un développeur remarque un comportement anormal

L'objectif est de minimiser le **MTTD** (Mean Time To Detect). Les alertes automatiques basées sur les SLO sont le moyen le plus efficace.

### 4.2. Triage

Questions clés :
1. **Qui est impacté ?** (tous les users, un segment, une région)
2. **Depuis quand ?** (premier signal dans les métriques/logs)
3. **Qu'est-ce qui a changé ?** (déploiement récent, config change, pic de trafic)

**Checklist de triage rapide** :

```markdown
□ Quel est l'impact utilisateur ? (%, nombre, segments)
□ Depuis quand le problème existe-t-il ?
□ Y a-t-il eu un déploiement récent ? (vérifier le pipeline CI/CD)
□ Y a-t-il eu un changement de configuration ?
□ Y a-t-il un pic de trafic inhabituel ?
□ D'autres services sont-ils affectés ?
□ Le problème est-il limité à une région/zone ?
```

### 4.3. Mitigation

La mitigation ≠ la résolution. L'objectif est de **limiter l'impact** rapidement :

- **Rollback** le dernier déploiement
- **Feature flag off** pour la feature cassée
- **Scale up** si c'est un problème de charge
- **Rediriger** le trafic vers un datacenter sain
- **Activer** le mode dégradé (cache stale, page statique)
- **Bloquer** le trafic malveillant (WAF rule)
- **Redémarrer** le service (si memory leak, mais ce n'est qu'un pansement)

**La mitigation est TOUJOURS la priorité.** Ne cherchez pas la root cause avant d'avoir mitigé. Un service restauré en 5 minutes avec un rollback est infiniment mieux qu'un fix parfait en 2 heures.

### 4.4. Résolution

Après la mitigation, corriger la root cause :
- Fix le bug, déployer le patch
- Corriger la config
- Mettre à jour l'infrastructure

La résolution peut prendre des heures ou des jours. C'est normal. L'important est que la mitigation protège les utilisateurs en attendant.

---

## 5. Culture blameless

### 5.1. Le principe fondamental

Le postmortem n'est PAS une chasse aux coupables. C'est un outil d'apprentissage organisationnel.

> « Les humains ne sont pas la root cause. Les systèmes qui permettent aux humains de faire des erreurs sont la root cause. »

Mauvais : « Jean a déployé sans tester → production down. »
Bon : « Le pipeline CI/CD n'avait pas de tests d'intégration, permettant un déploiement de code non vérifié. »

### 5.2. Pourquoi le blameless fonctionne

Quand les gens ont peur d'être punis pour leurs erreurs :
- Ils **cachent** les problèmes au lieu de les signaler
- Ils **minimisent** la sévérité des incidents
- Ils **évitent** les actions risquées (même quand elles sont nécessaires)
- Ils ne **partagent pas** ce qu'ils ont appris

Quand l'environnement est blameless :
- Les incidents sont signalés **immédiatement**
- Les postmortems sont **honnêtes** et détaillés
- L'équipe **apprend** réellement de chaque incident
- L'innovation et la prise de risque calculée sont **encouragées**

### 5.3. Le modèle Just Culture

Le modèle Just Culture, emprunté à l'aviation et à la médecine, distingue trois types de comportements :

| Type | Description | Réponse appropriée |
|------|-------------|-------------------|
| **Erreur humaine** | Glissement involontaire, oubli, mauvaise manipulation | Consoler et améliorer le système |
| **Comportement à risque** | Prendre un raccourci conscient (ex: skipper les tests "juste cette fois") | Coacher et ajuster les incitations |
| **Comportement négligent** | Ignorer délibérément les procédures connues de manière répétée | Discipliner (très rare en pratique) |

L'immense majorité des incidents (>95%) relèvent de la première catégorie. La question n'est pas « qui a fait l'erreur ? » mais « pourquoi le système a-t-il permis cette erreur ? ».

### 5.4. Sécurité psychologique en pratique

**Pendant l'incident** :
- L'IC ne blâme jamais quelqu'un devant le groupe
- Les phrases sont orientées vers le problème, pas vers les personnes
- « La migration a causé une erreur » et non « Tu as fait une migration qui a tout cassé »

**Pendant le postmortem** :
- Commencer par rappeler les règles du blameless
- Encourager la transparence : « Qu'est-ce qu'on ne savait pas ? Qu'est-ce qui nous a surpris ? »
- Célébrer les bonnes réactions (détection rapide, mitigation efficace)
- Formuler les problèmes comme des faiblesses du système, pas des fautes individuelles

**Dans la durée** :
- La direction doit **activement** soutenir la culture blameless
- Publier les postmortems en interne (transparence)
- Partager les incidents les plus intéressants en "learning review" d'équipe
- Ne jamais sanctionner quelqu'un à la suite d'un postmortem (sauf négligence délibérée)

---

## 6. Postmortem — guide complet

### 6.1. Quand rédiger un postmortem ?

**Toujours** pour les SEV-1 et SEV-2. **Recommandé** pour les SEV-3 si :
- L'incident a révélé un problème systémique
- La durée de résolution a dépassé les attentes
- L'incident était "intéressant" (nouveau type de panne, near miss)

Un postmortem doit être rédigé dans les **48h** suivant la résolution de l'incident, tant que les souvenirs sont frais.

### 6.2. Template de postmortem complet

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
- SLO breach : oui/non (détailler quel SLO)
- Error budget consommé : X%

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

## Détection
Comment l'incident a-t-il été détecté ?
- Alerte automatique ? Signalement utilisateur ? Découverte interne ?
- Était-ce assez rapide ? Comment détecter plus tôt ?

## Root cause
La migration de la table `orders` ajoutait une colonne NOT NULL sans valeur par défaut.
Les requêtes INSERT échouaient pour les commandes existantes.

## Analyse de cause racine détaillée
(voir section 6.3 pour les techniques)

## Facteurs contributifs
- Le pipeline CI n'exécutait pas les migrations sur une copie de prod
- Pas de canary deployment pour valider progressivement
- La review de code n'a pas détecté l'absence de DEFAULT
- La documentation des migrations n'était pas à jour

## Ce qui a bien fonctionné
- L'alerte a détecté le problème en 5 minutes
- Le rollback était simple (feature flag + revert)
- L'IC a été assigné rapidement
- La communication interne était fluide

## Ce qui peut être amélioré
- Le pipeline CI n'exécutait pas les migrations sur une copie de prod
- Pas de canary deployment pour valider progressivement
- Pas de runbook pour ce type d'incident

## Action items
| Action | Responsable | Date limite | Priorité |
|--------|-------------|-------------|----------|
| Ajouter un check de migration dans le CI | @alice | 2025-03-22 | P1 |
| Implémenter canary deployment | @bob | 2025-04-01 | P2 |
| Documenter le processus de rollback | @charlie | 2025-03-20 | P3 |
| Ajouter une alerte sur le taux de rejects DB | @diane | 2025-03-22 | P1 |

## Leçons apprises
Résumé en 2-3 points des enseignements principaux pour l'équipe.
```

### 6.3. Techniques d'analyse de cause racine

#### Les 5 Whys (les 5 Pourquoi)

Technique simple mais puissante : poser "Pourquoi ?" cinq fois pour remonter à la cause racine.

```
Problème : Les paiements ont échoué pendant 30 minutes.

1. Pourquoi ? → Le service Payment retournait des erreurs 500.
2. Pourquoi ? → Le pool de connexions à la DB était saturé.
3. Pourquoi ? → Une requête SQL non optimisée prenait 30s par exécution.
4. Pourquoi ? → Un index manquait sur la table `transactions`
                après la migration du matin.
5. Pourquoi ? → Le processus de review des migrations ne vérifie pas
                les plans d'exécution SQL.

→ Root cause : absence de validation des performances des migrations SQL
→ Action : ajouter un step `EXPLAIN ANALYZE` automatique dans le pipeline de migration
```

**Pièges des 5 Whys** :
- Ne pas s'arrêter trop tôt (si la réponse est "une erreur humaine", continuer : pourquoi le système a-t-il permis cette erreur ?)
- Ne pas s'arrêter trop tard (si on arrive à "parce que les humains sont faillibles", c'est trop abstrait)
- Explorer **plusieurs branches** — il y a souvent plusieurs causes racines

#### Le diagramme Fishbone (Ishikawa)

Le diagramme en arête de poisson structure les causes potentielles en catégories :

```
                        Personnes        Processus
                            │               │
                            ├───────────────┤
                            │               │
                            ↓               ↓
                     ┌──────────────────────────┐
 Technologie ───────→│      INCIDENT            │←─────── Environnement
                     │  Paiements down 30min    │
 Outillage  ────────→│                          │←─────── Données
                     └──────────────────────────┘
```

**Catégories à explorer** :

| Catégorie | Questions à poser |
|-----------|------------------|
| **Personnes** | Formation suffisante ? Fatigue (fin de semaine) ? Turnover récent ? |
| **Processus** | Review de code ? Checklist de déploiement ? Escalade claire ? |
| **Technologie** | Monitoring en place ? Tests suffisants ? Architecture résiliente ? |
| **Outillage** | CI/CD fiable ? Rollback automatisé ? Feature flags ? |
| **Environnement** | Pic de trafic ? Dépendance externe down ? Infrastructure limitée ? |
| **Données** | Migration récente ? Données corrompues ? Volume inattendu ? |

### 6.4. Revue de postmortem

Le postmortem écrit n'est que la moitié du travail. La **revue en groupe** est essentielle :

1. **Planifier** la revue dans les 5 jours suivant l'incident
2. **Inviter** toutes les personnes impliquées + les personnes intéressées
3. **Lire** le postmortem en avance (l'envoyer la veille)
4. **Animer** la session (30-60 min) :
   - Relire la timeline ensemble
   - Poser les questions : « Qu'est-ce qui nous a surpris ? »
   - Valider les action items et leurs responsables
   - Identifier les patterns récurrents
5. **Publier** le postmortem finalisé en interne (wiki, Notion, Confluence)

---

## 7. Action items efficaces

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

### Suivi des action items

Les action items non suivis sont le problème #1 des postmortems. Pour éviter cela :

1. **Tracker** chaque action item dans l'outil de suivi de l'équipe (Jira, Linear, GitHub Issues)
2. **Revoir** les action items ouverts à chaque rétrospective de sprint
3. **Dashboard** des action items de postmortem : nombre ouverts, taux de complétion, âge moyen
4. **Escalader** les action items P1 non résolus après 1 semaine

```
Indicateurs de santé des action items :
✅ > 80% des P1 résolus en 1 semaine
✅ > 90% des P2 résolus en 1 sprint
⚠️  < 70% des action items sont complétés → problème culturel
❌  Des action items P1 de plus de 2 semaines → escalade nécessaire
```

---

## 8. Communication d'incident

### 8.1. Canaux de communication

| Canal | Audience | Contenu | Fréquence |
|-------|----------|---------|-----------|
| Channel Slack dédié (`#incident-20250315`) | Équipe technique | Updates techniques, décisions, commandes | Temps réel |
| Status page publique | Utilisateurs, clients | Impact et progression (pas de détails techniques) | Toutes les 30 min |
| Email stakeholders | Direction, PO, support | Résumé business, impact estimé | À chaque changement majeur |
| Bridge call (si SEV-1) | IC + Tech Leads | Coordination vocale temps réel | Continue pendant la mitigation |

### 8.2. Status page — bonnes pratiques

La status page est souvent le premier endroit où les utilisateurs cherchent des informations.

**À faire** :
- Mettre à jour dès la détection de l'incident
- Utiliser un langage clair et non technique
- Donner un ETA si possible (même approximatif)
- Mettre à jour régulièrement, même si rien n'a changé (« Nos équipes continuent de travailler... »)
- Confirmer la résolution et remercier pour la patience

**À ne pas faire** :
- Donner des détails techniques (« La migration PostgreSQL... »)
- Minimiser l'impact (« Un petit souci technique... » quand le service est down)
- Oublier de mettre à jour pendant plus de 30 minutes
- Blâmer un tiers (même si c'est un fournisseur cloud)

### 8.3. Communication interne vs externe

| Aspect | Interne | Externe |
|--------|---------|---------|
| **Niveau de détail** | Technique et détaillé | Business et simplifié |
| **Ton** | Direct, factuel | Empathique, rassurant |
| **Fréquence** | Temps réel | Toutes les 15-30 min |
| **Root cause** | Oui, en détail | Résumé après résolution |
| **Blame** | Jamais (blameless) | Jamais |
| **Action items** | Liste détaillée | « Nous prenons des mesures... » |

---

## 9. On-call et astreinte

### 9.1. Principes de rotation

L'astreinte (on-call) est la responsabilité de répondre aux alertes en dehors des heures de travail.

**Modèles de rotation** :

```
Rotation hebdomadaire :
Semaine 1 : Alice (primary) + Bob (secondary)
Semaine 2 : Bob (primary) + Charlie (secondary)
Semaine 3 : Charlie (primary) + Alice (secondary)
```

**Bonnes pratiques** :
- **Minimum 3 personnes** dans la rotation (éviter le burnout)
- **Primary + secondary** : le secondary prend le relai si le primary ne répond pas en 15 min
- **Handoff formel** : à chaque rotation, le sortant briefe l'entrant sur les incidents récents et les points d'attention
- **Compensation** : l'astreinte doit être rémunérée ou compensée (jour de repos, prime)
- **Pas de héros** : si une personne est toujours on-call parce qu'elle est "la seule à comprendre le système", c'est un SPOF humain à corriger

### 9.2. Runbooks

Un runbook est un guide étape par étape pour diagnostiquer et résoudre un type d'incident spécifique.

```markdown
# Runbook — HighErrorRate sur order-service

## Contexte
Cette alerte se déclenche quand le taux d'erreur 5xx dépasse 1% sur 5 minutes.

## Étapes de diagnostic
1. Vérifier si un déploiement récent a eu lieu :
   ```bash
   kubectl rollout history deployment/order-service
   ```

2. Vérifier les logs récents :
   ```bash
   kubectl logs -l app=order-service --tail=100 --since=10m | grep ERROR
   ```

3. Vérifier l'état de la base de données :
   ```bash
   # Connexions actives
   psql -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
   ```

4. Vérifier les dépendances externes :
   ```bash
   curl -s http://payment-service:8080/health
   curl -s http://inventory-service:8080/health
   ```

## Actions de mitigation
- **Si déploiement récent** : rollback avec `kubectl rollout undo deployment/order-service`
- **Si DB saturée** : scale up le pool avec `kubectl edit configmap order-service-config`
- **Si dépendance externe down** : activer le circuit breaker manuellement

## Escalade
Si non résolu en 30 minutes, escalader à l'IC de garde (@rotation-ic dans PagerDuty).
```

**Chaque alerte devrait pointer vers un runbook** (via le champ `runbook_url` dans les annotations de l'alerte Prometheus).

### 9.3. Réduction du toil

Le **toil** est le travail opérationnel répétitif, manuel, automatisable et sans valeur durable.

| Exemple de toil | Solution |
|-----------------|----------|
| Redémarrer un service qui crashe toutes les 48h | Corriger le memory leak |
| Ajouter manuellement de l'espace disque | Autoscaling du stockage |
| Répondre manuellement à l'alerte "certificat expire bientôt" | Automatiser le renouvellement (cert-manager) |
| Vider manuellement une queue de messages | Dead letter queue + alerte |
| Créer manuellement un compte pour chaque nouveau client | API de provisioning |

**Objectif SRE** : le toil ne doit pas dépasser **50% du temps** de l'équipe SRE. Le reste est dédié à l'amélioration des systèmes (projets, automatisation, fiabilité).

Pour chaque tâche de toil répétée :
1. **Mesurer** la fréquence et le temps passé
2. **Documenter** dans un runbook (court terme)
3. **Automatiser** (moyen terme)
4. **Éliminer** la cause racine (long terme)

### 9.4. Bien-être et santé de l'on-call

L'astreinte mal gérée est une cause majeure de burnout en ingénierie. Voici les signaux d'alarme et les bonnes pratiques :

**Signaux d'une astreinte malsaine** :
- Plus de 2 alertes par nuit en moyenne (wake-ups)
- Plus de 50% des alertes sont des faux positifs
- La même personne est on-call plus de 25% du temps
- Les ingénieurs redoutent leur semaine d'astreinte
- Le turnover de l'équipe est élevé

**Objectifs d'une astreinte saine** :

| Métrique | Cible | Action si non atteint |
|----------|-------|----------------------|
| Alertes par semaine on-call | < 10 | Réduire le bruit (tuner les seuils) |
| Faux positifs | < 20% | Revoir les alerting rules |
| Wake-ups par nuit | < 1 en moyenne | Ajuster les heures de page |
| Temps moyen de résolution on-call | < 30 min | Améliorer les runbooks |
| Satisfaction de l'astreinte (sondage) | > 3/5 | Investigation et plan d'action |

**Pratiques recommandées** :
- **Follow-the-sun** : si vous avez des équipes dans plusieurs fuseaux horaires, chaque équipe couvre les heures de travail de sa zone
- **Pas de deploy le vendredi** (sauf urgence) : réduire le risque d'incidents le week-end
- **Retrospective on-call** : à chaque handoff, le sortant partage ce qui s'est passé et ce qui pourrait être amélioré
- **Budget d'interruption** : si l'astreinte est trop chargée, l'équipe a le droit de dédier un sprint entier à la réduction du toil

### 9.5. Game Days et Chaos Engineering

Les **Game Days** sont des exercices planifiés où l'on simule des incidents pour tester la réponse de l'équipe.

```markdown
# Plan de Game Day — Simulation panne base de données

## Objectif
Valider que l'équipe peut détecter et mitiger une panne DB en < 15 min.

## Scénario
À 14h00, l'équipe SRE va couper l'accès réseau entre l'order-service
et la base de données PostgreSQL (via une network policy Kubernetes).

## Participants
- Équipe on-call (ne sait pas quel sera le scénario exact)
- Observateurs (prennent des notes, n'interviennent pas)
- Facilitateur (contrôle l'injection de la panne)

## Critères de succès
□ Alerte déclenchée en < 5 min
□ IC désigné en < 10 min
□ Mitigation (circuit breaker / mode dégradé) en < 15 min
□ Communication status page en < 20 min

## Après le Game Day
- Debrief immédiat (30 min)
- Action items si des faiblesses sont identifiées
- Mise à jour des runbooks si nécessaire
```

**Fréquence recommandée** : un Game Day par trimestre minimum. Commencez par des scénarios simples et augmentez progressivement la complexité.

Le Chaos Engineering va plus loin : au lieu d'exercices planifiés, on injecte des pannes de manière continue et (semi-)automatisée en production. Des outils comme **Chaos Monkey** (Netflix), **Litmus** (Kubernetes) ou **Gremlin** facilitent cette approche.

---

## 10. Outillage de gestion d'incidents

### 10.1. Outils par catégorie

| Catégorie | Outils | Rôle |
|-----------|--------|------|
| **Alerting / On-call** | PagerDuty, OpsGenie, Grafana OnCall | Notification, escalade, rotation |
| **Communication** | Slack (channel dédié), Teams, Zoom | Coordination temps réel |
| **Status page** | Statuspage.io, Cachet, Instatus | Communication externe |
| **Timeline** | Jeli, Rootly, FireHydrant | Gestion d'incident automatisée |
| **Postmortem** | Notion, Confluence, Google Docs | Rédaction et partage |
| **Suivi action items** | Jira, Linear, GitHub Issues | Tracking des améliorations |

### 10.2. Automatiser la gestion d'incident

Les outils modernes comme **Rootly**, **FireHydrant** ou **Jeli** automatisent les tâches répétitives :

- **Création automatique** d'un channel Slack dédié à l'incident
- **Attribution automatique** de l'IC basée sur la rotation
- **Templates** de communication pré-remplis
- **Timeline** générée automatiquement à partir du channel Slack
- **Postmortem** pré-rempli avec la timeline et les participants
- **Suivi automatique** des action items avec rappels

Même sans ces outils, vous pouvez automatiser avec un **bot Slack** simple :

```typescript
// Bot Slack simplifié pour la gestion d'incident
// /incident create SEV-2 "Paiements échouent"
app.command('/incident', async ({ command, ack, respond }) => {
  await ack();

  const [action, severity, ...titleParts] = command.text.split(' ');
  const title = titleParts.join(' ').replace(/"/g, '');

  if (action === 'create') {
    // 1. Créer un channel dédié
    const channelName = `incident-${Date.now()}-${severity.toLowerCase()}`;
    const channel = await app.client.conversations.create({
      name: channelName,
    });

    // 2. Poster le message initial
    await app.client.chat.postMessage({
      channel: channel.channel.id,
      text: `🔴 *${severity.toUpperCase()} — ${title}*\n` +
            `IC: ${command.user_name}\n` +
            `Créé: ${new Date().toISOString()}\n` +
            `Status: INVESTIGATING`,
    });

    // 3. Notifier le channel général
    await respond(`Incident créé: <#${channel.channel.id}>`);
  }
});
```

---

## 11. Métriques d'incidents

| Métrique | Définition | Cible typique |
|----------|------------|---------------|
| MTTD (Mean Time To Detect) | Temps entre le début du problème et la première alerte | < 5 min |
| MTTA (Mean Time To Acknowledge) | Temps entre l'alerte et le premier humain qui regarde | < 15 min |
| MTTR (Mean Time To Resolve) | Temps entre le début et la résolution complète | < 4h (SEV-1) |
| MTBF (Mean Time Between Failures) | Temps entre deux incidents | > 30 jours |

### Comment suivre ces métriques

```promql
# Exemple : tracker le MTTR dans Prometheus
# (nécessite d'émettre des métriques lors de la gestion d'incident)

# Gauge qui enregistre la durée de chaque incident
incident_duration_seconds{severity="sev1", service="order-api"} = 8100  # 2h15

# Moyenne du MTTR sur les 30 derniers jours
avg_over_time(incident_duration_seconds{severity="sev1"}[30d])
```

### Tableau de bord incident

Un dashboard mensuel d'incidents devrait inclure :

| Indicateur | Mois précédent | Mois actuel | Tendance |
|------------|---------------|-------------|----------|
| Nombre d'incidents SEV-1 | 2 | 1 | ↓ |
| Nombre d'incidents SEV-2 | 5 | 3 | ↓ |
| MTTD moyen | 8 min | 4 min | ↓ |
| MTTR moyen (SEV-1) | 3h | 1h45 | ↓ |
| Action items complétés | 70% | 85% | ↑ |
| Incidents récurrents | 3 | 1 | ↓ |

Les flèches descendantes sont bonnes (sauf pour MTBF et action items complétés, où on veut des flèches ascendantes).

---

## 12. Récapitulatif

- Les incidents suivent un cycle : **Détection → Triage → Mitigation → Résolution → Postmortem**
- La sévérité (SEV-1 à SEV-4) détermine le temps de réponse et l'escalade — **en cas de doute, escalader**
- L'IC coordonne, il ne debug pas — séparation des rôles
- Le Comms Lead gère la communication interne et externe — **ne jamais laisser la status page sans update**
- **Mitigation d'abord**, résolution ensuite — limiter l'impact est la priorité
- Les postmortems sont **blameless** — les systèmes sont responsables, pas les individus
- Le modèle **Just Culture** distingue erreur humaine, comportement à risque et négligence
- Les techniques d'analyse (5 Whys, Fishbone) aident à trouver la vraie root cause
- Les action items doivent être spécifiques, assignés et datés — et **suivis** jusqu'à complétion
- L'astreinte nécessite des **rotations saines**, des **runbooks** et une **réduction du toil**
- MTTD, MTTA, MTTR sont les métriques clés de la maturité incident

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Lab** : [lab-12-incidents-et-postmortems](../labs/lab-12-incidents-et-postmortems/README)
2. **Quiz** : [quiz 12 incidents et postmortems](../quizzes/quiz-12-incidents-et-postmortems.html)
:::
