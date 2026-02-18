import { execSync, spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const PORT_FILE = path.join(os.tmpdir(), 'mafia-test-server-port.txt');
export const PID_FILE = path.join(os.tmpdir(), 'mafia-test-server-pid.txt');

export default async function globalSetup(): Promise<void> {
  const serverDir = path.resolve(__dirname, '../../server');

  // Build server so we have a compiled dist/index.js
  execSync('npm run build', { cwd: serverDir, stdio: 'pipe' });

  await new Promise<void>((resolve, reject) => {
    const proc: ChildProcess = spawn('node', [path.join(serverDir, 'dist/index.js')], {
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });

    let resolved = false;
    const startupTimeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        reject(new Error('Server start timed out after 10s'));
      }
    }, 10000);

    function finishOk(port: number): void {
      if (resolved) return;
      resolved = true;
      clearTimeout(startupTimeout);
      // Write port and PID to temp files so test workers can read them
      fs.writeFileSync(PORT_FILE, port.toString(), 'utf-8');
      fs.writeFileSync(PID_FILE, String(proc.pid), 'utf-8');
      resolve();
    }

    function finishErr(err: Error): void {
      if (resolved) return;
      resolved = true;
      clearTimeout(startupTimeout);
      proc.kill();
      reject(err);
    }

    proc.stdout!.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const match = /running on port (\d+)/.exec(text);
      if (match) {
        finishOk(parseInt(match[1], 10));
      }
    });

    proc.stderr!.on('data', (chunk: Buffer) => {
      finishErr(new Error(`Server failed to start: ${chunk.toString()}`));
    });

    proc.on('error', (err: Error) => {
      finishErr(err);
    });
  });
}
