import { execSync, spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { PORT_FILE, PID_FILE } from './constants';

export default async function globalSetup(): Promise<void> {
  const rootDir   = path.resolve(__dirname, '../..');
  const serverDir = path.join(rootDir, 'server');
  const clientDir = path.resolve(__dirname, '..');

  console.log('[e2e setup] building server...');
  execSync('npm run build', { cwd: serverDir, stdio: 'pipe' });

  console.log('[e2e setup] building client...');
  execSync('npm run build', { cwd: clientDir, stdio: 'pipe' });

  console.log('[e2e setup] starting server...');
  await new Promise<void>((resolve, reject) => {
    const proc: ChildProcess = spawn('node', [path.join(serverDir, 'dist/index.js')], {
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill();
        reject(new Error('[e2e setup] Server start timed out after 30s'));
      }
    }, 30_000);

    function finishOk(port: number): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fs.writeFileSync(PORT_FILE, port.toString(), 'utf-8');
      fs.writeFileSync(PID_FILE, String(proc.pid), 'utf-8');
      console.log(`[e2e setup] server ready on port ${port}`);
      resolve();
    }

    function finishErr(err: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      proc.kill();
      reject(err);
    }

    proc.stdout!.on('data', (chunk: Buffer) => {
      const text  = chunk.toString();
      const match = /running on port (\d+)/.exec(text);
      if (match) finishOk(parseInt(match[1], 10));
    });

    proc.stderr!.on('data', (chunk: Buffer) => {
      finishErr(new Error(`[e2e setup] server stderr: ${chunk.toString()}`));
    });

    proc.on('error', finishErr);
  });
}
