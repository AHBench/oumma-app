import { describe, expect, it } from 'vitest';
import { capResult, parseToolCall } from '../../../src/features/process-design/domain/design-tools';

describe('process-design/design-tools', () => {
  it('parses a ```tool fenced block', () => {
    const text = 'Sure, I will create it.\n```tool\n{"name":"create_process","args":{"processName":"Loan Review"}}\n```\nDone.';
    const call = parseToolCall(text);
    expect(call).toEqual({
      name: 'create_process',
      args: { processName: 'Loan Review' },
    });
  });

  it('defaults missing args to an empty object', () => {
    const call = parseToolCall('```tool\n{"name":"get_process_config","args":{}}\n```');
    expect(call).toEqual({ name: 'get_process_config', args: {} });
  });

  it('returns null for plain answers, malformed blocks or missing names', () => {
    expect(parseToolCall('Just a plain answer.')).toBeNull();
    expect(parseToolCall('```tool\n{not json}\n```')).toBeNull();
    expect(parseToolCall('```tool\n{"args":{}}\n```')).toBeNull();
    expect(parseToolCall('```tool\n{"name":"x"')).toBeNull(); // unclosed
  });

  it('caps long results at ~4k chars', () => {
    const out = capResult('a'.repeat(10_000));
    expect(out.length).toBeLessThan(4100);
    expect(out).toContain('truncated');
  });
});
