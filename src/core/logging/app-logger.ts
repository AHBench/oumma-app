import { getRuntimeString, initializeRuntimeConfig } from '../config/runtime-config';

type Level = 'fine' | 'info' | 'warning' | 'error';

let collectorUrl = '';

/**
 * Structured logger — mirrors lib/core/logging/app_logger.dart:
 * console output plus optional JSON POST to a log collector.
 */
class AppLogger {
  configureCollector(url: string): void {
    collectorUrl = url;
  }

  private log(level: Level, message: string, opts?: { error?: unknown; name?: string; stackTrace?: string }): void {
    const payload: Record<string, unknown> = {
      level,
      message:
        opts?.name != null ? `${opts.name}: ${message}` : message,
      time: new Date().toISOString(),
    };
    if (opts?.error !== undefined) {
      payload.error = opts.error instanceof Error ? opts.error.message : String(opts.error);
    }
    if (opts?.stackTrace) payload.stackTrace = opts.stackTrace;

    switch (level) {
      case 'error':
        console.error(message, opts?.error ?? '');
        break;
      case 'warning':
        console.warn(message);
        break;
      default:
        console.debug(message);
    }

    if (collectorUrl) {
      fetch(collectorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  }

  fine(message: string, opts?: { name?: string }): void {
    this.log('fine', message, opts);
  }
  info(message: string, opts?: { name?: string }): void {
    this.log('info', message, opts);
  }
  warning(message: string, opts?: { name?: string }): void {
    this.log('warning', message, opts);
  }
  error(
    message: string,
    opts?: { error?: unknown; stackTrace?: string; name?: string },
  ): void {
    this.log('error', message, opts);
  }
  debug(message: string): void {
    this.log('fine', message);
  }
}

export const appLogger = new AppLogger();

export function initAppLogger(): void {
  initializeRuntimeConfig();
  appLogger.configureCollector(getRuntimeString('LOG_COLLECTOR_URL', ''));
}
