let canvas;
let context;
let width = 1;
let height = 1;
let color = "rgb(220,90,45)";
let hot = "rgb(255,190,110)";
let particleType = "embers";
let particles = [];
let timer = 0;
let seed = 1;
let running = false;
let frameInterval = 1000 / 15;
let particleCount = 9;

const random = () => {
  seed |= 0;
  seed = seed + 0x6D2B79F5 | 0;
  let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
  value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
};

function resetParticles() {
  particles = Array.from({ length: Math.max(1, particleCount) }, () => ({
    x: random() * width, y: random() * height, vx: (random() - .5) * 7,
    vy: 7 + random() * 12, size: 1.7 + random() * 3.6, phase: random() * Math.PI * 2,
  }));
}

function stopLoop() {
  running = false;
  clearTimeout(timer);
  timer = 0;
}

function schedule() {
  if (!running || timer) return;
  timer = setTimeout(() => {
    timer = 0;
    if (!running) return;
    draw();
    schedule();
  }, frameInterval);
}

function drawParticle(particle, time) {
  const wave = Math.sin(time * .001 + particle.phase) * 8;
  const alpha = .16 + (Math.sin(time * .0016 + particle.phase) + 1) * .11;
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.fillStyle = particleType === "light" || particleType === "stars" ? hot : color;
  context.lineWidth = Math.max(1, particle.size * .22);
  context.translate(particle.x + wave, particle.y);
  if (particleType === "blood") {
    context.beginPath(); context.moveTo(0, -particle.size); context.bezierCurveTo(particle.size, 0, particle.size * .7, particle.size, 0, particle.size); context.bezierCurveTo(-particle.size * .7, particle.size, -particle.size, 0, 0, -particle.size); context.fill();
  } else if (particleType === "snow") {
    for (let angle = 0; angle < 3; angle += 1) { context.rotate(Math.PI / 3); context.beginPath(); context.moveTo(-particle.size, 0); context.lineTo(particle.size, 0); context.stroke(); }
  } else if (["plague", "poison", "brew"].includes(particleType)) {
    context.beginPath(); context.arc(0, 0, particle.size, 0, Math.PI * 2); context.stroke();
  } else if (["light", "stars"].includes(particleType)) {
    context.beginPath(); context.moveTo(-particle.size * 1.6, 0); context.lineTo(particle.size * 1.6, 0); context.moveTo(0, -particle.size * 1.6); context.lineTo(0, particle.size * 1.6); context.stroke();
  } else if (["leaves", "feathers"].includes(particleType)) {
    context.rotate(time * .0003 + particle.phase); context.beginPath(); context.ellipse(0, 0, particle.size * 1.5, particle.size * .55, 0, 0, Math.PI * 2); context.fill();
  } else if (["embers", "fel", "storm", "steel"].includes(particleType)) {
    context.rotate(-.7); context.fillRect(-particle.size * 1.6, -.6, particle.size * 3.2, 1.2);
  } else if (["mist", "water", "shadow"].includes(particleType)) {
    context.beginPath(); context.moveTo(-particle.size * 2, 0); context.bezierCurveTo(-particle.size, -3, particle.size, 3, particle.size * 2, 0); context.stroke();
  } else if (["runes", "void"].includes(particleType)) {
    context.rotate(time * .0004 + particle.phase); context.strokeRect(-particle.size, -particle.size, particle.size * 2, particle.size * 2);
  } else if (particleType === "coins") {
    context.beginPath(); context.ellipse(0, 0, particle.size, particle.size * .35, time * .002 + particle.phase, 0, Math.PI * 2); context.stroke();
  } else {
    context.beginPath(); context.arc(0, 0, particle.size * .55, 0, Math.PI * 2); context.fill();
  }
  context.restore();
}

function draw() {
  if (!context) return;
  const time = performance.now();
  context.clearRect(0, 0, width, height);
  for (const particle of particles) {
    const falls = ["blood", "snow", "leaves", "feathers", "coins"].includes(particleType);
    particle.y += particle.vy * .033 * (falls ? 1 : -1);
    particle.x += particle.vx * .033;
    if (particle.y < -12) particle.y = height + 12;
    if (particle.y > height + 12) particle.y = -12;
    if (particle.x < -12) particle.x = width + 12;
    if (particle.x > width + 12) particle.x = -12;
    drawParticle(particle, time);
  }
}

self.onmessage = ({ data }) => {
  if (data.type === "start") {
    canvas = data.canvas; context = canvas.getContext("2d", { alpha: true });
    color = data.color; hot = data.hot; particleType = data.particleType; seed = data.seed || 1;
    width = data.width; height = data.height; canvas.width = width; canvas.height = height;
    frameInterval = 1000 / Math.max(1, data.fps || 15);
    particleCount = Math.max(1, data.particleCount || (width < 420 ? 4 : 7));
    stopLoop(); resetParticles(); draw();
  } else if (data.type === "resize" && canvas) {
    width = data.width; height = data.height; canvas.width = width; canvas.height = height; resetParticles();
    if (running) draw();
  } else if (data.type === "resume") {
    if (!running) { running = true; draw(); schedule(); }
  } else if (data.type === "pause") {
    stopLoop();
  }
};
