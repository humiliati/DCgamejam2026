/**
 * Book catalog - Layer 5 data file.
 *
 * Self-registers with BookshelfPeek at load time, bypassing the XHR
 * path that fails silently on file:// in Chromium-based browsers.
 * Source of truth: this file IS the book data (books.json is retired).
 */
BookshelfPeek.registerCatalog({
  "meta": {
    "version": 1,
    "description": "Book and document data for bookshelf peek interactions. Each entry has a unique id, a display title, an emoji icon, and one or more pages of text. Books are assigned to bookshelves via floor data (floorData.books[]).",
    "schema": {
      "id": "string — unique stable identifier",
      "title": "string — display title shown at top of peek overlay",
      "icon": "string — emoji shown on the bookshelf tile and in peek header",
      "category": "string — 'tip' | 'lore' | 'manual' | 'letter' | 'notice' | 'journal' | 'fiction'",
      "pages": ["array of strings — each string is one page of text"],
      "biome": "string — which building biome this book belongs to (for random assignment)"
    }
  },
  "books": [
    {
      "id": "tip_movement_basics",
      "title": "Gleaner's Field Manual - Movement",
      "icon": "📘",
      "category": "tip",
      "pages": [
        "WASD or arrow keys to move.\nQ/E to strafe left and right.\nHold SHIFT to move faster when the queue is clear.",
        "Bump into a wall to hear a sound.\nBump into an NPC to start a conversation.\nFace a door and press OK to enter."
      ],
      "biome": "guild"
    },
    {
      "id": "tip_crate_restock",
      "title": "Gleaner's Field Manual - Restocking",
      "icon": "📘",
      "category": "tip",
      "pages": [
        "Approach a broken crate and press OK to open the restock interface.",
        "Drag items from your bag into the empty slots.\nMatch the suit symbol for a bonus payout.\nFill all slots and press S to seal."
      ],
      "biome": "guild"
    },
    {
      "id": "tip_cleaning",
      "title": "Gleaner's Field Manual - Cleaning",
      "icon": "📘",
      "category": "tip",
      "pages": [
        "Dirty tiles have a grime overlay.\nFace the tile and press OK to scrub.",
        "Each sweep clears one layer of grime.\nClean all tiles on a floor to reach 100% cleanliness.\nThe Guild pays per percentage point."
      ],
      "biome": "guild"
    },
    {
      "id": "tip_combat",
      "title": "Gleaner's Field Manual - Self Defence",
      "icon": "📘",
      "category": "tip",
      "pages": [
        "Combat is card-based. Your hand is drawn from your deck.",
        "Each card has a suit (♣ ♦ ♠ ♥) and a power value.\n♣ beats ♦, ♦ beats ♠, ♠ beats ♣.\n♥ heals instead of attacking.",
        "Play cards wisely - your deck is small.\nRetreat is always an option."
      ],
      "biome": "guild"
    },
    {
      "id": "tip_time_pressure",
      "title": "Gleaner's Field Manual - Time & Curfew",
      "icon": "📘",
      "category": "tip",
      "pages": [
        "The day cycle runs on a real-time clock.\nDawn → Day → Dusk → Night → Curfew.",
        "If you're not home by curfew, you collapse.\nYou'll wake up groggy with debuffs.\nNo coin penalty - but a wasted day.",
        "Building interiors are safe havens.\nTime does NOT advance while you're inside a building.\nTake your time browsing shops and reading."
      ],
      "biome": "guild"
    },
    {
      "id": "lore_dragon_history_1",
      "title": "A Brief History of the Boardwalk Dragons",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "The dragons arrived before the town.\nBefore the boardwalk, before the first pier was hammered into the cliff face.",
        "They nested in the caves below - the same caves we now call dungeons.\nThe first settlers struck a deal: protection in exchange for territory.",
        "That deal held for four hundred years.\nUntil the heroes came."
      ],
      "biome": "inn"
    },
    {
      "id": "lore_dragon_history_2",
      "title": "The Dragon Compact - Chapter 7",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "The Compact was simple:\nDragons guard the deep floors. Humans maintain the upper halls.",
        "No dragon enters the town. No human enters the nesting chambers.\nThe dungeons between are neutral ground - maintained by both sides.",
        "The Gleaner's Guild was founded to uphold the human half.\nWe clean. We restock. We keep the traps sharp.\nThe dragons do the rest."
      ],
      "biome": "inn"
    },
    {
      "id": "lore_hero_arrival",
      "title": "When the Heroes Came",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "They arrived on the ferry - six of them, armoured and loud.",
        "The Guild Master tried to explain the Compact.\nThey laughed. 'Dragons are monsters,' they said.\n'Monsters get slain.'",
        "Three days later, the first dragon fell.\nThe caves shook. The boardwalk cracked.\nAnd the Guild's work doubled overnight."
      ],
      "biome": "inn"
    },
    {
      "id": "notice_work_order_template",
      "title": "WORK ORDER - Template",
      "icon": "📋",
      "category": "notice",
      "pages": [
        "GLEANER'S GUILD - WORK ORDER\n═══════════════════════════",
        "Floor: _______________\nTarget Readiness: ___%\nDeadline: Day __ of hero cycle\n\nTasks:\n☐ Sweep all corridors\n☐ Restock crates (min 4)\n☐ Re-arm traps\n☐ Clear corpse material",
        "Payment: ___ coins on completion\nBonus: +50% if 100% readiness\nPenalty: None (but the Guild remembers)"
      ],
      "biome": "guild"
    },
    {
      "id": "notice_curfew_policy",
      "title": "NOTICE - Curfew Policy",
      "icon": "📋",
      "category": "notice",
      "pages": [
        "BY ORDER OF THE BOARDWALK COUNCIL\n\nAll operatives must return to quarters\nbefore the night bell tolls.",
        "Failure to comply results in:\n• Involuntary rest (collapse in place)\n• Morning debuffs (GROGGY, SORE)\n• A stern look from the Dispatcher",
        "The Council reminds all Gleaners:\nthe dungeons do not care about your schedule.\nBut the curfew does."
      ],
      "biome": "guild"
    },
    {
      "id": "letter_anonymous_tip",
      "title": "Unsigned Letter",
      "icon": "✉️",
      "category": "letter",
      "pages": [
        "Gleaner,",
        "The heroes are not what they seem.\nAsk yourself: who hired them?\nWho benefits when the dragons fall?",
        "Look deeper. The answers are in the caves.\n\n- A Friend"
      ],
      "biome": "home"
    },
    {
      "id": "manual_bar_drinks",
      "title": "Driftwood Inn - Drink Menu",
      "icon": "🍺",
      "category": "manual",
      "pages": [
        "☕ BOARDWALK BREW - Restores 1 energy\n🍺 DEEP ALE - +5% move speed (1 floor)\n🧃 CORAL TONIC - Clears 1 debuff",
        "All drinks are complimentary for Guild operatives.\nLimit: 3 per visit. The barkeep is watching."
      ],
      "biome": "inn"
    },
    {
      "id": "manual_bazaar_guide",
      "title": "Coral Bazaar - Vendor Directory",
      "icon": "🗺️",
      "category": "manual",
      "pages": [
        "TIDE FACTION - Magical supplies\n  Potions, scrolls, enchanted cleaning agents",
        "EMBER FACTION - Combat equipment\n  Weapons, armour, combat cards",
        "ROOT FACTION - Natural remedies\n  Food, herbs, antidotes, energy restoratives"
      ],
      "biome": "bazaar"
    },
    {
      "id": "journal_operative_brief",
      "title": "Guild Personnel File - Operative Gleaner (Classification 4-C)",
      "icon": "📋",
      "category": "journal",
      "pages": [
        "PERSONNEL FILE - GLEANER'S GUILD\nClassification: Tier 4 Civic Contractor\nStatus: Active\n\nThe operative was assigned standard duties under the Guild's maintenance protocols. Role encompasses hero facilitation, floor maintenance, and timely execution of all reset cycles.",
        "Work order assignments are issued by the Guild Dispatcher on a rolling three-day cycle. The operative's compliance record to date is noted as satisfactory. No disciplinary actions on file.",
        "Non-disclosure requirements apply per standard agreement. Note from Oversight: all sub-depth inquiries from this operative are to be redirected to Guild Oversight, not the field Dispatcher. Flag for monitoring if pattern continues."
      ],
      "biome": "home"
    },
    {
      "id": "journal_contract_terms",
      "title": "Guild Records - Standard Employment Contract (Filed Copy)",
      "icon": "📋",
      "category": "journal",
      "pages": [
        "GLEANER'S GUILD - FILED CONTRACT COPY\nContractor: [Operative Gleaner]\n\nArticle I - Duties: Maintenance, restock, and cleaning functions within designated floor zones. Assignments issued by Guild Dispatcher on a rolling three-day cycle. Equipment to be maintained in Guild-certified condition.",
        "Article II - Compensation: Per completed floor reset, per cleaned tile (0.4c), per restocked crate (2c base, suit-match bonus applies). Hazard pay available for active combat zones. Guild dues deducted at 8% of gross.\n\nNote: this operative's hazard pay has been approved for floors 1.3.1 and below.",
        "Article III - Non-Disclosure: The operative may not disclose contents of any chamber below depth 2.0 without Oversight Board authorization. Removal, copying, or transmission of Providence Codex materials (Admiralty Classification Registry, Section 9) is grounds for immediate termination.\n\n[Stamp: FILED - GUILD RECORDS OFFICE]"
      ],
      "biome": "home"
    },
    {
      "id": "journal_field_notes_day1",
      "title": "Dispatcher's Log - New Operative Intake (Day 1)",
      "icon": "📓",
      "category": "journal",
      "pages": [
        "DISPATCHER'S FIELD LOG\nRe: New operative (Gleaner classification)\n\nThe new operative arrived at dawn. Initial assessment: competent, quiet, follows instructions. Assigned standard orientation route. First impressions of the dungeon floors were notably negative - the operative was not prepared for the state heroes leave behind. Standard reaction.",
        "Flagging: The Foundry Collective rep was observed near the armory district when the operative returned from the first run. The Tide Council vendor in the Bazaar reportedly asked the operative about 'unusual finds' - twice. The operative reported both interactions unprompted. This is either admirable honesty or a test. Monitoring."
      ],
      "biome": "home"
    },
    {
      "id": "journal_field_notes_week1",
      "title": "Dispatcher's Log - Operative Assessment (Week 1)",
      "icon": "📓",
      "category": "journal",
      "pages": [
        "DISPATCHER'S FIELD LOG - WEEK 1 REVIEW\n\nHero throughput this week: three separate teams cleared B1. Restock demand exceeds the cycle budget by approximately 40%. The operative has maintained schedule despite the overload. Contract pricing does not reflect actual workload - noted for Oversight review.",
        "Incident: An Admiralty representative was observed delivering a sealed crate from B2 to the Moonpetal. The crate bore Tide Council registry marks - standard artifact transfer paperwork. This is irregular for a medical supply route. The operative noticed and reported without prompting.",
        "The Tide Council vendor continues to ask operatives about 'unusual finds.' This is the third report this week. The Guild advisory on external investigators uses the phrase 'standard narrative' - the operative flagged this language as unusual. Recommend continued monitoring. This one pays attention."
      ],
      "biome": "home"
    },
    {
      "id": "journal_hero_file",
      "title": "Guild Oversight - Active Surveillance File: 'The Seeker'",
      "icon": "📓",
      "category": "journal",
      "pages": [
        "GUILD OVERSIGHT - SURVEILLANCE FILE\nSubject designation: 'The Seeker'\nStatus: ACTIVE - elevated monitoring\n\nSubject is a foreign national with no verified affiliation on record. Operating under a provisional Guild license, Foundry-sponsored tier. Behavior profile: methodical, intelligence-led, not trophy-focused. Three dungeon runs completed in the first week. Loot recovery minimal. Dragon location intelligence appears to be the primary objective.",
        "Assessment: Subject is not a standard hero. Pattern analysis indicates a target list, not an adventure itinerary. Foundry field representative sightings correlate with the Seeker's dungeon entry dates - recommend cross-referencing Foundry dispatch logs.\n\nNote: The operative assigned to this floor rotation has overlapped with the Seeker twice. No contact reported. Maintain separation.\n\n[Filed by: Guild Oversight, Week 1]"
      ],
      "biome": "dungeon_drop"
    },
    {
      "id": "lore_coralshore_founding",
      "title": "Coralshore: A Brief Civic History",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "The founding of Coralshore is generally dated to Year 1 of the Civic Calendar, though historians note that this date refers to the first formal settlement charter rather than initial habitation of the site. The coastal cliffs above the current Promenade show evidence of pre-settlement occupation.",
        "The first settlers found the cave system below the cliffs occupied but welcoming. The Dragon Compact was formalized in Year 1 as the town's founding legal document. The Gleaner's Guild was established in Year 2, becoming one of the oldest civic institutions in the region.",
        "Coralshore has since grown into a model settlement: commerce on the surface, tradition below, and the Guild maintaining the balance between them. The town's long prosperity is frequently attributed by local scholars to the stability of the Compact."
      ],
      "biome": "inn"
    },
    {
      "id": "lore_the_compact_annotated",
      "title": "The Dragon Compact - Annotated Edition",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "Let it be known that the entities of the lower chambers and the citizens of the surface have reached an accord, to be maintained in perpetuity and upheld by a Guild of appointed stewards. [Ed. note: 'Entities' is the term used in the original document. The beings are not named. This imprecision is unusual in a founding legal text.]",
        "The obligations of each party are as follows. The entities of the lower chambers shall maintain the integrity of the deep floors and shall not ascend to the surface without invitation. The surface citizens shall maintain the transitional zones and shall not descend past the first chamber without Guild escort. [Ed. note: Guild escort provisions were quietly amended in Year 47 to allow academic expeditions.]",
        "Historians note the unusual precision of the Compact's language, which reads as the work of legal scholars rather than frontier diplomats. The Admiralty's founding Coralshore chapter was established in the same calendar year as the Compact. Whether this is coincidence or coordination, the record does not specify."
      ],
      "biome": "inn"
    },
    {
      "id": "lore_gleaner_guild_charter",
      "title": "The Gleaner's Guild - Founding Charter, Year 2",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "Be it known that the Gleaner's Guild is hereby established to serve the purposes of the Dragon Compact, to maintain the readiness of all transitional zones, and to provide trained stewards for the ongoing obligations of the surface-dwelling parties to the Compact.",
        "Guild members are reminded that their work serves not commerce but Compact. The maintenance of these halls is a civic and legal obligation, not a labor contract. The Guild exists to fulfill a promise made to all parties at the founding of this settlement."
      ],
      "biome": "guild"
    },
    {
      "id": "lore_adventuring_economy",
      "title": "The Adventuring Economy: A Survey",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "The adventuring trade has grown from a small-scale local enterprise into Coralshore's primary export industry over the last forty years. Hero licensing, equipment sales, dungeon-route mapping, and post-expedition artifact recovery together now represent approximately 60% of all registered commercial activity.",
        "The Foundry Collective's expansion into hero sponsorship, beginning approximately thirty years ago, is widely credited with professionalizing the trade. Sponsorship contracts standardized equipment, introduced liability frameworks, and created a reliable recruitment pipeline from the wider region.",
        "Some economists have noted the curious correlation between Foundry Collective expansion into new regional markets and the subsequent increase in dragon sighting reports from those same areas. The Guild has attributed this to improved documentation practices. We leave further interpretation to the reader."
      ],
      "biome": "bazaar"
    },
    {
      "id": "lore_dragon_naturalis",
      "title": "On the Natural Philosophy of the Deep Dwellers",
      "icon": "📖",
      "category": "lore",
      "pages": [
        "The deep-dwelling specimens of Coralshore's lower chambers present a fascinating study in biological longevity. Examination of recovered specimens - cross-referenced with historical Compact documentation - suggests a natural lifespan significantly exceeding any comparable organism currently catalogued by the Guild's natural philosophy committee.",
        "Organ structure in the deep-dwelling specimens reflects a degree of biological complexity that resists simple taxonomic classification. Tissue compatibility with standard preservation reagents is notably high, suggesting shared biochemical ancestry with surface organisms. The practical applications of this compatibility are under ongoing review by the Admiralty's medical research division.",
        "Behavioral observation records from Years 1 through 44 - compiled before chamber access was restricted - indicate a degree of social intelligence in the deep-dwelling specimens inconsistent with the 'instinctive predator' classification currently used in Guild training materials. A formal reclassification proposal, submitted in Year 44 on the basis of these first-generation records, was declined by the Admiralty Oversight Board. Chamber access was restricted the following year. [REMAINDER OF SECTION REDACTED - ADMIRALTY BOARD, YEAR 45]"
      ],
      "biome": "dungeon"
    },
    {
      "id": "lore_history_of_heroes",
      "title": "A History of the Hero Trade in Coralshore",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "The first formal adventuring company operating in Coralshore - The Breakwater Company - was established eighty years ago. At that time, the concept of professional dragon-hunting was largely unknown; the Company's initial charter described its purpose as 'exploration and recovery of sub-surface resources.'",
        "The Foundry Collective opened its Coralshore armory the same year as the Breakwater Company's founding. Contemporary records do not document any formal relationship between the two. What is documented: The Breakwater Company's founding investors included several entities that later reorganized as Foundry subsidiaries.",
        "The earliest hero recruits came with letters of recommendation from Foundry representatives. Guild records from that period describe this as a 'professional courtesy arrangement.' Contemporary historians have found the arrangement's persistence across three generations more difficult to characterize as mere courtesy."
      ],
      "biome": "inn"
    },
    {
      "id": "letter_foundry_field_report",
      "title": "Foundry Collective - Field Bulletin 7-C",
      "icon": "📄",
      "category": "letter",
      "pages": [
        "Dragon event confirmed, Hero's Wake Floor B2. Harvest window estimated 48 hours from confirmed time of kill. Procurement team to coordinate with Tide Council receiving agent - confirm cache location before transfer. Reminder: the Moonpetal contract specifies whole tissue only; partial specimens will not be accepted at standard rate. The Guild Gleaner assigned to this rotation has not been briefed on procurement protocols. Keep it that way."
      ],
      "biome": "dungeon_drop"
    },
    {
      "id": "letter_guild_memo_redacted",
      "title": "GUILD MEMO - RESTRICTED - OVERSIGHT BOARD ONLY",
      "icon": "📄",
      "category": "letter",
      "pages": [
        "MEMO - OVERSIGHT BOARD CIRCULATION ONLY\nRE: Active [REDACTED] Protocol Status\n\nThe [REDACTED] protocol has been suspended pending Oversight review. Field operatives assigned to [REDACTED] floors should not be informed of the suspension. Standard work orders will continue. Any anomalous findings reported by field operatives should be escalated to [REDACTED] before entering the standard incident log.",
        "The Compact's [REDACTED] provisions remain in effect regardless of protocol status. Handler [REDACTED] has been notified and confirms continued monitoring. Oversight Board members are reminded that discussion of this memo outside of Board sessions is a contract violation. Archive and destroy field copies after seven days."
      ],
      "biome": "dungeon_drop"
    },
    {
      "id": "letter_seeker_journal_fragment",
      "title": "Torn Journal Page",
      "icon": "📄",
      "category": "letter",
      "pages": [
        "Day 14 in Coralshore. The dragon was not where the intelligence said it would be. When I reached the B2 cache point, the chamber had been cleaned. Not destroyed - cleaned. Equipment restocked. Traps reset. Someone had been here within the last 24 hours and tidied the evidence.",
        "The 'monster reports' that brought me here were fabricated, or at least significantly embellished. The Guild janitor has been appearing at confirmed sites before my team arrives. Either this person is extraordinarily thorough, or they are being guided to these sites the same way I am being guided - and neither of us is seeing the full map."
      ],
      "biome": "dungeon_drop"
    },
    {
      "id": "letter_father_ashworth",
      "title": "Letter: F. Ashworth to the Inner Twelve",
      "icon": "📄",
      "category": "letter",
      "pages": [
        "Brothers, I will not dissemble. The arithmetic is clear. At the current hero cycle rate, the last Compact-protected specimens in the deep chambers will not survive another three years. I am proposing, for the final time, that we release the Providence Codex. Let the world know what the dragons are. Let the trade collapse. Yes, the Foundry will retaliate. Yes, the Tide Council will howl. But I was not brought into this order to preside over an extinction we engineered. I will not put my seal on another harvest ledger. - F.A."
      ],
      "biome": "dungeon_drop"
    },
    {
      "id": "letter_dr_yuen_notes",
      "title": "Research Notes - Dr. K. Yuen (Last Entry)",
      "icon": "📄",
      "category": "letter",
      "pages": [
        "I have spent three years documenting longevity anomalies in the deep specimens. I believed I was contributing to a study of natural lifespan extension. I was wrong about the word 'natural.' I was wrong about the word 'study.' I have reviewed the Catacomb transfer logs from the last forty years. The specimens do not leave the Catacombs alive.",
        "The Lamplit Catacombs are not a museum or a research facility. They are an abattoir with academic credentials. I am leaving these notes where I hope a curious and careful person finds them. Not a scholar - scholars here are the problem. A worker. Someone who comes through these halls and pays attention. Do not let them take these pages."
      ],
      "biome": "dungeon_drop"
    },
    {
      "id": "letter_agent_crow_report",
      "title": "Crow Report 22 - Eyes Only",
      "icon": "📄",
      "category": "letter",
      "pages": [
        "Weekly surveillance summary. Guild Gleaner: routine maintenance, no deviations from standard protocol, low threat classification maintained. May have accessed the Yuen materials in B2 - flagging for follow-up, non-urgent. The Seeker: threat level elevated. Running independent location grids that do not match our provided intelligence. Recommend Foundry consider interdiction before B2 access. Additional note: the Necromancer's restock schedules are irregular. Someone is maintaining a live holding area below the standard floor map. Investigating."
      ],
      "biome": "dungeon_drop"
    },
    {
      "id": "letter_handler_vala",
      "title": "Vala Dispatch - Encrypted (Partial Decrypt)",
      "icon": "📄",
      "category": "letter",
      "pages": [
        "[PARTIAL DECRYPT - CIPHER KEY INCOMPLETE]\nGLEANER - if you are reading this, you found the second key. The Guild Oversight Board is not the institution described in the founding charter. Your Dispatcher is honest and uninformed. These are not the same thing.\n[GARBLED - 4 LINES]\nYour work matters more than your contract describes.",
        "[DECRYPT RESUMES]\nLook for the Providence Codex. It exists. It will be held somewhere you would not expect a document of that significance to be stored - somewhere that looks like maintenance, not archives. Do not trust the [GARBLED]. Do not contact me through Guild channels.\n- V."
      ],
      "biome": "watchpost"
    },
    {
      "id": "notice_coralshore_fauna_ordinance",
      "title": "Coralshore Municipal Ordinance #47 - Subsurface Fauna Regulation",
      "icon": "📋",
      "category": "notice",
      "pages": [
        "MUNICIPAL ORDINANCE #47\nRegulation of Deep-Dwelling Fauna - Extraction, Transport, and Commercial Handling\n\nAll extraction, transport, and commercial sale of biological material originating from classified subsurface zones (defined as any chamber below depth 2.0 as measured by the Guild Oversight Board's official depth register) must be coordinated through the Guild and logged with the Municipal Trade Office within 48 hours of recovery.",
        "Specimens designated under the Providence Codex are subject to special handling protocols as defined by the Admiralty Oversight Board. Commercial handling of Providence Codex specimens without written Admiralty authorization is a Class 2 Civic Violation. Guild operatives are reminded to report any recovered material to their Dispatcher rather than directly to private buyers."
      ],
      "biome": "guild"
    },
    {
      "id": "notice_guild_foreign_investigators",
      "title": "Guild Advisory - Handling of External Investigators",
      "icon": "📋",
      "category": "notice",
      "pages": [
        "GUILD ADVISORY - ALL FIELD OPERATIVES\nRE: Inquiries from Non-Guild Investigators\n\nOperatives are advised that external investigators - including independent researchers, foreign trade representatives, and unsponsored heroes - may be conducting inquiries in the Coralshore area during the current season. Guild policy is as follows: cooperate fully with surface-level inquiries; do not escort external parties to subsurface zones without Oversight Board authorization.",
        "If an external investigator asks about 'dragon activity' or 'Compact provisions,' operatives should provide the standard narrative as outlined in Guild Bulletin 4 and redirect to the Dispatcher's public intake. Do not discuss deep-floor inventory, reset schedules, or the contents of any crate marked with a Tide Council registry number. If in doubt, say nothing and report the inquiry."
      ],
      "biome": "guild"
    },
    {
      "id": "notice_tide_council_artifact_prices",
      "title": "Tide Council Market - Premium Item Registry (Season 4)",
      "icon": "📋",
      "category": "notice",
      "pages": [
        "TIDE COUNCIL PREMIUM REGISTRY - SEASON 4\n\nArtifact Grade: Standard Surface Recovery\nCeramic fragments (pre-Compact): 8c/unit\nMetalwork (unidentified origin): 12–18c/unit\nInscribed stonework: 22c/unit\nWeapon fragments (hero-grade): 5c/unit",
        "Artifact Grade: Subsurface - Special Handling\nDragon-scale fragments (unprocessed): 40c/unit\nDeep structural fragments (confirmed sub-depth 2.0): 55c/unit\nPreserved tissue samples (sealed vial, Guild-certified): PRICE ON REQUEST\nCompact artifacts (pre-Year 300, Admiralty provenance): ADMIRALTY CONTRACT ONLY\n\nAll special handling inquiries to the Senior Factor. No walk-in pricing."
      ],
      "biome": "bazaar"
    },
    {
      "id": "notice_hero_registration",
      "title": "Hero Registration Requirements - Coralshore Guild Office",
      "icon": "📋",
      "category": "notice",
      "pages": [
        "HERO LICENSING - REQUIREMENTS FOR REGISTRATION\n\nAll individuals wishing to operate as licensed heroes in Coralshore must complete the following: (1) Submit proof of combat certification from a recognized institution. (2) Disclose any sponsoring organization. (3) Complete Guild safety orientation. (4) Pay the licensing fee (12c standard, 6c reduced for Guild members).",
        "Approved sponsoring organizations include: The Foundry Collective (Premier Sponsor), The Driftwood Adventuring Society, and individual Guild members in good standing. Please note: heroes sponsored by the Foundry Collective are subject to additional procurement reporting requirements as per the Foundry's standard rider agreement. See the Dispatcher for details."
      ],
      "biome": "guild"
    },
    {
      "id": "manual_admiralty_handbook",
      "title": "The Scholar's Companion - Admiralty Field Reference, Vol. III",
      "icon": "📖",
      "category": "manual",
      "pages": [
        "CHAPTER 7 - SPECIMEN CATALOGUING BY DEPTH ZONE\n\nSpecimens recovered from surface zones (depth 0–1.0) should be catalogued by morphological type using the standard Admiralty species register. Attach recovery location, approximate age, and condition notes. Label with the Guild certification stamp if Guild personnel were present at recovery.",
        "For specimens recovered from transitional zones (depth 1.0–2.0), apply standard tissue preservation protocols before cataloguing. Vial sealing must be completed within six hours of recovery to maintain sample integrity. Ship to Moonpetal Apothecary receiving bay within the 48-hour transfer window.",
        "For specimens found in chambers below depth 3.0 - catalogued as Provisional Compact Status - do not disturb without explicit Board authorization. Our mission is documentation, not intervention. If a specimen below depth 3.0 is encountered alive and exhibiting social behavior, withdraw and file a Level 1 observation report. Do not initiate contact. Do not take samples."
      ],
      "biome": "watchpost"
    },
    {
      "id": "manual_adventurer_quarterly",
      "title": "The Adventurer's Quarterly - Issue 52",
      "icon": "📖",
      "category": "manual",
      "pages": [
        "THIS SEASON'S DESTINATION: CORALSHORE!\n\nLooking for a premier dragon-hunting destination with professional support, fresh dungeon resets every three days, and the best gear money can buy? Coralshore is THE address this season. The Gleaner's Guild ensures every floor is reset and restocked before you arrive - no cold trails, no depleted caches. Just clean halls and live targets.",
        "GEAR SPOTLIGHT: The Foundry Collective's new Dragonsteel kit comes with a full season's service contract and a Coralshore dungeon-route map updated by Foundry field representatives. Pair it with a Foundry sponsorship rider and your procurement reporting is handled - you hunt, we handle the rest. Contact your nearest Foundry representative. Adventurer's Quarterly is a proud Foundry Collective publication."
      ],
      "biome": "inn"
    },
    {
      "id": "manual_foundry_contract_terms",
      "title": "Foundry Collective - Hero Sponsorship Agreement",
      "icon": "📖",
      "category": "manual",
      "pages": [
        "FOUNDRY COLLECTIVE SPONSORSHIP AGREEMENT - STANDARD TIER\n\nThe Foundry Collective agrees to provide the sponsored hero with: equipment at cost, dungeon intelligence briefings, field support contact, and procurement coordination services. In exchange, the hero agrees to: complete all assigned runs within the designated season window, report all significant organic finds to the assigned Foundry field representative within 12 hours.",
        "The hero further agrees to: accept procurement guidance from Foundry field agents when guidance is provided, prioritize dragon-class encounters over other targets when Foundry intelligence identifies an active site, and maintain confidentiality regarding the specific terms of this agreement. Violations of the procurement reporting clause void all equipment provisions retroactively. Standard contract term: one season."
      ],
      "biome": "dungeon_drop"
    },
    {
      "id": "tip_bazaar_shopping",
      "title": "How to Buy and Sell - A Visitor's Guide",
      "icon": "📘",
      "category": "tip",
      "pages": [
        "Welcome to the Coral Bazaar!\n\nFace a vendor and press OK to open the shop.\nBrowse with A/D. Buy with OK. Exit with Escape.",
        "Vendors sell cards in their faction's suit.\nTide Council: ♥ Hearts - healing and magic.\nThe Foundry: ♦ Diamonds - gear and combat.\nThe Admiralty: ♣ Clubs - defence and tactics.",
        "Tip: Check the card's power value AND suit.\nA high-power card in the wrong suit won't\nwin against the right counter.\nBuild a balanced deck - don't go all-in on one suit."
      ],
      "biome": "bazaar"
    },
    {
      "id": "tip_inn_bonfire",
      "title": "The Bonfire - Rest & Recovery",
      "icon": "📘",
      "category": "tip",
      "pages": [
        "The bonfire at the Driftwood Inn restores\nyour health to full and clears most debuffs.",
        "Overheal: If you rest at the bonfire while\nalready at full health, you gain a temporary\nHP shield that absorbs the next hit.\n\nThe shield lasts until you take damage\nor leave the current floor.",
        "The inn is a safe zone - time does not\nadvance while you're inside. Take a moment.\nRead a book. Plan your next run."
      ],
      "biome": "inn"
    },
    {
      "id": "tip_home_schedule",
      "title": "Your Work Schedule - Day & Night",
      "icon": "📘",
      "category": "tip",
      "pages": [
        "GLEANER'S GUILD - SCHEDULE NOTICE\n\nThe day cycle runs while you're on exterior\nfloors. Dawn, Day, Dusk, Night, Curfew.",
        "Time STOPS inside buildings and dungeons.\nYou can browse shops, read books, and rest\nwithout burning daylight.",
        "Be home before curfew. If you collapse\non the street, you'll wake up groggy with\ndebuffs and a wasted day.\n\nYour bed is here. Use it."
      ],
      "biome": "home"
    },
    {
      "id": "tip_dispatch_protocol",
      "title": "Dungeon Assignment Protocol",
      "icon": "📘",
      "category": "tip",
      "pages": [
        "GLEANER'S GUILD - DISPATCH OFFICE\n\nThe Dispatcher assigns your dungeon runs.\nSpeak to the Dispatcher to receive your\ncurrent work order.",
        "Each work order specifies:\n• Target floor\n• Minimum readiness percentage\n• Deadline (in day-cycle units)\n\nComplete the order to receive payment.\nBonus coin for 100% readiness.",
        "Tip: Check the order BEFORE you descend.\nKnowing the target floor helps you plan\nwhich cards and supplies to bring.\n\nThe Dispatcher is honest. The work orders\nare real. What happens below... that's\nanother matter."
      ],
      "biome": "guild"
    },
    {
      "id": "fiction_ghost_of_pier_nine",
      "title": "The Ghost of Pier Nine",
      "icon": "👻",
      "category": "fiction",
      "pages": [
        "Everyone in Coralshore knows the story. Pier Nine collapsed in a storm thirty years ago, taking old Montague the net-mender with it. They rebuilt the pier. Montague was less cooperative.\n\nHe appears at low tide, they say. Sitting on the end of the new pier, mending a net that isn't there. If you speak to him, he'll ask if you've seen his best needle - a bone needle, carved from something he'd never name.",
        "The night watch tried to exorcise him once. Brought a Tide Council scholar, two candles, and a bell. Montague listened politely to the entire ritual, then asked the scholar if she'd seen his needle.\n\nThe scholar said no.\n\nMontague said, 'Typical. Nobody takes care of anything anymore.'\n\nThen he vanished. The scholar filed a report. The report was three pages long and concluded that Montague was 'non-threatening but administratively frustrating.'",
        "Some nights, if the tide is very low and the moon is right, you can hear the sound of mending - a soft, rhythmic clicking from the end of Pier Nine. The night watch has learned to ignore it.\n\nBut occasionally, a gleaner working the late shift will find a small bone needle on the boardwalk, placed carefully where someone would see it. By morning it's always gone.\n\nMontague is still looking. Coralshore is still not helping.\n\n- Collected Boardwalk Folk Tales, Vol. 3 - "
      ],
      "biome": "inn"
    },
    {
      "id": "fiction_counting_rhyme",
      "title": "A Counting Rhyme for Young Gleaners",
      "icon": "🎒",
      "category": "fiction",
      "pages": [
        "One for the crate that the hero broke,\nTwo for the trap that went up in smoke,\nThree for the wall with the scorch marks wide,\nFour for the monster that ran and hid,\nFive for the coin at the bottom of the pile,\nSix for the gleaner who swept every tile.",
        "Seven for the dragon who sleeps below,\nEight for the secret that no one should know,\nNine for the door that you must not try,\nTen for the reason nobody says why.\n\nClean your floors and count your pay,\nBe home before the end of day.\nGood gleaners sweep and good gleaners rest.\nGood gleaners never ask what's in the chest.\n\n- Traditional. Sung by Coralshore children since Year 80. - "
      ],
      "biome": "home"
    },
    {
      "id": "fiction_tides_of_passion",
      "title": "Tides of Passion, Vol. VII - The Harbour Master's Secret",
      "icon": "💕",
      "category": "fiction",
      "pages": [
        "Chapter Fourteen: The Storm\n\nMarina clutched the railing as the pier groaned beneath her. 'You cannot leave,' she said, rain plastering her hair to her face. 'Not tonight. Not after what happened at the lighthouse.'\n\nThe harbour master turned slowly. His jawline could have been carved from the same coral that lined the boardwalk. 'What happened at the lighthouse,' he said, 'was a mistake.'\n\n'A mistake?' Her voice broke. 'You call three consecutive evenings of passionate inventory auditing a MISTAKE?'",
        "He removed his harbour master's cap and held it to his chest. 'Marina. I am the harbour master. You are the assistant harbourmaster. The bylaws are clear - Section 14, Paragraph 9: No romantic entanglements between harbour staff during active tidal advisories.'\n\n'Damn your bylaws, Castellan!' She seized a nearby mooring rope for emphasis. 'Damn them to the deep!'\n\nSomewhere behind them, a seagull cried. It was, Marina reflected, the most romantic seagull she had ever heard.",
        "He stepped closer. The rain intensified, as it always did during moments of emotional significance. 'There's something I never told you,' he whispered. 'I'm not just a harbour master.'\n\n'What do you mean?'\n\n'I'm also...'\n\nHe paused. The seagull cried again.\n\n'...a licensed ship chandler.'\n\nMarina gasped. A ship chandler AND a harbour master? The raw administrative power was almost too much to bear.\n\n- TO BE CONTINUED IN VOLUME VIII - "
      ],
      "biome": "inn"
    },
    {
      "id": "fiction_siren_of_coral_cove",
      "title": "The Siren of Coral Cove - A Drama in Three Acts",
      "icon": "🎭",
      "category": "fiction",
      "pages": [
        "ACT I, SCENE IV - THE FISHMONGER'S CONFESSION\n\n[Interior: a modest fishmonger's stall. CORWIN stands behind the counter, gutting a halibut with visible anguish. Enter DELPHINE, wearing an impractical evening gown.]\n\nCORWIN: Delphine! You shouldn't be here. If your father - the wealthy and disapproving fish merchant - were to see us- \n\nDELPHINE: My father can take his premium tuna and cast it into the harbour. I love you, Corwin. I love your modest stall. I love your economy-grade halibut.\n\nCORWIN: [tormented] Don't say that.",
        "DELPHINE: It's true! Every fibre of my being yearns for your discount seafood.\n\nCORWIN: But I am just a fishmonger, Delphine. A simple man who guts fish and occasionally has feelings. Your father controls the entire premium tuna market. What could I possibly offer you?\n\nDELPHINE: [seizing his halibut-stained hands] You could offer me TRUTH, Corwin. In a world of overpriced tuna, you are the only honest fish in the sea.\n\n[Thunder. Lightning. A cat knocks something off a shelf.]\n\nCORWIN: There's something you should know. I'm not just a fishmonger.",
        "DELPHINE: [breathless] What?\n\nCORWIN: I'm also... your father's secret business partner.\n\nDELPHINE: [staggering backward into a display of sardines] NO!\n\nCORWIN: I'm sorry. The premium tuna trade... it was too lucrative to resist.\n\nDELPHINE: You MONSTER! This halibut was a LIE!\n\n[She hurls a mackerel at him and exits weeping. CORWIN catches it. He looks at the mackerel. The mackerel looks back.]\n\nCORWIN: [quietly] She's right. I've become everything I gutted against.\n\n- END OF ACT I - "
      ],
      "biome": "bazaar"
    },
    {
      "id": "fiction_boardwalk_confessions",
      "title": "Beneath the Boardwalk - Confessions of a Lamplighter",
      "icon": "🔥",
      "category": "fiction",
      "pages": [
        "Entry the Fourth - On the Subject of Mrs Pemberton\n\nMrs Pemberton came to the lamp at Pier Six again tonight. She says she comes for the light, but I know the truth. She comes because her husband - the esteemed Mr Pemberton, dealer in decorative corals - has taken up with the woman who runs the shell-polishing kiosk on Lantern Row.\n\nI said nothing. A lamplighter does not gossip. A lamplighter ILLUMINATES.",
        "'Dorian,' she said to me - for that is my name, Dorian, lamplighter third class - 'Dorian, do you think a woman can love two men?'\n\nI adjusted my wick. This is what I do when I am uncomfortable.\n\n'Mrs Pemberton,' I said, 'I light lamps. I am not qualified to illuminate the human heart.'\n\nShe laughed. It was the sort of laugh that makes a lamplighter reconsider his career choices. The sort that makes you think perhaps there is more to life than wicks and whale oil and the quiet dignity of municipal infrastructure maintenance.",
        "'You're very wise, Dorian,' she whispered, and placed her hand on mine. My hand, which smelled of lamp oil. Her hand, which smelled of expensive coral dust and poor decisions.\n\nI should note for the record that nothing improper occurred. I am a professional. I lit Pier Six, Pier Seven, and the decorative sconce outside the harbourmaster's office, all within regulation timeframes.\n\nBut I will confess: Pier Eight was three minutes late that evening.\n\nThree minutes. Mrs Pemberton has cost me my perfect record.\n\nI shall never forgive her. I shall also be at Pier Six again tomorrow.",
        "Entry the Seventh - On the Subject of Mr Pemberton\n\nMr Pemberton confronted me today. He said, 'I know my wife visits your lamp.'\n\nI said, 'Sir, it is a public lamp. Many people visit it. That is the purpose of a lamp.'\n\nHe narrowed his eyes. 'She speaks of you, lamplighter. She says you are WISE.'\n\n'I am not wise,' I said. 'I am adequately trained in wick maintenance and municipal lighting schedules. These are different things.'\n\nHe seemed satisfied with this answer and left. I lit Pier Six in record time that evening. Some emotions can only be expressed through punctual civic service."
      ],
      "biome": "inn"
    },
    {
      "id": "fiction_love_among_crates",
      "title": "Love Among the Crates - A Gleaner's Romance",
      "icon": "💘",
      "category": "fiction",
      "pages": [
        "She was everything a gleaner shouldn't want.\n\nRosalind ran the candle stall at the corner of Driftwood Lane - the one with the hand-dipped tapers and the little sign that said 'SCENTED AND UNSCENTED - NO REFUNDS.' She had ink-dark hair, a laugh like windchimes, and absolutely zero understanding of dungeon sanitation protocols.\n\n'You missed a spot,' she said one morning, leaning over the counter as I trudged past with my mop and bucket.\n\n'It's a twelve-floor dungeon,' I said. 'There are many spots.'",
        "'You look tired,' she said.\n\nI WAS tired. I'd been scrubbing hero-residue off basement walls since four in the morning. There was something caked into the grout on floor 1.3 that I was fairly certain used to be alive.\n\n'It's honest work,' I said, because that's what you say when the work is terrible.\n\nShe slid a candle across the counter. Lavender. 'For the smell,' she said. 'You could use it.'\n\nI should have been offended. Instead I took the candle and felt something I hadn't felt since orientation week: hope. Also lavender.",
        "We started meeting after shifts. She'd close the stall, I'd finish my route, and we'd sit on the old pier and watch the tide come in. She'd tell me about candle-making. I'd tell her about mould classifications.\n\n'Type Seven is the worst,' I said. 'Bioluminescent. Grows in spiral patterns. Beautiful, actually, but it dissolves boot leather.'\n\n'You talk about mould the way poets talk about the sea,' she said.\n\nNo one had ever said anything like that to me before. In fairness, no one had ever had reason to.",
        "It couldn't last. She was offered a stall at the Frontier Gate market - better foot traffic, higher margins, a proper awning. Three districts away.\n\n'Come with me,' she said.\n\n'I can't. My contract's through the season. And floor 2.2 won't clean itself.'\n\nShe kissed me on the cheek. She smelled like lavender and beeswax and a future I wasn't licensed to pursue.\n\nThe candle she gave me still sits on my bedside shelf. I light it after bad shifts. The dungeon smells like death and forgotten ambition, but my room, for a few hours, smells like her.\n\n- This copy is dog-eared and has been read many times - "
      ],
      "biome": "home"
    },
    {
      "id": "fiction_watchmans_wife",
      "title": "The Watchman's Wife - Season 4 Finale Novelization",
      "icon": "📺",
      "category": "fiction",
      "pages": [
        "PREVIOUSLY ON THE WATCHMAN'S WIFE:\n\nBrenna discovered that her husband Aldric was leading a double life as both a night watchman AND a volunteer at the municipal library. Confronted with evidence (an overdue library book found in his patrol cloak), Aldric confessed to everything - the late fees, the secret reading nook behind the reference section, and his passionate disagreement with the library's cataloguing system.\n\nMeanwhile, Brenna's sister Catrin has fallen for the new apothecary, unaware that he is ALSO Aldric's library co-volunteer. The love triangle has become a love RECTANGLE, and the rectangle is OVERDUE.",
        "CHAPTER THIRTY-ONE: THE RECKONING\n\n'You lied to me,' Brenna said, her voice like ice on a winter pier. 'Every night you said you were walking the walls, and instead you were- '\n\n'Reorganizing the folklore section by region instead of author surname,' Aldric finished quietly. 'Yes.'\n\n'Do you know how that makes me feel?'\n\n'Brenna- '\n\n'ALPHABETICALLY BETRAYED, Aldric. That's how it makes me feel.'\n\nHe reached for her hand. She pulled away and accidentally knocked his reading glasses off the table. They both watched them fall. It was the most dramatic thing that had happened in their marriage since the Soup Incident of Year Three.",
        "Catrin burst through the door, mascara running. 'Brenna! Aldric! The apothecary - Edmund - he's- '\n\n'Also a library volunteer?' Brenna said flatly.\n\nCatrin stopped mid-sob. 'How did you- '\n\n'EVERYONE is a library volunteer, Catrin. This whole town is built on lies and late fees.'\n\nAldric cleared his throat. 'To be fair, the library's collection is genuinely excellent- '\n\n'NOT NOW, ALDRIC.'\n\nOutside, the town bell struck midnight. Somewhere, a book was being returned after hours via the unmonitored drop slot. The cycle of deception continued.",
        "NEXT SEASON PREVIEW:\n\nThe library burns down under mysterious circumstances. Aldric is the primary suspect. Brenna must choose between her husband and the TRUTH. Catrin opens a rival bookshop out of spite. Edmund the apothecary reveals he can't actually read - he was volunteering at the library to be near the HEATING SYSTEM.\n\nNew character: Aldric's mother, who has opinions about EVERYTHING.\n\n- Unauthorized novelization. The Coralshore Broadcasting Company does not endorse this product. - "
      ],
      "biome": "inn"
    },
    {
      "id": "fiction_romantic_correspondence",
      "title": "Madame Coralie's Guide to Romantic Correspondence",
      "icon": "💌",
      "category": "fiction",
      "pages": [
        "A NOTE FROM THE AUTHOR\n\nDearest reader - you hold in your trembling hands the DEFINITIVE guide to the written pursuit of love. Whether you are a harbour worker yearning for a fishwife, a shopkeeper pining for a lamplighter, or simply someone who has made regrettable eye contact and now must follow through, Madame Coralie is here to help.\n\nLet us begin with the fundamentals. Rule One: Never open a love letter with a discussion of the weather. The weather is not romantic. The weather is MUNICIPAL.",
        "TEMPLATE THE THIRD - For When You Have Wronged Your Beloved\n\nMy Dearest [NAME],\n\nI write to you with a heart heavier than a wet net full of administrative guilt. What I did at [LOCATION] was unforgivable, and I say that as someone who has studied forgiveness from a theoretical perspective and found it WANTING.\n\nI should never have [OFFENCE - be specific, but not TOO specific, as these letters are sometimes read aloud in taverns]. You deserved better. You deserved someone who [POSITIVE QUALITY YOU LACK].\n\nPlease accept this [GIFT - nothing alive, nothing that was recently alive, nothing from the discount bin at the Coral Bazaar] as a token of my boundless remorse.\n\nYours in perpetual regret,\n[YOUR NAME, spelled correctly this time]",
        "COMMON MISTAKES - A Cautionary Chapter\n\nDO NOT send poetry unless you are certain it is good. Bad poetry has ended more relationships in Coralshore than infidelity and fish-related disputes combined.\n\nDO NOT compare your beloved to the sea. Everyone compares their beloved to the sea. Your beloved is tired of being compared to the sea.\n\nDO NOT use the phrase 'my darling barnacle.' I don't care what context you think justifies it. There is no context.\n\nDO NOT send a love letter via municipal post if you are ALSO conducting a secret correspondence with someone else via municipal post. The postal workers talk. They talk about EVERYTHING.",
        "ADVANCED TECHNIQUE - The Art of the Graceful Rejection\n\nSometimes, you are on the RECEIVING end. A love letter arrives and your heart sinks like a poorly maintained rowboat. Fear not. Madame Coralie has a template for this also.\n\nMy Dear [NAME],\n\nThank you for your letter, which I read with [choose one: 'great interest' / 'some surprise' / 'the assistance of a translator, as your handwriting is medically concerning']. Your feelings do you credit, but I must confess that my heart belongs to [another / my work / a concept of personal freedom that does not include you specifically].\n\nI wish you every happiness and strongly recommend Volume II of this guide, which covers 'Moving On With Dignity.'\n\nWarmly but Firmly,\n[YOUR NAME]"
      ],
      "biome": "bazaar"
    },
    {
      "id": "fiction_dashing_rogue",
      "title": "The Dashing Rogue of Lantern Row",
      "icon": "🗡️",
      "category": "fiction",
      "pages": [
        "Chapter One: A Scoundrel Arrives\n\nThey say Rafferty Vane arrived in Coralshore with nothing but a deck of cards, a borrowed coat, and a smile that had been legally classified as a public disturbance in two neighbouring towns.\n\n'I'm looking for three things,' he told the innkeeper, dropping a single coin on the bar with practised flair. 'A room, a drink, and trouble.'\n\n'We've got rooms and drinks,' said the innkeeper. 'Trouble finds itself.'\n\n'Then we have an understanding.' He flipped the coin. It landed on its edge. Even the coin was showing off.",
        "Vane's first mark was the card dealer at the Coral Bazaar - a woman named Sparrow who shuffled cards so fast they blurred. He sat down at her table with his borrowed coat and his dangerous smile and said, 'Deal me in.'\n\n'You can't afford this table,' Sparrow said.\n\n'I can't afford most things. It's never stopped me before.'\n\nShe dealt. He lost. He lost MAGNIFICENTLY. Three hands in a row, each more creative in its failure than the last. Sparrow was, against her professional judgement, impressed.\n\n'You're the worst card player I've ever seen,' she said.\n\n'Madam,' he said, straightening his borrowed cuffs, 'I am the worst card player ANYONE has ever seen. There is a difference.'",
        "By the end of the week, Vane had: lost every card game on Lantern Row, been barred from two establishments and enthusiastically welcomed at three others, accidentally solved a minor property dispute through sheer charm, and developed what he described as 'a professional interest' in Sparrow the card dealer.\n\n'You're following me,' Sparrow said, not looking up from her shuffle.\n\n'I prefer to think of it as walking in the same direction with great enthusiasm.'\n\n'That's following.'\n\n'Semantics.' He produced a flower from his sleeve. It was slightly crushed. 'Peace offering?'\n\nShe took it. She didn't smile. But she didn't NOT smile, and Rafferty Vane had built entire careers on the space between those two things.",
        "'You know,' Sparrow said one evening, as the lanterns along the Row flickered to life, 'for a man who loses every hand, you seem remarkably content.'\n\n'Winning is easy,' Vane said. 'Any fool with good cards can win. But losing with STYLE - that takes real talent. That takes commitment. That takes a man who looked at success and said, no thank you, I have other plans.'\n\n'Those are the plans of an idiot.'\n\n'An idiot with a flower in his sleeve and nowhere else to be.'\n\nThe lanterns burned. The boardwalk creaked. Somewhere in the distance, a card game was being played honestly, and Rafferty Vane wanted absolutely nothing to do with it.\n\n- BOOK ONE OF THE LANTERN ROW SCOUNDRELS SERIES - "
      ],
      "biome": "bazaar"
    },
    {
      "id": "fiction_forbidden_tinctures",
      "title": "Forbidden Tinctures - A Potion-Maker's Diary",
      "icon": "⚗️",
      "category": "fiction",
      "pages": [
        "Day 1.\n\nThe love potion is a perfectly legitimate branch of alchemy and I will not be shamed for pursuing it. Mrs Hartwell at the Guild canteen says it's 'unethical.' Mrs Hartwell also puts salt in her tea. I do not take ethical guidance from people who salt their tea.\n\nFormula 1: Rose petals, moonwater, essence of yearning (3 drops).\nResult: Test subject (a crab) became deeply attached to a rock. More attached than crabs usually are to rocks, I mean. Which is saying something.",
        "Day 12.\n\nFormula 7: Crushed pearls, distilled starlight, a single eyelash donated willingly.\nResult: I accidentally drank it myself while reaching for my actual tea (note to self: LABEL YOUR CUPS). Spent the next four hours profoundly in love with my own reflection in the window. Not in a vain way - more in a 'you seem like a really good listener' way. Very unsettling.\n\nDay 15.\n\nFormula 9: Coral dust, honey, extract of dramatic tension.\nResult: Applied to Mrs Hartwell's doorknob as a field test. She fell in love with the door. Would not stop complimenting its hinges. I feel this is progress adjacent.",
        "Day 23.\n\nFormula 14: Tide foam, candlewax, powdered ambition.\nResult: The crab from Day 1 - who I have named Gerald - drank the residue from my workbench. Gerald is now in love with Formula 7 (the window reflection one). He keeps clicking at his own reflection in the side of my cauldron. I have created a narcissistic crab. This was not the goal.\n\nDay 24.\n\nGerald has a following. Three other crabs now sit around my cauldron admiring themselves. I may have invented crab vanity. The alchemical community will not know what to do with this information.",
        "Day 30.\n\nBreakthrough! Formula 19 works. Applied in controlled conditions (two consenting volunteers from the Driftwood Inn, observed at a safe distance). Subject A told Subject B that their 'eyes were like the sea at sunset.' Subject B said 'that's the nicest thing anyone's ever said to me' and they shared a meal.\n\nFormula 19: Just regular tea with a nice biscuit.\n\nI have spent thirty days and considerable resources to discover that the most effective love potion is TEA AND BISCUITS.\n\nGerald remains narcissistic. I will continue to monitor the situation.\n\n- This journal has water stains and smells faintly of rose petals - "
      ],
      "biome": "home"
    },
    {
      "id": "term_sys_status",
      "title": "SYSTEM STATUS TERMINAL",
      "icon": "\uD83D\uDDA5\uFE0F",
      "category": "terminal",
      "pages": [
        "TIDE COUNCIL INFRASTRUCTURE v3.7.2\nNODE: BOARDWALK-EAST-04\nSTATUS: NOMINAL\n\nPOWER GRID: 94% capacity\nWATER PRESSURE: 2.4 bar (within tolerance)\nSEWER FLOW: normal\nLAST MAINTENANCE: Cycle 447, Day 3",
        "ALERT LOG (last 7 cycles):\n- C443: Pressure spike in sector 7 (resolved)\n- C444: Unauthorized access attempt, Archive sub-basement\n- C445: Grime accumulation exceeds threshold, Floor 2 east\n- C446: REDACTED\n- C447: Gleaner dispatch confirmed. Work order #1891 issued."
      ],
      "biome": "guild"
    },
    {
      "id": "term_gleaner_dispatch",
      "title": "GLEANER DISPATCH LOG",
      "icon": "\uD83D\uDDA5\uFE0F",
      "category": "terminal",
      "pages": [
        "DISPATCH SYSTEM v2.1\nOPERATOR: [AUTO]\n\nACTIVE CONTRACTS:\n- WO#1891: Floor 2 east wing, grime removal (ASSIGNED)\n- WO#1887: Floor 1 bonfire pit, ash disposal (COMPLETE)\n- WO#1883: Sub-level 3, corpse processing (OVERDUE)",
        "GLEANER PERFORMANCE METRICS:\nReadiness avg: 72%\nClean exit rate: 45%\nTrap re-arm compliance: 31%\nAvg time-to-completion: 14.2 min\n\nNOTE: Performance below threshold. Recommend equipment upgrade or replacement."
      ],
      "biome": "guild"
    },
    {
      "id": "term_dungeon_monitor",
      "title": "DUNGEON MONITORING STATION",
      "icon": "\uD83D\uDDA5\uFE0F",
      "category": "terminal",
      "pages": [
        "DUNGEON TELEMETRY FEED\nFLOOR: SUB-3 (CELLAR)\nHERO CYCLE: 447\n\nENTITY COUNT: 7 hostile, 2 neutral\nTRAP STATUS: 4/9 active (5 consumed)\nCOBWEB COVERAGE: 12%\nGRIME INDEX: 0.78 (CRITICAL)",
        "ENVIRONMENTAL SENSORS:\nTemp: 12C (nominal)\nHumidity: 89% (high - cobweb decay risk)\nAir quality: POOR (decomposition detected)\nLighting: 3% (torch coverage minimal)\n\nRECOMMENDATION: Deploy gleaner immediately.\nHero arrival in approximately 6 hours."
      ],
      "biome": "cellar"
    },
    {
      "id": "term_tide_memo",
      "title": "TIDE COUNCIL INTERNAL MEMO",
      "icon": "\uD83D\uDDA5\uFE0F",
      "category": "terminal",
      "pages": [
        "CLASSIFICATION: INTERNAL\nFROM: Facilities Director\nTO: All Gleaner Supervisors\nRE: Incident Report C-446\n\nThe events of Cycle 446 are NOT to be discussed with gleaners, heroes, or civilian contractors. The sub-basement access logs have been purged. Any gleaner who reports unusual readings from the deep sensors should be reassigned to surface duty immediately.",
        "ADDENDUM:\nThe structural damage to the east retaining wall has been classified as 'routine erosion.' The sound complaints from residents in Boardwalk Village sector 3 have been attributed to 'tidal activity.'\n\nDo NOT deploy sonar equipment below Floor 3.\nDo NOT approve work orders for the sealed wing.\n\nThis terminal will auto-purge in 48 hours."
      ],
      "biome": "guild"
    },
    {
      "id": "term_diagnostic",
      "title": "HARDWARE DIAGNOSTIC",
      "icon": "\uD83D\uDD27",
      "category": "diagnostic",
      "pages": [
        "SELF-TEST INITIATED...\n\nCPU: OK (Tide Systems TC-7700)\nMEMORY: 640K (should be enough)\nDISPLAY: CRT-G4 phosphor (green)\nNETWORK: HARDLINE to Boardwalk hub\nSTORAGE: Tape drive B (degraded)\n\nWARNING: Tape drive B read errors exceed threshold.\nBackup tapes may be corrupted.\nContact Facilities for replacement.",
        "FIRMWARE NOTES (v3.7.2):\n- Fixed false positive on grime sensors\n- Increased hero detection range to 12 tiles\n- Patched dispatch queue overflow (was assigning work orders to decommissioned gleaners)\n- Known issue: terminal flickers near high-EMF sources. This is a FEATURE of the phosphor display, not a bug."
      ],
      "biome": "guild"
    },
    {
      "id": "notice_landlord_welcome",
      "title": "LANDLORD'S NOTICE - Welcome, Operative",
      "icon": "📋",
      "category": "notice",
      "pages": [
        "BOARDWALK VILLAGE - UNIT 6\nTENANT: Operative Gleaner (Guild Secondment)\n\nWelcome to your quarters. Rent is deducted from your Guild contract - you will not receive a separate invoice. The unit comes furnished: bed, stash chest, table, mailbox. Do not rearrange the furniture. The walls are load-bearing and I mean all of them.",
        "HOUSE RULES:\n\n1. Curfew is enforced. If you're not home by the bell, you collapse where you stand. That's not my problem; it's yours.\n2. The stash chest is Guild-issued. Don't try to pick the lock on the one in the storage room - it's empty, and the locksmith charges by the hour.\n3. Your mail arrives through the slot. Read it.",
        "4. The bonfire is in the bedroom. Yes, indoors. No, it won't burn the place down. The hearthstones are warded. Don't ask by whom.\n5. Your neighbours are other operatives. They keep odd hours. So do you. Mind your business.\n6. Complaints go to the Guild, not to me. I'm the landlord, not your therapist.\n\nWelcome to Coralshore. Try not to die on my property.\n- Mgmt."
      ],
      "biome": "home"
    },
    {
      "id": "notice_dispatcher_orientation",
      "title": "DISPATCHER'S PACKET - New Operative Orientation",
      "icon": "📋",
      "category": "notice",
      "pages": [
        "GLEANER'S GUILD - ORIENTATION PACKET\nPrepared by: The Dispatcher\nFor: New Operative (Classification 4-C)\n\nCongratulations on your assignment. You are now a licensed Gleaner operating under the Dragon Compact's maintenance provisions. Your job is simple: clean up after the heroes.",
        "YOUR DAILY ROUTINE:\n\n1. Check your mailbox for work orders.\n2. Visit the Dispatcher's Office on Lantern Row for briefing.\n3. Descend to the assigned floor.\n4. Clean, restock, re-arm. Hit the readiness target.\n5. Return to the surface before curfew.\n6. Sleep. Repeat.",
        "EQUIPMENT PRIMER:\n\nCards: Your combat deck. Buy from shops, earn from seal rewards. Suit triangle: Clubs beats Diamonds, Diamonds beats Spades, Spades beats Clubs. Hearts heal.\n\nBag: Carries restocking materials. Buy ingredients at shops or salvage from the field.\n\nStash: Long-term storage. Accessed from your chest at home or any bonfire.",
        "CLEANING OPTIONS:\n\n1. Scrub tiles by hand - face a dirty tile, press OK. Slow but free.\n2. Pressure hose - grab it from the Guild cleanup rig outside. Clears a full wall section per charge. Charges are limited.\n3. Restock crates - interact with a smashed crate, fill it with matching materials. Earns coin and readiness.\n4. Read field manuals - bookshelves in buildings contain cleaning techniques and advanced protocols. The more you read, the more efficient you become."
      ],
      "biome": "home"
    },
    {
      "id": "journal_personal_day0",
      "title": "Personal Journal - Day 0",
      "icon": "📓",
      "category": "journal",
      "pages": [
        "Arrived in Coralshore this morning. The truck dropped me at the approach - no fanfare, no welcome committee, just a bonfire and two people who looked like they'd been sitting there for years.",
        "This place is stranger than the brochure suggested. The buildings are old - really old - but the infrastructure is modern. Clean running water, warded fire pits, crystal-powered lampposts. Someone is spending money to keep this town functional. The dungeons underneath apparently generate all the revenue.",
        "Met my Dispatcher. Clipboard, black jacket, no patience. Seems competent. Told me to get my keys from my bunk and report for work. Didn't mention what the work actually involves beyond 'cleaning up after heroes.' I've been cleaning up after people my whole life. How bad can a dungeon be?",
        "Found the bunk. It's small but dry. There's a stash chest with my work keys, a mailbox, and a bed with a fire pit in it. The landlord left a note. Charming individual.\n\nTomorrow I descend for the first time. I should read everything I can find before then."
      ],
      "biome": "home"
    },
    {
      "id": "term_home_dispatch",
      "title": "GLEANER HOME TERMINAL",
      "icon": "\uD83D\uDDA5\uFE0F",
      "category": "terminal",
      "pages": [
        "GLEANER DISPATCH SYSTEM v2.1\nNODE: HOME-BUNK-06\nSTATUS: ONLINE\nOPERATOR: [YOU]\n\nWelcome, Gleaner. This terminal receives your work orders, shift schedules, and dungeon telemetry. Reports from completed hero runs will also be delivered here.\n\nPress [D] to cycle through records.\nPress [Esc] to disconnect.",
        "ACTIVE SHIFT SCHEDULE:\n> Check your mailbox for current assignments.\n> Hero days are posted 2 days in advance.\n> Report to the dungeon lobby BEFORE your shift.\n> Bring supplies. The dungeon doesn't provide.\n\nTIP: The readiness bar in your HUD shows your progress. Hit the target before hero arrival."
      ],
      "biome": "home"
    },
    {
      "id": "term_home_diagnostic",
      "title": "BUNK TERMINAL SELF-TEST",
      "icon": "\uD83D\uDD27",
      "category": "diagnostic",
      "pages": [
        "SELF-TEST INITIATED...\n\nCPU: OK (Tide Systems TC-4400)\nMEMORY: 256K (residential allocation)\nDISPLAY: CRT-G2 phosphor (green)\nNETWORK: HARDLINE to Boardwalk hub (read-only)\nSTORAGE: Tape drive A (nominal)\n\nNOTE: This is a residential-grade terminal. Write access to the dispatch system is restricted. You can READ work orders and reports but cannot modify, delete, or reassign them.",
        "NETWORK SERVICES:\n> dispatch.read - shift schedules, work orders\n> mailbox.sync - hero run reports (auto-delivered)\n> telemetry.read - live dungeon sensor feed (when available)\n> archive.search - DENIED (clearance insufficient)\n\nFIRMWARE: v2.1.4-residential\nLAST UPDATE: Cycle 440 (47 cycles behind mainline)\nNEXT SCHEDULED UPDATE: UNKNOWN"
      ],
      "biome": "home"
    },

    {
      "id": "guide_adventurer_general",
      "title": "Adventurer's Pocket Guide",
      "icon": "📗",
      "category": "manual",
      "pages": [
        "Welcome to the life, Gleaner.\n\nHeroes come and go. They kill things, break things, and leave. You come after. You are the reason the dungeon is still standing when the next party arrives.",
        "Know your floors. Every dungeon has a rhythm - rooms that flood, corridors that collapse, chokepoints where heroes always fight. Learn the layout before you learn the mop.",
        "Watch the schedule. Hero days are posted at every lobby entrance. If you're still inside when the party arrives, find a bonfire and stay out of the way. Heroes don't check corners before swinging.",
        "Your tools: cleaning supplies, restocking crates, torch oil, trap springs, and whatever cards you've earned. Everything degrades. Budget accordingly.\n\nStay alive. Stay employed. Stay out of the hero's way."
      ],
      "biome": "dungeon"
    },
    {
      "id": "guide_cleaner_general",
      "title": "Gleaner's Cleaning Manual",
      "icon": "📗",
      "category": "manual",
      "pages": [
        "STANDARD OPERATING PROCEDURE: DUNGEON READINESS\n\nYour job is to bring the floor to 100% readiness before the next hero day. Readiness is measured across four categories: crate restocking, blood cleaning, torch maintenance, and trap re-arming.",
        "CRATE RESTOCKING (35% weight)\nApproach a broken crate. Press OK. Match the suit symbols for bonus pay. Fill all slots and seal. Don't leave empty crates - heroes expect loot.\n\nBLOOD CLEANING (25% weight)\nFace a bloodstained tile. Scrub. Repeat. Some tiles need multiple passes. Work systematically, room by room.",
        "TORCH MAINTENANCE (20% weight)\nHeroes knock out torches during fights. Re-light every sconce you find. Carry extra oil - torches in deep rooms burn faster.\n\nTRAP RE-ARMING (20% weight)\nTraps that triggered need to be reset. Face the consumed trap tile and re-arm it. Check every corridor.",
        "EXTRA CREDIT\nCorpse processing, cobweb upkeep, and bonus cleaning can push your readiness above 100%. Higher readiness means better payout, combo multipliers, and a happier employer.\n\nGet the floor to 100% core. Everything beyond that is profit."
      ],
      "biome": "dungeon"
    },
    {
      "id": "lore_soft_cellar",
      "title": "Notes on the Soft Cellar",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "The Soft Cellar got its name from the moss. Ankle-deep in places, thick enough to muffle footsteps. First-time heroes love it - they think stealth is easy down here. The moss just means you can't hear what's coming either.",
        "The cellar floor sits on ancient coral substrate, the foundation of the town itself. Water seeps through the walls seasonally, creating the damp that feeds the moss. The Tide Council maintains detailed maps of the water channels - they guard the structural integrity obsessively. A collapse down here would crack the buildings above. The moss, for all its harmlessness to heroes, is actually a living engineering solution. The root systems stabilize loose stone. The Tide faction has even considered planting additional varieties.",
        "Hazards in the Soft Cellar are subtle. Flash flooding in the lower chambers during storm season. Slippery moss-covered ledges that have caused more accidents than any creature. Torch oil that spreads on wet stone and burns unpredictably. New Gleaners often underestimate the dungeon precisely because the monsters are weak. The real danger is environmental - a moment of lost footing, a twisted ankle in murky water, hypothermia from extended submersion. The Tide Council pays for this maintenance not because heroes need practice, but because the cellar is the town's literal foundation. Protect it."
      ],
      "biome": "cellar_entry"
    },
    {
      "id": "lore_heros_wake",
      "title": "Field Report: Hero's Wake",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "Hero's Wake is where the Admiralty tests its applicants. Two floors of increasingly nasty encounters, designed to wash out anyone who can't handle real dungeon work. The watchman upstairs keeps a tally. Most parties don't make it past the second chamber.",
        "The Admiralty was founded four hundred years ago as the Dragon Compact's first military institution - tasked with documenting the deep dwellers and maintaining the treaty boundaries. Over time that mission shifted. By the current era, the Admiralty runs most licensed hero operations and controls the Scholar hero archetype. Scholars are intelligence operatives first, adventurers second. They carry detailed maps of every dungeon chamber and ask precise questions about unusual finds. The two-floor structure of Hero's Wake exists because the Admiralty realized applicants need both physical testing and psychological assessment.",
        "Scholar-class heroes like testing themselves against unexpected angles - environmental puzzles, non-obvious loot paths, trap sequences that reward precision over power. The first floor of Hero's Wake filters for physical stamina. The second floor separates the mercenaries from the intelligence officers. A Crusader party might clear both floors through raw violence. A Scholar party studies the architecture, discovers the hidden cache route, and completes the descent with minimal combat. Both methods are valid. Both tell the Admiralty exactly what it needs to know about its recruits."
      ],
      "biome": "watchpost"
    },
    {
      "id": "lore_ironhold_depths",
      "title": "Survey: Ironhold Depths",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "Ironhold was a foundry before it was a dungeon. You can still see the old smelting channels in the walls - the stone is scorched black in places. When the Dragon Compact converted it, they kept the industrial infrastructure. The traps here are mechanical, not magical. Gears, pressure plates, counterweights.",
        "The Foundry Collective's historical claim on Ironhold runs deep. Their records show that pre-Compact, this site was a thriving metalworking operation that supplied tools and materials across the region. The Foundry faction maintains that Ironhold was always theirs - the Dragon Compact merely formalized an existing arrangement. The mechanical traps were originally anti-theft measures. The Foundry has invested heavily in modernizing the trap systems, treating Ironhold as their private testing ground for new designs. This creates unique hazards: molten residue still drips in the lower smelting chambers, cooling slag creates unstable floor sections, and the pressure-plate networks are more sophisticated than anywhere else in the dungeon network.",
        "Cleanup at Ironhold demands specialized knowledge. Slag pits are caustic enough to degrade equipment - prolonged exposure weakens armor and burns boot soles. The soot from the ancient furnaces coats everything, making standard cleaning methods ineffective. Gleaners assigned here receive hazard pay and must use specialized sulfur-resistant supplies. Most importantly, never attempt to relight torches in the furnace chambers. The mineral deposits in the air ignite unexpectedly. Use only crystal-lanterns down there. The Foundry pays premium rates for intact structural repairs because every dent in their furnace is a statement about inferior workmanship. They take pride seriously."
      ],
      "biome": "armory"
    },
    {
      "id": "tip_dungeon_iron",
      "title": "Ironhold Prep Sheet",
      "icon": "📘",
      "category": "tip",
      "pages": [
        "IRONHOLD DEPTHS - GLEANER PREP\n\nBring extra trap springs. The mechanical traps here jam more often than magical ones. A jammed trap counts as un-armed for readiness. Stock at least double your normal supply - the pressure plates jam with soot buildup and require manual cleaning before re-arming.\n\nWatch for slag pits - the old smelting channels still have residue. Don't step in them. The caustic compound eats through boot leather and deals slow damage if you linger.",
        "TRAP TYPES YOU'LL ENCOUNTER:\n- Pressure plates (gear-based): Reset by hand, tedious but straightforward\n- Counterweight traps: Heavy and awkward to re-arm alone - call for buddy assistance\n- Chain mechanisms: Get tangled easily, disengage carefully\n- Temperature-sensitive triggers: Magically inert but rely on thermal flux - keep them dry\n\nRECOMMENDED CARD LOADOUT:\nPriority: Diamonds (Foundry faction gear). Their cards exploit mechanical trap mechanics.\nSecondary: Clubs (defense against residual hazards).\nAvoid: Hearts (healing is wasted - mechanical damage is predictable).",
        "RESOURCE CONSUMPTION:\nTorch oil burns 25% faster at Ironhold due to mineral deposits in the air. Budget accordingly - dark chambers down here are genuinely dangerous.\n\nCrystal lanterns are preferable but rare. If available, prioritize them over torch oil.\n\nBring extra mop heads. The soot stains are persistent. Standard cleaning won't reach 100% - you'll need multiple passes with fresh tools. Plan for extended shifts."
      ],
      "biome": "armory"
    },
    {
      "id": "notice_ironhold_expedition",
      "title": "Expedition Notice - Ironhold",
      "icon": "📋",
      "category": "notice",
      "pages": [
        "POSTED BY ORDER OF THE GARRISON COMMAND\n\nExpedition roster for Ironhold Depths has been updated. All Gleaners assigned to Ironhold must report to the Armory before their scheduled shift. Equipment inspection is mandatory.\n\nThe Quartermaster will issue replacement springs for any trap kits older than 30 days. Current roster includes three Foundry-sponsored hero teams and two independent contractors. Gear requisitions for this rotation exceed normal budget by 40%. Priority resupply of mechanical tools and soot-resistant cleaning agents.",
        "IMPORTANT: The Garrison Command's administrative structure is distinct from the Foundry Collective, though the Foundry provides operational funding for Ironhold maintenance. Gleaners must respond to Garrison officers on shift. Missed assignments result in work-order reassignments and loss of Ironhold rotation eligibility for the next cycle. Non-appearance without medical documentation triggers a formal incident report with the Guild Dispatcher. Repeat offenders may face hazard-pay suspension. No exceptions."
      ],
      "biome": "armory"
    },
    {
      "id": "lore_garrison_founding",
      "title": "The Garrison - A Short History",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "The Garrison was built in the second year of the Dragon Compact, when the Admiralty realized they needed a permanent military presence near the deep dungeons. Before that, hero parties just camped in the street.",
        "The original architect was a dwarf named Korrath who insisted on triple-thick walls. Everyone thought it was overkill. Then the first Crusader party came back up the stairs at speed, pursued by something with too many legs, and suddenly triple-thick walls seemed reasonable. Korrath's design became the baseline for all Garrison construction. The first commandant, Admiral Merrick, established the three-faction council model - Admiralty, Foundry, and Tide representation in all strategic decisions. This unusual compromise arose from necessity. The Admiralty needed heroes to succeed. The Foundry needed salvage access. The Tide needed the deep floors protected. No single faction could dominate without destabilizing the entire system.",
        "Over the past four centuries, the Garrison evolved into the town's de facto command center for dungeon operations. It mediates disputes between competing hero teams, oversees hero licensing, and maintains the official dungeon depth registers. The balance has held because each faction fears what the others might do more than they trust what they themselves might achieve. The Garrison is the lock that keeps that fear balanced. It is not a place built on friendship. It is a place built on mutual vulnerability, perfectly understood by all parties."
      ],
      "biome": "armory"
    },
    {
      "id": "lore_foundry_forging",
      "title": "Foundry Methods - A Primer",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "The Foundry faction doesn't just repair equipment - they reforge it. When a hero's sword breaks in the dungeon, the Gleaner salvages the shards. The Foundry melts them down and folds the metal back together with whatever dungeon residue clung to the blade. The result is always slightly different from the original. Sometimes better.",
        "Dungeon residue is the accumulation of magical particles, crystalline growths, and unknown compounds that coat every surface in the deep chambers. Under magnification, it resembles a hybrid of stone and crystal. When melted with broken equipment, it fuses at the molecular level, creating what the Foundry calls 'sigil-steel' - metal that retains subtle magical properties. A reforged blade cuts deeper than the original. A shield bears impact better. The effect is minor but measurable. The Foundry discovered this property by accident two hundred years ago and immediately classified it as proprietary. Every piece of reforged equipment carries the Foundry's mark.",
        "The economic relationship between Foundry and Gleaners is symbiotic. The Foundry pays Gleaners a premium for salvaged metal - higher than independent scrappers would offer. In exchange, the Foundry controls the supply of reforged equipment. Heroes must buy from the Foundry if they want improved weapons. The Foundry profits twice: from Gleaner salvage payments and from hero equipment sales. Gleaners profit from the guaranteed market for broken steel. It is a profitable arrangement for all involved. Whether the Tide Council and Admiralty understand the full scope of the Foundry's influence through this system is a question historians debate, and Gleaners learn not to ask."
      ],
      "biome": "shop"
    },
    {
      "id": "notice_restock_schedule",
      "title": "Restock Delivery Schedule",
      "icon": "📋",
      "category": "notice",
      "pages": [
        "WEEKLY RESTOCK SCHEDULE\n\nMorning delivery (6am): cleaning supplies, torch oil, basic crate fill.\nAfternoon delivery (2pm): specialty items, trap components, card packs.\n\nDeliveries are suspended on hero days. Plan accordingly.\n\nTide Council shop receives magical components and preservation supplies on Mondays and Thursdays.\nFoundry shop receives metal stock and tool replacements on Tuesdays and Fridays.\nAdmiralty supplier receives documentation and research materials on Wednesdays.",
        "DELIVERY FREQUENCY MODIFIERS:\nHigh hero activity increases delivery frequency by +1 day per week.\nSeasonal storms or dungeon flooding may delay or cancel deliveries without notice.\nReputation tier affects access to premium stock (see below).\n\nREPUTATION TIERS:\nTier 1 (New Gleaner): Standard stock only.\nTier 2 (Established): Early access to specialty items, +20% discount on repair supplies.\nTier 3 (Senior): Custom orders accepted, access to rare cards, -30% all prices.\nTier 4 (Master): Can request specific stock, trade credit with Guild, faction vendor priority.",
        "SPECIAL NOTICES:\nHero overstock occasionally floods the market - prices drop 10-15% on affected items.\nFaction relations affect delivery reliability. When tensions rise between factions, specific suppliers may delay shipments to your location.\nOut of stock items can be special-ordered through the Dispatcher, but delivery takes 3-5 days and costs 50% markup.\nAll prices subject to change. Confirm totals at point of purchase."
      ],
      "biome": "shop"
    },
    {
      "id": "tip_card_synergies",
      "title": "Card Synergy Cheat Sheet",
      "icon": "📘",
      "category": "tip",
      "pages": [
        "CARD SYNERGIES - QUICK REFERENCE\n\nMatching suit pairs: +1 bonus to seal quality.\nTriple suit (all three slots same suit): triples the readiness bonus for that crate.\nMixed suits: no penalty, just no bonus.\n\nSUIT GUIDE:\nClubs (♣) - Tide Council faction. Defensive, preservation-focused.\nDiamonds (♦) - Foundry faction. Combat and forge-related bonuses.\nSpades (♠) - Admiralty faction. Analytical and tactical bonuses.\nHearts (♥) - All factions. Healing and restoration effects.",
        "FACTION-SPECIFIC SYNERGIES:\nClubs pairs increase water resistance and durability bonuses +2.\nDiamonds pairs unlock crafting bonuses, re-forging discounts.\nSpades pairs boost information gathering, show hidden crate contents.\nHearts pairs restore additional health and clear status debuffs.\n\nRARITY MULTIPLIER:\nCommon (standard): 1x synergy bonus.\nUncommon: 1.5x bonus, unlock secondary effects.\nRare: 2x bonus, unlock powerful faction-specific bonuses.\nArtifact: 3x bonus, create unique effects.",
        "ADVANCED STRATEGY:\nMixing suit colors (one Club, one Diamond, one Heart) provides no bonus but prevents your deck from being predictable to experienced enemies.\n\nTriple Heart is rare but immensely valuable - restores full health AND grants temporary shield.\n\nFaction vendors will restock specific suit types based on current hero demand. Buy during low demand to maximize savings and inventory diversity. Don't hoard single-suit cards - diversification wins fights."
      ],
      "biome": "shop"
    },
    {
      "id": "tip_equipment_care",
      "title": "Equipment Maintenance Tips",
      "icon": "📘",
      "category": "tip",
      "pages": [
        "Keep your mop dry between uses. A wet mop in the bag grows mold. Mold spreads to your cards and inventory - moldy items don't stack and reduce crate seal effectiveness. Hang your mop on the wall in your bunk between shifts. The air circulation keeps it fresh.\n\nReplace torch wicks every three relights. After that the flame gutters and you lose 25% lighting efficiency. A dim torch means you can't read tile details, which means you miss dirty spots during cleaning.\n\nSpray bottle seals degrade after about 20 uses. The nozzle cracks and water pressure drops. A weak spray doubles your cleaning time on stubborn stains.",
        "EQUIPMENT DEGRADATION MECHANICS:\nMops degrade by 5% per dungeon shift. At 50% durability, cleaning speed drops to 80%. At 25%, it drops to 60%.\nTorch wicks degrade by 10% per use. Visibility penalties stack.\nTrap springs weaken after 8 re-arms. At 50% durability, re-arming takes 30% longer.\nClothing tears in combat, reducing armor value by 2% per tear until repaired.\n\nREPAIR COSTS:\nMop replacement: 3c\nTorch wick: 1c\nTrap spring set: 8c (wholesale), 12c (emergency purchase)\nClothing repair: 2-5c depending on damage",
        "HOW DEGRADATION AFFECTS PERFORMANCE:\nPoor equipment condition extends shift time. A shift that should take 2 hours with new tools takes 3+ with degraded ones. Extended time burns more resources - extra torch oil, more food consumption.\n\nLower cleaning efficiency means you fall short on readiness percentages. Missing 5% readiness costs you 5% of bonus payout. Efficiency multiplies with frustration - get a faulty tool mid-shift and you're already behind schedule.\n\nREGULAR MAINTENANCE:\nInspect all tools at the start of each shift. Replace anything below 50% durability BEFORE you descend. Budget 5-10c per week for standard maintenance. Buy in bulk when possible - vendors offer 15% discount on replacement kits."
      ],
      "biome": "shop"
    },
    {
      "id": "lore_garrison_trade_routes",
      "title": "Garrison Trade Routes",
      "icon": "📜",
      "category": "lore",
      "pages": [
        "Three trade routes feed the Garrison: the Coastal Road from the Tide faction's ports, the Mountain Pass from the Foundry's smelters, and the Old King's Highway from the Admiralty's inland holdings. Each route carries different goods.",
        "The Coastal Road brings preserved fish, salt, exotic minerals harvested from tide pools, and rare water-resistant materials. It's the slowest route - two weeks from port to Garrison - but the most reliable. The Tide Council maintains waystation shelters and keeps bandit activity low. They profit from Garrison trade and want to maintain the relationship. Goods from this route stock the Tide vendors: preservation supplies, magical components for water-based magic, and exotic crafting materials that command premium prices.\n\nThe Mountain Pass connects to the Foundry's main smelting complex. Metal stock, replacement tools, coal for fire pits, and raw ore come down this route in heavy volume. It's a three-day haul if conditions are good. During winter or after rockslides, supplies get delayed by weeks. When the Mountain Pass closes, the Garrison enters a state of quiet crisis - Foundry goods dry up, prices spike, and repair work stalls.",
        "The Old King's Highway is the most politically sensitive route. It's technically neutral territory, but control is contested. The Admiralty stations road wardens every twenty miles, ostensibly for 'safety,' but everyone knows they're watching for Tide or Foundry overreach. Documentation, research materials, specialized military supplies, and occasional confidential packages move down this route. When faction tensions rise, travel bans are the first diplomatic tool used. Blocking the Highway is a calculated statement - not quite an act of war, but close. The Garrison functions on the assumption that at least one route stays open. If two close simultaneously, the Garrison has about three weeks of reserves. Beyond that, rationing begins. Beyond six weeks, the situation becomes untenable."
      ],
      "biome": "shop"
    }
  ]
}
);
