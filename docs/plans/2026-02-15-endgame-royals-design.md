# Endgame Royals Overhaul

## Problem
Royals (King/Queen) in FINAL_STAND are unkillable and dumb. They oscillate back and forth due to tether logic competing with target pursuit, move too slowly to catch anyone (speed 85 vs soldier 125), and have 3000 HP with 75% melee damage reduction. No visible health indicator for opponents.

## Design

### Balance
- ROYAL_HP: 3000 → 1000
- Boss armor: apply 25% multiplier to ALL AI damage (melee, projectile, hitscan) -- currently only melee
- Keep royal damage output high (King 40, Queen 35)

### Royal AI
- ROYAL_SPEED: 85 → 160 (faster than soldiers, creates threat)
- Replace hard tether cutoff with rubber-band pull (gradual force toward home, not a wall)
- Add charge attack: royal lunges at target, 2x speed burst, AoE cleave on arrival
- Target priority: prefer human players > nearest enemy cluster > nearest enemy
- Fix the oscillation: don't hard-stop at tether boundary, decelerate gradually

### Health Bar UI
- Larger overhead health bar on royals (wider than regular entity bars, named)
- Show "KING" / "QUEEN" label above the bar
- Color gradient: green > yellow > red by HP percentage
- Always visible (not just when damaged) since royals are boss entities
