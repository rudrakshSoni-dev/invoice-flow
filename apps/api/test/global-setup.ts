import { execSync } from 'node:child_process';
import { useTestDatabase } from './test-database';

export default function globalSetup(): void {
  const url = useTestDatabase();
  execSync('prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
}
