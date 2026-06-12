import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Maximize2, Move, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Rect, Stage } from "react-konva";
import type { ImageDto, LabelClassDto } from "@cuslabel/shared";

interface AnnotationCanvasProps {
  activeClass: LabelClassDto | null;
  image: ImageDto;
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

const minScale = 0.08;
const maxScale = 12;
const zoomStep = 1.18;

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

export function AnnotationCanvas({
  activeClass,
  image
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
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

  const zoomPercent = useMemo(
    () => Math.round(viewport.scale * 100),
    [viewport.scale]
  );

  const resetViewport = useCallback(() => {
    setViewport(fitViewport(image, stageSize));
  }, [image, stageSize]);

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
        </div>
      </div>

      <div className="grid gap-3 border-b border-stone-800 px-4 py-3 text-sm sm:grid-cols-3">
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
            Layer
          </span>
          <span className="mt-1 block font-semibold text-emerald-200">
            Ready
          </span>
        </div>
      </div>

      <div ref={containerRef} className="relative min-h-0 flex-1 bg-stone-950">
        <Stage
          className="cursor-grab active:cursor-grabbing"
          draggable
          height={stageSize.height}
          onDragEnd={(event) => {
            setViewport((current) => ({
              ...current,
              x: event.target.x(),
              y: event.target.y()
            }));
          }}
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
          <Layer listening={false}>
            <Rect
              height={image.height}
              stroke={activeClass?.color ?? "#34d399"}
              strokeWidth={1 / viewport.scale}
              width={image.width}
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
