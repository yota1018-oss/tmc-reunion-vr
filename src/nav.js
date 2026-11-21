// 位置判定・当たり判定・経路探索（会場の形は config.js から作る）
import { BUILDINGS, ZONES, CAMPUS, PLACES, OUTDOOR_NODES, OUTDOOR_EDGES, buildingById, zoneById } from './config.js';

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
function doorPoints(rect, door, dist = 0.9) {
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
  const h = door.w / 2 - MARGIN;
  if (side === 'n' || side === 's') return [door.x - h, door.z - 1, door.x + h, door.z + 1];
  return [door.x - 1, door.z - h, door.x + 1, door.z + h];
}

const inset = (r, m = MARGIN) => [r[0] + m, r[1] + m, r[2] - m, r[3] - m];
const expand = (r, m = MARGIN) => [r[0] - m, r[1] - m, r[2] + m, r[3] + m];

// ---------- 事前計算 ----------
export const zoneNav = new Map();
for (const z of ZONES) {
  const dp = doorPoints(z.rect, z.door);
  zoneNav.set(z.id, {
    ...dp,
    center: { x: (z.rect[0] + z.rect[2]) / 2, z: (z.rect[1] + z.rect[3]) / 2 },
  });
}
export const buildingNav = new Map();
for (const b of BUILDINGS.filter((b) => b.venue)) {
  const dp = doorPoints(b.rect, b.entrance, 1.4);
  let axis = null;
  if (b.corridor) {
    const c = b.corridor;
    axis = (c[2] - c[0]) >= (c[3] - c[1])
      ? { along: 'x', fixed: (c[1] + c[3]) / 2, min: c[0] + 0.8, max: c[2] - 0.8 }
      : { along: 'z', fixed: (c[0] + c[2]) / 2, min: c[1] + 0.8, max: c[3] - 0.8 };
  }
  buildingNav.set(b.id, { ...dp, axis });
}

/** 廊下の中心線に投影 */
function onCorridor(bId, p) {
  const a = buildingNav.get(bId).axis;
  const t = Math.max(a.min, Math.min(a.max, a.along === 'x' ? p.x : p.z));
  return a.along === 'x' ? { x: t, z: a.fixed } : { x: a.fixed, z: t };
}

// 歩ける範囲（屋内）・歩けない範囲（建物）
const interiorRects = [];
const blockedRects = [];
for (const b of BUILDINGS) {
  blockedRects.push(expand(b.rect));
  if (!b.venue) continue;
  interiorRects.push(doorRect(b.rect, b.entrance));
  if (b.corridor) interiorRects.push(inset(b.corridor));
}
for (const z of ZONES) {
  interiorRects.push(inset(z.rect));
  interiorRects.push(doorRect(z.rect, z.door));
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

// ---------- 屋外の経路（ダイクストラ） ----------
function outdoorNodes() {
  const nodes = {};
  for (const [k, [x, z]] of Object.entries(OUTDOOR_NODES)) nodes[k] = { x, z };
  for (const [id, n] of buildingNav) nodes[id] = n.outside;
  return nodes;
}
const ONODES = outdoorNodes();
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function shortestFrom(end) {
  const D = {}, prev = {};
  for (const k of Object.keys(ONODES)) D[k] = Infinity;
  D[end] = 0;
  const todo = new Set(Object.keys(ONODES));
  while (todo.size) {
    let u = null;
    for (const k of todo) if (u === null || D[k] < D[u]) u = k;
    todo.delete(u);
    for (const [a, b] of OUTDOOR_EDGES) {
      const v = a === u ? b : b === u ? a : null;
      if (!v || !todo.has(v)) continue;
      const nd = D[u] + dist(ONODES[u], ONODES[v]);
      if (nd < D[v]) { D[v] = nd; prev[v] = u; }
    }
  }
  return { D, prev };
}
const SP = {};
for (const k of Object.keys(ONODES)) SP[k] = shortestFrom(k);

/** 屋外の点 from から屋外ノード end までの経由点 */
function outdoorPath(from, end, startNode = null) {
  const { D, prev } = SP[end];
  let n = startNode;
  if (!n) {
    let best = Infinity;
    for (const k of Object.keys(ONODES)) {
      const c = dist(from, ONODES[k]) + D[k];
      if (c < best) { best = c; n = k; }
    }
  }
  const pts = [];
  if (n !== startNode) pts.push(ONODES[n]);
  while (n !== end && prev[n]) { n = prev[n]; pts.push(ONODES[n]); }
  return pts;
}

// ---------- 目的地 ----------
export function targetPoint(id) {
  if (PLACES[id]) return { x: PLACES[id].x, z: PLACES[id].z };
  return zoneNav.get(id)?.center || null;
}
export function targetLabel(id) {
  return PLACES[id]?.label || zoneById(id)?.label || '';
}
/** ワープ先（部屋の入口の内側、または屋外の目印） */
export function warpPoint(id) {
  if (PLACES[id]) return { x: PLACES[id].x, z: PLACES[id].z - 2, face: { x: PLACES[id].x, z: PLACES[id].z + 5 } };
  const n = zoneNav.get(id);
  if (!n) return null;
  return { x: n.inside.x, z: n.inside.z, face: n.center };
}

/**
 * from から目的地（部屋 id か PLACES の id）までの経由点の列（from を含む）
 */
export function route(from, targetId) {
  return dedupe(routeRaw(from, targetId));
}
function dedupe(pts) {
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.05);
}
function routeRaw(from, targetId) {
  const goal = targetPoint(targetId);
  if (!goal) return [];
  const pts = [{ x: from.x, z: from.z }];
  const tz = zoneById(targetId);
  const tb = tz ? buildingById(tz.building) : null;
  const here = locate(from.x, from.z);
  if (here.zone === targetId) { pts.push(goal); return pts; }

  let state = 'outdoor';
  let curB = null;
  let startNode = null;
  if (here.zone) {
    const zn = zoneNav.get(here.zone);
    pts.push(zn.inside, zn.outside);
    curB = here.building;
    state = buildingById(curB).corridor ? 'corridor' : 'outdoor';
    if (state === 'outdoor') startNode = curB;
  } else if (here.building) {
    curB = here.building;
    state = buildingById(curB).corridor ? 'corridor' : 'outdoor';
  }

  if (state === 'corridor') {
    if (tb && tb.id === curB) {
      const zn = zoneNav.get(targetId);
      pts.push(onCorridor(curB, pts[pts.length - 1]), onCorridor(curB, zn.outside), zn.outside, zn.inside, goal);
      return pts;
    }
    const bn = buildingNav.get(curB);
    pts.push(onCorridor(curB, pts[pts.length - 1]), onCorridor(curB, bn.inside), bn.inside, bn.outside);
    startNode = curB;
  }

  // 屋外
  const endNode = tb ? tb.id : null;
  if (endNode) {
    pts.push(...outdoorPath(pts[pts.length - 1], endNode, startNode));
    const bn = buildingNav.get(tb.id);
    const zn = zoneNav.get(targetId);
    if (tb.corridor) {
      pts.push(bn.inside, onCorridor(tb.id, bn.inside), onCorridor(tb.id, zn.outside), zn.outside, zn.inside, goal);
    } else {
      pts.push(zn.inside, goal);
    }
  } else {
    // 屋外の目印（正門など）: いちばん近いノードを経由
    let best = null, bd = Infinity;
    for (const k of Object.keys(ONODES)) { const d = dist(goal, ONODES[k]); if (d < bd) { bd = d; best = k; } }
    pts.push(...outdoorPath(pts[pts.length - 1], best, startNode), goal);
  }
  return pts;
}
