import type { ReactNode } from 'react';
import { Tooltip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

/** HeroUI button class builder — the app-wide replacement for ad-hoc button classes. */
export function btnCls(variant: 'primary' | 'outline' | 'ghost' | 'danger' | 'dangerSoft' | 'default' = 'default', sm = false): string {
  const map: Record<string, string> = {
    primary: 'button button--primary',
    outline: 'button button--outline',
    ghost: 'button button--ghost',
    danger: 'button button--danger',
    dangerSoft: 'button button--danger-soft',
    default: 'button',
  };
  return sm ? `${map[variant]} button--sm` : map[variant];
}

/** Accessible tooltip (HeroUI / React Aria). */
export function AppTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root delay={400} closeDelay={200}>
      <Tooltip.Trigger>{children}</Tooltip.Trigger>
      <Tooltip.Content className="text-(--app-fs-small)">{label}</Tooltip.Content>
    </Tooltip.Root>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-(--accent) border-t-transparent" />
      {label ? <span className="text-(--app-fs-small)">{label}</span> : null}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="alert alert--danger m-2 gap-2 px-3 py-2">
      <div className="alert__content">
        <span className="alert__description text-(--app-fs-small) break-all">
          {message}
        </span>
      </div>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="button button--outline button--sm shrink-0"
        >
          {t('retry')}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyBox({ message }: { message?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center py-8 text-(--app-fs-base) text-muted">
      {message ?? t('noData')}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="modal__backdrop"
      onClick={onClose}
      data-entering="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`modal__dialog ${wide ? 'modal__dialog--lg' : 'modal__dialog--md'}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxHeight: '90vh' }}
      >
        <div className="modal__header">
          <h2 className="modal__heading">{title}</h2>
          <button
            onClick={onClose}
            className="modal__close-trigger button button--ghost button--icon-only"
            aria-label={t('close')}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        <div className="modal__body modal__body--scroll-inside">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'success' | 'error' | 'warn' }) {
  const tones: Record<string, string> = {
    default: 'chip--default',
    success: 'chip--success',
    error: 'chip--danger',
    warn: 'chip--warning',
  };
  return (
    <span className={`chip chip--sm ${tones[tone]}`}>
      <span className="chip__label">{children}</span>
    </span>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  onSearch,
}: {
  value: string;
  onChange(v: string): void;
  placeholder?: string;
  onSearch?: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative w-full">
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
          clipRule="evenodd"
        />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSearch?.(value);
        }}
        placeholder={placeholder ?? 'Search…'}
        className="input w-full ps-8 pe-10"
      />
      {onSearch ? (
        <button
          onClick={() => onSearch(value)}
          className="button button--primary button--sm absolute end-1 top-1/2 -translate-y-1/2"
        >
          {t('go')}
        </button>
      ) : null}
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  onRowClick,
  selectedKey,
  emptyMessage,
  keyFn,
}: {
  columns: { key: string; label: string; width?: string }[];
  rows: Record<string, ReactNode>[];
  onRowClick?: (row: Record<string, ReactNode>) => void;
  selectedKey?: string;
  emptyMessage?: string;
  keyFn(row: Record<string, ReactNode>, index: number): string;
}) {
  const { t } = useTranslation();
  return (
    <div className="table-root h-full">
      <div className="table__scroll-container h-full overflow-auto">
        <table className="w-full min-w-max border-collapse text-start">
          <thead className="table__header sticky top-0 z-10">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className="table__column whitespace-nowrap font-semibold"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="table__body">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-6 text-center text-(--app-fs-base) text-muted">
                  {emptyMessage ?? t('noData')}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const key = keyFn(row, i);
                const selected = selectedKey === key;
                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick?.(row)}
                    className={`table__row ${
                      onRowClick ? 'cursor-pointer hover:bg-surface-secondary' : ''
                    } ${selected ? 'bg-(--accent)/10' : ''}`}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className="table__cell max-w-[300px] min-w-[120px] truncate">
                        {row[c.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
