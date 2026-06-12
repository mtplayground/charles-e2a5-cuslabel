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

export interface LabelClassDto {
  id: string;
  projectId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export type AnnotationTypeDto = "BOX" | "POLYLINE";

export interface BoxAnnotationGeometryDto {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolylinePointDto {
  x: number;
  y: number;
}

export interface PolylineAnnotationGeometryDto {
  points: PolylinePointDto[];
}

export type AnnotationGeometryDto =
  | BoxAnnotationGeometryDto
  | PolylineAnnotationGeometryDto;

export interface AnnotationDto {
  id: string;
  projectId: string;
  imageId: string;
  labelClassId: string;
  type: AnnotationTypeDto;
  geometry: AnnotationGeometryDto;
  createdAt: string;
  updatedAt: string;
}

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Project name is required.")
  .max(120, "Project name must be 120 characters or fewer.");

export const labelClassNameSchema = z
  .string()
  .trim()
  .min(1, "Class name is required.")
  .max(80, "Class name must be 80 characters or fewer.");

export const labelClassColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Class color must be a hex color.");

export const projectIdParamsSchema = z.object({
  projectId: z.string().cuid("Project id must be a valid cuid.")
});

export const imageIdParamsSchema = z.object({
  imageId: z.string().cuid("Image id must be a valid cuid.")
});

export const labelClassIdParamsSchema = z.object({
  labelClassId: z.string().cuid("Class id must be a valid cuid.")
});

export const annotationIdParamsSchema = z.object({
  annotationId: z.string().cuid("Annotation id must be a valid cuid.")
});

const annotationCoordinateSchema = z
  .number()
  .finite("Annotation coordinate must be a finite number.")
  .min(0, "Annotation coordinate must be zero or greater.");

const annotationSizeSchema = z
  .number()
  .finite("Annotation size must be a finite number.")
  .positive("Annotation size must be greater than zero.");

export const boxAnnotationGeometrySchema = z.object({
  x: annotationCoordinateSchema,
  y: annotationCoordinateSchema,
  width: annotationSizeSchema,
  height: annotationSizeSchema
});

export const polylinePointSchema = z.object({
  x: annotationCoordinateSchema,
  y: annotationCoordinateSchema
});

export const polylineAnnotationGeometrySchema = z.object({
  points: z
    .array(polylinePointSchema)
    .min(2, "Polyline annotations require at least two points.")
});

export const createProjectRequestSchema = z.object({
  name: projectNameSchema
});

export const renameProjectRequestSchema = z.object({
  name: projectNameSchema
});

export const createLabelClassRequestSchema = z.object({
  name: labelClassNameSchema,
  color: labelClassColorSchema
});

export const updateLabelClassRequestSchema = z
  .object({
    name: labelClassNameSchema.optional(),
    color: labelClassColorSchema.optional()
  })
  .refine((value) => value.name !== undefined || value.color !== undefined, {
    message: "Class name or color is required."
  });

export const createAnnotationRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("BOX"),
    labelClassId: z.string().cuid("Class id must be a valid cuid."),
    geometry: boxAnnotationGeometrySchema
  }),
  z.object({
    type: z.literal("POLYLINE"),
    labelClassId: z.string().cuid("Class id must be a valid cuid."),
    geometry: polylineAnnotationGeometrySchema
  })
]);

export const updateAnnotationRequestSchema = createAnnotationRequestSchema;

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type RenameProjectRequest = z.infer<typeof renameProjectRequestSchema>;
export type CreateLabelClassRequest = z.infer<
  typeof createLabelClassRequestSchema
>;
export type UpdateLabelClassRequest = z.infer<
  typeof updateLabelClassRequestSchema
>;
export type CreateAnnotationRequest = z.infer<
  typeof createAnnotationRequestSchema
>;
export type UpdateAnnotationRequest = z.infer<
  typeof updateAnnotationRequestSchema
>;
