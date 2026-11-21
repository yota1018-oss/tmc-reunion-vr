import * as THREE from 'three';
import { QUICK_PHRASES } from './config.js';
import { FONT, makeCanvas, canvasTexture, roundRect, wrapText } from './textures.js';

const PW = 640, PH = 940;

/**
 * VR用：コントローラー・移動・左手の操作パネル
 * actions: { prevPhase, nextPhase, togglePlay, toggleGuide, warp, slidePrev, slideNext, say(text) }
 */
export class XRControls {
  constructor(renderer, rig, camera, actions) {
    this.renderer = renderer;
    this.rig = rig;
    this.camera = camera;
    this.actions = actions;
    this.state = { time: '', title: '', target: '', arrived: false, guide: true, playing: false, chat: [], online: '' };
    this.turnReady = true;

    this.canvas = makeCanvas(PW, PH);
    this.ctx = this.canvas.getContext('2d');
    this.tex = canvasTexture(this.canvas);
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24 * PH / PW), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true }));
    this.panel.position.set(0.02, 0.06, -0.12);
    this.panel.rotation.set(-Math.PI / 3, 0, 0);

    this.buttons = [];
    this.layout();

    this.controllers = [0, 1].map((i) => {
      const c = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const ray = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: '#f97316' }),
      );
      ray.scale.z = 2;
      c.add(ray);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.12), new THREE.MeshLambertMaterial({ color: '#334155' }));
      grip.add(hand);
      c.userData.ray = ray;
      c.addEventListener('connected', (e) => {
        c.userData.handedness = e.data.handedness;
        grip.userData.handedness = e.data.handedness;
        if (e.data.handedness === 'left') { grip.add(this.panel); ray.visible = false; }
      });
      c.addEventListener('selectstart', () => this.onSelect(c));
      rig.add(c, grip);
      return c;
    });

    this.raycaster = new THREE.Raycaster();
    this.tmpM = new THREE.Matrix4();
    this.hoverId = null;
    this.render();
  }

  layout() {
    const b = [];
    const pad = 24, gap = 14;
    const bw2 = (PW - pad * 2 - gap) / 2;
    const bw3 = (PW - pad * 2 - gap * 2) / 3;
    let y = 220;
    b.push({ id: 'prev', label: '◀ 前の時間', x: pad, y, w: bw3, h: 70 });
    b.push({ id: 'play', label: '再生', x: pad + bw3 + gap, y, w: bw3, h: 70 });
    b.push({ id: 'next', label: '次の時間 ▶', x: pad + (bw3 + gap) * 2, y, w: bw3, h: 70 });
    y += 84;
    b.push({ id: 'slidePrev', label: 'スライド ◀', x: pad, y, w: bw3, h: 70 });
    b.push({ id: 'guide', label: '案内', x: pad + bw3 + gap, y, w: bw3, h: 70 });
    b.push({ id: 'slideNext', label: 'スライド ▶', x: pad + (bw3 + gap) * 2, y, w: bw3, h: 70 });
    y += 84;
    b.push({ id: 'warp', label: '目的地へワープ', x: pad, y, w: PW - pad * 2, h: 64 });
    y += 88;
    QUICK_PHRASES.forEach((t, i) => {
      b.push({ id: 'say:' + i, label: t, text: t, x: pad + (i % 2) * (bw2 + gap), y: y + Math.floor(i / 2) * 78, w: bw2, h: 66 });
    });
    this.buttons = b;
    this.chatY = y + 170;
  }

  setState(s) {
    const next = { ...this.state, ...s };
    const key = JSON.stringify(next);
    if (key === this._key) return;
    this._key = key;
    this.state = next;
    this.render();
  }

  render() {
    const { ctx } = this;
    const s = this.state;
    ctx.clearRect(0, 0, PW, PH);
    roundRect(ctx, 0, 0, PW, PH, 36);
    ctx.fillStyle = 'rgba(15,23,42,0.92)'; ctx.fill();
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fdba74';
    ctx.font = `bold 44px ${FONT}`;
    ctx.fillText(s.time, 24, 22);
    ctx.fillStyle = '#94a3b8';
    ctx.font = `24px ${FONT}`;
    ctx.fillText(s.online, 200, 34, PW - 220);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 38px ${FONT}`;
    ctx.fillText(s.title, 24, 80, PW - 48);
    ctx.fillStyle = s.arrived ? '#86efac' : '#fdba74';
    ctx.font = `28px ${FONT}`;
    ctx.fillText(s.arrived ? '✓ 目的地に到着しています' : `→ ${s.target}`, 24, 136, PW - 48);
    ctx.fillStyle = '#64748b';
    ctx.font = `22px ${FONT}`;
    ctx.fillText('左スティック：移動　右スティック：向き　トリガー：押す', 24, 180, PW - 48);

    for (const btn of this.buttons) {
      let label = btn.label;
      if (btn.id === 'play') label = s.playing ? '一時停止' : '再生';
      if (btn.id === 'guide') label = s.guide ? '案内 ON' : '案内 OFF';
      roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 14);
      ctx.fillStyle = this.hoverId === btn.id ? '#f97316' : btn.id.startsWith('say') ? '#1e3a8a' : '#334155';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 26px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2, btn.w - 12);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }
    // チャット履歴
    ctx.fillStyle = '#94a3b8';
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText('チャット', 24, this.chatY);
    ctx.font = `24px ${FONT}`;
    let y = this.chatY + 36;
    for (const m of s.chat.slice(-6)) {
      const lines = wrapText(ctx, `${m.name}：${m.body}`, PW - 48).slice(0, 2);
      for (const l of lines) { if (y > PH - 34) break; ctx.fillStyle = '#e2e8f0'; ctx.fillText(l, 24, y); y += 30; }
    }
    this.tex.needsUpdate = true;
  }

  hitTest(controller) {
    this.tmpM.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tmpM);
    const hit = this.raycaster.intersectObject(this.panel, false)[0];
    if (!hit || !hit.uv) return null;
    const px = hit.uv.x * PW, py = (1 - hit.uv.y) * PH;
    return { btn: this.buttons.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h), dist: hit.distance };
  }

  onSelect(c) {
    if (c.userData.handedness === 'left') return;
    const h = this.hitTest(c);
    if (!h?.btn) return;
    const id = h.btn.id;
    const a = this.actions;
    if (id === 'prev') a.prevPhase();
    else if (id === 'next') a.nextPhase();
    else if (id === 'play') a.togglePlay();
    else if (id === 'guide') a.toggleGuide();
    else if (id === 'warp') a.warp();
    else if (id === 'slidePrev') a.slidePrev();
    else if (id === 'slideNext') a.slideNext();
    else if (id.startsWith('say:')) a.say(h.btn.text);
  }

  /** 毎フレーム: スティック移動・スナップターン・ホバー表示。move(dx, dz) は移動要求 */
  update(dt, move) {
    const session = this.renderer.xr.getSession();
    if (!session) return;
    let hover = null;
    for (const c of this.controllers) {
      if (c.userData.handedness === 'right') {
        const h = this.hitTest(c);
        hover = h?.btn?.id || null;
        c.userData.ray.scale.z = h ? h.dist : 2;
      }
    }
    if (hover !== this.hoverId) { this.hoverId = hover; this.render(); }

    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp || gp.axes.length < 4) continue;
      const x = gp.axes[2], y = gp.axes[3];
      if (src.handedness === 'left') {
        if (Math.hypot(x, y) > 0.15) {
          const dir = new THREE.Vector3();
          this.camera.getWorldDirection(dir);
          dir.y = 0; dir.normalize();
          const right = new THREE.Vector3(-dir.z, 0, dir.x);
          const speed = 2.2 * dt;
          move(
            (dir.x * -y + right.x * x) * speed,
            (dir.z * -y + right.z * x) * speed,
          );
        }
      } else if (src.handedness === 'right') {
        if (Math.abs(x) > 0.7 && this.turnReady) {
          this.turnReady = false;
          this.snapTurn(x > 0 ? -Math.PI / 6 : Math.PI / 6);
        } else if (Math.abs(x) < 0.3) this.turnReady = true;
      }
    }
  }

  /** 頭の位置を中心に回転 */
  snapTurn(angle) {
    const head = new THREE.Vector3();
    this.camera.getWorldPosition(head);
    const rig = this.rig;
    const off = rig.position.clone().sub(head);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    rig.position.copy(head).add(off);
    rig.position.y = 0;
    rig.rotation.y += angle;
  }
}
