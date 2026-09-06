#!/usr/bin/env node
/** 校验公开仓库不包含个人错题、敏感凭据或真实本机路径。 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { parseNotebook } from "./notebook-parser.mjs";
import { bundledNotebook, skillRoot } from "./notebook-paths.mjs";


const repositoryRoot = path.dirname(skillRoot);
const forbiddenPatterns = new Map([
  ["Windows 用户目录", /[A-Za-z]:\\Users\\(?!<)[^\\\s`]+/u],
  ["本机代码目录", /[A-Za-z]:\\(?:code|workspace)\\[^\s`]+/iu],
  [
    "内网 IPv4 地址",
    /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/u,
  ],
  ["私钥", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ["GitHub Token", /\b(?:gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u],
  ["OpenAI API Key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u],
  ["AWS Access Key", /\bAKIA[0-9A-Z]{16}\b/u],
]);

/** 返回已跟踪文件和未忽略的新文件，供提交前检查。 */
function repositoryFiles() {
  const result = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: repositoryRoot, encoding: "buffer" },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.toString("utf8").trim() || "git ls-files 执行失败");
  }
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((item) => path.join(repositoryRoot, item));
}

/** 尝试按严格 UTF-8 解码；二进制或非 UTF-8 文件返回 null。 */
function readUtf8(pathname) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      fs.readFileSync(pathname),
    );
  } catch {
    return null;
  }
}

/** 执行公开仓库隐私检查。 */
function main() {
  const errors = [];
  const templateText = fs.readFileSync(bundledNotebook, "utf8");
  const { entries: templateEntries } = parseNotebook(templateText);
  if (templateEntries.length > 0) {
    errors.push(
      `公开模板包含 ${templateEntries.length} 条真实经验；请迁移到私有数据文件。`,
    );
  }

  for (const pathname of repositoryFiles()) {
    const text = readUtf8(pathname);
    if (text === null) {
      continue;
    }
    const relativePath = path.relative(repositoryRoot, pathname);
    for (const [patternName, pattern] of forbiddenPatterns) {
      if (pattern.test(text)) {
        errors.push(`${relativePath} 检测到${patternName}。`);
      }
    }
  }

  if (errors.length > 0) {
    console.error("公开仓库校验失败：");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    return 1;
  }
  console.log(
    "公开仓库校验通过：公开模板为空，已跟踪文件未发现高风险凭据或个人绝对路径。",
  );
  return 0;
}


process.exitCode = main();
