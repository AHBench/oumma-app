import { apiClient } from '../../../../core/http/client';
import { appLogger } from '../../../../core/logging/app-logger';
import { throwIfLicenseInvalid } from '../../../../core/errors';
import type { DocRole } from '../../../process-apps/domain/entities/process-app';
import type { Document, Tag } from '../models/document-model';
import { documentFromJson, tagFromJson } from '../models/document-model';

type Json = Record<string, unknown>;

const defaultHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

function axiosErrorStatus(error: unknown): number | undefined {
  const e = error as { response?: { status?: number; data?: unknown } };
  return e?.response?.status;
}

function checkLicense(error: unknown): void {
  if (axiosErrorStatus(error) === 403) {
    const e = error as { response?: { status?: number; data?: unknown } };
    throwIfLicenseInvalid(403, e.response?.data);
  }
}

/**
 * Document management service (DMS) — mirrors
 * lib/features/process_document/data/datasource/document_service.dart
 */
export class DocumentService {
  constructor(private readonly baseUrl: string) {}

  /** GET {dms}/documents/{id}/download/ → binary */
  async downloadDocument(document: Document, accessToken: string): Promise<Blob> {
    const response = await apiClient.get(`${this.baseUrl}/documents/${document.id}/download/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: 'blob',
    });
    if (response.status !== 200) {
      throw new Error(`Failed to download document: ${response.status}`);
    }
    return response.data as Blob;
  }

  /** GET {dms}/tags/all?processId= */
  async getDocumentTags(processId: string, token: string): Promise<Tag[]> {
    const response = await apiClient.get(`${this.baseUrl}/tags/all?processId=${processId}`, {
      headers: { ...defaultHeaders, Authorization: `Bearer ${token}` },
    });
    if (response.status !== 200) {
      throw new Error(`Failed to fetch tags: ${response.status}`);
    }
    const jsonResponse = (response.data ?? []) as Json[];
    if (jsonResponse.length === 0) return [];
    return jsonResponse.map(tagFromJson);
  }

  /** GET {dms}/tags/ → { results: [...] } */
  async getAllTags(): Promise<Json[]> {
    const response = await apiClient.get(`${this.baseUrl}/tags/`, {
      headers: defaultHeaders,
    });
    if (response.status !== 200) {
      throw new Error(`Failed to fetch tags: ${response.status}`);
    }
    const data = response.data as { results: Json[] };
    return data.results;
  }

  /** POST {dms}/tags/ */
  async createTag(name: string, color?: string): Promise<void> {
    const response = await apiClient.post(
      `${this.baseUrl}/tags/`,
      { name, ...(color != null ? { color } : {}) },
      { headers: defaultHeaders },
    );
    if (response.status !== 201) {
      throw new Error(`Failed to create tag: ${JSON.stringify(response.data)}`);
    }
  }

  /** PATCH {dms}/tags/{id}/ */
  async updateTag(tagId: number, name?: string, color?: string): Promise<void> {
    const body: Json = {};
    if (name != null) body.name = name;
    if (color != null) body.color = color;
    const response = await apiClient.patch(`${this.baseUrl}/tags/${tagId}/`, body, {
      headers: defaultHeaders,
    });
    if (response.status !== 200) {
      throw new Error(`Failed to update tag: ${JSON.stringify(response.data)}`);
    }
  }

  /** DELETE {dms}/tags/{id}/ */
  async deleteTag(tagId: number): Promise<void> {
    const response = await apiClient.delete(`${this.baseUrl}/tags/${tagId}/`, {
      headers: defaultHeaders,
    });
    if (response.status !== 204) {
      throw new Error(`Failed to delete tag: ${JSON.stringify(response.data)}`);
    }
  }

  /** GET {dms}/tags/?search= → { results: [...] } */
  async searchTags(query: string): Promise<Json[]> {
    const response = await apiClient.get(`${this.baseUrl}/tags/?search=${query}`, {
      headers: defaultHeaders,
    });
    if (response.status !== 200) {
      throw new Error(`Failed to search tags: ${response.status}`);
    }
    const data = response.data as { results: Json[] };
    return data.results;
  }

  /**
   * POST {dms}/documents/upload — multipart/form-data.
   * Fields: file, name, type, size, userId, processId?, description?,
   * processInstanceId?, organizationId?, status?, tags[] (file fields), groups[].
   */
  async addDocument(document: Document, authToken: string): Promise<Document> {
    const formData = new FormData();
    const file =
      document.file ??
      (document.bytes
        ? new File([new Uint8Array(document.bytes)], document.name)
        : null);
    if (!file) {
      throw new Error('File does not exist or is not supported.');
    }
    formData.append('file', file, document.name);
    formData.append('name', document.name);
    formData.append('type', document.type);
    formData.append('size', String(document.size));
    formData.append('userId', document.userId);
    if (document.processId != null) formData.append('processId', document.processId);
    if (document.description) formData.append('description', document.description);
    if (document.processInstanceId != null) {
      formData.append('processInstanceId', document.processInstanceId);
    }
    if (document.organizationId != null) {
      formData.append('organizationId', document.organizationId);
    }
    if (document.status != null) formData.append('status', document.status);
    for (const tag of document.tags ?? []) {
      formData.append('tags', String(tag.id));
    }
    for (const group of document.groups ?? []) {
      formData.append('groups', group);
    }

    try {
      const response = await apiClient.post(`${this.baseUrl}/documents/upload`, formData, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (response.status === 201) {
        return documentFromJson(response.data as Json);
      }
      throw new Error(`Upload failed: ${JSON.stringify(response.data)}`);
    } catch (e) {
      checkLicense(e);
      appLogger.error('Upload error', { error: e, name: 'DocumentService' });
      throw new Error(`Upload error: ${e}`);
    }
  }

  /**
   * GET {dms}/documents/search?processId= with repeated groups= & tags= params
   * (manual URL building — mirrors the Dart implementation).
   */
  async fetchAllDocumentsByProcess(params: {
    processId?: string;
    docRoles?: DocRole[];
    groups?: string[];
    tags?: string[];
    keyword?: string;
    token: string;
  }): Promise<Document[]> {
    const groups: string[] = [...(params.groups ?? [])];
    if (params.docRoles && params.docRoles.length > 0) {
      for (const role of params.docRoles) {
        if (!groups.includes(role.id)) groups.push(role.id);
      }
    }

    let url = `${this.baseUrl}/documents/search?processId=${params.processId ?? ''}`;
    for (const group of groups) url += `&groups=${group}`;
    for (const tag of params.tags ?? []) {
      if (tag.trim().length > 0) url += `&tags=${encodeURIComponent(tag.trim())}`;
    }
    if (params.keyword != null && params.keyword.trim().length > 0) {
      url += `&keyword=${encodeURIComponent(params.keyword.trim())}`;
    }

    const response = await apiClient.get(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.token}`,
      },
    });
    if (response.status !== 200) {
      throw new Error(`Failed to fetch documents: ${response.status}`);
    }
    const results = response.data as Json[];
    return results.map(documentFromJson);
  }

  /** Same search endpoint + processInstanceId param. */
  async fetchDocumentsByProcessInstance(params: {
    processId?: string;
    processInstanceId?: string;
    docRoles?: DocRole[];
    groups?: string[];
    tags?: string[];
    keyword?: string;
    token: string;
  }): Promise<Document[]> {
    const groups: string[] = [...(params.groups ?? [])];
    if (params.docRoles && params.docRoles.length > 0) {
      for (const role of params.docRoles) {
        if (!groups.includes(role.id)) groups.push(role.id);
      }
    }

    let url = `${this.baseUrl}/documents/search?processId=${params.processId ?? ''}`;
    for (const group of groups) url += `&groups=${group}`;
    if (params.processInstanceId != null) {
      url += `&processInstanceId=${params.processInstanceId}`;
    }
    for (const tag of params.tags ?? []) {
      if (tag.trim().length > 0) url += `&tags=${encodeURIComponent(tag.trim())}`;
    }
    if (params.keyword != null && params.keyword.trim().length > 0) {
      url += `&keyword=${encodeURIComponent(params.keyword.trim())}`;
    }

    const response = await apiClient.get(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.token}`,
      },
    });
    if (response.status !== 200) {
      appLogger.error(`Failed to fetch documents by process instance: ${response.status}`);
      throw new Error(`Failed to fetch documents: ${response.status}`);
    }
    const results = response.data as Json[];
    return results.map(documentFromJson);
  }

  /** DELETE {dms}/documents/{id}/ → 204 */
  async deleteDocument(documentId: number, token: string): Promise<void> {
    try {
      const response = await apiClient.delete(`${this.baseUrl}/documents/${documentId}/`, {
        headers: { ...defaultHeaders, Authorization: `Bearer ${token}` },
      });
      if (response.status !== 204) {
        throw new Error(`Failed to delete document: ${response.status}`);
      }
    } catch (e) {
      checkLicense(e);
      appLogger.error('Error deleting document', { error: e });
      throw new Error(`Failed to delete document: ${e}`);
    }
  }
}
