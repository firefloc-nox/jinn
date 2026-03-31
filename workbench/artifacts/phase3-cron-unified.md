# Phase 3 — Cron unifié

## Décision d'architecture

**Source of truth unique : `~/.hermes/cron/jobs.json`**

Avant la Phase 3, Jinn maintenait deux stores cron séparés :
- `~/.jinn/cron/jobs.json` — store Jinn (source of truth d'origine)
- `~/.hermes/cron/jobs.json` — store Hermes (géré par `hermes cron create/delete`)

Un script Python provisoire (`jinn-hermes-cron-sync`) synchronisait Hermes→Jinn toutes les 5s.

Depuis la Phase 3 : Jinn lit et écrit **directement** `~/.hermes/cron/jobs.json` pour tous les
jobs à engine Hermes. Le scheduler Python Hermes exécute ces jobs. Le scheduler Jinn (node-cron)
n'exécute que les jobs avec `engine != hermes`.

---

## Format des fichiers

### `~/.hermes/cron/jobs.json` (source of truth pour jobs Hermes)

```json
{
  "jobs": [{
    "id": "fb1ff25c4c07",
    "name": "morning-brief",
    "prompt": "/morning-brief",
    "skills": [],
    "schedule": { "kind": "cron", "expr": "0 8 * * *", "display": "0 8 * * *" },
    "schedule_display": "0 8 * * *",
    "repeat": { "times": null, "completed": 0 },
    "enabled": true,
    "state": "scheduled",
    "deliver": "local",
    "created_at": "2026-03-31T12:44:01.819361+02:00",
    "next_run_at": "2026-04-01T08:00:00+02:00",
    "last_run_at": null
  }],
  "updated_at": "2026-03-31T14:00:00.000Z"
}
```

### `~/.jinn/cron/jobs.json` (Jinn-only jobs — engine != hermes)

```json
[{
  "id": "3b649e3c-ef6a-4376-8767-29d3bcf0ffa2",
  "name": "dream",
  "enabled": true,
  "schedule": "0 0 * * *",
  "engine": "claude",
  "prompt": "/dream",
  "delivery": { "connector": "discord", "channel": "1234" }
}]
```

---

## Routing des opérations API

| Opération | Critère | Destination |
|-----------|---------|-------------|
| `GET /api/cron` | — | Merge Hermes + Jinn-only |
| `POST /api/cron` | `engine=hermes` ou défaut | `~/.hermes/cron/jobs.json` |
| `POST /api/cron` | `engine=claude/codex/gemini` | `~/.jinn/cron/jobs.json` |
| `PUT /api/cron/:id` | id commence par `hermes-` | `~/.hermes/cron/jobs.json` |
| `PUT /api/cron/:id` | id sans préfixe `hermes-` | `~/.jinn/cron/jobs.json` |
| `DELETE /api/cron/:id` | id commence par `hermes-` | `~/.hermes/cron/jobs.json` |
| `DELETE /api/cron/:id` | id sans préfixe `hermes-` | `~/.jinn/cron/jobs.json` |
| `POST /api/cron/:id/trigger` | id commence par `hermes-` | `next_run_at` forcé + `runCronJob` direct |
| `POST /api/cron/:id/trigger` | id sans préfixe `hermes-` | `runCronJob` Jinn direct |

### Scheduler d'exécution

| Engine | Scheduler | Fichier source |
|--------|-----------|----------------|
| `hermes` | Python Hermes (`hermes cron`) | `~/.hermes/cron/jobs.json` |
| `claude` / `codex` / `gemini` | node-cron Jinn | `~/.jinn/cron/jobs.json` |

---

## Convention d'ID

- Jobs Hermes exposés via l'API Jinn : `hermes-<id_natif_hermes>`
- Jobs Jinn-only : UUID standard
- Le préfixe `hermes-` est **la clé de routage** pour toutes les opérations.

---

## Fichiers modifiés

| Fichier | Rôle |
|---------|------|
| `packages/jimmy/src/cron/hermes-jobs.ts` | Nouveau module — I/O direct sur `~/.hermes/cron/jobs.json` |
| `packages/jimmy/src/gateway/api.ts` | Routes cron routées par engine/id |
| `packages/jimmy/template/AGENTS.md` | Documentation mise à jour |

---

## Migration — suppression du bridge Python

Le service `sh.lain.jinn-hermes-cron-sync.plist` a été désactivé (Phase 3) :

```bash
# Désactiver (déjà fait)
launchctl unload ~/Library/LaunchAgents/sh.lain.jinn-hermes-cron-sync.plist

# Optionnel : supprimer définitivement
rm ~/Library/LaunchAgents/sh.lain.jinn-hermes-cron-sync.plist
# + supprimer le script Python associé
```

Le fichier `~/.jinn/cron/jobs.json` peut contenir des résidus de l'ancienne sync
(jobs avec `_source: "hermes"`). Ils sont filtrés automatiquement par `GET /api/cron`.

Pour nettoyer manuellement :
```bash
python3 -c "
import json, os
path = os.path.expanduser('~/.jinn/cron/jobs.json')
jobs = json.load(open(path))
clean = [j for j in jobs if j.get('_source') != 'hermes']
json.dump(clean, open(path, 'w'), indent=2)
print(f'Removed {len(jobs)-len(clean)} Hermes residual jobs')
"
```

---

## Vérification

```bash
# Lister tous les jobs (Hermes + Jinn)
curl -s http://127.0.0.1:7778/api/cron | python3 -c \
  "import sys,json; [print(j['id'][:20], j['name'], j.get('engine')) for j in json.load(sys.stdin)]"

# Créer un job Hermes via Jinn API
curl -s -X POST http://127.0.0.1:7778/api/cron \
  -H "Content-Type: application/json" \
  -d '{"name":"test","prompt":"test","schedule":"0 6 * * *","engine":"hermes","enabled":true}'

# Vérifier dans le store Hermes
python3 -c "import json; d=json.load(open('/Users/firefloc/.hermes/cron/jobs.json')); \
  [print(j['name'], j['state']) for j in d.get('jobs',[])]"
```
