<script setup>
import { ref, computed, onMounted } from 'vue';

// BPMN-style notation rendered from the Oumma engine design:
//  START = filled circle, END = double circle, HUMAN = blue box (group label),
//  SYSTEM = amber box, edges = curved arrows with condition labels.
//
// Layouts (classic graph-drawing algorithms), selectable by the user:
//  lr      — Sugiyama-style layered (longest path), left-to-right
//  tb      — same layering, top-down (orthogonal flowchart style)
//  circular— circular layout: nodes on a circle in topological (BFS) order
//  force   — force-directed (Fruchterman–Reingold spring embedding)

const def = ref(null);
const layoutMode = ref(typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function'
  ? (localStorage.getItem('bpmn-layout') || 'lr')
  : 'lr');
function onLayoutChange() {
  try { localStorage.setItem('bpmn-layout', layoutMode.value); } catch (e) { /* ignore */ }
}

// Drag-to-pan: grab the canvas and move it to view any part of the process.
const scrollEl = ref(null);
const panning = ref(false);
const panStart = { x: 0, y: 0, left: 0, top: 0 };
function onPointerDown(e) {
  panning.value = true;
  panStart.x = e.clientX;
  panStart.y = e.clientY;
  panStart.left = scrollEl.value.scrollLeft;
  panStart.top = scrollEl.value.scrollTop;
  scrollEl.value.setPointerCapture(e.pointerId);
}
function onPointerMove(e) {
  if (!panning.value) return;
  scrollEl.value.scrollLeft = panStart.left - (e.clientX - panStart.x);
  scrollEl.value.scrollTop = panStart.top - (e.clientY - panStart.y);
}
function onPointerUp() {
  panning.value = false;
}

const NODE_W = 168;
const NODE_H = 56;
const COL_GAP = 90;   // lr: gap between layers (x)
const ROW_GAP = 46;   // lr: gap between rows   (y)
const TB_COL_GAP = 40;// tb: gap between nodes in a layer (x)
const TB_ROW_GAP = 74;// tb: gap between layers (y)

function normalize(d) {
  const tasks = (d.tasks ?? [])
    .map((t) => ({
      id: String(t.task_id ?? t.id ?? ''),
      type: String(t.type ?? 'HUMAN').toUpperCase(),
      group: t.group ? String(t.group) : '',
    }))
    .filter((t) => t.id);
  const raw = (d.topology ?? []).filter((e) => e);
  const edges = raw
    .filter((e) => e.from && e.to)
    .map((e) => ({ from: String(e.from), to: String(e.to), condition: e.condition ? String(e.condition) : '', fork: !!e.fork }));
  // Parallel forks: edges flagged fork:true (grouped by source).
  const forkMap = new Map();
  for (const e of edges) {
    if (!e.fork) continue;
    if (!forkMap.has(e.from)) forkMap.set(e.from, { source: e.from, targets: [] });
    forkMap.get(e.from).targets.push(e.to);
  }
  // Parallel joins: {join_from: [...], to, join: 'and'} objects (no from/to).
  const joinMap = new Map();
  for (const e of raw) {
    if (!e.join_from || !Array.isArray(e.join_from)) continue;
    const key = e.join_from.map(String).join('|');
    if (!joinMap.has(key)) joinMap.set(key, { sources: e.join_from.map(String), outputs: [] });
    joinMap.get(key).outputs.push({ to: String(e.to), condition: e.condition ? String(e.condition) : '' });
  }
  const forks = [...forkMap.values()];
  const joins = [...joinMap.values()];
  // Join connections as synthetic from/to edges so the layouts place the
  // join target after its branches (rendered through the join gateway).
  for (const j of joins) {
    for (const src of j.sources) {
      for (const o of j.outputs) edges.push({ from: src, to: o.to, condition: '', joinEdge: true });
    }
  }
  const start = d.start_task_id
    ? String(d.start_task_id)
    : (tasks.find((t) => t.type === 'START')?.id ?? tasks[0]?.id ?? '');
  return { description: d.description ? String(d.description) : '', tasks, edges, start, forks, joins };
}

onMounted(() => {
  window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'process-design' && ev.data.payload) {
      def.value = normalize(ev.data.payload);
    }
    if (ev.data && ev.data.type === 'design-layout') {
      layoutMode.value = String(ev.data.layout || 'lr');
    }
  });
  // Request the current design: the parent's push can fire before this
  // window's listener exists (iframe load race), so we pull on mount.
  window.parent.postMessage({ type: 'design-request' }, '*');
});

function buildGraph(d) {
  const ids = d.tasks.map((t) => t.id);
  const out = new Map();
  const inn = new Map();
  for (const id of ids) { out.set(id, []); inn.set(id, []); }
  for (const e of d.edges) {
    const from = String(e.from);
    const to = String(e.to);
    if (out.has(from) && inn.has(to)) {
      out.get(from).push(to);
      inn.get(to).push(from);
    }
  }
  return { ids, out, inn };
}

// Longest-path layering (cycle-guarded) — shared by lr and tb.
function layers(d) {
  const { ids, inn } = buildGraph(d);
  const depth = new Map();
  const visit = (id) => {
    if (depth.has(id)) return depth.get(id);
    depth.set(id, 0);
    const preds = inn.get(id) ?? [];
    const v = preds.length ? 1 + Math.max(...preds.map(visit)) : 0;
    depth.set(id, v);
    return v;
  };
  for (const id of ids) visit(id);
  const cols = new Map();
  for (const id of ids) {
    const c = depth.get(id) ?? 0;
    if (!cols.has(c)) cols.set(c, []);
    cols.get(c).push(id);
  }
  return [...cols.keys()].sort((a, b) => a - b).map((c) => cols.get(c));
}

// BFS order from the start (rest appended in original order) — for circular.
function bfsOrder(d) {
  const { ids, out } = buildGraph(d);
  const seen = new Set();
  const order = [];
  const queue = d.start && ids.includes(d.start) ? [d.start] : [];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const nx of out.get(id) ?? []) if (!seen.has(nx)) queue.push(nx);
  }
  for (const id of ids) if (!seen.has(id)) order.push(id);
  return order;
}

function layoutLR(d) {
  const cols = layers(d);
  let maxRows = 1;
  for (const list of cols) maxRows = Math.max(maxRows, list.length);
  const totalH = maxRows * (NODE_H + ROW_GAP);
  const pos = new Map();
  cols.forEach((list, c) => {
    const colH = list.length * (NODE_H + ROW_GAP);
    const y0 = (totalH - colH) / 2 + ROW_GAP / 2;
    list.forEach((id, i) => {
      pos.set(id, { x: 30 + c * (NODE_W + COL_GAP), y: y0 + i * (NODE_H + ROW_GAP) });
    });
  });
  return { pos, width: 30 + cols.length * (NODE_W + COL_GAP), height: totalH + ROW_GAP };
}

function layoutTB(d) {
  const cols = layers(d);
  let maxInLayer = 1;
  for (const list of cols) maxInLayer = Math.max(maxInLayer, list.length);
  const totalW = maxInLayer * (NODE_W + TB_COL_GAP);
  const pos = new Map();
  cols.forEach((list, r) => {
    const rowW = list.length * (NODE_W + TB_COL_GAP);
    const x0 = (totalW - rowW) / 2 + TB_COL_GAP / 2;
    list.forEach((id, i) => {
      pos.set(id, { x: x0 + i * (NODE_W + TB_COL_GAP), y: 30 + r * (NODE_H + TB_ROW_GAP) });
    });
  });
  return { pos, width: totalW + TB_COL_GAP, height: 30 + cols.length * (NODE_H + TB_ROW_GAP) };
}

function layoutCircular(d) {
  const order = bfsOrder(d);
  const n = order.length || 1;
  const R = Math.max(340, (n * (NODE_W + 30)) / (2 * Math.PI));
  const cx = R + NODE_W / 2 + 30;
  const cy = R + NODE_H / 2 + 30;
  const pos = new Map();
  order.forEach((id, i) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    pos.set(id, { x: cx + R * Math.cos(a) - NODE_W / 2, y: cy + R * Math.sin(a) - NODE_H / 2 });
  });
  const size = 2 * R + NODE_W + 60;
  return { pos, width: size, height: size };
}

// Fruchterman–Reingold: seeded from the LR layout, 150 cooling iterations.
function layoutForce(d) {
  const { ids, out } = buildGraph(d);
  const n = ids.length || 1;
  const seed = layoutLR(d);
  const W0 = Math.max(seed.width, 900);
  const H0 = Math.max(seed.height, 640);
  const k = 1.1 * Math.sqrt((W0 * H0) / n);
  const p = new Map();
  ids.forEach((id, i) => {
    const s = seed.pos.get(id);
    p.set(id, { x: s ? s.x + NODE_W / 2 : (i % 5) * 200 + 100, y: s ? s.y + NODE_H / 2 : Math.floor(i / 5) * 160 + 100 });
  });
  const ITER = 150;
  for (let it = 0; it < ITER; it++) {
    const t = (W0 / 10) * (1 - it / ITER);
    const disp = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = p.get(ids[i]);
        const b = p.get(ids[j]);
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const rep = (k * k) / dist;
        dx /= dist; dy /= dist;
        const da = disp.get(ids[i]);
        const db = disp.get(ids[j]);
        da.x += dx * rep; da.y += dy * rep;
        db.x -= dx * rep; db.y -= dy * rep;
      }
    }
    for (const e of d.edges) {
      const A = p.get(String(e.from));
      const B = p.get(String(e.to));
      if (!A || !B) continue;
      let dx = A.x - B.x;
      let dy = A.y - B.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const att = (dist * dist) / k;
      dx /= dist; dy /= dist;
      const da = disp.get(String(e.from));
      const db = disp.get(String(e.to));
      da.x -= dx * att; da.y -= dy * att;
      db.x += dx * att; db.y += dy * att;
    }
    for (const id of ids) {
      const v = disp.get(id);
      const dist = Math.sqrt(v.x * v.x + v.y * v.y) || 0.01;
      const pt = p.get(id);
      pt.x += (v.x / dist) * Math.min(dist, t);
      pt.y += (v.y / dist) * Math.min(dist, t);
    }
  }
  // Compact the result: scale the bounding box so the diagram stays a
  // reasonable size (force layouts can blow up), then re-center.
  let minX = Infinity; let minY = Infinity; let maxX = 0; let maxY = 0;
  for (const pt of p.values()) {
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x);
    maxY = Math.max(maxY, pt.y);
  }
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const s = Math.min(1, 1800 / w, 1200 / h);
  const pos = new Map();
  for (const [id, pt] of p) {
    const x = (pt.x - minX) * s + 40;
    const y = (pt.y - minY) * s + 40;
    pos.set(id, { x, y });
  }
  return { pos, width: w * s + NODE_W + 80, height: h * s + NODE_H + 80 };
}

const layout = computed(() => {
  const d = def.value;
  if (!d) return null;
  switch (layoutMode.value) {
    case 'tb': return layoutTB(d);
    case 'circular': return layoutCircular(d);
    case 'force': return layoutForce(d);
    default: return layoutLR(d);
  }
});

const taskById = computed(() => new Map((def.value?.tasks ?? []).map((t) => [t.id, t])));

// BPMN gateway rendering: parallel fork (diamond +), parallel join (diamond
// ^), exclusive choice after a join with several conditional outputs (X).
const GW_R = 15;
function centerOf(pos, id) {
  const p = pos.get(String(id));
  return p ? { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 } : null;
}
function avgPts(pts) {
  return {
    x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
    y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
  };
}
function lerpPt(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
// Path for one segment. kind: 'node' (task box / event) or 'gw' (gateway
// diamond center point). Mode-aware for node endpoints, straight elsewhere.
function segPath(a, aKind, b, bKind, aTask, bTask) {
  const mode = layoutMode.value;
  if (aKind === 'gw' && bKind === 'gw') return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  if (aKind === 'gw' && bKind === 'node') {
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    return `M ${a.x} ${a.y} L ${b.x + NODE_W / 2 - (dx / dist) * 34} ${b.y + NODE_H / 2 - (dy / dist) * 34}`;
  }
  if (aKind === 'node' && bKind === 'gw') {
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const off = aTask && aTask.type === 'START' ? 12 : 34;
    return `M ${a.x + (dx / dist) * off} ${a.y + (dy / dist) * off} L ${b.x} ${b.y}`;
  }
  // node -> node: existing curved routing
  const from = { x: a.x - NODE_W / 2, y: a.y - NODE_H / 2 };
  const to = { x: b.x - NODE_W / 2, y: b.y - NODE_H / 2 };
  return edgePath(from, to, aTask);
}

const render = computed(() => {
  const d = def.value;
  const lay = layout.value;
  if (!d || !lay) return { edges: [], gateways: [] };
  const pos = lay.pos;
  const c = (id) => centerOf(pos, id);
  const segs = [];
  const gateways = [];
  const isForkEdge = (e) => e.fork;
  const forkSource = new Set((d.forks ?? []).map((f) => f.source));
  const joinEdgeKey = new Set((d.joins ?? []).flatMap((j) => j.sources.flatMap((src) => j.outputs.map((o) => `${src}->${o.to}`))));

  for (const f of d.forks ?? []) {
    const s = c(f.source);
    const ts = f.targets.map(c).filter(Boolean);
    if (!s || ts.length === 0) continue;
    const G = lerpPt(s, avgPts(ts), 0.45);
    gateways.push({ kind: 'fork', at: G, label: 'parallel fork' });
    for (const t of f.targets) {
      const tt = c(t);
      if (!tt) continue;
      segs.push({ d: segPath(s, 'node', G, 'gw', taskById.value.get(f.source), null), arrow: true });
      segs.push({ d: segPath(G, 'gw', tt, 'node', null, taskById.value.get(t)), arrow: true, label: '', lx: 0, ly: 0 });
    }
  }
  for (const j of d.joins ?? []) {
    const ss = j.sources.map(c).filter(Boolean);
    const outs = j.outputs.map((o) => ({ to: o.to, condition: o.condition, pt: c(o.to) })).filter((o) => o.pt);
    if (ss.length === 0 || outs.length === 0) continue;
    const G = lerpPt(avgPts(ss), avgPts(outs.map((o) => o.pt)), 0.35);
    gateways.push({ kind: 'join', at: G, label: 'parallel join' });
    let fromG = G;
    if (outs.length > 1) {
      const Gx = lerpPt(G, avgPts(outs.map((o) => o.pt)), 0.6);
      gateways.push({ kind: 'xor', at: Gx, label: 'exclusive choice' });
      segs.push({ d: segPath(G, 'gw', Gx, 'gw', null, null), arrow: true });
      fromG = Gx;
    }
    for (const src of j.sources) {
      const sp = c(src);
      if (!sp) continue;
      segs.push({ d: segPath(sp, 'node', G, 'gw', taskById.value.get(src), null), arrow: true });
    }
    for (const o of outs) {
      const t = taskById.value.get(o.to);
      segs.push({
        d: segPath(fromG, 'gw', o.pt, 'node', null, t),
        arrow: true,
        label: o.condition || '',
        lx: (fromG.x + o.pt.x + NODE_W / 2) / 2,
        ly: (fromG.y + o.pt.y + NODE_H / 2) / 2 - 8,
      });
    }
  }
  for (const e of d.edges) {
    if (isForkEdge(e) || e.joinEdge || joinEdgeKey.has(`${e.from}->${e.to}`) || forkSource.has(e.from) && e.fork) continue;
    const a = c(e.from);
    const b = c(e.to);
    if (!a || !b) continue;
    if (forkSource.has(e.from) && e.fork) continue;
    segs.push({
      d: segPath(a, 'node', b, 'node', taskById.value.get(e.from), taskById.value.get(e.to)),
      arrow: true,
      label: e.condition || '',
      lx: (a.x + b.x) / 2,
      ly: (a.y + b.y) / 2 - 8,
    });
  }
  return { edges: segs, gateways };
});

function nodeKind(t) {
  if (t.type === 'START') return 'start';
  if (t.type === 'END') return 'end';
  if (t.type === 'SYSTEM') return 'system';
  return 'human';
}

function truncate(v) {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t.length > 48 ? t.slice(0, 45).trimEnd() + '…' : t;
}

function edgePath(from, to, fromTask) {
  const mode = layoutMode.value;
  const cx1 = from.x + NODE_W / 2;
  const cy1 = from.y + NODE_H / 2;
  const cx2 = to.x + NODE_W / 2;
  const cy2 = to.y + NODE_H / 2;
  if (mode === 'tb') {
    const x1 = cx1;
    const y1 = fromTask && fromTask.type === 'START' ? cy1 + 12 : from.y + NODE_H;
    const x2 = cx2;
    const y2 = to.y;
    const my = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
  }
  if (mode === 'lr') {
    const x1 = fromTask && fromTask.type === 'START' ? from.x + 28 : from.x + NODE_W;
    const y1 = cy1;
    const x2 = to.x;
    const y2 = cy2;
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  }
  // circular / force: center-to-center, trimmed at the node borders.
  let dx = cx2 - cx1;
  let dy = cy2 - cy1;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= dist; dy /= dist;
  const off1 = fromTask && fromTask.type === 'START' ? 12 : 34;
  const off2 = 34;
  const x1 = cx1 + dx * off1;
  const y1 = cy1 + dy * off1;
  const x2 = cx2 - dx * off2;
  const y2 = cy2 - dy * off2;
  // Slight perpendicular curve so reverse edges don't overlap.
  const px = -dy;
  const py = dx;
  const bend = Math.min(40, dist * 0.15);
  const mx1 = x1 + (x2 - x1) / 3 + px * bend;
  const my1 = y1 + (y2 - y1) / 3 + py * bend;
  const mx2 = x1 + (2 * (x2 - x1)) / 3 + px * bend;
  const my2 = y1 + (2 * (y2 - y1)) / 3 + py * bend;
  return `M ${x1} ${y1} C ${mx1} ${my1}, ${mx2} ${my2}, ${x2} ${y2}`;
}
</script>

<template>
  <div class="wrap">
    <div v-if="!def" class="empty">Waiting for process design…</div>
    <template v-else>
      <div class="head">
        <span class="title">{{ def.description || 'Process diagram' }}</span>
        <select class="layout-select" v-model="layoutMode" @change="onLayoutChange" title="Diagram layout algorithm">
          <option value="lr">Layout: Left → Right (layered)</option>
          <option value="tb">Layout: Top → Down (layered)</option>
          <option value="circular">Layout: Circular</option>
          <option value="force">Layout: Force-directed</option>
        </select>
        <span class="legend">
          <span><i class="lg start"></i>Start</span>
          <span><i class="lg end"></i>End</span>
          <span><i class="lg human"></i>Human</span>
          <span><i class="lg system"></i>System</span>
          <span><i class="lg gw"></i>Fork / Join</span>
        </span>
      </div>
      <div ref="scrollEl" class="scroll" :class="panning ? 'panning' : ''"
        @pointerdown="onPointerDown" @pointermove="onPointerMove"
        @pointerup="onPointerUp" @pointercancel="onPointerUp">
        <svg :width="layout.width" :height="layout.height" :viewBox="`0 0 ${layout.width} ${layout.height}`">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#7d93b2" />
            </marker>
          </defs>

          <g v-for="(seg, i) in render.edges" :key="'e' + i">
            <path :d="seg.d" fill="none" stroke="#7d93b2" stroke-width="1.6"
              :marker-end="seg.arrow ? 'url(#arrow)' : null" />
            <text v-if="seg.label" :x="seg.lx" :y="seg.ly" class="cond" text-anchor="middle">
              {{ truncate(seg.label) }}
            </text>
          </g>

          <!-- BPMN gateways: parallel fork (+), parallel join (^), exclusive (X) -->
          <g v-for="(g, i) in render.gateways" :key="'g' + i">
            <polygon
              :points="`${g.at.x},${g.at.y - GW_R} ${g.at.x + GW_R},${g.at.y} ${g.at.x},${g.at.y + GW_R} ${g.at.x - GW_R},${g.at.y}`"
              class="gw" :class="'gw-' + g.kind"
            />
            <text :x="g.at.x" :y="g.at.y + 5" class="gw-sym" text-anchor="middle">
              {{ g.kind === 'fork' ? '+' : g.kind === 'join' ? '\u2227' : 'X' }}
            </text>
          </g>

          <g v-for="t in def.tasks" :key="t.id">
            <template v-if="layout.pos.get(t.id)">
              <template v-if="nodeKind(t) === 'start'">
                <circle :cx="layout.pos.get(t.id).x + 16" :cy="layout.pos.get(t.id).y + NODE_H / 2" r="12" class="node-start" />
                <text :x="layout.pos.get(t.id).x + 36" :y="layout.pos.get(t.id).y + NODE_H / 2 + 4" class="lbl">start</text>
              </template>
              <template v-else-if="nodeKind(t) === 'end'">
                <circle :cx="layout.pos.get(t.id).x + 16" :cy="layout.pos.get(t.id).y + NODE_H / 2" r="13" class="node-end" />
                <circle :cx="layout.pos.get(t.id).x + 16" :cy="layout.pos.get(t.id).y + NODE_H / 2" r="8" fill="none" stroke="#e06c75" stroke-width="2" />
                <text :x="layout.pos.get(t.id).x + 36" :y="layout.pos.get(t.id).y + NODE_H / 2 + 4" class="lbl">end</text>
              </template>
              <template v-else>
                <rect :x="layout.pos.get(t.id).x" :y="layout.pos.get(t.id).y" :width="NODE_W" :height="NODE_H" rx="8"
                  :class="nodeKind(t) === 'system' ? 'node-system' : 'node-human'" />
                <text :x="layout.pos.get(t.id).x + NODE_W / 2" :y="layout.pos.get(t.id).y + 22" class="name" text-anchor="middle">{{ t.id }}</text>
                <text :x="layout.pos.get(t.id).x + NODE_W / 2" :y="layout.pos.get(t.id).y + 40" class="sub" text-anchor="middle">
                  {{ nodeKind(t) === 'system' ? 'system' : t.group || 'human' }}
                </text>
              </template>
            </template>
          </g>
        </svg>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wrap { height: 100vh; display: flex; flex-direction: column; font-family: ui-sans-serif, system-ui, sans-serif; color: #dbe4f0; background: #0b1220; }
.empty { margin: auto; color: #6b7f99; font-size: 13px; }
.head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-bottom: 1px solid #1e2c42; }
.title { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40%; }
.layout-select { background: #101b2d; color: #dbe4f0; border: 1px solid #2a3b57; border-radius: 6px; padding: 4px 8px; font-size: 12px; outline: none; cursor: pointer; }
.legend { display: flex; gap: 10px; align-items: center; font-size: 11px; color: #8fa3bf; white-space: nowrap; }
.lg { width: 10px; height: 10px; border-radius: 3px; display: inline-block; margin-right: 4px; }
.lg.start { border-radius: 50%; background: #3fb950; }
.lg.end { border-radius: 50%; border: 2px solid #e06c75; }
.lg.human { background: #3b82f6; }
.lg.system { background: #b45309; }
.scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px; cursor: grab; touch-action: none; }
.scroll.panning { cursor: grabbing; user-select: none; }
.scroll svg { display: block; }
.gw { fill: #101b2e; stroke: #e5c07b; stroke-width: 2; }
.gw-xor { stroke: #e06c75; }
.gw-sym { fill: #e5c07b; font-size: 14px; font-weight: 700; pointer-events: none; }
.gw-xor .gw-sym, .gw-xor + text { fill: #e06c75; }
.lg.gw { width: 11px; height: 11px; background: #101b2e; border: 2px solid #e5c07b; transform: rotate(45deg); display: inline-block; }
.node-start { fill: #3fb950; }
.node-end { fill: none; stroke: #e06c75; stroke-width: 2.5; }
.node-human { fill: #12233c; stroke: #3b82f6; stroke-width: 1.6; }
.node-system { fill: #241a0c; stroke: #b45309; stroke-width: 1.6; }
.name { fill: #e8eef7; font-size: 12px; font-weight: 600; }
.sub { fill: #8fa3bf; font-size: 10.5px; }
.lbl { fill: #8fa3bf; font-size: 11px; }
.cond { fill: #7d93b2; font-size: 10px; font-style: italic; }
</style>
