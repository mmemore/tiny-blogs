/**
 * TypeORM CLI 入口（`typeorm migration:run -d src/database/data-source.cli.ts`）。
 *
 * 单独成文件的原因：应用运行时只 import `createDataSourceOptions`，
 * 不应该因为 import 一个工具函数就触发"读 .env + 校验 + 建 DataSource"的副作用。
 */
import { DataSource } from 'typeorm';
import { loadEnvFile } from '../config/dotenv';
import { readApiEnv } from '../config/env';
import { createDataSourceOptions } from './data-source';

loadEnvFile();

export default new DataSource(createDataSourceOptions(readApiEnv()));
