import type { RedactionRule, RuleError } from '@app/shared';
import { newRule } from '../defaults';

interface Props {
  rules: RedactionRule[];
  ruleErrors: RuleError[];
  onChange(rules: RedactionRule[]): void;
}

/** 规则编辑器：增删规则、编辑正则/替换/优先级、启用开关 */
export default function RuleEditor({ rules, ruleErrors, onChange }: Props) {
  const update = (id: string, patch: Partial<RedactionRule>) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const remove = (id: string) => onChange(rules.filter((r) => r.id !== id));
  const add = () => onChange([...rules, newRule()]);

  const errorOf = (id: string) => ruleErrors.find((e) => e.ruleId === id);

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>② 脱敏规则</h2>
        <button type="button" className="btn btn-small" onClick={add}>
          + 添加规则
        </button>
      </div>
      <p className="hint">
        替换文本支持 <code>$&</code>（完整命中）与 <code>$1</code>–<code>$99</code>
        （捕获组）；重叠命中时<strong>优先级数值大者</strong>保留。
      </p>
      <div className="rule-list">
        {rules.length === 0 && <p className="empty">暂无规则，点击「添加规则」创建。</p>}
        {rules.map((rule) => {
          const err = errorOf(rule.id);
          return (
            <div key={rule.id} className={`rule-card${rule.enabled ? '' : ' disabled'}`}>
              <div className="rule-row">
                <label className="rule-enable" title="启用/停用该规则">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => update(rule.id, { enabled: e.target.checked })}
                  />
                </label>
                <input
                  className="input rule-name"
                  value={rule.name}
                  placeholder="规则名"
                  onChange={(e) => update(rule.id, { name: e.target.value })}
                />
                <label className="rule-priority" title="优先级（越大越优先）">
                  优先级
                  <input
                    className="input"
                    type="number"
                    value={rule.priority}
                    onChange={(e) =>
                      update(rule.id, { priority: Number(e.target.value) || 0 })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => remove(rule.id)}
                >
                  删除
                </button>
              </div>
              <div className="rule-row">
                <span className="rule-label">正则</span>
                <input
                  className={`input mono${err ? ' input-error' : ''}`}
                  value={rule.pattern}
                  placeholder="如：1[3-9]\d{9}"
                  spellCheck={false}
                  onChange={(e) => update(rule.id, { pattern: e.target.value })}
                />
                <span className="rule-label">标志</span>
                <input
                  className="input mono rule-flags"
                  value={rule.flags}
                  placeholder="g"
                  spellCheck={false}
                  onChange={(e) => update(rule.id, { flags: e.target.value })}
                />
              </div>
              <div className="rule-row">
                <span className="rule-label">替换</span>
                <input
                  className="input mono"
                  value={rule.replacement}
                  placeholder="如：[已脱敏] 或 张$1"
                  spellCheck={false}
                  onChange={(e) => update(rule.id, { replacement: e.target.value })}
                />
              </div>
              {err && <p className="rule-error">正则错误：{err.message}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
