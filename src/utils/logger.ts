/**
 * 日志工具模块
 *
 * 提供结构化、不可篡改（追加式）的审计操作日志记录能力。
 * 所有核心模块必须通过此模块记录操作，确保审计留痕。
 */

import { v4 as uuidv4 } from 'uuid';
import type { AuditLog, AuditLogAction } from '../models';

/** 日志存储键（localStorage） */
const LOG_STORAGE_KEY = 'lw_audit_logs';
/** 当前插件版本 */
const PLUGIN_VERSION = '1.0.0';

/** 日志记录选项 */
export interface LogOptions {
  operator?: string;
  moduleName?: string;
  affectedCount?: number;
  parameters?: Record<string, unknown>;
  result?: 'success' | 'failure' | 'partial';
  errorMessage?: string;
  projectId?: string;
}

/**
 * 记录审计操作日志
 * @param action 操作类型
 * @param description 操作描述（人可读）
 * @param options 附加选项
 * @returns 生成的日志条目
 */
export function logAction(
  action: AuditLogAction,
  description: string,
  options: LogOptions = {}
): AuditLog {
  const entry: AuditLog = {
    id: uuidv4(),
    action,
    description,
    timestamp: new Date().toISOString(),
    operator: options.operator ?? 'system',
    moduleName: options.moduleName,
    affectedCount: options.affectedCount,
    parameters: options.parameters,
    result: options.result ?? 'success',
    errorMessage: options.errorMessage,
    version: PLUGIN_VERSION,
    projectId: options.projectId,
  };

  appendLog(entry);
  return entry;
}

/**
 * 记录错误日志
 */
export function logError(
  action: AuditLogAction,
  description: string,
  error: unknown,
  options: LogOptions = {}
): AuditLog {
  const errorMessage =
    error instanceof Error ? error.message : String(error);
  return logAction(action, description, {
    ...options,
    result: 'failure',
    errorMessage,
  });
}

/**
 * 将日志追加写入存储（localStorage，不可删除）
 */
function appendLog(entry: AuditLog): void {
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    const logs: AuditLog[] = raw ? (JSON.parse(raw) as AuditLog[]) : [];
    logs.push(entry);
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // 若无法访问 localStorage（如纯 Node.js 测试环境），则降级为 console
    console.warn('[AuditLog] 无法写入 localStorage，降级为 console 输出', entry);
  }
}

/**
 * 获取全部操作日志（只读）
 */
export function getAllLogs(): AuditLog[] {
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuditLog[]) : [];
  } catch {
    return [];
  }
}

/**
 * 按模块筛选日志
 */
export function getLogsByModule(moduleName: string): AuditLog[] {
  return getAllLogs().filter((l) => l.moduleName === moduleName);
}

/**
 * 按时间范围筛选日志
 */
export function getLogsByTimeRange(from: string, to: string): AuditLog[] {
  return getAllLogs().filter(
    (l) => l.timestamp >= from && l.timestamp <= to
  );
}

/**
 * 清空日志（仅用于测试，生产环境不应调用）
 */
export function clearLogsForTest(): void {
  if (process.env.NODE_ENV === 'test') {
    try {
      localStorage.removeItem(LOG_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
