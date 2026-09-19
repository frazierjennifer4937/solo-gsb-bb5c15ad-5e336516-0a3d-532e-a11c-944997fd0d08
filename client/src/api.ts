import type {
  AuditReport,
  Decisions,
  Hit,
  RedactionRule,
  RuleError,
  VttBlock,
  VttCue,
} from '@app/shared';

export interface PreviewResponse {
  doc: {
    headerLines: string[];
    blocks: VttBlock[];
    cues: VttCue[];
    warnings: string[];
  };
  hits: Hit[];
  ruleErrors: RuleError[];
}

export interface ExportResponse {
  vtt: string;
  audit: AuditReport;
  ruleErrors: RuleError[];
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `请求失败（HTTP ${res.status}）`);
  }
  return (await res.json()) as T;
}

export const api = {
  preview(vtt: string, rules: RedactionRule[], signal?: AbortSignal) {
    return post<PreviewResponse>('/api/preview', { vtt, rules }, signal);
  },
  export(vtt: string, rules: RedactionRule[], decisions: Decisions) {
    return post<ExportResponse>('/api/export', { vtt, rules, decisions });
  },
};

export function downloadFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
