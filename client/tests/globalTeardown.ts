import fs from 'fs';
import { PID_FILE, PORT_FILE } from './globalSetup';

export default async function globalTeardown(): Promise<void> {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'), 10);
    if (!isNaN(pid)) {
      process.kill(pid, 'SIGTERM');
      // Give the process time to exit
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    }
  } catch {
    // Process may have already exited
  }

  // Clean up temp files
  for (const f of [PID_FILE, PORT_FILE]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
}
