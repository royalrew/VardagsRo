"use client";

import { Bike, Camera } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function CyclingWarmup({ missionId, onComplete }: {
  missionId: string;
  onComplete: () => void;
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;
    const interval = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  return (
    <section className="p100-next-training-step p100-warmup-step" aria-labelledby="p100-warmup-step-title">
      <div>
        <span>Steg 1 · Uppvärmning</span>
        <h4 id="p100-warmup-step-title">Lugn spinning · cirka 5 minuter</h4>
        <p>Cykla i ditt eget tempo. När du känner dig redo fortsätter du med styrkepasset.</p>
        {startedAt !== null ? (
          <strong className="p100-warmup-clock" role="timer" aria-label="Tid sedan uppvärmningen startade">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </strong>
        ) : null}
      </div>
      <div className="p100-next-training-actions">
        {startedAt === null ? (
          <>
            <Link className="p100-warmup-primary" href={`/projekt-100/traning/motion?exercise=cycling&camera=auto&warmupMission=${encodeURIComponent(missionId)}`}>
              <Camera /> Starta spinning med kamera
            </Link>
            <button type="button" onClick={() => setStartedAt(Date.now())}><Bike /> Cykla utan kamera</button>
            <button type="button" onClick={onComplete}>Jag är redan uppvärmd</button>
          </>
        ) : (
          <button className="p100-warmup-primary" type="button" onClick={onComplete}>
            Klar · fortsätt till styrkan
          </button>
        )}
      </div>
      <small>Kameran startar på nästa sida och följer pedalvarv, kadens och tid. Uppvärmningen räknas inte som ett styrkeset.</small>
    </section>
  );
}
