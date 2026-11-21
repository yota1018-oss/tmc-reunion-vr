import * as THREE from 'three';
import { route, targetPoint, locate } from './nav.js';

// 床の矢印で目的地までの経路を表示する
export class Guide {
  constructor(scene, zoneMeta) {
    this.zoneMeta = zoneMeta;
    this.enabled = true;
    this.group = new THREE.Group();
    scene.add(this.group);

    const shape = new THREE.Shape();
    shape.moveTo(0, -0.28); shape.lineTo(0.28, 0.05); shape.lineTo(0.14, 0.05); shape.lineTo(0.14, 0.28);
    shape.lineTo(-0.14, 0.28); shape.lineTo(-0.14, 0.05); shape.lineTo(-0.28, 0.05); shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2); // 矢印の先端を -z 向きに
    this.arrowMat = new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    this.maxArrows = 220;
    this.arrows = new THREE.InstancedMesh(geo, this.arrowMat, this.maxArrows);
    this.arrows.frustumCulled = false;
    this.arrows.count = 0;
    this.group.add(this.arrows);

    // 目的地の光の柱
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 6, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.beacon.position.y = 3;
    this.group.add(this.beacon);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.9, 32),
      new THREE.MeshBasicMaterial({ color: '#f97316', side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.group.add(this.ring);

    this.points = [];
    this.offset = 0;
    this.targetId = null;
    this.arrived = false;
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  update(dt, playerPos, targetId) {
    const show = this.enabled && !!targetId;
    this.group.visible = show;
    if (!show) return;
    const goal = targetPoint(targetId);
    if (!goal) { this.group.visible = false; return; }
    this.beacon.position.x = this.ring.position.x = goal.x;
    this.beacon.position.z = this.ring.position.z = goal.z;
    this.arrived = Math.hypot(playerPos.x - goal.x, playerPos.z - goal.z) < 2.2
      || locate(playerPos.x, playerPos.z).zone === targetId;

    // 経路の計算は少し間引く（毎フレームは不要）
    this.routeTimer = (this.routeTimer || 0) - dt;
    if (this.routeTimer <= 0 || this.routeTarget !== targetId) {
      this.pts = route(playerPos, targetId);
      this.routeTimer = 0.25;
      this.routeTarget = targetId;
    } else if (this.pts.length) {
      this.pts[0] = { x: playerPos.x, z: playerPos.z };
    }
    const pts = this.pts;
    this.offset = (this.offset + dt * 1.2) % 0.9;
    let n = 0;
    const spacing = 0.9;
    let carry = spacing - this.offset;
    for (let s = 0; s < pts.length - 1 && n < this.maxArrows; s++) {
      const a = pts[s], b = pts[s + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const ang = Math.atan2(-dx, -dz);
      this.q.setFromAxisAngle(this.up, ang);
      let t = carry;
      while (t < len && n < this.maxArrows) {
        if (!(s === 0 && t < 0.8)) {
          this.m4.compose(new THREE.Vector3(a.x + (dx * t) / len, 0.03, a.z + (dz * t) / len), this.q, new THREE.Vector3(1, 1, 1));
          this.arrows.setMatrixAt(n++, this.m4);
        }
        t += spacing;
      }
      carry = t - len;
    }
    this.arrows.count = this.arrived ? 0 : n;
    this.arrows.instanceMatrix.needsUpdate = true;
    this.arrowMat.opacity = 0.65 + Math.sin(performance.now() / 250) * 0.25;
  }
}
