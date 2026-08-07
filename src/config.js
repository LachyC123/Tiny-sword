/**
 * All tuning lives here. Numbers that came from measuring the art are marked
 * as such — don't "clean them up" without re-measuring.
 */

// --- art geometry (measured from the sheets, see tools/build-manifest.mjs) ---
// Units render from a 192px cell; the character's feet sit at y=137 and its
// horizontal centre at x=96. shadow.png is authored to the same anchor.
export const ANCHOR = { x: 96, y: 137 };
export const TILE = 64;

// --- virtual viewport ------------------------------------------------------
// We fix world-space height and let width follow the device aspect, so a wide
// phone sees more arena rather than smaller characters.
export const VIEW_H = 470;
export const MIN_VIEW_W = 560;

// --- feel ------------------------------------------------------------------
export const FEEL = {
  hitStopMs: 75,          // freeze on impact — the single biggest feel win
  hitStopKillMs: 130,     // longer freeze on a kill
  flashMs: 110,           // white tint duration on taking a hit
  shakeOnHit: 0.32,       // trauma added per hit (trauma is squared for offset)
  shakeOnKill: 0.5,
  shakeMax: 16,           // px cap — never let it get nauseating
  shakeDecay: 1.9,        // trauma units per second
  cameraLead: 46,         // px the camera pushes ahead of movement
  cameraLerp: 5.2,
  knockback: 128,         // px/s applied on hit
  knockbackDecay: 7.5,
};

export const PLAYER = {
  speed: 168,
  maxHp: 100,
  attack: {
    // Two-hit combo. `hitFrame` is the frame the hitbox goes live on.
    combo: [
      { anim: 'attack1', hitFrame: 2, damage: 14, reach: 74, arc: 1.5, lunge: 96 },
      { anim: 'attack2', hitFrame: 2, damage: 19, reach: 80, arc: 1.7, lunge: 128 },
    ],
    comboWindowMs: 460,   // press again inside this to chain
    cooldownMs: 90,
  },
  guard: { damageMul: 0.25, speedMul: 0.42, knockbackMul: 0.3 },
  invulnMs: 420,          // i-frames after being hit
};

export const ENEMY = {
  warrior: {
    unit: 'warrior',
    speed: 74,
    maxHp: 40,
    damage: 9,
    reach: 66,
    arc: 1.4,
    aggroRange: 460,
    attackRange: 60,
    windupMs: 260,        // telegraph — the player needs time to read it
    recoverMs: 520,
    hitFrame: 2,
    anim: 'attack1',
  },
  archer: {
    unit: 'archer',
    speed: 62,
    maxHp: 26,
    damage: 7,
    aggroRange: 620,
    attackRange: 300,
    keepAway: 190,        // backs off if the player closes inside this
    windupMs: 300,
    recoverMs: 950,
    hitFrame: 5,
    anim: 'shoot',
    projectileSpeed: 330,
  },
};

export const WAVES = [
  { warrior: 2, archer: 0 },
  { warrior: 3, archer: 1 },
  { warrior: 3, archer: 2 },
  { warrior: 5, archer: 2 },
];

export const ISLAND = { w: 21, h: 13 };
