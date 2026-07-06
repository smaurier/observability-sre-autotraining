# Lab 20 — DORA & production readiness : mener une PRR de TribuZen

> **Outcome :** à la fin, tu sais **mener une Production Readiness Review** complète d'un service — remplir une checklist d'observabilité avec preuves, situer l'équipe sur DORA (survol), et rendre un verdict **go / no-go** argumenté.
> **Vrai outil :** la stack d'observabilité TribuZen déjà en place dans ce cours — le `docker-compose` fourni à la racine (`16-observability-sre/`), Prometheus/Grafana réels, l'API TribuZen instrumentée aux modules 01-11. Le livrable est un **document PRR** (Markdown), pas du code.
> **Feedback :** le coach joue le rôle de **reviewer SRE** en session — il conteste chaque item coché sans preuve. Pas de test-runner auto-correcteur.

---

## Énoncé

Le CTO veut ouvrir **TribuZen au public mercredi**. Tu es l'ingénieur qui signe (ou non) le go. Ta mission : produire la **PRR de `tribuzen-api`** et rendre un verdict.

Ce n'est **pas** un exercice sur papier abstrait : tu passes en revue la vraie stack que tu as construite tout au long du cours (API instrumentée, Prometheus, Grafana, SLO, alertes). Pour chaque item de la checklist, tu dois fournir une **evidence** — une commande, un fichier, un lien de dashboard — pas une affirmation.

Tu produis **un fichier** : `tribuzen-api.prr.md`.

### Contexte à assumer

Si tu n'as pas suivi tous les modules, prends ces hypothèses de départ pour `tribuzen-api` (état réaliste d'une beta) :

- Logs JSON structurés avec `traceId` : **en place** sur les endpoints principaux, **manquant** sur le worker d'envoi d'e-mails.
- `/metrics` Prometheus (RED) : **en place**.
- Traces OTel : **en place** sur login→RSVP, **absentes** sur l'envoi d'e-mail.
- SLO dispo 99.9 % + SLO latence p99 < 300 ms : **définis**, error budget affiché dans Grafana.
- Alertes burn-rate : **en place**, mais **l'alerte « RSVP error budget burn » n'a pas de runbook**.
- Dashboards Grafana as code : **en place**.
- Load test k6 : **fait** au module 11, point de rupture connu.
- **On-call** : aucune rotation d'astreinte définie pour la semaine du lancement.

*(Si tu as ta vraie stack qui tourne via le docker-compose du cours, remplace ces hypothèses par tes vraies observations : `curl localhost:3000/metrics`, tes fichiers `slo/`, `alert-rules.yaml`, etc.)*

### Livrable — structure imposée de `tribuzen-api.prr.md`

```md
# PRR — tribuzen-api

- Service / version : tribuzen-api 1.0.0
- Date de revue : 2026-07-06
- Reviewers : <toi> (SRE) + <lead dev>
- Objet : go-live public prévu mercredi

## Checklist

### Observabilité
| id | question | priorité | statut | evidence |
| ... | ... | must-have / should-have | ✅ / ⚠️ / ❌ | ... |

### SLO
### Alertes
### Runbooks
### Dashboards
### On-call
### Capacity

## Bloc DORA (survol)
| métrique | valeur 30j | bande |

## Verdict
- Statut : approved / conditionally-approved / rejected
- Conditions bloquantes (avant go) :
- Améliorations non-bloquantes (post-go) :
```

---

## Étapes (en friction)

Tu **produis** le document, tu ne remplis pas des trous.

1. **Recense les catégories** de la checklist (module §2.7) : observabilité, SLO, alertes, runbooks, dashboards, on-call, capacity. Écris au moins **un item** par catégorie sous forme de question fermée (« Le service émet-il des logs JSON avec traceId ? »).
2. **Attribue une priorité** à chaque item : `must-have` (bloquant pour le go) ou `should-have` (améliorable après).
3. **Cherche l'evidence** de chaque item. Si tu as la stack qui tourne : commande réelle (`curl`, chemin de fichier, lien Grafana). Sinon : décris la preuve *attendue* et confronte-la aux hypothèses du contexte.
4. **Statue chaque item** : ✅ satisfait (avec preuve), ⚠️ partiel, ❌ manquant. **Un item sans preuve vérifiable = non satisfait**, même si « ça doit être bon ».
5. **Remplis le bloc DORA** en survol : pose les 4 valeurs (invente des chiffres réalistes de beta si besoin), classe chaque métrique en bande, et déduis le niveau global (= la métrique la plus faible). N'automatise rien : la collecte pipeline est le cours 15.
6. **Rends le verdict.** Si au moins un `must-have` est ❌ → ce ne peut pas être `approved`. Choisis `conditionally-approved` (avec conditions **datées**) ou `rejected`. Liste les conditions bloquantes et les améliorations post-go séparément.
7. **Défends-le devant le coach.** Il pointera un item coché ✅ sans commande d'evidence — tu dois soit produire la preuve, soit rétrograder l'item.

---

## Grille d'évaluation

| Critère | Insuffisant | Attendu | Excellent |
|---|---|---|---|
| Couverture des 7 catégories | catégories manquantes | 1+ item par catégorie | items pertinents et spécifiques à TribuZen |
| Evidence | items cochés sans preuve | chaque item a une preuve ou un « attendu » clair | preuves exécutables (`curl`, chemins réels) |
| Priorisation | pas de must/should | must-have vs should-have posés | priorisation cohérente avec le risque |
| Bloc DORA | 4 métriques confuses / MTTR non à jour | 4 clés à jour + bandes + niveau global | lien explicité entre chaque clé et son signal d'obs |
| Verdict | binaire oui/non non argumenté | approved/conditional/rejected justifié | conditions datées + séparation bloquant/post-go |
| Défense | items s'effondrent au 1er « prouve-le » | tient la plupart des items | anticipe les objections, evidence prête |

---

## Coach (rôle en session)

Le coach **n'est pas** un correcteur automatique : il est le **reviewer SRE** qui contresigne le go.

- **Il attaque les preuves manquantes.** À chaque ✅, il demande : *« Montre-moi la commande. »* Un item qui s'effondre est rétrogradé à ❌.
- **Il teste la posture, pas le par-cœur.** Il peut demander : *« Ce runbook manquant, c'est bloquant ou pas ? Justifie. »* — la bonne réponse dépend de la priorité que TU as posée.
- **Il pousse sur DORA sans laisser dériver.** Si l'apprenant part dans l'automatisation du pipeline, il recadre : *« Ça, c'est le cours 15. Ici, dis-moi juste ce que chaque métrique veut dire et avec quel signal on la mesure. »*
- **Il vérifie le vocabulaire à jour.** Si l'apprenant dit « MTTR », il demande le nom actuel (*Failed Deployment Recovery Time*) et pourquoi le renommage.
- **Relances si silence :** *« Qui est d'astreinte mercredi soir ? »* · *« Ton alerte burn-rate, elle pointe vers quel runbook ? »* · *« Cet item observabilité, ta preuve c'est quoi exactement ? »* · *« Ton verdict, c'est go ou no-go, et sous quelles conditions datées ? »*

Le coach **ne donne pas le verdict** : il fait défendre celui de l'apprenant.

---

## Variante J+30 (fading)

**Même exercice, contraintes ajoutées, sans rouvrir le module ni cette page :**

1. **En 25 minutes.** Produis la PRR de `tribuzen-api` de mémoire, checklist des 7 catégories comprise.
2. **Nouveau scénario :** on ajoute une **dépendance externe** au service (un provider d'e-mail tiers). Ajoute la catégorie **dépendances** à ta checklist : la dépendance est-elle `hard` ou `soft` ? A-t-elle un fallback ? Est-ce un SPOF (Single Point of Failure) ? Quel item PRR cela crée-t-il ?
3. **Contrainte DORA :** cite les 4 clés **avec la terminologie à jour** (aucun « MTTR ») et relie chacune à son signal d'observabilité, sans notes.

**Critère de réussite :** verdict rendu, chaque `must-have` a une evidence ou un « attendu » explicite, et la nouvelle dépendance est correctement classée (hard/soft + fallback + verdict SPOF).

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, la PRR devient un **artefact versionné**, pas un document jetable :

```text
tribuzen/
  ops/
    prr/
      tribuzen-api.prr.md          ← le livrable de ce lab
      runbooks/
        rsvp-error-budget-burn.md  ← runbook écrit pour lever une condition de go
    oncall/
      rotation-go-live.md          ← planning d'astreinte de la semaine de lancement
```

**Différences avec le lab :**

- Les evidence pointent vers de **vrais** artefacts du repo (fichiers `slo/`, `alert-rules.yaml`, dashboards provisionnés) plutôt que vers les hypothèses de contexte.
- La PRR est **rejouée** à chaque changement majeur (nouvelle dépendance, refonte d'un endpoint) — ce n'est pas un tampon unique.
- Le résultat conditionne le **module 21 (projet final)** : on ne livre pas une stack qui n'a pas passé sa revue de mise en production.

**Commit cible :**

```text
docs(ops): PRR tribuzen-api pour go-live public — checklist obs/SLO/alertes/on-call + verdict conditionnel
```
