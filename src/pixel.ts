import type { PixelSize } from './types';

export const GRID: Record<PixelSize, [number, number]> = {
  Chunky: [48, 36],
  Classic: [96, 72],
  Fine: [160, 120],
};

/** Which part of the picture to keep: zoom 1 = the largest 4:3 area, cx/cy = centre as a fraction of the image */
export interface Crop {
  zoom: number;
  cx: number;
  cy: number;
}
export const NO_CROP: Crop = { zoom: 1, cx: 0.5, cy: 0.5 };

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't open that image."));
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
}

export function cropBox(w: number, h: number, ratio: number, crop: Crop = NO_CROP) {
  let sw = w / h > ratio ? h * ratio : w;
  let sh = sw / ratio;
  sw /= crop.zoom;
  sh /= crop.zoom;
  const sx = Math.min(Math.max(crop.cx * w - sw / 2, 0), w - sw);
  const sy = Math.min(Math.max(crop.cy * h - sh / 2, 0), h - sh);
  return { sx, sy, sw, sh };
}

/** A little extra saturation and contrast so small pixel art doesn't turn muddy */
function punch(img: ImageData, sat = 1.18, con = 1.08): void {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    for (let c = 0; c < 3; c++) {
      const v = (l + (d[i + c] - l) * sat - 128) * con + 128;
      d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
}

/** Median-cut colour reduction so the result reads as real pixel art */
function quantize(img: ImageData, colours: number): void {
  const px: number[][] = [];
  for (let i = 0; i < img.data.length; i += 4) px.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
  let boxes: number[][][] = [px];
  while (boxes.length < colours) {
    let bi = -1;
    let bestRange = -1;
    let bestCh = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const p of b) {
          if (p[c] < lo) lo = p[c];
          if (p[c] > hi) hi = p[c];
        }
        if (hi - lo > bestRange) {
          bestRange = hi - lo;
          bi = i;
          bestCh = c;
        }
      }
    });
    if (bi < 0 || bestRange <= 4) break;
    const b = boxes[bi].slice().sort((a, z) => a[bestCh] - z[bestCh]);
    const mid = b.length >> 1;
    boxes = [...boxes.slice(0, bi), b.slice(0, mid), b.slice(mid), ...boxes.slice(bi + 1)];
  }
  const palette = boxes.map((b) => {
    const s = [0, 0, 0];
    for (const p of b) {
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
    }
    return s.map((v) => Math.round(v / b.length));
  });
  for (let i = 0; i < img.data.length; i += 4) {
    let best = palette[0];
    let bd = Infinity;
    for (const c of palette) {
      const d = (img.data[i] - c[0]) ** 2 * 0.3 + (img.data[i + 1] - c[1]) ** 2 * 0.59 + (img.data[i + 2] - c[2]) ** 2 * 0.11;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    img.data[i] = best[0];
    img.data[i + 1] = best[1];
    img.data[i + 2] = best[2];
    img.data[i + 3] = 255;
  }
}

/** Turns any picture into a small 4:3 pixel-art PNG (a few KB, so it fits easily in local storage). */
export async function pixelate(src: string | HTMLImageElement, size: PixelSize, crop: Crop = NO_CROP, colours = 32): Promise<string> {
  const img = typeof src === 'string' ? await loadImage(src) : src;
  const [w, h] = GRID[size];
  const { sx, sy, sw, sh } = cropBox(img.naturalWidth, img.naturalHeight, 4 / 3, crop);
  // Step down gradually so each pixel is a true average of the area it covers
  let canvas = document.createElement('canvas');
  let cw = Math.max(w, Math.min(Math.round(sw), w * 8));
  let ch = Math.round(cw * 0.75);
  canvas.width = cw;
  canvas.height = ch;
  let ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  while (cw / 2 >= w) {
    const next = document.createElement('canvas');
    next.width = Math.max(w, Math.round(cw / 2));
    next.height = Math.max(h, Math.round(ch / 2));
    const nctx = next.getContext('2d')!;
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(canvas, 0, 0, next.width, next.height);
    canvas = next;
    ctx = nctx;
    cw = next.width;
    ch = next.height;
  }
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(canvas, 0, 0, w, h);
  const data = octx.getImageData(0, 0, w, h);
  punch(data);
  quantize(data, colours);
  octx.putImageData(data, 0, 0);
  return out.toDataURL('image/png');
}

/** Crops a photo to 4:3 and shrinks it to a JPEG small enough to store. */
export async function shrinkPhoto(src: string | HTMLImageElement, crop: Crop = NO_CROP, maxW = 560, quality = 0.78): Promise<string> {
  const img = typeof src === 'string' ? await loadImage(src) : src;
  const { sx, sy, sw, sh } = cropBox(img.naturalWidth, img.naturalHeight, 4 / 3, crop);
  const w = Math.min(maxW, Math.round(sw));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round(w * 0.75);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

/** Keeps the whole photo (no crop) but limits its size before sending it to Gemini. */
export async function prepareForUpload(src: string, maxSide = 1600): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}


/** Scales a small pixel thumbnail up (crisp, nearest-neighbour) so Gemini can see its style clearly. */
export async function referenceImage(src: string, width = 384): Promise<string> {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round((width * img.naturalHeight) / img.naturalWidth);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
