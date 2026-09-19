import type { Decisions, RedactionRule } from '@app/shared';

/**
 * 任务持久化：所有处理均在本机完成，任务状态保存在浏览器 localStorage，
 * 刷新页面后自动恢复（包括 VTT 原文、规则与每条命中的撤销决定）。
 */

const STORAGE_KEY = 'srw.task.v1';

export interface PersistedTask {
  vttInput: string;
  rules: RedactionRule[];
  decisions: Decisions;
  savedAt: string;
}

export function loadTask(): PersistedTask | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PersistedTask>;
    if (typeof data.vttInput !== 'string' || !Array.isArray(data.rules)) return null;
    return {
      vttInput: data.vttInput,
      rules: data.rules as RedactionRule[],
      decisions:
        typeof data.decisions === 'object' && data.decisions !== null
          ? (data.decisions as Decisions)
          : {},
      savedAt: typeof data.savedAt === 'string' ? data.savedAt : '',
    };
  } catch {
    return null;
  }
}

export function saveTask(task: PersistedTask): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(task));
  } catch {
    // 存储满或被禁用时静默失败，不影响主流程
  }
}

export function clearTask(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
