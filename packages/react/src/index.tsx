import {
  createCanvasRuntime,
  type CanvasRuntime,
  type CreateCanvasRuntimeOptions,
} from "@canvas-engine/canvas";
import {
  type CSSProperties,
  type MutableRefObject,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";

export interface UseCanvasRuntimeOptions
  extends Omit<CreateCanvasRuntimeOptions, "canvas"> {}

export interface UseCanvasRuntimeResult {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  runtime: CanvasRuntime | null;
}

export function useCanvasRuntime(options: UseCanvasRuntimeOptions): UseCanvasRuntimeResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [runtime, setRuntime] = useState<CanvasRuntime | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const nextRuntime = createCanvasRuntime({
      ...options,
      canvas: canvasRef.current,
    });
    setRuntime(nextRuntime);
    return () => {
      nextRuntime.destroy();
      setRuntime(null);
    };
  }, [options.documentId, options.actorId]);

  return { canvasRef, runtime };
}

export interface CanvasRuntimeViewProps extends UseCanvasRuntimeOptions {
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
}

export function CanvasRuntimeView({
  width = 800,
  height = 500,
  className,
  style,
  ...options
}: CanvasRuntimeViewProps): ReactElement {
  const { canvasRef } = useCanvasRuntime(options);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={style}
    />
  );
}

export type {
  ApplyResult,
  CanvasMutation,
  CanvasObject,
  CanvasRuntime,
  CanvasRuntimeEvent,
  CanvasTool,
  CreateCanvasRuntimeOptions,
  CreatePathInput,
  CreateRectInput,
  Geometry,
  ObjectRenderer,
  Point,
  RenderObject,
  Style,
  Transform,
  TransformObjectInput,
} from "@canvas-engine/canvas";
