#!/usr/bin/env node
/** 从公开空白模板初始化本机私有错题本，绝不覆盖已有数据。 */

import fs from "node:fs";
import path from "node:path";

import {
  bundledNotebook,
  privateNotebookPath,
} from "./notebook-paths.mjs";


/** 创建私有数据文件并输出实际路径。 */
function main() {
  const target = privateNotebookPath();
  if (fs.existsSync(target)) {
    if (!fs.statSync(target).isFile()) {
      console.error(`错误：私有错题本路径不是文件：${target}`);
      return 2;
    }
    console.log(`私有错题本已存在，未覆盖：${target}`);
    return 0;
  }
  if (!fs.existsSync(bundledNotebook) || !fs.statSync(bundledNotebook).isFile()) {
    console.error(`错误：公开模板不存在：${bundledNotebook}`);
    return 2;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.copyFileSync(bundledNotebook, target, fs.constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code === "EEXIST") {
      console.log(`私有错题本已由其他进程创建，未覆盖：${target}`);
      return 0;
    }
    throw error;
  }
  console.log(`私有错题本初始化成功：${target}`);
  return 0;
}


process.exitCode = main();
