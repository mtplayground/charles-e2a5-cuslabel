export {
  checkDatabaseConnection,
  disconnectPrisma,
  getPrismaClient,
  requireDatabaseUrl
} from "./client.js";
export type { Image, Project } from "@prisma/client";
