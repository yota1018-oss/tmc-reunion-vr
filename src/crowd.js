import * as THREE from 'three';
import { CATEGORIES, EXPECTED_PEOPLE, ENTRANCE } from './config.js';

// 想定参加者の人影（半透明）。時間帯ごとに各部屋へ移動する
const MIX = ['shakaijin', 'shakaijin', 'shakaijin', 'obog', 'obog', 'y1', 'y1', 'y2', 'y3', 'y4', 'y4', 'staff', 'staff', 'teacher'];

export class Crowd {
  constructor(scene, zoneMeta) {
    this.zoneMeta = zoneMeta;
    const n = EXPECTED_PEOPLE;
    const geo = new THREE.CapsuleGeometry(0.2, 0.9, 3, 8);
    geo.translate(0, 0.65, 0);
    const mat = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55 });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.people = [];
    const color = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const cat = MIX[i % MIX.length];
      color.set(CATEGORIES.find((c) => c.id === cat).color);
      this.mesh.setColorAt(i, color);
      this.people.push({ cat, x: ENTRANCE.x, z: ENTRANCE.z + 3, tx: ENTRANCE.x, tz: ENTRANCE.z + 3, ry: 0, seated: false, visible: false, delay: 0 });
    }
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.phaseKey = null;
  }

  /** phase.crowd: {zoneId: 割合} に従って人影を配置 */
  setPhase(phase, instant = false) {
    const key = phase.start;
    if (key === this.phaseKey) return;
    this.phaseKey = key;
    const n = this.people.length;
    let idx = 0;
    const order = [...this.people.keys()];
    for (const [zoneId, ratio] of Object.entries(phase.crowd || {})) {
      const info = this.zoneMeta.get(zoneId);
      if (!info) continue;
      const count = Math.min(Math.round(n * ratio), n - idx);
      // 学年別セミナー: A=1・2年, B=3・4年 を優先して入れる
      const prefer = zoneId === 'semA' ? ['y1', 'y2'] : zoneId === 'semB' ? ['y3', 'y4'] : zoneId === 'reception' && phase.start === '12:30' ? ['staff'] : null;
      if (prefer) {
        const rest = order.slice(idx);
        rest.sort((a, b) => (prefer.includes(this.people[b].cat) ? 1 : 0) - (prefer.includes(this.people[a].cat) ? 1 : 0));
        order.splice(idx, rest.length, ...rest);
      }
      const places = [...(info.seats || []), ...(info.spots || [])];
      const pool = info.seats?.length ? info.seats : places;
      // 運営は受付机の内側などの staff スポットへ
      const staffSpots = (info.spots || []).filter((s) => s.staff);
      const others = pool.filter((s) => !s.staff);
      const shuffled = others.map((s) => [Math.random(), s]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      let si = 0;
      for (let k = 0; k < count; k++) {
        const p = this.people[order[idx++]];
        let spot;
        if (p.cat === 'staff' && staffSpots.length && k < staffSpots.length) spot = staffSpots[k];
        else spot = shuffled[si++ % Math.max(shuffled.length, 1)];
        if (!spot) spot = { x: info.cx + (Math.random() - 0.5) * info.w * 0.6, z: info.cz + (Math.random() - 0.5) * info.d * 0.6, ry: Math.random() * 6 };
        const jitter = spot.seated ? 0 : 0.15;
        this.assign(p, spot.x + (Math.random() - 0.5) * jitter, spot.z + (Math.random() - 0.5) * jitter, spot.ry ?? 0, !!spot.seated, instant);
      }
    }
    // 残りは会場外（非表示）
    for (; idx < n; idx++) {
      const p = this.people[order[idx]];
      this.assign(p, ENTRANCE.x + (Math.random() - 0.5) * 2, ENTRANCE.z + 4, 0, false, instant);
      p.leaving = true;
    }
  }

  assign(p, x, z, ry, seated, instant) {
    p.tx = x; p.tz = z; p.ry = ry; p.seated = seated; p.leaving = false;
    // 廊下経由で移動させる中継点
    p.via = instant ? null : { x: (Math.random() - 0.5) * 2, z: p.z };
    p.via2 = instant ? null : { x: (Math.random() - 0.5) * 2, z };
    p.delay = instant ? 0 : Math.random() * 1.5;
    if (instant || !p.visible) { p.x = x; p.z = z; p.via = p.via2 = null; }
    p.visible = true;
  }

  update(dt) {
    const speed = 4.5;
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      if (p.delay > 0) { p.delay -= dt; }
      else {
        const goal = p.via || p.via2 || { x: p.tx, z: p.tz };
        const dx = goal.x - p.x, dz = goal.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
          if (p.via) p.via = null; else if (p.via2) p.via2 = null;
        } else {
          const step = Math.min(d, speed * dt);
          p.x += (dx / d) * step; p.z += (dz / d) * step;
          p.walkRy = Math.atan2(-dx, -dz);
        }
      }
      const arrived = !p.via && !p.via2 && Math.hypot(p.tx - p.x, p.tz - p.z) < 0.05;
      const ry = arrived ? p.ry : (p.walkRy ?? p.ry);
      this.q.setFromAxisAngle(this.up, ry);
      const hidden = p.leaving && arrived;
      const sy = hidden ? 0.0001 : arrived && p.seated ? 0.72 : 1;
      this.s.set(hidden ? 0.0001 : 1, sy, hidden ? 0.0001 : 1);
      this.v.set(p.x, arrived && p.seated ? 0.25 : 0, p.z);
      this.m4.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setVisible(v) { this.mesh.visible = v; }
}
