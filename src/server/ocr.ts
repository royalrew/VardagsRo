import "server-only";

import { readImageGeometry } from "@/server/image-geometry";
import type { OcrPage } from "@/server/source-location";

/**
 * Reads a document's words and where they stand, using Tesseract in this
 * process. Nothing is sent anywhere: the alternative was a cloud document
 * service, which would make the children's school paperwork pass through one
 * more processor for a gain that only shows on the rare table-shaped document.
 *
 * Language data is versioned in `vendor/tessdata`. Without it Tesseract fetches
 * it from a CDN into the working directory on first use, which on Railway means
 * a download in every new container.
 */

const LANGUAGE = "swe";
const TESSDATA_PATH = "vendor/tessdata";

/** Below this a word is noise more often than text, and it drags a match askew. */
const MINIMUM_WORD_CONFIDENCE = 40;

interface TesseractWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface RecognizedPage extends OcrPage {
  /** Whole-page text, for the excerpt matcher to fall back on. */
  text: string;
  /** Tesseract's own confidence in the page, 0-100. */
  pageConfidence: number;
  mirrored: boolean;
}

/**
 * Returns the page, or null when the document cannot be read this way. PDFs are
 * null for now: they need rendering to an image first, and the overwhelming
 * majority of what this family uploads is a photograph of a piece of paper.
 *
 * Null is a supported answer. The caller shows the whole document instead of a
 * highlight, which is what the concept demands when an exact area is unknown.
 */
export async function recognizeDocumentPage(
  bytes: Uint8Array,
  mimeType: string,
): Promise<RecognizedPage | null> {
  if (!mimeType.startsWith("image/")) return null;

  const geometry = readImageGeometry(bytes);
  if (!geometry) return null;

  // Imported here rather than at module load: Tesseract pulls in a WebAssembly
  // runtime, and a route that never reads a document should not pay for it.
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(LANGUAGE, undefined, {
    langPath: TESSDATA_PATH,
    cachePath: TESSDATA_PATH,
    gzip: false,
  });

  try {
    const { data } = await worker.recognize(Buffer.from(bytes), {}, { blocks: true });
    const lines = (data.blocks ?? [])
      .flatMap((block) => block.paragraphs ?? [])
      .flatMap((paragraph) => paragraph.lines ?? []);

    return {
      widthPx: geometry.widthPx,
      heightPx: geometry.heightPx,
      rotation: geometry.rotation,
      mirrored: geometry.mirrored,
      text: data.text ?? "",
      pageConfidence: Number(data.confidence ?? 0),
      lines: lines
        .map((line) => ({
          words: ((line.words ?? []) as TesseractWord[])
            .filter(
              (word) =>
                word.text.trim().length > 0 && word.confidence >= MINIMUM_WORD_CONFIDENCE,
            )
            .map((word) => ({
              text: word.text,
              box: word.bbox,
              confidence: word.confidence,
            })),
        }))
        .filter((line) => line.words.length > 0),
    };
  } finally {
    await worker.terminate();
  }
}
