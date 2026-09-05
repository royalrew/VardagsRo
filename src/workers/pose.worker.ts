/// <reference lib="webworker" />

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

import {
  motionWorkerFailureMessage,
  nextMotionTimestampMs,
  type MotionLandmark,
  type MotionPoseSnapshot,
} from "@/lib/motion-engine";
import { MotionLandmarkStabilizer } from "@/lib/motion-stabilizer";

type WorkerRequest =
  | {
      type: "init";
      modelAssetPath: string;
      wasmRoot: string;
    }
  | {
      type: "frame";
      capturedAtMs: number;
      bufferWaitMs: number;
      frame: ImageBitmap;
      preparationMs: number;
      timestampMs: number;
    }
  | { type: "simulate-error" }
  | { type: "dispose" };

type WorkerResponse =
  | { type: "ready"; delegate: "GPU" | "CPU" }
  | { type: "pose"; snapshot: MotionPoseSnapshot }
  | { type: "error"; message: string };

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let poseLandmarker: PoseLandmarker | null = null;
let lastTimestampMs = -1;
const stabilizer = new MotionLandmarkStabilizer();

function respond(message: WorkerResponse) {
  workerScope.postMessage(message);
}

async function createPoseLandmarker(
  wasmRoot: string,
  modelAssetPath: string,
): Promise<"GPU" | "CPU"> {
  const vision = await FilesetResolver.forVisionTasks(wasmRoot);
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath, delegate },
    runningMode: "VIDEO" as const,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  });

  try {
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, options("GPU"));
    return "GPU";
  } catch {
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, options("CPU"));
    return "CPU";
  }
}

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      poseLandmarker?.close();
      poseLandmarker = null;
      lastTimestampMs = -1;
      stabilizer.reset();
      const delegate = await createPoseLandmarker(message.wasmRoot, message.modelAssetPath);
      respond({ type: "ready", delegate });
      return;
    }

    if (message.type === "dispose") {
      poseLandmarker?.close();
      poseLandmarker = null;
      stabilizer.reset();
      workerScope.close();
      return;
    }

    if (message.type === "simulate-error") {
      throw new Error("Simulerat workerfel för återstartstest.");
    }

    if (!poseLandmarker) {
      message.frame.close();
      throw new Error("Posemotorn är inte initierad.");
    }

    const timestampMs = nextMotionTimestampMs(message.timestampMs, lastTimestampMs);
    lastTimestampMs = timestampMs;
    const inferenceStartedAt = performance.now();
    try {
      let rawLandmarks: MotionLandmark[] = [];
      poseLandmarker.detectForVideo(message.frame, timestampMs, (result) => {
        rawLandmarks = (result.landmarks[0] ?? []).map((landmark) => ({
          x: landmark.x,
          y: landmark.y,
          z: landmark.z,
          visibility: landmark.visibility ?? null,
        }));
      });
      const inferenceMs = performance.now() - inferenceStartedAt;
      const stabilized = stabilizer.stabilize(rawLandmarks, timestampMs);
      respond({
        type: "pose",
        snapshot: {
          capturedAtMs: message.capturedAtMs,
          bufferWaitMs: message.bufferWaitMs,
          inferenceMs,
          preparationMs: message.preparationMs,
          landmarks: stabilized.landmarks,
          stabilization: stabilized.diagnostics,
          timestampMs,
        },
      });
    } finally {
      message.frame.close();
    }
  } catch (error) {
    respond({
      type: "error",
      message: motionWorkerFailureMessage(error),
    });
  }
};
