export {
  checkDatabaseConnection,
  disconnectPrisma,
  getPrismaClient,
  requireDatabaseUrl
} from "./client.js";
export type { Image, LabelClass, Prisma, Project } from "@prisma/client";
