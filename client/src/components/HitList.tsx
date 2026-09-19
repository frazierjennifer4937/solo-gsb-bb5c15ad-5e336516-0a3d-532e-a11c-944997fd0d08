import type { Decisions, Hit, VttCue } from '@app/shared';

interface Props {
  hits: Hit[];
  cues: VttCue[];
  decisions: Decisions;
  onToggle(hitId: string, apply: boolean): void;
  onToggleAll(apply: boolean): void;
}

/**
 * 命中预览：按 cue 分组展示全部命中，每条可单独勾选/撤销；
 * 被高优先级覆盖的命中灰显且不可勾选。
 */
export default function HitList({ hits, cues, decisions, onToggle, onToggleAll }: Props) {
  const active = hits.filter((h) => !h.suppressed);
  const applied = active.filter((h) => decisions[h.id] !== false).length;
  const suppressed = hits.length - active.length;

  // 按 cue 分组（hits 已按文档顺序排序）
  const groups: { cueIndex: number; hits: Hit[] }[] = [];
  for (const h of hits) {
    const last = groups[groups.length - 1];
    if (last && last.cueIndex === h.cueIndex) last.hits.push(h);
    else groups.push({ cueIndex: h.cueIndex, hits: [h] });
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>③ 命中预览（逐条撤销）</h2>
        <div className="btn-group">
          <button
            type="button"
            className="btn btn-small"
            onClick={() => onToggleAll(true)}
            disabled={active.length === 0}
          >
            全部应用
          </button>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => onToggleAll(false)}
            disabled={active.length === 0}
          >
            全部撤销
          </button>
        </div>
      </div>
      <p className="hint">
        共 {hits.length} 条命中：待应用 {applied} 条 · 已撤销 {active.length - applied} 条
        {suppressed > 0 && <> · 被高优先级覆盖 {suppressed} 条</>}
      </p>
      <div className="hit-list">
        {hits.length === 0 && <p className="empty">暂无命中。请粘贴 VTT 并配置规则。</p>}
        {groups.map((g) => {
          const cue = cues[g.cueIndex];
          return (
            <div key={g.cueIndex} className="hit-group">
              <div className="hit-group-head mono">
                #{g.cueIndex + 1} · {cue ? `${cue.start} → ${cue.end}` : '未知时间轴'}
              </div>
              {g.hits.map((h) => {
                const checked = !h.suppressed && decisions[h.id] !== false;
                return (
                  <label
                    key={h.id}
                    className={`hit-row${h.suppressed ? ' suppressed' : ''}${checked ? '' : ' revoked'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={h.suppressed}
                      onChange={(e) => onToggle(h.id, e.target.checked)}
                    />
                    <span className="hit-body">
                      <span className="hit-match mono" title="命中原文">
                        {h.match}
                      </span>
                      <span className="hit-arrow">→</span>
                      <span className="hit-replacement mono" title="替换结果">
                        {h.replacement}
                      </span>
                      <span className="hit-meta">
                        <span className="badge">{h.ruleName}</span>
                        <span className="badge badge-dim">优先级 {h.priority}</span>
                        <span className="badge badge-dim">
                          第 {h.lineIndex + 1} 行 · {h.start}–{h.end}
                        </span>
                        {h.suppressed && (
                          <span className="badge badge-warn">被高优先级覆盖</span>
                        )}
                        {!h.suppressed && !checked && (
                          <span className="badge badge-revoked">已撤销</span>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
