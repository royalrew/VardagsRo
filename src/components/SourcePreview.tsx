"use client";

import { useEffect, useMemo } from "react";

import type { SourceBox } from "@/lib/types";

/**
 * Shows the uploaded page with the place a proposal was read from.
 *
 * The point is confirmation: the family should be able to see that the machine
 * read the right line before agreeing to it. When the exact place is unknown the
 * whole page is shown and said to be the whole page, because a rectangle that
 * only looks precise is worse than none.
 *
 * Boxes arrive in the space the browser paints, rotation already applied, so
 * nothing here has to know how the photograph was held.
 */
export function SourcePreview({
  file,
  boxes,
  caption,
}: {
  file: File;
  boxes: SourceBox[] | null;
  caption: string;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  // Released when the file changes or the modal closes, so a long review session
  // does not hold every picture it has shown.
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const marked = boxes && boxes.length > 0;

  return (
    <figure className="source-preview">
      <div className={`source-preview-frame${marked ? "" : " source-preview-unmarked"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Originalet du laddade upp" />
        {marked
          ? boxes.map((box, index) => (
              <span
                key={index}
                className="source-preview-box"
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.width * 100}%`,
                  height: `${box.height * 100}%`,
                }}
              />
            ))
          : null}
      </div>
      <figcaption>
        {marked ? caption : "Exakt område saknas i den här bilden. Hela sidan visas."}
      </figcaption>
    </figure>
  );
}
