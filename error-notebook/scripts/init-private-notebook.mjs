#!/usr/bin/env node
/** 从公开空白模板初始化本机私有错题本，绝不覆盖已有数据。 */

import { initializePrivateNotebook } from "./notebook-paths.mjs";


/** 创建私有数据文件并输出实际路径。 */
function main() {
  try {
    const result = initializePrivateNotebook();
    console.log(
      result.created
        ? `私有错题本初始化成功：${result.path}`
        : `私有错题本已存在，未覆盖：${result.path}`,
    );
    return 0;
  } catch (error) {
    console.error(`错误：${error.message}`);
    return 2;
  }
}


process.exitCode = main();
