interface Props {
  outputVtt: string;
  warnings: string[];
  canExport: boolean;
  exporting: boolean;
  onExport(): void;
}

/** 输出面板：实时展示脱敏后的 VTT，并提供 VTT + 审计 JSON 导出 */
export default function OutputPanel({
  outputVtt,
  warnings,
  canExport,
  exporting,
  onExport,
}: Props) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>④ 输出与导出</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onExport}
          disabled={!canExport || exporting}
        >
          {exporting ? '正在导出…' : '导出 VTT + 审计 JSON'}
        </button>
      </div>
      {warnings.length > 0 && (
        <div className="warnings">
          {warnings.map((w, i) => (
            <p key={i} className="warning">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
      <p className="hint">
        时间轴与注释块原样保留，仅替换命中文本；导出包含脱敏后的 .vtt 与审计 .json 两个文件。
      </p>
      <pre className="output-vtt mono">
        {outputVtt || '（输出预览：粘贴 VTT 后自动生成）'}
      </pre>
    </section>
  );
}
