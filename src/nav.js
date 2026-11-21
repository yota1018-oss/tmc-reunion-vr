// 位置判定・当たり判定・経路探索（会場の形は config.js から自動で作る）
//   経路は「通れる直線でつながる点どうし」をつないだグラフで最短路を探す。
import { BUILDINGS, ZONES, CAMPUS, PLACES, OUTDOOR_NODES, zoneById } from './config.js';

const MARGIN = 0.3;

export const inRect = (r, x, z) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];

/** 点が rect のどの辺の上にあるか: n(z最小) s(z最大) w(x最小) e(x最大) */
export function sideOf(rect, p) {
  const d = { n: Math.abs(p.z - rect[1]), s: Math.abs(p.z - rect[3]), w: Math.abs(p.x - rect[0]), e: Math.abs(p.x - rect[2]) };
  return Object.entries(d).sort((a, b) => a[1] - b[1])[0][0];
}
/** 辺の外向き法線 */
export const NORMAL = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
export const OPPOSITE = { n: 's', s: 'n', w: 'e', e: 'w' };

/** 出入口（辺の上の点）の内側・外側の点 */
export function doorPoints(rect, door, dist = 0.9) {
  const side = sideOf(rect, door);
  const [nx, nz] = NORMAL[side];
  return {
    side,
    inside: { x: door.x - nx * dist, z: door.z - nz * dist },
    outside: { x: door.x + nx * dist, z: door.z + nz * dist },
  };
}

/** 出入口を通り抜けられる細長い範囲 */
function doorRect(rect, door) {
  const side = sideOf(rect, door);
  const h = Math.max(0.15, door.w / 2 - MARGIN);
  if (side === 'n' || side === 's') return [door.x - h, door.z - 1, door.x + h, door.z + 1];
  return [door.x - 1, door.z - h, door.x + 1, door.z + h];
}

const inset = (r, m = MARGIN) => [r[0] + m, r[1] + m, r[2] - m, r[3] - m];
const expand = (r, m = MARGIN) => [r[0] - m, r[1] - m, r[2] + m, r[3] + m];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------- 歩ける範囲 ----------
const interiorRects = [];
const blockedRects = [];
for (const b of BUILDINGS) {
  blockedRects.push(expand(b.rect));
  if (!b.venue) continue;
  for (const e of b.entrances) interiorRects.push(doorRect(b.rect, e));
  for (const c of b.corridors || []) interiorRects.push(inset(c));
}
for (const z of ZONES) {
  interiorRects.push(inset(z.rect));
  for (const d of z.doors) interiorRects.push(doorRect(z.rect, d));
}

export function isWalkable(x, z) {
  if (interiorRects.some((r) => inRect(r, x, z))) return true;
  if (blockedRects.some((r) => inRect(r, x, z))) return false;
  return inRect(inset(CAMPUS.bounds, 1), x, z);
}

/** いる場所: { zone, building }（屋外は両方 null） */
export function locate(x, z) {
  const zone = ZONES.find((zz) => inRect(zz.rect, x, z));
  if (zone) return { zone: zone.id, building: zone.building };
  const b = BUILDINGS.find((bb) => bb.venue && inRect(bb.rect, x, z));
  return { zone: null, building: b ? b.id : null };
}

/** a→b の直線が歩ける場所だけを通り、部屋（allowZone 以外）を横切らないか */
function clearLine(a, b, allowZone = null) {
  const n = Math.max(1, Math.ceil(dist(a, b) / 0.4));
  for (let i = 1; i < n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n;
    if (!isWalkable(x, z)) return false;
    const zz = ZONES.find((q) => inRect(q.rect, x, z));
    if (zz && zz.id !== allowZone) return false;
  }
  return true;
}

// ---------- グラフ ----------
// ノード: 屋外の経由点 / 建物の出入口の内外 / 部屋の出入口の内外 / 廊下の角
const nodes = []; // { id, x, z, room?: zoneId（部屋の中の点） }
const addNode = (id, p, extra = {}) => { nodes.push({ id, x: p.x, z: p.z, ...extra }); return nodes.length - 1; };
const fixedEdges = [];

for (const [k, [x, z]] of Object.entries(OUTDOOR_NODES)) addNode('o:' + k, { x, z });
for (const b of BUILDINGS.filter((bb) => bb.venue)) {
  b.entrances.forEach((e, i) => {
    const dp = doorPoints(b.rect, e, 1.3);
    const o = addNode(`e:${b.id}:${i}:out`, dp.outside);
    const n = addNode(`e:${b.id}:${i}:in`, dp.inside);
    fixedEdges.push([o, n]);
  });
  // 廊下の中心・交差部分も経由点にする
  for (const [i, c] of (b.corridors || []).entries()) {
    addNode(`c:${b.id}:${i}`, { x: (c[0] + c[2]) / 2, z: (c[1] + c[3]) / 2 });
  }
  const cs = b.corridors || [];
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], c = cs[j];
      const ix = [Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.min(a[2], c[2]), Math.min(a[3], c[3])];
      if (ix[0] <= ix[2] && ix[1] <= ix[3]) addNode(`x:${b.id}:${i}:${j}`, { x: (ix[0] + ix[2]) / 2, z: (ix[1] + ix[3]) / 2 });
    }
  }
}
export const zoneNav = new Map();
for (const z of ZONES) {
  const center = { x: (z.rect[0] + z.rect[2]) / 2, z: (z.rect[1] + z.rect[3]) / 2 };
  const doors = z.doors.map((d, i) => {
    const dp = doorPoints(z.rect, d);
    const o = addNode(`d:${z.id}:${i}:out`, dp.outside);
    const n = addNode(`d:${z.id}:${i}:in`, dp.inside, { room: z.id });
    fixedEdges.push([o, n]);
    return { ...dp, inNode: n, outNode: o };
  });
  zoneNav.set(z.id, { center, doors, inside: doors[0].inside, outside: doors[0].outside });
}
// 建物の出入口の情報（看板などで使う）
export const buildingNav = new Map();
for (const b of BUILDINGS.filter((bb) => bb.venue)) {
  buildingNav.set(b.id, { entrances: b.entrances.map((e) => doorPoints(b.rect, e, 1.3)) });
}

// 見通しで辺を張る（部屋の中のノードは同じ部屋の中だけ）
const adj = nodes.map(() => []);
const link = (i, j) => { const w = dist(nodes[i], nodes[j]); adj[i].push([j, w]); adj[j].push([i, w]); };
for (const [i, j] of fixedEdges) link(i, j);
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (a.room || b.room) {
      if (a.room && a.room === b.room && clearLine(a, b, a.room)) link(i, j);
      continue;
    }
    if (dist(a, b) > 90) continue;
    if (clearLine(a, b)) link(i, j);
  }
}

function dijkstra(startEdges, goalTest) {
  const D = new Float64Array(nodes.length).fill(Infinity);
  const prev = new Int32Array(nodes.length).fill(-1);
  const done = new Uint8Array(nodes.length);
  for (const [j, w] of startEdges) if (w < D[j]) D[j] = w;
  for (;;) {
    let u = -1;
    for (let k = 0; k < nodes.length; k++) if (!done[k] && D[k] < Infinity && (u < 0 || D[k] < D[u])) u = k;
    if (u < 0) return null;
    done[u] = 1;
    const g = goalTest(u);
    if (g !== false) {
      // ゴールまでの残りを足して最良か確認（ゴール辺の重みを含めるため goalTest がコストを返す）
      return { u, prev, cost: D[u] + g };
    }
    for (const [v, w] of adj[u]) if (D[u] + w < D[v]) { D[v] = D[u] + w; prev[v] = u; }
  }
}

/** 点 p から直接行けるノード */
function connectFrom(p) {
  const here = locate(p.x, p.z);
  const out = [];
  nodes.forEach((n, i) => {
    if (here.zone) {
      if (n.room === here.zone && clearLine(p, n, here.zone)) out.push([i, dist(p, n)]);
    } else if (!n.room && dist(p, n) < 90 && clearLine(p, n)) out.push([i, dist(p, n)]);
  });
  return out;
}

// ---------- 目的地 ----------
export function targetPoint(id) {
  if (PLACES[id]) return { x: PLACES[id].x, z: PLACES[id].z };
  return zoneNav.get(id)?.center || null;
}
export function targetLabel(id) {
  return PLACES[id]?.label || zoneById(id)?.label || '';
}
/** ワープ先（部屋の最初の出入口の内側、または屋外の目印） */
export function warpPoint(id) {
  if (PLACES[id]) return { x: PLACES[id].x, z: PLACES[id].z - 2, face: { x: PLACES[id].x, z: PLACES[id].z + 5 } };
  const n = zoneNav.get(id);
  if (!n) return null;
  return { x: n.inside.x, z: n.inside.z, face: n.center };
}

/** from から目的地（部屋 id か PLACES の id）までの経由点の列（from を含む） */
export function route(from, targetId) {
  const goal = targetPoint(targetId);
  if (!goal) return [];
  const start = { x: from.x, z: from.z };
  const here = locate(from.x, from.z);
  if (here.zone === targetId || (!zoneById(targetId) && clearLine(start, goal))) return [start, goal];

  // ゴールに直接行けるノード
  const goalCost = new Map();
  if (zoneById(targetId)) {
    nodes.forEach((n, i) => { if (n.room === targetId) goalCost.set(i, dist(n, goal)); });
  } else {
    nodes.forEach((n, i) => { if (!n.room && dist(n, goal) < 90 && clearLine(n, goal)) goalCost.set(i, dist(n, goal)); });
  }
  const startEdges = connectFrom(start);
  if (!startEdges.length) return [start, goal];
  const res = dijkstra(startEdges, (u) => (goalCost.has(u) ? goalCost.get(u) : false));
  if (!res) return [start, goal];
  const path = [];
  for (let u = res.u; u >= 0; u = res.prev[u]) path.unshift({ x: nodes[u].x, z: nodes[u].z });
  return [start, ...path, goal];
}
