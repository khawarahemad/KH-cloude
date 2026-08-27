import { spawn } from 'child_process';
import { Logger } from '@nestjs/common';

const logger = new Logger('DockerCmd');

export async function runDockerCmd(args: string[], stdinStr?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    logger.debug(`Executing: docker ${args.join(' ')}`);
    const child = spawn('docker', args);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => (stdout += data.toString()));
    child.stderr.on('data', (data) => (stderr += data.toString()));

    if (stdinStr) {
      child.stdin.write(stdinStr);
      child.stdin.end();
    }

    child.on('close', (code) => {
      resolve({ code: code || 0, stdout, stderr });
    });
    
    child.on('error', (err) => {
      logger.error(`Docker command failed to spawn: ${err.message}`);
      resolve({ code: 1, stdout: '', stderr: err.message });
    });
  });
}
