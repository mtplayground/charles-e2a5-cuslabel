import { z } from "zod";

export type ServiceName = "api" | "web";

export interface HealthPayload {
  service: ServiceName;
  status: "ok";
  timestamp: string;
}

export function createHealthPayload(service: ServiceName): HealthPayload {
  return {
    service,
    status: "ok",
    timestamp: new Date().toISOString()
  };
}

export interface ProjectDto {
  id: string;
  name: string;
  imageCount: number;
  labelClassCount: number;
  annotationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImageMetadataDto {
  originalName: string;
  mimeType: string;
  size: number;
  imageType?: string;
}

export interface ImageDto {
  id: string;
  projectId: string;
  storageKey: string;
  width: number;
  height: number;
  metadata: ImageMetadataDto;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Project name is required.")
  .max(120, "Project name must be 120 characters or fewer.");

export const projectIdParamsSchema = z.object({
  projectId: z.string().cuid("Project id must be a valid cuid.")
});

export const imageIdParamsSchema = z.object({
  imageId: z.string().cuid("Image id must be a valid cuid.")
});

export const createProjectRequestSchema = z.object({
  name: projectNameSchema
});

export const renameProjectRequestSchema = z.object({
  name: projectNameSchema
});

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type RenameProjectRequest = z.infer<typeof renameProjectRequestSchema>;
