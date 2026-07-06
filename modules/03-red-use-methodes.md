---
titre: RED, USE et les 4 signaux dorés — choisir les bonnes métriques
cours: 16-observability-sre
notions: ["méthode RED (Rate, Errors, Duration)", "méthode USE (Utilization, Saturation, Errors)", "4 signaux dorés Google SRE (Latency, Traffic, Errors, Saturation)", "service vs ressource", "quelle méthode quand", "latence succès vs échec", "vanity metrics", "explosion de cardinalité"]
outcomes:
  - sait appliquer RED (Rate, Errors, Duration) à un service orienté requêtes
  - sait appliquer USE (Utilization, Saturation, Errors) à une ressource
  - sait relier RED et USE aux 4 signaux dorés de Google SRE
  - sait choisir la bonne méthode selon qu'on observe un service ou une ressource
  - sait traduire chaque signal en une PromQL sur les métriques exposées au module 02
prerequis: [modules 00-02 du cours (3 piliers, log structuré, métriques et PromQL de base)]
next: 04-distributed-tracing
libs: []
tribuzen: observabilité de l'API TribuZen — définir le jeu de métriques RED/USE à suivre pour le service commandes et ses ressources (event loop, pool DB)
last-reviewed: 2026-07
---

# RED, USE et les 4 signaux dorés — choisir les bonnes métriques

> **Outcomes — tu sauras FAIRE :** appliquer RED à un service et USE à une ressource, relier les deux aux 4 signaux dorés Google SRE, et choisir la bonne méthode selon ce que tu observes.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module est une **méthode de choix des métriques** — quel petit ensemble de mesures suivre pour un service ou une ressource, et pourquoi. Il s'appuie sur les types de métriques et la PromQL de base vus au **module 02** (Prometheus). L'instrumentation profonde de traces relève du **module 04**, les SLO/SLI du **module 08**, et le détail des alertes du **module 09**. Ici : *quoi* mesurer, pas *comment alerter*.

## 1. Cas concret d'abord

Tu es d'astreinte sur l'API TribuZen. Au module 02, tu as exposé un endpoint `/metrics` et Prometheus scrape déjà `demo-app`. Un collègue te tend la console Prometheus et te dit :

> « L'app a une centaine de métriques exposées. Le CPU host, le nombre de goroutines du collector, le heap, les octets réseau, le nombre de handles… Quand la page "Créer un tribu-event" rame, je regarde quoi, dans quel ordre ? »

Sans méthode, tu ouvres 100 métriques et tu n'en tires rien. Le piège classique : fixer le graphe du CPU (qui est à 40 %) et conclure « tout va bien » — alors que les utilisateurs, eux, voient des 500 et des pages à 8 secondes.

Il te faut **deux petits jeux de métriques, choisis à l'avance**, qui répondent à deux questions différentes :

1. *« Mes utilisateurs souffrent-ils ? »* → on regarde le **service** (les requêtes) : c'est **RED**.
2. *« Une ressource est-elle en train de lâcher ? »* → on regarde la **ressource** (CPU, event loop, pool DB) : c'est **USE**.

Ce module te donne ces deux grilles + la synthèse Google (les 4 signaux dorés), et pour chaque signal la PromQL exacte sur les métriques que tu exposes déjà : `http_requests_total`, `http_request_duration_seconds`, `http_requests_in_flight`.

---

## 2. Théorie complète, concise

### 2.1 Service vs ressource — la distinction qui gouverne tout

Toute la logique du module tient dans une distinction :

- Un **service** traite des **requêtes** : l'API TribuZen, un microservice, une gateway. On l'observe **du point de vue de l'utilisateur** — vitesse, échecs, temps de réponse.
- Une **ressource** *sert* du travail à capacité finie : CPU, mémoire, disque, interface réseau, event loop Node.js, pool de connexions DB. On l'observe **du point de vue de la machine** — remplissage, file d'attente, erreurs matérielles.

Une même page lente peut venir des deux. RED répond côté service, USE répond côté ressource. Ce ne sont **pas** deux méthodes concurrentes : ce sont deux vues du même système.

### 2.2 La méthode RED (services)

Créée par **Tom Wilkie** (Grafana Labs), la méthode RED s'énonce : *pour chaque service, mesure Rate, Errors, Duration*. Wilkie l'a formulée précisément parce que « la méthode USE ne s'applique pas vraiment aux services ; elle s'applique au matériel ». RED est un bon **proxy du bonheur de tes utilisateurs**.

- **Rate** — le nombre de requêtes par seconde. « À quelle vitesse le service travaille-t-il ? »
- **Errors** — le nombre de ces requêtes qui échouent. « Quelle proportion échoue ? »
- **Duration** — le temps que prennent ces requêtes (en distribution, pas en moyenne). « Combien de temps pour répondre ? »

Sur les métriques exposées au module 02, chaque lettre devient une PromQL :

```promql
# Rate — requêtes/seconde, moyennées sur 5 min, par route
sum by (route) (rate(http_requests_total[5m]))

# Errors — proportion de 5xx (erreurs serveur) sur le total
sum(rate(http_requests_total{status=~"5.."}[5m]))
  /
sum(rate(http_requests_total[5m]))

# Duration — latence P99 à partir des buckets de l'histogramme
histogram_quantile(
  0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))
)
```

Trois points de méthode :

1. **Duration se lit en percentiles, pas en moyenne.** La moyenne masque la queue. Un P99 à 5 s avec une moyenne à 40 ms signifie que 1 % des utilisateurs vivent l'enfer — invisible sur la moyenne. Un histogramme Prometheus (module 02) est fait pour ça via `histogram_quantile`.
2. **Distingue latence des succès et latence des échecs.** Google insiste : « il est important de distinguer la latence des requêtes réussies de celle des requêtes en échec » — un échec *lent* est souvent plus grave qu'un échec *rapide* (timeout en cascade vs rejet immédiat). En PromQL, on filtre `status` dans le bucket.
3. **Croise toujours Errors avec Rate.** Un taux d'erreur de 0 % avec un Rate à 0 ne veut pas dire « tout va bien » : ça veut dire « personne n'atteint le service ».

### 2.3 La méthode USE (ressources)

Créée par **Brendan Gregg**, la méthode USE s'énonce : *pour chaque ressource, vérifie Utilization, Saturation, Errors*. Elle vise les **composants à capacité finie** — CPU, mémoire, interfaces réseau, disques, contrôleurs, et par extension les ressources logicielles comme les mutex et les pools de threads.

- **Utilization** — le temps moyen pendant lequel la ressource est occupée à servir du travail (souvent un %). Ex : CPU à 70 %.
- **Saturation** — le degré auquel la ressource a du travail **en trop qu'elle ne peut pas servir, souvent mis en file d'attente**. Ex : longueur de la run-queue, requêtes en attente d'une connexion DB, lag de l'event loop.
- **Errors** — le compte d'événements d'erreur de la ressource. Ex : erreurs de connexion DB, paquets réseau droppés.

**La distinction Utilization vs Saturation est le cœur de USE — et contre-intuitive.** Gregg le martèle : une faible utilisation moyenne ne garantit **pas** l'absence de saturation. Une rafale à 100 % pendant quelques instants peut dégrader les performances alors que la moyenne 5 min affiche 80 %. Pour certaines ressources (disque), au-delà de ~70 % d'utilisation les délais de file d'attente deviennent sensibles. **C'est la saturation, pas l'utilisation, qui prédit la douleur.**

Pour l'API TribuZen (Node.js), les ressources USE typiques et leur signal de saturation :

| Ressource | Utilization | Saturation (le signal qui compte) | Errors |
|-----------|-------------|-----------------------------------|--------|
| Event loop Node.js | % de temps occupé | **lag de l'event loop** (délai avant exécution) | — |
| Heap V8 | `heap_used / heap_total` | GC pauses, approche de la limite | OOM |
| Pool de connexions DB | connexions actives / max | **requêtes en attente d'une connexion** | erreurs de connexion |

```promql
# Saturation approchée du service : requêtes en cours de traitement
# (in-flight monte quand le service n'écoule plus assez vite → file d'attente)
http_requests_in_flight

# Utilization CPU du process (métrique par défaut de prom-client)
rate(process_cpu_seconds_total[1m])
```

> Le lag d'event loop et les métriques heap détaillées s'instrumentent au module suivant sur l'instrumentation ; ici on identifie *quels signaux USE* suivre, pas leur code complet.

### 2.4 Les 4 signaux dorés (Google SRE)

Le livre *Site Reliability Engineering* de Google propose 4 signaux comme **synthèse** : si tu ne peux mesurer que quatre choses de ton système orienté utilisateur, mesure celles-ci.

| Signal doré | Définition Google | Recouvre |
|-------------|-------------------|----------|
| **Latency** | le temps pour satisfaire une requête | Duration (RED) |
| **Traffic** | une mesure de la demande sur le système (ex : req/s) | Rate (RED) |
| **Errors** | la proportion de requêtes qui échouent | Errors (RED + USE) |
| **Saturation** | le degré auquel le service opère à sa capacité | Saturation (USE) |

Deux précisions de Google, à connaître :

- **Latency :** distinguer la latence des requêtes réussies de celle des échecs (idem RED).
- **Saturation :** « beaucoup de systèmes se dégradent *avant* d'atteindre 100 % d'utilisation » — donc surveiller la saturation de façon **proactive**, avec un seuil bien en dessous de 100 %, plutôt que d'attendre le mur.

Les 4 signaux dorés = essentiellement **RED + le S de USE**. C'est pour ça qu'ils forment un vocabulaire commun : Traffic/Latency/Errors viennent du monde service (RED), Saturation vient du monde ressource (USE).

### 2.5 Quelle méthode quand — l'arbre de décision

```
Ce que j'observe reçoit-il des requêtes (c'est un service) ?
├─ OUI → RED (Rate, Errors, Duration)          ← API TribuZen, microservice, gateway
└─ NON, c'est une ressource à capacité finie
        → USE (Utilization, Saturation, Errors) ← CPU, heap, event loop, pool DB

Je veux le tableau de bord "vue d'ensemble" d'un système user-facing ?
        → 4 signaux dorés (Latency, Traffic, Errors, Saturation)
```

En pratique on combine : **RED pour chaque service exposé** (le minimum vital), **USE pour les ressources critiques** (celles qui saturent en premier), et les **4 signaux dorés comme grille de dashboard** au sommet.

### 2.6 Les deux pièges de choix qui ruinent un dashboard

- **Vanity metrics** — des métriques flatteuses mais sans action. « 50 M de requêtes au total ! » ne dit rien sur la santé *maintenant* ; c'est le `rate()` qui compte. Test : si une métrique ne peut ni déclencher une alerte, ni aider un diagnostic, ni mesurer une valeur métier → elle ne mérite pas le dashboard.
- **Explosion de cardinalité** — mettre `user_id` ou `session_id` en label crée des millions de séries temporelles et fait exploser Prometheus. Les identifiants à cardinalité non bornée vont dans les **logs** (module 01), jamais dans les labels de métriques. Garde des labels à cardinalité bornée : `method`, `route`, `status`.

---

## 3. Worked examples

### Exemple 1 — Poser le tableau RED de l'API TribuZen

**Objectif :** pour le service `demo-app` (l'API TribuZen), écrire les trois PromQL RED qui iront sur le dashboard d'astreinte, à partir des seules métriques exposées au module 02.

Métriques disponibles (rappel `metrics.ts`) : `http_requests_total{method,route,status}` (Counter), `http_request_duration_seconds` (Histogram, donc `_bucket`/`_sum`/`_count`).

```promql
# --- R : Rate global (req/s) ---
sum(rate(http_requests_total[5m]))

# --- E : taux d'erreur serveur (%) — on croise 5xx / total ---
100 * (
  sum(rate(http_requests_total{status=~"5.."}[5m]))
  /
  sum(rate(http_requests_total[5m]))
)

# --- D : latence P50, P95, P99 des SUCCÈS uniquement (status 2xx) ---
histogram_quantile(0.50,
  sum by (le) (rate(http_request_duration_seconds_bucket{status=~"2.."}[5m])))
histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket{status=~"2.."}[5m])))
histogram_quantile(0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket{status=~"2.."}[5m])))
```

**Lecture d'astreinte** quand « Créer un tribu-event » rame :
1. **E** grimpe à 12 % de 5xx → c'est un problème *serveur*, pas un pic de trafic.
2. **R** stable → ce n'est pas une ruée d'utilisateurs.
3. **D** : le P99 des *succès* est normal (60 ms) mais le P99 des *échecs* explose à 9 s → des requêtes timeout lentement → on va chercher la ressource en cause avec USE (exemple 2).

### Exemple 2 — Trouver la ressource qui sature avec USE

**Objectif :** l'exemple 1 pointe des échecs lents. Quelle ressource sature ? On applique USE au **pool de connexions DB** (la ressource la plus probable derrière des 5xx lents sur une écriture).

- **U (Utilization)** : `connexions actives / connexions max`. Ici 10/10 → 100 %. Suspect, mais pas la preuve.
- **S (Saturation)** : `nombre de requêtes en attente d'une connexion`. Ici **34 en file** → c'est LA preuve. Le pool est saturé : les requêtes attendent une connexion, timeout au bout de N secondes, et remontent en 5xx *lents*. Cohérent avec le P99 des échecs de l'exemple 1.
- **E (Errors)** : `db_connection_errors_total` en hausse → confirme.

```promql
# Saturation côté service, en attendant l'instrumentation fine du pool (module 04) :
# les requêtes en cours qui ne s'écoulent plus = symptôme de saturation en aval
http_requests_in_flight
```

**Conclusion du diagnostic :** RED a dit *quoi* (échecs lents, côté serveur), USE a dit *pourquoi* (pool DB saturé, file d'attente de 34). Remède : augmenter la taille du pool ou réduire la durée des transactions. **RED sans USE t'aurait laissé au constat ; USE sans RED t'aurait fait fixer le CPU à 40 % pendant que les users souffraient.**

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Appliquer USE à un service (ou RED à une ressource)

USE sur l'API (« quel est le taux d'utilisation de mon endpoint ? ») n'a pas de sens : un service n'a pas de « % occupé » borné. RED sur un CPU (« quel est le rate du CPU ? ») non plus. **Règle :** requêtes → RED ; capacité finie → USE. C'est exactement pour cette raison que Wilkie a créé RED : USE « ne s'applique pas aux services ».

### PIÈGE #2 — Confondre Utilization et Saturation

C'est le piège numéro un de USE. Un CPU à 60 % de moyenne *peut* être saturé si des rafales à 100 % créent une run-queue. **L'utilisation te dit le remplissage moyen ; la saturation te dit s'il y a une file d'attente.** C'est la saturation qui prédit la douleur utilisateur. Toujours prévoir un signal de saturation (queue, lag, in-flight), pas seulement un % d'utilisation.

### PIÈGE #3 — Lire Duration à la moyenne

`sum / count` donne la moyenne, qui « ne représente l'expérience de personne » dès qu'il y a une queue. Une moyenne à 40 ms peut cacher un P99 à 9 s. Toujours des **percentiles** (P50/P95/P99) via `histogram_quantile` sur les `_bucket`. La moyenne au mieux complète, jamais ne remplace.

### PIÈGE #4 — Ne pas séparer latence des succès et des échecs

Un P99 global « à 9 s » peut être entièrement dû aux échecs qui timeout, alors que les succès répondent en 60 ms. Sans filtrer `status`, tu crois que tout est lent alors que seul le chemin d'erreur l'est. Google recommande explicitement de séparer les deux.

### PIÈGE #5 — Errors à 0 % lu comme « tout va bien »

Un taux d'erreur nul avec un Rate à 0 signifie « plus personne n'atteint le service », pas « service en pleine forme ». Toujours croiser Errors **avec** Rate. Un dashboard d'astreinte met les deux côte à côte.

### PIÈGE #6 — `user_id` en label de métrique

Mettre un identifiant à cardinalité non bornée (`user_id`, `session_id`, `request_id`) en label crée une série temporelle par valeur → explosion de cardinalité, Prometheus qui s'effondre. Ces identifiants vont dans les **logs structurés** (module 01) et les **traces** (module 04). Les métriques gardent des labels bornés (`route`, `status`, `method`).

---

## 5. Ancrage TribuZen

Sur l'API TribuZen, ces trois grilles définissent le **contrat d'observabilité minimal** de chaque service avant sa mise en production.

**Service `orders` (créer/lister une commande d'activité tribu) — grille RED :**

| Signal | Métrique / PromQL | Seuil d'alerte indicatif (détail au module 09) |
|--------|-------------------|-----------------------------------------------|
| Rate | `sum by (route) (rate(http_requests_total{route="/orders"}[5m]))` | chute > 80 % vs baseline |
| Errors | 5xx / total sur `/orders` | > 1 % sur 5 min |
| Duration | P99 des succès sur `/orders` | > 500 ms |

Le métier ajoute une métrique de valeur : `rate(orders_created_total[5m])` (commandes créées/s) — utile mais **complément** de RED, pas remplacement.

**Ressources critiques de l'API — grille USE :**
- Event loop Node.js : saturation = lag (> 100 ms = saturé, l'équivalent du load average pour Node).
- Pool DB : saturation = requêtes en attente d'une connexion (le vrai signal, pas juste « connexions actives »).
- Heap V8 : utilisation = `heap_used/heap_total`, erreurs = OOM.

**Dashboard de tête (page d'astreinte) — 4 signaux dorés :** une rangée Latency (P99), Traffic (req/s), Errors (%), Saturation (`http_requests_in_flight` + lag event loop). C'est l'écran qu'on ouvre en premier quand le pager sonne.

Fichiers concernés dans `smaurier/tribuzen` :
```
tribuzen/
  apps/api/
    src/observability/
      metrics.ts          ← Counters/Histograms RED (déjà posés au module 02)
    docs/
      red-use-tribuzen.md ← LE livrable du lab : la table RED/USE + PromQL par service
```

> Les métriques sont posées au module 02 ; **ici on décide *lesquelles* suivre et pourquoi**. Le passage aux SLO (transformer « P99 < 500 ms » en objectif contractuel avec error budget) est le module 08.

---

## 6. Points clés

1. **Service → RED, ressource → USE.** C'est la distinction qui gouverne tout le choix des métriques.
2. **RED = Rate, Errors, Duration** (Tom Wilkie) — la vue *utilisateur* d'un service orienté requêtes.
3. **USE = Utilization, Saturation, Errors** (Brendan Gregg) — la vue *machine* d'une ressource à capacité finie.
4. **Utilization ≠ Saturation** : c'est la saturation (la file d'attente) qui prédit la douleur, pas le % de remplissage moyen.
5. **4 signaux dorés = Latency, Traffic, Errors, Saturation** (Google SRE) ≈ RED + le S de USE ; grille de dashboard de tête.
6. **Duration en percentiles**, jamais en moyenne, et **latence des succès séparée de celle des échecs**.
7. **Errors se lit toujours croisé avec Rate** — 0 % d'erreur peut cacher un service que plus personne n'atteint.
8. **Cardinalité bornée** dans les labels de métriques : `user_id` va dans les logs/traces, pas dans Prometheus.

---

## 7. Seeds Anki

```
Quelle méthode pour un service orienté requêtes, laquelle pour une ressource ?|Service (reçoit des requêtes) → RED (Rate, Errors, Duration). Ressource à capacité finie (CPU, event loop, pool DB) → USE (Utilization, Saturation, Errors).
Que signifie RED et qui l'a créée ?|Rate (req/s), Errors (requêtes qui échouent), Duration (temps de réponse en distribution). Créée par Tom Wilkie (Grafana Labs) pour les services, car USE ne s'applique qu'au matériel.
Que signifie USE et qui l'a créée ?|Utilization (temps moyen occupé à servir), Saturation (travail en trop, mis en file d'attente), Errors (compte d'erreurs). Créée par Brendan Gregg pour les ressources (CPU, mémoire, disque, réseau, pools).
Pourquoi la Saturation compte plus que l'Utilization dans USE ?|Une faible utilisation moyenne ne garantit pas l'absence de saturation : des rafales à 100 % créent une file d'attente même si la moyenne 5 min semble OK. C'est la file d'attente (saturation) qui prédit la dégradation, pas le remplissage moyen.
Quels sont les 4 signaux dorés de Google SRE et à quoi correspondent-ils ?|Latency, Traffic, Errors, Saturation. ≈ RED (Latency=Duration, Traffic=Rate, Errors=Errors) + le S de USE (Saturation). C'est la grille de dashboard de tête d'un système user-facing.
Pourquoi lire Duration en percentiles et non en moyenne ?|La moyenne masque la queue : un P99 à 9 s peut coexister avec une moyenne à 40 ms. On utilise histogram_quantile sur les _bucket pour P50/P95/P99, et on sépare la latence des succès de celle des échecs.
Pourquoi ne jamais mettre user_id en label de métrique ?|Cardinalité non bornée = une série temporelle par valeur = explosion de cardinalité qui fait s'effondrer Prometheus. Les identifiants vont dans les logs structurés et les traces ; les labels de métriques restent bornés (route, status, method).
Un taux d'erreur de 0 % veut-il dire que tout va bien ?|Non. Si le Rate est aussi à 0, ça veut dire que plus personne n'atteint le service. Errors doit toujours se lire croisé avec Rate.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-03-red-use-methodes/README.md`. Tu définis le tableau RED/USE complet de l'API TribuZen (service commandes + ses ressources) et tu écris les PromQL correspondantes contre le Prometheus réel du cours — corrigé commenté, grille d'auto-éval, variante J+30.
