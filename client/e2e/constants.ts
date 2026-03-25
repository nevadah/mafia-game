import path from 'path';
import os from 'os';

export const PORT_FILE = path.join(os.tmpdir(), 'mafia-e2e-server-port.txt');
export const PID_FILE  = path.join(os.tmpdir(), 'mafia-e2e-server-pid.txt');
