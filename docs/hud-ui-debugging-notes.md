

we have the hud frames around the screen then we have the 3d viewport. we need the minimap to be imbedded in the hud frames so that it's showing the map in real time, with a tiny icon for it's expanded overlay state.



the floor number is being displayed in the 3d viewport and the hud, we only need it in the hud around the minimap.



the batteries is being displayed in the 3d viewport and the hud, we only need it in the hud



we have a nch overlay widget featuring a stack of cards representing the number of cards in the hand, this overlay has a capsule border and redundant text, we could do with just the emoji card symbols and their behavior; no text, no capsule background.



clicking "bag" in the bottom left of the hud opens the bag menu but clicking it again doesn't close the bag menu



the map button in the bottom left should be removed once we clean up all the other navigational buttons and condense them



there's a random floating map button in the middle of the 3d viewport



the debrief button on the hud seems unnecessary



we need to look back at dcexjam2025 HUD, it has directional buttons and an animated hud map that we need. i'm also under the impression that glov.js in dcexjam2025 enables the player to click the expanded minimap and that gives the player a pathing queue (just like gone-rogue fishing mechanic. we need this click on revealed minimap tiles to move functionality)



we have a footer across the bottom of the hud that needs to be about 4x thicker to account for a tooltip row with a history expandable. info such as loot, npc barks and dialogue, the door transition text from the peek, all needs to be printing to the tooltip footer with expandable history. let's look at Eyesonly for their tooltip example. we're also following the dialogue system similarly so the document eysonly/docs/TOOLTIP_SPACE_CANON.md is somewhat applicable.