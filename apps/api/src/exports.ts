import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import { projectIdParamsSchema } from "@cuslabel/shared";
import { generateCocoExport } from "./cocoExport.js";
import { badRequestFromZod } from "./errors.js";

export const exportsRouter = Router();

function toAttachmentFilename(projectId: string): string {
  return `project-${projectId}-coco.json`;
}

function toDownloadBuffer(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

exportsRouter.get(
  "/projects/:projectId/exports/coco",
  async (req, res, next) => {
    try {
      const params = projectIdParamsSchema.safeParse(req.params);

      if (!params.success) {
        throw badRequestFromZod(params.error);
      }

      const cocoExport = await generateCocoExport(params.data.projectId);
      const body = toDownloadBuffer(cocoExport);

      res.status(200);
      res.type("application/json");
      res.attachment(toAttachmentFilename(params.data.projectId));
      res.setHeader("Content-Length", body.byteLength.toString());
      await pipeline(Readable.from([body]), res);
    } catch (err) {
      next(err);
    }
  }
);
