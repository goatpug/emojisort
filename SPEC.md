# EmojiSort — Design Specification

A "water sort" style puzzle game where you sort **emojis** instead of colored water. This
document is the implementation spec: it defines the rules, mechanics, data formats, and
constraints in enough detail to build the game without further product input. Where a
choice had to be made, it is called out as **Decision:** with a short rationale — treat
these as settled unless they turn out to be technically unworkable.

**Target platform:** static site on **GitHub Pages** (this repo). No backend, no accounts.
Must work well on both desktop (mouse) and mobile (touch) browsers.

---

## 1. Game concept

The board holds a set of **containers** (called "tubes" throughout this spec for
familiarity, but they are *not* necessarily rendered as tubes — see §5). Each container
holds a stack of emojis up to a fixed capacity. The player moves emojis between
containers under stack-like rules until every emoji type is fully sorted into its own
container.

What makes this game distinct from a stock water-sort clone:

1. **Themed levels** — every level draws its emojis from one coherent theme (aquatic
   animals, farm animals, flowers, office supplies, …), and the containers, background,
   and lock visuals are styled to match.
2. **Locked containers** — some containers start locked and must be unlocked through
   play (by fully sorting specific emoji types, or by completing a sort *adjacent* to
   the lock). Lock artwork is theme-specific (vines for flowers, a cage for safari…).
3. **Blind levels** — some levels hide everything below the top emoji of each stack
   behind ❓ until revealed.
4. **Generous assist tools** — unlimited undo, plus one "add a container" rescue per
   attempt.
5. **Post-solve feedback** — the game knows the optimal move count for each level and
   tells you when you could have done better, with a one-tap replay.

---

## 2. Core rules

### 2.1 Board

- A level has `N` containers, each with the same **capacity** `C`.
  **Decision:** `C = 4` for all shipped levels (the classic water-sort size; keeps the
  solver fast and the UI legible on phones). The engine must treat `C` as data, not a
  constant, so future levels can vary it.
- A level uses `K` distinct emoji types with exactly `C` copies of each (so each type
  can exactly fill one container).
- Container count `N` = `K` + number of initially empty containers (typically 2 empty,
  like classic water sort; hard levels may have 1).
- Every level shipped must be **solvable from its initial state** (guaranteed by the
  generator/solver, §9–10) *without* using the extra rescue container.

### 2.2 Moves

- A move takes emojis from the **open end** of one container (the top of its stack) and
  places them on the open end of another.
- A move is legal iff:
  - the source container is not empty, and neither container is locked (§4), and
  - the destination has at least one free slot, and
  - the destination is empty **or** its top emoji matches the emoji being moved.
- **Group pour.** If the top of the source is a run of `n` identical emojis, the move
  transfers `min(n, free slots in destination)` of them in a single move.
  **Decision:** group pour is automatic and always maximal (matches water-sort
  intuition; also what the solver models). A group pour counts as **one move**.
- Pouring from a container back to itself is not a move. Pouring a full,
  single-type container ("completed" container) is **allowed** (sometimes needed in
  lock puzzles), but the UI should show completed containers with a subtle "done"
  treatment (checkmark badge / slight glow) so players know they normally shouldn't
  touch them.

### 2.3 Win condition

The level is won when every container is either empty or **full of a single emoji type**
(all `C` slots, same emoji). Locked containers that are still locked must be empty for
this to be reachable — level design guarantees any locked container that holds emojis
can always eventually be unlocked (§4.4).

### 2.4 Move counting

- The **move counter** is the length of the move history. Undo (§6.1) pops the history,
  so undone moves do not count. The count shown at win is "net moves".
- Using the rescue container (§6.2) does not change move counting but flags the attempt
  as *assisted* (affects the results screen and v2 badges, §12).

---

## 3. Themes

Every level references a **theme**. A theme bundles:

| Field | Purpose | Example (Flowers) |
|---|---|---|
| `id` | stable key | `flowers` |
| `name` | display name | "Flower Garden" |
| `emojiPool` | 8–14 emojis to draw level palettes from | 🌸 🌹 🌻 🌷 🌼 💐 🥀 🌺 🪻 🪷 |
| `containerStyle` | which container skin to render (§5) | `vase` |
| `lockStyle` | lock overlay + unlock animation (§4.5) | `vines` |
| `background` | CSS background (gradient/pattern, no image files needed) | soft green garden gradient |
| `label` emoji | used in level select & results | 🌸 |

**Launch themes (minimum 6):**

1. **Aquatic** 🐠 — 🐠 🐙 🦀 🐬 🐡 🦑 🐢 🦈 🐳 🦞 · containers: fish tanks · lock: bubble dome
2. **Farm** 🐄 — 🐄 🐖 🐔 🐑 🐴 🦆 🐐 🐰 🦃 🐝 · containers: barn stalls · lock: wooden gate + rope
3. **Flowers** 🌸 — (above) · containers: vases · lock: tangled vines
4. **Safari** 🦁 — 🦁 🐘 🦒 🦓 🦏 🐆 🦛 🦬 🐒 🦩 · containers: crates · lock: cage bars
5. **Office** 📎 — 📎 ✏️ 📌 🖊️ 📏 ✂️ 📁 🖇️ 📐 🔖 · containers: desk organizers · lock: chained drawer with padlock
6. **Sweets** 🍩 — 🍩 🍪 🧁 🍭 🍬 🍫 🍰 🍨 🥐 🍡 · containers: bakery boxes/jars · lock: gift-ribbon bow

Themes are pure data + CSS; adding a theme must not require engine changes. Pick emojis
that stay visually distinct at small sizes and render acceptably on Windows/Android/iOS
system emoji fonts (avoid very new Unicode emojis; test the pool on at least two
platforms and prefer emojis ≤ Unicode 13).

---

## 4. Locked containers

Locks are the signature challenge mechanic. A locked container is **inert**: nothing can
be poured into or out of it, and it renders with a theme-styled lock overlay. Locked
containers may start **empty** (extra space you must earn) or **holding emojis** (their
contents visible through the lock — e.g. behind cage bars — unless the level is also
blind, §7).

### 4.1 Lock type A — "sort-to-unlock"

The lock names **one or two emoji types** (shown as small icons on the lock itself,
e.g. a cage with a small 🦓+🦒 tag). The container unlocks the moment **every named
type is fully sorted** (each named type completely fills some container). One or two
types only — more than two makes the goal noise.

### 4.2 Lock type B — "unlock-by-neighbor"

The container unlocks the moment **a container adjacent to it** becomes fully sorted
(full of any single type). Adjacency is defined by board layout position (§5.3): the
containers immediately before/after it in the same row (vertical layouts) or
immediately above/below in the same column (horizontal layouts). Edge containers have
one neighbor. The lock overlay should visually "reach toward" its neighbors (e.g. vines
draping onto the adjacent vases) so the mechanic is discoverable without text.

### 4.3 Unlock permanence

**Decision:** unlocking is **permanent for the attempt** — if the player later breaks
up the sorted container that triggered the unlock, the lock does not re-engage.
(Re-locking creates miserable, hard-to-reason-about states and complicates the solver
for no fun gain.) **Undo is the one exception:** undo restores the exact prior state,
including lock state (§6.1).

### 4.4 Design constraints for levels with locks

- A level may mix lock types but should ship with at most 3 locked containers.
- Solvability rule: the generator/solver must verify the level is winnable, which
  inherently proves every lock that *must* open (any lock holding emojis, and any lock
  whose space is needed) *can* open. Locks that never open are forbidden — every locked
  container must be unlockable in at least one solution line.
- First introduction: the first level featuring each lock type gets a one-time tooltip
  (dismissable, stored in localStorage) explaining the rule in one sentence.

### 4.5 Lock visuals & unlock moment

Each theme defines a `lockStyle` rendered as an overlay on the container:

- **vines** (Flowers): tangled green vines wrapped over the vase; unlock = vines wilt/slide away.
- **cage** (Safari): bars over the crate; unlock = door swings open.
- **bubble** (Aquatic): a shimmering bubble dome; unlock = pop.
- **gate** (Farm): rope-tied gate; unlock = rope falls, gate swings.
- **padlock+chain** (Office): chain across the drawer; unlock = chain drops.
- **ribbon** (Sweets): gift ribbon and bow; unlock = bow unties.

Implementation guidance: build these as CSS/SVG (inline SVG preferred) with a short
(≤600ms) unlock animation and a small burst of theme confetti (the theme's label emoji).
No raster image assets — keeps the repo light and GitHub Pages fast. Type A locks
render their required emoji(s) as a small tag on the overlay; type B locks render a
small "→ neighbor" affordance (e.g. tendrils/arrows toward adjacent containers).

---

## 5. Presentation & layouts

### 5.1 Not just tubes

Containers are rendered per-theme (`containerStyle`). All skins are the same logical
stack; only the chrome differs. Skins are CSS/SVG only. Emojis render as text glyphs
(system emoji font) at a large, consistent size (~28–40px depending on viewport).

### 5.2 Orientation

Levels declare an **orientation**:

- `vertical` — classic: containers are upright, stack grows bottom→top, open end at top.
- `horizontal` — containers are lying down (e.g. shelf trays, pencil cases): stack grows
  left→right, **open end at the right**. Rows are stacked vertically on screen.

**Decision:** orientation is per-level cosmetic variety only — the logic is one stack
with one open end in both cases. Mixing orientations within a level is not allowed.
Horizontal levels suit wide-container themes (Office desk trays, Farm troughs);
vertical suits tanks/vases. Roughly 1 in 4 levels should be horizontal.

### 5.3 Board layout & adjacency

- Vertical orientation: containers flow into rows (max 5–6 per row on phones, wrap as
  needed). **Adjacency (for type B locks) = immediate left/right neighbor within the
  same row.** Row wrapping is deterministic from the level's container order and its
  declared `rowBreaks` (explicit in level data, so adjacency never depends on screen
  size — the layout must not reflow containers across rows responsively; scale instead).
- Horizontal orientation: containers stack as rows in columns (usually one column;
  wide screens may show two). **Adjacency = immediate above/below neighbor within the
  same column**, driven by explicit `rowBreaks` the same way.
- The rescue container (§6.2) appends at the end of the last row and is **never**
  counted for adjacency (it appears after locks are designed; letting it satisfy a
  type B lock would break level tuning).

### 5.4 Interaction

- **Tap-tap:** tap a source container (its top run lifts/highlights), tap a destination
  to pour. Tapping the source again or tapping empty space cancels. Tapping an invalid
  destination shakes it briefly (with `prefers-reduced-motion` respected: swap shake
  for a flash).
- Optional nicety, not required for v1: drag-and-drop as an alternative input.
- Pour animation: the moving emojis arc from source to destination (~250ms). Fast
  tappers must not be blocked: input during animation queues or fast-forwards.
- Keyboard support (desktop): number keys or arrow+enter to select source/destination;
  full game playable without a mouse. Containers get `aria-label`s like
  "Vase 3: rose, rose, sunflower, empty — top: rose ×2".

---

## 6. Assist tools

### 6.1 Unlimited undo

- Undo reverts the last move exactly — container contents, lock states, and move
  counter all roll back. Unlimited depth, back to the initial deal.
- Implementation: keep an immutable history of states (states are tiny; a level is
  < 100 bytes encoded) or a move log with inverse application. History of states is
  simpler and safe — **Decision:** snapshot history.
- **Blind levels interaction:** revealed knowledge is *not* re-hidden by undo. The
  "revealed" set (§7) lives outside the undo history. Rationale: undo exists to let
  players explore; re-hiding punishes exactly that.
- A **restart level** button also exists (fresh attempt: history cleared, reveals
  cleared, rescue container removed, locks re-engaged).

### 6.2 Add-a-container (rescue)

- Once per attempt, the player can add one extra **empty, unlocked** container.
  **Decision:** the rescue container has capacity **2** (not `C`), matching the common
  water-sort convention — it's a nudge, not a free win. It uses a neutral "plain" skin
  with a small ➕ badge so it reads as an add-on, not part of the puzzle.
- Using it marks the attempt **assisted**. Assisted solves still count as completing
  the level, but the results screen shows "solved with rescue container" and the
  attempt is ineligible for "optimal" recognition (§8) and future badges (§12).
- Restarting the level removes it and restores the one-per-attempt allowance.
- The win condition applies to the rescue container like any other (empty or
  full-of-one-type). Since its capacity is 2 and every type has `C = 4` copies, in
  practice **it must be empty at win**. The UI should hint this if the player parks
  emojis there near the end ("the extra container must be emptied to finish").

## 7. Blind levels

- A level flagged `blind: true` hides every emoji **below the top of each stack**
  behind ❓ (render the actual ❓ emoji styled to the theme's slot background).
- The top emoji of every non-empty container is always visible.
- When a hidden emoji becomes the top of its stack (by moves above it being poured
  away), it is **revealed permanently for the attempt** — even if later covered again,
  and across undos (§6.1). **Decision:** give each of the `K×C` emoji instances a
  stable instance id at deal time; the per-attempt `revealed` set holds instance ids
  (position-based keys break as emojis move). An instance renders as ❓ iff the level
  is blind, the instance is not top-of-stack, and its id is not in `revealed`.
  Any instance that was visible at any moment — including mid-pour — counts as
  revealed.
- Blind levels **cannot** also contain locked containers holding emojis whose contents
  matter for lock tags (type A tags stay readable since they're on the lock, not the
  contents). Blind + locks is allowed and encouraged for late levels; blind is
  introduced solo first.
- Level select marks blind levels with 🕶️.

## 8. Optimal moves, results & replay

### 8.1 Par (optimal move count)

- Every shipped level stores `par`: the **minimum number of moves** to solve from the
  initial deal, computed by the solver (§9) at level-authoring time and stored in the
  level file. The game never needs to compute par at runtime for shipped levels.
- For blind levels, par is computed with full knowledge of the deal. The results
  screen phrases it as "Best possible: N (with X-ray vision 👓)" so it doesn't feel
  unfair.

### 8.2 Results screen

Shown on win:

- Big themed celebration (emoji confetti from the theme pool).
- "Solved in **M** moves." plus one of:
  - `M == par`: "🏆 That's the fewest moves possible!"
  - `M > par`: "Best possible: **par**. Fancy another go?" with a prominent
    **Replay level** button (restart same deal, fresh attempt).
  - assisted attempt: shows "solved with rescue container ➕" instead of par chasing
    (par line still displayed).
- Buttons: **Replay**, **Next level**, **Level select**.
- Per-level best (fewest net moves, and whether par was ever hit) persists in
  localStorage and shows on the level-select tile (e.g. ⭐ for solved, 🏆 for par).

## 9. Solver

A solver is required for (a) authoring-time par computation and solvability
verification, and (b) the level generator's validation loop. It does **not** run during
normal gameplay.

- **State:** tuple of container stacks + lock bitmask (locks flip open per §4 rules and
  stay open). Canonicalize by sorting containers within equivalence classes: two states
  differing only by permutation of *interchangeable* containers (same contents, same
  lock state & lock definition, and not referenced by any adjacency relationship) are
  the same node. Note adjacency (type B) makes container position meaningful — only
  treat containers as interchangeable when no type B lock exists in the level;
  otherwise skip that optimization. Encode states compactly (string or typed array) for
  hashing.
- **Search:** BFS gives optimal move count directly (all moves cost 1). Use A* with an
  admissible heuristic if BFS is too slow: a standard lower bound is
  (number of "breaks" — positions where an emoji sits on a different emoji) summed
  appropriately; when in doubt, plain BFS with good state encoding handles `K ≤ 12,
  C = 4` fine in Node at authoring time.
- **Group pours** are single edges (matching §2.2). Prune useless moves: pouring a
  complete container into an empty one; splitting a full single-type container when an
  identical move gains nothing; pouring from a single-type container onto an empty when
  the source would not be emptied.
- Deliverable: `tools/solver.mjs`, runnable with plain Node (`node tools/solver.mjs
  levels/aquatic-03.json`), used by the generator and by a `tools/validate-levels.mjs`
  script that CI or a pre-commit run can execute against every shipped level (asserts
  solvable + stored `par` matches solver output).

## 10. Levels & progression

### 10.1 Level plan (launch: 36 levels)

Progression introduces one mechanic at a time:

| Levels | Content |
|---|---|
| 1–6 | Basics. K grows 3→6, 2 empties. Themes rotate. Level 1 is a near-trivial teach level. |
| 7–12 | First horizontal levels; K 5–7; one level with only 1 empty. |
| 13–18 | **Type A locks** introduced (level 13 = gentle teach). |
| 19–24 | **Type B locks** introduced (level 19 = teach); A+B mixes late in the band. |
| 25–30 | **Blind levels** introduced (level 25 = teach, no locks); blind+horizontal. |
| 31–36 | Everything combined; K up to 9–10; blind + locks; 1 empty on 35–36. |

Each level's theme is chosen so all six launch themes appear ~6 times each, and lock
styles always match their theme.

### 10.2 Level data format

Shipped levels are static JSON (hand-tuned or generator-produced, then committed):

```json
{
  "id": "safari-14",
  "index": 14,
  "theme": "safari",
  "orientation": "vertical",
  "capacity": 4,
  "blind": false,
  "rowBreaks": [5],
  "containers": [
    { "stack": ["🦁", "🦓", "🦁", "🐘"] },
    { "stack": ["🐘", "🦁", "🦓", "🐘"] },
    { "stack": ["🦓", "🐘", "🦁", "🦓"] },
    { "stack": [] },
    { "stack": [], "lock": { "type": "sort", "requires": ["🦁"] } },
    { "stack": ["🦒", "🦒", "🦒", "🦒"], "lock": { "type": "neighbor" } }
  ],
  "par": 9
}
```

- `stack` is bottom→top. `lock.type` is `"sort"` (with `requires`: 1–2 emojis) or
  `"neighbor"`. `rowBreaks` lists container indices that start a new row/column.
- Loading validates: emoji counts are exactly `capacity` per type, locks reference
  emojis present in the level, `par` present, level solvable is trusted from the
  validation script (don't solve at runtime).

### 10.3 Generator

`tools/generate-level.mjs`: given theme, K, empties, locks config, blind flag and an
RNG seed, produce a level by **reverse play**: start from the solved state and apply
random legal-in-reverse pours. Reverse play alone does not guarantee solvability once
locks are involved, so always finish by running the solver to (a) confirm the level is
solvable with locks honored and (b) record the true `par`; reject and reroll deals
that are unsolvable or trivial (e.g. `par < K + 2`).
The generator is an authoring tool; shipped levels are the committed JSON files, so
gameplay is deterministic and pars are stable.

### 10.4 Persistence

localStorage under a single namespaced key (e.g. `emojisort.v1`): furthest unlocked
level, per-level `{ solved, bestMoves, gotPar, usedRescue }`, seen-tooltips, and
settings. Levels unlock sequentially; level select shows all with locked-future levels
greyed (players can replay anything unlocked).

### 10.5 After the last level (v1 endgame)

Finishing the final level must not dead-end on a "Next level" button with nowhere to
go. Instead:

- **Completion celebration.** Beating the last level for the first time shows a
  one-time "You sorted everything! 🎉" screen: confetti drawn from *all* theme pools,
  plus career stats — levels solved, pars hit (`X/36` 🏆), themes completed, total
  moves, and rescue-free levels. Reachable afterwards from level select via a small
  trophy button. (Everything needed is already in the §10.4 save data.)
- **Par chasing is the designed endgame.** After the credits-moment, the results
  screen's "Next level" is replaced by "Back to level select" on the final level, and
  level select becomes the hub: every tile shows ⭐/🏆 so the remaining non-par levels
  read as the open to-do list. When all 36 show 🏆, the completion screen upgrades to
  a "perfect game" variant (e.g. gold styling).
- **More levels are data, not code.** New level packs are just additional committed
  JSON files plus an entry in the level index — no engine changes. The level list must
  be data-driven (an ordered manifest, e.g. `levels/index.json`, rather than a
  hardcoded count) so pack drops and the "final level" behavior above follow the
  manifest automatically.
- **Endless/daily play is v2** (§12): true infinite content requires generating and
  solving levels in the browser, which v1 deliberately avoids.

## 11. Technical requirements

- **Stack: vanilla HTML/CSS/JS (ES modules), no framework, no build step.** The repo
  root is the site (`index.html` at root); GitHub Pages serves the default branch root.
  All URLs relative so it works under `/<repo>/` project pages. Rationale: the user's
  other emoji games run this way on Pages and it removes toolchain risk. If a bundler
  ever becomes necessary, that's a v2 conversation — don't add one now.
- Node is used **only** for authoring tools (`tools/`) and tests; the shipped site must
  not require it.
- Suggested layout:
  ```
  index.html
  css/            # base + per-theme styles
  js/
    engine/       # pure game logic: state, moves, locks, blind reveal, undo (no DOM)
    ui/           # rendering, input, animations, screens
    data/themes.js
  levels/*.json
  tools/          # solver, generator, validate-levels (Node, .mjs)
  test/           # node:test unit tests for engine + solver
  ```
- **Engine purity:** all rules (§2, §4, §6, §7) live in pure functions over plain
  state objects, unit-tested with `node --test`. The UI layer is a renderer over that
  state. The solver imports the same move logic (single source of truth for legality).
- Mobile-first responsive CSS; the whole board must fit without scrolling on a typical
  phone for `N ≤ 12` (scale emoji/container size down as needed). Respect
  `prefers-reduced-motion` and `prefers-color-scheme` (themes define light/dark
  background variants; containers/emojis already work in both).
- No external network requests at runtime (no CDNs, no fonts — system emoji only).
  Works offline after first load; adding a simple service worker is optional/deferred.
- No analytics, no tracking.

## 12. Version 2 (out of scope for v1 — do not build, but don't preclude)

- **Badges**, e.g.: "Sorted Aquatic ×10" (per-theme completion counters), "Perfectionist"
  (N levels at par), "No Net" (no-undo solve), "Purist" (never used rescue in a theme),
  "X-ray" (blind level at par). The v1 localStorage schema already records
  `gotPar`/`usedRescue` per level and should also record per-level completion **counts**
  and a per-attempt `usedUndo` flag at win, so v2 badges can be computed retroactively.
- **Endless & daily play.** Runtime-generated levels: a daily level (RNG seeded by the
  date string so every player gets the same deal, still with no backend) and/or an
  endless mode with gently rising difficulty. Feasible because the solver already
  shares the engine's move logic — port generator + solver to run in a **Web Worker**
  so deals are validated and `par` computed in the browser without jank; cap
  generation at sizes the solver handles quickly (`K ≤ 8`) and fall back to rerolling
  slow deals. Committed levels stay the curated campaign; generated ones are extra.
- Theme packs (new themes + level packs are pure data per §10.5), drag input, sound,
  service worker for offline.

## 13. Acceptance checklist

- [ ] All 36 levels load, play, and are validated solvable with correct `par` by `tools/validate-levels.mjs`.
- [ ] Group pours, win detection, and move counting match §2 exactly (unit tests).
- [ ] Type A and B locks behave per §4 incl. permanence and undo interaction (unit tests + a playable teach level for each).
- [ ] Blind reveal semantics per §7 incl. undo not re-hiding (unit tests).
- [ ] Unlimited undo to initial deal; restart resets reveals/locks/rescue.
- [ ] Rescue container: capacity 2, once per attempt, marks assisted, excluded from adjacency.
- [ ] Results screen shows par comparison and replay; best results persist and render on level select.
- [ ] Horizontal and vertical layouts both shippable; adjacency stable across screen sizes.
- [ ] Six themes with distinct container skins and themed lock overlays + unlock animations.
- [ ] Playable with keyboard; aria-labels on containers; reduced-motion respected.
- [ ] Level list is manifest-driven; beating the final manifest level shows the completion screen (§10.5), with the perfect-game variant once all levels are at par.
- [ ] Site works when served from `https://<user>.github.io/emojisort/` with no build step and no runtime network requests.
