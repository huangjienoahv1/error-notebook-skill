#!/usr/bin/env node
/** 校验错误经验错题本的结构、编码和高风险敏感信息。 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  extractLifecycle,
  lifecycleFields,
  migratedPendingValues,
  validateLifecycleDates,
  validStatuses,
} from "./notebook-lifecycle.mjs";
import { parseNotebook, scanMarkdownLines, specialSections } from "./notebook-parser.mjs";
import { activeNotebookPath } from "./notebook-paths.mjs";


const requiredPrefixes = [
  ...Object.values(lifecycleFields),
  "- 适用条件或错误特征：",
  "- 根因判断：",
  "- 正确处理：",
  "- 禁止做法：",
];
const secretPatterns = new Map([
  ["私钥", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ["GitHub Token", /\b(?:gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u],
  ["OpenAI API Key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u],
  ["AWS Access Key", /\bAKIA[0-9A-Z]{16}\b/u],
]);

/** 解析校验命令行参数。 */
function parseArguments(argumentsList) {
  let notebook;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument !== "--notebook") {
      throw new Error(`未知参数：${argument}`);
    }
    index += 1;
    if (index >= argumentsList.length) {
      throw new Error("--notebook 缺少路径。");
    }
    notebook = path.resolve(argumentsList[index]);
  }
  notebook ??= activeNotebookPath();
  return { notebook };
}

/** 返回保持稳定顺序的重复值列表。 */
function findDuplicates(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...new Set(values.filter((value) => counts.get(value) > 1))];
}

/** 查找条目替代关系中的循环，并返回包含闭环终点的路径。 */
export function findSupersessionCycles(entries) {
  const targets = new Map();
  for (const entry of entries) {
    const values = extractLifecycle(entry.lines);
    const qualifiedTitle = `${entry.category} / ${entry.title}`;
    if (
      values.status === "已替代"
      && values.supersededBy !== "无"
      && values.supersededBy !== qualifiedTitle
    ) {
      targets.set(qualifiedTitle, values.supersededBy);
    }
  }

  const states = new Map();
  const stack = [];
  const cycles = [];
  const visit = (qualifiedTitle) => {
    if (states.get(qualifiedTitle) === "visiting") {
      const cycleStart = stack.indexOf(qualifiedTitle);
      cycles.push([...stack.slice(cycleStart), qualifiedTitle]);
      return;
    }
    if (states.get(qualifiedTitle) === "visited") {
      return;
    }

    states.set(qualifiedTitle, "visiting");
    stack.push(qualifiedTitle);
    const target = targets.get(qualifiedTitle);
    if (target && targets.has(target)) {
      visit(target);
    }
    stack.pop();
    states.set(qualifiedTitle, "visited");
  };

  for (const qualifiedTitle of targets.keys()) {
    visit(qualifiedTitle);
  }
  return cycles;
}

/** 校验一条经验的生命周期字段和值域。 */
export function validateLifecycle(category, title, lines, knownEntries) {
  const qualifiedTitle = `${category} / ${title}`;
  const values = extractLifecycle(lines);
  const errors = [];
  const status = values.status;

  if (!validStatuses.includes(status)) {
    errors.push(
      `${qualifiedTitle} 的状态“${status}”无效，应为：${validStatuses.join("、")}。`,
    );
    return errors;
  }
  if (!values.scope) {
    errors.push(`${qualifiedTitle} 的适用范围不能为空。`);
  }
  if (!values.evidence) {
    errors.push(`${qualifiedTitle} 的验证证据不能为空。`);
  }
  if (!values.supersededBy) {
    errors.push(`${qualifiedTitle} 的替代条目不能为空；没有替代项时填写“无”。`);
  } else if (status !== "已替代" && values.supersededBy !== "无") {
    errors.push(`${qualifiedTitle} 不是已替代状态，替代条目应填写“无”。`);
  }

  errors.push(...validateLifecycleDates(values).map(
    (error) => `${qualifiedTitle} 的${error}`,
  ));
  if (status === "待复核") {
    return errors;
  }

  if (status === "已失效" || status === "已替代") {
    if (values.evidence === migratedPendingValues.evidence) {
      errors.push(`${qualifiedTitle} 必须填写确认失效或替代关系的真实证据。`);
    }
    if (status === "已替代") {
      if (values.supersededBy === "无") {
        errors.push(`${qualifiedTitle} 已替代，但没有填写替代条目。`);
      } else if (values.supersededBy === qualifiedTitle) {
        errors.push(`${qualifiedTitle} 的替代条目不能指向自身。`);
      } else if (!knownEntries.has(values.supersededBy)) {
        errors.push(
          `${qualifiedTitle} 的替代条目不存在：${values.supersededBy}；请使用“分类 / 标题”。`,
        );
      }
    }
    return errors;
  }

  if (values.evidence === migratedPendingValues.evidence) {
    errors.push(`${qualifiedTitle} 不是待复核状态，必须填写真实验证证据。`);
  }
  return errors;
}

/** 执行全部静态校验并返回适合自动化使用的退出码。 */
function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`校验失败：${error.message}`);
    return 2;
  }
  if (!fs.existsSync(options.notebook) || !fs.statSync(options.notebook).isFile()) {
    console.error(`校验失败：错题本不存在：${options.notebook}`);
    return 2;
  }

  const raw = fs.readFileSync(options.notebook);
  const errors = [];
  if (raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    errors.push("文件包含 UTF-8 BOM，应保存为 UTF-8 无 BOM。");
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch (error) {
    console.error(`校验失败：文件不是有效 UTF-8：${error.message}`);
    return 1;
  }

  const {
    sections,
    categories,
    entries,
    hasUnclosedFence,
  } = parseNotebook(text);
  if (hasUnclosedFence) {
    errors.push("存在未闭合的 Markdown 围栏代码块。");
  }
  for (const requiredSection of specialSections) {
    if (!sections.has(requiredSection)) {
      errors.push(`缺少二级章节：${requiredSection}`);
    }
  }
  for (const duplicate of findDuplicates(categories)) {
    errors.push(`重复分类：${duplicate}`);
  }

  const qualifiedTitles = entries.map(
    (entry) => `${entry.category} / ${entry.title}`,
  );
  for (const duplicate of findDuplicates(qualifiedTitles)) {
    errors.push(`同一分类下存在重复条目：${duplicate}`);
  }

  const knownEntries = new Set(qualifiedTitles);
  for (const entry of entries) {
    const fieldLines = [...scanMarkdownLines(entry.lines)]
      .filter(({ isCode }) => !isCode)
      .map(({ line }) => line);
    for (const prefix of requiredPrefixes) {
      const matches = fieldLines.filter((line) => line.startsWith(prefix));
      const count = matches.length;
      if (count !== 1) {
        errors.push(
          `${entry.category} / ${entry.title} 中“${prefix}”数量为 ${count}，应为 1。`,
        );
      } else if (!matches[0].slice(prefix.length).trim()) {
        errors.push(`${entry.category} / ${entry.title} 中“${prefix}”内容不能为空。`);
      }
    }
    errors.push(...validateLifecycle(
      entry.category,
      entry.title,
      entry.lines,
      knownEntries,
    ));
  }
  for (const cycle of findSupersessionCycles(entries)) {
    errors.push(`替代关系形成循环：${cycle.join(" -> ")}。`);
  }

  if (text.includes("[TODO") || text.includes("[PLACEHOLDER")) {
    errors.push("文件仍包含未完成占位符。");
  }
  for (const [secretName, pattern] of secretPatterns) {
    if (pattern.test(text)) {
      errors.push(`检测到疑似${secretName}，请删除或脱敏。`);
    }
  }

  if (errors.length > 0) {
    console.error("错题本校验失败：");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    return 1;
  }

  console.log(
    `错题本校验通过：${categories.length} 个分类，${entries.length} 条经验，UTF-8 无 BOM，未发现高风险凭据。`,
  );
  return 0;
}


if (
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.exitCode = main();
}
