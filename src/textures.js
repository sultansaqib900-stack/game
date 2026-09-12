// ---------------------------------------------------------------------------
// Procedural texture generation: gems, specials, particle sprites and UI icons.
// Everything is drawn with Phaser's Graphics API so no art assets are needed.
// ---------------------------------------------------------------------------

import { GEM_COLORS, GEM_SHAPES, SPECIAL_KEYS } from './config.js';

const SIZE = 64;
const C = SIZE / 2;

function starPoints(cx, cy, outer, inner, points = 5, rotation = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i * Math.PI) / points;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function polyPoints(cx, cy, radius, sides, rotation = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * Math.PI * 2) / sides;
    pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  }
  return pts;
}

/** Draw one gem onto the given graphics context. */
export function drawGem(g, cx, cy, type, special = null, radius = 28) {
  const col = GEM_COLORS[type];
  const shape = GEM_SHAPES[type];

  // outer light ring
  g.fillStyle(col.light, 1);
  g.fillCircle(cx, cy, radius);
  g.lineStyle(4, col.dark, 1);
  g.strokeCircle(cx, cy, radius - 2);
  // main body
  g.fillStyle(col.base, 1);
  g.fillCircle(cx, cy, radius - 6);

  // centre shape (colour-blind friendly differentiation), in white
  g.fillStyle(0xffffff, 0.95);
  switch (shape) {
    case 'circle':
      g.fillCircle(cx, cy, radius * 0.34);
      break;
    case 'diamond':
      g.fillPoints(polyPoints(cx, cy, radius * 0.46, 4, -Math.PI / 2), true);
      break;
    case 'star':
      g.fillPoints(starPoints(cx, cy, radius * 0.52, radius * 0.22, 5), true);
      break;
    case 'hexagon':
      g.fillPoints(polyPoints(cx, cy, radius * 0.42, 6, -Math.PI / 2), true);
      break;
    case 'square': {
      const s = radius * 0.64;
      g.fillRoundedRect(cx - s / 2, cy - s / 2, s, s, s * 0.18);
      break;
    }
    case 'triangle':
      g.fillPoints(polyPoints(cx, cy + radius * 0.06, radius * 0.46, 3, -Math.PI / 2), true);
      break;
    default:
      g.fillCircle(cx, cy, radius * 0.3);
  }

  // glossy highlight
  g.fillStyle(0xffffff, 0.35);
  g.fillEllipse(cx - radius * 0.34, cy - radius * 0.4, radius * 0.5, radius * 0.26);

  // ---- special overlays ----------------------------------------------------
  if (special) {
    g.lineStyle(3, 0xffffff, 1);
    g.fillStyle(0xffffff, 1);
    switch (special) {
      case SPECIAL_KEYS.h: {
        // horizontal capsule + left/right chevrons
        g.fillRoundedRect(cx - radius, cy - radius * 0.34, radius * 2, radius * 0.68, radius * 0.34);
        g.fillStyle(col.base, 1);
        g.fillTriangle(cx - radius * 0.62, cy, cx - radius * 0.12, cy - radius * 0.3, cx - radius * 0.12, cy + radius * 0.3);
        g.fillTriangle(cx + radius * 0.62, cy, cx + radius * 0.12, cy - radius * 0.3, cx + radius * 0.12, cy + radius * 0.3);
        break;
      }
      case SPECIAL_KEYS.v: {
        g.fillRoundedRect(cx - radius * 0.34, cy - radius, radius * 0.68, radius * 2, radius * 0.34);
        g.fillStyle(col.base, 1);
        g.fillTriangle(cx, cy - radius * 0.62, cx - radius * 0.3, cy - radius * 0.12, cx + radius * 0.3, cy - radius * 0.12);
        g.fillTriangle(cx, cy + radius * 0.62, cx - radius * 0.3, cy + radius * 0.12, cx + radius * 0.3, cy + radius * 0.12);
        break;
      }
      case SPECIAL_KEYS.flame: {
        g.fillPoints(starPoints(cx, cy, radius * 0.72, radius * 0.3, 5), true);
        g.fillStyle(col.base, 1);
        g.fillPoints(starPoints(cx, cy, radius * 0.44, radius * 0.18, 5), true);
        break;
      }
      case SPECIAL_KEYS.bomb: {
        g.fillCircle(cx, cy, radius * 0.58);
        g.fillStyle(col.base, 1);
        g.fillCircle(cx, cy, radius * 0.34);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(cx, cy - radius * 0.34, radius * 0.14);
        g.fillCircle(cx - radius * 0.3, cy + radius * 0.18, radius * 0.12);
        g.fillCircle(cx + radius * 0.3, cy + radius * 0.18, radius * 0.12);
        break;
      }
      default:
        break;
    }
  }
}

/** Generate every gem texture (normal + 4 specials per colour) + particles. */
export function generateAllTextures(scene) {
  // gems
  for (let t = 0; t < GEM_COLORS.length; t++) {
    let g = scene.make.graphics({ x: 0, y: 0 }, false);
    drawGem(g, C, C, t, null);
    g.generateTexture(`g${t}`, SIZE, SIZE);
    g.destroy();

    for (const key of Object.values(SPECIAL_KEYS)) {
      g = scene.make.graphics({ x: 0, y: 0 }, false);
      drawGem(g, C, C, t, key);
      g.generateTexture(`s_${t}_${key}`, SIZE, SIZE);
      g.destroy();
    }
  }

  // particles
  let g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(16, 16, 16);
  g.generateTexture('pt_circle', 32, 32);
  g.destroy();

  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillPoints(starPoints(16, 16, 15, 6, 5), true);
  g.generateTexture('pt_star', 32, 32);
  g.destroy();

  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRect(13, 2, 6, 28);
  g.fillRect(2, 13, 28, 6);
  g.generateTexture('pt_spark', 32, 32);
  g.destroy();

  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(3, 3, 26, 26, 6);
  g.generateTexture('pt_sq', 32, 32);
  g.destroy();

  generateIcons(scene);
}

function generateIcons(scene) {
  const icon = (name, size, draw) => {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g, size);
    g.generateTexture(name, size, size);
    g.destroy();
  };

  // back chevron
  icon('icon_back', 64, (g, s) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(40, 12, 40, 52, 18, 32);
  });

  // sound on
  icon('icon_sound', 64, (g, s) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(14, 26, 14, 38, 24, 38);
    g.fillRect(24, 32, 8, 0); // tiny base
    g.fillRoundedRect(20, 27, 8, 10, 2);
    g.lineStyle(5, 0xffffff, 1);
    g.beginPath();
    g.arc(32, 32, 12, -Math.PI / 3, Math.PI / 3);
    g.strokePath();
    g.beginPath();
    g.arc(32, 32, 22, -Math.PI / 3, Math.PI / 3);
    g.strokePath();
  });

  // sound off
  icon('icon_mute', 64, (g, s) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(14, 26, 14, 38, 24, 38);
    g.fillRoundedRect(20, 27, 8, 10, 2);
    g.lineStyle(5, 0xffffff, 1);
    g.lineBetween(38, 22, 52, 42);
    g.lineBetween(52, 22, 38, 42);
  });

  // star
  icon('icon_star', 64, (g, s) => {
    g.fillStyle(0xffd23f, 1);
    g.fillPoints(starPoints(32, 34, 26, 12, 5), true);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(24, 24, 6);
  });

  icon('icon_star_gray', 64, (g, s) => {
    g.fillStyle(0x8a84a8, 0.55);
    g.fillPoints(starPoints(32, 34, 26, 12, 5), true);
  });

  // lock
  icon('icon_lock', 64, (g, s) => {
    g.fillStyle(0x8a84a8, 1);
    g.fillRoundedRect(14, 28, 36, 26, 6);
    g.lineStyle(5, 0x8a84a8, 1);
    g.beginPath();
    g.arc(32, 26, 11, Math.PI, 0);
    g.strokePath();
  });

  // hammer
  icon('icon_hammer', 64, (g, s) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(26, 12, 10, 22);
    g.save();
    g.translateCanvas(36, 40);
    g.rotateCanvas(-0.6);
    g.fillRoundedRect(-6, -22, 20, 34, 6);
    g.restore();
  });

  // shuffle
  icon('icon_shuffle', 64, (g, s) => {
    g.lineStyle(5, 0xffffff, 1);
    g.lineBetween(10, 22, 34, 22);
    g.lineBetween(30, 42, 54, 42);
    g.lineBetween(14, 22, 20, 16);
    g.lineBetween(14, 22, 20, 28);
    g.lineBetween(50, 42, 44, 36);
    g.lineBetween(50, 42, 44, 48);
  });

  // question / hint
  icon('icon_hint', 64, (g, s) => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(32, 32, 22);
    g.fillStyle(0x6d28d9, 1);
    g.fillCircle(32, 32, 17);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(32, 24, 3.5);
    g.fillRoundedRect(28, 32, 8, 12, 3);
  });

  // next (arrow)
  icon('icon_next', 64, (g, s) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(22, 14, 22, 50, 48, 32);
  });

  // retry
  icon('icon_retry', 64, (g, s) => {
    g.lineStyle(6, 0xffffff, 1);
    g.beginPath();
    g.arc(32, 32, 20, -Math.PI / 2, Math.PI * 1.4);
    g.strokePath();
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(52, 20, 42, 10, 46, 24);
  });

  // home
  icon('icon_home', 64, (g, s) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(32, 10, 6, 34, 58, 34);
    g.fillRoundedRect(16, 32, 32, 22, 4);
    g.fillStyle(0x6d28d9, 1);
    g.fillRoundedRect(28, 40, 8, 14, 3);
  });

  // play
  icon('icon_play', 64, (g, s) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(22, 14, 22, 50, 50, 32);
  });
}
