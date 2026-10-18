type Json = Record<string, unknown>;

export interface ProcessNode {
  id: string;
  name?: string;
  nodeType?: string;
  isDisplayable: boolean;
  raw: Json;
}

export interface ProcessEdge {
  id: string;
  name?: string;
  sourceId: string;
  targetId: string;
}

export interface ProcessGraph {
  processId: string;
  nodes: ProcessNode[];
  edges: ProcessEdge[];
}

const DISPLAYABLE_TYPES = ['Start', 'End', 'HumanTask'];

function nodeFromJson(json: Json): ProcessNode {
  const nodeType =
    typeof json.nodeType === 'string'
      ? (json.nodeType as string)
      : typeof json.type === 'string'
        ? (json.type as string)
        : '';
  return {
    id: json.id != null ? String(json.id) : '',
    name: typeof json.name === 'string' ? (json.name as string) : undefined,
    nodeType,
    isDisplayable: DISPLAYABLE_TYPES.some(
      (t) => nodeType.toLowerCase() === t.toLowerCase(),
    ),
    raw: json,
  };
}

export function processGraphFromJson(json: Json): ProcessGraph {
  const rawNodes = Array.isArray(json.nodes) ? (json.nodes as Json[]) : [];
  const rawEdges = Array.isArray(json.edges) ? (json.edges as Json[]) : [];
  const nodes = rawNodes.map(nodeFromJson);
  const edges: ProcessEdge[] = rawEdges.map((e) => ({
    id: e.id != null ? String(e.id) : '',
    name: typeof e.name === 'string' ? (e.name as string) : undefined,
    sourceId: e.sourceId != null ? String(e.sourceId) : '',
    targetId: e.targetId != null ? String(e.targetId) : '',
  }));
  return {
    processId: json.processId != null ? String(json.processId) : '',
    nodes: nodes.filter((n) => n.isDisplayable),
    edges,
  };
}
