import * as THREE from 'three';

export const FONT = '"Hiragino Sans","Noto Sans JP","Noto Sans CJK JP","Yu Gothic",Meiryo,sans-serif';

// 長い文字列を幅に合わせて折り返す（日本語は1文字単位）
export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of String(text)) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = ch; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 看板（タイトル＋サブ）
export function signTexture(title, sub, { bg = '#ffffff', fg = '#111827', accent = '#ea580c', w = 1024, h = 320 } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 18, h);
  ctx.fillStyle = fg;
  ctx.font = `bold ${Math.round(h * 0.3)}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 50, sub ? h * 0.36 : h / 2, w - 80);
  if (sub) {
    ctx.font = `${Math.round(h * 0.13)}px ${FONT}`;
    ctx.fillStyle = '#4b5563';
    const lines = wrapText(ctx, sub, w - 90).slice(0, 2);
    lines.forEach((l, i) => ctx.fillText(l, 52, h * 0.7 + i * h * 0.16));
  }
  return canvasTexture(c);
}

// スライド（画像が無いときのプレースホルダー）
export function drawSlide(ctx, w, h, slide, index, total, zoneLabel) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#0f172a'); g.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f97316'; ctx.fillRect(0, h - 14, w * ((index + 1) / Math.max(total, 1)), 14);
  ctx.fillStyle = '#93c5fd';
  ctx.font = `${Math.round(h * 0.05)}px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(`第3回TMC同窓会　｜　${zoneLabel}`, w * 0.06, h * 0.07);
  ctx.textAlign = 'right';
  ctx.fillText(`${index + 1} / ${total}`, w * 0.94, h * 0.07);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(h * 0.11)}px ${FONT}`;
  const tl = wrapText(ctx, slide.title || '', w * 0.88).slice(0, 2);
  tl.forEach((l, i) => ctx.fillText(l, w * 0.06, h * 0.32 + i * h * 0.13));
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `${Math.round(h * 0.06)}px ${FONT}`;
  const sl = wrapText(ctx, slide.sub || '', w * 0.88).slice(0, 3);
  sl.forEach((l, i) => ctx.fillText(l, w * 0.06, h * 0.32 + tl.length * h * 0.13 + h * 0.05 + i * h * 0.08));
}
