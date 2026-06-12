import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { imageSize } from "image-size";
import multer from "multer";
import { getPrismaClient, type Image, type Prisma } from "@cuslabel/db";
import {
  imageIdParamsSchema,
  projectIdParamsSchema,
  type ImageDto,
  type ImageMetadataDto
} from "@cuslabel/shared";
import {
  createPresignedGetUrl,
  deleteObject,
  putObject
} from "@cuslabel/storage";
import { badRequestFromZod, HttpError, notFound } from "./errors.js";

const maxImageFiles = 50;
const maxImageSizeBytes = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxImageSizeBytes,
    files: maxImageFiles
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new HttpError(400, "Only image uploads are supported."));
      return;
    }

    callback(null, true);
  }
});

export const imagesRouter = Router();

function sanitizeFilename(filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return sanitized || "image";
}

function buildImageRelativeKey(projectId: string, filename: string): string {
  return `projects/${projectId}/images/${crypto.randomUUID()}-${sanitizeFilename(
    filename
  )}`;
}

function normalizeMulterError(error: unknown): unknown {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof multer.MulterError) {
    return new HttpError(400, error.message);
  }

  return error;
}

function readImagesFromMultipart(
  req: Request,
  res: Response
): Promise<Express.Multer.File[]> {
  const middleware = upload.array("images", maxImageFiles);

  return new Promise((resolve, reject) => {
    middleware(req, res, (error) => {
      if (error) {
        reject(normalizeMulterError(error));
        return;
      }

      const files = req.files;
      resolve(Array.isArray(files) ? files : []);
    });
  });
}

function parseMetadata(value: unknown): ImageMetadataDto {
  if (
    value &&
    typeof value === "object" &&
    "originalName" in value &&
    "mimeType" in value &&
    "size" in value
  ) {
    const metadata = value as ImageMetadataDto;
    return {
      originalName: metadata.originalName,
      mimeType: metadata.mimeType,
      size: metadata.size,
      imageType: metadata.imageType
    };
  }

  return {
    originalName: "image",
    mimeType: "application/octet-stream",
    size: 0
  };
}

async function toImageDto(image: Image): Promise<ImageDto> {
  return {
    id: image.id,
    projectId: image.projectId,
    storageKey: image.storageKey,
    width: image.width,
    height: image.height,
    metadata: parseMetadata(image.metadata),
    url: await createPresignedGetUrl(image.storageKey),
    createdAt: image.createdAt.toISOString(),
    updatedAt: image.updatedAt.toISOString()
  };
}

async function toImageDtos(images: Image[]): Promise<ImageDto[]> {
  return Promise.all(images.map(toImageDto));
}

imagesRouter.get("/projects/:projectId/images", async (req, res, next) => {
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

    const images = await prisma.image.findMany({
      where: {
        projectId: project.id
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json({
      images: await toImageDtos(images)
    });
  } catch (err) {
    next(err);
  }
});

imagesRouter.post("/projects/:projectId/images", async (req, res, next) => {
  const uploadedKeys: string[] = [];

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

    const files = await readImagesFromMultipart(req, res);

    if (files.length === 0) {
      throw new HttpError(400, "At least one image file is required.");
    }

    const preparedImages = files.map((file) => {
      const dimensions = imageSize(file.buffer);

      if (!dimensions.width || !dimensions.height) {
        throw new HttpError(400, `${file.originalname} is not a valid image.`);
      }

      return {
        relativeKey: buildImageRelativeKey(project.id, file.originalname),
        file,
        width: dimensions.width,
        height: dimensions.height,
        imageType: dimensions.type
      };
    });

    for (const image of preparedImages) {
      await putObject({
        relativeKey: image.relativeKey,
        body: image.file.buffer,
        contentLength: image.file.buffer.byteLength,
        contentType: image.file.mimetype
      });
      uploadedKeys.push(image.relativeKey);
    }

    const images = await prisma.$transaction(async (tx) => {
      const createdImages: Image[] = [];

      for (const image of preparedImages) {
        const metadata = {
          originalName: image.file.originalname,
          mimeType: image.file.mimetype,
          size: image.file.size,
          ...(image.imageType ? { imageType: image.imageType } : {})
        } satisfies Prisma.InputJsonObject;

        const created = await tx.image.create({
          data: {
            projectId: project.id,
            storageKey: image.relativeKey,
            width: image.width,
            height: image.height,
            metadata
          }
        });
        createdImages.push(created);
      }

      await tx.project.update({
        where: {
          id: project.id
        },
        data: {
          imageCount: {
            increment: createdImages.length
          }
        }
      });

      return createdImages;
    });

    res.status(201).json({
      images: await toImageDtos(images)
    });
  } catch (err) {
    await Promise.allSettled(uploadedKeys.map((key) => deleteObject(key)));
    next(err);
  }
});

imagesRouter.get("/images/:imageId", async (req, res, next) => {
  try {
    const params = imageIdParamsSchema.safeParse(req.params);

    if (!params.success) {
      throw badRequestFromZod(params.error);
    }

    const image = await getPrismaClient().image.findUnique({
      where: {
        id: params.data.imageId
      }
    });

    if (!image) {
      throw notFound("Image not found.");
    }

    res.json({
      image: await toImageDto(image)
    });
  } catch (err) {
    next(err);
  }
});

imagesRouter.get("/images/:imageId/file", async (req, res, next) => {
  try {
    const params = imageIdParamsSchema.safeParse(req.params);

    if (!params.success) {
      throw badRequestFromZod(params.error);
    }

    const image = await getPrismaClient().image.findUnique({
      where: {
        id: params.data.imageId
      }
    });

    if (!image) {
      throw notFound("Image not found.");
    }

    res.redirect(302, await createPresignedGetUrl(image.storageKey));
  } catch (err) {
    next(err);
  }
});
