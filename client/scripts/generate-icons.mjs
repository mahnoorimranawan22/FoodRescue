/**
 * Generate FoodRescue PWA icons — zero dependencies.
 * Draws a forest-green rounded square with a cream leaf and warm-orange
 * accent, then hand-encodes PNG chunks (IHDR/IDAT/IEND) with zlib.
 *
 * Run: node scripts/generate-icons.mjs  → writes public/pwa-192.png,
 * public/pwa-512.png and public/apple-touch-icon.png
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");

/* ── minimal PNG encoder ─────────────────────────────────────────────── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // rows with filter byte 0
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── icon drawing (RGBA canvas) ──────────────────────────────────────── */
const FOREST = [20, 43, 18]; // #142B12
const FOREST_LIGHT = [45, 90, 39]; // #2D5A27
const CREAM = [250, 248, 245]; // #FAF8F5
const ORANGE = [224, 109, 59]; // #E06D3B

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.22; // rounded-square corner radius
  const center = size / 2;
  const set = (x, y, [R, G, B], a = 255) => {
    const i = (y * size + x) * 4;
    px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = a;
  };
  const inRounded = (x, y) => {
    const cx = Math.min(Math.max(x, r), size - r);
    const cy = Math.min(Math.max(y, r), size - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  // leaf shape: two circle arcs (vesica) tilted, drawn as an ellipse rotated 45°
  const inLeaf = (x, y) => {
    const dx = (x - center) / (size * 0.30);
    const dy = (y - center) / (size * 0.16);
    const u = (dx + dy) / Math.SQRT2;
    const v = (dx - dy) / Math.SQRT2;
    return u * u + v * v <= 1;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inRounded(x, y)) { set(x, y, [0, 0, 0], 0); continue; }
      // subtle diagonal two-tone background
      const bg = x + y < size ? FOREST : FOREST_LIGHT;
      set(x, y, bg);
      // orange dot bottom-right of the leaf
      const ddx = x - size * 0.68, ddy = y - size * 0.70;
      if (ddx * ddx + ddy * ddy <= (size * 0.09) ** 2) set(x, y, ORANGE);
      else if (inLeaf(x, y)) set(x, y, CREAM);
    }
  }
  return px;
}

mkdirSync(PUBLIC, { recursive: true });
for (const [name, size] of [["pwa-192.png", 192], ["pwa-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(join(PUBLIC, name), encodePNG(size, size, drawIcon(size)));
  console.log(`[icons] wrote public/${name} (${size}x${size})`);
}
