import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILDINGS, ZONES, CAMPUS, PLACES, buildingById } from './config.js';
import { signTexture, makeCanvas, canvasTexture, drawSlide, FONT } from './textures.js';
import { sideOf, NORMAL, OPPOSITE, buildingNav, route, locate } from './nav.js';

const FLOOR_H = 3.2;  // 1階の天井の高さ
const WALL_T = 0.15;

const lambert = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

/** 向き ry（-z が正面）のときの左右方向 */
const lateral = (ry) => ({ x: Math.cos(ry), z: -Math.sin(ry) });
const yawFacing = (fx, fz) => Math.atan2(-fx, -fz);

/** 同じ形をたくさん置く */
function instances(group, geo, mat, list) {
  if (!list.length) return;
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  list.forEach((t, i) => {
    q.setFromAxisAngle(up, t.ry || 0);
    v.set(t.x, t.y || 0, t.z);
    s.set(t.sx || 1, t.sy || 1, t.sz || 1);
    m4.compose(v, q, s);
    m.setMatrixAt(i, m4);
  });
  group.add(m);
  return m;
}

// ---------------- 家具の形 ----------------
function chairGeo() {
  const seat = new THREE.BoxGeometry(0.44, 0.04, 0.42); seat.translate(0, 0.45, 0);
  const back = new THREE.BoxGeometry(0.42, 0.42, 0.03); back.translate(0, 0.68, 0.2);
  const leg = new THREE.BoxGeometry(0.04, 0.45, 0.04);
  const legs = [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]].map(([x, z]) => leg.clone().translate(x, 0.225, z));
  return mergeGeometries([seat, back, ...legs]);
}
function tableGeo(w, d, h) {
  const top = new THREE.BoxGeometry(w, 0.04, d); top.translate(0, h, 0);
  const post = new THREE.BoxGeometry(0.06, h, 0.06); post.translate(0, h / 2, 0);
  const foot = new THREE.BoxGeometry(Math.min(w, 0.6), 0.03, 0.08); foot.translate(0, 0.015, 0);
  const foot2 = foot.clone().rotateY(Math.PI / 2);
  return mergeGeometries([top, post, foot, foot2]);
}
function deskGeo() { // 2人用の白い長机（教室の写真）
  const top = new THREE.BoxGeometry(1.2, 0.03, 0.45); top.translate(0, 0.72, 0);
  const l1 = new THREE.BoxGeometry(0.04, 0.72, 0.4); l1.translate(-0.56, 0.36, 0);
  const l2 = l1.clone().translate(1.12, 0, 0);
  return mergeGeometries([top, l1, l2]);
}
const CHAIR = chairGeo();
const DESK = deskGeo();
const CAFE_TABLE = tableGeo(0.75, 0.75, 0.72);

// ---------------- 窓のテクスチャ ----------------
function facadeTexture(base = '#e5e7eb', win = '#94a3b8') {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  g.fillStyle = win; g.fillRect(16, 28, 96, 64);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(16, 28, 96, 8);
  g.fillStyle = '#cbd5e1'; g.fillRect(62, 28, 4, 64);
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const FACADE = facadeTexture();
function facadeMat(w, h, color) {
  const t = FACADE.clone();
  t.repeat.set(Math.max(1, Math.round(w / 3.2)), Math.max(1, Math.round(h / FLOOR_H)));
  t.needsUpdate = true;
  return new THREE.MeshLambertMaterial(color ? { map: t, color } : { map: t });
}

// ---------------- 壁 ----------------
/** rect の4辺に壁を立てる。gaps: { n: [[a,b]], ... }（辺に沿った座標の範囲）。skip: 立てない辺 */
function rectWalls(group, rect, { mat, height = FLOOR_H, gaps = {}, skip = [], lintel = true }) {
  const [x0, z0, x1, z1] = rect;
  const lines = { n: ['x', z0, x0, x1], s: ['x', z1, x0, x1], w: ['z', x0, z0, z1], e: ['z', x1, z0, z1] };
  for (const [side, [along, fixed, from, to]] of Object.entries(lines)) {
    if (skip.includes(side)) continue;
    const gs = (gaps[side] || []).slice().sort((a, b) => a[0] - b[0]);
    let cur = from;
    const segs = [];
    for (const g of gs) { if (g[0] > cur) segs.push([cur, g[0]]); cur = Math.max(cur, g[1]); }
    if (cur < to) segs.push([cur, to]);
    const put = (a, b, h, y) => {
      const len = b - a;
      if (len < 0.05) return;
      const m = along === 'x' ? box(len, h, WALL_T, mat) : box(WALL_T, h, len, mat);
      if (along === 'x') m.position.set((a + b) / 2, y, fixed); else m.position.set(fixed, y, (a + b) / 2);
      group.add(m);
    };
    for (const [a, b] of segs) put(a, b, height, height / 2);
    if (lintel) for (const g of gs) put(g[0], g[1], height - 2.3, 2.3 + (height - 2.3) / 2);
  }
}
/** 出入口の一覧 → rectWalls 用の gaps */
const gapsFor = (rect, doors) => {
  const g = {};
  for (const d of doors) { const [side, r] = gapFor(rect, d); (g[side] ||= []).push(r); }
  return g;
};
const gapFor = (rect, door) => {
  const side = sideOf(rect, door);
  const c = side === 'n' || side === 's' ? door.x : door.z;
  return [side, [c - door.w / 2, c + door.w / 2]];
};

function addPlane(group, tex, w, h, pos, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.copy(pos);
  m.rotation.y = ry;
  group.add(m);
  return m;
}

function labelSprite(text, scale = 1) {
  const c = makeCanvas(512, 128);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(22,101,52,0.92)';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#fff';
  g.font = `bold 64px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 66, 480);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), transparent: true }));
  sp.scale.set(8 * scale, 2 * scale, 1);
  return sp;
}

/** スクリーン：スライドを描画するキャンバス付きの板 */
class Screen {
  constructor(zone, width, height) {
    this.zone = zone;
    this.canvas = makeCanvas(1280, 720);
    this.ctx = this.canvas.getContext('2d');
    this.texture = canvasTexture(this.canvas);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.texture }));
    this.slides = [];
    this.index = 0;
    this.images = new Map();
  }
  setSlides(slides) {
    this.slides = slides && slides.length ? slides : [{ title: this.zone.label, sub: '（この時間はスライドなし）' }];
    this.index = Math.min(this.index, this.slides.length - 1);
    this.render();
  }
  setIndex(i) {
    const n = this.slides.length;
    this.index = ((i % n) + n) % n;
    this.render();
  }
  render() {
    const s = this.slides[this.index];
    const { ctx, canvas } = this;
    const src = typeof s === 'string' ? s : s.image;
    if (src) {
      let img = this.images.get(src);
      if (!img) {
        img = new Image();
        img.onload = () => this.render();
        img.onerror = () => { img.failed = true; this.render(); };
        img.src = src;
        this.images.set(src, img);
      }
      if (img.complete && img.naturalWidth) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const r = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
        const w = img.naturalWidth * r, h = img.naturalHeight * r;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      } else {
        drawSlide(ctx, canvas.width, canvas.height, { title: img.failed ? '画像を読み込めません' : '読み込み中…', sub: src }, this.index, this.slides.length, this.zone.label);
      }
    } else {
      drawSlide(ctx, canvas.width, canvas.height, s, this.index, this.slides.length, this.zone.label);
    }
    this.texture.needsUpdate = true;
  }
}

// ---------------- 部屋の座標系 ----------------
/** 部屋の「前（スクリーン側）」を基準にした座標系。toWorld(a, b): a=左右, b=前の壁からの距離 */
function roomFrame(zone) {
  const [x0, z0, x1, z1] = zone.rect;
  const doorSide = sideOf(zone.rect, zone.doors[0]);
  const front = zone.screenSide || OPPOSITE[doorSide];
  const [fx, fz] = NORMAL[front];
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const depth = front === 'n' || front === 's' ? z1 - z0 : x1 - x0;
  const width = front === 'n' || front === 's' ? x1 - x0 : z1 - z0;
  const ry = yawFacing(fx, fz); // 前を向く向き
  const l = lateral(ry);
  const fm = { x: cx + (fx * depth) / 2, z: cz + (fz * depth) / 2 };
  const toWorld = (a, b) => ({ x: fm.x + l.x * a - fx * b, z: fm.z + l.z * a - fz * b });
  return { front, doorSide, ry, width, depth, toWorld, cx, cz, f: { x: fx, z: fz } };
}

// ---------------- 部屋ごとの家具 ----------------
function furnishClassroom(group, zone, F, { reception = false } = {}) {
  const seats = [], spots = [];
  const chairs = [], desks = [];
  // 黒板（前の壁）
  const board = box(Math.min(F.width - 1.5, 7), 1.2, 0.05, lambert('#1f3b2d'));
  const bp = F.toWorld(0, 0.1);
  board.position.set(bp.x, 1.55, bp.z);
  board.rotation.y = F.ry;
  group.add(board);
  const tray = box(Math.min(F.width - 1.5, 7), 0.04, 0.12, lambert('#9ca3af'));
  tray.position.set(bp.x, 0.93, bp.z);
  tray.rotation.y = F.ry;
  group.add(tray);
  // 教卓
  const lec = box(1.4, 0.9, 0.6, lambert('#a16207'));
  const lp = F.toWorld(-F.width * 0.25, 1.3);
  lec.position.set(lp.x, 0.45, lp.z);
  lec.rotation.y = F.ry;
  group.add(lec);
  spots.push({ ...F.toWorld(-F.width * 0.25, 0.8), ry: F.ry + Math.PI, staff: true });

  if (reception) {
    // 受付机（後ろの出入口の近く。受付→そのまま着席して開会式）
    const back = F.depth;
    for (const k of [-1.4, 1.4]) {
      const p = F.toWorld(k, back - 2.6);
      desks.push({ ...p, ry: F.ry });
      const st = F.toWorld(k, back - 3.2);
      chairs.push({ ...st, ry: F.ry + Math.PI });
      spots.push({ ...st, ry: F.ry + Math.PI, staff: true });
      for (let i = 0; i < 3; i++) {
        const q = F.toWorld(k + (i - 1) * 0.35, back - 2.6);
        const bx = box(0.22, 0.08, 0.16, lambert(['#60a5fa', '#f87171', '#facc15'][i]));
        bx.position.set(q.x, 0.78, q.z);
        bx.rotation.y = F.ry;
        group.add(bx);
      }
    }
    for (let i = 0; i < 12; i++) {
      spots.push({ ...F.toWorld(-2.75 + (i % 6) * 1.1, back - 1.7 + Math.floor(i / 6) * 0.8), ry: F.ry });
    }
    const sp = F.toWorld(0, back - 2.6);
    addPlane(group, signTexture('受付', '名札・未成年リボン', { accent: '#ca8a04' }), 1.6, 0.5,
      new THREE.Vector3(sp.x, 2.4, sp.z), F.ry + Math.PI);
  }
  {
    // 白い2人用長机＋緑の椅子の列（写真の2号館教室）
    const aisle = 1.0;
    const cols = Math.max(1, Math.floor((F.width - 1.2) / (1.2 + aisle)));
    const rows = Math.max(1, Math.floor((F.depth - 3.4 - (reception ? 3.6 : 0)) / 1.15));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = -((cols - 1) * (1.2 + aisle)) / 2 + c * (1.2 + aisle);
        const b = 2.6 + r * 1.15;
        desks.push({ ...F.toWorld(a, b), ry: F.ry });
        for (const s of [-0.3, 0.3]) {
          const p = F.toWorld(a + s, b + 0.45);
          chairs.push({ ...p, ry: F.ry });
          seats.push({ ...p, ry: F.ry, seated: true });
        }
      }
    }
  }
  instances(group, DESK, lambert('#f8fafc'), desks.map((d) => ({ ...d })));
  instances(group, CHAIR, lambert('#3f6212'), chairs);

  // 窓（建物の外壁に面した辺）とカーテン
  const bRect = buildingById(zone.building).rect;
  const onEdge = { w: zone.rect[0] === bRect[0], e: zone.rect[2] === bRect[2], n: zone.rect[1] === bRect[1], s: zone.rect[3] === bRect[3] };
  const winSide = ['n', 's', 'e', 'w'].find((sd) => onEdge[sd] && sd !== F.front && sd !== F.doorSide);
  if (!winSide) return { seats, spots };
  const [x0, z0, x1, z1] = zone.rect;
  const wlen = winSide === 'n' || winSide === 's' ? x1 - x0 : z1 - z0;
  const [wx, wz] = NORMAL[winSide];
  const wc = { x: (x0 + x1) / 2 + (wx * (x1 - x0)) / 2 - wx * 0.1, z: (z0 + z1) / 2 + (wz * (z1 - z0)) / 2 - wz * 0.1 };
  const wry = yawFacing(wx, wz);
  const nWin = Math.max(1, Math.floor(wlen / 2.6));
  for (let i = 0; i < nWin; i++) {
    const t = -wlen / 2 + (i + 0.5) * (wlen / nWin);
    const lx = lateral(wry);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.5), new THREE.MeshBasicMaterial({ color: '#e0f2fe' }));
    win.position.set(wc.x + lx.x * t, 1.75, wc.z + lx.z * t);
    win.rotation.y = wry;
    group.add(win);
    const cur = box(0.35, 1.9, 0.04, lambert('#e7dcc4'));
    cur.position.set(wc.x + lx.x * (t + 1.05) - wx * 0.03, 1.7, wc.z + lx.z * (t + 1.05) - wz * 0.03);
    cur.rotation.y = wry;
    group.add(cur);
  }
  return { seats, spots };
}

function furnishCafeteria(group, zone, F) {
  const seats = [], spots = [];
  const tables = [], chairs = [], chairs2 = [], chairs3 = [];
  // 木の四角いテーブルを2つ並べた島（写真の葵テラスEAST）
  const usableW = F.width - 4, usableD = F.depth - 6;
  const cols = Math.max(1, Math.floor(usableW / 3.0));
  const rows = Math.max(1, Math.floor(usableD / 2.4));
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = -usableW / 2 + 1.5 + c * (usableW / cols) + ((usableW / cols) - 3) / 2;
      const b = 4.2 + r * (usableD / rows);
      for (const s of [-0.375, 0.375]) tables.push({ ...F.toWorld(a + s, b), ry: F.ry });
      for (const [da, db, face] of [[-0.375, -0.65, 0], [0.375, -0.65, 0], [-0.375, 0.65, Math.PI], [0.375, 0.65, Math.PI]]) {
        const p = F.toWorld(a + da, b + db);
        const ry = F.ry + face + Math.PI;
        const list = [chairs, chairs2, chairs3][k++ % 3];
        list.push({ ...p, ry });
        seats.push({ ...p, ry, seated: true });
      }
      spots.push({ ...F.toWorld(a - 1.1, b), ry: F.ry - Math.PI / 2 }, { ...F.toWorld(a + 1.1, b), ry: F.ry + Math.PI / 2 });
    }
  }
  instances(group, CAFE_TABLE, lambert('#e6c99a'), tables);
  instances(group, CHAIR, lambert('#f5f5f4'), chairs);
  instances(group, CHAIR, lambert('#6b7f3a'), chairs2);
  instances(group, CHAIR, lambert('#94a3b8'), chairs3);

  // コンクリートの柱（2列）
  const pillars = [];
  for (const a of [-F.width / 2 + 5, F.width / 2 - 5]) {
    for (let b = 6; b < F.depth - 2; b += 7) pillars.push({ ...F.toWorld(a, b), y: FLOOR_H / 2 });
  }
  instances(group, new THREE.BoxGeometry(0.8, FLOOR_H, 0.8), lambert('#d4d4d4'), pillars);

  // ペンダントライト
  const lamps = [];
  for (let b = 5; b < F.depth - 2; b += 3.5) lamps.push({ ...F.toWorld(F.width / 2 - 2, b), y: 2.3 });
  const cone = new THREE.ConeGeometry(0.22, 0.25, 16, 1, true);
  const cord = new THREE.CylinderGeometry(0.005, 0.005, 0.8, 4); cord.translate(0, 0.52, 0);
  instances(group, mergeGeometries([cone, cord]), lambert('#111827', { side: THREE.DoubleSide }), lamps);
  instances(group, new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#fef3c7' }), lamps.map((l) => ({ ...l, y: 2.2 })));

  // 植栽ボックス
  const pl = F.toWorld(-F.width / 2 + 3.5, F.depth - 4);
  const planter = box(5, 0.9, 0.7, lambert('#c9a477'));
  planter.position.set(pl.x, 0.45, pl.z);
  planter.rotation.y = F.ry + Math.PI / 2;
  group.add(planter);
  const leaves = [];
  for (let i = 0; i < 10; i++) {
    const p = F.toWorld(-F.width / 2 + 3.5, F.depth - 6.3 + i * 0.5);
    leaves.push({ ...p, y: 1.0, sx: 1, sy: 0.7, sz: 1 });
  }
  instances(group, new THREE.IcosahedronGeometry(0.32, 0), lambert('#4d7c0f'), leaves);

  // 料理カウンター（前の壁ぎわ）
  const counterP = F.toWorld(0, 1.6);
  const counter = box(Math.min(8, F.width - 6), 0.85, 0.9, lambert('#57534e'));
  counter.position.set(counterP.x, 0.425, counterP.z);
  counter.rotation.y = F.ry;
  group.add(counter);
  for (let i = 0; i < 6; i++) {
    const p = F.toWorld(-3 + i * 1.2, 1.6);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.06, 16), lambert(['#fca5a5', '#fde68a', '#86efac'][i % 3]));
    plate.position.set(p.x, 0.88, p.z);
    group.add(plate);
  }
  spots.push({ ...F.toWorld(-2, 2.6), ry: F.ry, staff: true }, { ...F.toWorld(2, 2.6), ry: F.ry, staff: true });

  // 窓ぎわのカウンター席
  const barSide = F.width / 2 - 0.6;
  const bars = [];
  for (let b = 4; b < F.depth - 2; b += 4) bars.push({ ...F.toWorld(barSide, b), y: 0.9, ry: F.ry + Math.PI / 2 });
  instances(group, new THREE.BoxGeometry(3.6, 0.05, 0.45), lambert('#d6b98c'), bars);
  return { seats, spots };
}

// ---------------- 組み立て ----------------
export function buildVenue(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const screens = new Map();
  const zoneMeta = new Map();
  const wallMat = lambert('#f1f5f9');

  // 地面（芝生）と広場の舗装
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), lambert('#86a96b'));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  group.add(ground);
  const [bx0, bz0, bx1, bz1] = CAMPUS.bounds;
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(bx1 - bx0, bz1 - bz0), lambert('#d6d3d1'));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set((bx0 + bx1) / 2, -0.08, (bz0 + bz1) / 2);
  group.add(plaza);
  // 道（正門→2号館→葵テラスEAST の屋外部分を少し濃く）
  const paths = [route(PLACES.gate, 'hall'), route(buildingNav.get('b2').entrances[0].outside, 'terrace')];
  for (const pts of paths) {
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const mid = locate((p.x + q.x) / 2, (p.z + q.z) / 2);
      if (mid.building) continue;
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      if (len < 0.5) continue;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(3, len + 3), lambert('#bfb8ae'));
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = -Math.atan2(q.x - p.x, -(q.z - p.z));
      road.position.set((p.x + q.x) / 2, -0.03, (p.z + q.z) / 2);
      group.add(road);
    }
  }

  // 木（キャンパスの外周）
  const trees = [];
  for (let z = bz1 - 4; z > bz0; z -= 6) trees.push({ x: bx0 + 2, z }, { x: bx1 - 2, z });
  for (let x = bx0 + 6; x < bx1; x += 6) if (Math.abs(x - PLACES.gate.x) > 6) trees.push({ x, z: bz1 - 2 });
  instances(group, new THREE.CylinderGeometry(0.15, 0.2, 2, 6).translate(0, 1, 0), lambert('#7c5c3b'), trees);
  instances(group, new THREE.ConeGeometry(1.6, 4, 8).translate(0, 3.8, 0), lambert('#4d8b3a'), trees);

  // 正門
  const gate = PLACES.gate;
  for (const dx of [-3.5, 3.5]) {
    const post = box(0.6, 2.4, 0.6, lambert('#78716c'));
    post.position.set(gate.x + dx, 1.2, gate.z);
    group.add(post);
  }
  const gl = labelSprite('正門', 0.6);
  gl.position.set(gate.x, 4, gate.z);
  group.add(gl);

  // 建物
  for (const b of BUILDINGS) {
    const [x0, z0, x1, z1] = b.rect;
    const w = x1 - x0, d = z1 - z0;
    const label = labelSprite(b.label, b.venue ? 0.8 : 0.6);
    label.position.set((x0 + x1) / 2, b.height + 2, (z0 + z1) / 2);
    group.add(label);
    if (!b.venue) {
      const mass = new THREE.Mesh(new THREE.BoxGeometry(w, b.height, d), [
        facadeMat(d, b.height), facadeMat(d, b.height), lambert('#cbd5e1'), lambert('#cbd5e1'), facadeMat(w, b.height), facadeMat(w, b.height),
      ]);
      mass.position.set((x0 + x1) / 2, b.height / 2, (z0 + z1) / 2);
      group.add(mass);
      continue;
    }
    // 会場の建物: 1階は中に入れる。上の階は外観だけ
    const upperH = b.height - FLOOR_H;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(w, upperH, d), [
      facadeMat(d, upperH), facadeMat(d, upperH), lambert('#cbd5e1'), lambert('#cbd5e1'), facadeMat(w, upperH), facadeMat(w, upperH),
    ]);
    upper.position.set((x0 + x1) / 2, FLOOR_H + upperH / 2, (z0 + z1) / 2);
    group.add(upper);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: b.glass ? '#ece9e2' : '#e8ebef' }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((x0 + x1) / 2, FLOOR_H - 0.02, (z0 + z1) / 2);
    group.add(ceil);
    // 天井の照明（葵テラスは長いライン照明、2号館は蛍光灯）
    const strips = [];
    if (b.glass) {
      for (let x = x0 + 2; x < x1 - 1; x += 3) strips.push({ x, z: (z0 + z1) / 2, y: FLOOR_H - 0.05, sx: 1, sz: d - 3 });
      instances(group, new THREE.BoxGeometry(0.12, 0.04, 1), new THREE.MeshBasicMaterial({ color: '#fff7e0' }), strips);
    } else {
      for (let x = x0 + 2; x < x1 - 1; x += 3.5) for (let z = z0 + 2; z < z1 - 1; z += 3) strips.push({ x, z, y: FLOOR_H - 0.05 });
      instances(group, new THREE.BoxGeometry(1.2, 0.05, 0.18), new THREE.MeshBasicMaterial({ color: '#ffffff' }), strips);
    }
    const egaps = gapsFor(b.rect, b.entrances);
    if (b.glass) {
      // ガラス張りの外壁（葵テラス）
      const glass = new THREE.MeshLambertMaterial({ color: '#bae6fd', transparent: true, opacity: 0.28, depthWrite: false });
      rectWalls(group, b.rect, { mat: glass, gaps: egaps, lintel: false });
      const mullions = [];
      const inGap = (side, t) => (egaps[side] || []).some((g) => t > g[0] && t < g[1]);
      const add = (x, z) => mullions.push({ x, z, y: FLOOR_H / 2 });
      for (let x = x0; x <= x1; x += 1.6) { if (!inGap('n', x)) add(x, z0); if (!inGap('s', x)) add(x, z1); }
      for (let z = z0; z <= z1; z += 1.6) { if (!inGap('e', z)) add(x1, z); if (!inGap('w', z)) add(x0, z); }
      instances(group, new THREE.BoxGeometry(0.06, FLOOR_H, 0.06), lambert('#475569'), mullions);
    } else {
      const ext = new THREE.MeshLambertMaterial({ color: '#e2e8f0' });
      rectWalls(group, b.rect, { mat: ext, gaps: egaps });
      // 館内の床（廊下・ホール）
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lambert('#d4d4d8'));
      fl.rotation.x = -Math.PI / 2;
      fl.position.set((x0 + x1) / 2, 0.001, (z0 + z1) / 2);
      group.add(fl);
    }
    // 出入口の看板とマット
    b.entrances.forEach((e, i) => {
      const es = sideOf(b.rect, e);
      const n = NORMAL[es];
      const sp = buildingNav.get(b.id).entrances[i].outside;
      const title = b.entranceLabels?.[i] || `${b.label} 入口`;
      addPlane(group, signTexture(title, i === 0 ? '第3回TMC同窓会 会場' : '', { accent: '#1e3a8a' }), i === 0 ? 2.4 : 1.8, i === 0 ? 0.75 : 0.56,
        new THREE.Vector3(e.x + n[0] * 0.12, 2.75, e.z + n[1] * 0.12), yawFacing(-n[0], -n[1]));
      const horiz = es === 'n' || es === 's';
      const mat = box(horiz ? e.w : 1.4, 0.02, horiz ? 1.4 : e.w, lambert('#475569'));
      mat.position.set(e.x + n[0] * 0.7, 0.01, e.z + n[1] * 0.7);
      group.add(mat);
    });
    // 入れない区画（トイレ・階段・EV）
    for (const sd of b.solids || []) {
      const [sx0, sz0, sx1, sz1] = sd.rect;
      const blk = box(sx1 - sx0, FLOOR_H, sz1 - sz0, lambert('#e7e5e4'));
      blk.position.set((sx0 + sx1) / 2, FLOOR_H / 2, (sz0 + sz1) / 2);
      group.add(blk);
      const tex = signTexture(sd.label, '', { accent: '#64748b', w: 512, h: 160 });
      for (const [side, [nx, nz]] of Object.entries(NORMAL)) {
        const edge = side === 'n' ? sz0 : side === 's' ? sz1 : side === 'w' ? sx0 : sx1;
        if ((side === 'n' || side === 's') ? edge === b.rect[side === 'n' ? 1 : 3] : edge === b.rect[side === 'w' ? 0 : 2]) continue;
        const c = { x: (sx0 + sx1) / 2 + nx * ((sx1 - sx0) / 2 + 0.02), z: (sz0 + sz1) / 2 + nz * ((sz1 - sz0) / 2 + 0.02) };
        addPlane(group, tex, 1.2, 0.375, new THREE.Vector3(c.x, 2.3, c.z), yawFacing(-nx, -nz));
      }
    }
    for (const sg of b.signs || []) {
      const [nx, nz] = NORMAL[sg.face];
      const tex = signTexture(sg.title, sg.sub, { accent: '#1e3a8a' });
      const pos = new THREE.Vector3(sg.at.x + nx * (sg.offset || 0), sg.y || 2.4, sg.at.z + nz * (sg.offset || 0));
      addPlane(group, tex, 2.4, 0.75, pos, yawFacing(-nx, -nz));
      if (sg.twoSided) addPlane(group, tex, 2.4, 0.75, pos.clone().add(new THREE.Vector3(-nx * 0.02, 0, -nz * 0.02)), yawFacing(nx, nz));
    }
  }

  // 部屋
  for (const z of ZONES) {
    const b = buildingById(z.building);
    const F = roomFrame(z);
    const [x0, z0, x1, z1] = z.rect;
    const info = { x0, z0, x1, z1, cx: F.cx, cz: F.cz, w: x1 - x0, d: z1 - z0, frame: F };
    zoneMeta.set(z.id, info);

    const floorColor = z.kind === 'cafeteria' ? '#d1d1cf' : new THREE.Color(z.color).lerp(new THREE.Color('#e5e7eb'), 0.7);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), lambert(floorColor));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(F.cx, 0.003, F.cz);
    group.add(floor);

    // 建物の外壁と重なる辺は省く
    const skip = [];
    if (Math.abs(x0 - b.rect[0]) < 0.01) skip.push('w');
    if (Math.abs(x1 - b.rect[2]) < 0.01) skip.push('e');
    if (Math.abs(z0 - b.rect[1]) < 0.01) skip.push('n');
    if (Math.abs(z1 - b.rect[3]) < 0.01) skip.push('s');
    rectWalls(group, z.rect, { mat: wallMat, gaps: gapsFor(z.rect, z.doors), skip });

    const { seats, spots } = z.kind === 'cafeteria' ? furnishCafeteria(group, z, F) : furnishClassroom(group, z, F, { reception: !!z.reception });
    info.seats = seats;
    info.spots = spots;

    // 出入口の外側の看板（廊下側）
    for (const door of z.doors) {
      if ((b.entrances || []).some((e) => e.x === door.x && e.z === door.z)) continue;
      const ds = sideOf(z.rect, door);
      const [nx, nz] = NORMAL[ds];
      const along = ds === 'n' || ds === 's' ? { x: 1, z: 0 } : { x: 0, z: 1 };
      // 看板は出入口の横（部屋の内側寄り）に貼る
      const cx = (z.rect[0] + z.rect[2]) / 2, cz = (z.rect[1] + z.rect[3]) / 2;
      const dir = Math.sign((along.x ? cx - door.x : cz - door.z)) || 1;
      addPlane(group, signTexture(z.sign[0], z.sign[1], { accent: '#ea580c' }), 1.6, 0.5,
        new THREE.Vector3(door.x + nx * 0.1 + along.x * dir * (door.w / 2 + 0.95), 2.35, door.z + nz * 0.1 + along.z * dir * (door.w / 2 + 0.95)),
        yawFacing(-nx, -nz));
    }

    // スクリーン（前の壁）
    if (z.screen) {
      const sc = new Screen(z, z.screen.width, z.screen.height);
      const p = F.toWorld(0, 0.14);
      const y = z.kind === 'classroom' ? 0.75 + z.screen.height / 2 : 1.3 + z.screen.height / 2;
      sc.mesh.position.set(p.x, y, p.z);
      sc.mesh.rotation.y = F.ry;
      group.add(sc.mesh);
      sc.setSlides([]);
      screens.set(z.id, sc);
    }
  }

  // 照明
  scene.add(new THREE.HemisphereLight('#ffffff', '#cbd5e1', 1.9));
  const sun = new THREE.DirectionalLight('#fff7ed', 1.1);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  return { group, screens, zoneMeta };
}
