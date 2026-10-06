const BEST_KEY = "uspt-towers-best";

type Phase = "start" | "playing" | "dying" | "gameover";

interface Block {
  x: number;
  y: number;
  size: number;
  hue: number;
}

interface CurrentBlock extends Block {
  dir: 1 | -1;
  speed: number;
  vy: number;
  falling: boolean;
}

interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Surface {
  x: number;
  w: number;
  top: number;
}

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const titleEl = document.getElementById("title") as HTMLHeadingElement;
const msgEl = document.getElementById("msg") as HTMLParagraphElement;
const statsEl = document.getElementById("stats") as HTMLParagraphElement;
const actionBtn = document.getElementById("action") as HTMLButtonElement;

let phase: Phase = "start";
let blocks: Block[] = [];
let current: CurrentBlock | null = null;
let cimiento: Platform | null = null;
let score = 0;
let best = readBest();
let cam = 0;
let dyingT = 0;
let W = 0;
let H = 0;
let startSize = 0;
let minSize = 0;

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeBest(value: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // storage unavailable; keep in-memory best
  }
}

function layout(): void {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  startSize = Math.min(W * 0.3, H * 0.16);
  minSize = Math.max(8, startSize * 0.15);
  cimiento = makeCimiento();
}

function makeCimiento(): Platform {
  const w = Math.min(W - 12, Math.max(W * 0.5, W - 2 * startSize + startSize * 0.4));
  const h = Math.max(startSize * 0.4, 18);
  return { x: W / 2, y: H * 0.74, w, h };
}

function sizeFor(n: number): number {
  return Math.max(minSize, startSize / (1 + n * 0.05));
}

function speedFor(n: number, size: number): number {
  const ratio = startSize / size;
  return Math.min(W * 0.42 * (1 + n * 0.05) * Math.pow(ratio, 0.8), W * 2.4);
}

function spawnY(): number {
  return H * 0.25 + cam;
}

function spawn(): void {
  const n = score;
  const size = sizeFor(n);
  const x = Math.min(Math.max(W / 2, size / 2), W - size / 2);
  current = {
    x,
    y: spawnY(),
    size,
    hue: (275 + n * 21) % 360,
    dir: Math.random() < 0.5 ? 1 : -1,
    speed: speedFor(n, size),
    vy: 0,
    falling: false,
  };
}

function showStart(): void {
  phase = "start";
  titleEl.textContent = "TORRES";
  msgEl.textContent = "Presiona ESPACIO (o haz clic) para soltar el bloque";
  statsEl.classList.add("hidden");
  actionBtn.textContent = "START";
  overlay.classList.remove("hidden");
}

function showGameOver(): void {
  titleEl.textContent = "GAME OVER";
  msgEl.textContent = "La torre resistió hasta acá";
  statsEl.textContent = `PUNTOS  ${score}   ·   RÉCORD  ${best}`;
  statsEl.classList.remove("hidden");
  actionBtn.textContent = "REINICIAR";
  overlay.classList.remove("hidden");
}

function startGame(): void {
  phase = "playing";
  blocks = [];
  cimiento = makeCimiento();
  score = 0;
  cam = 0;
  dyingT = 0;
  spawn();
  overlay.classList.add("hidden");
}

function drop(): void {
  if (current && !current.falling) {
    current.falling = true;
  }
}

function act(): void {
  if (phase === "start" || phase === "gameover") {
    startGame();
  } else if (phase === "playing") {
    drop();
  }
}

function surfaces(): Surface[] {
  const list: Surface[] = [];
  if (cimiento && blocks.length === 0) {
    list.push({ x: cimiento.x, w: cimiento.w, top: cimiento.y - cimiento.h / 2 });
  }
  for (const b of blocks) {
    list.push({ x: b.x, w: b.size, top: b.y - b.size / 2 });
  }
  return list;
}

function updateCamera(dt: number): void {
  let top = Number.POSITIVE_INFINITY;
  for (const s of surfaces()) {
    top = Math.min(top, s.top);
  }
  const target = Math.min(0, top - H * 0.5);
  cam += (target - cam) * Math.min(1, dt * 6);
}

function updateFalling(c: CurrentBlock, dt: number): void {
  const prevBottom = c.y + c.size / 2;
  c.vy += H * 3 * dt;
  c.y += c.vy * dt;
  const newBottom = c.y + c.size / 2;

  let hitTop: number | null = null;
  for (const s of surfaces()) {
    const overlap =
      Math.min(c.x + c.size / 2, s.x + s.w / 2) - Math.max(c.x - c.size / 2, s.x - s.w / 2);
    if (overlap >= -0.01 && prevBottom <= s.top + 0.01 && newBottom >= s.top) {
      if (hitTop === null || s.top < hitTop) {
        hitTop = s.top;
      }
    }
  }

  if (hitTop !== null) {
    c.y = hitTop - c.size / 2;
    blocks.push({ x: c.x, y: c.y, size: c.size, hue: c.hue });
    score += 1;
    spawn();
    return;
  }

  if (c.y - c.size / 2 - cam > H) {
    phase = "dying";
    dyingT = 0;
  }
}

function update(dt: number): void {
  if (phase === "playing" && current) {
    const c = current;
    if (c.falling) {
      updateFalling(c, dt);
    } else {
      c.x += c.dir * c.speed * dt;
      if (c.x - c.size / 2 <= 0) {
        c.x = c.size / 2;
        c.dir = 1;
      } else if (c.x + c.size / 2 >= W) {
        c.x = W - c.size / 2;
        c.dir = -1;
      }
    }
  } else if (phase === "dying") {
    dyingT += dt;
    if (dyingT >= 0.4) {
      phase = "gameover";
      if (score > best) {
        best = score;
        writeBest(best);
      }
      showGameOver();
    }
  }
  updateCamera(dt);
}

function roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawBackground(): void {
  ctx.fillStyle = "#07060b";
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(
    W / 2,
    H * 0.78,
    0,
    W / 2,
    H * 0.78,
    Math.max(W, H) * 0.75,
  );
  glow.addColorStop(0, "rgba(139, 92, 246, 0.12)");
  glow.addColorStop(1, "rgba(139, 92, 246, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const step = 80;
  ctx.strokeStyle = "rgba(167, 139, 250, 0.06)";
  ctx.lineWidth = 1;
  const first = Math.ceil(cam / step) * step;
  for (let wy = first; wy < cam + H; wy += step) {
    const sy = wy - cam;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(W, sy);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(168, 85, 247, 0.22)";
  ctx.setLineDash([5, 9]);
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBlock(x: number, sy: number, size: number, hue: number): void {
  if (sy + size / 2 < -60 || sy - size / 2 > H + 60) {
    return;
  }
  const color = `hsl(${hue} 90% 62%)`;
  const r = Math.max(3, size * 0.12);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  roundRectPath(x - size / 2, sy - size / 2, size, size, r);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawCimiento(): void {
  if (!cimiento) {
    return;
  }
  const x = cimiento.x - cimiento.w / 2;
  const top = cimiento.y - cimiento.h / 2 - cam;
  const bottom = top + cimiento.h;
  if (top > H + 80 || bottom < -80) {
    return;
  }
  const radius = Math.min(8, cimiento.h / 3);
  const inset = cimiento.w * 0.1;
  const footH = cimiento.h * 1.5;
  const armed = blocks.length === 0;

  ctx.save();
  ctx.globalAlpha = armed ? 1 : 0.6;
  ctx.fillStyle = "rgba(30, 22, 58, 0.95)";
  ctx.beginPath();
  ctx.moveTo(x + inset, bottom - 3);
  ctx.lineTo(x + cimiento.w - inset, bottom - 3);
  ctx.lineTo(x + cimiento.w - inset * 2.4, bottom + footH);
  ctx.lineTo(x + inset * 2.4, bottom + footH);
  ctx.closePath();
  ctx.fill();

  const body = ctx.createLinearGradient(0, top, 0, bottom);
  body.addColorStop(0, "#4c34a0");
  body.addColorStop(0.45, "#2c1f5c");
  body.addColorStop(1, "#170f33");
  if (armed) {
    ctx.shadowColor = "rgba(168, 85, 247, 0.95)";
    ctx.shadowBlur = 24;
  }
  ctx.fillStyle = body;
  roundRectPath(x, top, cimiento.w, cimiento.h, radius);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(148, 116, 224, 0.55)";
  ctx.lineWidth = 1;
  roundRectPath(x, top, cimiento.w, cimiento.h, radius);
  ctx.stroke();

  const seg = Math.max(1, Math.floor(cimiento.w / Math.max(48, startSize)));
  for (let i = 1; i < seg; i += 1) {
    const sx = x + (cimiento.w / seg) * i;
    ctx.beginPath();
    ctx.moveTo(sx, top + cimiento.h * 0.3);
    ctx.lineTo(sx, bottom - cimiento.h * 0.18);
    ctx.stroke();
  }

  if (armed) {
    ctx.strokeStyle = "rgba(233, 213, 255, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, top + 1.5);
    ctx.lineTo(x + cimiento.w - radius, top + 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHud(): void {
  const fontSize = Math.max(16, Math.round(H * 0.032));
  ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textBaseline = "top";
  ctx.save();
  ctx.shadowColor = "#a855f7";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#f3e8ff";
  ctx.textAlign = "left";
  ctx.fillText(`PUNTOS  ${score}`, 18, 16);
  ctx.textAlign = "right";
  ctx.fillStyle = "#c4b5fd";
  ctx.fillText(`RÉCORD  ${best}`, W - 18, 16);
  ctx.restore();

  if (phase === "playing" && score < 3) {
    const alpha = 0.55 - score * 0.15;
    ctx.font = `600 ${Math.max(13, Math.round(H * 0.022))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(196, 181, 253, ${alpha})`;
    ctx.fillText("ESPACIO PARA SOLTAR", W / 2, H * 0.5 - fontSize * 2.6);
    ctx.textAlign = "left";
  }
}

function render(): void {
  drawBackground();
  drawCimiento();
  for (const b of blocks) {
    drawBlock(b.x, b.y - cam, b.size, b.hue);
  }
  if (phase === "playing" && current) {
    drawBlock(current.x, current.y - cam, current.size, current.hue);
  }
  drawHud();
}

let last = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (e.repeat) {
      return;
    }
    act();
  }
});

canvas.addEventListener("pointerdown", () => {
  act();
});

actionBtn.addEventListener("click", (e) => {
  (e.currentTarget as HTMLButtonElement).blur();
  act();
});

window.addEventListener("resize", layout);

layout();
showStart();
render();
requestAnimationFrame(frame);

function runTest(): void {
  const results: string[] = [];
  const check = (name: string, ok: boolean): void => {
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}`);
  };
  const stepUntil = (cond: () => boolean, max = 6000): number => {
    let i = 0;
    while (!cond() && i < max) {
      update(1 / 120);
      i += 1;
    }
    return i;
  };
  const landAt = (x: number): void => {
    if (current) {
      current.x = Math.min(Math.max(x, current.size / 2), W - current.size / 2);
    }
    drop();
    const prev = score;
    stepUntil(() => score > prev || phase !== "playing");
  };

  startGame();
  if (current) {
    current.x = current.size / 2;
  }
  drop();
  stepUntil(() => score > 0 || phase !== "playing");
  check("el cimiento asegura el primer bloque en los extremos", score === 1);

  startGame();
  landAt(W / 2);
  check("primer bloque apilado (base)", score === 1 && blocks.length === 1);
  check(
    "el primer bloque descansa sobre el cimiento",
    cimiento !== null &&
      blocks.length === 1 &&
      Math.abs(blocks[0].y + blocks[0].size / 2 - (cimiento.y - cimiento.h / 2)) < 0.5,
  );
  check("el cimiento deja de ser superficie tras el primer bloque", surfaces().length === 1);

  const size0 = blocks[0]?.size ?? 0;
  const speed0 = current?.speed ?? 0;
  landAt(blocks[blocks.length - 1]?.x ?? W / 2);
  check("segundo bloque apilado", score === 2 && blocks.length === 2);
  check("el tamaño disminuye", (blocks[1]?.size ?? 0) < size0);
  check("la velocidad aumenta", (current?.speed ?? 0) > speed0);

  for (let i = 0; i < 12 && cam >= -5; i += 1) {
    landAt(blocks[blocks.length - 1]?.x ?? W / 2);
  }
  check("la cámara sube al rebasar la mitad", cam < -5);

  if (current) {
    current.x = current.size / 2;
  }
  drop();
  stepUntil(() => phase === "gameover");
  check("caída al vacío = game over", phase === "gameover");
  check("mejor puntaje persistido", best >= score && score >= 2);

  const div = document.createElement("div");
  div.style.cssText =
    "position:fixed;top:8px;left:8px;z-index:99;background:#000;color:#0f0;font:12px monospace;padding:8px;white-space:pre;line-height:1.5";
  div.textContent = results.join("\n");
  document.body.appendChild(div);
}

if (location.hash === "#test") {
  runTest();
}
