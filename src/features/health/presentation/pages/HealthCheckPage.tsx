/**
 * Kubernetes health endpoints — mirrors
 * lib/features/health/presentation/pages/health_check_page.dart
 */
export function HealthCheckPage({ checkType }: { checkType: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="rounded border border-ink-200 bg-white p-4 dark:border-ink-700 dark:bg-ink-800">
        <p className="text-xs font-mono text-mint-500">
          {checkType}: OK
        </p>
      </div>
    </div>
  );
}

export default HealthCheckPage;
