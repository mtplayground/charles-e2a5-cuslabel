import { Router } from "express";
import { getPrismaClient, type Annotation, type Prisma } from "@cuslabel/db";
import {
  annotationIdParamsSchema,
  boxAnnotationGeometrySchema,
  createAnnotationRequestSchema,
  imageIdParamsSchema,
  polylineAnnotationGeometrySchema,
  updateAnnotationRequestSchema,
  type AnnotationDto,
  type AnnotationGeometryDto,
  type AnnotationTypeDto
} from "@cuslabel/shared";
import { badRequestFromZod, notFound } from "./errors.js";

export const annotationsRouter = Router();

function parseAnnotationGeometry(
  type: AnnotationTypeDto,
  value: unknown
): AnnotationGeometryDto {
  if (type === "BOX") {
    return boxAnnotationGeometrySchema.parse(value);
  }

  return polylineAnnotationGeometrySchema.parse(value);
}

function toPrismaJsonObject(
  geometry: AnnotationGeometryDto
): Prisma.InputJsonObject {
  return geometry as unknown as Prisma.InputJsonObject;
}

function toAnnotationDto(annotation: Annotation): AnnotationDto {
  const type = annotation.type as AnnotationTypeDto;

  return {
    id: annotation.id,
    projectId: annotation.projectId,
    imageId: annotation.imageId,
    labelClassId: annotation.labelClassId,
    type,
    geometry: parseAnnotationGeometry(type, annotation.geometry),
    createdAt: annotation.createdAt.toISOString(),
    updatedAt: annotation.updatedAt.toISOString()
  };
}

async function ensureLabelClassInProject(
  labelClassId: string,
  projectId: string
): Promise<void> {
  const labelClass = await getPrismaClient().labelClass.findFirst({
    where: {
      id: labelClassId,
      projectId
    },
    select: {
      id: true
    }
  });

  if (!labelClass) {
    throw notFound("Class not found in this project.");
  }
}

annotationsRouter.get(
  "/images/:imageId/annotations",
  async (req, res, next) => {
    try {
      const params = imageIdParamsSchema.safeParse(req.params);

      if (!params.success) {
        throw badRequestFromZod(params.error);
      }

      const prisma = getPrismaClient();
      const image = await prisma.image.findUnique({
        where: {
          id: params.data.imageId
        },
        select: {
          id: true
        }
      });

      if (!image) {
        throw notFound("Image not found.");
      }

      const annotations = await prisma.annotation.findMany({
        where: {
          imageId: image.id
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      res.json({
        annotations: annotations.map(toAnnotationDto)
      });
    } catch (err) {
      next(err);
    }
  }
);

annotationsRouter.post(
  "/images/:imageId/annotations",
  async (req, res, next) => {
    try {
      const params = imageIdParamsSchema.safeParse(req.params);
      const body = createAnnotationRequestSchema.safeParse(req.body);

      if (!params.success) {
        throw badRequestFromZod(params.error);
      }

      if (!body.success) {
        throw badRequestFromZod(body.error);
      }

      const prisma = getPrismaClient();
      const image = await prisma.image.findUnique({
        where: {
          id: params.data.imageId
        },
        select: {
          id: true,
          projectId: true
        }
      });

      if (!image) {
        throw notFound("Image not found.");
      }

      await ensureLabelClassInProject(body.data.labelClassId, image.projectId);

      const annotation = await prisma.$transaction(async (tx) => {
        const created = await tx.annotation.create({
          data: {
            projectId: image.projectId,
            imageId: image.id,
            labelClassId: body.data.labelClassId,
            type: body.data.type,
            geometry: toPrismaJsonObject(body.data.geometry)
          }
        });

        await tx.project.update({
          where: {
            id: image.projectId
          },
          data: {
            annotationCount: {
              increment: 1
            }
          }
        });

        return created;
      });

      res.status(201).json({
        annotation: toAnnotationDto(annotation)
      });
    } catch (err) {
      next(err);
    }
  }
);

annotationsRouter.patch(
  "/annotations/:annotationId",
  async (req, res, next) => {
    try {
      const params = annotationIdParamsSchema.safeParse(req.params);
      const body = updateAnnotationRequestSchema.safeParse(req.body);

      if (!params.success) {
        throw badRequestFromZod(params.error);
      }

      if (!body.success) {
        throw badRequestFromZod(body.error);
      }

      const prisma = getPrismaClient();
      const existing = await prisma.annotation.findUnique({
        where: {
          id: params.data.annotationId
        }
      });

      if (!existing) {
        throw notFound("Annotation not found.");
      }

      await ensureLabelClassInProject(
        body.data.labelClassId,
        existing.projectId
      );

      const annotation = await prisma.annotation.update({
        where: {
          id: existing.id
        },
        data: {
          labelClassId: body.data.labelClassId,
          type: body.data.type,
          geometry: toPrismaJsonObject(body.data.geometry)
        }
      });

      res.json({
        annotation: toAnnotationDto(annotation)
      });
    } catch (err) {
      next(err);
    }
  }
);

annotationsRouter.delete(
  "/annotations/:annotationId",
  async (req, res, next) => {
    try {
      const params = annotationIdParamsSchema.safeParse(req.params);

      if (!params.success) {
        throw badRequestFromZod(params.error);
      }

      const prisma = getPrismaClient();
      const existing = await prisma.annotation.findUnique({
        where: {
          id: params.data.annotationId
        }
      });

      if (!existing) {
        throw notFound("Annotation not found.");
      }

      await prisma.$transaction(async (tx) => {
        await tx.annotation.delete({
          where: {
            id: existing.id
          }
        });

        await tx.project.update({
          where: {
            id: existing.projectId
          },
          data: {
            annotationCount: {
              decrement: 1
            }
          }
        });
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);
