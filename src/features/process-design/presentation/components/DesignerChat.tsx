import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuota, useClaimQuota } from '../../../shared/hooks/use-quota';
import type { OummaDesignDataSource } from '../../data/datasources/oumma-design-datasource';
import { capResult, designTools, parseToolCall, type DesignToolDef } from '../../domain/design-tools';

type Json = Record<string, unknown>;

const strArg = (args: Json, key: string): string => {
  const v = args[key];
  return typeof v === 'string' ? v.trim() : '';
};

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

interface PendingCall {
  tool: DesignToolDef;
  args: Json;
  round: number;
}

const MAX_ROUNDS = 4;

/** Load a process's persisted designer-chat messages (isolated per process). */
function loadChat(key: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (m): m is ChatMessage =>
        !!m && typeof m === 'object' && typeof (m as ChatMessage).content === 'string'
        && ['user', 'assistant', 'tool'].includes((m as ChatMessage).role),
    );
  } catch {
    return [];
  }
}

/**
 * Designer chat (B-1): prompts go to `POST /api/management/design/ask`;
 * tool calls arrive as ```tool fenced blocks and are executed client-side —
 * writes pause on an ActionCard for explicit confirmation. Tool results are
 * fed back to the LLM (≤ MAX_ROUNDS rounds per user prompt).
 */
export function DesignerChat(args: {
  processId: string;
  token: string;
  lang: string;
  ds: OummaDesignDataSource;
}) {
  const { processId, token, lang, ds } = args;
  const { t } = useTranslation();
  // Each process has its OWN chat: conversations are isolated per process
  // and persisted in localStorage, so switching processes swaps in that
  // process's history instead of leaking the previous one.
  const storageKey = `designer-chat:${processId}`;
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChat(storageKey));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: quota } = useQuota(token);
  const quotaExhausted = !!quota && !quota.unlimited && quota.exhausted;
  const { claimState, claim } = useClaimQuota(token);
  const idRef = useRef(0);
  const roundRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const tools = designTools(ds);
  const navigate = useNavigate();
  const history = useRef<{ role: string; content: string }[]>([]);

  // Process switched → load THAT process's own conversation, drop transient state.
  useEffect(() => {
    setMessages(loadChat(storageKey));
    setPending(null);
    setError(null);
    setInput('');
    history.current = [];
  }, [storageKey]);

  // Persist this process's conversation (capped) as it grows.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)));
    } catch { /* storage unavailable */ }
  }, [messages, storageKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  const push = (role: ChatMessage['role'], content: string): void => {
    idRef.current += 1;
    const id = idRef.current;
    setMessages((m) => [...m, { id, role, content }]);
  };

  async function ask(prompt: string, round: number): Promise<void> {
    let answer: string;
    try {
      answer = await ds.designAsk(
        { processId, prompt, lang, history: history.current.slice(-12) },
        token,
      );
    } catch (e) {
      setError(String(e));
      return;
    }
    setError(null);
    history.current.push({ role: 'assistant', content: answer });
    push('assistant', answer);

    const call = parseToolCall(answer);
    const tool = call ? tools.find((tool) => tool.name === call.name) : undefined;
    if (call && !tool) {
      // Unknown tool name — tell the model and let it recover (no extra round budget).
      void ask(`The tool "${call.name}" is not available. Use only the documented tools.`, round);
      return;
    }
    if (!call || !tool) return;
    if (round >= MAX_ROUNDS) {
      push('assistant', t('designChatRoundLimit'));
      return;
    }
    if (tool.needsConfirmation) {
      setPending({ tool, args: call.args, round: round + 1 });
      return;
    }
    // Read-only tool — execute immediately.
    const result = await execute(tool, call.args);
    await continueWithResult(tool, result, round + 1);
  }

  async function execute(tool: DesignToolDef, args: Json): Promise<string> {
    try {
      return capResult(await tool.run(args, token, ds));
    } catch (e) {
      return `TOOL ERROR: ${String(e)}`;
    }
  }

  async function continueWithResult(tool: DesignToolDef, result: string, round: number): Promise<void> {
    history.current.push({ role: 'tool', content: `Tool ${tool.name} returned:\n${result}` });
    push('tool', `${tool.name} → ${result}`);
    await ask(`Tool "${tool.name}" was executed, result above. Continue.`, round);
  }

  const send = async (): Promise<void> => {
    let prompt = input.trim();
    if (!prompt || busy || quotaExhausted) return;
    // JSON paste → ask the agent to convert it into a proper form (req 2).
    const jsonBlock = extractJsonBlock(prompt);
    if (jsonBlock) {
      prompt = `${prompt}\n\n${t('designChatJsonInstruction')}\n${jsonBlock}`;
    }
    setInput('');
    setBusy(true);
    roundRef.current = 0;
    history.current = [];
    push('user', prompt);
    try {
      await ask(prompt, 0);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (): Promise<void> => {
    if (!pending || busy) return;
    const { tool, args, round } = pending;
    setPending(null);
    setBusy(true);
    try {
      const result = await execute(tool, args);
      // A confirmed create_process starts a NEW PROCESS PROJECT — open its
      // design view so the designer keeps working (and the chat's context
      // switches) on the new project. All its prompts accumulate in the
      // project's single pending version until the user deploys it.
      if (tool.name === 'create_process' && !result.startsWith('TOOL ERROR')) {
        const newId =
          strArg(args, 'processId') ||
          ((): string => {
            try {
              const j = JSON.parse(result) as Json;
              return String(j.processId ?? j.process_id ?? '');
            } catch {
              return '';
            }
          })();
        if (newId && newId !== processId) {
          push('assistant', t('designChatProjectCreated', { id: newId }));
          navigate(`/myprocesses/${encodeURIComponent(newId)}/design`);
          return;
        }
      }
      // A confirmed rename_process changes the route param — follow the
      // process to its new id so the chat keeps its context.
      if (tool.name === 'rename_process' && !result.startsWith('TOOL ERROR')) {
        const newId = strArg(args, 'newProcessId');
        if (newId) {
          push('assistant', t('designChatProjectRenamed', { id: newId }));
          navigate(`/myprocesses/${encodeURIComponent(newId)}/design`);
          return;
        }
      }
      await continueWithResult(tool, result, round);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (): Promise<void> => {
    if (!pending || busy) return;
    const { tool, round } = pending;
    setPending(null);
    setBusy(true);
    try {
      await continueWithResult(tool, 'USER CANCELLED this action. Ask what to do instead.', round);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="py-6 text-center text-(--app-fs-small) text-muted">{t('designChatHint')}</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap break-words rounded-(--app-radius) px-3 py-2 text-(--app-fs-small) ${
                m.role === 'user'
                  ? 'bg-(--accent) text-white'
                  : m.role === 'tool'
                    ? 'border border-separator font-mono text-(--app-fs-base) text-muted'
                    : 'bg-surface border border-separator'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {pending && (
          <div className="rounded-(--app-radius) border border-(--accent)/40 bg-(--accent)/5 p-3">
            <div className="text-(--app-fs-small) font-semibold">{t('designChatConfirmTitle')}</div>
            <div className="mt-1 font-mono text-(--app-fs-base) text-muted">
              {pending.tool.name}
            </div>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface p-2 text-(--app-fs-base) text-muted">
              {JSON.stringify(pending.args, null, 2)}
            </pre>
            <div className="mt-2 flex gap-2">
              <button className={btnClass('primary')} onClick={() => void confirm()}>
                {t('designChatConfirm')}
              </button>
              <button className={btnClass('ghost')} onClick={() => void cancel()}>
                {t('cancel')}
              </button>
            </div>
          </div>
        )}
        {error && <div className="text-(--app-fs-small) text-red-500">{error}</div>}
        {quotaExhausted && (
          <div className="mt-2 rounded-(--app-radius) border border-red-300 bg-red-50 px-3 py-2 text-(--app-fs-small) text-foreground">
            <p className="font-semibold text-red-600">{t('quotaExhaustedTitle')}</p>
            <p className="mt-1 text-muted">{t('quotaExhaustedBody', { used: quota.used.toLocaleString(), limit: quota.limit.toLocaleString() })}</p>
            {claimState === 'sent' ? (
              <p className="mt-1 font-semibold text-(--accent)">{t('quotaClaimed')}</p>
            ) : (
              <button type="button" onClick={() => void claim()} disabled={claimState === 'sending'}
                className={`${btnClass('primary')} mt-2`}>
                {claimState === 'sending' ? t('quotaClaimSending') : t('quotaClaim')}
              </button>
            )}
          </div>
        )}
        {busy && !pending && <div className="text-(--app-fs-small) text-muted">{t('designChatThinking')}</div>}
      </div>
      <div className="mt-2 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder={t('designChatPlaceholder')}
          disabled={quotaExhausted}
          className="min-w-0 flex-1 resize-none rounded-(--app-radius) border border-separator bg-surface px-3 py-2 text-(--app-fs-small) outline-none focus:border-(--accent)"
        />
        <button
          className={btnClass('primary')}
          disabled={busy || input.trim() === '' || quotaExhausted}
          onClick={() => void send()}
        >
          {t('send')}
        </button>
      </div>
    </div>
  );
}

/** Detects a JSON object/array in the pasted text (whole message,
 *  ```json fence, or embedded balanced braces). */
function extractJsonBlock(text: string): string | null {
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && parseOk(trimmed)) return trimmed;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced && parseOk(fenced[1].trim())) return fenced[1].trim();
  const start = text.search(/[\[{]/);
  if (start >= 0) {
    for (let end = text.length; end > start; end--) {
      const slice = text.slice(start, end);
      if (parseOk(slice)) return slice;
    }
  }
  return null;
}

function parseOk(s: string): boolean {
  try { JSON.parse(s); return true; } catch { return false; }
}

function btnClass(kind: 'primary' | 'ghost'): string {
  return kind === 'primary'
    ? 'rounded-(--app-radius) bg-(--accent) px-4 py-2 text-(--app-fs-small) font-semibold text-white disabled:opacity-50'
    : 'rounded-(--app-radius) border border-separator px-4 py-2 text-(--app-fs-small)';
}
