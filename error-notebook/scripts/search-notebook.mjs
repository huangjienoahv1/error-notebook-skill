#!/usr/bin/env node
/** 按关键词输出错题本中与当前任务直接相关的上下文。 */

import fs from "node:fs";
import path from "node:path";

import { lifecycleLabel } from "./notebook-lifecycle.mjs";
import { parseNotebook, specialSections } from "./notebook-parser.mjs";
import { activeNotebookPath } from "./notebook-paths.mjs";


/** 解析检索参数。 */
function parseArguments(argumentsList) {
  const terms = [];
  let notebook;
  let maxResults = 8;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--notebook") {
      index += 1;
      if (index >= argumentsList.length) {
        throw new Error("--notebook 缺少路径。");
      }
      notebook = path.resolve(argumentsList[index]);
    } else if (argument === "--max-results") {
      index += 1;
      if (index >= argumentsList.length) {
        throw new Error("--max-results 缺少数量。");
      }
      maxResults = Number(argumentsList[index]);
    } else if (argument.startsWith("--")) {
      throw new Error(`未知参数：${argument}`);
    } else {
      terms.push(argument);
    }
  }

  if (terms.length === 0) {
    throw new Error("至少需要一个字面量检索词。");
  }
  if (!Number.isInteger(maxResults) || maxResults < 1) {
    throw new Error("--max-results 必须是大于 0 的整数。");
  }
  notebook ??= activeNotebookPath();
  return { terms, notebook, maxResults };
}

/** 计算一个字面量在文本中的非重叠出现次数。 */
function occurrenceCount(text, term) {
  let count = 0;
  let start = 0;
  while (start <= text.length - term.length) {
    const foundAt = text.indexOf(term, start);
    if (foundAt < 0) {
      break;
    }
    count += 1;
    start = foundAt + term.length;
  }
  return count;
}

/** 优先按命中的不同检索词数量和具体程度计算相关度。 */
function scoreEntry(entry, terms) {
  const haystack = `${entry.category}\n${entry.title}\n${entry.text}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const normalizedTerm = term.toLowerCase().trim();
    if (!normalizedTerm) {
      continue;
    }
    const count = occurrenceCount(haystack, normalizedTerm);
    if (count > 0) {
      score += 1000 + Math.min(count, 10) + Math.min(normalizedTerm.length, 100);
    }
  }
  return score;
}

/** 读取错题本并输出受限的相关上下文。 */
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
  const { sections, categories, entries } = parseNotebook(text);
  const ranked = entries
    .map((entry, index) => ({
      entry,
      index,
      score: scoreEntry(entry, options.terms),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, options.maxResults);

  console.log("# 错题本检索上下文");
  for (const sectionName of specialSections) {
    const section = sections.get(sectionName);
    if (section) {
      console.log();
      console.log(section.join("\n").trimEnd());
    }
  }

  console.log("\n## 分类索引\n");
  for (const category of categories) {
    console.log(`- ${category}`);
  }

  console.log("\n## 匹配经验\n");
  if (ranked.length === 0) {
    console.log("未检索到直接相关经验；继续当前任务，不读取无关条目。");
    return 0;
  }

  for (const { entry } of ranked) {
    console.log(`<!-- 分类：${entry.category} -->`);
    const currentLifecycle = lifecycleLabel(entry.lines);
    if (currentLifecycle !== "有效") {
      console.log(
        `<!-- 生命周期：${currentLifecycle}；仅作为调查线索，采用前必须在当前环境复核。 -->`,
      );
    }
    console.log(entry.text.trimEnd());
    console.log();
  }
  return 0;
}


process.exitCode = main();
