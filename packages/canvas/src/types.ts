export type EventType =
  | "object.created"
  | "object.updated"
  | "object.deleted"
  | "object.transformed"
  | "document.cleared";

export interface EventStamp {
  lamport: number;
  actor_id: string;
}

export interface Transform {
  x: number;
  y: number;
  rotation: number;
  scale_x: number;
  scale_y: number;
}

export type Geometry =
  | { Rect: { width: number; height: number } }
  | { Ellipse: { rx: number; ry: number } }
  | { Path: { points: Point[] } };

export interface Point {
  x: number;
  y: number;
}

export interface Style {
  fill?: string | null;
  stroke?: string | null;
  stroke_width: number;
}

export interface ObjectVersions {
  object: EventStamp;
  transform: EventStamp;
  geometry: EventStamp;
  style: EventStamp;
  metadata: EventStamp;
  deleted?: EventStamp | null;
}

export interface CanvasObject {
  object_id: string;
  object_kind: string;
  renderer_key: string;
  transform: Transform;
  geometry: Geometry;
  style: Style;
  metadata?: string | null;
  versions: ObjectVersions;
}

export interface MutationPayload {
  object?: CanvasObject | null;
  object_kind?: string | null;
  renderer_key?: string | null;
  geometry?: Geometry | null;
  style?: Style | null;
  metadata?: string | null;
  transform?: Transform | null;
}

export interface CanvasMutation {
  event_id: string;
  document_id: string;
  actor_id: string;
  lamport: number;
  event_type: EventType;
  target_object_id?: string | null;
  payload: MutationPayload;
}

export interface ApplyResult {
  applied: boolean;
  duplicate: boolean;
  document_id: string;
  event_id?: string | null;
  lamport_clock: number;
  target_object_id?: string | null;
  message: string;
}

export interface RenderObject {
  object_id: string;
  object_kind: string;
  renderer_key: string;
  transform: Transform;
  geometry: Geometry;
  style: Style;
  metadata?: string | null;
}

export type ObjectRenderer = (
  ctx: CanvasRenderingContext2D,
  object: RenderObject,
) => void;

export type CanvasTool = "none" | "rect" | "pen";

export type CanvasRuntimeEvent =
  | { type: "rendered"; objectCount: number }
  | { type: "mutation-applied"; result: ApplyResult; source: "local" | "remote" }
  | { type: "tool-changed"; tool: CanvasTool }
  | { type: "destroyed" }
  | { type: "error"; error: unknown };

export interface CreateRectInput {
  objectId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style?: Partial<Style>;
  metadata?: string;
}

export interface CreatePathInput {
  objectId?: string;
  points: Point[];
  style?: Partial<Style>;
  metadata?: string;
}

export interface TransformObjectInput {
  objectId: string;
  transform: Transform;
}

export interface CreateCanvasRuntimeOptions {
  canvas: HTMLCanvasElement;
  documentId: string;
  actorId: string;
  onMutation?: (mutation: CanvasMutation, binary: Uint8Array) => void;
  onRuntimeEvent?: (event: CanvasRuntimeEvent) => void;
  renderers?: Record<string, ObjectRenderer>;
  initialTool?: CanvasTool;
}

export interface CanvasRuntime {
  applyMutation(mutation: CanvasMutation): ApplyResult;
  applyMutationBinary(bytes: Uint8Array): ApplyResult;
  createRect(input: CreateRectInput): CanvasMutation;
  createPath(input: CreatePathInput): CanvasMutation;
  transformObject(input: TransformObjectInput): CanvasMutation;
  deleteObject(objectId: string): CanvasMutation;
  render(): void;
  getSnapshot(): Uint8Array;
  loadSnapshot(bytes: Uint8Array): void;
  exportDocumentJson(): unknown;
  setTool(tool: CanvasTool): void;
  getTool(): CanvasTool;
  destroy(): void;
}
