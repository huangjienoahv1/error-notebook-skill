#!/usr/bin/env node
/** 扫描待复核、已经超过复核日期及生命周期字段异常的错误经验。 */

import fs from "node:fs";
import path from "node:path";

import {
  extractLifecycle,
  invalidLifecycleLabel,
  lifecycleLabel,
  parseIsoDate,
  todayDate,
} from "./notebook-lifecycle.mjs";
import { parseNotebook } from "./notebook-parser.mjs";
import { activeNotebookPath } from "./notebook-paths.mjs";


/** 解析复核扫描参数。 */
function parseArguments(argumentsList) {
  let notebook;
  let asOf = todayDate();
  let maxResults = 20;
  let failOnAction = false;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--notebook") {
      index += 1;
      if (index >= argumentsList.length) {
        throw new Error("--notebook 缺少路径。");
      }
      notebook = path.resolve(argumentsList[index]);
    } else if (argument === "--as-of") {
      index += 1;
      if (index >= argumentsList.length) {
        throw new Error("--as-of 缺少日期。");
      }
      asOf = parseIsoDate(argumentsList[index]);
      if (!asOf) {
        throw new Error("日期必须使用 YYYY-MM-DD 格式。");
      }
    } else if (argument === "--max-results") {
      index += 1;
      if (index >= argumentsList.length) {
        throw new Error("--max-results 缺少数量。");
      }
      maxResults = Number(argumentsList[index]);
    } else if (argument === "--fail-on-action") {
      failOnAction = true;
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }

  if (!Number.isInteger(maxResults) || maxResults < 1) {
    throw new Error("--max-results 必须是大于 0 的整数。");
  }
  notebook ??= activeNotebookPath();
  return { notebook, asOf, maxResults, failOnAction };
}

/** 输出生命周期汇总和需要处理的条目。 */
function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`错误：${error.message}`);
    return 2;
  }
  if (!fs.existsSync(options.notebook) || !fs.statSync(options.notebook).isFile()) {
    console.error(`错误：错题本不存在：${options.notebook}`);
    return 2;
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      fs.readFileSync(options.notebook),
    );
  } catch (error) {
    console.error(`错误：错题本不是有效 UTF-8：${error.message}`);
    return 2;
  }
  const { entries, hasUnclosedFence } = parseNotebook(text);
  if (hasUnclosedFence) {
    console.error("错误：存在未闭合的 Markdown 围栏代码块，无法可靠扫描。");
    return 2;
  }
  const labels = entries.map((entry) => ({
    entry,
    label: lifecycleLabel(entry.lines, options.asOf),
  }));
  const counts = new Map();
  for (const { label } of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const actionable = labels.filter(
    ({ label }) => label === "待复核" || label === "已到期" || label === invalidLifecycleLabel,
  );

  console.log(`# 错题本复核扫描（截至 ${options.asOf.toISOString().slice(0, 10)}）`);
  console.log();
  console.log(`- 总条目：${entries.length}`);
  for (const label of ["有效", "待复核", "已到期", "已失效", "已替代", invalidLifecycleLabel]) {
    console.log(`- ${label}：${counts.get(label) ?? 0}`);
  }

  console.log("\n## 待处理条目\n");
  if (actionable.length === 0) {
    console.log("没有待复核、已到期或字段异常条目。");
    return 0;
  }

  for (const { label, entry } of actionable.slice(0, options.maxResults)) {
    const values = extractLifecycle(entry.lines);
    console.log(
      `- [${label}] ${entry.category} / ${entry.title}；`
      + `最后验证：${values.lastVerified}；下次复核：${values.reviewBy}`,
    );
  }
  if (counts.has(invalidLifecycleLabel)) {
    console.log("字段异常条目请使用 validate-notebook.mjs 校验同一数据文件，定位具体原因。");
  }
  const remaining = actionable.length - options.maxResults;
  if (remaining > 0) {
    console.log(`- 其余 ${remaining} 条未展开；使用 --max-results 调整显示数量。`);
  }
  return options.failOnAction ? 1 : 0;
}


process.exitCode = main();
