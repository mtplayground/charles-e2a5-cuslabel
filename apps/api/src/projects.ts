import { Router } from "express";
import { getPrismaClient, type Project } from "@cuslabel/db";
import {
  createProjectRequestSchema,
  projectIdParamsSchema,
  renameProjectRequestSchema,
  type ProjectDto
} from "@cuslabel/shared";
import { deleteObject } from "@cuslabel/storage";
import { badRequestFromZod, notFound } from "./errors.js";

export const projectsRouter = Router();

function toProjectDto(project: Project): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    imageCount: project.imageCount,
    labelClassCount: project.labelClassCount,
    annotationCount: project.annotationCount,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  };
}

projectsRouter.get("/", async (_req, res, next) => {
  try {
    const projects = await getPrismaClient().project.findMany({
      orderBy: {
        updatedAt: "desc"
      }
    });

    res.json({
      projects: projects.map(toProjectDto)
    });
  } catch (err) {
    next(err);
  }
});

projectsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = createProjectRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      throw badRequestFromZod(parsed.error);
    }

    const project = await getPrismaClient().project.create({
      data: {
        name: parsed.data.name
      }
    });

    res.status(201).json({
      project: toProjectDto(project)
    });
  } catch (err) {
    next(err);
  }
});

projectsRouter.patch("/:projectId", async (req, res, next) => {
  try {
    const params = projectIdParamsSchema.safeParse(req.params);
    const body = renameProjectRequestSchema.safeParse(req.body);

    if (!params.success) {
      throw badRequestFromZod(params.error);
    }

    if (!body.success) {
      throw badRequestFromZod(body.error);
    }

    const prisma = getPrismaClient();
    const existing = await prisma.project.findUnique({
      where: {
        id: params.data.projectId
      }
    });

    if (!existing) {
      throw notFound("Project not found.");
    }

    const project = await prisma.project.update({
      where: {
        id: params.data.projectId
      },
      data: {
        name: body.data.name
      }
    });

    res.json({
      project: toProjectDto(project)
    });
  } catch (err) {
    next(err);
  }
});

projectsRouter.delete("/:projectId", async (req, res, next) => {
  try {
    const params = projectIdParamsSchema.safeParse(req.params);

    if (!params.success) {
      throw badRequestFromZod(params.error);
    }

    const prisma = getPrismaClient();
    const existing = await prisma.project.findUnique({
      where: {
        id: params.data.projectId
      }
    });

    if (!existing) {
      throw notFound("Project not found.");
    }

    const images = await prisma.image.findMany({
      where: {
        projectId: params.data.projectId
      },
      select: {
        storageKey: true
      }
    });

    await Promise.all(images.map((image) => deleteObject(image.storageKey)));

    await prisma.project.delete({
      where: {
        id: params.data.projectId
      }
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
