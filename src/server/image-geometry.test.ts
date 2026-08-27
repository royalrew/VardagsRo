import { describe, expect, it } from "vitest";

import { readImageGeometry } from "@/server/image-geometry";

function jpeg({ width = 1200, height = 800, orientation }: {
  width?: number;
  height?: number;
  orientation?: number;
} = {}): Uint8Array {
  const parts: number[] = [0xff, 0xd8];

  if (orientation !== undefined) {
    // APP1 with a minimal little-endian TIFF header holding one orientation tag.
    const tiff = [
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // "II", 42, first IFD at 8
      0x01, 0x00, // one entry
      0x12, 0x01, // tag 0x0112, orientation
      0x03, 0x00, // type short
      0x01, 0x00, 0x00, 0x00, // one value
      orientation, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, // next IFD: none
    ];
    const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
    const length = payload.length + 2;
    parts.push(0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...payload);
  }

  // SOF0: length, precision, height, width, components
  parts.push(
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  );
  return new Uint8Array(parts);
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width, false);
  new DataView(bytes.buffer).setUint32(20, height, false);
  return bytes;
}

describe("readImageGeometry", () => {
  it("reads the size of a JPEG", () => {
    expect(readImageGeometry(jpeg({ width: 1200, height: 800 }))).toMatchObject({
      widthPx: 1200,
      heightPx: 800,
      rotation: 0,
      mirrored: false,
    });
  });

  it("reads the size of a PNG", () => {
    expect(readImageGeometry(png(640, 480))).toMatchObject({
      widthPx: 640,
      heightPx: 480,
      rotation: 0,
    });
  });

  it("carries the rotation a phone photo is displayed with", () => {
    // Orientation 6 is the ordinary portrait photo: stored sideways, shown upright.
    expect(readImageGeometry(jpeg({ orientation: 6 }))).toMatchObject({
      rotation: 90,
      mirrored: false,
    });
    expect(readImageGeometry(jpeg({ orientation: 3 }))).toMatchObject({ rotation: 180 });
    expect(readImageGeometry(jpeg({ orientation: 8 }))).toMatchObject({ rotation: 270 });
  });

  it("notices a mirrored image, which flips a highlight sideways", () => {
    expect(readImageGeometry(jpeg({ orientation: 2 }))).toMatchObject({
      rotation: 0,
      mirrored: true,
    });
    expect(readImageGeometry(jpeg({ orientation: 7 }))).toMatchObject({
      rotation: 270,
      mirrored: true,
    });
  });

  it("treats a missing or unknown orientation as upright", () => {
    expect(readImageGeometry(jpeg())).toMatchObject({ rotation: 0, mirrored: false });
    expect(readImageGeometry(jpeg({ orientation: 99 }))).toMatchObject({ rotation: 0 });
  });

  it("keeps the stored size when the image is rotated, not the displayed size", () => {
    // The viewer applies the rotation. Storing the swapped size here would make
    // the boxes agree with the picture but disagree with the coordinates OCR
    // measured, which is the harder bug to find.
    expect(readImageGeometry(jpeg({ width: 1200, height: 800, orientation: 6 }))).toMatchObject({
      widthPx: 1200,
      heightPx: 800,
    });
  });

  it("says nothing about a PDF or anything else it cannot place", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0, 0, 0, 0, 0]);

    expect(readImageGeometry(pdf)).toBeNull();
    expect(readImageGeometry(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
