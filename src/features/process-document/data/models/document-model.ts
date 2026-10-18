type Json = Record<string, unknown>;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value != null ? String(value) : fallback;
}

/** Tag — mirrors lib/features/process_document/data/model/tag_model.dart */
export interface Tag {
  id: number;
  name: string;
  color: string;
}

export function tagFromJson(raw: Json | string): Tag {
  if (typeof raw === 'string') {
    return { id: 0, name: raw, color: '#808080' };
  }
  return {
    id: typeof raw.id === 'number' ? (raw.id as number) : Number.parseInt(str(raw.id), 10) || 0,
    name: str(raw.name),
    color: str(raw.color, '#808080'),
  };
}

/**
 * Document — mirrors lib/features/process_document/data/model/document_model.dart
 * (web variant: bytes instead of a local file path).
 */
export interface Document {
  id: number;
  name: string;
  description: string;
  type: string;
  size: number;
  userId: string;
  filePath?: string;
  bytes?: number[] | null;
  file?: File | null; // selected on the client for upload
  organizationId?: string | null;
  status?: string | null;
  tags?: Tag[] | null;
  groups?: string[] | null;
  processId?: string | null;
  processInstanceId?: string | null;
  permissions: string[];
  uploadDate?: string | null;
  version?: number | null;
}

export function documentFromJson(json: Json): Document {
  let tags: Tag[] | null = null;
  if (json.tags != null) {
    tags = Array.isArray(json.tags)
      ? (json.tags as Json[]).map(tagFromJson)
      : [tagFromJson(json.tags as Json)];
  }
  return {
    id: typeof json.id === 'number' ? (json.id as number) : Number.parseInt(str(json.id), 10) || 0,
    name: str(json.name),
    description: str(json.description),
    type: str(json.type),
    size: typeof json.size === 'number' ? (json.size as number) : Number.parseInt(str(json.size), 10) || 0,
    userId: str(json.userId),
    filePath: json.file != null ? str(json.file) : undefined,
    bytes: Array.isArray(json.bytes) ? (json.bytes as number[]) : null,
    organizationId: json.organization_id != null ? str(json.organization_id) : null,
    status: json.status != null ? str(json.status) : null,
    processInstanceId: json.processInstanceId != null ? str(json.processInstanceId) : null,
    processId: json.processId != null ? str(json.processId) : null,
    tags,
    groups: Array.isArray(json.groups) ? (json.groups as unknown[]).map(String) : null,
    permissions: Array.isArray(json.permissions)
      ? (json.permissions as unknown[]).map(String)
      : [],
    uploadDate: json.uploadDate != null ? new Date(str(json.uploadDate)).toISOString() : null,
    version: typeof json.version === 'number' ? (json.version as number) : null,
  };
}
