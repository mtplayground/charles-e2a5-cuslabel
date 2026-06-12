import { Router } from "express";
import { getPrismaClient, type LabelClass } from "@cuslabel/db";
import {
  createLabelClassRequestSchema,
  labelClassIdParamsSchema,
  projectIdParamsSchema,
  updateLabelClassRequestSchema,
  type LabelClassDto
} from "@cuslabel/shared";
import { badRequestFromZod, conflict, notFound } from "./errors.js";

export const labelClassesRouter = Router();

function toLabelClassDto(labelClass: LabelClass): LabelClassDto {
  return {
    id: labelClass.id,
    projectId: labelClass.projectId,
    name: labelClass.name,
    color: labelClass.color,
    createdAt: labelClass.createdAt.toISOString(),
    updatedAt: labelClass.updatedAt.toISOString()
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

labelClassesRouter.get(
  "/projects/:projectId/classes",
  async (req, res, next) => {
    try {
      const params = projectIdParamsSchema.safeParse(req.params);

      if (!params.success) {
        throw badRequestFromZod(params.error);
      }

      const prisma = getPrismaClient();
      const project = await prisma.project.findUnique({
        where: {
          id: params.data.projectId
        }
      });

      if (!project) {
        throw notFound("Project not found.");
      }

      const labelClasses = await prisma.labelClass.findMany({
        where: {
          projectId: project.id
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      res.json({
        classes: labelClasses.map(toLabelClassDto)
      });
    } catch (err) {
      next(err);
    }
  }
);

labelClassesRouter.post(
  "/projects/:projectId/classes",
  async (req, res, next) => {
    try {
      const params = projectIdParamsSchema.safeParse(req.params);
      const body = createLabelClassRequestSchema.safeParse(req.body);

      if (!params.success) {
        throw badRequestFromZod(params.error);
      }

      if (!body.success) {
        throw badRequestFromZod(body.error);
      }

      const prisma = getPrismaClient();
      const project = await prisma.project.findUnique({
        where: {
          id: params.data.projectId
        }
      });

      if (!project) {
        throw notFound("Project not found.");
      }

      try {
        const labelClass = await prisma.$transaction(async (tx) => {
          const created = await tx.labelClass.create({
            data: {
              projectId: project.id,
              name: body.data.name,
              color: body.data.color
            }
          });

          await tx.project.update({
            where: {
              id: project.id
            },
            data: {
              labelClassCount: {
                increment: 1
              }
            }
          });

          return created;
        });

        res.status(201).json({
          class: toLabelClassDto(labelClass)
        });
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          throw conflict("Class name already exists in this project.");
        }

        throw err;
      }
    } catch (err) {
      next(err);
    }
  }
);

labelClassesRouter.patch("/classes/:labelClassId", async (req, res, next) => {
  try {
    const params = labelClassIdParamsSchema.safeParse(req.params);
    const body = updateLabelClassRequestSchema.safeParse(req.body);

    if (!params.success) {
      throw badRequestFromZod(params.error);
    }

    if (!body.success) {
      throw badRequestFromZod(body.error);
    }

    const prisma = getPrismaClient();
    const existing = await prisma.labelClass.findUnique({
      where: {
        id: params.data.labelClassId
      }
    });

    if (!existing) {
      throw notFound("Class not found.");
    }

    try {
      const labelClass = await prisma.labelClass.update({
        where: {
          id: existing.id
        },
        data: {
          name: body.data.name,
          color: body.data.color
        }
      });

      res.json({
        class: toLabelClassDto(labelClass)
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw conflict("Class name already exists in this project.");
      }

      throw err;
    }
  } catch (err) {
    next(err);
  }
});

labelClassesRouter.delete("/classes/:labelClassId", async (req, res, next) => {
  try {
    const params = labelClassIdParamsSchema.safeParse(req.params);

    if (!params.success) {
      throw badRequestFromZod(params.error);
    }

    const prisma = getPrismaClient();
    const existing = await prisma.labelClass.findUnique({
      where: {
        id: params.data.labelClassId
      }
    });

    if (!existing) {
      throw notFound("Class not found.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.labelClass.delete({
        where: {
          id: existing.id
        }
      });

      await tx.project.update({
        where: {
          id: existing.projectId
        },
        data: {
          labelClassCount: {
            decrement: 1
          }
        }
      });
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
