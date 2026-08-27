/**
 * Reads the size and orientation of an image without decoding it.
 *
 * Boxes from OCR are pixel coordinates in the image as stored. The browser,
 * however, shows a phone photo the way its EXIF orientation says it should. If
 * the two disagree, every highlight lands in the wrong place — rotated, and on
 * the wrong side of the page. The orientation therefore has to be read and
 * carried alongside the coordinates, which is also what the concept requires of
 * a stored bbox.
 */

export interface ImageGeometry {
  /** Pixel size as stored, before any orientation is applied. */
  widthPx: number;
  heightPx: number;
  /** Clockwise degrees a viewer applies when showing the image: 0, 90, 180 or 270. */
  rotation: 0 | 90 | 180 | 270;
  /** True when the image is also mirrored. Rare, but it flips a highlight. */
  mirrored: boolean;
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** EXIF orientation 1-8, in the order the specification defines them. */
const ORIENTATIONS: Record<number, { rotation: ImageGeometry["rotation"]; mirrored: boolean }> = {
  1: { rotation: 0, mirrored: false },
  2: { rotation: 0, mirrored: true },
  3: { rotation: 180, mirrored: false },
  4: { rotation: 180, mirrored: true },
  5: { rotation: 90, mirrored: true },
  6: { rotation: 90, mirrored: false },
  7: { rotation: 270, mirrored: true },
  8: { rotation: 270, mirrored: false },
};

function readUint16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian
    ? (bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)) >>>
        0
    : ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
        0;
}

/** Finds the EXIF orientation tag inside a JPEG APP1 segment, or 1 when absent. */
function jpegOrientation(bytes: Uint8Array, payloadStart: number, payloadLength: number): number {
  const exifHeader = payloadStart;
  // "Exif\0\0"
  if (
    bytes[exifHeader] !== 0x45 ||
    bytes[exifHeader + 1] !== 0x78 ||
    bytes[exifHeader + 2] !== 0x69 ||
    bytes[exifHeader + 3] !== 0x66
  ) {
    return 1;
  }

  const tiff = exifHeader + 6;
  if (tiff + 8 > bytes.length) return 1;
  const littleEndian = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const firstIfd = readUint32(bytes, tiff + 4, littleEndian);
  const ifd = tiff + firstIfd;
  if (ifd + 2 > bytes.length) return 1;

  const entries = readUint16(bytes, ifd, littleEndian);
  const limit = Math.min(entries, 512);
  for (let index = 0; index < limit; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > bytes.length || entry + 12 > payloadStart + payloadLength) break;
    if (readUint16(bytes, entry, littleEndian) === 0x0112) {
      return readUint16(bytes, entry + 8, littleEndian);
    }
  }
  return 1;
}

function jpegGeometry(bytes: Uint8Array): ImageGeometry | null {
  let orientation = 1;
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = readUint16(bytes, offset + 2, false);
    if (length < 2) return null;

    // The length field covers itself, so the payload starts two bytes after it.
    if (marker === 0xe1) orientation = jpegOrientation(bytes, offset + 4, length - 2);

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (offset + 9 > bytes.length) return null;
      const heightPx = readUint16(bytes, offset + 5, false);
      const widthPx = readUint16(bytes, offset + 7, false);
      const applied = ORIENTATIONS[orientation] ?? ORIENTATIONS[1];
      return { widthPx, heightPx, ...applied };
    }
    offset += 2 + length;
  }
  return null;
}

function pngGeometry(bytes: Uint8Array): ImageGeometry | null {
  if (bytes.length < 24) return null;
  return {
    widthPx: readUint32(bytes, 16, false),
    heightPx: readUint32(bytes, 20, false),
    rotation: 0,
    mirrored: false,
  };
}

function webpGeometry(bytes: Uint8Array): ImageGeometry | null {
  if (bytes.length < 30) return null;
  const format = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (format === "VP8 ") {
    return {
      widthPx: readUint16(bytes, 26, true) & 0x3fff,
      heightPx: readUint16(bytes, 28, true) & 0x3fff,
      rotation: 0,
      mirrored: false,
    };
  }
  if (format === "VP8L") {
    const bits = readUint32(bytes, 21, true);
    return {
      widthPx: (bits & 0x3fff) + 1,
      heightPx: ((bits >> 14) & 0x3fff) + 1,
      rotation: 0,
      mirrored: false,
    };
  }
  if (format === "VP8X") {
    return {
      widthPx: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
      heightPx: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1,
      rotation: 0,
      mirrored: false,
    };
  }
  return null;
}

/**
 * Returns the geometry, or null when the bytes are not an image this product
 * accepts. Null means the caller must fall back to page level rather than place
 * a rectangle it cannot position.
 */
export function readImageGeometry(bytes: Uint8Array): ImageGeometry | null {
  if (bytes.length < 16) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegGeometry(bytes);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return pngGeometry(bytes);
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return webpGeometry(bytes);
  }
  return null;
}
