import { createCanvasRuntime, type CanvasMutation } from "@canvas-engine/canvas";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

app.innerHTML = `
  <main class="app">
    <div class="toolbar">
      <button id="addA">Add Rect On A</button>
      <button id="addB">Add Rect On B</button>
      <button id="penA">Pen Tool A</button>
      <button id="penB">Pen Tool B</button>
      <button id="none">Disable Tools</button>
    </div>
    <section class="canvases">
      <div class="pane">
        <h2>Canvas A</h2>
        <canvas id="canvasA" width="720" height="480"></canvas>
      </div>
      <div class="pane">
        <h2>Canvas B</h2>
        <canvas id="canvasB" width="720" height="480"></canvas>
      </div>
    </section>
    <pre id="log" class="log"></pre>
  </main>
`;

const canvasA = document.querySelector<HTMLCanvasElement>("#canvasA");
const canvasB = document.querySelector<HTMLCanvasElement>("#canvasB");
const logEl = document.querySelector<HTMLPreElement>("#log");
if (!canvasA || !canvasB || !logEl) throw new Error("Missing collab example elements");

const logs: string[] = [];
let delivering = false;

function log(line: string): void {
  logs.unshift(line);
  logEl.textContent = logs.slice(0, 80).join("\n");
}

function relay(source: "A" | "B", mutation: CanvasMutation, binary: Uint8Array): void {
  if (delivering) return;
  delivering = true;
  const target = source === "A" ? runtimeB : runtimeA;
  const first = target.applyMutationBinary(binary);
  const duplicate = target.applyMutationBinary(binary);
  log(
    `${source} -> ${source === "A" ? "B" : "A"} ${mutation.event_type} first=${first.message} duplicate=${duplicate.duplicate}`,
  );
  delivering = false;
}

const runtimeA = createCanvasRuntime({
  canvas: canvasA,
  documentId: "collab-doc",
  actorId: "actor-a",
  onMutation: (mutation, binary) => relay("A", mutation, binary),
});

const runtimeB = createCanvasRuntime({
  canvas: canvasB,
  documentId: "collab-doc",
  actorId: "actor-b",
  onMutation: (mutation, binary) => relay("B", mutation, binary),
});

document.querySelector("#addA")?.addEventListener("click", () => {
  runtimeA.createRect({
    x: 80 + logs.length * 5,
    y: 90 + logs.length * 4,
    width: 140,
    height: 88,
    style: { fill: "#bfdbfe", stroke: "#1d4ed8" },
  });
});

document.querySelector("#addB")?.addEventListener("click", () => {
  runtimeB.createRect({
    x: 220 + logs.length * 5,
    y: 150 + logs.length * 4,
    width: 130,
    height: 82,
    style: { fill: "#fecaca", stroke: "#991b1b" },
  });
});

document.querySelector("#penA")?.addEventListener("click", () => {
  runtimeA.setTool("pen");
  runtimeB.setTool("none");
  log("tool: pen enabled on A");
});

document.querySelector("#penB")?.addEventListener("click", () => {
  runtimeB.setTool("pen");
  runtimeA.setTool("none");
  log("tool: pen enabled on B");
});

document.querySelector("#none")?.addEventListener("click", () => {
  runtimeA.setTool("none");
  runtimeB.setTool("none");
  log("tool: disabled on both canvases");
});
