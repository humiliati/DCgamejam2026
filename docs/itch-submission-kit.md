# Dungeon Gleaner — itch.io Submission Kit

**Deadline:** 2026-04-05 16:00 UTC
**Jam:** [DC Jam 2026](https://itch.io/jam/dcjam2026)

Everything you need to click Publish at the last minute. Fill this out once, paste at submission time.

---

## Pre-flight — do these before packaging

- [ ] Game runs from `index.html` with no console errors (hard errors, not warnings)
- [ ] Audio manifest loads (check console: "150 manifest entries")
- [ ] Loot tables load (check console: "[LootTables] Loaded")
- [ ] Title → character creation → deploy → floor 0 works end to end
- [ ] Settings menu scroll works
- [ ] Credits screen opens from title
- [ ] Pause menu opens in-game (Esc/P)
- [ ] At least one combat encounter runs to completion
- [ ] Win and fail conditions both reachable
- [ ] Bonfire rest works
- [ ] No absolute paths (`/foo/bar`) in any HTML or JS — all relative
- [ ] No uppercase/lowercase filename mismatches (itch is case-sensitive)
- [ ] `serve.py` / `serve.js` excluded from zip (dev only)

---

## Packaging

1. **Zip the entire game folder contents.** `index.html` must be at the **root of the zip**, not inside a `DCgamejam2026/` subfolder. itch.io looks for `index.html` at the zip root.
2. **Exclude:** `.git/`, `.claude/`, `EyesOnly/`, `dcexjam2025/`, `debug/`, `tests/`, `docs/`, `portal/`, `serve.py`, `serve.js`, `*.md`, `.DS_Store`, any `node_modules/`.
   - **Do NOT exclude `media_assets/audio/`.** `data/audio-manifest.js` declares `basePath: "media_assets/audio/"` and `engine/audio-system.js` prepends it verbatim, so the 362 `.webm` clips under `media_assets/audio/` ARE the shipping audio. Excluding `media_assets/*` would ship a silent build. (The `./audio/` folder at the game root is a 52K orphan and is not referenced by the manifest.)
   - If a future pass contains raw source audio (`.wav`, `.aif*`, `.flac`) inside `media_assets/`, exclude those extensions specifically rather than the whole tree.
3. **Check size:** Under 500 MB extracted, under 1000 files total.
4. **Test locally** before upload: unzip to a temp folder, run `python3 serve.py`, verify the game still works from the unzipped copy.

Quick pack command (run from game root):
```bash
zip -r dungeon-gleaner-dcjam2026.zip . \
  -x "*.git*" ".claude/*" "EyesOnly/*" "dcexjam2025/*" \
     "debug/*" "tests/*" "docs/*" "portal/*" \
     "serve.py" "serve.js" ".DS_Store" "*.md" \
     "media_assets/audio/**/*.wav" \
     "media_assets/audio/**/*.aif*" \
     "media_assets/audio/**/*.flac"
```

This keeps `media_assets/audio/*.webm` (the files the manifest actually loads) and strips any raw source audio if it turns up. Expected payload: ~50 MB, ~585 files.

---

## itch.io "Create new project" form — field by field

| Field | Value |
|---|---|
| **Title** | Dungeon Gleaner |
| **Project URL** | `dungeon-gleaner` (itch will prefix with your username) |
| **Short description / tagline** | A first-person dungeon crawler where you clean up after the heroes. |
| **Classification** | Games |
| **Kind of project** | HTML |
| **Release status** | In development |
| **Pricing** | No payments *(or "Donations" if you want tips enabled)* |
| **Uploads** | `dungeon-gleaner-dcjam2026.zip` — tick "This file will be played in the browser" |
| **Embed options** | See "Embed settings" below |
| **Genre** | Role Playing |
| **Tags** | dungeon-crawler, first-person, retrofuturism, dragons, cards, cleaning, dark-comedy, webos, game-jam |
| **Custom noun** | `dungeon crawler` |
| **App store links** | *(leave blank)* |
| **Community** | Disabled *(or Comments if you want feedback)* |
| **Visibility & access** | Restricted — jam submission *(switch to Public at submit time)* |

### Embed settings

- **Viewport dimensions:** `1280 × 720`
- **Fullscreen button:** ✓ Enabled *(critical — 1080p TV target needs this)*
- **Mobile friendly:** ✗ Disabled *(needs Magic Remote or keyboard)*
- **Automatically start on page load:** ✗ Disabled *(prevents audio autoplay block)*
- **Enable scrollbars:** ✗ Disabled

---

## Required submission answers (jam-specific)

These two questions are required by the jam form. Copy-paste ready.

### Q: How did you incorporate the themes?

> We hit all four themes, structurally:
>
> **Dragons** — Not the fire-breathing villains. Dragons in this game are ancient protectors being systematically hunted by the heroes. The conspiracy reveals itself floor by floor through environmental evidence, NPC dialogue, and recovered documents. The whole plot turns on what the heroes are actually doing down there.
>
> **Retrofuturism** — The entire visual identity. The game is set in a coastal boardwalk town where a civilization discovered magic before electricity. Chrome railings on marble promenades, neon sigils on timber shop fronts, vaporwave sunsets on stone walls. Retrofuturistic fantasy: ancient and futuristic simultaneously.
>
> **Rock-Paper-Scissors** — Combat uses a suit-triangle with playing card suits. Clubs (Wild/Force) beat Diamonds (Crystal/Precision) beat Spades (Earth/Steel) beat Clubs. Hearts are neutral rule-breakers. Every card and every enemy carries a suit alignment, so positioning and draw matter.
>
> **Cleaning Up the Hero's Mess** — The entire game loop. You are a licensed dungeon maintenance contractor. Scrub tiles grid-by-grid, restock looted crates, re-arm traps, reset puzzles, meet a readiness threshold before the next hero cycle arrives. Combat cards are earned through labor — sealed crates, faction reputation, shop purchases — not found in loot drops.

### Q: Asset creation disclosure

> **Team-made:**
> - All game design, level design, dialogue, lore, and narrative — Stellar Aqua
> - All custom code and engine work — Stellar Aqua
> - Lighting & rendering — Vinsidious
> - Data tables & balancing — Minimax
>
> **External sources (credited in-game and on page):**
> - Player controller, camera, and character system adapted from *Tower of Hats*
> - Music by Bober @ Itch, Aliya Scott, and Turtlebox
>
> **AI-assisted:**
> - Code implementation, debugging, and refactoring with Claude (Anthropic)
> - Brainstorming and design iteration with GPT (OpenAI)
>
> All AI-assisted work was directed and reviewed by the human team. No AI-generated art, audio, or music is used in the game.

---

## Page body (cut from `itch-game-page.md`)

The full game page copy lives in `docs/itch-game-page.md`. Paste the **GAME PAGE BODY** section into the itch.io "Description" field.

---

## Screenshots (need before publishing)

itch.io recommends 3–5 screenshots plus a cover image. Capture these *before* the deadline:

- [ ] **Cover image** — 630×500 (jam thumbnail). Title screen with logo, or a moody exterior shot with the subtitle overlay.
- [ ] **Screenshot 1** — Character creation screen (callsign + class card)
- [ ] **Screenshot 2** — Boardwalk exterior in vaporwave sunset
- [ ] **Screenshot 3** — Dungeon interior with crates and readiness HUD
- [ ] **Screenshot 4** — Combat with card fan visible
- [ ] **Screenshot 5** — A peek/interaction (crate restock, shop, or bonfire)

Save to `docs/screenshots/` as PNGs.

---

## Final 2 hours before deadline

1. [ ] Pull latest changes, do one final clean run end-to-end
2. [ ] Re-zip with the exclusion command above
3. [ ] Test the zip: extract to a new folder, `python3 serve.py`, play for 5 minutes
4. [ ] Upload zip to itch.io project page
5. [ ] Paste description, tags, genre, custom noun
6. [ ] Upload screenshots + cover image
7. [ ] Set embed to 1280×720, fullscreen enabled, mobile disabled, click-to-launch on
8. [ ] Save page — verify it loads from incognito window
9. [ ] Click "Submit to jam" on the DC Jam 2026 page
10. [ ] Screenshot the submission confirmation for your records

---

## If something breaks at the last minute

- **Audio won't load on itch.io** — itch serves over HTTPS, so CORS is fine. If anything breaks it's a relative-path issue. Grep for `file://` or `http://` absolute refs.
- **Upload rejected for size** — check `EyesOnly/`, `dcexjam2025/`, and `.git/` exclusions actually took effect; `du -sh dungeon-gleaner-dcjam2026.zip` should be ~50 MB, not gigabytes
- **No audio on itch build** — you excluded `media_assets/*` somewhere. Re-check the zip command; `media_assets/audio/*.webm` MUST be in the archive (basePath in `data/audio-manifest.js`)
- **Game loads but screen is blank** — likely a case-sensitivity filename issue. Open dev tools on the itch-hosted version, look for 403s on asset paths.
- **Missed the deadline** — itch.io submissions close hard at the cutoff. You can still update the page after (the jam accepts the last build at deadline), but can't submit new entries.
