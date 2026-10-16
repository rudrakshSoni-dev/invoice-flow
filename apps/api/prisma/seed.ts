import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../src/demo/demo-seed';
import { loadEnv } from '../src/common/env';
import { createFileStorage } from '../src/storage/storage.module';

/** `prisma db seed`: the demo workspace, with history. Tests seed without history instead. */
async function main(): Promise<void> {
  const env = loadEnv();
  const prisma = new PrismaClient();
  try {
    const counts = await seedDatabase(prisma, {
      fixturesDir: env.FIXTURES_DIR,
      history: { storage: createFileStorage(env, prisma) },
    });
    console.log(
      `Seeded ${counts.vendors} vendors, ${counts.purchaseOrders} purchase orders and ${counts.invoices} past invoices.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
