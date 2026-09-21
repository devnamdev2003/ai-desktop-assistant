const { spawn } = require('child_process');
const path = require('path');

console.log('\x1b[36m%s\x1b[0m', '⚡ [Aivora] Starting Backend & Database Bridge on port 8000...');
const backendProc = spawn(process.execPath, [path.join(__dirname, 'oauth-server.cjs')], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

backendProc.on('error', (err) => {
  console.warn('[Aivora Backend Notice]:', err.message);
});

console.log('\x1b[35m%s\x1b[0m', '⚡ [Aivora] Starting Angular Frontend on port 3000...');
const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';
const frontendProc = spawn(
  npxCmd,
  ['ng', 'serve', '--host', '0.0.0.0', '--port', '3000', '--proxy-config', 'proxy.conf.json'],
  {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  }
);

frontendProc.on('exit', (code) => {
  try { backendProc.kill(); } catch (e) {}
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  try { backendProc.kill(); } catch (e) {}
  try { frontendProc.kill(); } catch (e) {}
  process.exit(0);
});

process.on('SIGTERM', () => {
  try { backendProc.kill(); } catch (e) {}
  try { frontendProc.kill(); } catch (e) {}
  process.exit(0);
});
