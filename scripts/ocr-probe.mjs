import { createWorker } from "tesseract.js";

/**
 * Runs OCR on one local file and prints what came back. A development tool for
 * looking at real paperwork before deciding what the code should do with it.
 *
 *   node scripts/ocr-probe.mjs "private/Kallelse.jpg"
 *   node scripts/ocr-probe.mjs "private/Kallelse.jpg" --words
 */

const file = process.argv[2];
if (!file) {
  console.error("Ange en fil: node scripts/ocr-probe.mjs <sökväg> [--words]");
  process.exit(1);
}
const showWords = process.argv.includes("--words");

const started = Date.now();
const worker = await createWorker("swe", undefined, { langPath: "vendor/tessdata", cachePath: "vendor/tessdata", gzip: false });
try {
  const { data } = await worker.recognize(file, {}, { blocks: true });

  const lines = (data.blocks ?? [])
    .flatMap((block) => block.paragraphs ?? [])
    .flatMap((paragraph) => paragraph.lines ?? []);
  const words = lines.flatMap((line) => line.words ?? []);

  console.log(`tid: ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log(`sidsäkerhet: ${Number(data.confidence ?? 0).toFixed(1)}`);
  console.log(`rader: ${lines.length}, ord med koordinater: ${words.length}`);

  const weak = words.filter((word) => word.confidence < 60).length;
  console.log(`osäkra ord (<60): ${weak} (${((weak / (words.length || 1)) * 100).toFixed(0)} %)`);

  console.log("\n--- text ---");
  console.log(
    (data.text ?? "")
      .split("\n")
      .filter((line) => line.trim())
      .slice(0, showWords ? 100 : 15)
      .join("\n"),
  );

  if (showWords) {
    console.log("\n--- ord och rutor ---");
    for (const word of words.slice(0, 40)) {
      const { x0, y0, x1, y1 } = word.bbox;
      console.log(
        `${String(Math.round(word.confidence)).padStart(3)}  ${x0},${y0}-${x1},${y1}  ${word.text}`,
      );
    }
  }
} finally {
  await worker.terminate();
}
