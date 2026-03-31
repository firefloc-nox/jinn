# Phase 4 — Hermes Views

Documentation des vues Hermes implémentées en Phase 4 du refactor Jinn → Hermes.

---

## Pages créées / améliorées

### `/hermes/sessions` — Sessions Hermes

**Fichier :** `packages/web/src/app/hermes/sessions/page.tsx`

**Fonctionnalités Phase 4 ajoutées :**
- **Filtres source** : chips "All / cli / discord / telegram / jinn" — filtre client-side
- **Tri** : Newest (défaut) / Oldest / Most tokens / Longest duration
- **Stats bar** : total sessions, total tokens (visible page), coût estimé en USD (blended estimate)
- **Export CSV** : bouton dans le header — exporte les sessions visibles au format :
  ```
  id,source,model,started_at,ended_at,message_count,input_tokens,output_tokens,title
  ```

**Comportement :**
- Filtre + tri appliqués client-side sur les données déjà chargées (pas de nouveau fetch)
- Si Hermes down : banner orange, liste vide — pas de crash
- La pagination est préservée et fonctionne avec les filtres actifs

---

### `/hermes/memory` — Mémoire Hermes

**Fichier :** `packages/web/src/app/hermes/memory/page.tsx`

**Fonctionnalités Phase 4 ajoutées :**
- **Édition inline** : hover sur une entrée → icônes Pencil + Trash → click Pencil → textarea éditable in-place
- **Diff preview avant delete** : cliquer Trash → aperçu "Will be removed:" avec texte barré + confirmation explicite
- **Auto-save indicateur** : spinner Loader2 pendant la mutation (par entrée + global pendant import)
- **Export MEMORY.md** : bouton dans la toolbar bas → télécharge `MEMORY.md` au format markdown structuré
- **Import MEMORY.md** : sélecteur de fichier → modal de prévisualisation avec avertissement → replace all et reimport
- **Modal import** : montre un aperçu du contenu (2000 chars max), avertit que c'est destructif

**Format MEMORY.md exporté/importé :**
```markdown
# Hermes Memory

## Agent Memory

- <entrée 1>
- <entrée 2>

## User Profile

- <entrée 1>
```

---

### `/hermes/skills` — Skills Hermes (NOUVELLE)

**Fichier :** `packages/web/src/app/hermes/skills/page.tsx`

**Fonctionnalités :**
- Grid de cards par catégorie racine (mlops, devops, creative, github, etc.)
- Chaque card : nom, description truncatée à 100 chars, badge catégorie coloré
- Search bar filtre en temps réel sur nom + description + catégorie
- Click → modal avec description complète + catégorie full path
- Compteur total (badge dans le header) + compteur par section
- Si Hermes down : banner orange, graceful

**Couleurs catégories :**
| Catégorie | Couleur |
|-----------|---------|
| mlops | system-purple |
| devops | system-blue |
| creative | system-pink |
| research | system-indigo |
| productivity | system-green |
| software-development | system-teal |
| gaming | system-orange |
| other | fill-tertiary (gris) |

---

## Composants créés

### `HermesActivityWidget`

**Fichier :** `packages/web/src/components/hermes/hermes-activity.tsx`

Widget intégré dans le dashboard (`/`). Affiche les 5 dernières sessions Hermes.

**Props :** aucune (self-contained, utilise `useHermesSessions`)

**Comportement :**
- Source pill colorée + titre session truncaté + tokens + message count + durée relative
- Lien "View all →" vers `/hermes/sessions`
- Si Hermes down : `return null` — widget invisible, pas de banner d'erreur dans le dashboard

**Usage :**
```tsx
import { HermesActivityWidget } from "@/components/hermes/hermes-activity"

// Dans page.tsx :
<HermesActivityWidget />
```

### `HermesStatusBadge`

**Fichier :** `packages/web/src/components/hermes/hermes-status.tsx`

Badge tristate dans le header mobile.

**États :**
- `loading` : dot animé pulse + "Hermes" (gris)
- `connected` : dot vert plein + "Hermes"
- `disconnected` : ring creux orange + "Hermes" + title tooltip

---

## Hooks disponibles

Tous dans `packages/web/src/hooks/use-hermes.ts` :

| Hook | Description | Retourne |
|------|-------------|---------|
| `useHermesStatus()` | Health check, poll 30s | `"connected" \| "disconnected" \| "loading"` |
| `useHermesSessions(opts?)` | Liste paginée | `{ sessions, total, loading, unavailable }` |
| `useHermesSessionSearch(q)` | Recherche FTS | `{ sessions, total, loading, unavailable }` |
| `useHermesSession(id)` | Détail + messages | `{ session, messages, loading, unavailable }` |
| `useHermesMemory()` | Mémoire + mutation | `{ memory, loading, unavailable, update }` |
| `useHermesSkills()` | Liste des skills | `{ skills, categories, count, loading, unavailable }` |
| `useHermesCron()` | Jobs cron | `{ jobs, loading, unavailable }` |

**Pattern graceful degradation :**
```ts
// Tous les hooks exposent `unavailable: boolean`
// Quand true → afficher un banner orange OU ne rien afficher (dashboard)
// Jamais de crash, jamais d'erreur non gérée
```

---

## Navigation

Fichier : `packages/web/src/lib/nav.ts`

Section Hermes dans la sidebar :
```
─────────────────
H · Sessions    /hermes/sessions
H · Memory      /hermes/memory
H · Skills      /hermes/skills   ← ajouté Phase 4
```

---

## Tests

### `packages/web/src/lib/__tests__/hermes-api.test.ts`

Teste la couche `hermesApi` (mock `fetch`) :
- `HermesUnavailableError` : nom, flag, message
- `getHealth` : 200 ok / 503 → HermesUnavailableError / 500 → Error générique
- `getSessions` : items/total / query params limit+offset / 503
- `getMemory` : sections memory+user / 503
- `getSkills` : count/categories / 503
- `updateMemory` : PATCH body correct pour add/replace/remove

### `packages/web/src/components/hermes/__tests__/hermes-status.test.tsx`

Teste `HermesStatusBadge` (mock `useHermesStatus`) :
- Rendu texte "Hermes" dans tous les états
- Aria-labels corrects pour connected / disconnected / loading
- `className` prop propagée
- Tooltip présent sur disconnected, absent sur connected
- Tristate : connected → disconnected → loading

---

## Ajouter une nouvelle vue Hermes

1. Créer `packages/web/src/app/hermes/<nom>/page.tsx` avec `"use client"`
2. Utiliser `PageLayout` comme wrapper root
3. Utiliser un hook existant de `use-hermes.ts` — ou en créer un nouveau qui suit le pattern `{ data, loading, unavailable }`
4. Ajouter dans `packages/web/src/lib/nav.ts` :
   ```ts
   { href: "/hermes/<nom>", label: "H · <Label>", icon: <Icon>, group: "hermes" }
   ```
5. CSS variables uniquement — pas de couleurs Tailwind brutes
6. Vérifier : `pnpm typecheck` dans `packages/web`

---

## Contraintes de style

- CSS variables uniquement : `var(--text-primary)`, `var(--bg-secondary)`, `var(--accent)`, `var(--system-*)`, etc.
- Pas de `text-gray-*`, pas de `bg-blue-*`
- `color-mix(in_srgb, var(--system-blue)_14%, transparent)` pour les fills semi-transparents
- Radius via `rounded-xl` ou `rounded-[var(--radius-md,12px)]`
- Spacing via `var(--space-*)` dans les layouts principaux, classes Tailwind standards dans les composants internes
