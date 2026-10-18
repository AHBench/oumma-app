/**
 * Token quota (normal users only; designers are unlimited).
 *
 * useQuota polls GET /api/quota (monthly budget, default 20 000 tokens —
 * configured server-side via NORMAL_USER_TOKEN_QUOTA in docker compose).
 * claimQuota POSTs /api/quota/claim, which emails the administration a
 * top-up request.
 */
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../core/http/client';
import { BaseUrls } from '../../../core/config/base-urls';

export interface Quota {
  unlimited: boolean;
  limit: number;
  used: number;
  remaining: number;
  exhausted: boolean;
  month: string;
}

const base = () => BaseUrls.oummaUrl.replace(/\/+$/, '');

export function useQuota(token: string | null) {
  return useQuery({
    queryKey: ['quota'],
    queryFn: async (): Promise<Quota> => {
      const response = await apiClient.get(`${base()}/api/quota`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data as Quota;
    },
    enabled: token != null,
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useClaimQuota(token: string | null) {
  const [claimState, setClaimState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const claim = useCallback(async () => {
    if (!token) return;
    setClaimState('sending');
    try {
      await apiClient.post(`${base()}/api/quota/claim`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setClaimState('sent');
    } catch {
      setClaimState('error');
    }
  }, [token]);

  return { claimState, claim };
}
