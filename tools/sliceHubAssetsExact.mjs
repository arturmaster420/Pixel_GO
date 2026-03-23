import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let createCanvas;
let loadImage;
try {
  ({ createCanvas, loadImage } = await import('canvas'));
} catch (error) {
  console.error('This tool requires the optional dependency \"canvas\". Install it only when you need to slice hub assets.');
  console.error(error?.message || error);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const HUB_DIR = path.join(ROOT, 'src', 'assets', 'hub');
const DEBUG_DIR = path.join(HUB_DIR, '_sliced_exact');

function findSourceSheet() {
    const files = fs.readdirSync(HUB_DIR);

    const preferred = [
        'hub_assets_sheet.png',
        'hub_assets_sheet.png.png',
        'hub_assets_sheet',
    ];

    for (const name of preferred) {
        const full = path.join(HUB_DIR, name);
        if (fs.existsSync(full)) return full;
    }

    const fallback = files.find((f) =>
        f.toLowerCase().startsWith('hub_assets_sheet')
    );

    if (!fallback) {
        throw new Error(`SOURCE SHEET NOT FOUND in:\n${HUB_DIR}`);
    }

    return path.join(HUB_DIR, fallback);
}

// Точные bbox этого sheet.
// Не approximate. Не trim. Просто точная вырезка объектов.
const SLICES = [
    { name: 'space_bg.png', x: 87, y: 56, w: 583, h: 547 },
    { name: 'hub_outer_ring.png', x: 693, y: 14, w: 657, h: 589 },
    { name: 'hub_magic_seal.png', x: 39, y: 678, w: 610, h: 549 },
    { name: 'hub_core.png', x: 685, y: 679, w: 371, h: 360 },
    { name: 'hub_bridge.png', x: 640, y: 1146, w: 700, h: 194 },
    { name: 'hub_platform.png', x: 66, y: 1345, w: 562, h: 336 },
    { name: 'hub_portal_platform.png', x: 659, y: 1359, w: 403, h: 525 },
    { name: 'hub_decor.png', x: 193, y: 1776, w: 413, h: 245 },
    { name: 'hub_side_pillar.png', x: 1074, y: 683, w: 249, h: 454 },
    { name: 'hub_flora_cluster.png', x: 1075, y: 1636, w: 264, h: 358 },
];

function crop(image, slice) {
    const canvas = createCanvas(slice.w, slice.h);
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, slice.w, slice.h);
    ctx.drawImage(
        image,
        slice.x, slice.y, slice.w, slice.h,
        0, 0, slice.w, slice.h
    );

    return canvas;
}

function saveCanvas(canvas, filePath) {
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
}

function drawFitted(ctx, image, x, y, w, h) {
    const scale = Math.min(w / image.width, h / image.height);
    const dw = Math.max(1, Math.round(image.width * scale));
    const dh = Math.max(1, Math.round(image.height * scale));
    const dx = x + Math.floor((w - dw) / 2);
    const dy = y + Math.floor((h - dh) / 2);
    ctx.drawImage(image, dx, dy, dw, dh);
}

async function buildPreview(debugFiles) {
    const cols = 3;
    const cellW = 340;
    const cellH = 280;
    const pad = 20;
    const rows = Math.ceil(debugFiles.length / cols);

    const canvas = createCanvas(
        cols * cellW + pad * 2,
        rows * cellH + pad * 2
    );
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < debugFiles.length; i++) {
        const file = debugFiles[i];
        const col = i % cols;
        const row = Math.floor(i / cols);

        const bx = pad + col * cellW;
        const by = pad + row * cellH;

        ctx.fillStyle = '#1b222c';
        ctx.fillRect(bx + 10, by + 10, cellW - 20, cellH - 55);

        const img = await loadImage(fs.readFileSync(file.path));
        drawFitted(ctx, img, bx + 18, by + 18, cellW - 36, cellH - 85);

        ctx.fillStyle = '#e6edf3';
        ctx.font = '18px sans-serif';
        ctx.fillText(file.name, bx + 16, by + cellH - 20);
    }

    const outPath = path.join(DEBUG_DIR, 'hub_slices_preview.png');
    saveCanvas(canvas, outPath);
    console.log(`OK: ${outPath}`);
}

async function main() {
    const src = findSourceSheet();
    console.log('USING SOURCE:', src);

    fs.mkdirSync(DEBUG_DIR, { recursive: true });

    const image = await loadImage(fs.readFileSync(src));
    const debugFiles = [];

    for (const slice of SLICES) {
        const canvas = crop(image, slice);

        // финальные файлы проекта
        const finalPath = path.join(HUB_DIR, slice.name);
        saveCanvas(canvas, finalPath);

        // отдельная чистая debug-папка для проверки без кеша проводника
        const debugPath = path.join(DEBUG_DIR, slice.name);
        saveCanvas(canvas, debugPath);

        debugFiles.push({ name: slice.name, path: debugPath });

        console.log(`OK: ${slice.name} -> ${slice.w}x${slice.h}`);
    }

    await buildPreview(debugFiles);

    console.log('\nDONE');
    console.log(`\nOPEN THIS FILE FOR CHECK:`);
    console.log(path.join(DEBUG_DIR, 'hub_slices_preview.png'));
}

main().catch((err) => {
    console.error('\nERROR:\n', err);
    process.exit(1);
});