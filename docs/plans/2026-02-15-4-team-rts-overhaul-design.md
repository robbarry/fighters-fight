# 4-Team RTS Overhaul Design

Kyle's vision: transform the 2-player side-scrolling brawler into a 4-team top-down RTS-lite with commander gameplay, control point objectives, and multi-round progression.

## Core Changes

### Map: + Shaped Battlefield
- 4 castles at compass points: Blue(W), Green(N), Red(E), Yellow(S)
- 4 arms connect to a central plaza with a control point
- Each arm is a corridor where that team's army marches toward center
- Center plaza: open area with capturable control point
- Wreckage from fallen units accumulates on the battlefield (replaces trees)
- Coordinate system: 2D plane, roughly 6000x6000 world units

### Teams & Alliances
- 4 teams: Blue, Green, Red, Yellow
- Two alliances: Blue+Green ("good") vs Red+Yellow ("evil")
- Allied teams don't attack each other
- Each team has its own castle, army, and gate

### Camera: True Top-Down
- Bird's eye view looking straight down
- Units rendered as top-down sprites/shapes (circles with directional indicators)
- Camera follows the action, can pan across the + battlefield
- No more side-view perspective or y-forgiveness hack

### Player Role: Commander
- Players are NOT soldiers on the field
- Players issue orders to unit groups by type:
  - "Spearmen, throw spears at X!"
  - "Swordsmen, advance to Y!"
  - "Gunners, fire on that group!"
  - "Archers, hold position!"
- AI still drives individual unit behavior (pathfinding, target selection, attack timing)
- Player commands override AI priorities for the addressed unit group
- Input: click/tap to select unit type, click/tap to issue command target
- Possible command types: Attack target area, Advance to position, Hold position, Retreat to castle, Focus fire on enemy group

### 1-4 Players
- Lobby supports 1-4 human players
- With 1 player: controls one team, allied team is full AI
- With 2 players: one per alliance (each picks a team within their alliance)
- With 3 players: one alliance has 2 commanders (one per team), other has 1
- With 4 players: one commander per team
- Uncontrolled teams run on full AI with default strategy

### Combat (adapted to top-down)
- Same unit types: Sword, Spear, Archer, Gunner, Catapult
- Attacks work in 360 degrees instead of left/right
- Units face the direction they're moving/attacking
- Melee: proximity check in 2D (no y-forgiveness needed, just radius)
- Ranged: projectiles travel in 2D toward target
- Hitscan (gunners): ray cast in 2D
- Blocking: units can block from the direction they're facing

### Control Point
- Located at center of the + intersection
- Capturing gives strategic advantage: reinforcement spawns, damage buff, or healing
- Contested if both alliances have units nearby
- Capture progress based on unit count advantage in the zone

### Multi-Round Matches
- Match is best-of-N rounds (e.g., best of 3 or 5)
- A round ends when one alliance's castles are all destroyed or all units eliminated
- Round winner gets buffs for next round:
  - Larger army size
  - Stronger unit stats
  - Visual "rainbow" aura on all units (glowing effect)
  - Unlock special unit types or abilities
- Snowball mechanic: winning team gets stronger, but losing team still has a chance

### Wreckage System
- Dead units leave debris on the battlefield
- Wreckage accumulates over rounds
- Purely cosmetic but adds atmosphere
- Could optionally provide minor cover/pathfinding obstacles

## What We Keep
- Node.js + ws WebSocket server
- Server-authoritative model
- Fixed-timestep game loop (30 tick/sec)
- ESM everywhere
- Lobby/room system (expanded for 4 players)
- Entity base class pattern
- Spatial hash concept (expanded to 2D)
- Unit type variety (sword, spear, archer, gunner, catapult)
- Compact array wire format

## What Gets Rewritten
- **Coordinate system**: 1D x-axis → full 2D plane
- **Spatial hash**: 1D → 2D grid
- **AI system**: linear march FSM → 2D pathfinding + objective AI
- **Combat system**: side-view melee/ranged → 360-degree top-down
- **Player input**: brawler WASD+attack → RTS command interface
- **Rendering**: side-view canvas sprites → top-down bird's eye
- **Game phases**: linear siege → round-based with control points
- **Army manager**: 2-team → 4-team with alliances
- **Castle manager**: 2 castles → 4 castles at compass points
- **HUD**: health bars + lives → command UI + minimap
- **All client code**: fundamentally different presentation

## Open Questions
- Exact control point capture mechanics (time-based? unit-count-based?)
- How many rounds in a match (3? 5? configurable?)
- Specific round-winner buff values
- What special units/abilities unlock with "rainbow"
- Army size per team (140 was for 2 teams — 70 per team with 4 teams? or still 140?)
- Mobile/touch support for commander controls
- Minimap design
