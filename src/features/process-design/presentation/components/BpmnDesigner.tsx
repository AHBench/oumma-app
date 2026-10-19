/**
 * BpmnDesigner — the interactive process canvas (Diagram tab).
 *
 * The full "BPMN designer" experience in one view, every write going to
 * the process' SINGLE pending design version (the user deploys it from the
 * versions tab):
 *
 *  - click a step        → detail panel: rename, change role, description,
 *                          connect (optionally as a parallel FORK branch),
 *                          add a parallel JOIN (wait for branches), delete
 *  - click an edge       → detail panel: source/target, condition, delete
 *  - toolbar "Add step"  → HUMAN step (with its role) or SYSTEM step
 *  - pan (drag background) / zoom (wheel)
 *  - LR / TB layout, automatic from the topology (longest-path ranking)
 *
 * Gateway visuals: a node with ≥2 fork edges gets a ⊕ mark on those
 * edges; join edges (join_from) render dashed with a ⊥ mark at the target
 * — mirroring the read-only Vue viewer's semantics.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getDependencies } from '../../../../core/di';

type Json = Record<string, unknown>;

interface BpmnDesignerProps {
  processId: string;
  definition: Json | null;
  token: string | null;
  roles: string[];
  onSaved: () => void;
}

interface DNode {
  name: string;
  type: string; // START | END | HUMAN | SYSTEM
  group?: string;
  description?: string;
  tool?: string;
  url?: string;
  method?: string;
}

type LayoutDir = 'lr' | 'tb' | 'circular' | 'force';

interface DEdge {
  key: string;
  from?: string;
  to: string;
  condition?: string;
  fork?: boolean;
  joinFrom?: string[];
  join?: string;
}

const NODE_W = 172;
const NODE_H = 56;
// BPMN toolbox button style (+ -active variant for the selected tool).
const tb = 'flex h-7 w-7 items-center justify-center rounded border border-transparent text-foreground hover:bg-surface';
const tbActive = ' bg-(--accent) text-white';

/** Free-placement overrides remembered per process. */
function loadPosOvr(processId: string): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(`bpmn-pos-${processId}`);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v as Record<string, { x: number; y: number }> : {};
  } catch {
    return {};
  }
}
const GAP_X = 260;
const GAP_Y = 96;

function normTasks(def: Json | null): DNode[] {
  const rawIn = def?.tasks;
  const raw: Json[] = Array.isArray(rawIn)
    ? (rawIn as Json[])
    : rawIn && typeof rawIn === 'object'
      ? Object.entries(rawIn as Record<string, Json>).map(([name, cfg]) => ({ ...(cfg as Json), id: name }))
      : [];
  return raw
    .map((t) => {
      const name = String(t.task_id ?? t.id ?? t.task ?? '');
      return {
        name,
        type: String(t.type ?? (name.toLowerCase() === 'start' ? 'START' : name.toLowerCase() === 'end' ? 'END' : 'HUMAN')),
        group: t.group ? String(t.group) : undefined,
        description: t.description ? String(t.description) : undefined,
        tool: t.tool ? String(t.tool) : undefined,
        url: t.url ? String(t.url) : undefined,
        method: t.method ? String(t.method) : undefined,
      };
    })
    .filter((t) => t.name !== '');
}

function normEdges(def: Json | null): DEdge[] {
  const raw = (def?.topology ?? []) as Json[];
  return raw.map((e, i) => {
    const jf = Array.isArray(e.join_from) ? (e.join_from as Json[]).map(String) : undefined;
    return {
      key: `${e.from ? String(e.from) : 'join:' + (jf ?? []).join('+')}→${e.to ?? ''}:${i}`,
      from: e.from ? String(e.from) : undefined,
      to: e.to ? String(e.to) : '',
      condition: e.condition ? String(e.condition) : undefined,
      fork: e.fork === true,
      joinFrom: jf,
      join: e.join ? String(e.join) : undefined,
    };
  }).filter((e) => e.to !== '');
}

/** Longest-path ranking (topological layers) — deterministic LR/TB layout. */
function layout(nodes: DNode[], edges: DEdge[], dir: LayoutDir): Map<string, { x: number; y: number }> {
  if (dir === 'circular') return layoutCircular(nodes);
  if (dir === 'force') return layoutForce(nodes, edges);
  return layoutRanked(nodes, edges, dir);
}

/** Circular: nodes on a circle, in definition order. */
function layoutCircular(nodes: DNode[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const n = Math.max(nodes.length, 1);
  const R = Math.max(230, n * 34);
  const cx = 80 + R + 60;
  const cy = 80 + R + 60;
  nodes.forEach((nd, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pos.set(nd.name, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  });
  return pos;
}

/** Force-directed: springs on edges + pairwise repulsion, seeded with the
 *  ranked layout so the result is deterministic for a given graph. */
function layoutForce(nodes: DNode[], edges: DEdge[]): Map<string, { x: number; y: number }> {
  const seed = layoutRanked(nodes, edges, 'lr');
  const idx = new Map<string, number>();
  nodes.forEach((n, i) => idx.set(n.name, i));
  const x = nodes.map((n) => (seed.get(n.name) ?? { x: 80, y: 80 }).x);
  const y = nodes.map((n) => (seed.get(n.name) ?? { x: 80, y: 80 }).y);
  const spring = edges.flatMap((e) => (e.from ? [[e.from, e.to]] : (e.joinFrom ?? []).map((j) => [j, e.to] as [string, string])));
  const K = 210; // rest length
  for (let iter = 0; iter < 220; iter++) {
    const dx = new Array(nodes.length).fill(0);
    const dy = new Array(nodes.length).fill(0);
    // repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let ddx = x[i] - x[j];
        let ddy = y[i] - y[j];
        let d2 = ddx * ddx + ddy * ddy;
        if (d2 < 1) { ddx = (i - j) * 0.1; ddy = 0.05; d2 = 1; }
        const f = (K * K) / d2;
        const d = Math.sqrt(d2);
        dx[i] += (ddx / d) * f * 0.02; dy[i] += (ddy / d) * f * 0.02;
        dx[j] -= (ddx / d) * f * 0.02; dy[j] -= (ddy / d) * f * 0.02;
      }
    }
    // springs
    for (const [a, b] of spring) {
      const i = idx.get(a), j = idx.get(b);
      if (i == null || j == null) continue;
      const ddx = x[j] - x[i];
      const ddy = y[j] - y[i];
      const d = Math.max(1, Math.hypot(ddx, ddy));
      const f = (d - K) * 0.015;
      dx[i] += (ddx / d) * f; dy[i] += (ddy / d) * f;
      dx[j] -= (ddx / d) * f; dy[j] -= (ddy / d) * f;
    }
    for (let i = 0; i < nodes.length; i++) {
      x[i] += Math.max(-14, Math.min(14, dx[i]));
      y[i] += Math.max(-14, Math.min(14, dy[i]));
    }
  }
  // normalize into a positive quadrant
  const minX = Math.min(...x), minY = Math.min(...y);
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => pos.set(n.name, { x: 80 + x[i] - minX, y: 80 + y[i] - minY }));
  return pos;
}

function layoutRanked(nodes: DNode[], edges: DEdge[], dir: 'lr' | 'tb'): Map<string, { x: number; y: number }> {
  const names = nodes.map((n) => n.name);
  const preds = new Map<string, string[]>();
  for (const n of names) preds.set(n, []);
  for (const e of edges) {
    if (e.from && preds.has(e.from) && preds.has(e.to)) preds.get(e.to)!.push(e.from);
    if (e.joinFrom) for (const j of e.joinFrom) if (preds.has(j) && preds.has(e.to)) preds.get(e.to)!.push(j);
  }
  const rank = new Map<string, number>();
  const inStack = new Set<string>();
  const visit = (n: string): number => {
    if (rank.has(n)) return rank.get(n)!;
    if (inStack.has(n)) return 0; // cycle guard
    inStack.add(n);
    const ps = preds.get(n) ?? [];
    const r = ps.length === 0 ? 0 : 1 + Math.max(...ps.map(visit));
    rank.set(n, r);
    inStack.delete(n);
    return r;
  };
  for (const n of names) visit(n);

  // group by rank, keep definition order inside each rank
  const layers = new Map<number, string[]>();
  for (const n of names) {
    const r = rank.get(n) ?? 0;
    if (!layers.has(r)) layers.set(r, []);
    layers.get(r)!.push(n);
  }
  const pos = new Map<string, { x: number; y: number }>();
  const maxLen = Math.max(...[...layers.values()].map((l) => l.length));
  for (const [r, list] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
    list.forEach((n, i) => {
      const centered = i - Math.floor(list.length / 2) + (Math.floor(maxLen / 2) - Math.floor(list.length / 2));
      const primary = r * (dir === 'lr' ? GAP_X : GAP_Y) + 80;
      const secondary = centered * (dir === 'lr' ? GAP_Y : GAP_X) + 80;
      pos.set(n, dir === 'lr' ? { x: primary, y: secondary } : { x: secondary, y: primary });
    });
  }
  return pos;
}

export function BpmnDesigner({ processId, definition, token, roles, onSaved }: BpmnDesignerProps) {
  const { t } = useTranslation();
  const ds = getDependencies().designDataSource;
  const [dir, setDir] = useState<LayoutDir>(() => {
    try {
      const v = localStorage.getItem('bpmn-designer-layout');
      return v === 'tb' || v === 'circular' || v === 'force' ? v : 'lr';
    } catch { return 'lr'; }
  });
  const pickDir = (v: LayoutDir) => {
    setDir(v);
    clearPosOvr(); // a new layout invalidates manual placements
    try { localStorage.setItem('bpmn-designer-layout', v); } catch { /* ignore */ }
  };
  const [selected, setSelected] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectFork, setConnectFork] = useState(false);
  // BPMN toolbox: an active gateway tool changes what a node click means.
  const [tool, setTool] = useState<null | 'exclusive' | 'fork' | 'joinAnd' | 'joinOr'>(null);
  const [joinTarget, setJoinTarget] = useState<string | null>(null);
  const [joinPick, setJoinPick] = useState<string[]>([]);
  const [showJoin, setShowJoin] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const [groupVal, setGroupVal] = useState('');
  const [descVal, setDescVal] = useState('');
  const [showAdd, setShowAdd] = useState<null | 'human' | 'system' | 'end'>(null);
  const [addName, setAddName] = useState('');
  const [addGroup, setAddGroup] = useState('');
  // Edge configuration (exhaustive connection editor).
  const [edgeCond, setEdgeCond] = useState('');
  const [edgeFork, setEdgeFork] = useState(false);
  const [edgeJoin, setEdgeJoin] = useState<'and' | 'or'>('and');
  // SYSTEM task tool configuration.
  const [toolUrl, setToolUrl] = useState('');
  const [toolMethod, setToolMethod] = useState('POST');
  // AI design validation.
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [valOpen, setValOpen] = useState(false);
  const pendingSelEdge = useRef<{ to: string; from?: string; joinFrom?: string[] } | null>(null);
  const [view, setView] = useState({ x: 20, y: 20, k: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);

  // The canvas shows the PENDING design (the live editing target). When the
  // project has no pending version yet, fall back to the deployed engine
  // definition so the canvas is never empty.
  const { data: pendingDoc, refetch: refetchDoc } = useQuery({
    queryKey: ['bpmn-pending-doc', processId, token],
    queryFn: () => ds.getPendingDesign(processId, token ?? ''),
    enabled: processId != null && token != null,
    refetchInterval: 10_000,
  });
  const sourceDef =
    pendingDoc && (Array.isArray(pendingDoc.tasks) ? (pendingDoc.tasks as Json[]).length > 0 : Object.keys((pendingDoc.tasks ?? {}) as object).length > 0)
      ? pendingDoc
      : definition;

  const nodes = useMemo(() => normTasks(sourceDef), [sourceDef]);
  const edges = useMemo(() => normEdges(sourceDef), [sourceDef]);
  const pos = useMemo(() => layout(nodes, edges, dir), [nodes, edges, dir]);
  // An exclusive gateway shows up as a node with 2+ outgoing edges.
  const outCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of edges) if (e.from) m[e.from] = (m[e.from] ?? 0) + 1;
    return m;
  }, [edges]);
  const hasStart = useMemo(() => nodes.some((n) => n.type === 'START'), [nodes]);
  // Parallel forks (source) and joins (target) for the gateway diamonds.
  const forkOut = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const e of edges) if (e.from && e.fork) m[e.from] = true;
    return m;
  }, [edges]);
  const joinIn = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of edges) if (e.joinFrom) m[e.to] = e.join ?? 'and';
    return m;
  }, [edges]);
  // Resolve a just-created edge into a selection once the refetch lands.
  useEffect(() => {
    if (!pendingSelEdge.current) return;
    const p = pendingSelEdge.current;
    const e = edges.find((x) => x.to === p.to && (p.joinFrom
      ? (x.joinFrom ?? []).length > 0 && p.joinFrom!.every((f) => (x.joinFrom ?? []).includes(f))
      : x.from === p.from));
    if (e) { setSelected({ kind: 'edge', id: e.key }); pendingSelEdge.current = null; }
  }, [edges]);


  // Free placement: the user can drag any step anywhere to untangle a
  // complicated design. Overrides are layered on top of the computed
  // layout and remembered per process (localStorage).
  const [posOvr, setPosOvr] = useState<Record<string, { x: number; y: number }>>(() =>
    loadPosOvr(processId));
  const nodeDrag = useRef<{ name: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => { setPosOvr(loadPosOvr(processId)); }, [processId]);
  useEffect(() => {
    try { localStorage.setItem(`bpmn-pos-${processId}`, JSON.stringify(posOvr)); } catch { /* ignore */ }
  }, [posOvr, processId]);
  const clearPosOvr = useCallback(() => setPosOvr({}), []);

  // Sync the panel fields with the selected node — but ONLY when the
  // selected node changes. Re-syncing on every poll/refetch would clobber
  // whatever the user is typing (the "can't modify" bug).
  const lastSynced = useRef<string | null>(null);
  useEffect(() => {
    if (lastSynced.current === selected?.id) return;
    lastSynced.current = selected?.id ?? null;
    if (selected?.kind === 'node') {
      const n = nodes.find((x) => x.name === selected.id);
      if (!n) return;
      setRenameVal(n.name);
      setGroupVal(n.group ?? '');
      setDescVal(n.description ?? '');
      setToolUrl(n.url ?? '');
      setToolMethod(n.method ?? 'POST');
      setJoinPick([]);
      setShowJoin(false);
      return;
    }
    if (selected?.kind === 'edge') {
      const e = edges.find((x) => x.key === selected.id);
      if (!e) return;
      setEdgeCond(e.condition && e.condition !== 'always' ? e.condition : '');
      setEdgeFork(!!e.fork);
      setEdgeJoin((e.join as 'and' | 'or') ?? 'and');
    }
  }, [selected, nodes, edges]);

  const act = useCallback(async (fn: () => Promise<unknown>, err: (m: string) => void) => {
    try {
      await fn();
      void refetchDoc(); // refresh the pending doc immediately
      onSaved();
    } catch (e) {
      err(e instanceof Error ? e.message : String(e));
    }
  }, [onSaved, refetchDoc]);

  const alertErr = useCallback((m: string) => { alert(m); }, []);

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-(--app-fs-small) text-muted">
        {t('designDiagramEmpty')}
      </div>
    );
  }

  const selectedNode = selected?.kind === 'node' ? nodes.find((n) => n.name === selected.id) : undefined;
  const selectedEdge = selected?.kind === 'edge' ? edges.find((e) => e.key === selected.id) : undefined;

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    // Only the empty background starts a pan — a pointer-down on a node or
    // edge must NOT capture the pointer, or the browser retargets the
    // follow-up click to the SVG and the step's onClick never fires.
    if (e.target !== e.currentTarget) return;
    drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  };
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    // Dragging a step (free placement) takes priority over panning.
    const d = nodeDrag.current;
    if (d) {
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (d.moved || Math.abs(dx) + Math.abs(dy) > 3) {
        d.moved = true;
        setPosOvr((o) => ({ ...o, [d.name]: { x: d.ox + dx / view.k, y: d.oy + dy / view.k } }));
      }
      return;
    }
    if (!drag.current) return;
    setView((v) => ({ ...v, x: drag.current!.vx + (e.clientX - drag.current!.sx), y: drag.current!.vy + (e.clientY - drag.current!.sy) }));
  };
  const onCanvasPointerUp = () => {
    // A real drag ends in a "click" the browser would fire on the node —
    // suppress it so dragging doesn't also select/connect.
    if (nodeDrag.current?.moved) suppressClick.current = true;
    nodeDrag.current = null;
    drag.current = null;
  };
  const startNodeDrag = (n: DNode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const p = nodeAt(n.name);
    nodeDrag.current = { name: n.name, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const nodeClickGuard = () => {
    if (suppressClick.current) { suppressClick.current = false; return true; }
    return false;
  };
  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.3, v.k * factor)) }));
  };

  // Open the detail window on a click, anchored near the pointer.
  const selectAt = (sel: { kind: 'node' | 'edge'; id: string }) => {
    setSelected(sel); // opens the right-hand configuration panel
  };

  // Node click with toolbox modes: an active gateway tool (exclusive /
  // parallel fork / join) reinterprets clicks as connection steps instead
  // of opening the configuration panel.
  const onNodePick = (n: DNode) => (ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (nodeClickGuard()) return;
    if (tool === 'joinAnd' || tool === 'joinOr') {
      if (!joinTarget) { setJoinTarget(n.name); return; }
      if (n.name === joinTarget) return;
      setJoinPick((p) => (p.includes(n.name) ? p.filter((x) => x !== n.name) : [...p, n.name]));
      return;
    }
    if (tool === 'exclusive' || tool === 'fork') {
      if (!connectFrom) { setConnectFrom(n.name); return; }
      if (connectFrom === n.name) { setConnectFrom(null); setTool(null); return; }
      const src = connectFrom;
      const mode = tool;
      setConnectFrom(null);
      setTool(null);
      pendingSelEdge.current = { to: n.name, from: src }; // open the connection's config
      if (mode === 'fork') {
        void act(() => ds.addEdge(processId, { from: src, to: n.name, fork: true }, token ?? ''), alertErr);
      } else {
        const cond = window.prompt(t('bpmnConditionPrompt'), '') ?? '';
        void act(() => ds.addEdge(processId, { from: src, to: n.name, ...(cond.trim() ? { condition: cond.trim() } : {}) }, token ?? ''), alertErr);
      }
      return;
    }
    if (connectFrom && connectFrom !== n.name) {
      void act(() => ds.addEdge(processId, { from: connectFrom, to: n.name, ...(connectFork ? { fork: true } : {}) }, token ?? ''), alertErr);
      setConnectFrom(null);
      setConnectFork(false);
      return;
    }
    selectAt({ kind: 'node', id: n.name });
  };


  const nodeAt = (name: string) => posOvr[name] ?? pos.get(name) ?? { x: 0, y: 0 };

  const edgePath = (e: DEdge, fromName: string): string => {
    const a = nodeAt(fromName);
    const b = nodeAt(e.to);
    if (dir === 'lr') {
      const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2;
      const dx = Math.max(40, (x2 - x1) / 2);
      return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    }
    const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H, x2 = b.x + NODE_W / 2, y2 = b.y;
    const dy = Math.max(30, (y2 - y1) / 2);
    return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
  };

  const nodeFill = (n: DNode): string => {
    if (n.type === 'START') return 'var(--success, #16a34a)';
    if (n.type === 'END') return 'var(--danger, #dc2626)';
    if (n.type === 'SYSTEM') return 'var(--surface, #1e293b)';
    return 'var(--surface, #1e293b)';
  };

  const winTitle = selectedNode?.name ?? (selectedEdge
    ? (selectedEdge.from ? `${selectedEdge.from} → ${selectedEdge.to}` : `${(selectedEdge.joinFrom ?? []).join(', ')} ⊥ ${selectedEdge.to}`)
    : '');
  const panelInner = selectedNode ? (
          <>
            <div className="text-(--app-fs-small) font-semibold">{selectedNode.name}</div>
            <div className="text-(--app-fs-tiny, 0.7rem) text-muted">
              {selectedNode.type}{selectedNode.tool ? ` · ${selectedNode.tool}` : ''}
            </div>
            {/* rename */}
            <div className="flex gap-1">
              <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                className="min-w-0 flex-1 rounded border border-separator bg-surface px-2 py-1 text-(--app-fs-small)" />
              <button type="button" disabled={renameVal.trim() === selectedNode.name || !renameVal.trim()}
                onClick={() => {
                  const newName = renameVal.trim();
                  void act(async () => {
                    await ds.renameTask(processId, selectedNode.name, newName, token ?? '');
                    setSelected({ kind: 'node', id: newName }); // follow the rename
                  }, alertErr);
                }}
                className="rounded-(--app-radius) border border-separator px-2 py-1 text-(--app-fs-small) hover:bg-surface disabled:opacity-40">
                {t('bpmnRename')}
              </button>
            </div>
            {selectedNode.type === 'HUMAN' ? (
              <>
                <label className="text-(--app-fs-tiny, 0.7rem) text-muted">{t('bpmnRole')}</label>
                <div className="flex gap-1">
                  <select value={groupVal} onChange={(e) => setGroupVal(e.target.value)}
                    className="min-w-0 flex-1 rounded border border-separator bg-surface px-2 py-1 text-(--app-fs-small)">
                    {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button type="button" disabled={groupVal === (selectedNode.group ?? '')}
                    onClick={() => void act(() => ds.updateTask(processId, selectedNode.name, { group: groupVal }, token ?? ''), alertErr)}
                    className="rounded-(--app-radius) border border-separator px-2 py-1 text-(--app-fs-small) hover:bg-surface disabled:opacity-40">
                    {t('bpmnSave')}
                  </button>
                </div>
                <label className="text-(--app-fs-tiny, 0.7rem) text-muted">{t('bpmnDescription')}</label>
                <div className="flex gap-1">
                  <input value={descVal} onChange={(e) => setDescVal(e.target.value)}
                    className="min-w-0 flex-1 rounded border border-separator bg-surface px-2 py-1 text-(--app-fs-small)" />
                  <button type="button" disabled={descVal === (selectedNode.description ?? '')}
                    onClick={() => void act(() => ds.updateTask(processId, selectedNode.name, { description: descVal }, token ?? ''), alertErr)}
                    className="rounded-(--app-radius) border border-separator px-2 py-1 text-(--app-fs-small) hover:bg-surface disabled:opacity-40">
                    {t('bpmnSave')}
                  </button>
                </div>
              </>
            ) : null}
            {/* tool (system) task: HTTP/tool endpoint configuration */}
            {selectedNode.type === 'SYSTEM' ? (
              <>
                <label className="text-(--app-fs-tiny, 0.7rem) text-muted">{t('bpmnToolUrl')}</label>
                <input value={toolUrl} onChange={(e) => setToolUrl(e.target.value)} placeholder="https://…"
                  className="min-w-0 flex-1 rounded border border-separator bg-surface px-2 py-1 text-(--app-fs-small)" />
                <div className="flex gap-1">
                  <select value={toolMethod} onChange={(e) => setToolMethod(e.target.value)}
                    className="rounded border border-separator bg-surface px-2 py-1 text-(--app-fs-small)">
                    {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button type="button"
                    disabled={toolUrl.trim() === (selectedNode.url ?? '') && toolMethod === (selectedNode.method ?? 'POST')}
                    onClick={() => void act(() => ds.setTaskConfig(processId, selectedNode.name, { url: toolUrl.trim(), method: toolMethod }, token ?? ''), alertErr)}
                    className="rounded-(--app-radius) border border-separator px-2 py-1 text-(--app-fs-small) hover:bg-surface disabled:opacity-40">
                    {t('bpmnSave')}
                  </button>
                </div>
              </>
            ) : null}
            <div className="border-t border-separator pt-2">
              {connectFrom === selectedNode.name ? (
                <span className="text-(--app-fs-small) text-(--accent)">{t('bpmnConnectActive')}
                  <button type="button" onClick={() => { setConnectFrom(null); setConnectFork(false); }} className="ml-2 underline">{t('bpmnCancel')}</button>
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { setConnectFrom(selectedNode.name); setConnectFork(false); }}
                    className="rounded-(--app-radius) border border-separator px-2 py-1 text-(--app-fs-small) hover:bg-surface">
                    {t('bpmnConnect')}
                  </button>
                  <label className="flex items-center gap-1 text-(--app-fs-tiny, 0.7rem) text-muted">
                    <input type="checkbox" checked={connectFork} onChange={(e) => setConnectFork(e.target.checked)} />
                    {t('bpmnFork')}
                  </label>
                </div>
              )}
            </div>
            {/* join */}
            <div className="border-t border-separator pt-2">
              <button type="button" onClick={() => setShowJoin(!showJoin)}
                className="rounded-(--app-radius) border border-separator px-2 py-1 text-(--app-fs-small) hover:bg-surface">
                {t('bpmnJoin')}
              </button>
              {showJoin ? (
                <div className="mt-2 space-y-1">
                  {nodes.filter((n) => n.name !== selectedNode.name && n.type !== 'START' && n.type !== 'END').map((n) => (
                    <label key={n.name} className="flex items-center gap-1 text-(--app-fs-small)">
                      <input type="checkbox" checked={joinPick.includes(n.name)}
                        onChange={(e) => setJoinPick(e.target.checked ? [...joinPick, n.name] : joinPick.filter((x) => x !== n.name))} />
                      {n.name}
                    </label>
                  ))}
                  <button type="button" disabled={joinPick.length === 0}
                    onClick={() => void act(() => ds.addEdge(processId, { join_from: joinPick, to: selectedNode.name, join: 'and' }, token ?? ''), alertErr)}
                    className="w-full rounded-(--app-radius) border border-separator px-2 py-1 text-(--app-fs-small) hover:bg-surface disabled:opacity-40">
                    {t('bpmnJoinWait')}
                  </button>
                </div>
              ) : null}
            </div>
            {/* delete */}
            {selectedNode.type !== 'START' && selectedNode.type !== 'END' ? (
              <div className="mt-auto border-t border-separator pt-2">
                <button type="button" onClick={() => {
                  if (!confirm(t('bpmnDeleteConfirm'))) return;
                  void act(() => ds.deleteTask(processId, selectedNode.name, token ?? ''), alertErr);
                  setSelected(null);
                }} className="w-full rounded-(--app-radius) border border-red-400 px-2 py-1 text-(--app-fs-small) text-red-500 hover:bg-red-50">
                  {t('bpmnDelete')}
                </button>
              </div>
            ) : null}
          </>
        ) : selectedEdge ? (
          <>
            <div className="text-(--app-fs-small) font-semibold">
              {selectedEdge.from ? `${selectedEdge.from} → ${selectedEdge.to}` : `${(selectedEdge.joinFrom ?? []).join(', ')} ⊥ ${selectedEdge.to}`}
            </div>
            <div className="text-(--app-fs-tiny, 0.7rem) text-muted">
              {selectedEdge.fork ? t('bpmnFork') : selectedEdge.joinFrom ? `${t('bpmnJoin')} (${selectedEdge.join ?? 'and'})` : t('bpmnConnection')}
            </div>
            {/* branch condition (editable) */}
            <label className="text-(--app-fs-tiny, 0.7rem) text-muted">{t('bpmnCondition')}</label>
            <div className="flex gap-1">
              <input value={edgeCond} onChange={(e) => setEdgeCond(e.target.value)} placeholder="always"
                className="min-w-0 flex-1 rounded border border-separator bg-surface px-2 py-1 text-(--app-fs-small)" />
              <button type="button" disabled={edgeCond.trim() === ((selectedEdge.condition && selectedEdge.condition !== 'always' ? selectedEdge.condition : ''))}
                onClick={() => void act(() => ds.updateEdge(processId, { from: selectedEdge.from, to: selectedEdge.to, condition: edgeCond.trim() }, token ?? ''), alertErr)}
                className="rounded-(--app-radius) border border-separator px-2 py-1 text-(--app-fs-small) hover:bg-surface disabled:opacity-40">
                {t('bpmnSave')}
              </button>
            </div>
            {/* parallel fork toggle (plain edges only) */}
            {!selectedEdge.joinFrom ? (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-(--app-fs-tiny, 0.7rem) text-muted">
                  <input type="checkbox" checked={edgeFork} onChange={(e) => setEdgeFork(e.target.checked)} />
                  {t('bpmnFork')}
                </label>
                <button type="button" disabled={edgeFork === selectedEdge.fork}
                  onClick={() => void act(() => ds.updateEdge(processId, { from: selectedEdge.from, to: selectedEdge.to, fork: edgeFork }, token ?? ''), alertErr)}
                  className="rounded-(--app-radius) border border-separator px-2 py-1 text-(--app-fs-small) hover:bg-surface disabled:opacity-40">
                  {t('bpmnSave')}
                </button>
              </div>
            ) : null}
            {/* join kind (join edges only) */}
            {selectedEdge.joinFrom ? (
              <div className="flex items-center gap-2">
                <select value={edgeJoin} onChange={(e) => setEdgeJoin(e.target.value as 'and' | 'or')}
                  className="min-w-0 flex-1 rounded border border-separator bg-surface px-2 py-1 text-(--app-fs-small)">
                  <option value="and">AND (parallel)</option>
                  <option value="or">OR (inclusive)</option>
                </select>
                <button type="button" disabled={edgeJoin === (selectedEdge.join ?? 'and')}
                  onClick={() => void act(() => ds.updateEdge(processId, { to: selectedEdge.to, join: edgeJoin }, token ?? ''), alertErr)}
                  className="rounded-(--app-radius) border border-separator px-2 py-1 text-(--app-fs-small) hover:bg-surface disabled:opacity-40">
                  {t('bpmnSave')}
                </button>
              </div>
            ) : null}
            <button type="button" onClick={() => {
              if (!confirm(t('bpmnDeleteEdgeConfirm'))) return;
              void act(() => ds.deleteEdge(processId, selectedEdge.from, selectedEdge.to, token ?? ''), alertErr);
              setSelected(null);
            }} className="mt-auto w-full rounded-(--app-radius) border border-red-400 px-2 py-1 text-(--app-fs-small) text-red-500 hover:bg-red-50">
              {t('bpmnDelete')}
            </button>
          </>
        ) : null;

  // AI design validation: asks the designer LLM to review the current design.
  const runValidation = async () => {
    if (!processId || !token) return;
    setValidating(true);
    setValOpen(true);
    setValidation(null);
    try {
      const answer = await ds.designAsk({
        processId,
        prompt: 'Act as a strict BPMN 2.0 reviewer. Review this process design (tasks + topology) and report, as concise bullet points: (1) anomalies — unreachable tasks, tasks with no outgoing edge that are not END, END nodes with no incoming edge, joins with fewer than two branches, ambiguous or contradictory branch conditions, tasks missing a responsible role, roles declared but unused, naming inconsistencies; (2) improvement suggestions (max 5). If the design is healthy, say so in one line. Do NOT call any tools. Respond in plain text only, no markdown code blocks.',
      }, token);
      setValidation(answer.trim() || '—');
    } catch (e) {
      setValidation(e instanceof Error ? e.message : String(e));
    } finally {
      setValidating(false);
    }
  };

  // BPMN toolbox buttons — rendered in the right-hand vertical strip.
  const toolBtn = (title: string, active: boolean, onClick: () => void, icon: React.ReactNode, disabled = false) => (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className={tb + (active ? tbActive : '') + (disabled ? ' cursor-not-allowed opacity-40' : '')}>{icon}</button>
  );
  const toolboxButtons = (
    <>
      {toolBtn(t('bpmnStart'), false, () => { void act(() => ds.addTask(processId, { name: 'start', type: 'START' }, token ?? ''), alertErr); },
        <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="var(--success, #16a34a)" strokeWidth="2" /></svg>, hasStart)}
      {toolBtn(t('bpmnEnd'), showAdd === 'end', () => { setShowAdd(showAdd === 'end' ? null : 'end'); setAddName(t('bpmnEndName')); },
        <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="5.5" fill="none" stroke="var(--danger, #dc2626)" strokeWidth="3.5" /></svg>)}
      {toolBtn(t('bpmnHuman'), showAdd === 'human', () => { setShowAdd(showAdd === 'human' ? null : 'human'); setAddName(''); setAddGroup(roles[0] ?? ''); },
        <svg width="20" height="20" viewBox="0 0 20 20"><rect x="2" y="4.5" width="16" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="10" cy="9" r="1.9" fill="currentColor" /><path d="M6.6 13.6c.3-1.9 1.7-2.8 3.4-2.8s3.1.9 3.4 2.8" fill="currentColor" /></svg>)}
      {toolBtn(t('bpmnToolTask'), showAdd === 'system', () => { setShowAdd(showAdd === 'system' ? null : 'system'); setAddName(''); },
        <svg width="20" height="20" viewBox="0 0 20 20"><rect x="2" y="4.5" width="16" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="10" cy="10" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M10 6.2v1.6M10 12.2v1.6M6.2 10h1.6M12.2 10h1.6" stroke="currentColor" strokeWidth="1.4" /></svg>)}
      <span className="my-0.5 w-6 shrink-0 border-t border-separator" />
      {toolBtn(t('bpmnExclusive'), tool === 'exclusive', () => { const next = tool === 'exclusive' ? null : 'exclusive'; setTool(next); setConnectFrom(null); setJoinTarget(null); setJoinPick([]); },
        <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 2 18 10 10 18 2 10Z" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M7.6 7.6 12.4 12.4M12.4 7.6 7.6 12.4" stroke="currentColor" strokeWidth="1.4" /></svg>)}
      {toolBtn(t('bpmnForkTool'), tool === 'fork', () => { const next = tool === 'fork' ? null : 'fork'; setTool(next); setConnectFrom(null); setJoinTarget(null); setJoinPick([]); },
        <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 2 18 10 10 18 2 10Z" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M10 6.5v7M6.5 10h7" stroke="currentColor" strokeWidth="1.4" /></svg>)}
      {toolBtn(t('bpmnJoinAnd'), tool === 'joinAnd', () => { const next = tool === 'joinAnd' ? null : 'joinAnd'; setTool(next); setConnectFrom(null); setJoinTarget(null); setJoinPick([]); },
        <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 2 18 10 10 18 2 10Z" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M7 8.4h6M7 11.6h6" stroke="currentColor" strokeWidth="1.4" /></svg>)}
      {toolBtn(t('bpmnJoinOr'), tool === 'joinOr', () => { const next = tool === 'joinOr' ? null : 'joinOr'; setTool(next); setConnectFrom(null); setJoinTarget(null); setJoinPick([]); },
        <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 2 18 10 10 18 2 10Z" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="10" cy="10" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>)}
    </>
  );

  // Gateway diamonds, drawn at a node's output/input anchor.
  const Gateway = ({ x, y, symbol }: { x: number; y: number; symbol: string }) => (
    <g>
      <rect x={x - 13} y={y - 13} width={26} height={26} transform={`rotate(45 ${x} ${y})`}
        fill="var(--app-bg, #0b1220)" stroke="var(--accent, #6366f1)" strokeWidth={1.8} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--accent, #6366f1)">{symbol}</text>
    </g>
  );
  const outAnchor = (name: string) => {
    const p = nodeAt(name);
    return dir === 'tb' ? { x: p.x + NODE_W / 2, y: p.y + NODE_H } : { x: p.x + NODE_W, y: p.y + NODE_H / 2 };
  };
  const inAnchor = (name: string) => {
    const p = nodeAt(name);
    return dir === 'tb' ? { x: p.x + NODE_W / 2, y: p.y } : { x: p.x, y: p.y + NODE_H / 2 };
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" dir="ltr">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-separator pb-2">
        <span className="text-(--app-fs-base, 0.95rem) font-semibold">{t('bpmnDiagramTitle')}</span>
        <button type="button" onClick={() => void runValidation()} disabled={validating}
          className="rounded-(--app-radius) border border-separator px-3 py-1 text-(--app-fs-small) hover:bg-surface disabled:opacity-50">
          {validating ? t('bpmnValidating') : `✦ ${t('bpmnValidate')}`}
        </button>
        <select value={dir} onChange={(e) => pickDir(e.target.value as LayoutDir)}
          className="rounded border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground">
          <option value="lr">{t('layoutLR')}</option>
          <option value="tb">{t('layoutTB')}</option>
          <option value="circular">{t('layoutCircular')}</option>
          <option value="force">{t('layoutForce')}</option>
        </select>
        {Object.keys(posOvr).length > 0 ? (
          <button type="button" onClick={clearPosOvr}
            className="rounded-(--app-radius) border border-separator px-3 py-1 text-(--app-fs-small) hover:bg-surface">
            {t('bpmnResetLayout')}
          </button>
        ) : null}
        {showAdd ? (
          <span className="flex items-center gap-1 text-(--app-fs-small)">
            <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder={t('bpmnStepName')}
              className="rounded border border-separator bg-surface px-2 py-1 text-(--app-fs-small)" />
            {showAdd === 'human' ? (
              <select value={addGroup} onChange={(e) => setAddGroup(e.target.value)}
                className="rounded border border-separator bg-surface px-2 py-1 text-(--app-fs-small)">
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            ) : null}
            <button type="button" onClick={() => {
              if (!addName.trim()) return;
              const name = addName.trim();
              const addKind = showAdd;
              void act(() => (addKind === 'human'
                ? ds.addTask(processId, { name, group: addGroup }, token ?? '')
                : addKind === 'end'
                  ? ds.addTask(processId, { name, type: 'END' }, token ?? '')
                  : ds.addSystemTask(processId, { name }, token ?? '')), alertErr)
                .then(() => setSelected({ kind: 'node', id: name })); // open its config panel
              setShowAdd(null);
            }} className="rounded-(--app-radius) bg-(--accent) px-2 py-1 text-(--app-fs-small) font-medium text-white">
              {t('bpmnAdd')}
            </button>
          </span>
        ) : null}
        {tool || connectFrom || joinTarget ? (
          <span className="flex items-center gap-2 text-(--app-fs-small) text-(--accent)">
            {tool === 'exclusive' && !connectFrom ? t('bpmnExclusiveHint')
              : tool === 'exclusive' ? t('bpmnExclusiveHint2', { from: connectFrom })
              : tool === 'fork' && !connectFrom ? t('bpmnForkToolHint')
              : tool === 'fork' ? t('bpmnForkToolHint2', { from: connectFrom })
              : tool === 'joinAnd' || tool === 'joinOr' ? (!joinTarget
                ? t('bpmnJoinTargetHint')
                : t('bpmnJoinSourcesHint', { to: joinTarget, n: joinPick.length }))
              : t('bpmnConnectHint', { from: connectFrom })}
            {(tool === 'joinAnd' || tool === 'joinOr') && joinTarget ? (
              <button type="button" disabled={joinPick.length < 2}
                onClick={() => {
                  const to = joinTarget;
                  const srcs = joinPick;
                  const or = tool === 'joinOr';
                  setJoinTarget(null); setJoinPick([]); setTool(null);
                  pendingSelEdge.current = { to, joinFrom: srcs };
                  void act(() => ds.addEdge(processId, { join_from: srcs, to, join: or ? 'or' : 'and' }, token ?? ''), alertErr);
                }}
                className="rounded-(--app-radius) bg-(--accent) px-2 py-1 font-medium text-white disabled:opacity-40">
                {t('bpmnFinishJoin')}
              </button>
            ) : null}
            <button type="button" onClick={() => { setTool(null); setConnectFrom(null); setConnectFork(false); setJoinTarget(null); setJoinPick([]); }}
              className="underline">{t('bpmnCancel')}</button>
          </span>
        ) : null}
      </div>

      {/* AI design-review result */}
      {valOpen ? (
        <div className="max-h-52 shrink-0 overflow-y-auto rounded-(--app-radius) border border-separator bg-surface p-2 text-(--app-fs-small)">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold">✦ {t('bpmnValidationTitle')}</span>
            <button type="button" onClick={() => setValOpen(false)} className="rounded px-1.5 py-0.5 hover:bg-surface">✕</button>
          </div>
          <div className="whitespace-pre-wrap">{validating ? t('bpmnValidating') : validation}</div>
        </div>
      ) : null}

      {/* Canvas + right-hand configuration panel + vertical BPMN toolbox */}
      <div className="flex min-h-0 min-w-0 flex-1 gap-2">
      <svg
        ref={svgRef}
        className="min-h-0 min-w-0 flex-1 cursor-grab rounded-(--app-radius) border border-separator bg-(--app-bg, #0b1220)"
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onWheel={onWheel}
      >
        <defs>
          <marker id="bpmn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #94a3b8)" />
          </marker>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {/* edges */}
          {edges.map((e) => {
            const sources = e.from ? [e.from] : (e.joinFrom ?? []);
            return sources.map((s) => {
              const path = edgePath(e, s);
              const isSel = selected?.kind === 'edge' && selected.id === e.key;
              const mx = (parseFloat(path.slice(2).split(' ')[0]) + parseFloat(path.match(/C [\d.]+ [\d.]+, [\d.]+ [\d.]+, ([\d.]+) ([\d.]+)/)?.[1] ?? path.slice(2).split(' ')[0])) / 2;
              const my = (parseFloat(path.slice(2).split(' ')[1]) + parseFloat(path.match(/C [\d.]+ [\d.]+, [\d.]+ [\d.]+, ([\d.]+) ([\d.]+)/)?.[2] ?? path.slice(2).split(' ')[1])) / 2;
              return (
                <g key={`${e.key}:${s}`} className="cursor-pointer" onClick={(ev) => { ev.stopPropagation(); selectAt({ kind: 'edge', id: e.key }); }}>
                  <path d={path} fill="none" stroke="transparent" strokeWidth={14} />
                  <path d={path} fill="none"
                    stroke={isSel ? 'var(--accent, #6366f1)' : 'var(--text-muted, #94a3b8)'}
                    strokeWidth={isSel ? 2.5 : 1.5}
                    strokeDasharray={e.fork || e.joinFrom ? '7 5' : undefined}
                    markerEnd="url(#bpmn-arrow)" />
                  {e.condition && e.condition !== 'always' ? (
                    <text x={mx} y={my - 8} textAnchor="middle" fontSize={10} fill="var(--text-muted, #94a3b8)">
                      {e.condition.length > 28 ? `${e.condition.slice(0, 27)}…` : e.condition}
                    </text>
                  ) : null}
                </g>
              );
            });
          })}
          {/* nodes */}
          {nodes.map((n) => {
            const p = nodeAt(n.name);
            const isSel = selected?.kind === 'node' && selected.id === n.name;
            const isTarget = connectFrom === n.name;
            const isLifecycle = n.type === 'START' || n.type === 'END';
            if (isLifecycle) {
              return (
                <g key={n.name} className="cursor-move" onClick={onNodePick(n)} onPointerDown={startNodeDrag(n)}>
                  <circle cx={p.x + 28} cy={p.y + NODE_H / 2} r={26}
                    fill={nodeFill(n)} opacity={0.9}
                    stroke={isSel ? 'var(--accent, #6366f1)' : 'transparent'} strokeWidth={3} />
                  <text x={p.x + 28} y={p.y + NODE_H / 2 + 4} textAnchor="middle" fontSize={11} fill="#fff" fontWeight={600}>
                    {n.name}
                  </text>
                  {isTarget ? <circle cx={p.x + 28} cy={p.y + NODE_H / 2} r={32} fill="none" stroke="var(--accent, #6366f1)" strokeWidth={2} strokeDasharray="5 4" /> : null}
                </g>
              );
            }
            return (
              <g key={n.name} className="cursor-move" onClick={onNodePick(n)} onPointerDown={startNodeDrag(n)}>
                <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={10}
                  fill={nodeFill(n)}
                  stroke={isSel ? 'var(--accent, #6366f1)' : 'var(--border, #334155)'}
                  strokeWidth={isSel ? 2.5 : 1.2}
                  strokeDasharray={n.type === 'SYSTEM' && !n.tool && !n.url ? '6 4' : undefined} />
                {isTarget ? <rect x={p.x - 4} y={p.y - 4} width={NODE_W + 8} height={NODE_H + 8} rx={13} fill="none" stroke="var(--accent, #6366f1)" strokeWidth={2} strokeDasharray="5 4" /> : null}
                {/* BPMN gateway diamonds: exclusive (X) / parallel fork (+) at the
                    output anchor; parallel (‖) / inclusive (O) joins at the input. */}
                {forkOut[n.name] ? (() => { const a = outAnchor(n.name); return <Gateway x={a.x + 16} y={a.y} symbol="+" />; })() : null}
                {!forkOut[n.name] && (outCount[n.name] ?? 0) >= 2 ? (() => { const a = outAnchor(n.name); return <Gateway x={a.x + 16} y={a.y} symbol="X" />; })() : null}
                {joinIn[n.name] ? (() => { const a = inAnchor(n.name); return <Gateway x={a.x - 16} y={a.y} symbol={joinIn[n.name] === 'or' ? 'O' : '‖'} />; })() : null}
                <text x={p.x + 10} y={p.y + 22} fontSize={12.5} fontWeight={600} fill="var(--foreground, #e2e8f0)">
                  {(n.type === 'SYSTEM' ? '⚙ ' : '👤 ') + n.name}
                </text>
                <text x={p.x + 10} y={p.y + 41} fontSize={10.5} fill="var(--text-muted, #94a3b8)">
                  {n.type === 'SYSTEM' ? (n.tool ?? (n.url ? 'HTTP' : t('sysUnconfigured'))) : (n.group ?? '—')}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Right-hand configuration panel (split view) — appears when a step
          or connection is clicked. */}
      {selected && panelInner ? (
        <aside className="flex w-72 shrink-0 flex-col rounded-(--app-radius) border border-separator bg-(--app-surface, #111a2c) p-3">
          <div className="mb-1 flex shrink-0 items-center gap-1 border-b border-separator pb-1">
            <span className="min-w-0 flex-1 truncate text-(--app-fs-small) font-semibold">{winTitle}</span>
            <button type="button" title={t('bpmnClose')} onClick={() => setSelected(null)}
              className="rounded px-1.5 py-0.5 text-(--app-fs-small) hover:bg-surface">✕</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-2">{panelInner}</div>
          </div>
        </aside>
      ) : null}
      {/* Vertical BPMN toolbox (right side of the design window) */}
      <div className="flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto rounded-(--app-radius) border border-separator p-1" title={t('bpmnToolbox')}>
        {toolboxButtons}
      </div>
      </div>
    </div>
  );
}
