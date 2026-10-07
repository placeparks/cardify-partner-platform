import sharp from "sharp"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ApiError } from "@/lib/manufacturing-contract"

// Same geometry, mask donor search and corner repair as the main site's
// utils/imageProcessing.ts. Runs once per unique source URL in the cart worker.
export const PRINT_PROCESSING_VERSION = "auto-bleed-2mm-v1"
const BLEED_SIZE_TOLERANCE_PX = 10
const yieldFrame = () => new Promise<void>(resolve => setImmediate(resolve))
let maskPromise: Promise<Buffer> | undefined
function maskBytes() {
  return maskPromise ||= readFile(join(process.cwd(), "lib", "assets", "autobleed-mask.png"))
    .catch(error => { maskPromise = undefined; throw error })
}
async function maskAt(width: number, height: number) {
  const red = await sharp(await maskBytes()).resize(width, height, { fit: "fill", kernel: "cubic" }).extractChannel(0).raw().toBuffer()
  // One mask byte per pixel keeps peak memory bounded for large print files.
  return { data: red }
}

export function detectExistingBleed(width: number, height: number): boolean {
  const standardSizes = [
    // Near the finished 63:88 aspect ratio; apply bleed rather than crop it.
    [3288, 4604],
    [750, 1050], [1156, 1618], [1500, 2100], [3000, 4200],
    [600, 838], [2976, 4157], [1488, 2079], [744, 1039],
  ]
  const preBledSizes = [
    // Client-supplied artwork already includes bleed.
    [1626, 2250],
    // 300-DPI 750x1050 artwork with approximately 3 mm bleed per edge.
    [822, 1122],
    [1088, 1480], [1162, 1632], [1262, 1714], [1632, 2220],
    [1650, 2250], [2192, 2992], [2187, 2975], [2176, 2960],
    [3264, 4440], [3276, 4460],
  ]
  const matches = ([targetWidth, targetHeight]: number[]) =>
    Math.abs(width - targetWidth) <= BLEED_SIZE_TOLERANCE_PX
      && Math.abs(height - targetHeight) <= BLEED_SIZE_TOLERANCE_PX

  if (standardSizes.some(matches)) return false
  if (preBledSizes.some(matches)) return true
  // Exact exception for the supplied resize of the client's pre-bled image.
  // Applying the table's +/-10px tolerance here also captures 1146x1600
  // finished-card artwork, incorrectly treating its border as existing bleed.
  if (width === 1156 && height === 1600) return true
  if (width < 1001) return false

  const ratio = width / height
  return Math.abs(ratio - (63 / 88)) >= Math.abs(ratio - 0.735)
}

function inferExistingBleedMm(width: number, height: number): number {
  const ratio = width / height
  const twoMmRatio = 67 / 92
  const threeMmRatio = 69 / 94

  // Existing-bleed XML/print-service artwork commonly uses 69x94 mm.
  // Infer its source bleed from geometry so every later reprocessing path
  // (borders, trim, mode changes, and checkout preparation) preserves the
  // same final 2 mm target instead of silently treating 3 mm as 2 mm.
  return Math.abs(ratio - threeMmRatio) < Math.abs(ratio - twoMmRatio) ? 3 : 2
}

export async function extrudeMaskedPixels(
  source: { data: Uint8Array },
  mask: { data: Uint8Array },
  width: number,
  height: number
) {
  const pixels = source.data
  const maskPixels = mask.data
  // Cache donors per column and per row. A run of masked pixels used to
  // rescan the same strip for every pixel (including entire empty rows and
  // columns), making large images disproportionately expensive.
  const lastAbove = new Int32Array(width).fill(-1)
  const nextBelow = new Int32Array(width).fill(-1)
  let lastYield = Date.now()

  for (let startY = 0; startY < height; startY += 60) {
    const endY = Math.min(startY + 60, height)
    for (let y = startY; y < endY; y += 1) {
      let lastLeft = -1
      let nextRight = -1
      const rowEnd = (y + 1) * width * 4
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4
        if (maskPixels[index >> 2] >= 128) {
          lastAbove[x] = index
          lastLeft = index
          continue
        }

        let vertical = lastAbove[x]
        if (y < height / 2) {
          if (nextBelow[x] < index) {
            let candidate = index + width * 4
            while (candidate < pixels.length && maskPixels[candidate >> 2] < 128) candidate += width * 4
            // pixels.length is a sentinel: this column has no donor below.
            nextBelow[x] = candidate < pixels.length ? candidate : pixels.length
          }
          vertical = nextBelow[x] < pixels.length ? nextBelow[x] : -1
        }

        let horizontal = lastLeft
        if (x < width / 2) {
          if (nextRight < index) {
            let candidate = index + 4
            while (candidate < rowEnd && maskPixels[candidate >> 2] < 128) candidate += 4
            nextRight = candidate
          }
          horizontal = nextRight < rowEnd ? nextRight : -1
        }

        if (vertical < 0 && horizontal < 0) {
          const directionY = y < height / 2 ? 1 : -1
          const directionX = x < width / 2 ? 1 : -1
          let candidateX = x + directionX
          let candidateY = y + directionY
          while (candidateX >= 0 && candidateX < width && candidateY >= 0 && candidateY < height) {
            const candidate = (candidateY * width + candidateX) * 4
            if (maskPixels[candidate >> 2] >= 128) {
              horizontal = candidate
              break
            }
            candidateX += directionX
            candidateY += directionY
          }
        }

        for (let channel = 0; channel < 3; channel += 1) {
          if (horizontal >= 0 && vertical >= 0) {
            pixels[index + channel] = (pixels[horizontal + channel] + pixels[vertical + channel]) >> 1
          } else if (horizontal >= 0 || vertical >= 0) {
            pixels[index + channel] = pixels[Math.max(horizontal, vertical) + channel]
          }
        }
        pixels[index + 3] = 255
      }
    }
    // Keep the UI responsive without paying a timer delay for every 60 rows
    // when the cached lookups finish in only a fraction of a millisecond.
    if (Date.now() - lastYield >= 12) {
      await yieldFrame()
      lastYield = Date.now()
    }
  }

  return source
}

function patchCorners(imageData: { data: Uint8Array }, width: number, height: number, size = 40) {
  const pixels = imageData.data
  const indexOf = (x: number, y: number) => (y * width + x) * 4
  const copy = (targetX: number, targetY: number, sourceX: number, sourceY: number) => {
    const target = indexOf(targetX, targetY)
    const source = indexOf(sourceX, sourceY)
    pixels[target] = pixels[source]
    pixels[target + 1] = pixels[source + 1]
    pixels[target + 2] = pixels[source + 2]
    pixels[target + 3] = 255
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (x + y < size) copy(x, y, size - y, size - x)
      const rightOffset = width - 1 - x
      if (x + y < size) copy(rightOffset, y, width - 1 - (size - y), size - x)
      const bottomOffset = height - 1 - y
      if (x + y < size) copy(x, bottomOffset, size - y, height - 1 - (size - x))
      if (x + y < size) copy(rightOffset, bottomOffset, width - 1 - (size - y), height - 1 - (size - x))
    }
  }
}

export async function preparePrintArtwork(bytes: Buffer) {
  const metadata = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" }).metadata()
  const width = metadata.width!, height = metadata.height!
  if (detectExistingBleed(width, height)) {
    const sourceBleed = inferExistingBleedMm(width, height)
    if (sourceBleed === 2) return bytes // Preserve supplied 2 mm bleed, including its exact pixels.
    const left = Math.round((sourceBleed - 2) * width / (63 + sourceBleed * 2))
    const top = Math.round((sourceBleed - 2) * height / (88 + sourceBleed * 2))
    return sharp(bytes).extract({ left, top, width: width - left * 2, height: height - top * 2 }).png().toBuffer()
  }
  const bleedX = Math.round(2 * width / 63), bleedY = Math.round(2 * height / 88)
  const outWidth = width + bleedX * 2, outHeight = height + bleedY * 2
  if (outWidth * outHeight > 40_000_000) throw new ApiError(422, "image_pixels_exceeded", "Artwork plus 2 mm bleed exceeds 40 MP")
  const { data } = await sharp(bytes).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  await extrudeMaskedPixels({ data }, await maskAt(width, height), width, height)
  const output = Buffer.alloc(outWidth * outHeight * 4)
  // Extend the prepared edges without resizing the center artwork.
  for (let y = 0; y < outHeight; y++) {
    const sy = Math.min(Math.max(y - bleedY, 0), height - 1)
    for (let x = 0; x < outWidth; x++) {
      const sx = Math.min(Math.max(x - bleedX, 0), width - 1)
      const from = (sy * width + sx) * 4, to = (y * outWidth + x) * 4
      output[to] = data[from]; output[to + 1] = data[from + 1]; output[to + 2] = data[from + 2]; output[to + 3] = 255
    }
    // Preserve center alpha exactly as the site's canvas draw does.
    if (y >= bleedY && y < height + bleedY) data.copy(output, (y * outWidth + bleedX) * 4, sy * width * 4, (sy + 1) * width * 4)
  }
  patchCorners({ data: output }, outWidth, outHeight, Math.max(1, Math.round(2.5 * (width / 63 + height / 88) / 2)))
  await extrudeMaskedPixels({ data: output }, await maskAt(outWidth, outHeight), outWidth, outHeight)
  return sharp(output, { raw: { width: outWidth, height: outHeight, channels: 4 } }).png().toBuffer()
}
