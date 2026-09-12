// ---------------------------------------------------------------------------
// Shared UI helpers: background painting, buttons, text and toasts.
// ---------------------------------------------------------------------------

import { GAME_WIDTH, GAME_HEIGHT, GEM_COLORS } from './config.js';

export const FONT = '"Poppins", "Trebuchet MS", "Segoe UI", sans-serif';

export function textStyle(size, color = '#ffffff', extra = {}) {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    fontStyle: 'normal',
    ...extra,
  };
}

export function label(scene, x, y, str, size, color = '#ffffff', extra = {}) {
  return scene.add
    .text(x, y, str, textStyle(size, color, extra))
    .setOrigin(0.5)
    .setDepth(100);
}

export function panelTexture(scene, key, w, h, radius, color, alpha = 1, stroke = 0x000000, strokeAlpha = 0.0, strokeW = 0) {
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color, alpha);
    g.fillRoundedRect(0, 0, w, h, radius);
    if (strokeW > 0) {
      g.lineStyle(strokeW, stroke, strokeAlpha);
      g.strokeRoundedRect(0, 0, w, h, radius);
    }
    g.generateTexture(key, w, h);
    g.destroy();
  }
  return key;
}

/** Paint the shared purple space background with drifting glow shapes. */
export function paintBackground(scene) {
  const g = scene.add.graphics();
  g.fillGradientStyle(0x40206e, 0x40206e, 0x170a2e, 0x0a0417, 1);
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // drifting translucent orbs
  const orbs = [
    { x: 80, y: 220, r: 130, c: 0xa78bfa, a: 0.10 },
    { x: 660, y: 420, r: 170, c: 0x38bdf8, a: 0.08 },
    { x: 120, y: 900, r: 150, c: 0xff4d6d, a: 0.07 },
    { x: 620, y: 1050, r: 120, c: 0x4ade80, a: 0.08 },
    { x: 360, y: 120, r: 200, c: 0xffd23f, a: 0.05 },
  ];
  const sprites = orbs.map((o) => {
    const img = scene.add.image(o.x, o.y, 'pt_circle').setTint(o.c).setAlpha(o.a).setScale(o.r / 16);
    return img;
  });

  // tiny sparkles
  const sparkTexs = ['pt_star', 'pt_spark'];
  for (let i = 0; i < 10; i++) {
    const sp = scene.add
      .image(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT, sparkTexs[i % 2])
      .setAlpha(0.10 + Math.random() * 0.2)
      .setScale(0.4 + Math.random() * 0.7)
      .setAngle(Math.random() * 360);
    scene.tweens.add({
      targets: sp,
      alpha: 0.02,
      duration: 1200 + Math.random() * 1800,
      yoyo: true,
      repeat: -1,
      delay: Math.random() * 1200,
    });
  }

  // gentle drift for orbs
  sprites.forEach((img, i) => {
    scene.tweens.add({
      targets: img,
      x: img.x + (i % 2 === 0 ? 40 : -40),
      y: img.y + (i % 2 === 0 ? 30 : -30),
      duration: 6000 + i * 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  });
}

/** Create a rounded, gradient-free button. Returns a container. */
export function makeButton(scene, x, y, w, h, text, onClick, opts = {}) {
  const {
    color = 0x8b5cf6,
    colorOver = 0xa78bfa,
    textColor = '#ffffff',
    fontSize = Math.round(h * 0.34),
    depth = 200,
  } = opts;

  const c = scene.add.container(x, y).setDepth(depth);

  const shadow = scene.add.image(0, 4, panelTexture(scene, `btn_${w}_${h}_${color}_shadow`, w, h, h / 2, 0x000000, 0.35)).setVisible(true);
  const bg = scene.add.image(0, 0, panelTexture(scene, `btn_${w}_${h}_${color}`, w, h, h / 2, color, 1)).setInteractive({ useHandCursor: true });
  const txt = scene.add.text(0, 0, text, textStyle(fontSize, textColor)).setOrigin(0.5);

  c.add([shadow, bg, txt]);
  c.setSize(w, h);

  bg.on('pointerdown', () => {
    scene.tweens.add({ targets: c, scale: 0.94, duration: 80, yoyo: true });
    onClick && onClick();
  });
  bg.on('pointerover', () => {
    bg.setTexture(panelTexture(scene, `btn_${w}_${h}_${colorOver}`, w, h, h / 2, colorOver, 1));
    scene.tweens.add({ targets: c, scale: 1.04, duration: 120 });
  });
  bg.on('pointerout', () => {
    bg.setTexture(panelTexture(scene, `btn_${w}_${h}_${color}`, w, h, h / 2, color, 1));
    scene.tweens.add({ targets: c, scale: 1, duration: 120 });
  });

  c.setText = (str) => txt.setText(str);
  c.setEnabled = (en) => {
    bg.setInteractive(en ? { useHandCursor: true } : false);
    c.setAlpha(en ? 1 : 0.5);
  };
  return c;
}

/** Small circular icon button. Returns the container. */
export function makeIconButton(scene, x, y, size, iconKey, onClick, opts = {}) {
  const { color = 0x2c1a52, depth = 200, iconScale = 0.62 } = opts;
  const c = scene.add.container(x, y).setDepth(depth);
  const circle = scene.add.image(0, 0, panelTexture(scene, `circle_${size}_${color}`, size, size, size / 2, color, 1)).setInteractive({ useHandCursor: true });
  const icon = scene.add.image(0, 0, iconKey).setScale(iconScale * (size / 64));
  c.add([circle, icon]);
  c.setSize(size, size);

  circle.on('pointerdown', () => {
    scene.tweens.add({ targets: c, scale: 0.9, duration: 80, yoyo: true });
    onClick && onClick();
  });
  circle.on('pointerover', () => scene.tweens.add({ targets: c, scale: 1.08, duration: 120 }));
  circle.on('pointerout', () => scene.tweens.add({ targets: c, scale: 1, duration: 120 }));

  c.setEnabled = (en) => {
    circle.setInteractive(en ? { useHandCursor: true } : false);
    c.setAlpha(en ? 1 : 0.45);
  };
  return c;
}

/** Transient toast message that fades away. */
export function toast(scene, msg, color = '#ffffff') {
  const key = 'toast_' + msg.replace(/[^a-z0-9]/gi, '');
  panelTexture(scene, key, 560, 84, 42, 0x000000, 0.72);
  const c = scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 120).setDepth(600);
  const bg = scene.add.image(0, 0, key);
  const txt = scene.add.text(0, 0, msg, textStyle(28, color)).setOrigin(0.5);
  c.add([bg, txt]);
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, duration: 150 });
  scene.tweens.add({ targets: c, alpha: 0, duration: 250, delay: 1300, onComplete: () => c.destroy() });
  return c;
}

export function gemIcon(scene, x, y, type, scale = 1, special = null) {
  const key = special ? `s_${type}_${special}` : `g${type}`;
  return scene.add.image(x, y, key).setScale(scale);
}

export function starRow(scene, x, y, count, size = 40, gap = 46) {
  const icons = [];
  for (let i = 0; i < 3; i++) {
    const filled = i < count;
    const img = scene.add
      .image(x + (i - 1) * gap, y, filled ? 'icon_star' : 'icon_star_gray')
      .setScale(size / 64);
    icons.push(img);
  }
  return icons;
}

export function fmt(n) {
  return n.toLocaleString('en-US');
}
