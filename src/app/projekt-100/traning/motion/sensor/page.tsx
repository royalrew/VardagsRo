import type { Metadata } from "next";

import { MotionSensorClient } from "@/components/project100/motion/MotionSensorClient";

export const metadata: Metadata = {
  title: "iPhone Motion Sensor | Projekt 100",
  description: "Trådlös rörelsekamera för Projekt 100 Motion Engine och TV-träning",
};

export default async function Project100MotionSensorPage({
  searchParams,
}: {
  searchParams: Promise<{ pair?: string }>;
}) {
  const params = await searchParams;
  const initialPairingCode = params.pair || "";

  return <MotionSensorClient initialPairingCode={initialPairingCode} />;
}
