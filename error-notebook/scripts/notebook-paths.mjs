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

/** 确保私有错题本存在；只在目标不存在时复制公开空白模板。 */
export function initializePrivateNotebook(environment = process.env) {
  const privatePath = privateNotebookPath(environment);
  if (fs.existsSync(privatePath)) {
    if (!fs.statSync(privatePath).isFile()) {
      throw new Error(`私有错题本路径不是文件：${privatePath}`);
    }
    return { path: privatePath, created: false };
  }
  if (!fs.existsSync(bundledNotebook) || !fs.statSync(bundledNotebook).isFile()) {
    throw new Error(`公开模板不存在：${bundledNotebook}`);
  }

  fs.mkdirSync(path.dirname(privatePath), { recursive: true });
  try {
    fs.copyFileSync(
      bundledNotebook,
      privatePath,
      fs.constants.COPYFILE_EXCL,
    );
    return { path: privatePath, created: true };
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
  if (!fs.statSync(privatePath).isFile()) {
    throw new Error(`私有错题本路径不是文件：${privatePath}`);
  }
  return { path: privatePath, created: false };
}

/** 返回私有错题本路径，首次默认运行时自动完成安全初始化。 */
export function activeNotebookPath(environment = process.env) {
  return initializePrivateNotebook(environment).path;
}
