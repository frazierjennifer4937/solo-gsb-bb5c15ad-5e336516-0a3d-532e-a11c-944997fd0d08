import { useEffect, useMemo, useRef, useState } from 'react';
import { buildOutputVtt } from '@app/shared';
import type { Decisions, RedactionRule } from '@app/shared';
import { api, downloadFile, PreviewResponse } from './api';
import { DEFAULT_RULES, SAMPLE_VTT } from './defaults';
import { clearTask, loadTask, saveTask } from './storage';
import RuleEditor from './components/RuleEditor';
import HitList from './components/HitList';
import OutputPanel from './components/OutputPanel';

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export default function App() {
  // 初始化时尝试恢复上次任务（刷新后可继续）
  const [initial] = useState(() => loadTask());
  const [vttInput, setVttInput] = useState(initial?.vttInput ?? '');
  const [rules, setRules] = useState<RedactionRule[]>(initial?.rules ?? DEFAULT_RULES);
  const [decisions, setDecisions] = useState<Decisions>(initial?.decisions ?? {});
  const [restoredAt] = useState<string | null>(initial?.savedAt || null);

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

  // 任务状态变化时自动持久化（防抖），刷新后可恢复
  useEffect(() => {
    const t = window.setTimeout(() => {
      saveTask({
        vttInput,
        rules,
        decisions,
        savedAt: new Date().toISOString(),
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [vttInput, rules, decisions]);

  // 输入或规则变化时重新计算预览（防抖 + 取消过期请求）
  useEffect(() => {
    if (!vttInput.trim()) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      api
        .preview(vttInput, rules, controller.signal)
        .then((res) => {
          setPreview(res);
          setPreviewError(null);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setPreviewError(err instanceof Error ? err.message : String(err));
        });
    }, 400);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [vttInput, rules]);

  // 输出 VTT：前端用共享引擎按当前撤销决定即时重算
  const outputVtt = useMemo(() => {
    if (!preview) return '';
    return buildOutputVtt(preview.doc, preview.hits, decisions);
  }, [preview, decisions]);

  const toggleHit = (hitId: string, apply: boolean) => {
    setDecisions((prev) => ({ ...prev, [hitId]: apply }));
  };

  const toggleAll = (apply: boolean) => {
    if (!preview) return;
    setDecisions((prev) => {
      const next = { ...prev };
      for (const h of preview.hits) {
        if (!h.suppressed) next[h.id] = apply;
      }
      return next;
    });
  };

  const handleExport = async () => {
    if (!vttInput.trim()) return;
    setExporting(true);
    try {
      const res = await api.export(vttInput, rules, decisions);
      const ts = timestamp();
      downloadFile(`redacted-${ts}.vtt`, res.vtt, 'text/vtt');
      downloadFile(`audit-${ts}.json`, JSON.stringify(res.audit, null, 2), 'application/json');
      showToast(
        `导出完成：应用 ${res.audit.stats.applied} 条，撤销 ${res.audit.stats.rejected} 条` +
          (res.audit.stats.suppressed > 0 ? `，覆盖 ${res.audit.stats.suppressed} 条` : ''),
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm('确定开始新任务？当前 VTT、规则与撤销记录将被清空。')) return;
    clearTask();
    setVttInput('');
    setRules(DEFAULT_RULES);
    setDecisions({});
    setPreview(null);
    showToast('已清空，开始新任务');
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>字幕脱敏审校台</h1>
          <p className="subtitle">
            粘贴 WebVTT → 配置正则规则 → 按优先级合并命中 → 逐条撤销预览 → 导出脱敏字幕与审计文件
          </p>
        </div>
        <div className="header-actions">
          {restoredAt && (
            <span className="restore-chip" title={restoredAt}>
              已恢复上次任务
            </span>
          )}
          <button type="button" className="btn" onClick={() => setVttInput(SAMPLE_VTT)}>
            载入示例
          </button>
          <button type="button" className="btn btn-danger" onClick={handleReset}>
            新任务
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="col">
          <section className="panel">
            <div className="panel-title">
              <h2>① 原始 WebVTT</h2>
              <span className="hint">{vttInput.length} 字符</span>
            </div>
            <textarea
              className="vtt-input mono"
              placeholder={'粘贴带时间码的 WebVTT 内容…\n\nWEBVTT\n\n00:00:01.000 --> 00:00:04.000\n你好，世界'}
              value={vttInput}
              spellCheck={false}
              onChange={(e) => setVttInput(e.target.value)}
            />
          </section>
          <RuleEditor
            rules={rules}
            ruleErrors={preview?.ruleErrors ?? []}
            onChange={setRules}
          />
        </div>

        <div className="col">
          {previewError && <div className="error-banner">预览失败：{previewError}</div>}
          <HitList
            hits={preview?.hits ?? []}
            cues={preview?.doc.cues ?? []}
            decisions={decisions}
            onToggle={toggleHit}
            onToggleAll={toggleAll}
          />
          <OutputPanel
            outputVtt={outputVtt}
            warnings={preview?.doc.warnings ?? []}
            canExport={!!preview && !!vttInput.trim()}
            exporting={exporting}
            onExport={handleExport}
          />
        </div>
      </main>

      <footer className="app-footer">
        所有处理均在本机完成，数据不会离开当前环境；任务自动保存，刷新页面后可继续。
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
