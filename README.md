# Kyle's Castle Battle

Two-player castle siege battle game. Two armies of 140 AI soldiers charge across a battlefield between opposing castles. Each human player picks a team, chooses a combat role, and fights alongside their army to breach the enemy castle and defeat its royals.

Supports solo play against a full AI army, two-player versus (one per team), or two-player co-op (same team).

## Quick Start

```bash
npm install
npm start
```

Open one or two browser tabs to `http://localhost:3000`. Pick a team, choose a role, and hit READY. In solo mode, click PLAY SOLO to start immediately.

The server listens on port 3000 by default. Set the `PORT` environment variable to change it:

```bash
PORT=8080 npm start
```

## How It Works

Each side fields an army of 140 AI soldiers (60 swords, 48 spears, 22 archers, 10 gunners). The armies march toward each other, clash in the open field, then the winning side assaults the losing team's castle. If the gate falls, the King and Queen spawn for a final stand -- the losing team's human player takes control of royalty for one last fight.

### Game Phases

1. **Lobby** -- Players pick teams and roles
2. **Countdown** -- 3-second countdown
3. **Army March** -- Both armies advance toward center field
4. **Open Battle** -- Armies clash; AI soldiers fight autonomously
5. **Castle Assault** -- The winning army charges the losing team's castle gate
6. **Final Stand** -- Gate breached; King and Queen spawn. Kill them to win, or defend them to survive
7. **Victory** -- Winner declared, click to play again

### Player Roles

| Role | Position | Attack | Special |
|------|----------|--------|---------|
| Sword & Shield | Ground | Melee swing (E / click) | Block (Q / right-click) |
| Spear | Ground | Melee stab (E / click) | Block (Q / right-click) |
| Archer | Castle wall | Aim + fire arrows (mouse + E / click) | -- |
| Gunner | Castle wall | Aim + fire shots (mouse + E / click) | -- |
| Catapult | Castle wall | Aim, hold to charge, release to fire (mouse + E / click) | -- |

Ground roles move freely with WASD or arrow keys. Wall roles (Archer, Gunner, Catapult) are positioned on the castle wall and move only left/right until the castle assault phase drops them to the ground.

### Controls

| Key | Action |
|-----|--------|
| WASD / Arrow keys | Move |
| Left click / E | Attack / fire |
| Right click / Q | Block (Sword & Spear only) |
| Space | Special ability |
| Mouse | Aim (ranged roles) |
| K, L, R | Team shouts (Help, Let's Go, Hi) |
| Z | Toggle battlefield overview |
| Tab | Cycle spectator camera (when dead) |
| ? | Toggle help overlay |

## Architecture

- **Server tick:** 30 Hz -- all game logic, AI, physics, and combat run server-side
- **Network:** Full JSON snapshots sent every tick via WebSocket
- **Client render:** 60 fps -- interpolates between the two most recent snapshots
- **No client-side prediction.** Player inputs go to the server, which processes them and sends back the authoritative game state

### Tech Stack

- Node.js with a single dependency (`ws` for WebSocket)
- HTML5 Canvas + vanilla JavaScript client
- ESM modules throughout (`"type": "module"`)
- No build step, no bundler, no framework

### Project Structure

```
server/
  index.js              HTTP + WebSocket server entry point
  game-room.js          Lobby management, client connections, message routing
  game-loop.js          Fixed-timestep game loop (30 Hz)
  simulation.js         Core game simulation: phases, combat, victory conditions
  entities/
    entity.js           Base entity class
    player.js           Human player entity
    soldier.js          AI soldier entity
    royal.js            King/Queen entity (Final Stand phase)
    projectile.js       Arrow, bullet, rock projectiles
  systems/
    ai.js               Soldier AI (finite state machine)
    combat.js           Melee hits, hitscan, projectile collisions
    physics.js          Movement and projectile updates
    player-controls.js  Translates player input into actions
    army-manager.js     Army spawning and lifecycle
    castle-manager.js   Gate HP tracking
    spatial-hash.js     Spatial partitioning for collision queries

client/
  index.html            Single-page entry
  css/style.css         Lobby and UI styles
  js/
    main.js             Client entry point
    game.js             Client game state management
    network.js          WebSocket connection handling
    lobby.js            Lobby UI (team/role selection)
    renderer.js         All Canvas drawing
    camera.js           Camera follow and overview mode
    interpolation.js    Snapshot interpolation for smooth rendering
    input.js            Keyboard and mouse input capture
    controls.js         Keybind definitions and help screen content
    roles.js            Role metadata (names, descriptions)
    hud.js              Heads-up display (HP, lives, army counts)
    particles.js        Visual particle effects
    help.js             Help overlay rendering

shared/
  constants.js          All game balance numbers, dimensions, timing
  message-types.js      Network message and event type enums

test/
  unit.js               Basic combat unit tests
```

## Balance Tuning

All balance constants live in `shared/constants.js`. Key values:

- Army composition: 60 swords, 48 spears, 22 archers, 10 gunners per side
- Player: 40 HP, 10 lives, 230 speed
- Gate: 200 HP
- Royals (King/Queen): 3000 HP each (70 HP in solo mode)
- Shield block: 95% damage reduction

## Tests

```bash
node --test test/unit.js
```

## License

No license file present.
