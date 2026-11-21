import * as THREE from 'three';
import { categoryById } from './config.js';
import { FONT, makeCanvas, canvasTexture, roundRect, wrapText } from './textures.js';

const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.75, 4, 10);
const headGeo = new THREE.SphereGeometry(0.16, 16, 12);
const eyeGeo = new THREE.SphereGeometry(0.025, 6, 6);
const skin = new THREE.MeshLambertMaterial({ color: '#f1c9a5' });
const eyeMat = new THREE.MeshBasicMaterial({ color: '#111827' });

/** 名札のテクスチャ */
export function nameTagTexture(profile) {
  const cat = categoryById(profile.category);
  const w = 512, h = 200;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  roundRect(ctx, 4, 4, w - 8, h - 8, 22);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = cat.color; ctx.stroke();
  // 区分の帯
  ctx.save();
  roundRect(ctx, 4, 4, w - 8, 56, 22);
  ctx.clip();
  ctx.fillStyle = cat.color; ctx.fillRect(0, 0, w, 60);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 34px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(cat.label, 22, 34);
  // 名前
  ctx.fillStyle = '#111827';
  ctx.font = `bold 60px ${FONT}`;
  ctx.fillText(profile.name || 'ゲスト', 22, 106, w - 44 - (profile.minor ? 70 : 0));
  // 業界・所属
  ctx.fillStyle = '#4b5563';
  ctx.font = `30px ${FONT}`;
  const sub = [profile.industry, profile.org].filter(Boolean).join('｜');
  ctx.fillText(sub || ' ', 22, 162, w - 44);
  // 未成年リボン
  if (profile.minor) {
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(w - 70, 78); ctx.lineTo(w - 30, 78); ctx.lineTo(w - 30, 140); ctx.lineTo(w - 50, 124); ctx.lineTo(w - 70, 140);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText('未', w - 59, 98);
  }
  return canvasTexture(c);
}

function bubbleTexture(text) {
  const w = 512, h = 160;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.font = `bold 34px ${FONT}`;
  const lines = wrapText(ctx, text, w - 60).slice(0, 3);
  roundRect(ctx, 4, 4, w - 8, h - 8, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#94a3b8'; ctx.stroke();
  ctx.fillStyle = '#111827';
  ctx.textBaseline = 'middle';
  const lh = 42;
  const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, 30, y0 + i * lh));
  return canvasTexture(c);
}

export class Avatar {
  constructor(profile, { self = false } = {}) {
    this.group = new THREE.Group();
    this.profile = {};
    this.self = self;
    this.bodyMat = new THREE.MeshLambertMaterial({ color: '#888' });
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.body.position.y = 0.6;
    this.head = new THREE.Group();
    this.head.position.y = 1.5;
    const headMesh = new THREE.Mesh(headGeo, skin);
    const e1 = new THREE.Mesh(eyeGeo, eyeMat); e1.position.set(-0.06, 0.03, -0.145);
    const e2 = e1.clone(); e2.position.x = 0.06;
    this.head.add(headMesh, e1, e2);
    this.group.add(this.body, this.head);

    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: true }));
    this.tag.scale.set(0.9, 0.35, 1);
    this.tag.position.y = 2.05;
    this.group.add(this.tag);
    // 胸の名札（自分視点でも見える）
    this.chestTag = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.1), new THREE.MeshBasicMaterial());
    this.chestTag.position.set(0, 1.08, -0.225);
    this.chestTag.rotation.y = Math.PI;
    this.group.add(this.chestTag);

    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    this.bubble.scale.set(1.2, 0.375, 1);
    this.bubble.position.y = 2.55;
    this.bubble.visible = false;
    this.group.add(this.bubble);
    this.bubbleUntil = 0;

    this.target = { x: 0, z: 0, ry: 0, pitch: 0 };
    this.setProfile(profile);
    if (self) {
      // 自分の体は自分のカメラから見えないよう非表示（名札は他の人用）
      this.body.visible = false; this.head.visible = false; this.tag.visible = false; this.chestTag.visible = false;
    }
  }

  setProfile(p) {
    const key = JSON.stringify([p.name, p.category, p.industry, p.org, p.minor]);
    if (key === this._key) return;
    this._key = key;
    this.profile = { ...p };
    this.bodyMat.color.set(categoryById(p.category).color);
    const tex = nameTagTexture(p);
    this.tag.material.map?.dispose();
    this.tag.material.map = tex;
    this.tag.material.needsUpdate = true;
    this.chestTag.material.map = tex;
    this.chestTag.material.needsUpdate = true;
  }

  say(text, now) {
    this.bubble.material.map?.dispose();
    this.bubble.material.map = bubbleTexture(text);
    this.bubble.material.needsUpdate = true;
    this.bubble.visible = !this.self;
    this.bubbleUntil = now + 6000;
  }

  setTarget(x, z, ry, pitch = 0) {
    this.target = { x, z, ry, pitch };
    if (!this._placed) { this.group.position.set(x, 0, z); this.group.rotation.y = ry; this._placed = true; }
  }

  update(dt, now) {
    const k = 1 - Math.exp(-dt * 10);
    const p = this.group.position;
    p.x += (this.target.x - p.x) * k;
    p.z += (this.target.z - p.z) * k;
    let d = this.target.ry - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * k;
    this.head.rotation.x += (this.target.pitch - this.head.rotation.x) * k;
    if (this.bubble.visible && now > this.bubbleUntil) this.bubble.visible = false;
  }

  dispose() {
    this.tag.material.map?.dispose();
    this.bubble.material.map?.dispose();
    this.group.removeFromParent();
  }
}
