/**
 * Database Reset Script
 * Drops all tables and recreates the entire schema from scratch via FastAPI SQLAlchemy.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
const backendDir = path.join(__dirname, '..', 'backend');

console.log('[Aivora DB] Dropping and recreating all database tables via FastAPI...');

const result = spawnSync(
  pythonCmd,
  [
    '-c',
    "import sys; sys.path.insert(0, '.'); from app.core.database import reset_db; reset_db()",
  ],
  {
    cwd: backendDir,
    stdio: 'inherit',
    env: process.env,
  }
);

if (result.status !== 0) {
  console.error('[Aivora DB Error] Failed to reset database tables. Check DATABASE_URL in backend/.env.');
  process.exit(result.status || 1);
} else {
  console.log('[Aivora DB] All tables recreated cleanly in PostgreSQL.');
}
