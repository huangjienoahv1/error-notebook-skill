#!/usr/bin/env node
/** 错误经验条目的生命周期字段与到期判断。 */

import { scanMarkdownLines } from "./notebook-parser.mjs";

export const lifecycleFields = {
  status: "- 状态：",
  reviewPeriod: "- 复核周期：",
  scope: "- 适用范围：",
  lastVerified: "- 最后验证：",
  reviewBy: "- 下次复核：",
  evidence: "- 验证证据：",
  supersededBy: "- 替代条目：",
};
export const validStatuses = ["有效", "待复核", "已失效", "已替代"];
export const reviewPeriodDays = new Map([
  ["90天", 90],
  ["180天", 180],
  ["365天", 365],
]);
export const inactiveValue = "不适用";
export const invalidLifecycleLabel = "字段异常";
const millisecondsPerDay = 24 * 60 * 60 * 1000;
export const migratedPendingValues = {
  reviewPeriod: "待首次复核时确定",
  lastVerified: "未记录（迁移存量）",
  reviewBy: "首次命中时",
  evidence: "待复核后补充",
};

/** 从围栏外正文提取生命周期字段，未出现的字段返回空字符串。 */
export function extractLifecycle(lines) {
  const values = Object.fromEntries(
    Object.keys(lifecycleFields).map((name) => [name, ""]),
  );
  for (const { line, isCode } of scanMarkdownLines(lines)) {
    if (isCode) {
      continue;
    }
    for (const [name, prefix] of Object.entries(lifecycleFields)) {
      if (line.startsWith(prefix)) {
        values[name] = line.slice(prefix.length).trim();
        break;
      }
    }
  }
  return values;
}

/** 严格解析 YYYY-MM-DD，并返回 UTC 零点日期。 */
export function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) {
    return null;
  }
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

/** 返回当前本地日期对应的 UTC 零点，避免时区影响天数计算。 */
export function todayDate(now = new Date()) {
  return new Date(Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ));
}

/** 统一检查日期与周期；待复核存量允许迁移占位值，真实日期仍受约束。 */
export function validateLifecycleDates(values) {
  const errors = [];
  const pending = values.status === "待复核";
  const lastVerified = parseIsoDate(values.lastVerified);
  if (!lastVerified) {
    if (!pending || values.lastVerified !== migratedPendingValues.lastVerified) {
      errors.push(`最后验证日期无效：${values.lastVerified}。`);
    }
  } else if (lastVerified > todayDate()) {
    errors.push("最后验证日期不能晚于今天。");
  }

  if (values.status === "已失效" || values.status === "已替代") {
    if (values.reviewPeriod !== inactiveValue || values.reviewBy !== inactiveValue) {
      errors.push("已停止生效，复核周期与下次复核应填写“不适用”。");
    }
    return errors;
  }

  const periodDays = reviewPeriodDays.get(values.reviewPeriod);
  if (!periodDays && (!pending || values.reviewPeriod !== migratedPendingValues.reviewPeriod)) {
    errors.push(`复核周期无效：${values.reviewPeriod}。`);
  }
  const reviewBy = parseIsoDate(values.reviewBy);
  if (!reviewBy && (!pending || values.reviewBy !== migratedPendingValues.reviewBy)) {
    errors.push(`下次复核日期无效：${values.reviewBy}。`);
  }
  if (lastVerified && reviewBy) {
    const intervalDays = Math.round(
      (reviewBy.getTime() - lastVerified.getTime()) / millisecondsPerDay,
    );
    if (intervalDays < 1) {
      errors.push("下次复核必须晚于最后验证日期。");
    } else if (periodDays && intervalDays > periodDays) {
      errors.push(`复核间隔为 ${intervalDays} 天，超过 ${periodDays} 天周期。`);
    }
  }
  return errors;
}

/** 返回报告标签；状态或日期异常不能被当作有效条目或正常待复核条目。 */
export function lifecycleLabel(lines, asOf = todayDate()) {
  const values = extractLifecycle(lines);
  const status = values.status;
  // --as-of 仅控制到期判断，不能允许未来验证日期通过字段校验。
  if (!validStatuses.includes(status) || validateLifecycleDates(values).length > 0) {
    return invalidLifecycleLabel;
  }
  if (status === "有效") {
    const reviewBy = parseIsoDate(values.reviewBy);
    if (reviewBy && reviewBy < asOf) {
      return "已到期";
    }
  }
  return status;
}
