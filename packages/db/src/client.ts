import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | undefined;

export function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set to connect to PostgreSQL.");
  }

  return databaseUrl;
}

export function getPrismaClient(): PrismaClient {
  requireDatabaseUrl();

  prisma ??= new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error"]
        : ["query", "warn", "error"]
  });

  return prisma;
}

export async function checkDatabaseConnection(
  client = getPrismaClient()
): Promise<void> {
  await client.$queryRaw`SELECT 1`;
}

export async function disconnectPrisma(): Promise<void> {
  if (!prisma) {
    return;
  }

  await prisma.$disconnect();
  prisma = undefined;
}
