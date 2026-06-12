import { Router } from "express";
import { projectIdParamsSchema } from "@cuslabel/shared";
import { generateCocoExport } from "./cocoExport.js";
import { badRequestFromZod } from "./errors.js";

export const exportsRouter = Router();

function toAttachmentFilename(projectId: string): string {
  return `project-${projectId}-coco.json`;
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

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${toAttachmentFilename(params.data.projectId)}"`
      );
      res.json(cocoExport);
    } catch (err) {
      next(err);
    }
  }
);
