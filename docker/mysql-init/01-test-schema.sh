#!/bin/bash
# 首次初始化 MySQL 数据卷时执行（compose.dev.yml 把它挂到 /docker-entrypoint-initdb.d）。
#
# 作用：为 supertest 集成测试准备一个独立 schema。
# 测试需要一个和生产库同构、但可以随意清空的库；用同一个数据库会让 `TRUNCATE`
# 直接影响开发数据，所以这里单独建 tiny_blogs_test 并把权限授给应用账号。
set -euo pipefail

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
  CREATE DATABASE IF NOT EXISTS \`tiny_blogs_test\`
    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  GRANT ALL PRIVILEGES ON \`tiny_blogs_test\`.* TO '${MYSQL_USER}'@'%';
  FLUSH PRIVILEGES;
EOSQL

echo "[init] tiny_blogs_test created and granted to ${MYSQL_USER}"
