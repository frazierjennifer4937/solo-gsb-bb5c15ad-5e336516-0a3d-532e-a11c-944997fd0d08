import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { Request, Response } from 'express';
import {
  buildAudit,
  buildOutputVtt,
  findHits,
  parseVtt,
  Decisions,
  RedactionRule,
} from '@app/shared';

const app = express();
app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------
// 请求体校验
// ---------------------------------------------------------------------------

interface PreviewBody {
  vtt: string;
  rules: RedactionRule[];
}

interface ExportBody extends PreviewBody {
  decisions: Decisions;
}

function isValidRule(r: unknown): r is RedactionRule {
  if (typeof r !== 'object' || r === null) return false;
  const rule = r as Record<string, unknown>;
  return (
    typeof rule.id === 'string' &&
    typeof rule.name === 'string' &&
    typeof rule.pattern === 'string' &&
    typeof rule.flags === 'string' &&
    typeof rule.replacement === 'string' &&
    typeof rule.priority === 'number' &&
    typeof rule.enabled === 'boolean'
  );
}

function parsePreviewBody(body: unknown): PreviewBody | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.vtt !== 'string' || !Array.isArray(b.rules)) return null;
  if (!b.rules.every(isValidRule)) return null;
  return { vtt: b.vtt, rules: b.rules };
}

function parseExportBody(body: unknown): ExportBody | null {
  const base = parsePreviewBody(body);
  if (!base) return null;
  const b = body as Record<string, unknown>;
  const decisions: Decisions = {};
  if (typeof b.decisions === 'object' && b.decisions !== null) {
    for (const [k, v] of Object.entries(b.decisions as Record<string, unknown>)) {
      if (typeof v === 'boolean') decisions[k] = v;
    }
  }
  return { ...base, decisions };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/**
 * 预览：解析 VTT + 应用规则，返回文档结构、命中列表与规则错误。
 * 前端据此渲染逐条可撤销的预览，并在本地即时重算输出。
 */
app.post('/api/preview', (req: Request, res: Response) => {
  const body = parsePreviewBody(req.body);
  if (!body) {
    res.status(400).json({
      error: '请求格式不正确：需要 { vtt: string, rules: RedactionRule[] }',
    });
    return;
  }
  const doc = parseVtt(body.vtt);
  const { hits, errors } = findHits(doc, body.rules);
  res.json({
    doc: {
      headerLines: doc.headerLines,
      blocks: doc.blocks,
      cues: doc.cues,
      warnings: doc.warnings,
    },
    hits,
    ruleErrors: errors,
  });
});

/**
 * 导出：服务端权威重算，返回脱敏后的 VTT 与审计 JSON。
 */
app.post('/api/export', (req: Request, res: Response) => {
  const body = parseExportBody(req.body);
  if (!body) {
    res.status(400).json({
      error:
        '请求格式不正确：需要 { vtt: string, rules: RedactionRule[], decisions: Record<string, boolean> }',
    });
    return;
  }
  const doc = parseVtt(body.vtt);
  const { hits, errors } = findHits(doc, body.rules);
  const outputVtt = buildOutputVtt(doc, hits, body.decisions);
  const sha256 = crypto.createHash('sha256').update(body.vtt, 'utf8').digest('hex');
  const audit = buildAudit(doc, body.rules, hits, body.decisions, sha256);
  res.json({ vtt: outputVtt, audit, ruleErrors: errors });
});

// ---------------------------------------------------------------------------
// 静态资源（生产模式：托管前端构建产物）
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const clientDist =
  process.env.CLIENT_DIST || path.resolve(__dirname, '..', '..', 'client', 'dist');

app.use(express.static(clientDist));
app.get('*', (req: Request, res: Response, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`[server] 字幕脱敏审校台已启动: http://localhost:${port}`);
  console.log(`[server] 前端静态目录: ${clientDist}`);
});
