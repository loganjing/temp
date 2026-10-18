#!/usr/bin/env node
/**
 * Land 服务启动入口（架构基线第 5 节 / 修复项 F-T01-ARTIFACT-02）。
 * 职责：装载工作区 .env → 切换到 app/land 应用包工作目录（使 DB_PATH、附件目录与
 * dist 构建产物的相对路径按包根解析）→ 装配并启动 Hono 服务端（API + 前端托管）。
 * 常规启动：npm start（生产，先 npm run build）；开发：npm run dev。
 */
import 'dotenv/config'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(here, '../app/land')
process.chdir(appRoot)
// ESM 相对导入按 importer URL 解析、不随 process.chdir 变化，必须用绝对 file URL 装载包内入口。
await import(pathToFileURL(path.join(appRoot, 'src/server/index.ts')).href)
