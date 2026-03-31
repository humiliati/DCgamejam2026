Roadmap — remaining bonfire/hearth/fire polish:

Exterior campfire blockout (floorN bonfires) — C-shape of 3 SHRUB tiles (tile 22, already at 0.5× height) surrounding an EMPTY tile with a BONFIRE walkable center. Requires: placing the pattern in grid-gen.js instead of the current bare BONFIRE tile. Shrubs already render at half-height, so the visual reads as a hedge-ring campsite. Add a tent emoji next to a 🔥 sprite at the center position via the sprite rendering layer. ~30min.
Dungeon hearth bonfire — Place HEARTH (tile 29) in dungeon generation instead of BONFIRE. The riverrock texture already works at any wall height. Configure dungeon biome textures to map tile 29 to hearth_riverrock. Add tileWallHeights[29] = 1.0 for dungeons (shorter than the 1.6 home version). ~15min.


Fire emoji sprite overlay — Render a floating 🔥 emoji above BONFIRE, BED, and inside HEARTH tiles (same system used for enemy sprites). Requires adding these tile types to the raycaster's sprite pass. The emoji would/could bob vertically, tilt on Y gently, glow, shift transparency slightly, rarely flash white like it's taking damage. spawn smaller flame sprites that scatter and bounce away when being interacted with.

Crackle audio — Wire AudioSystem.play('fire_crackle') as a proximity-based ambient loop when within 3 tiles of any bonfire/hearth. Requires: actual audio assets (blocked by Pass 7 audio port). Stub call can go in now. ~15min.

C:\Users\hughe\.openclaw\workspace\LG Apps\Games\DCgamejam2026\EyesOnly\MEDIA_ASSETS file needs to be encoded  (via ffmpeg?) then moved to the DCgamejam2026 C:\Users\hughe\.openclaw\workspace\LG Apps\Games\DCgamejam2026\media_assets\audio\sfx


Debrief feed incinerator integration — The debrief-feed.js already has DragDrop zone registration for its incinerator. Need to connect the drag-drop onDrop callback to the same card/item destroy + refund logic used by the click incinerator. Currently the drag path and click path are separate — unify them through a shared _incinerate(payload) function. ~30min.

Day/night cycle module — Not yet implemented. When built, it should: tick time on exterior/dungeon floors, freeze on contract.timeFreeze floors, display time in HUD, drive skybox color lerp, trigger curfew at 100%, and post work orders at dawn.


Bonfire visual distinction by depth — Exterior bonfires: warm orange glow, campfire sprite. Interior bonfires (home hearth): amber fireplace glow, smoke particles (post-jam). Dungeon bonfires: cool blue-grey stone hearth with flickering orange. Differentiation helps the player read safety level at a glance.