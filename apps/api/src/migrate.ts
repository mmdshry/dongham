import { initMysql, mysqlConfig } from './mysql.js';

const cfg = mysqlConfig();
await initMysql();
console.log(`mysql migrations applied on ${cfg.host}:${cfg.port}/${cfg.database}`);
process.exit(0);
