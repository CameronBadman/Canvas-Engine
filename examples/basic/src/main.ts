import {
  createCanvasRuntime,
  type CanvasMutation,
  type EventStamp,
} from "@canvas-engine/canvas";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

app.innerHTML = `
  <main class="app">
    <section class="workspace">
      <div class="toolbar">
        <button id="addRect">Add Rect</button>
        <button id="externalRect">Add External Rect Mutation</button>
        <button id="rectTool">Rect Tool</button>
        <button id="penTool">Pen Tool</button>
        <button id="noneTool" data-active="true">No Tool</button>
        <button id="snapshot">Snapshot</button>
        <button id="restore">Restore</button>
        <button id="exportJson">Export JSON</button>
      </div>
      <canvas id="canvas" width="960" height="600"></canvas>
    </section>
    <aside class="side">
      <section class="panel">
        <h2>Emitted Mutations</h2>
        <pre id="log"></pre>
      </section>
      <section class="panel">
        <h2>Document JSON</h2>
        <pre id="json"></pre>
      </section>
    </aside>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
const logEl = document.querySelector<HTMLPreElement>("#log");
const jsonEl = document.querySelector<HTMLPreElement>("#json");
if (!canvas || !logEl || !jsonEl) throw new Error("Missing example elements");

const logLines: string[] = [];
let savedSnapshot: Uint8Array | null = null;
let externalLamport = 1;

function appendLog(label: string, mutation: CanvasMutation): void {
  logLines.unshift(`${label}: ${mutation.event_type} ${mutation.event_id}`);
  logEl.textContent = logLines.slice(0, 40).join("\n");
}

function stamp(lamport: number, actorId: string): EventStamp {
  return { lamport, actor_id: actorId };
}

function externalRectMutation(): CanvasMutation {
  const lamport = externalLamport++;
  const actorId = "external-debugger";
  const eventStamp = stamp(lamport, actorId);
  const objectId = `external-rect-${lamport}`;
  return {
    event_id: `${actorId}:event:${lamport}:object.created`,
    document_id: "basic-doc",
    actor_id: actorId,
    lamport,
    event_type: "object.created",
    target_object_id: objectId,
    payload: {
      object: {
        object_id: objectId,
        object_kind: "shape",
        renderer_key: "core.rect",
        transform: {
          x: 80 + lamport * 28,
          y: 80 + lamport * 18,
          rotation: 0,
          scale_x: 1,
          scale_y: 1,
        },
        geometry: { Rect: { width: 120, height: 72 } },
        style: {
          fill: "#fde68a",
          stroke: "#92400e",
          stroke_width: 2,
        },
        metadata: JSON.stringify({ source: "external button" }),
        versions: {
          object: eventStamp,
          transform: eventStamp,
          geometry: eventStamp,
          style: eventStamp,
          metadata: eventStamp,
          deleted: null,
        },
      },
    },
  };
}

const runtime = createCanvasRuntime({
  canvas,
  documentId: "basic-doc",
  actorId: "browser-a",
  onMutation: (mutation) => appendLog("local", mutation),
});

function updateToolButtons(activeId: string): void {
  for (const id of ["rectTool", "penTool", "noneTool"]) {
    document.querySelector<HTMLButtonElement>(`#${id}`)?.setAttribute("data-active", `${id === activeId}`);
  }
}

document.querySelector("#addRect")?.addEventListener("click", () => {
  const offset = logLines.length * 12;
  runtime.createRect({
    x: 120 + offset,
    y: 120 + offset,
    width: 160,
    height: 96,
  });
});

document.querySelector("#externalRect")?.addEventListener("click", () => {
  const mutation = externalRectMutation();
  const result = runtime.applyMutation(mutation);
  appendLog(result.duplicate ? "duplicate external" : "external", mutation);
});

document.querySelector("#rectTool")?.addEventListener("click", () => {
  runtime.setTool("rect");
  updateToolButtons("rectTool");
});

document.querySelector("#penTool")?.addEventListener("click", () => {
  runtime.setTool("pen");
  updateToolButtons("penTool");
});

document.querySelector("#noneTool")?.addEventListener("click", () => {
  runtime.setTool("none");
  updateToolButtons("noneTool");
});

document.querySelector("#snapshot")?.addEventListener("click", () => {
  savedSnapshot = runtime.getSnapshot();
  logLines.unshift(`snapshot: ${savedSnapshot.byteLength} bytes`);
  logEl.textContent = logLines.slice(0, 40).join("\n");
});

document.querySelector("#restore")?.addEventListener("click", () => {
  if (!savedSnapshot) return;
  runtime.loadSnapshot(savedSnapshot);
});

document.querySelector("#exportJson")?.addEventListener("click", () => {
  jsonEl.textContent = JSON.stringify(runtime.exportDocumentJson(), null, 2);
});
