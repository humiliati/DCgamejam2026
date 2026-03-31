```ascii
##########################################################################################
# T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T #
# ###################################################################################### #
# #                                                                                    # #
# #   ###########        ###########        ###########        ###########             # #
# #   #         #        #         #        #         #        #         #             # #
# #   # MARKET  #        # FORGE   #        # GUILD   #        # TAVERN  #             # #
# #   # COURT   #        # YARD    #        # HALL    #        # & INN   #             # #
# #   #         #        #         #        #         #        #         #             # #
# #   #####--####        #####--####        #####--####        #####--####             # #
# #        |                  |                  |                  |                  # #
# #========+==================+==================+==================+==================# #
# #        |      S →         |                  |                  |                  # #
# #   #####--####        #####--####        #####--####        #####--####             # #
# #   #         #        #         #        #         #        #         #             # #
# #   # HOUSING #        # ARCHIVE #        # TEMPLE  #        # SHOPS   #             # #
# #   # BLOCK   #        # & SCRIB #        # COURT   #        # ROW     #             # #
# #   #         #        #         #        #         #        #         #             # #
# #   ###########        ###########        ###########        ###########             # #
# #                                                                                    # #
# #      o     o     o        o     o     o        o     o     o        o     o         # #
# #     /|\   /|\   /|\      /|\   /|\   /|\      /|\   /|\   /|\      /|\   /|\        # #
# #     / \   / \   / \      / \   / \   / \      / \   / \   / \      / \   / \        # #
# #   (CITIZEN FLOW LOOPS / FACTION PATHING / SERVICE ROUTES INTERSECTING)            # #
# #                                                                                    # #
# #                                                     ||||||                         # #
# #                                                     ||||||  GRAND FACADE / ARCH   # #
# #                                                     ||||||  (DOOR TO FLOOR2)      # #
# #                                                                                    # #
# ###################################################################################### #
# T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T #
##########################################################################################

building names and npc verbs are example only


### Key Structural Shifts (Floor0 → Floor1)
- **Center spine remains shrubs (`=`)** → still your navigational “bridge”
- **Side branches now terminate into *buildings*, not shrub cul-de-sacs**
- **Entries are gated by tree breaks (`--`)** → fewer shrubs, more architectural control
- **Arcade width doubled** → supports **multi-lane NPC traffic**

### Building Roles → NPC Verbs / Factions
Use buildings to *emit behavior* into the arcade:

- **MARKET COURT** → barter, browse, loiter  
- **FORGE YARD** → carry, deliver, heat cycles (workers loop)  
- **GUILD HALL** → patrol, recruit, escort (faction-aligned NPCs)  
- **TAVERN & INN** → idle, gather, rumor exchange (time-of-day spikes)  

- **HOUSING BLOCK** → sleep/wake cycles → morning/evening surges  
- **ARCHIVE & SCRIB** → fetch/return loops (quiet faction)  
- **TEMPLE COURT** → ritual paths, slow procession routes  
- **SHOPS ROW** → short-loop transactional traffic

### Pathing Topology
- Main spine = **high-throughput east-west artery**
- Each `+` junction = **decision node** (branch vs continue)
- Building interiors = **closed loops** (NPCs re-emerge → sustain density)
- Outer ring (trees) = **soft boundary**, not traversable but visually alive

### Design Intent (Balmora-like feel)
- Feels **lived-in and functional**, not maze-like  
- Movement is **purpose-driven**, not exploratory-only  
- Player reads factions by **where people come from / go to**

### Forward Hook (Floor2)
- The **grand facade** suggests transition to:
  - **linear promenade**
  - one side: **trees / vertical elements**
  - other side: **open horizon / water / void**
  - less grid, more **ceremonial flow**

---

If you want next pass:
- I can assign **lane widths + tile units** (for collision + navmesh)
- Or map **NPC schedules** into this (hour-by-hour density shaping)
- Or add **one asymmetry break** so it doesn’t feel too engineered