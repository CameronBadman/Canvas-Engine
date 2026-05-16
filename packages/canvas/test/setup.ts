const noop = (): void => {};

const context = {
  beginPath: noop,
  clearRect: noop,
  closePath: noop,
  ellipse: noop,
  fill: noop,
  lineTo: noop,
  moveTo: noop,
  quadraticCurveTo: noop,
  rect: noop,
  restore: noop,
  rotate: noop,
  save: noop,
  scale: noop,
  setTransform: noop,
  stroke: noop,
  translate: noop,
  set fillStyle(_value: string) {},
  set strokeStyle(_value: string) {},
  set lineWidth(_value: number) {},
  set lineCap(_value: CanvasLineCap) {},
  set lineJoin(_value: CanvasLineJoin) {},
  set globalAlpha(_value: number) {},
  set imageSmoothingEnabled(_value: boolean) {},
};

HTMLCanvasElement.prototype.getContext = function getContext() {
  return context as unknown as CanvasRenderingContext2D;
};

HTMLCanvasElement.prototype.setPointerCapture = noop;
HTMLCanvasElement.prototype.releasePointerCapture = noop;
HTMLCanvasElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: this.width,
    bottom: this.height,
    width: this.width,
    height: this.height,
    toJSON: () => ({}),
  };
};
