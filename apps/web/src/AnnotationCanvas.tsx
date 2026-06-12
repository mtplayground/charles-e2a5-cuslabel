import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  Check,
  Maximize2,
  MousePointer2,
  Move,
  Pencil,
  RotateCcw,
  Square,
  Trash2,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image as KonvaImage,
  Label,
  Layer,
  Line,
  Circle,
  Rect,
  Stage,
  Tag,
  Text,
  Transformer
} from "react-konva";
import type {
  AnnotationDto,
  BoxAnnotationGeometryDto,
  ImageDto,
  LabelClassDto,
  PolylineAnnotationGeometryDto,
  PolylinePointDto
} from "@cuslabel/shared";
import {
  ApiError,
  createAnnotation,
  deleteAnnotation,
  listImageAnnotations,
  updateAnnotation
} from "./api";

interface AnnotationCanvasProps {
  activeClass: LabelClassDto | null;
  image: ImageDto;
  labelClasses: LabelClassDto[];
  onAnnotationCountChange: (projectId: string, delta: number) => void;
}

interface StageViewport {
  scale: number;
  x: number;
  y: number;
}

interface StageSize {
  width: number;
  height: number;
}

interface BoxDraft {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

type CanvasMode = "draw" | "pan";
type DrawTool = "box" | "polyline";
type LoadState = "idle" | "loading" | "ready";

interface SelectedVertex {
  annotationId: string;
  index: number;
}

const minScale = 0.08;
const maxScale = 12;
const zoomStep = 1.18;
const minBoxSize = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fitViewport(image: ImageDto, stageSize: StageSize): StageViewport {
  const padding = 32;
  const availableWidth = Math.max(1, stageSize.width - padding * 2);
  const availableHeight = Math.max(1, stageSize.height - padding * 2);
  const scale = clamp(
    Math.min(availableWidth / image.width, availableHeight / image.height),
    minScale,
    maxScale
  );

  return {
    scale,
    x: (stageSize.width - image.width * scale) / 2,
    y: (stageSize.height - image.height * scale) / 2
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error.";
}

function isBoxAnnotation(
  annotation: AnnotationDto
): annotation is AnnotationDto & { geometry: BoxAnnotationGeometryDto } {
  return annotation.type === "BOX" && "width" in annotation.geometry;
}

function isPolylineAnnotation(
  annotation: AnnotationDto
): annotation is AnnotationDto & { geometry: PolylineAnnotationGeometryDto } {
  return annotation.type === "POLYLINE" && "points" in annotation.geometry;
}

function normalizeBoxGeometry(
  geometry: BoxAnnotationGeometryDto,
  image: ImageDto
): BoxAnnotationGeometryDto {
  const x = clamp(geometry.x, 0, image.width);
  const y = clamp(geometry.y, 0, image.height);
  const maxWidth = image.width - x;
  const maxHeight = image.height - y;

  return {
    x,
    y,
    width: clamp(geometry.width, minBoxSize, Math.max(minBoxSize, maxWidth)),
    height: clamp(geometry.height, minBoxSize, Math.max(minBoxSize, maxHeight))
  };
}

function normalizePoint(
  point: PolylinePointDto,
  image: ImageDto
): PolylinePointDto {
  return {
    x: clamp(point.x, 0, image.width),
    y: clamp(point.y, 0, image.height)
  };
}

function normalizePolylineGeometry(
  geometry: PolylineAnnotationGeometryDto,
  image: ImageDto
): PolylineAnnotationGeometryDto {
  return {
    points: geometry.points.map((point) => normalizePoint(point, image))
  };
}

function flattenPoints(points: PolylinePointDto[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

function squaredDistanceToSegment(
  point: PolylinePointDto,
  segmentStart: PolylinePointDto,
  segmentEnd: PolylinePointDto
): number {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    const x = point.x - segmentStart.x;
    const y = point.y - segmentStart.y;
    return x * x + y * y;
  }

  const t = clamp(
    ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) /
      lengthSquared,
    0,
    1
  );
  const projected = {
    x: segmentStart.x + t * dx,
    y: segmentStart.y + t * dy
  };
  const x = point.x - projected.x;
  const y = point.y - projected.y;
  return x * x + y * y;
}

function insertPointAtNearestSegment(
  points: PolylinePointDto[],
  point: PolylinePointDto
): PolylinePointDto[] {
  if (points.length < 2) {
    return [...points, point];
  }

  let insertIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentStart = points[index];
    const segmentEnd = points[index + 1];

    if (!segmentStart || !segmentEnd) {
      continue;
    }

    const distance = squaredDistanceToSegment(point, segmentStart, segmentEnd);

    if (distance < bestDistance) {
      bestDistance = distance;
      insertIndex = index + 1;
    }
  }

  return [...points.slice(0, insertIndex), point, ...points.slice(insertIndex)];
}

function geometryFromDraft(
  draft: BoxDraft,
  image: ImageDto
): BoxAnnotationGeometryDto | null {
  const left = clamp(Math.min(draft.startX, draft.currentX), 0, image.width);
  const top = clamp(Math.min(draft.startY, draft.currentY), 0, image.height);
  const right = clamp(Math.max(draft.startX, draft.currentX), 0, image.width);
  const bottom = clamp(Math.max(draft.startY, draft.currentY), 0, image.height);
  const width = right - left;
  const height = bottom - top;

  if (width < minBoxSize || height < minBoxSize) {
    return null;
  }

  return {
    x: left,
    y: top,
    width,
    height
  };
}

export function AnnotationCanvas({
  activeClass,
  image,
  labelClasses,
  onAnnotationCountChange
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const shapeRefs = useRef<Record<string, Konva.Rect | null>>({});
  const [stageSize, setStageSize] = useState<StageSize>({
    width: 760,
    height: 520
  });
  const [viewport, setViewport] = useState<StageViewport>({
    scale: 1,
    x: 0,
    y: 0
  });
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(
    null
  );
  const [imageStatus, setImageStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [annotations, setAnnotations] = useState<AnnotationDto[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [selectedVertex, setSelectedVertex] = useState<SelectedVertex | null>(
    null
  );
  const [draftBox, setDraftBox] = useState<BoxDraft | null>(null);
  const [draftPolylinePoints, setDraftPolylinePoints] = useState<
    PolylinePointDto[]
  >([]);
  const [previewPolylinePoint, setPreviewPolylinePoint] =
    useState<PolylinePointDto | null>(null);
  const [mode, setMode] = useState<CanvasMode>("draw");
  const [drawTool, setDrawTool] = useState<DrawTool>("box");
  const [annotationsState, setAnnotationsState] = useState<LoadState>("idle");
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [savingAction, setSavingAction] = useState<string | null>(null);

  const boxAnnotations = useMemo(
    () => annotations.filter(isBoxAnnotation),
    [annotations]
  );

  const polylineAnnotations = useMemo(
    () => annotations.filter(isPolylineAnnotation),
    [annotations]
  );

  const labelClassById = useMemo(() => {
    return new Map(
      labelClasses.map((labelClass) => [labelClass.id, labelClass])
    );
  }, [labelClasses]);

  const selectedAnnotation = useMemo(
    () =>
      annotations.find(
        (annotation) => annotation.id === selectedAnnotationId
      ) ?? null,
    [annotations, selectedAnnotationId]
  );

  const draftGeometry = draftBox ? geometryFromDraft(draftBox, image) : null;

  const zoomPercent = useMemo(
    () => Math.round(viewport.scale * 100),
    [viewport.scale]
  );

  const resetViewport = useCallback(() => {
    setViewport(fitViewport(image, stageSize));
  }, [image, stageSize]);

  const stagePointToImagePoint = useCallback(
    (point: { x: number; y: number }) => {
      return {
        x: clamp((point.x - viewport.x) / viewport.scale, 0, image.width),
        y: clamp((point.y - viewport.y) / viewport.scale, 0, image.height)
      };
    },
    [image.height, image.width, viewport.scale, viewport.x, viewport.y]
  );

  const zoomAt = useCallback(
    (nextScale: number, anchor: { x: number; y: number }) => {
      setViewport((current) => {
        const scale = clamp(nextScale, minScale, maxScale);
        const imagePoint = {
          x: (anchor.x - current.x) / current.scale,
          y: (anchor.y - current.y) / current.scale
        };

        return {
          scale,
          x: anchor.x - imagePoint.x * scale,
          y: anchor.y - imagePoint.y * scale
        };
      });
    },
    []
  );

  function zoomBy(multiplier: number) {
    zoomAt(viewport.scale * multiplier, {
      x: stageSize.width / 2,
      y: stageSize.height / 2
    });
  }

  function handleWheel(event: KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();

    if (!pointer) {
      return;
    }

    const direction = event.evt.deltaY > 0 ? 1 / zoomStep : zoomStep;
    zoomAt(viewport.scale * direction, pointer);
  }

  async function persistBoxUpdate(
    annotation: AnnotationDto & { geometry: BoxAnnotationGeometryDto },
    geometry: BoxAnnotationGeometryDto
  ) {
    setSavingAction(`update:${annotation.id}`);
    setAnnotationError(null);

    try {
      const updated = await updateAnnotation(annotation.id, {
        type: "BOX",
        labelClassId: annotation.labelClassId,
        geometry: normalizeBoxGeometry(geometry, image)
      });
      setAnnotations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (error) {
      setAnnotationError(errorMessage(error));
    } finally {
      setSavingAction(null);
    }
  }

  async function persistPolylineUpdate(
    annotation: AnnotationDto & { geometry: PolylineAnnotationGeometryDto },
    geometry: PolylineAnnotationGeometryDto
  ) {
    if (geometry.points.length < 2) {
      return;
    }

    setSavingAction(`update:${annotation.id}`);
    setAnnotationError(null);

    try {
      const updated = await updateAnnotation(annotation.id, {
        type: "POLYLINE",
        labelClassId: annotation.labelClassId,
        geometry: normalizePolylineGeometry(geometry, image)
      });
      setAnnotations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (error) {
      setAnnotationError(errorMessage(error));
    } finally {
      setSavingAction(null);
    }
  }

  async function handleCreateBox(geometry: BoxAnnotationGeometryDto) {
    if (!activeClass) {
      setAnnotationError("Select a class before drawing boxes.");
      return;
    }

    setSavingAction("create");
    setAnnotationError(null);

    try {
      const annotation = await createAnnotation(image.id, {
        type: "BOX",
        labelClassId: activeClass.id,
        geometry: normalizeBoxGeometry(geometry, image)
      });
      setAnnotations((current) => [...current, annotation]);
      setSelectedAnnotationId(annotation.id);
      setSelectedVertex(null);
      onAnnotationCountChange(image.projectId, 1);
    } catch (error) {
      setAnnotationError(errorMessage(error));
    } finally {
      setSavingAction(null);
    }
  }

  async function handleCreatePolyline(points: PolylinePointDto[]) {
    if (!activeClass) {
      setAnnotationError("Select a class before drawing polylines.");
      return;
    }

    if (points.length < 2) {
      return;
    }

    setSavingAction("create");
    setAnnotationError(null);

    try {
      const annotation = await createAnnotation(image.id, {
        type: "POLYLINE",
        labelClassId: activeClass.id,
        geometry: normalizePolylineGeometry({ points }, image)
      });
      setAnnotations((current) => [...current, annotation]);
      setSelectedAnnotationId(annotation.id);
      setSelectedVertex(null);
      onAnnotationCountChange(image.projectId, 1);
    } catch (error) {
      setAnnotationError(errorMessage(error));
    } finally {
      setSavingAction(null);
    }
  }

  function finishDraftPolyline() {
    if (draftPolylinePoints.length >= 2) {
      void handleCreatePolyline(draftPolylinePoints);
    }

    setDraftPolylinePoints([]);
    setPreviewPolylinePoint(null);
  }

  function cancelDraftPolyline() {
    setDraftPolylinePoints([]);
    setPreviewPolylinePoint(null);
  }

  async function handleDeleteSelected() {
    if (!selectedAnnotation) {
      return;
    }

    if (
      selectedVertex?.annotationId === selectedAnnotation.id &&
      isPolylineAnnotation(selectedAnnotation)
    ) {
      if (selectedAnnotation.geometry.points.length <= 2) {
        return;
      }

      const nextPoints = selectedAnnotation.geometry.points.filter(
        (_point, index) => index !== selectedVertex.index
      );
      setSelectedVertex(null);
      await persistPolylineUpdate(selectedAnnotation, { points: nextPoints });
      return;
    }

    setSavingAction(`delete:${selectedAnnotation.id}`);
    setAnnotationError(null);

    try {
      await deleteAnnotation(selectedAnnotation.id);
      setAnnotations((current) =>
        current.filter((annotation) => annotation.id !== selectedAnnotation.id)
      );
      setSelectedAnnotationId(null);
      onAnnotationCountChange(image.projectId, -1);
    } catch (error) {
      setAnnotationError(errorMessage(error));
    } finally {
      setSavingAction(null);
    }
  }

  function handlePointerDown(
    _event: KonvaEventObject<MouseEvent | TouchEvent>
  ) {
    if (mode !== "draw" || !activeClass) {
      return;
    }

    const pointer = stageRef.current?.getPointerPosition();

    if (!pointer) {
      return;
    }

    const point = stagePointToImagePoint(pointer);
    setSelectedAnnotationId(null);
    setSelectedVertex(null);

    if (drawTool === "polyline") {
      setDraftPolylinePoints((current) => [...current, point]);
      setPreviewPolylinePoint(null);
      return;
    }

    setSelectedAnnotationId(null);
    setDraftBox({
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y
    });
  }

  function handlePointerMove() {
    const pointer = stageRef.current?.getPointerPosition();

    if (!pointer) {
      return;
    }

    const point = stagePointToImagePoint(pointer);

    if (drawTool === "polyline" && draftPolylinePoints.length > 0) {
      setPreviewPolylinePoint(point);
      return;
    }

    if (!draftBox) {
      return;
    }

    setDraftBox((current) =>
      current
        ? {
            ...current,
            currentX: point.x,
            currentY: point.y
          }
        : current
    );
  }

  function handlePointerUp() {
    if (!draftBox || drawTool !== "box") {
      return;
    }

    const geometry = geometryFromDraft(draftBox, image);
    setDraftBox(null);

    if (geometry) {
      void handleCreateBox(geometry);
    }
  }

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      const rect = entry.contentRect;
      setStageSize({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(380, Math.round(rect.height))
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setViewport(fitViewport(image, stageSize));
  }, [image, stageSize]);

  useEffect(() => {
    let isMounted = true;
    const nextImage = new window.Image();
    setImageStatus("loading");
    setImageElement(null);

    nextImage.onload = () => {
      if (!isMounted) {
        return;
      }

      setImageElement(nextImage);
      setImageStatus("ready");
    };

    nextImage.onerror = () => {
      if (!isMounted) {
        return;
      }

      setImageStatus("error");
    };

    nextImage.src = image.url;

    return () => {
      isMounted = false;
    };
  }, [image.url]);

  useEffect(() => {
    let isMounted = true;
    setAnnotationsState("loading");
    setAnnotationError(null);
    setSelectedAnnotationId(null);
    setAnnotations([]);

    listImageAnnotations(image.id)
      .then((nextAnnotations) => {
        if (!isMounted) {
          return;
        }

        setAnnotations(nextAnnotations);
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }

        setAnnotationError(errorMessage(error));
      })
      .finally(() => {
        if (isMounted) {
          setAnnotationsState("ready");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [image.id]);

  useEffect(() => {
    const transformer = transformerRef.current;

    if (!transformer || !selectedAnnotationId) {
      transformer?.nodes([]);
      return;
    }

    const selectedBox = boxAnnotations.find(
      (annotation) => annotation.id === selectedAnnotationId
    );

    if (!selectedBox) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }

    const selectedNode = shapeRefs.current[selectedAnnotationId];
    transformer.nodes(selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [boxAnnotations, selectedAnnotationId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" && draftPolylinePoints.length >= 2) {
        finishDraftPolyline();
        return;
      }

      if (event.key === "Escape" && draftPolylinePoints.length > 0) {
        cancelDraftPolyline();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        void handleDeleteSelected();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="flex h-full min-h-[34rem] flex-col overflow-hidden rounded-lg border border-stone-800 bg-stone-950">
      <div className="flex flex-col gap-3 border-b border-stone-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-300">
            Canvas
          </p>
          <h3 className="mt-1 truncate text-base font-semibold text-white">
            {image.metadata.originalName}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm transition ${
              mode === "draw" && drawTool === "box"
                ? "border-emerald-400 bg-emerald-400/10 text-emerald-100"
                : "border-stone-700 text-stone-200 hover:border-stone-500 hover:bg-stone-900"
            }`}
            onClick={() => {
              cancelDraftPolyline();
              setMode("draw");
              setDrawTool("box");
            }}
            type="button"
          >
            <Square aria-hidden="true" size={15} />
            Box
          </button>
          <button
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm transition ${
              mode === "draw" && drawTool === "polyline"
                ? "border-emerald-400 bg-emerald-400/10 text-emerald-100"
                : "border-stone-700 text-stone-200 hover:border-stone-500 hover:bg-stone-900"
            }`}
            onClick={() => {
              setMode("draw");
              setDrawTool("polyline");
            }}
            type="button"
          >
            <Pencil aria-hidden="true" size={15} />
            Line
          </button>
          <button
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm transition ${
              mode === "pan"
                ? "border-emerald-400 bg-emerald-400/10 text-emerald-100"
                : "border-stone-700 text-stone-200 hover:border-stone-500 hover:bg-stone-900"
            }`}
            onClick={() => {
              cancelDraftPolyline();
              setMode("pan");
            }}
            type="button"
          >
            <MousePointer2 aria-hidden="true" size={15} />
            Select
          </button>
          {drawTool === "polyline" ? (
            <>
              <button
                className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-500 px-3 text-sm font-semibold text-stone-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={draftPolylinePoints.length < 2}
                onClick={finishDraftPolyline}
                title="Finish polyline"
                type="button"
              >
                <Check aria-hidden="true" size={16} />
              </button>
              <button
                className="inline-flex h-9 items-center justify-center rounded-md border border-stone-700 px-3 text-sm text-stone-200 transition hover:border-stone-500 hover:bg-stone-900"
                disabled={draftPolylinePoints.length === 0}
                onClick={cancelDraftPolyline}
                title="Cancel polyline"
                type="button"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </>
          ) : null}
          <div className="flex h-9 items-center gap-2 rounded-md border border-stone-700 bg-stone-900 px-3 text-xs text-stone-300">
            <Move aria-hidden="true" size={15} />
            <span className="tabular-nums">{zoomPercent}%</span>
          </div>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-700 text-stone-200 transition hover:border-stone-500 hover:bg-stone-900"
            onClick={() => zoomBy(1 / zoomStep)}
            title="Zoom out"
            type="button"
          >
            <ZoomOut aria-hidden="true" size={16} />
          </button>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-700 text-stone-200 transition hover:border-stone-500 hover:bg-stone-900"
            onClick={() => zoomBy(zoomStep)}
            title="Zoom in"
            type="button"
          >
            <ZoomIn aria-hidden="true" size={16} />
          </button>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-700 text-stone-200 transition hover:border-emerald-500 hover:text-emerald-200"
            onClick={resetViewport}
            title="Fit image"
            type="button"
          >
            <Maximize2 aria-hidden="true" size={16} />
          </button>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-700 text-stone-200 transition hover:border-stone-500 hover:bg-stone-900"
            onClick={() =>
              setViewport((current) => ({
                ...current,
                x: 0,
                y: 0,
                scale: 1
              }))
            }
            title="Actual size"
            type="button"
          >
            <RotateCcw aria-hidden="true" size={16} />
          </button>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-700 text-stone-200 transition hover:border-rose-500 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedAnnotation}
            onClick={() => void handleDeleteSelected()}
            title="Delete selected annotation"
            type="button"
          >
            <Trash2 aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 border-b border-stone-800 px-4 py-3 text-sm sm:grid-cols-4">
        <div>
          <span className="block text-xs uppercase tracking-[0.12em] text-stone-500">
            Active class
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-2 font-semibold text-white">
            {activeClass ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 rounded border border-white/20"
                  style={{ backgroundColor: activeClass.color }}
                />
                <span className="truncate">{activeClass.name}</span>
              </>
            ) : (
              "None"
            )}
          </span>
        </div>
        <div>
          <span className="block text-xs uppercase tracking-[0.12em] text-stone-500">
            Image size
          </span>
          <span className="mt-1 block font-semibold text-white">
            {image.width} x {image.height}
          </span>
        </div>
        <div>
          <span className="block text-xs uppercase tracking-[0.12em] text-stone-500">
            Annotations
          </span>
          <span className="mt-1 block font-semibold text-white">
            {annotationsState === "loading"
              ? "Loading"
              : `${boxAnnotations.length} / ${polylineAnnotations.length}`}
          </span>
        </div>
        <div>
          <span className="block text-xs uppercase tracking-[0.12em] text-stone-500">
            Status
          </span>
          <span className="mt-1 block font-semibold text-emerald-200">
            {savingAction ? "Saving" : "Ready"}
          </span>
        </div>
      </div>

      {annotationError ? (
        <div className="border-b border-rose-800 bg-rose-950/60 px-4 py-2 text-sm text-rose-100">
          {annotationError}
        </div>
      ) : null}

      <div ref={containerRef} className="relative min-h-0 flex-1 bg-stone-950">
        <Stage
          className={
            mode === "pan"
              ? "cursor-grab active:cursor-grabbing"
              : "cursor-crosshair"
          }
          draggable={mode === "pan" && !draftBox}
          height={stageSize.height}
          onDragEnd={(event) => {
            setViewport((current) => ({
              ...current,
              x: event.target.x(),
              y: event.target.y()
            }));
          }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onTouchEnd={handlePointerUp}
          onTouchMove={handlePointerMove}
          onTouchStart={handlePointerDown}
          onWheel={handleWheel}
          ref={stageRef}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          width={stageSize.width}
          x={viewport.x}
          y={viewport.y}
        >
          <Layer listening={false}>
            <Rect
              fill="#0c0a09"
              height={image.height}
              stroke="#292524"
              strokeWidth={1 / viewport.scale}
              width={image.width}
            />
            {imageElement ? (
              <KonvaImage
                height={image.height}
                image={imageElement}
                width={image.width}
              />
            ) : null}
          </Layer>
          <Layer>
            <Rect
              height={image.height}
              listening={false}
              stroke="#34d399"
              strokeWidth={1 / viewport.scale}
              width={image.width}
            />
            {polylineAnnotations.map((annotation) => {
              const labelClass = labelClassById.get(annotation.labelClassId);
              const color = labelClass?.color ?? "#34d399";
              const isSelected = selectedAnnotationId === annotation.id;

              return (
                <Line
                  hitStrokeWidth={12 / viewport.scale}
                  key={annotation.id}
                  lineCap="round"
                  lineJoin="round"
                  onClick={(event) => {
                    event.cancelBubble = true;
                    setSelectedAnnotationId(annotation.id);
                    setSelectedVertex(null);
                    setMode("pan");
                  }}
                  onDblClick={(event) => {
                    event.cancelBubble = true;
                    const pointer = stageRef.current?.getPointerPosition();

                    if (!pointer) {
                      return;
                    }

                    const point = stagePointToImagePoint(pointer);
                    const points = insertPointAtNearestSegment(
                      annotation.geometry.points,
                      point
                    );
                    setSelectedAnnotationId(annotation.id);
                    setSelectedVertex({
                      annotationId: annotation.id,
                      index: points.findIndex(
                        (item) => item.x === point.x && item.y === point.y
                      )
                    });
                    void persistPolylineUpdate(annotation, { points });
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    setSelectedAnnotationId(annotation.id);
                    setSelectedVertex(null);
                    setMode("pan");
                  }}
                  points={flattenPoints(annotation.geometry.points)}
                  stroke={color}
                  strokeWidth={(isSelected ? 4 : 3) / viewport.scale}
                />
              );
            })}
            {boxAnnotations.map((annotation) => {
              const labelClass = labelClassById.get(annotation.labelClassId);
              const color = labelClass?.color ?? "#34d399";
              const isSelected = selectedAnnotationId === annotation.id;

              return (
                <Rect
                  dash={
                    isSelected
                      ? undefined
                      : [6 / viewport.scale, 4 / viewport.scale]
                  }
                  draggable
                  fill={`${color}24`}
                  height={annotation.geometry.height}
                  key={annotation.id}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    setSelectedAnnotationId(annotation.id);
                    setSelectedVertex(null);
                    setMode("pan");
                  }}
                  onDragEnd={(event) => {
                    const geometry = normalizeBoxGeometry(
                      {
                        ...annotation.geometry,
                        x: event.target.x(),
                        y: event.target.y()
                      },
                      image
                    );
                    event.target.position({ x: geometry.x, y: geometry.y });
                    void persistBoxUpdate(annotation, geometry);
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    setSelectedAnnotationId(annotation.id);
                    setSelectedVertex(null);
                    setMode("pan");
                  }}
                  onTransformEnd={(event) => {
                    const node = event.target;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scale({ x: 1, y: 1 });
                    const geometry = normalizeBoxGeometry(
                      {
                        x: node.x(),
                        y: node.y(),
                        width: Math.max(minBoxSize, node.width() * scaleX),
                        height: Math.max(minBoxSize, node.height() * scaleY)
                      },
                      image
                    );
                    node.position({ x: geometry.x, y: geometry.y });
                    node.size({
                      width: geometry.width,
                      height: geometry.height
                    });
                    void persistBoxUpdate(annotation, geometry);
                  }}
                  ref={(node) => {
                    shapeRefs.current[annotation.id] = node;
                  }}
                  stroke={color}
                  strokeWidth={(isSelected ? 3 : 2) / viewport.scale}
                  width={annotation.geometry.width}
                  x={annotation.geometry.x}
                  y={annotation.geometry.y}
                />
              );
            })}
            {boxAnnotations.map((annotation) => {
              const labelClass = labelClassById.get(annotation.labelClassId);
              const color = labelClass?.color ?? "#34d399";

              return (
                <Label
                  key={`${annotation.id}:label`}
                  listening={false}
                  x={annotation.geometry.x}
                  y={Math.max(0, annotation.geometry.y - 20 / viewport.scale)}
                >
                  <Tag fill={color} opacity={0.9} />
                  <Text
                    fill="#0c0a09"
                    fontSize={12 / viewport.scale}
                    fontStyle="bold"
                    padding={4 / viewport.scale}
                    text={labelClass?.name ?? "Class"}
                  />
                </Label>
              );
            })}
            {polylineAnnotations.map((annotation) => {
              const labelClass = labelClassById.get(annotation.labelClassId);
              const color = labelClass?.color ?? "#34d399";
              const firstPoint = annotation.geometry.points[0];

              if (!firstPoint) {
                return null;
              }

              return (
                <Label
                  key={`${annotation.id}:label`}
                  listening={false}
                  x={firstPoint.x}
                  y={Math.max(0, firstPoint.y - 20 / viewport.scale)}
                >
                  <Tag fill={color} opacity={0.9} />
                  <Text
                    fill="#0c0a09"
                    fontSize={12 / viewport.scale}
                    fontStyle="bold"
                    padding={4 / viewport.scale}
                    text={labelClass?.name ?? "Class"}
                  />
                </Label>
              );
            })}
            {polylineAnnotations.flatMap((annotation) => {
              if (selectedAnnotationId !== annotation.id) {
                return [];
              }

              const color =
                labelClassById.get(annotation.labelClassId)?.color ?? "#34d399";

              return annotation.geometry.points.map((point, index) => {
                const isSelectedVertex =
                  selectedVertex?.annotationId === annotation.id &&
                  selectedVertex.index === index;

                return (
                  <Circle
                    draggable
                    fill={isSelectedVertex ? "#ffffff" : color}
                    key={`${annotation.id}:vertex:${index}`}
                    onClick={(event) => {
                      event.cancelBubble = true;
                      setSelectedAnnotationId(annotation.id);
                      setSelectedVertex({
                        annotationId: annotation.id,
                        index
                      });
                    }}
                    onDragEnd={(event) => {
                      const nextPoint = normalizePoint(
                        {
                          x: event.target.x(),
                          y: event.target.y()
                        },
                        image
                      );
                      event.target.position(nextPoint);
                      const points = annotation.geometry.points.map(
                        (currentPoint, currentIndex) =>
                          currentIndex === index ? nextPoint : currentPoint
                      );
                      setSelectedVertex({
                        annotationId: annotation.id,
                        index
                      });
                      void persistPolylineUpdate(annotation, { points });
                    }}
                    onTap={(event) => {
                      event.cancelBubble = true;
                      setSelectedAnnotationId(annotation.id);
                      setSelectedVertex({
                        annotationId: annotation.id,
                        index
                      });
                    }}
                    radius={5 / viewport.scale}
                    stroke="#052e16"
                    strokeWidth={1.5 / viewport.scale}
                    x={point.x}
                    y={point.y}
                  />
                );
              });
            })}
            {draftGeometry ? (
              <Rect
                dash={[6 / viewport.scale, 4 / viewport.scale]}
                fill={`${activeClass?.color ?? "#34d399"}20`}
                height={draftGeometry.height}
                listening={false}
                stroke={activeClass?.color ?? "#34d399"}
                strokeWidth={2 / viewport.scale}
                width={draftGeometry.width}
                x={draftGeometry.x}
                y={draftGeometry.y}
              />
            ) : null}
            {draftPolylinePoints.length > 0 ? (
              <>
                <Line
                  dash={[6 / viewport.scale, 4 / viewport.scale]}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                  points={flattenPoints(
                    previewPolylinePoint
                      ? [...draftPolylinePoints, previewPolylinePoint]
                      : draftPolylinePoints
                  )}
                  stroke={activeClass?.color ?? "#34d399"}
                  strokeWidth={2 / viewport.scale}
                />
                {draftPolylinePoints.map((point, index) => (
                  <Circle
                    fill={activeClass?.color ?? "#34d399"}
                    key={`draft-point:${index}`}
                    listening={false}
                    radius={4 / viewport.scale}
                    stroke="#052e16"
                    strokeWidth={1 / viewport.scale}
                    x={point.x}
                    y={point.y}
                  />
                ))}
              </>
            ) : null}
            <Transformer
              anchorFill="#34d399"
              anchorSize={10}
              anchorStroke="#052e16"
              borderDash={[6, 4]}
              borderStroke="#34d399"
              boundBoxFunc={(_oldBox, newBox) => {
                if (newBox.width < minBoxSize || newBox.height < minBoxSize) {
                  return _oldBox;
                }

                return newBox;
              }}
              ref={transformerRef}
              rotateEnabled={false}
            />
          </Layer>
        </Stage>

        {imageStatus !== "ready" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-950/80 px-5 text-center text-sm text-stone-300">
            {imageStatus === "loading"
              ? "Loading image"
              : "Image could not be loaded"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
