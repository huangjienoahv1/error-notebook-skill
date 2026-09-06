#!/usr/bin/env node
/** 解析公开模板与本机私有错题本路径。 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";


const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export const skillRoot = path.resolve(scriptDirectory, "..");
export const bundledNotebook = path.join(
  skillRoot,
  "references",
  "error-notebook.md",
);
export const defaultPrivateNotebook = path.join(
  os.homedir(),
  ".codex",
  "error-notebook-data",
  "error-notebook.md",
);
export const notebookPathEnvironmentVariable = "CODEX_ERROR_NOTEBOOK_PATH";

/** 展开当前用户主目录缩写，其他路径保持原值。 */
function expandHome(pathname) {
  if (pathname === "~") {
    return os.homedir();
  }
  if (pathname.startsWith("~/") || pathname.startsWith("~\\")) {
    return path.join(os.homedir(), pathname.slice(2));
  }
  return pathname;
}

/** 返回环境变量覆盖后的本机私有错题本路径。 */
export function privateNotebookPath(environment = process.env) {
  const configuredPath = environment[notebookPathEnvironmentVariable];
  return configuredPath
    ? path.resolve(expandHome(configuredPath))
    : defaultPrivateNotebook;
}

/** 优先返回私有错题本；尚未初始化时返回公开空白模板。 */
export function activeNotebookPath(environment = process.env) {
  const privatePath = privateNotebookPath(environment);
  if (
    fs.existsSync(privatePath)
    || environment[notebookPathEnvironmentVariable]
  ) {
    return privatePath;
  }
  return bundledNotebook;
}
