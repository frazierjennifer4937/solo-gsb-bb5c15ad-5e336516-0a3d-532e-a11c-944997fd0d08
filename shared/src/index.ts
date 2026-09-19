/**
 * 字幕脱敏核心引擎（纯函数，无第三方依赖）。
 * 同时被 Node.js 服务端与 React 前端引用：
 *  - 服务端：/api/preview、/api/export 的权威计算
 *  - 前端：根据用户逐条撤销的决定，即时重算输出 VTT 预览
 */

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 一条脱敏规则 */
export interface RedactionRule {
  id: string;
  /** 规则显示名，如「手机号」 */
  name: string;
  /** 正则表达式源码（不含斜杠） */
  pattern: string;
  /** 正则标志，如 "g"、"gi"；引擎会强制补充 g */
  flags: string;
  /** 替换模板，支持 $$、$&、$1-$99 捕获组引用 */
  replacement: string;
  /** 优先级，数值越大越优先；重叠命中时高优先级保留 */
  priority: number;
  enabled: boolean;
}

/** 解析后的单条字幕 cue；时间轴字段原样保留，不做任何归一化 */
export interface VttCue {
  index: number;
  /** cue 标识符（可选行），无则为 null */
  identifier: string | null;
  /** 原始时间轴行，如 "00:00:01.000 --> 00:00:04.000 align:start line:0%" */
  timingRaw: string;
  start: string;
  end: string;
  settings: string;
  /** 字幕正文行 */
  payload: string[];
}

/** 文档块：cue 或需要原样保留的块（NOTE / STYLE / REGION 等） */
export type VttBlock =
  | { kind: 'cue'; cueIndex: number }
  | { kind: 'raw'; lines: string[] };

export interface VttDocument {
  /** 文件头行（WEBVTT 及其元数据行） */
  headerLines: string[];
  blocks: VttBlock[];
  cues: VttCue[];
  warnings: string[];
}

/** 一次规则命中 */
export interface Hit {
  /** 稳定 ID：ruleId:cueIndex:lineIndex:start:end，刷新/重算后决定可对应恢复 */
  id: string;
  ruleId: string;
  ruleName: string;
  priority: number;
  cueIndex: number;
  /** 命中位于 cue 正文的第几行 */
  lineIndex: number;
  /** 行内字符区间 [start, end) */
  start: number;
  end: number;
  /** 命中的原文 */
  match: string;
  groups: (string | undefined)[];
  /** 展开 $&/$1 等引用后的最终替换文本 */
  replacement: string;
  /** 是否因与更高优先级命中重叠而被抑制 */
  suppressed: boolean;
}

export interface RuleError {
  ruleId: string;
  ruleName: string;
  message: string;
}

/** 用户对每条命中的决定：true=应用，false=撤销；缺省视为应用 */
export type Decisions = Record<string, boolean>;

export type AuditHitStatus = 'applied' | 'rejected' | 'suppressed';

export interface AuditHit {
  id: string;
  ruleId: string;
  ruleName: string;
  priority: number;
  cueIndex: number;
  lineIndex: number;
  /** 命中所在 cue 的原始时间区间 */
  timeRange: { start: string; end: string };
  /** 行内字符区间 */
  start: number;
  end: number;
  /** 原文 */
  match: string;
  /** 替换结果 */
  replacement: string;
  status: AuditHitStatus;
}

export interface AuditReport {
  tool: string;
  version: string;
  generatedAt: string;
  input: {
    cueCount: number;
    /** 原始输入的 SHA-256（由服务端计算传入） */
    sha256: string | null;
  };
  rules: RedactionRule[];
  hits: AuditHit[];
  stats: {
    total: number;
    applied: number;
    rejected: number;
    suppressed: number;
  };
}

// ---------------------------------------------------------------------------
// WebVTT 解析与序列化
// ---------------------------------------------------------------------------

/** 时间轴行：支持 mm:ss.mmm 与 hh:mm:ss.mmm 两种时间格式 */
const TIMING_RE =
  /^(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{1,2}:\d{2}\.\d{3})\s+-->\s+(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{1,2}:\d{2}\.\d{3})([ \t].*)?$/;

/**
 * 解析 WebVTT。保留文件头、NOTE/STYLE/REGION 等原始块，
 * cue 的时间轴行原样保存（timingRaw），序列化时逐字写回。
 */
export function parseVtt(input: string): VttDocument {
  const text = input.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const warnings: string[] = [];
  const headerLines: string[] = [];

  let i = 0;
  const first = (lines[0] ?? '').replace(/^﻿/, '');
  if (!first.startsWith('WEBVTT')) {
    warnings.push('输入缺少 WEBVTT 文件头，导出时已自动补全');
    headerLines.push('WEBVTT');
  } else {
    headerLines.push(first);
    i = 1;
    // 文件头元数据行，直到空行为止
    while (i < lines.length && lines[i].trim() !== '') {
      headerLines.push(lines[i]);
      i++;
    }
  }
  while (i < lines.length && lines[i].trim() === '') i++;

  const blocks: VttBlock[] = [];
  const cues: VttCue[] = [];

  while (i < lines.length) {
    const blockLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      blockLines.push(lines[i]);
      i++;
    }
    while (i < lines.length && lines[i].trim() === '') i++;
    if (blockLines.length === 0) break;

    // 时间轴行可能位于第 1 行，或第 2 行（第 1 行为 cue 标识符）
    let timingIdx = -1;
    for (let k = 0; k < Math.min(2, blockLines.length); k++) {
      if (TIMING_RE.test(blockLines[k])) {
        timingIdx = k;
        break;
      }
    }
    if (timingIdx === -1) {
      // NOTE / STYLE / REGION 或无法识别的块：原样保留
      blocks.push({ kind: 'raw', lines: blockLines });
      continue;
    }

    const m = blockLines[timingIdx].match(TIMING_RE)!;
    const cue: VttCue = {
      index: cues.length,
      identifier: timingIdx === 1 ? blockLines[0] : null,
      timingRaw: blockLines[timingIdx],
      start: m[1],
      end: m[2],
      settings: (m[3] ?? '').trim(),
      payload: blockLines.slice(timingIdx + 1),
    };
    cues.push(cue);
    blocks.push({ kind: 'cue', cueIndex: cue.index });
  }

  return { headerLines, blocks, cues, warnings };
}

/**
 * 序列化回 VTT 文本。时间轴行逐字写回；
 * payloadByCue 提供各 cue 替换后的正文，未提供的 cue 保持原文。
 */
export function serializeVtt(
  doc: VttDocument,
  payloadByCue?: Map<number, string[]>,
): string {
  const out: string[] = [doc.headerLines.join('\n')];
  for (const block of doc.blocks) {
    if (block.kind === 'raw') {
      out.push(block.lines.join('\n'));
    } else {
      const cue = doc.cues[block.cueIndex];
      const lines: string[] = [];
      if (cue.identifier !== null) lines.push(cue.identifier);
      lines.push(cue.timingRaw);
      lines.push(...(payloadByCue?.get(cue.index) ?? cue.payload));
      out.push(lines.join('\n'));
    }
  }
  return out.join('\n\n') + '\n';
}

// ---------------------------------------------------------------------------
// 替换模板展开
// ---------------------------------------------------------------------------

/** 展开替换模板：$$ → $，$& → 完整命中，$1-$99 → 对应捕获组（不存在则为空串） */
export function expandReplacement(
  template: string,
  match: string,
  groups: (string | undefined)[],
): string {
  return template.replace(/\$(\$|&|[1-9]\d?)/g, (_whole, token: string) => {
    if (token === '$') return '$';
    if (token === '&') return match;
    const n = parseInt(token, 10);
    return groups[n - 1] ?? '';
  });
}

// ---------------------------------------------------------------------------
// 规则命中与优先级合并
// ---------------------------------------------------------------------------

const MAX_MATCHES_PER_RULE_PER_LINE = 10000;

/**
 * 对所有 cue 正文应用全部启用规则，返回命中列表。
 * 重叠命中按「优先级降序 → 起始位置升序 → 区间长度降序」排序后贪心选取，
 * 未选中的命中标记 suppressed = true（保留在结果中供审计与界面展示）。
 */
export function findHits(
  doc: VttDocument,
  rules: RedactionRule[],
): { hits: Hit[]; errors: RuleError[] } {
  const errors: RuleError[] = [];
  const compiled: { rule: RedactionRule; regex: RegExp }[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    let flags = rule.flags || 'g';
    if (!flags.includes('g')) flags += 'g';
    try {
      compiled.push({ rule, regex: new RegExp(rule.pattern, flags) });
    } catch (e) {
      errors.push({
        ruleId: rule.id,
        ruleName: rule.name,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const rawHits: Hit[] = [];
  for (const cue of doc.cues) {
    cue.payload.forEach((line, lineIndex) => {
      for (const { rule, regex } of compiled) {
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        let guard = 0;
        while ((m = regex.exec(line)) !== null) {
          const start = m.index;
          const end = start + m[0].length;
          const groups = Array.from(m).slice(1);
          rawHits.push({
            id: `${rule.id}:${cue.index}:${lineIndex}:${start}:${end}`,
            ruleId: rule.id,
            ruleName: rule.name,
            priority: rule.priority,
            cueIndex: cue.index,
            lineIndex,
            start,
            end,
            match: m[0],
            groups,
            replacement: expandReplacement(rule.replacement, m[0], groups),
            suppressed: false,
          });
          // 防止零宽匹配导致死循环
          if (m[0].length === 0) regex.lastIndex += 1;
          if (++guard >= MAX_MATCHES_PER_RULE_PER_LINE) break;
        }
      }
    });
  }

  // 按行分组，组内按优先级合并重叠
  const byLine = new Map<string, Hit[]>();
  for (const h of rawHits) {
    const key = `${h.cueIndex}:${h.lineIndex}`;
    const arr = byLine.get(key);
    if (arr) arr.push(h);
    else byLine.set(key, [h]);
  }

  const hits: Hit[] = [];
  for (const arr of byLine.values()) {
    arr.sort(
      (a, b) =>
        b.priority - a.priority ||
        a.start - b.start ||
        b.end - b.start - (a.end - a.start),
    );
    const accepted: Hit[] = [];
    for (const h of arr) {
      const overlaps = accepted.some(
        (a) => h.start < a.end && a.start < h.end,
      );
      if (overlaps) {
        h.suppressed = true;
      } else {
        accepted.push(h);
      }
      hits.push(h);
    }
  }

  // 展示顺序：按文档位置
  hits.sort(
    (a, b) =>
      a.cueIndex - b.cueIndex ||
      a.lineIndex - b.lineIndex ||
      a.start - b.start ||
      b.priority - a.priority,
  );
  return { hits, errors };
}

// ---------------------------------------------------------------------------
// 应用替换 / 生成输出
// ---------------------------------------------------------------------------

/**
 * 根据用户决定计算各 cue 替换后的正文。
 * 默认应用所有未被抑制的命中；decisions[id] === false 表示用户撤销该条。
 * 同一行内从后往前替换，保证字符区间不失效。
 */
export function applyHits(
  doc: VttDocument,
  hits: Hit[],
  decisions: Decisions,
): Map<number, string[]> {
  const perCue = new Map<number, Map<number, Hit[]>>();
  for (const h of hits) {
    if (h.suppressed) continue;
    if (decisions[h.id] === false) continue;
    let lineMap = perCue.get(h.cueIndex);
    if (!lineMap) {
      lineMap = new Map();
      perCue.set(h.cueIndex, lineMap);
    }
    const arr = lineMap.get(h.lineIndex);
    if (arr) arr.push(h);
    else lineMap.set(h.lineIndex, [h]);
  }

  const result = new Map<number, string[]>();
  for (const cue of doc.cues) {
    const lineMap = perCue.get(cue.index);
    if (!lineMap) continue;
    const newPayload = [...cue.payload];
    for (const [lineIndex, arr] of lineMap) {
      let out = cue.payload[lineIndex];
      arr.sort((a, b) => b.start - a.start);
      for (const h of arr) {
        out = out.slice(0, h.start) + h.replacement + out.slice(h.end);
      }
      newPayload[lineIndex] = out;
    }
    result.set(cue.index, newPayload);
  }
  return result;
}

/** 一步到位：解析 → 命中 → 应用 → 序列化出脱敏后的 VTT */
export function buildOutputVtt(
  doc: VttDocument,
  hits: Hit[],
  decisions: Decisions,
): string {
  return serializeVtt(doc, applyHits(doc, hits, decisions));
}

// ---------------------------------------------------------------------------
// 审计报告
// ---------------------------------------------------------------------------

export function buildAudit(
  doc: VttDocument,
  rules: RedactionRule[],
  hits: Hit[],
  decisions: Decisions,
  inputSha256: string | null,
  generatedAt: Date = new Date(),
): AuditReport {
  const auditHits: AuditHit[] = hits.map((h) => {
    const cue = doc.cues[h.cueIndex];
    const status: AuditHitStatus = h.suppressed
      ? 'suppressed'
      : decisions[h.id] === false
        ? 'rejected'
        : 'applied';
    return {
      id: h.id,
      ruleId: h.ruleId,
      ruleName: h.ruleName,
      priority: h.priority,
      cueIndex: h.cueIndex,
      lineIndex: h.lineIndex,
      timeRange: cue ? { start: cue.start, end: cue.end } : { start: '', end: '' },
      start: h.start,
      end: h.end,
      match: h.match,
      replacement: h.replacement,
      status,
    };
  });

  const applied = auditHits.filter((h) => h.status === 'applied').length;
  const rejected = auditHits.filter((h) => h.status === 'rejected').length;
  const suppressed = auditHits.filter((h) => h.status === 'suppressed').length;

  return {
    tool: 'subtitle-redaction-workbench',
    version: '1.0.0',
    generatedAt: generatedAt.toISOString(),
    input: { cueCount: doc.cues.length, sha256: inputSha256 },
    rules,
    hits: auditHits,
    stats: { total: auditHits.length, applied, rejected, suppressed },
  };
}
