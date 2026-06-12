export {
  checkDatabaseConnection,
  disconnectPrisma,
  getPrismaClient,
  requireDatabaseUrl
} from "./client.js";
export type { Image, Prisma, Project } from "@prisma/client";
