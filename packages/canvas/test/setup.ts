const noop = (): void => {};

const context = {
  beginPath: noop,
  clearRect: noop,
  closePath: noop,
  ellipse: noop,
  fill: noop,
  lineTo: noop,
  moveTo: noop,
  rect: noop,
  restore: noop,
  rotate: noop,
  save: noop,
  scale: noop,
  stroke: noop,
  translate: noop,
  set fillStyle(_value: string) {},
  set strokeStyle(_value: string) {},
  set lineWidth(_value: number) {},
  set lineCap(_value: CanvasLineCap) {},
  set lineJoin(_value: CanvasLineJoin) {},
};

HTMLCanvasElement.prototype.getContext = function getContext() {
  return context as unknown as CanvasRenderingContext2D;
};

HTMLCanvasElement.prototype.setPointerCapture = noop;
HTMLCanvasElement.prototype.releasePointerCapture = noop;
