import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { pool } from './db.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

await migrate();
const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`OMBOR PRO ishga tushdi: http://localhost:${config.port}`);
});
startScheduler();

function shutdown() {
  stopScheduler();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
