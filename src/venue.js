import * as THREE from 'three';
import { CORRIDOR, ENTRANCE, ZONES } from './config.js';
import { signTexture, makeCanvas, canvasTexture, drawSlide } from './textures.js';

const WALL_H = 3;
const WALL_T = 0.15;
const MARGIN = 0.3; // 壁からの距離（当たり判定）

const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });

function box(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

// 部屋の中心・出入口の内側方向など
export function zoneInfo(z) {
  const [x0, z0, x1, z1] = z.rect;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const doorSide = Math.abs(z.door.x - x0) < Math.abs(z.door.x - x1) ? 'west' : 'east';
  // 奥の壁（スクリーン面）
  const farX = doorSide === 'west' ? x1 : x0;
  const inward = doorSide === 'west' ? -1 : 1; // 奥の壁から部屋の内側へ向かうxの符号
  return { x0, z0, x1, z1, cx, cz, w: x1 - x0, d: z1 - z0, doorSide, farX, inward };
}

/** 壁（x一定 or z一定の直線）を出入口の穴を開けて作る */
function wallLine(group, material, axis, fixed, from, to, gaps = []) {
  const segs = [];
  let cur = from;
  for (const g of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g[0] > cur) segs.push([cur, g[0]]);
    cur = Math.max(cur, g[1]);
  }
  if (cur < to) segs.push([cur, to]);
  for (const [a, b] of segs) {
    const len = b - a;
    if (len < 0.05) continue;
    const m = axis === 'x'
      ? box(WALL_T, WALL_H, len, material)
      : box(len, WALL_H, WALL_T, material);
    if (axis === 'x') m.position.set(fixed, WALL_H / 2, (a + b) / 2);
    else m.position.set((a + b) / 2, WALL_H / 2, fixed);
    group.add(m);
  }
  // 出入口の上の壁（鴨居）
  for (const g of gaps) {
    const len = g[1] - g[0];
    const m = axis === 'x' ? box(WALL_T, 0.8, len, material) : box(len, 0.8, WALL_T, material);
    if (axis === 'x') m.position.set(fixed, WALL_H - 0.4, (g[0] + g[1]) / 2);
    else m.position.set((g[0] + g[1]) / 2, WALL_H - 0.4, fixed);
    group.add(m);
  }
}

function addSign(group, title, sub, w, pos, ry, accent) {
  const tex = signTexture(title, sub, { accent });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.3125), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.copy(pos);
  m.rotation.y = ry;
  group.add(m);
  return m;
}

/** スクリーン：スライドを描画するキャンバス付きの板 */
class Screen {
  constructor(zone, width, height) {
    this.zone = zone;
    this.canvas = makeCanvas(1280, 720);
    this.ctx = this.canvas.getContext('2d');
    this.texture = canvasTexture(this.canvas);
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.texture }),
    );
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
      // 画像スライド（PowerPointをPNG書き出ししたもの等）
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

/** 椅子・机などの家具。返り値の seats は人影を座らせる位置 */
function furnish(group, zone, info) {
  const seats = [];
  const spots = [];
  const chairMat = mat('#334155');
  const deskMat = mat('#d6b98c');
  const { x0, z0, x1, z1, cx, cz, farX, inward } = info;

  const chairGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
  const deskGeo = new THREE.BoxGeometry(0.5, 0.05, 1.6);

  if (zone.kind === 'hall' || zone.kind === 'seminar') {
    // 前方（スクリーン側）に向いた座席の列
    const front = farX + inward * (zone.kind === 'hall' ? 3.2 : 2.6);
    const rowGap = zone.kind === 'hall' ? 1.1 : 1.3;
    const colGap = 0.75;
    const back = (inward > 0 ? x1 : x0) - inward * 1.8;
    const rows = Math.floor(Math.abs(back - front) / rowGap) + 1;
    const cols = Math.floor((z1 - z0 - 2.2) / colGap);
    const zStart = cz - ((cols - 1) * colGap) / 2;
    const chairs = new THREE.InstancedMesh(chairGeo, chairMat, rows * cols);
    const desks = zone.kind === 'seminar' ? new THREE.InstancedMesh(deskGeo, deskMat, rows * Math.ceil(cols / 2)) : null;
    const m4 = new THREE.Matrix4();
    let n = 0, dn = 0;
    for (let r = 0; r < rows; r++) {
      const x = front + inward * r * rowGap;
      for (let c = 0; c < cols; c++) {
        const z = zStart + c * colGap;
        // 中央通路
        if (Math.abs(z - cz) < colGap * 0.6 && cols > 6) continue;
        m4.makeTranslation(x, 0.225, z);
        chairs.setMatrixAt(n++, m4);
        seats.push({ x, z, ry: inward > 0 ? Math.PI / 2 : -Math.PI / 2, seated: true });
        if (desks && c % 2 === 0) {
          m4.makeTranslation(x - inward * 0.45, 0.72, z + colGap / 2);
          desks.setMatrixAt(dn++, m4);
        }
      }
    }
    chairs.count = n;
    group.add(chairs);
    if (desks) { desks.count = dn; group.add(desks); }
    // 演台
    const lectern = box(0.6, 1.1, 0.5, mat('#7c5c3b'));
    lectern.position.set(farX + inward * 1.2, 0.55, z0 + 1.4);
    group.add(lectern);
    spots.push({ x: farX + inward * 1.2, z: z0 + 2.2, ry: inward > 0 ? -Math.PI / 2 : Math.PI / 2 });
  } else if (zone.kind === 'party') {
    // 立食のハイテーブル
    const tableMat = mat('#f8fafc');
    const legMat = mat('#94a3b8');
    const cols = 3, rows = 3;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + 3 + (c * (x1 - x0 - 6)) / (cols - 1);
        const z = z0 + 3 + (r * (z1 - z0 - 6)) / (rows - 1);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 20), tableMat);
        top.position.set(x, 1.05, z);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 8), legMat);
        leg.position.set(x, 0.52, z);
        group.add(top, leg);
        // 卓上の飲み物
        for (let k = 0; k < 3; k++) {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.12, 8), mat(k === 0 ? '#38bdf8' : '#fef3c7'));
          cup.position.set(x + Math.cos(k * 2.1) * 0.25, 1.13, z + Math.sin(k * 2.1) * 0.25);
          group.add(cup);
        }
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + r;
          spots.push({ x: x + Math.cos(a) * 0.9, z: z + Math.sin(a) * 0.9, ry: Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI });
        }
      }
    }
    // 料理テーブル（奥の壁沿い）
    const buffet = box(1, 0.8, Math.min(8, z1 - z0 - 4), mat('#e2e8f0'));
    buffet.position.set(farX + inward * 0.9, 0.4, cz + 2);
    group.add(buffet);
    for (let k = 0; k < 6; k++) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.06, 16), mat(['#fca5a5', '#fde68a', '#86efac'][k % 3]));
      plate.position.set(farX + inward * 0.9, 0.83, cz + 2 - 3 + k * 1.2);
      group.add(plate);
    }
    // ガラス面（テラスらしさ）
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0 - 0.4, WALL_H - 0.4),
      new THREE.MeshBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    );
    glass.position.set(cx, WALL_H / 2, z0 + 0.1);
    group.add(glass);
  } else if (zone.kind === 'reception') {
    // 受付机（出入口の正面）
    const dx = info.doorSide === 'east' ? x1 - 3 : x0 + 3;
    for (let k = 0; k < 2; k++) {
      const desk = box(0.7, 0.75, 1.8, deskMat);
      desk.position.set(dx, 0.375, zone.door.z - 1.1 + k * 2.2);
      group.add(desk);
      spots.push({ x: dx + (info.doorSide === 'east' ? -0.8 : 0.8), z: zone.door.z - 1.1 + k * 2.2, ry: info.doorSide === 'east' ? -Math.PI / 2 : Math.PI / 2, staff: true });
    }
    // 名札の箱・水
    for (let k = 0; k < 6; k++) {
      const b = box(0.2, 0.25, 0.08, mat('#60a5fa'));
      b.position.set(dx, 0.88, zone.door.z - 1.8 + k * 0.7);
      group.add(b);
    }
    // 待機列
    for (let k = 0; k < 18; k++) {
      const col = k % 3, row = Math.floor(k / 3);
      spots.push({ x: dx + (info.doorSide === 'east' ? 1.2 + row * 0.8 : -1.2 - row * 0.8), z: zone.door.z - 1 + col, ry: info.doorSide === 'east' ? Math.PI / 2 : -Math.PI / 2 });
    }
  }
  return { seats, spots };
}

export function buildVenue(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const wallMat = mat('#f1f5f9');
  const screens = new Map();
  const zoneMeta = new Map();
  const walkable = [];

  // 地面
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat('#9ca3af'));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  group.add(ground);

  // 廊下
  const [cx0, cz0, cx1, cz1] = CORRIDOR.rect;
  const corFloor = new THREE.Mesh(new THREE.PlaneGeometry(cx1 - cx0, cz1 - cz0), mat('#e5e7eb'));
  corFloor.rotation.x = -Math.PI / 2;
  corFloor.position.set((cx0 + cx1) / 2, 0, (cz0 + cz1) / 2);
  group.add(corFloor);
  walkable.push({ x0: cx0 + MARGIN, z0: cz0 + MARGIN, x1: cx1 - MARGIN, z1: cz1 - 0.05 });

  const westGaps = [], eastGaps = [];
  for (const z of ZONES) {
    const info = zoneInfo(z);
    zoneMeta.set(z.id, info);
    const half = z.door.w / 2;
    if (Math.abs(z.door.x - cx0) < 0.01) westGaps.push([z.door.z - half, z.door.z + half]);
    if (Math.abs(z.door.x - cx1) < 0.01) eastGaps.push([z.door.z - half, z.door.z + half]);

    // 床（部屋ごとに色分け）
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(info.w, info.d), mat(new THREE.Color(z.color).lerp(new THREE.Color('#ffffff'), 0.45)));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(info.cx, 0.002, info.cz);
    group.add(floor);
    info.floor = floor;

    // 壁（廊下側以外）
    wallLine(group, wallMat, 'z', info.z0, info.x0, info.x1);
    wallLine(group, wallMat, 'z', info.z1, info.x0, info.x1);
    wallLine(group, wallMat, 'x', info.farX, info.z0, info.z1);

    walkable.push({ x0: info.x0 + MARGIN, z0: info.z0 + MARGIN, x1: info.x1 - MARGIN, z1: info.z1 - MARGIN });
    walkable.push({ x0: z.door.x - 0.9, z0: z.door.z - half + MARGIN, x1: z.door.x + 0.9, z1: z.door.z + half - MARGIN });

    // 家具
    const { seats, spots } = furnish(group, z, info);
    info.seats = seats;
    info.spots = spots;

    // 廊下側の看板（出入口の上）
    const outward = info.doorSide === 'west' ? -1 : 1; // 廊下側へのxの向き
    addSign(group, z.sign[0], z.sign[1], 2.2,
      new THREE.Vector3(z.door.x + outward * 0.1, WALL_H - 0.4, z.door.z + half + 1.3),
      outward < 0 ? -Math.PI / 2 : Math.PI / 2, z.color === '#fde68a' ? '#ca8a04' : '#ea580c');

    // スクリーン
    if (z.screen) {
      const sc = new Screen(z, z.screen.width, z.screen.height);
      sc.mesh.position.set(info.farX + info.inward * 0.1, 1.2 + z.screen.height / 2, info.cz);
      sc.mesh.rotation.y = info.inward > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(sc.mesh);
      const frame = box(0.05, z.screen.height + 0.12, z.screen.width + 0.12, mat('#111827'));
      frame.position.copy(sc.mesh.position).x -= info.inward * 0.03;
      group.add(frame);
      sc.setSlides([]);
      screens.set(z.id, sc);
    } else {
      // スクリーンが無い部屋は奥の壁に看板
      addSign(group, z.sign[0], z.sign[1], 3,
        new THREE.Vector3(info.farX + info.inward * 0.1, 1.9, info.cz),
        info.inward > 0 ? Math.PI / 2 : -Math.PI / 2, '#ca8a04');
    }
  }

  // 廊下の壁（出入口に穴）
  wallLine(group, wallMat, 'x', cx0, cz0, cz1, westGaps);
  wallLine(group, wallMat, 'x', cx1, cz0, cz1, eastGaps);
  wallLine(group, wallMat, 'z', cz0, cx0, cx1);

  // 入口
  addSign(group, '2号館 入口', `${'第3回TMC同窓会'} 会場はこちら`, 2.6, new THREE.Vector3(ENTRANCE.x, 3.4, ENTRANCE.z + 0.05), 0, '#1e3a8a');
  const mat2 = box(3.6, 0.02, 1.5, mat('#475569'));
  mat2.position.set(ENTRANCE.x, 0.01, ENTRANCE.z - 0.9);
  group.add(mat2);

  // 照明
  scene.add(new THREE.HemisphereLight('#ffffff', '#64748b', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 1.2);
  sun.position.set(8, 20, 6);
  scene.add(sun);

  return { group, screens, zoneMeta, walkable };
}

export function isWalkable(walkable, x, z) {
  return walkable.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
}

/** 今いる場所（部屋id / 'corridor' / null） */
export function locate(zoneMeta, x, z) {
  for (const [id, i] of zoneMeta) {
    if (x >= i.x0 && x <= i.x1 && z >= i.z0 && z <= i.z1) return id;
  }
  const [cx0, cz0, cx1, cz1] = CORRIDOR.rect;
  if (x >= cx0 - 1 && x <= cx1 + 1 && z >= cz0 && z <= cz1 + 2) return 'corridor';
  return null;
}
