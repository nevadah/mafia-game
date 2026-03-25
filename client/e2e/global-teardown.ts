import fs from 'fs';
import { PORT_FILE, PID_FILE } from './constants';

export default async function globalTeardown(): Promise<void> {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'), 10);
    if (!isNaN(pid)) {
      process.kill(pid, 'SIGTERM');
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    }
  } catch {
    // Process may have already exited — ignore.
  }

  for (const f of [PORT_FILE, PID_FILE]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
}
