import {
  getPrismaClient,
  type Annotation,
  type Image,
  type LabelClass,
  type Project
} from "@cuslabel/db";
import {
  boxAnnotationGeometrySchema,
  polylineAnnotationGeometrySchema,
  type BoxAnnotationGeometryDto,
  type PolylinePointDto
} from "@cuslabel/shared";
import { notFound } from "./errors.js";

interface CocoInfo {
  year: number;
  version: string;
  description: string;
  contributor: string;
  date_created: string;
}

interface CocoImage {
  id: number;
  width: number;
  height: number;
  file_name: string;
  date_captured: string;
  source_id: string;
  storage_key: string;
}

interface CocoCategory {
  id: number;
  name: string;
  supercategory: string;
  color: string;
  source_id: string;
}

interface CocoAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number];
  area: number;
  segmentation: number[][];
  iscrowd: 0;
  type: "box" | "polyline";
  source_id: string;
  points?: number[];
}

export interface CocoDataset {
  info: CocoInfo;
  licenses: [];
  images: CocoImage[];
  categories: CocoCategory[];
  annotations: CocoAnnotation[];
}

interface ImageMetadata {
  originalName?: unknown;
}

interface ProjectForExport extends Project {
  images: Image[];
  labelClasses: LabelClass[];
  annotations: Annotation[];
}

const cocoVersion = "1.0";

function toFileName(image: Image): string {
  const metadata =
    image.metadata && typeof image.metadata === "object"
      ? (image.metadata as ImageMetadata)
      : {};

  if (
    typeof metadata.originalName === "string" &&
    metadata.originalName.trim().length > 0
  ) {
    return metadata.originalName;
  }

  return image.storageKey.split("/").pop() ?? image.id;
}

function flattenPoints(points: PolylinePointDto[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

function boxToSegmentation(geometry: BoxAnnotationGeometryDto): number[] {
  const x2 = geometry.x + geometry.width;
  const y2 = geometry.y + geometry.height;

  return [geometry.x, geometry.y, x2, geometry.y, x2, y2, geometry.x, y2];
}

function bboxFromPoints(
  points: PolylinePointDto[]
): [number, number, number, number] {
  const firstPoint = points[0];

  if (!firstPoint) {
    return [0, 0, 0, 0];
  }

  let minX = firstPoint.x;
  let minY = firstPoint.y;
  let maxX = firstPoint.x;
  let maxY = firstPoint.y;

  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return [minX, minY, maxX - minX, maxY - minY];
}

function toCocoImages(images: Image[]): {
  cocoImages: CocoImage[];
  imageIdBySourceId: Map<string, number>;
} {
  const imageIdBySourceId = new Map<string, number>();
  const cocoImages = images.map((image, index) => {
    const id = index + 1;
    imageIdBySourceId.set(image.id, id);

    return {
      id,
      width: image.width,
      height: image.height,
      file_name: toFileName(image),
      date_captured: image.createdAt.toISOString(),
      source_id: image.id,
      storage_key: image.storageKey
    };
  });

  return { cocoImages, imageIdBySourceId };
}

function toCocoCategories(labelClasses: LabelClass[]): {
  cocoCategories: CocoCategory[];
  categoryIdBySourceId: Map<string, number>;
} {
  const categoryIdBySourceId = new Map<string, number>();
  const cocoCategories = labelClasses.map((labelClass, index) => {
    const id = index + 1;
    categoryIdBySourceId.set(labelClass.id, id);

    return {
      id,
      name: labelClass.name,
      supercategory: "label",
      color: labelClass.color,
      source_id: labelClass.id
    };
  });

  return { cocoCategories, categoryIdBySourceId };
}

function toCocoAnnotation(
  annotation: Annotation,
  id: number,
  imageIdBySourceId: Map<string, number>,
  categoryIdBySourceId: Map<string, number>
): CocoAnnotation | null {
  const imageId = imageIdBySourceId.get(annotation.imageId);
  const categoryId = categoryIdBySourceId.get(annotation.labelClassId);

  if (!imageId || !categoryId) {
    return null;
  }

  if (annotation.type === "BOX") {
    const geometry = boxAnnotationGeometrySchema.parse(annotation.geometry);

    return {
      id,
      image_id: imageId,
      category_id: categoryId,
      bbox: [geometry.x, geometry.y, geometry.width, geometry.height],
      area: geometry.width * geometry.height,
      segmentation: [boxToSegmentation(geometry)],
      iscrowd: 0,
      type: "box",
      source_id: annotation.id
    };
  }

  const geometry = polylineAnnotationGeometrySchema.parse(annotation.geometry);
  const points = flattenPoints(geometry.points);

  return {
    id,
    image_id: imageId,
    category_id: categoryId,
    bbox: bboxFromPoints(geometry.points),
    area: 0,
    segmentation: [points],
    iscrowd: 0,
    type: "polyline",
    source_id: annotation.id,
    points
  };
}

function toCocoAnnotations(
  annotations: Annotation[],
  imageIdBySourceId: Map<string, number>,
  categoryIdBySourceId: Map<string, number>
): CocoAnnotation[] {
  const cocoAnnotations: CocoAnnotation[] = [];

  for (const annotation of annotations) {
    const cocoAnnotation = toCocoAnnotation(
      annotation,
      cocoAnnotations.length + 1,
      imageIdBySourceId,
      categoryIdBySourceId
    );

    if (cocoAnnotation) {
      cocoAnnotations.push(cocoAnnotation);
    }
  }

  return cocoAnnotations;
}

function toCocoDataset(project: ProjectForExport): CocoDataset {
  const { cocoImages, imageIdBySourceId } = toCocoImages(project.images);
  const { cocoCategories, categoryIdBySourceId } = toCocoCategories(
    project.labelClasses
  );

  return {
    info: {
      year: new Date().getUTCFullYear(),
      version: cocoVersion,
      description: `${project.name} COCO export`,
      contributor: "",
      date_created: new Date().toISOString()
    },
    licenses: [],
    images: cocoImages,
    categories: cocoCategories,
    annotations: toCocoAnnotations(
      project.annotations,
      imageIdBySourceId,
      categoryIdBySourceId
    )
  };
}

export async function generateCocoExport(
  projectId: string
): Promise<CocoDataset> {
  const project = await getPrismaClient().project.findUnique({
    where: {
      id: projectId
    },
    include: {
      images: {
        orderBy: {
          createdAt: "asc"
        }
      },
      labelClasses: {
        orderBy: {
          createdAt: "asc"
        }
      },
      annotations: {
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  if (!project) {
    throw notFound("Project not found.");
  }

  return toCocoDataset(project);
}
