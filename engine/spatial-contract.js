/**
 * SpatialContract — rendering and generation rules for floor types.
 *
 * EyesOnly floor hierarchy adapted for dungeon crawler:
 *   floorsN       — Exterior / overworld (proc-gen or contrived)
 *   floorsN.N     — Interior contrived (taverns, shops, scripted rooms)
 *   floorsN.N.N   — Nested interior dungeons (proc-gen sub-dungeons)
 *
 * The contract tells both the GENERATOR and the RAYCASTER how to behave.
 * Generator reads it for room sizing, wall placement rules, ceiling semantics.
 * Raycaster reads it for wall height, fog model, distance rendering, parallax.
 *
 * Tile height offsets (Doom level design principle):
 *   Transition tiles render vertically offset from the base floor plane.
 *   Positive = raised (building entrance), negative = sunken (stairs down).
 *   The player reads elevation semantically: raised = horizontal transition,
 *   sunken = vertical descent, tall+raised = boss. The offset is per-tile-type,
 *   not per-cell — it's a visual grammar rule, not terrain data.
 *
 * Design: a floor carries a single SpatialContract instance that acts as
 * the source of truth for all spatial questions about that floor.
 */
var SpatialContract = (function () {
  'use strict';

  // ── Floor depth types ──
  var DEPTH = {
    EXTERIOR:       'exterior',        // floorsN     — open/outdoor, sky visible
    INTERIOR:       'interior',        // floorsN.N   — contrived template, enclosed
    NESTED_DUNGEON: 'nested_dungeon'   // floorsN.N.N — proc-gen sub-dungeon
  };

  // ── Fog models ──
  // Controls what happens when rays exceed render distance.
  var FOG = {
    // FADE: walls fade to fog color — distant walls disappear.
    // Good for exteriors (implies open space beyond render distance).
    FADE:    'fade',

    // CLAMP: walls at render distance render as a solid dark wall.
    // Prevents "outdoor illusion" — the space reads as enclosed.
    CLAMP:   'clamp',

    // DARKNESS: hard cutoff to black. Nothing visible beyond distance.
    // Most oppressive — tight dungeon corridors.
    DARKNESS: 'darkness'
  };

  // ── Ceiling types ──
  var CEILING = {
    SKY:    'sky',     // Gradient or skybox — open above
    SOLID:  'solid',   // Flat ceiling — enclosed
    VOID:   'void'     // Black void above — underground
  };

  // ═══════════════════════════════════════════════════════════════
  //  CONTRACT DEFINITIONS
  //  Each returns a frozen contract object the raycaster + generator read.
  // ═══════════════════════════════════════════════════════════════

  /**
   * floorsN — Exterior / overworld.
   * Open areas. Walls can vanish at distance (fog fade).
   * Standard 1-tile wall height. Sky ceiling.
   * Proc-gen or contrived layout.
   */
  function exterior(opts) {
    opts = opts || {};
    return Object.freeze({
      depth:            DEPTH.EXTERIOR,
      label:            opts.label || 'Exterior',

      // ── Raycaster rules ──
      wallHeight:       opts.wallHeight || 1.0,    // Multiplier on base wall height
      renderDistance:    opts.renderDistance || 20,  // Max ray travel (tiles)
      fogModel:         FOG.FADE,                  // Walls vanish into fog at distance
      fogDistance:       opts.fogDistance || 14,     // Distance where fog starts biting
      fogColor:         opts.fogColor || { r: 40, g: 50, b: 60 },  // Blueish haze
      waterColor:       opts.waterColor || { r: 15, g: 35, b: 65 }, // Deep ocean blue for WATER tile floor

      // ── Terminus fog veil ──
      // Soft atmospheric gradient band at the horizon that masks the
      // floor/sky seam and softens wall pop-in at render distance.
      // height: fraction of screen height (0.15 = 15% above + below horizon)
      // opacity: peak alpha at horizon center (0.7 default, 0 disables)
      terminusFog:      opts.terminusFog || { height: 0.15, opacity: 0.7 },

      // ── Weather system hooks ──
      // terminusDist: tile distance at which sprites punch through weather
      // overlays. The raycaster splits sprite rendering into a distant pass
      // (masked by weather) and a near pass (drawn over weather) at this
      // threshold. Higher values = weather visible over more of the scene.
      terminusDist:     opts.terminusDist || 2.0,
      // weather: named preset key consumed by WeatherSystem (when loaded).
      // 'clear' = legacy behavior (terminus fog veil only on exterior).
      weather:          opts.weather || 'clear',

      ceilingType:      CEILING.SKY,
      skyPreset:        opts.skyPreset || 'cedar',   // Skybox preset name
      ceilColor:        opts.ceilColor || '#2a3a4a',
      floorColor:       opts.floorColor || '#3a4a3a',

      // ── Parallax layers (background depth cues) ──
      parallax:         opts.parallax || null,
      // Example: [{ depth: 0.8, color: '#2a3a3a', height: 0.3 }]
      // Rendered as distant horizontal bands behind walls.

      // ── Generator rules ──
      gridSize:         opts.gridSize || { w: 40, h: 40 },
      roomSizeRange:    opts.roomSizeRange || { min: 5, max: 12 },
      roomCount:        opts.roomCount || { min: 6, max: 10 },
      allowOutdoorTiles: true,   // Can have tiles with no ceiling (grass, paths)
      corridorWidth:    opts.corridorWidth || 1,

      // ── Tile height offsets (Doom rule) ──
      // Positive = raised platform, negative = sunken recess.
      // Keyed by TILES constant value.
      // ── Tile height offsets (Doom rule) ──
      // Biome overrides merge INTO these defaults (not replace).
      tileHeightOffsets: _mergeTileTable(_buildOffsets({
        5: -0.12,     // STAIRS_DN — sunken into ground, "descending"
        6:  0.06,     // STAIRS_UP — slight rise, "ascending"
        14: 0.15,     // BOSS_DOOR — prominently elevated (intentional)
        29: -0.40,    // HEARTH — deep sunken: fire cavity for sandwich rendering
        60: 0.05,     // ROOF_EAVE_L — barely raised, eave overhang
        61: 0.15,     // ROOF_SLOPE_L — ascending slope
        62: 0.30,     // ROOF_PEAK — ridge, highest point
        63: 0.15,     // ROOF_SLOPE_R — descending slope (mirror)
        64: 0.05,     // ROOF_EAVE_R — barely raised (mirror)
        65: 0.70,     // CANOPY — floating high, tree crown ring (opaque lid)
        66: 0.70,     // CANOPY_MOSS — floating high, translucent moss strands
        67: 0.50,     // ROOF_CRENEL — rampart slab, midline at eye+0.5 (== 1.0 wall top).
                      //   Biomes with taller walls override (approach: 3.5× wall → offset 3.0).
                      //   See raycaster tooth pass for the per-column crenel cutout.
        68: 0.50,     // PERGOLA — open-air beam lattice, same base altitude as CRENEL.
                      //   Biomes override to place the cross-beam at the right canopy height
                      //   for the structure below (plaza shade ≈ 2.0, temple courtyard ≈ 2.5).
        69: 0,        // CITY_BONFIRE — Olympic community pyre (greater-hearth). Tall
                      //   freeform column (3.0 world units): waist-high pedestal +
                      //   fire cavity + suspended chimney hood. Pedestal sits flush
                      //   with plaza floor (no Doom-rule offset). Freeform path
                      //   suppresses heightOffset anyway when tileFreeform is active,
                      //   so this value is defensive / semantic only.
        70: 0         // PERGOLA_BEAM — freeform cross-beam at chimney elevation.
                      //   Tall column (3.0 world units) with hLower = 0, so there
                      //   is nothing at plaza grade to offset. Same defensive-only
                      //   semantics as CITY_BONFIRE.
      }), opts.tileHeightOffsets),

      // Step fill color: rendered in the gap where offset displaces the wall.
      // Raised tiles show this below the wall; sunken tiles show it above.
      stepColor:        opts.stepColor || '#2a3a2a',

      // ── Freeform tile config (two-segment wall columns) ──────────
      // Exterior freeform tiles: Olympic-model community pyre framed as
      // a "greater hearth." The CITY_BONFIRE column is 2.0 world units
      // tall (tileWallHeights override below) and splits into three
      // bands:
      //   • hLower 0.50 — short limestone pedestal at plaza grade
      //     (half a base wall height; waist-high, easy to read as an
      //     altar or fire-bowl base).
      //   • gap    0.70 — narrow fire cavity filled by the raycaster's
      //     'city_bonfire_fire' gap filler (animated flame gradient).
      //     Previously 1.70; slimmed so the fire reads as a controlled
      //     window instead of a towering jet — a realistic pyre with
      //     a visible hood, not a bonfire eating its own chimney.
      //   • hUpper 0.80 — suspended chimney hood / lid, matching the
      //     HEARTH mantle thickness so the two structures read as
      //     kin. The hood now begins at world Y=1.20 (instead of
      //     2.20) — "starts sooner" in the vertical order — and
      //     anchors the PERGOLA_BEAM canopy ring around the plaza.
      // Unlike HEARTH (interior, solid ceiling overhead), the chimney
      // hood here hangs from the top of the 2.0-unit tall freeform
      // column — the skybox shows above it, which sells the "outdoor
      // stack with a capped flue" silhouette.
      // Degrades gracefully to single-segment rendering on biomes that
      // shrink wallHeights below the hUpper + hLower sum (the freeform
      // path enforces the degenerate guard).
      tileFreeform: _mergeTileTable({
        // DUMP_TRUCK — HEARTH-stature pressure-wash truck (2.0 wallHeight).
        // Three-band silhouette modelled on the HEARTH sandwich, with
        // the slice pushed DOWN to sit practically on the ground:
        //   • Lower body  (0.00 → 0.10) — ultra-thin ground strip.
        //     Wheels live here via wallDecor and may overhang up into
        //     the cavity band (wheel arches cutting into the body,
        //     the way real truck wheel wells do).
        //   • Spool slot  (0.10 → 0.50) — 0.40-unit SEE-THROUGH cavity.
        //     Like HEARTH / CITY_BONFIRE this band is transparent: the
        //     gap filler paints only a subtle cool-blue glow over
        //     whatever the back layers have drawn behind the tile, so
        //     the player genuinely looks INTO the truck instead of at
        //     a blue rubber band painted across the face. The 🧵 spool
        //     billboard sprite (DumpTruckSprites) renders inside this
        //     cavity via the z-bypass path, exactly how BonfireSprites
        //     puts the dragonfire glyph inside the hearth cavity.
        //   • Upper body  (0.50 → 2.00) — dominant 1.50-unit chassis
        //     that carries the truck's bulk above the slot, giving the
        //     silhouette "similar to the hearth in stature."
        38: Object.freeze({ hUpper: 1.50, hLower: 0.10, fillGap: 'truck_spool_cavity' }),
        // WINDOW_TAVERN — three-band building facade window sized to match
        // the 3.5-unit exterior WALL height (all three exterior biomes —
        // approach, promenade, lantern — set WALL=3.5 as multi-story
        // facade). A 2.0-unit window next to a 3.5-unit wall would leave
        // a 1.5-unit notch in the facade, so the column is sized to the
        // full building height with a narrow glass slot punched at eye
        // level. The player reads the result as "multi-story building
        // with a ground-floor window," not a short bay annex.
        //
        // The glass slot sits at WAIST-to-chin height so the player
        // looks slightly DOWN into the tavern interior — the camera is
        // at world Y 1.0 and the slot spans 0.40–1.15, putting the slot
        // center at world Y 0.775 (below eye level). An earlier pass
        // had the slot at 0.90–1.65 (center 1.275, above eye), which
        // made the window read as mounted above the player's head
        // instead of as a real ground-floor pub window to peer into.
        //   • Sill       (0.00 → 0.40) — waist-high sill course below
        //     the opening. Opaque wood-plank texture (same as lintel).
        //   • Glass slot (0.40 → 1.15) — 0.75-unit SEE-THROUGH cavity
        //     at waist-to-chin height. The 'window_tavern_interior'
        //     gap filler paints a warm amber interior wash, a thin
        //     blue-white glass-sheen gradient, a divided-pane mullion
        //     cross, and a dark frame border — together the slot reads
        //     as "looking through a window with actual glass" instead
        //     of a painted rectangle or an open hole. WindowSprites
        //     puts a 🍺 billboard in the cavity via the z-bypass path.
        //   • Lintel     (1.15 → 3.50) — 2.35-unit lintel + upper floors
        //     carrying the load above the opening. Dominates the facade
        //     silhouette so the window reads as a small cut-out in a
        //     full wall rather than half the building.
        73: Object.freeze({ hUpper: 2.35, hLower: 0.40, fillGap: 'window_tavern_interior' }),
        69: Object.freeze({ hUpper: 0.80, hLower: 0.50, fillGap: 'city_bonfire_fire' }),
        // PERGOLA_BEAM sits at the TOP of the 2.0-unit column as a
        // thin canopy strip — 0.20 world units, roughly one quarter
        // the thickness of the adjacent CITY_BONFIRE chimney hood
        // (0.80). The band occupies world height 1.80–2.00, which
        // overlaps the top 0.20 of the chimney's 1.20–2.00 elevation
        // range so the beam reads as "a delicate rail landing on top
        // of the chimney" instead of a slab that matches its bulk.
        // Column height dropped from 3.0 → 2.0 in lockstep with
        // CITY_BONFIRE so the canopy continues to meet the chimney
        // top after the pyre was shortened. No pedestal (hLower = 0)
        // and a fully transparent gap so the area below the canopy
        // shows sky (above horizon) + plaza floor (below horizon).
        // Must use the '_transparent' gap filler (no-op) — the
        // '_default' filler paints dim fog-tinted #141414, which
        // would render the "under the canopy" area as a solid black
        // cube. Degrades gracefully to a single-band wall on biomes
        // that shrink wallHeights below 0.20.
        70: Object.freeze({ hUpper: 0.20, hLower: 0.0, fillGap: '_transparent' }),
        // ARCH_DOORWAY — alpha-mask freeform. hUpper/hLower are dummy
        // maximums; the actual per-column gap profile is driven by the
        // texture's α channel (gapTexAlpha: true). The raycaster reads
        // _computeAlphaRange per column instead of using flat fractions.
        // fillGap: '_transparent' — the room behind shows through.
        71: Object.freeze({ hUpper: 0.5, hLower: 0.0, gapTexAlpha: true, fillGap: '_transparent' }),
        // PORTHOLE — alpha-mask freeform circular cutout. Similar to
        // ARCH_DOORWAY but with a centred circular transparent region.
        72: Object.freeze({ hUpper: 0.5, hLower: 0.3, gapTexAlpha: true, fillGap: '_transparent' }),
        // DOOR_FACADE — full-height building entrance. The door opening
        // is a 1.30-unit cavity at ground level (world Y 0.00→1.30),
        // matching human-scale proportions against a 3.5-unit facade.
        // hLower=0 (no sill — door meets floor), hUpper=2.20 (lintel +
        // upper floors = 3.5 - 1.30). The 'facade_door' gap filler paints
        // the dark interior + door frame on the exterior face, transparent
        // on the interior face, masonry on side faces (same model as
        // WINDOW_TAVERN's three-face treatment).
        74: Object.freeze({ hUpper: 2.20, hLower: 0.00, fillGap: 'facade_door', recessD: 0.25 })
      }, opts.tileFreeform),

      // ── Wall textures ──
      // Keyed by TILES constant value → TextureAtlas texture ID.
      // Biome overrides merge INTO these defaults — a biome only needs to
      // list tiles it wants to remap, not every tile in the contract.
      textures: _mergeTileTable(_buildTextures({
        1:  'concrete',        // WALL — modern commercial concrete
        2:  'door_wood',       // DOOR — wooden entrance
        3:  'door_wood',       // DOOR_BACK
        4:  'door_wood',       // DOOR_EXIT
        5:  'stairs_down',     // STAIRS_DN — directional indicator
        6:  'stairs_up',       // STAIRS_UP — directional indicator
        75: 'wood_plank',      // TRAPDOOR_DN — wood hatch frame
        76: 'wood_plank',      // TRAPDOOR_UP — wood hatch frame
        11: 'crate_wood',      // BREAKABLE — destructible crate
        14: 'door_iron',       // BOSS_DOOR — iron gate
        18: 'bonfire_ring',    // BONFIRE — stone ring (0.3× short column)
        30: 'torch_bracket_lit',   // TORCH_LIT — stone wall + burning torch
        31: 'torch_bracket_unlit', // TORCH_UNLIT — stone wall + charred bracket
        35: 'fence_wood',      // FENCE — wooden rail (0.4× half-wall)
        38: 'truck_body',      // DUMP_TRUCK — blue pressure wash truck (2.0× HEARTH-stature
                               //   freeform: 0.40 lower body w/ wheel decor + 0.25 spool
                               //   cavity + 1.35 upper chassis). See tileFreeform for bands.
        60: 'roof_shingle',    // ROOF_EAVE_L — left eave strip
        61: 'roof_shingle',    // ROOF_SLOPE_L — left ascending slope
        62: 'roof_shingle',    // ROOF_PEAK — ridge beam
        63: 'roof_shingle',    // ROOF_SLOPE_R — right descending slope
        64: 'roof_shingle',    // ROOF_EAVE_R — right eave strip
        65: 'canopy_oak',      // CANOPY — dense leaf texture
        66: 'canopy_moss',     // CANOPY_MOSS — hanging-moss strands
        67: 'roof_crenel',     // ROOF_CRENEL — cap stone for rampart slab
        68: 'pergola_beam',    // PERGOLA — stained hardwood beam for open-air trellis
        69: 'city_bonfire_stone', // CITY_BONFIRE — carved limestone for both bands:
                               //   0.50-unit pedestal (bottom) + 0.80-unit chimney hood
                               //   (top), with 1.70-unit fire cavity between them.
                               //   See tileFreeform for the three-band split.
        70: 'pergola_beam',    // PERGOLA_BEAM — stained hardwood cross-beam shared
                               //   with the PERGOLA slab texture. The freeform band
                               //   (0.80 world units) samples a clean horizontal
                               //   strip of the beam texture.
        71: 'arch_brick',      // ARCH_DOORWAY — sandstone brick + parabolic α-cutout
        72: 'porthole_alpha',  // PORTHOLE — industrial brick + circular α-cutout
        73: 'wood_plank',      // WINDOW_TAVERN — stained plank frame for the sill
                               //   and lintel bands. The middle glass slot is
                               //   painted by the 'window_tavern_interior' gap
                               //   filler (amber tint over back layers), not by
                               //   this texture.
        74: 'concrete'         // DOOR_FACADE — wall texture for the lintel band
                               //   above the door opening. Per-tile override via
                               //   DoorSprites.getWallTexture() replaces this with
                               //   the building's own material.
      }), opts.textures),

      // ── Floor texture ──
      floorTexture:     opts.floorTexture || 'floor_cobble',

      // ── Per-tile-type floor texture overrides ──
      // Biome overrides merge INTO these defaults.
      tileFloorTextures: _mergeTileTable({
        8:  'floor_trap',        // TRAP — pressure plate on stone
        15: 'floor_fire',        // FIRE — charred stone with ember cracks
        16: 'floor_spikes',      // SPIKES — iron grate over spike pit
        17: 'floor_poison',      // POISON — stone with toxic green pools
        19: 'floor_corpse',      // CORPSE — bloodstained stone with bone fragments
        21: 'floor_grass',       // TREE — grass under trees
        22: 'floor_grass',       // SHRUB — grass under hedges
        23: 'floor_puzzle',      // PUZZLE — etched grid with arcane runes
        32: 'floor_cobble',      // ROAD — cobblestone avenues
        33: 'floor_dirt',        // PATH — dirt trails
        34: 'floor_grass',       // GRASS — meadow clearings
        35: 'floor_boardwalk',   // FENCE — boardwalk planks under railing
        37: 'bonfire_ring',      // MAILBOX — reuse stone ring base texture
        39: 'floor_detritus',    // DETRITUS — scattered adventurer debris
        65: 'floor_grass',       // CANOPY — grass visible below floating canopy
        66: 'floor_grass',       // CANOPY_MOSS — grass visible below moss strands
        67: 'floor_grass',       // ROOF_CRENEL — ground below a rampart (overridden per biome)
        68: 'floor_cobble',      // PERGOLA — plaza flagstones below the beam lattice (biome-overridable)
        69: 'floor_cobble',      // CITY_BONFIRE — plaza flagstones around the community pyre
        70: 'floor_cobble',      // PERGOLA_BEAM — plaza flagstones under the beam canopy
        71: 'floor_stone',       // ARCH_DOORWAY — stone threshold under the arch
        72: 'floor_cobble',      // PORTHOLE — cobblestones below the porthole wall
        73: 'floor_cobble',      // WINDOW_TAVERN — street cobblestones outside the facade
        74: 'floor_stone'       // DOOR_FACADE — stone threshold under the door
      }, opts.tileFloorTextures),

      // ── Per-tile-type wall height overrides ──
      // Biome overrides merge INTO these defaults.
      tileWallHeights: _mergeTileTable({
        18: 0.3,    // BONFIRE — low stone ring, player sees over into fire cavity
        22: 0.5,    // SHRUB — half-height hedge
        35: 0.4,    // FENCE — railing, player sees over to skybox
        37: 0.5,    // MAILBOX — half-height post, emoji billboard sits above
        38: 2.0,    // DUMP_TRUCK — HEARTH-stature pressure-wash truck. Freeform path
                    //   splits this into 0.40 lower body (wheel decor band) + 0.25
                    //   ground-level spool cavity (0.40–0.65) + 1.35 upper chassis
                    //   (0.65–2.00). The spool reel (decor_truck_hose) lives in the
                    //   cavity instead of floating as a billboard, and wheels are
                    //   wallDecor sprites on the 4 floor-adjacent side faces so they
                    //   parallax flat with viewing angle.
        60: 0.20,   // ROOF_EAVE_L — thin strip, eave overhang
        61: 0.25,   // ROOF_SLOPE_L — slightly taller ascending slope
        62: 0.30,   // ROOF_PEAK — thickest strip, ridge beam
        63: 0.25,   // ROOF_SLOPE_R — mirror of SLOPE_L
        64: 0.20,   // ROOF_EAVE_R — mirror of EAVE_L
        65: 0.25,   // CANOPY — thin leaf strip, floating high
        66: 0.25,   // CANOPY_MOSS — thin moss strip, floating high
        67: 0.50,   // ROOF_CRENEL — thick slab, solid bottom half + toothed top half
        68: 0.50,   // PERGOLA — same slab thickness as CRENEL (shares tooth generator)
        69: 2.0,    // CITY_BONFIRE — Olympic pyre (2x wall height). Freeform path
                    //   splits this into 0.50 pedestal + 0.70 narrow fire window +
                    //   0.80 chimney hood (greater-hearth silhouette; pergola beams
                    //   land on the hood). Dropped from 3.0 → 2.0 so the fire reads
                    //   as a controlled window under a visible hood instead of a
                    //   towering jet, and so the chimney "starts sooner" — its
                    //   bottom is now at world Y=1.20 instead of 2.20.
        70: 2.0,    // PERGOLA_BEAM — same 2x wall height as CITY_BONFIRE so the
                    //   top-anchored canopy strip (hUpper 0.20) lands at world
                    //   Y=1.80–2.00, just below the chimney top. A ring of beams
                    //   around the pyre reads as a delicate rail sitting on top
                    //   of the chimney rather than a second full-mass slab.
        71: 3.5,    // ARCH_DOORWAY — full building facade height (matches WALL)
        72: 3.5,    // PORTHOLE — full building facade height (matches WALL)
        74: 3.5,    // DOOR_FACADE — full building facade height (matches WALL)
        73: 3.5     // WINDOW_TAVERN — 3.5x full building facade (matches WALL
                    //   on all exterior biomes so the window cuts into the
                    //   wall plane without creating a notch). Freeform path
                    //   splits this into 0.90 sill + 0.75 glass slot at eye
                    //   level (world Y 0.90–1.65, spanning the 1.0 eye) +
                    //   1.85 lintel/upper floors. Biomes that override
                    //   tileWallHeights MUST NOT re-list this key at a
                    //   different value or the freeform sandwich will fall
                    //   out of scale with the band world-unit extents.
      }, opts.tileWallHeights),

      // ── Gameplay rules ──
      timeFreeze:       false,   // Time passes on the surface
      timeRate:         opts.timeRate || 24,  // Game-minutes per real minute (Stardew pacing: 1440/24 = 60 real min per day)
      canNest:          true,    // Can contain doors to floorsN.N
      maxNestDepth:     2,       // Can go N → N.N → N.N.N

      // ── Audio contract ──
      // AudioMusicManager reads this on floor change. musicId is the
      // manifest key (or special sentinel). muffleHz=null disables the
      // lowpass filter. bgmVolume is the target music channel volume.
      audio:            _mergeAudio({
        musicId:     'music-mood-bober',
        muffleHz:    null,
        bgmVolume:   0.6,
        ambientBed:  null
      }, opts.audio)
    });
  }

  /**
   * floorsN.N — Interior contrived (templates).
   * Enclosed spaces. Walls NEVER vanish — hard fog clamp.
   * 2-tile tall walls (taller ceilings, grander spaces).
   * Always from a hand-authored template, never proc-gen.
   */
  function interior(opts) {
    opts = opts || {};
    return Object.freeze({
      depth:            DEPTH.INTERIOR,
      label:            opts.label || 'Interior',

      // ── Raycaster rules ──
      wallHeight:       opts.wallHeight || 2.0,    // 2x height — tall ceilings
      renderDistance:    opts.renderDistance || 12,  // Shorter — rooms are smaller
      fogModel:         FOG.CLAMP,                 // Walls clamp to solid at distance
      fogDistance:       opts.fogDistance || 10,     // Fog starts close
      fogColor:         opts.fogColor || { r: 10, g: 10, b: 12 }, // Near-black
      terminusDist:     opts.terminusDist || 1.5,   // Interior: tighter punch-through
      weather:          opts.weather || 'clear',
      ceilingType:      CEILING.SOLID,
      ceilColor:        opts.ceilColor || '#1a1a1a',
      floorColor:       opts.floorColor || '#2a2a2a',

      parallax:         null,   // No parallax in enclosed spaces

      // ── Generator rules ──
      gridSize:         opts.gridSize || { w: 16, h: 16 },  // Small template
      roomSizeRange:    opts.roomSizeRange || { min: 4, max: 8 },
      roomCount:        opts.roomCount || { min: 2, max: 5 },
      allowOutdoorTiles: false,
      corridorWidth:    1,
      useTemplate:      true,   // Generator should load template, not proc-gen

      // ── Tile height offsets (Doom rule) ──
      tileHeightOffsets: _mergeTileTable(_buildOffsets({
        5: -0.08,     // STAIRS_DN — trap door feel
        6:  0.06,     // STAIRS_UP — slight rise toward exit
        14: 0.12,     // BOSS_DOOR — elevated archway
        29: -0.40,    // HEARTH — deep sunken: fire cavity for sandwich rendering
                      //   (legacy step-fill path; freeform path ignores this
                      //    offset when tileFreeform[29] is active)
        75: -0.10,    // TRAPDOOR_DN — sunken, hatch reads as hole in floor
        76:  0.10     // TRAPDOOR_UP — raised, hatch reads as hole in ceiling
      }), opts.tileHeightOffsets),
      stepColor:        opts.stepColor || '#151518',

      // ── Freeform tile config (two-segment wall columns) ──────────
      // Opt-in per-tile upper/lower brick bands with a gap in between.
      // Renders as: mantle band (top) + cavity (middle) + base band
      // (bottom). Units are world-space; gap is wallHeight − (hUpper +
      // hLower). When the sum ≥ wallHeight the tile degrades to a
      // solid two-band column (no visible gap) — safe fallback for
      // biomes that set HEARTH to a short base stone.
      //
      // See docs/RAYCAST_FREEFORM_UPGRADE_ROADMAP.md §3 for the design
      // and §4 Phase 1 for the HEARTH migration.
      tileFreeform: _mergeTileTable({
        // HEARTH: mantle 0.80 world units, base 0.40 world units.
        // On a 2.5-tall chimney stack the gap is 1.30 units (generous
        // fire cavity). On a 0.5-tall stub it degrades to fully solid.
        29: Object.freeze({ hUpper: 0.80, hLower: 0.40, fillGap: 'hearth_fire' }),
        71: Object.freeze({ hUpper: 0.5, hLower: 0.0, gapTexAlpha: true, fillGap: '_transparent' }),
        // DOOR_FACADE on interior floors: 1.30-unit door opening in a
        // 2.0-unit wall. hUpper = 0.70 (lintel above door).
        74: Object.freeze({ hUpper: 0.70, hLower: 0.00, fillGap: 'facade_door' }),
        // TRAPDOOR_DN: 0.50-unit hatch cavity at bottom of 2.0 wall
        75: Object.freeze({ hUpper: 1.50, hLower: 0.00, fillGap: 'trapdoor_shaft' }),
        // TRAPDOOR_UP: 0.50-unit hatch cavity at top of 2.0 wall
        76: Object.freeze({ hUpper: 0.00, hLower: 1.50, fillGap: 'trapdoor_shaft' })
      }, opts.tileFreeform),

      // ── Wall textures ──
      textures: _mergeTileTable(_buildTextures({
        1:  'wood_plank',      // WALL — warm wood interior
        71: 'arch_stone',      // ARCH_DOORWAY — cool stone for interior arches
        2:  'door_wood',       // DOOR — room-to-room door
        3:  'door_wood',       // DOOR_BACK
        4:  'door_wood',       // DOOR_EXIT
        74: 'wood_plank',      // DOOR_FACADE — lintel texture (interior wood)
        5:  'stairs_down',     // STAIRS_DN — directional indicator
        6:  'stairs_up',       // STAIRS_UP — directional indicator
        75: 'wood_plank',      // TRAPDOOR_DN — wood hatch frame
        76: 'wood_plank',      // TRAPDOOR_UP — wood hatch frame
        11: 'crate_wood',      // BREAKABLE — destructible crate
        14: 'door_iron',       // BOSS_DOOR — iron archway
        18: 'bonfire_ring',    // BONFIRE — stone ring (interior hearth variant)
        30: 'torch_bracket_lit',   // TORCH_LIT — interior wall torch
        31: 'torch_bracket_unlit', // TORCH_UNLIT — extinguished
        36: 'terminal_screen'  // TERMINAL — CRT desk (retro-futuristic)
      }), opts.textures),

      // ── Floor texture ──
      floorTexture:     opts.floorTexture || 'floor_wood',

      // ── Per-tile-type floor texture overrides ──
      tileFloorTextures: _mergeTileTable({
        8:  'floor_trap',        // TRAP — pressure plate on stone
        15: 'floor_fire',        // FIRE — charred stone with ember cracks
        16: 'floor_spikes',      // SPIKES — iron grate over spike pit
        17: 'floor_poison',      // POISON — stone with toxic green pools
        19: 'floor_corpse',      // CORPSE — bloodstained stone with bone fragments
        23: 'floor_puzzle',      // PUZZLE — etched grid with arcane runes
        39: 'floor_detritus',    // DETRITUS — scattered adventurer debris
        71: 'floor_stone',      // ARCH_DOORWAY — stone threshold
        74: 'floor_stone',      // DOOR_FACADE — stone threshold
        75: 'floor_stone',      // TRAPDOOR_DN — stone around hatch
        76: 'floor_stone'       // TRAPDOOR_UP — stone around hatch
      }, opts.tileFloorTextures),

      // ── Per-tile-type wall height overrides ──
      tileWallHeights: _mergeTileTable({
        1:  2.5,    // WALL — extends above ceiling plane for close-up immersion
        18: 0.3,    // BONFIRE — low stone ring
        36: 0.6,    // TERMINAL — desk height, CRT screen above
        71: 2.5,    // ARCH_DOORWAY — match interior WALL height
        74: 2.5,    // DOOR_FACADE — match interior WALL height
        75: 2.0,    // TRAPDOOR_DN — full interior wall height
        76: 2.0     // TRAPDOOR_UP — full interior wall height
      }, opts.tileWallHeights),

      // ── Gameplay rules ──
      timeFreeze:       true,    // No time pressure inside buildings — cozy safety contract
      timeRate:         0,       // Frozen — shops/inns are safe havens (matches timeFreeze)
      canNest:          true,    // Can contain doors to floorsN.N.N
      maxNestDepth:     1,

      // ── Audio contract ──
      // Default: inherit the parent exterior's track, muffled via lowpass
      // and volume-ducked. Biomes may override musicId for a dedicated
      // interior cue, or muffleHz/bgmVolume for a drier or wetter feel.
      audio:            _mergeAudio({
        musicId:     '__inherit_parent__',
        muffleHz:    800,
        bgmVolume:   0.35,
        ambientBed:  null
      }, opts.audio)
    });
  }

  /**
   * floorsN.N.N — Nested proc-gen dungeon.
   * Underground / sub-basement. Walls can vanish (darkness model).
   * 1-tile tall walls (cramped), with overrides for special chambers.
   * Proc-gen layout with optional templated puzzle/boss rooms injected.
   */
  function nestedDungeon(opts) {
    opts = opts || {};

    // Room height overrides: specific rooms can be taller
    // e.g., { roomIndex: 3, wallHeight: 1.5, label: 'Grand Chamber' }
    var chamberOverrides = opts.chamberOverrides || [];

    return Object.freeze({
      depth:            DEPTH.NESTED_DUNGEON,
      label:            opts.label || 'Dungeon',

      // ── Raycaster rules ──
      wallHeight:       opts.wallHeight || 1.0,    // Default 1x — low ceilings
      renderDistance:    opts.renderDistance || 14,
      fogModel:         FOG.DARKNESS,              // Hard black cutoff
      fogDistance:       opts.fogDistance || 10,
      fogColor:         opts.fogColor || { r: 0, g: 0, b: 0 },  // Pure black
      terminusDist:     opts.terminusDist || 1.0,   // Dungeon: tight punch-through
      weather:          opts.weather || 'clear',
      ceilingType:      CEILING.VOID,
      ceilColor:        opts.ceilColor || '#0a0a0a',
      floorColor:       opts.floorColor || '#222',

      // ── Parallax (depth supplement for long corridors) ──
      parallax:         opts.parallax || [
        { depth: 0.7, color: '#111', height: 0.15 }  // Subtle dark band
      ],

      // ── Generator rules ──
      gridSize:         opts.gridSize || { w: 24, h: 24 },
      roomSizeRange:    opts.roomSizeRange || { min: 4, max: 8 },
      roomCount:        opts.roomCount || { min: 5, max: 8 },
      allowOutdoorTiles: false,
      corridorWidth:    1,

      // ── Chamber height overrides ──
      // Per-room wallHeight multiplier. Raycaster checks if player is
      // inside a chamber's bounds and uses that room's height.
      chamberOverrides: chamberOverrides,

      // ── Tile height offsets (Doom rule) ──
      tileHeightOffsets: _mergeTileTable(_buildOffsets({
        5: -0.10,     // STAIRS_DN — hole in the floor
        6:  0.05,     // STAIRS_UP — rough hewn steps upward
        14: 0.15,     // BOSS_DOOR — chamber entrance
        29: -0.40,    // HEARTH — deep sunken: fire cavity for sandwich rendering
        75: -0.10,    // TRAPDOOR_DN — sunken, hatch reads as hole in floor
        76:  0.10     // TRAPDOOR_UP — raised, hatch reads as hole in ceiling
      }), opts.tileHeightOffsets),
      stepColor:        opts.stepColor || '#111',

      // ── Freeform tile config ──
      tileFreeform: _mergeTileTable({
        29: Object.freeze({ hUpper: 0.40, hLower: 0.20, fillGap: 'hearth_fire' }),
        // TRAPDOOR_DN: 0.20-unit hatch in a 1.2 dungeon wall (bottom cavity)
        75: Object.freeze({ hUpper: 1.00, hLower: 0.00, fillGap: 'trapdoor_shaft' }),
        // TRAPDOOR_UP: 0.20-unit hatch in a 1.2 dungeon wall (top cavity)
        76: Object.freeze({ hUpper: 0.00, hLower: 1.00, fillGap: 'trapdoor_shaft' })
      }, opts.tileFreeform),

      // ── Wall textures ──
      textures: _mergeTileTable(_buildTextures({
        1:  'stone_rough',     // WALL — rough dungeon stone
        2:  'door_wood',       // DOOR
        3:  'door_wood',       // DOOR_BACK
        4:  'door_wood',       // DOOR_EXIT
        5:  'stairs_down',     // STAIRS_DN — directional indicator
        6:  'stairs_up',       // STAIRS_UP — directional indicator
        75: 'wood_plank',      // TRAPDOOR_DN — wood hatch frame
        76: 'wood_plank',      // TRAPDOOR_UP — wood hatch frame
        11: 'crate_wood',      // BREAKABLE — destructible crate
        14: 'door_iron',       // BOSS_DOOR — iron chamber door
        18: 'bonfire_ring',    // BONFIRE — dungeon rest point
        30: 'torch_bracket_lit',   // TORCH_LIT — dungeon wall torch
        31: 'torch_bracket_unlit', // TORCH_UNLIT — hero's mess
        36: 'terminal_screen'  // TERMINAL — dungeon data terminal
      }), opts.textures),

      // ── Floor texture ──
      floorTexture:     opts.floorTexture || 'floor_stone',

      // ── Per-tile-type floor texture overrides ──
      tileFloorTextures: _mergeTileTable({
        8:  'floor_trap',        // TRAP — pressure plate on stone
        15: 'floor_fire',        // FIRE — charred stone with ember cracks
        16: 'floor_spikes',      // SPIKES — iron grate over spike pit
        17: 'floor_poison',      // POISON — stone with toxic green pools
        19: 'floor_corpse',      // CORPSE — bloodstained stone with bone fragments
        23: 'floor_puzzle',      // PUZZLE — etched grid with arcane runes
        39: 'floor_detritus',    // DETRITUS — scattered adventurer debris
        75: 'floor_stone',       // TRAPDOOR_DN — stone around hatch
        76: 'floor_stone'        // TRAPDOOR_UP — stone around hatch
      }, opts.tileFloorTextures),

      // ── Per-tile-type wall height overrides ──
      tileWallHeights: _mergeTileTable({
        18: 0.3,    // BONFIRE — low stone ring
        36: 0.6,    // TERMINAL — desk height
        75: 1.2,    // TRAPDOOR_DN — low dungeon wall around hatch
        76: 1.2     // TRAPDOOR_UP — low dungeon wall around hatch
      }, opts.tileWallHeights),

      // ── Gameplay rules ──
      timeFreeze:       false,   // Time ticks in the dungeons — pressure!
      timeRate:         opts.timeRate || 12,  // Half exterior rate — dungeons eat time but aren't oppressive
      canNest:          false,   // Bottom of the hierarchy
      maxNestDepth:     0,

      // ── Audio contract ──
      // Default dungeon cue is 'insidearea' — tense sub-basement pulse.
      // Muffle is null (underground isn't muffled — it's dry and reverby).
      // Deeper dungeons or specific sub-dungeons can override musicId.
      audio:            _mergeAudio({
        musicId:     'music-insidearea',
        muffleHz:    null,
        bgmVolume:   0.6,
        ambientBed:  null
      }, opts.audio)
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  RUNTIME QUERIES
  //  The raycaster calls these each frame to determine render params.
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the effective wall height at a grid position.
   * Checks chamber overrides (nested dungeons can have tall rooms).
   *
   * @param {Object} contract - Spatial contract for current floor
   * @param {number} x - Grid X
   * @param {number} y - Grid Y
   * @param {Array}  rooms - Room list from GridGen (with bounds)
   * @returns {number} Wall height multiplier
   */
  function getWallHeight(contract, x, y, rooms, tileType, cellHeights) {
    // Per-cell height override (e.g. building entrance doors computed at
    // floor build time). Takes priority over everything else — this is how
    // the door height contract resolves per-instance height differences
    // (archway vs shop entrance) that tileWallHeights can't express.
    if (cellHeights) {
      var cellKey = x + ',' + y;
      if (cellHeights[cellKey] != null) {
        return cellHeights[cellKey];
      }
    }

    // Per-tile-type height override (e.g. TREE tiles at 2x in exterior)
    if (tileType != null && contract.tileWallHeights && contract.tileWallHeights[tileType] != null) {
      return contract.tileWallHeights[tileType];
    }

    if (!rooms || !contract.chamberOverrides || contract.chamberOverrides.length === 0) {
      return contract.wallHeight;
    }

    // Check if position is inside an overridden chamber
    for (var i = 0; i < contract.chamberOverrides.length; i++) {
      var ov = contract.chamberOverrides[i];
      var room = rooms[ov.roomIndex];
      if (!room) continue;

      if (x >= room.x && x < room.x + room.w &&
          y >= room.y && y < room.y + room.h) {
        return ov.wallHeight;
      }
    }

    return contract.wallHeight;
  }

  /**
   * Compute per-cell height overrides for DOOR tiles based on spatial
   * context. Building entrance doors get capped to a sensible height
   * while archway/gate doors stay at full wall height.
   *
   * Rule:
   *   DOOR (type 2) leading DEEPER (target depth > current depth):
   *     height = max(1.0, wallHeight * 0.5)  — building entrance
   *   DOOR (type 2) leading SAME or SHALLOWER:
   *     height = tileWallHeights[DOOR]  — archway/gate
   *   DOOR_EXIT/DOOR_BACK/BOSS_DOOR:
   *     always use tileWallHeights (gates stay full height)
   *
   * @param {Array[]} grid      - 2D tile grid
   * @param {number}  gridW     - grid width
   * @param {number}  gridH     - grid height
   * @param {Object}  tileWallHeights - per-tile-type height map from contract
   * @param {number}  baseWallH - contract default wall height
   * @param {Object}  doorTargets - 'x,y' → target floor ID
   * @param {string}  currentFloorId - current floor ID string
   * @returns {Object|null} cellHeights map ('x,y' → height) or null if empty
   */
  function computeDoorHeights(grid, gridW, gridH, tileWallHeights, baseWallH, doorTargets, currentFloorId) {
    if (!tileWallHeights || !grid) return null;

    var wallH = tileWallHeights[1] || baseWallH;  // WALL tile height
    // Only apply entrance-cap rule when buildings are tall
    if (wallH <= 2.0) return null;

    var currentDepth = currentFloorId ? String(currentFloorId).split('.').length : 1;
    var doorH = tileWallHeights[2];  // DOOR tileWallHeight (may be null)
    if (doorH == null) return null;   // No explicit door height → nothing to cap

    var entranceH = Math.max(1.0, wallH * 0.5);  // Capped entrance height
    if (entranceH >= doorH) return null;          // Cap doesn't change anything

    var cellHeights = {};
    var found = false;

    for (var y = 0; y < gridH; y++) {
      for (var x = 0; x < gridW; x++) {
        var tile = grid[y][x];
        // Only DOOR tiles (type 2) get the entrance-cap rule.
        // DOOR_BACK (3), DOOR_EXIT (4), BOSS_DOOR (14) stay full height.
        if (tile !== 2) continue;  // TILES.DOOR = 2

        var key = x + ',' + y;
        var isArchway = false;

        // Check if this door leads to same-depth or shallower = archway
        if (doorTargets && doorTargets[key]) {
          var targetId = doorTargets[key];
          var targetDepth = String(targetId).split('.').length;
          if (targetDepth <= currentDepth) {
            isArchway = true;
          }
        }

        if (!isArchway) {
          // Building entrance — cap to half building height
          cellHeights[key] = entranceH;
          found = true;
        }
      }
    }

    return found ? cellHeights : null;
  }

  /**
   * Determine what to render when a ray exceeds render distance.
   *
   * @param {Object} contract
   * @param {number} perpDist - perpendicular distance of the ray
   * @param {number} [renderDistOverride] - effective render distance
   *   (Raycaster passes a boosted value when RENDER_SCALE < 1.0 to
   *   extend draw distance; if absent, contract.renderDistance is used)
   * @returns {Object} { draw: boolean, color: string, alpha: number }
   */
  function resolveDistantWall(contract, perpDist, renderDistOverride) {
    var rd = (typeof renderDistOverride === 'number')
      ? renderDistOverride : contract.renderDistance;
    if (perpDist < rd) {
      // Within range — render normally
      return { draw: true, isClamped: false };
    }

    switch (contract.fogModel) {
      case FOG.FADE:
        // Wall fades out — DON'T draw (shows sky/background = outdoor feel)
        return { draw: false, isClamped: false };

      case FOG.CLAMP:
        // Draw a solid dark wall at render distance — reads as "more wall"
        return {
          draw: true,
          isClamped: true,
          clampDist: rd,
          clampColor: _fogToCSS(contract.fogColor)
        };

      case FOG.DARKNESS:
        // Hard black cutoff — draw black wall at distance
        return {
          draw: true,
          isClamped: true,
          clampDist: rd,
          clampColor: '#000'
        };

      default:
        return { draw: false, isClamped: false };
    }
  }

  /**
   * Get fog factor for a given distance.
   * 0 = no fog, 1 = fully fogged.
   *
   * @param {Object} contract
   * @param {number} dist
   * @param {number} [renderDistOverride] - boosted render distance
   * @param {number} [fogDistOverride]    - boosted fog distance
   * @returns {number}
   */
  function getFogFactor(contract, dist, renderDistOverride, fogDistOverride) {
    var rd = (typeof renderDistOverride === 'number')
      ? renderDistOverride : contract.renderDistance;
    var fd = (typeof fogDistOverride === 'number')
      ? fogDistOverride : contract.fogDistance;
    if (dist <= 0) return 0;
    if (dist >= rd) return 1;
    if (dist <= fd * 0.5) return 0; // No fog up close

    // Smooth ramp from fogDistance*0.5 to renderDistance
    var start = fd * 0.5;
    var range = rd - start;
    return Math.min(1, (dist - start) / range);
  }

  /**
   * Build ceiling/floor gradient colors for a contract.
   * @param {Object} contract
   * @returns {Object} { ceilTop, ceilBottom, floorTop, floorBottom }
   */
  function getGradients(contract) {
    switch (contract.ceilingType) {
      case CEILING.SKY:
        return {
          ceilTop: '#0a1020',   // Dark sky at zenith
          ceilBottom: contract.ceilColor,
          floorTop: contract.floorColor,
          floorBottom: '#111'
        };
      case CEILING.SOLID:
        // Slight gradient: darker at top (farther from torchlight),
        // lighter near horizon (reflected light). Gives enclosed depth cue.
        return {
          ceilTop: _darken(contract.ceilColor, 0.6),  // Darker overhead
          ceilBottom: contract.ceilColor,              // Lit near eye level
          floorTop: contract.floorColor,
          floorBottom: '#0a0a0a'
        };
      case CEILING.VOID:
        return {
          ceilTop: '#000',
          ceilBottom: '#050508',
          floorTop: contract.floorColor,
          floorBottom: '#000'
        };
      default:
        return {
          ceilTop: '#111', ceilBottom: '#222',
          floorTop: '#333', floorBottom: '#111'
        };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  PARALLAX LAYERS
  //  Background depth bands rendered behind walls.
  //  Exterior: distant mountains/treeline. Dungeon: rock strata.
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get parallax layers for rendering.
   * Each layer: { depth (0-1 where 1=horizon), color, height (fraction of viewport) }
   *
   * @param {Object} contract
   * @returns {Array|null}
   */
  function getParallax(contract) {
    return contract.parallax || null;
  }

  /**
   * Get the audio block for a contract. Never returns null — a missing
   * audio block yields a neutral fallback so callers can always read
   * .musicId / .muffleHz / .bgmVolume without defensive checks.
   *
   * @param {Object} contract
   * @returns {Object} { musicId, muffleHz, bgmVolume, ambientBed }
   */
  function getAudio(contract) {
    if (contract && contract.audio) return contract.audio;
    return { musicId: null, muffleHz: null, bgmVolume: 0.6, ambientBed: null };
  }

  // ── Presets for common scenarios ──

  var PRESETS = {
    // Overworld forest / ruins
    OVERWORLD: function (opts) {
      return exterior(Object.assign({
        label: 'Overworld',
        fogColor: { r: 30, g: 45, b: 35 },
        ceilColor: '#2a3a2a',
        floorColor: '#3a4a3a',
        parallax: [
          { depth: 0.95, color: '#1a2a1a', height: 0.12 },  // Distant treeline
          { depth: 0.85, color: '#253525', height: 0.08 }    // Mid hills
        ]
      }, opts || {}));
    },

    // Tavern / shop interior
    TAVERN: function (opts) {
      return interior(Object.assign({
        label: 'Tavern',
        wallHeight: 1.8,
        ceilColor: '#2a1a0a',
        floorColor: '#3a2a1a',
        fogColor: { r: 15, g: 10, b: 5 },
        gridSize: { w: 12, h: 10 }
      }, opts || {}));
    },

    // Temple / grand hall
    GRAND_HALL: function (opts) {
      return interior(Object.assign({
        label: 'Grand Hall',
        wallHeight: 2.5,
        renderDistance: 16,
        ceilColor: '#1a1a2a',
        floorColor: '#2a2a3a',
        gridSize: { w: 20, h: 16 }
      }, opts || {}));
    },

    // Standard dungeon crawl
    DUNGEON: function (opts) {
      return nestedDungeon(Object.assign({
        label: 'Dungeon',
        fogColor: { r: 5, g: 5, b: 8 }
      }, opts || {}));
    },

    // Dungeon with a boss chamber
    DUNGEON_WITH_BOSS: function (opts) {
      return nestedDungeon(Object.assign({
        label: 'Deep Dungeon',
        chamberOverrides: [
          { roomIndex: -1, wallHeight: 1.8, label: 'Boss Chamber' }
          // roomIndex -1 = last room. Resolved by generator.
        ]
      }, opts || {}));
    },

    // Tight cave / sewer
    CRAWLSPACE: function (opts) {
      return nestedDungeon(Object.assign({
        label: 'Crawlspace',
        wallHeight: 0.7,
        renderDistance: 8,
        fogDistance: 6,
        gridSize: { w: 20, h: 20 },
        roomSizeRange: { min: 3, max: 5 },
        floorTexture: 'floor_dirt'
      }, opts || {}));
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  TILE HEIGHT OFFSETS
  //  Per-tile-type vertical displacement (Doom level design rule).
  //  Positive = raised platform, negative = sunken recess.
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the height offset for a tile type on a given contract.
   * Returns 0 for tiles with no offset (walls, empty, etc.).
   *
   * @param {Object} contract
   * @param {number} tileType - TILES constant value
   * @returns {number} Vertical offset multiplier
   */
  function getTileHeightOffset(contract, tileType) {
    if (!contract || !contract.tileHeightOffsets) return 0;
    return contract.tileHeightOffsets[tileType] || 0;
  }

  /**
   * Get the texture ID assigned to a tile type on a given contract.
   * Returns null if no texture is assigned (raycaster falls back to flat color).
   *
   * @param {Object} contract
   * @param {number} tileType - TILES constant value
   * @returns {string|null} TextureAtlas texture ID
   */
  function getTexture(contract, tileType) {
    if (!contract || !contract.textures) return null;
    return contract.textures[tileType] || null;
  }

  /**
   * Get the freeform two-segment configuration for a tile, if any.
   * Returns null for tiles that should render as standard single-segment
   * wall columns on this contract.
   *
   * The returned object has shape `{ hUpper, hLower, fillGap? }` in world
   * units:
   *   hUpper  — upper brick band height, measured from ceiling downward
   *   hLower  — lower brick band height, measured from floor upward
   *   fillGap — (optional) string key selecting a gap filler registered via
   *             Raycaster.registerFreeformGapFiller(). Omitted → '_default'
   *             (transparent see-through + subtle dark wash). Examples:
   *             'hearth_fire' (warm cavity glow), future 'well_water',
   *             'dump_truck_bed', etc. Keys decouple Layer-1 contracts from
   *             Layer-2 raycaster without creating a circular dependency.
   *
   * The gap between the two bands is `wallHeight - (hUpper + hLower)`. When
   * hUpper + hLower ≥ wallHeight the tile is effectively solid (the
   * raycaster should skip the freeform path and render single-segment).
   *
   * @param {Object} contract
   * @param {number} tileType
   * @returns {{hUpper:number, hLower:number, fillGap?:string}|null}
   */
  function getTileFreeform(contract, tileType) {
    if (!contract || !contract.tileFreeform) return null;
    return contract.tileFreeform[tileType] || null;
  }

  /**
   * Get the floor texture ID for a contract.
   * Used by the raycaster's floor casting pass.
   *
   * @param {Object} contract
   * @returns {string|null} TextureAtlas texture ID for floor
   */
  function getFloorTexture(contract) {
    if (!contract) return null;
    return contract.floorTexture || null;
  }

  // ── Helpers ──

  /**
   * Build a frozen offset table from a plain object.
   * Keys are TILES constant values (numbers), values are float offsets.
   */
  function _buildOffsets(obj) {
    return Object.freeze(obj);
  }

  /**
   * Build a frozen texture assignment table from a plain object.
   * Keys are TILES constant values (numbers), values are texture ID strings.
   */
  function _buildTextures(obj) {
    return Object.freeze(obj);
  }

  /**
   * Merge a tile-keyed table: defaults + overrides → frozen result.
   * Biome overrides replace specific tile entries but defaults remain
   * for any tile the biome doesn't mention. Prevents the Object.assign
   * erasure bug where a biome's partial texture map silently drops
   * tiles that exist in the base contract's defaults.
   *
   * @param {Object} defaults - Base tile table from contract constructor
   * @param {Object|null} overrides - Biome-specific tile table (may be null/undefined)
   * @returns {Object} Frozen merged table
   */
  /**
   * Merge audio contract overrides onto defaults. Missing override keys
   * fall through to defaults; present keys replace them. Supports the
   * sentinel '__inherit_parent__' musicId for interior contracts.
   *
   * @param {Object} defaults - Base audio block from constructor
   * @param {Object|null} overrides - Caller opts.audio (may be null)
   * @returns {Object} Frozen merged audio block
   */
  function _mergeAudio(defaults, overrides) {
    if (!overrides) return Object.freeze(defaults);
    return Object.freeze({
      musicId:    overrides.musicId    !== undefined ? overrides.musicId    : defaults.musicId,
      muffleHz:   overrides.muffleHz   !== undefined ? overrides.muffleHz   : defaults.muffleHz,
      bgmVolume:  overrides.bgmVolume  !== undefined ? overrides.bgmVolume  : defaults.bgmVolume,
      ambientBed: overrides.ambientBed !== undefined ? overrides.ambientBed : defaults.ambientBed
    });
  }

  function _mergeTileTable(defaults, overrides) {
    if (!overrides) return defaults;
    if (!defaults) return overrides;
    var merged = {};
    var keys = Object.keys(defaults);
    for (var i = 0; i < keys.length; i++) {
      merged[keys[i]] = defaults[keys[i]];
    }
    keys = Object.keys(overrides);
    for (var i = 0; i < keys.length; i++) {
      merged[keys[i]] = overrides[keys[i]];
    }
    return Object.freeze(merged);
  }

  /**
   * Darken a hex color string by a factor (0–1).
   * @param {string} hex - '#rrggbb' or '#rgb'
   * @param {number} factor - 0 = black, 1 = unchanged
   * @returns {string} '#rrggbb'
   */
  function _darken(hex, factor) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    var r = Math.round(parseInt(hex.substring(0, 2), 16) * factor);
    var g = Math.round(parseInt(hex.substring(2, 4), 16) * factor);
    var b = Math.round(parseInt(hex.substring(4, 6), 16) * factor);
    return '#' + ('0' + r.toString(16)).slice(-2) +
                 ('0' + g.toString(16)).slice(-2) +
                 ('0' + b.toString(16)).slice(-2);
  }

  function _fogToCSS(fog) {
    return 'rgb(' + fog.r + ',' + fog.g + ',' + fog.b + ')';
  }

  return {
    // Constructors
    exterior: exterior,
    interior: interior,
    nestedDungeon: nestedDungeon,

    // Queries
    getWallHeight: getWallHeight,
    computeDoorHeights: computeDoorHeights,
    resolveDistantWall: resolveDistantWall,
    getFogFactor: getFogFactor,
    getGradients: getGradients,
    getParallax: getParallax,
    getAudio: getAudio,
    getTileHeightOffset: getTileHeightOffset,
    getTexture: getTexture,
    getTileFreeform: getTileFreeform,
    getFloorTexture: getFloorTexture
  };
})();
