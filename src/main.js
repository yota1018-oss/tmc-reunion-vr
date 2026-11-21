import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import {
  EVENT, CATEGORIES, INDUSTRIES, SPAWN, ZONES, BUILDINGS, CAMPUS, PLACES, QUICK_PHRASES, categoryById, zoneById,
} from './config.js';
import { buildVenue } from './venue.js';
import { isWalkable, locate, targetLabel, warpPoint } from './nav.js';
import { Avatar } from './avatar.js';
import { Crowd } from './crowd.js';
import { Guide } from './guide.js';
import { Clock, phaseAt, phases, toMin, fmt, START, END, nextPhase, prevPhaseStart } from './timeline.js';
import { Net, randomId } from './net.js';
import { XRControls } from './xr.js';

const $ = (id) => document.getElementById(id);
const PROFILE_KEY = 'tmc-vr-profile';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存できなくても動く */ } },
};

// ---------------- 入場フォーム ----------------
$('eventTitle').textContent = EVENT.title;
$('eventMeta').textContent = `${EVENT.date}｜${EVENT.place}`;
const catSel = $('categorySelect');
for (const c of CATEGORIES) catSel.append(new Option(c.label, c.id));
for (const i of INDUSTRIES) $('industryList').append(new Option(i));
const form = $('entryForm');
const saved = store.get(PROFILE_KEY);
if (saved) for (const k of ['name', 'category', 'industry', 'org']) if (saved[k]) form.elements[k].value = saved[k];
if (saved?.minor) form.elements.minor.checked = true;
const params = new URLSearchParams(location.search);
if (params.get('pass')) form.elements.pass.value = params.get('pass');

function readProfile() {
  const f = form.elements;
  return {
    id: saved?.id || randomId(),
    name: f.name.value.trim().slice(0, 20),
    category: f.category.value,
    industry: f.industry.value.trim().slice(0, 16),
    org: f.org.value.trim().slice(0, 20),
    minor: f.minor.checked,
  };
}

let started = false;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const me = readProfile();
  if (!me.name) return;
  const pass = form.elements.pass.value;
  if (!pass) { $('entryError').textContent = '合言葉を入力してください（ひとりで下見する場合は右のボタン）'; return; }
  $('joinBtn').disabled = true;
  $('entryError').textContent = '接続中…';
  try {
    await start(me, pass);
  } catch (err) {
    $('entryError').textContent = err.message;
    $('joinBtn').disabled = false;
  }
});
$('soloBtn').addEventListener('click', () => {
  const me = readProfile();
  if (!me.name) me.name = 'ゲスト';
  start(me, null);
});

// ---------------- 3Dシーン ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#bae6fd');
scene.fog = new THREE.Fog('#bae6fd', 80, 260);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 400);
const rig = new THREE.Group(); // プレイヤー（VRでは頭の位置はrig内で動く）
rig.add(camera);
scene.add(rig);
const EYE = 1.6;
camera.position.set(0, EYE, 0);
rig.position.set(SPAWN.x, 0, SPAWN.z);
rig.rotation.y = SPAWN.ry;
let pitch = 0;

const venue = buildVenue(scene);
const crowd = new Crowd(scene, venue.zoneMeta);
const guide = new Guide(scene, venue.zoneMeta);
const clock = new Clock();
const peers = new Map(); // id -> Avatar

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------- 状態 ----------------
let me = null;
let net = null;
let lead = false;    // 運営として全員を操作
let follow = true;   // 運営の時間に合わせる
let currentPhase = null;
const slideIndex = {}; // zoneId -> index
const chatMessages = [];

const isStaff = () => me?.category === 'staff';
const resolveTarget = (phase) => {
  const t = phase.target;
  if (!t || typeof t === 'string') return t;
  return t[me?.category] || t.default;
};

function headPos() {
  const v = new THREE.Vector3();
  camera.getWorldPosition(v);
  return v;
}
function headYaw() {
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  return Math.atan2(-d.x, -d.z);
}

function tryMove(dx, dz) {
  const h = headPos();
  // 軸ごとに判定して壁沿いに滑る
  if (isWalkable(h.x + dx, h.z)) { rig.position.x += dx; h.x += dx; }
  if (isWalkable(h.x, h.z + dz)) { rig.position.z += dz; }
}

/** 目的地へワープ（入口の内側に移動して部屋の中を向く） */
function warpToTarget() {
  const t = currentPhase && resolveTarget(currentPhase);
  const w = t && warpPoint(t);
  if (!w) return;
  const h = headPos();
  rig.position.x += w.x - h.x;
  rig.position.z += w.z - h.z;
  const want = Math.atan2(-(w.face.x - w.x), -(w.face.z - w.z));
  rig.rotation.y += want - headYaw();
  const h2 = headPos();
  rig.position.x += w.x - h2.x;
  rig.position.z += w.z - h2.z;
  pitch = 0;
}

// ---------------- タイムライン・スクリーン ----------------
function applyPhase(phase) {
  if (phase === currentPhase) return;
  currentPhase = phase;
  crowd.setPhase(phase);
  for (const [zid, sc] of venue.screens) {
    const list = phase.slides?.[zid] || [{ title: phase.title, sub: zoneById(zid).label }];
    sc.index = slideIndex[zid] = 0;
    sc.setSlides(list);
  }
  $('phaseTitle').textContent = phase.title;
  $('phaseDesc').textContent = phase.desc;
  $('staffNote').hidden = !isStaff() || !phase.staff;
  $('staffNote').textContent = phase.staff ? `運営：${phase.staff}` : '';
  document.querySelectorAll('#phaseTicks span').forEach((s) => s.classList.toggle('active', s.dataset.start === phase.start));
}

clock.onChange((min, source) => {
  $('clockText').textContent = fmt(min);
  $('timeSlider').value = String(Math.round(min - START));
  applyPhase(phaseAt(min));
  if (lead && source !== 'remote') broadcastSync(source === 'tick');
});

function setupTimeline() {
  const slider = $('timeSlider');
  slider.min = '0';
  slider.max = String(END - START);
  slider.addEventListener('input', () => userSetTime(START + Number(slider.value)));
  const ticks = $('phaseTicks');
  phases().forEach((p, i) => {
    const s = document.createElement('span');
    s.dataset.start = p.start;
    s.style.left = `${((toMin(p.start) - START) / (END - START)) * 100}%`;
    s.style.top = `${(i % 2) * 16}px`;
    s.textContent = p.start;
    s.title = p.title;
    s.addEventListener('click', () => userSetTime(toMin(p.start)));
    ticks.append(s);
  });
  $('prevBtn').addEventListener('click', prevPhaseAction);
  $('nextBtn').addEventListener('click', nextPhaseAction);
  $('playBtn').addEventListener('click', togglePlay);
  $('speedSel').addEventListener('change', (e) => { clock.speed = Number(e.target.value); if (lead) broadcastSync(); });
}

function userSetTime(min) {
  if (net?.online && follow && !lead && leaderSeen) { follow = false; $('followChk').checked = false; }
  clock.set(min);
}
function prevPhaseAction() { userSetTime(prevPhaseStart(clock.min)); }
function nextPhaseAction() {
  const n = nextPhase(clock.min);
  if (n) userSetTime(toMin(n.start));
}
function togglePlay() {
  if (net?.online && follow && !lead && leaderSeen) { follow = false; $('followChk').checked = false; }
  if (clock.min >= END) clock.set(START);
  clock.playing = !clock.playing;
  updatePlayBtn();
  if (lead) broadcastSync();
}
function updatePlayBtn() { $('playBtn').textContent = clock.playing ? '⏸' : '▶'; }

/** スクリーン: いま居る部屋（廊下なら目的地）のスライドを送る */
function activeScreenZone() {
  const h = headPos();
  const here = locate(h.x, h.z).zone;
  if (venue.screens.has(here)) return here;
  const t = currentPhase && resolveTarget(currentPhase);
  if (venue.screens.has(t)) return t;
  return venue.screens.keys().next().value;
}
function moveSlide(delta) {
  const zid = activeScreenZone();
  const sc = venue.screens.get(zid);
  sc.setIndex(sc.index + delta);
  slideIndex[zid] = sc.index;
  if (lead) broadcastSync();
}

// ---------------- 運営との同期 ----------------
let leaderSeen = false;
let lastSyncSent = 0;
function syncState() {
  return { min: clock.min, playing: clock.playing, speed: clock.speed, slides: { ...slideIndex }, by: me.id, name: me.name };
}
function broadcastSync(throttled = false) {
  const now = performance.now();
  if (throttled && now - lastSyncSent < 2000) return;
  lastSyncSent = now;
  net?.send('sync', syncState());
}
function onSync(s) {
  leaderSeen = true;
  if (!follow || lead) return;
  clock.speed = s.speed;
  clock.playing = s.playing;
  $('speedSel').value = String(s.speed);
  updatePlayBtn();
  if (Math.abs(clock.min - s.min) > 0.5 || !s.playing) clock.set(s.min, 'remote');
  for (const [zid, idx] of Object.entries(s.slides || {})) {
    const sc = venue.screens.get(zid);
    if (sc && sc.index !== idx) { sc.setIndex(idx); slideIndex[zid] = idx; }
  }
}

// ---------------- 参加者 ----------------
function ensurePeer(id, profile) {
  let a = peers.get(id);
  if (!a) {
    a = new Avatar(profile || { name: '…', category: 'shakaijin' });
    peers.set(id, a);
    scene.add(a.group);
  } else if (profile) a.setProfile(profile);
  return a;
}

// ---------------- チャット ----------------
function addChat(msg, { system = false } = {}) {
  const li = document.createElement('li');
  if (system) {
    li.className = 'sys';
    li.textContent = msg.body;
  } else {
    const who = document.createElement('span');
    who.className = 'who';
    who.style.color = lighten(categoryById(msg.category).color);
    who.textContent = msg.name;
    const body = document.createElement('span');
    body.textContent = msg.body;
    const t = document.createElement('span');
    t.className = 'time';
    t.textContent = new Date(msg.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    li.append(who, body, t);
    chatMessages.push(msg);
    xr?.setState({ chat: chatMessages.slice(-6) });
    if ($('chat').classList.contains('collapsed')) {
      unread++;
      $('chatBadge').hidden = false;
      $('chatBadge').textContent = String(unread);
    }
  }
  const log = $('chatLog');
  log.append(li);
  while (log.children.length > 120) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
let unread = 0;
function lighten(hex) { return '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.45).getHexString(); }

async function sendChat(text) {
  text = text.trim();
  if (!text) return;
  try {
    const msg = await (net ? net.postChat(me, text) : Promise.resolve({ sender_id: me.id, name: me.name, category: me.category, body: text, created_at: new Date().toISOString() }));
    addChat(msg);
    selfAvatar.say(text, performance.now());
  } catch (err) {
    addChat({ body: err.message }, { system: true });
  }
}

function setupChat() {
  for (const t of QUICK_PHRASES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.addEventListener('click', () => sendChat(t));
    $('quick').append(b);
  }
  $('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('chatInput');
    sendChat(inp.value);
    inp.value = '';
  });
  $('chatToggle').addEventListener('click', () => {
    const c = $('chat');
    c.classList.toggle('collapsed');
    if (!c.classList.contains('collapsed')) { unread = 0; $('chatBadge').hidden = true; }
  });
  if (window.matchMedia('(max-width: 720px)').matches) $('chat').classList.add('collapsed');
}

// ---------------- ツール ----------------
function setupTools() {
  const toggle = (btn, on, label) => { btn.classList.toggle('on', on); btn.textContent = `${label} ${on ? 'ON' : 'OFF'}`; };
  $('guideBtn').addEventListener('click', () => { guide.enabled = !guide.enabled; toggle($('guideBtn'), guide.enabled, '案内'); });
  let crowdOn = true;
  $('crowdBtn').addEventListener('click', () => { crowdOn = !crowdOn; crowd.setVisible(crowdOn); toggle($('crowdBtn'), crowdOn, '人影'); });
  $('slidePrevBtn').addEventListener('click', () => moveSlide(-1));
  $('slideNextBtn').addEventListener('click', () => moveSlide(1));
  $('warpBtn').addEventListener('click', warpToTarget);
  $('mapBtn').addEventListener('click', () => { $('minimap').hidden = !$('minimap').hidden; });
  $('helpBtn').addEventListener('click', () => { $('help').hidden = false; });
  $('helpClose').addEventListener('click', () => { $('help').hidden = true; });
  $('followChk').addEventListener('change', (e) => { follow = e.target.checked; });
  $('leadChk').addEventListener('change', (e) => {
    lead = e.target.checked;
    if (lead) { follow = false; broadcastSync(); }
  });
}

// ---------------- 見取り図 ----------------
function drawMinimap() {
  const cv = $('minimap');
  if (cv.hidden) return;
  const ctx = cv.getContext('2d');
  const W = cv.width;
  const [minX, minZ, maxX, maxZ] = CAMPUS.bounds;
  const s = W / Math.max(maxX - minX, maxZ - minZ);
  const ox = (W - (maxX - minX) * s) / 2, oz = (W - (maxZ - minZ) * s) / 2;
  const X = (x) => ox + (x - minX) * s, Y = (z) => oz + (z - minZ) * s;
  const R = (r) => [X(r[0]), Y(r[1]), (r[2] - r[0]) * s, (r[3] - r[1]) * s];
  ctx.clearRect(0, 0, W, W);
  ctx.fillStyle = '#3f4b3a';
  ctx.fillRect(...R(CAMPUS.bounds));
  ctx.font = '10px sans-serif';
  for (const b of BUILDINGS) {
    ctx.fillStyle = b.venue ? '#e2e8f0' : '#64748b';
    ctx.fillRect(...R(b.rect));
    if (!b.venue) { ctx.fillStyle = '#e2e8f0'; ctx.fillText(b.label, X(b.rect[0]) + 2, Y(b.rect[1]) + 11, (b.rect[2] - b.rect[0]) * s - 4); }
  }
  const target = currentPhase && resolveTarget(currentPhase);
  for (const z of ZONES) {
    ctx.fillStyle = z.color;
    ctx.globalAlpha = z.id === target ? 1 : 0.6;
    ctx.fillRect(...R(z.rect));
    ctx.globalAlpha = 1;
    if (z.id === target) { ctx.strokeStyle = '#f97316'; ctx.lineWidth = 3; ctx.strokeRect(...R(z.rect)); }
  }
  ctx.fillStyle = '#fff';
  ctx.fillText('2号館', X(36) + 2, Y(-52) - 2);
  ctx.fillText('葵テラスEAST', X(-10) + 2, Y(-86) - 2);
  ctx.fillText('正門', X(PLACES.gate.x) - 10, Y(PLACES.gate.z) - 2);
  for (const a of peers.values()) {
    ctx.fillStyle = categoryById(a.profile.category).color;
    ctx.beginPath(); ctx.arc(X(a.group.position.x), Y(a.group.position.z), 4, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  }
  const h = headPos(), yaw = headYaw();
  ctx.save();
  ctx.translate(X(h.x), Y(h.z));
  ctx.rotate(-yaw);
  ctx.fillStyle = '#f97316';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---------------- 入力（PC・スマホ） ----------------
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

let drag = null;
const canvasEl = renderer.domElement;
canvasEl.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvasEl.setPointerCapture(e.pointerId); });
canvasEl.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  const k = e.pointerType === 'touch' ? 0.006 : 0.004;
  rig.rotation.y += dx * k;
  pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * k));
});
const endDrag = (e) => { if (drag?.id === e.pointerId) drag = null; };
canvasEl.addEventListener('pointerup', endDrag);
canvasEl.addEventListener('pointercancel', endDrag);

const joy = { x: 0, y: 0, id: null };
const joyEl = $('joystick'), stickEl = $('stick');
joyEl.addEventListener('pointerdown', (e) => { joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); moveJoy(e); });
joyEl.addEventListener('pointermove', (e) => { if (joy.id === e.pointerId) moveJoy(e); });
const endJoy = (e) => { if (joy.id !== e.pointerId) return; joy.id = null; joy.x = joy.y = 0; stickEl.style.transform = ''; };
joyEl.addEventListener('pointerup', endJoy);
joyEl.addEventListener('pointercancel', endJoy);
function moveJoy(e) {
  const r = joyEl.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / (r.width / 2);
  let y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  joy.x = x; joy.y = y;
  stickEl.style.transform = `translate(${x * 35}px, ${y * 35}px)`;
}

function desktopMove(dt) {
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyA')) s -= 1;
  if (keys.has('KeyD')) s += 1;
  if (keys.has('ArrowLeft')) rig.rotation.y += dt * 1.8;
  if (keys.has('ArrowRight')) rig.rotation.y -= dt * 1.8;
  f += -joy.y; s += joy.x;
  if (!f && !s) return;
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5 : 2.4) * dt;
  const yaw = rig.rotation.y;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  tryMove((fx * f + rx * s) * speed, (fz * f + rz * s) * speed);
}

// ---------------- 開始 ----------------
let selfAvatar = null;
let xr = null;

async function start(profile, pass) {
  if (started) return;
  me = profile;
  store.set(PROFILE_KEY, me);

  if (pass) {
    const n = new Net({
      onPeerJoin: (id, prof) => ensurePeer(id, prof),
      onPeerLeave: (id) => { peers.get(id)?.dispose(); peers.delete(id); },
      onPose: (id, p) => ensurePeer(id).setTarget(p.x, p.z, p.ry, p.p || 0),
      onChat: (msg) => { addChat(msg); peers.get(msg.sender_id)?.say(msg.body, performance.now()); },
      onSync,
      onHello: () => { if (lead) broadcastSync(); },
      onStatus: (t) => { $('onlineText').textContent = t; xr?.setState({ online: t }); },
    });
    await n.connect(pass, me); // 失敗時は例外 → フォームにエラー表示
    net = n;
  }
  started = true;

  $('entry').hidden = true;
  $('hud').hidden = false;
  $('leadWrap').hidden = !isStaff() || !net;
  $('followWrap').hidden = !net;
  if (!net) $('onlineText').textContent = 'ひとりで下見中（オフライン）';

  selfAvatar = new Avatar(me, { self: true });
  rig.add(selfAvatar.group);

  setupTimeline();
  setupChat();
  setupTools();
  clock.set(START);
  crowd.setPhase(phaseAt(START), true);

  xr = new XRControls(renderer, rig, camera, {
    prevPhase: prevPhaseAction, nextPhase: nextPhaseAction, togglePlay,
    toggleGuide: () => $('guideBtn').click(),
    warp: warpToTarget,
    slidePrev: () => moveSlide(-1), slideNext: () => moveSlide(1),
    say: (t) => sendChat(t),
  });
  xr.setState({ chat: chatMessages.slice(-6), online: $('onlineText').textContent });
  // VR対応端末（Meta Quest など）のときだけ「ENTER VR」ボタンを出す
  navigator.xr?.isSessionSupported('immersive-vr').then((ok) => {
    if (ok) document.body.appendChild(VRButton.createButton(renderer));
  }).catch(() => {});
  renderer.xr.addEventListener('sessionstart', () => { camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0); });
  renderer.xr.addEventListener('sessionend', () => { camera.position.set(0, EYE, 0); });

  addChat({ body: `${EVENT.title} の会場へようこそ。オレンジの矢印が案内します。` }, { system: true });
  if (net) {
    for (const m of await net.history()) addChat(m);
    addChat({ body: '— ここから新しいメッセージ —' }, { system: true });
  }
  renderer.setAnimationLoop(loop);
}

// ---------------- メインループ ----------------
let last = performance.now();
let lastPose = 0;
let lastPoseKey = '';
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const inXR = renderer.xr.isPresenting;
  if (inXR) xr.update(dt, tryMove);
  else {
    desktopMove(dt);
    camera.rotation.set(-pitch, 0, 0, 'YXZ');
  }
  clock.tick(dt);

  const h = headPos();
  const target = currentPhase ? resolveTarget(currentPhase) : null;
  guide.update(dt, h, target);
  crowd.update(dt);
  for (const a of peers.values()) a.update(dt, now);
  selfAvatar.update(dt, now);

  const tText = guide.arrived ? `✓ ${targetLabel(target)} に到着しています` : `→ 次の行き先：${targetLabel(target)}`;
  const tEl = $('targetText');
  if (tEl.textContent !== tText) { tEl.textContent = tText; tEl.classList.toggle('arrived', guide.arrived); }
  if (inXR) {
    xr.setState({ time: fmt(clock.min), title: currentPhase?.title || '', target: targetLabel(target), arrived: guide.arrived, guide: guide.enabled, playing: clock.playing });
  }

  // 自分の位置を送る（10回/秒まで・変化時、または2秒ごと）
  if (net?.online && now - lastPose > 100) {
    const pose = { id: me.id, x: +h.x.toFixed(2), z: +h.z.toFixed(2), ry: +headYaw().toFixed(2), p: inXR ? 0 : +(-pitch).toFixed(2) };
    const key = `${pose.x},${pose.z},${pose.ry},${pose.p}`;
    if (key !== lastPoseKey || now - lastPose > 2000) {
      net.send('pose', pose);
      lastPoseKey = key;
      lastPose = now;
    }
  }
  if (Math.floor(now / 200) !== Math.floor((now - dt * 1000) / 200)) drawMinimap();
  renderer.render(scene, camera);
}

// デバッグ・確認用
window.__tmc = { clock, rig, scene, guide, venue, get me() { return me; } };
