#!/usr/bin/env node
/** 错误经验条目的生命周期字段与到期判断。 */

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
export const migratedPendingValues = {
  reviewPeriod: "待首次复核时确定",
  lastVerified: "未记录（迁移存量）",
  reviewBy: "首次命中时",
  evidence: "待复核后补充",
};

/** 从条目正文提取生命周期字段，未出现的字段返回空字符串。 */
export function extractLifecycle(lines) {
  const values = Object.fromEntries(
    Object.keys(lifecycleFields).map((name) => [name, ""]),
  );
  for (const line of lines) {
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

/** 返回用于检索和复核报告的当前生命周期标签。 */
export function lifecycleLabel(lines, asOf = todayDate()) {
  const values = extractLifecycle(lines);
  const status = values.status || "待复核";
  if (status === "有效") {
    const reviewBy = parseIsoDate(values.reviewBy);
    if (reviewBy && reviewBy < asOf) {
      return "已到期";
    }
  }
  return status;
}
