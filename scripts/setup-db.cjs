/**
 * Database Migration Script
 * Delegates database schema initialization and migrations exclusively to the FastAPI backend
 * via SQLAlchemy, ensuring all DB operations are managed by FastAPI.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
const backendDir = path.join(__dirname, '..', 'backend');

console.log('[Aivora DB] Initializing PostgreSQL database tables via FastAPI backend...');

const result = spawnSync(
  pythonCmd,
  [
    '-c',
    "import sys; sys.path.insert(0, '.'); from app.core.database import init_db; init_db(); print('✔ PostgreSQL tables initialized successfully by FastAPI backend.')",
  ],
  {
    cwd: backendDir,
    stdio: 'inherit',
    env: process.env,
  }
);

if (result.status !== 0) {
  console.warn('[Aivora DB Notice] FastAPI DB migration finished with code:', result.status);
} else {
  console.log('[Aivora DB] Database initialization completed.');
}
