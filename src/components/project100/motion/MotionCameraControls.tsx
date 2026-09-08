"use client";

import React from "react";

import type { MotionArenaLanguage } from "@/lib/motion-announcer";
import type { MotionGameDifficulty } from "@/lib/motion-game";

export type Resolution = "640x480" | "1280x720";

export interface MotionCameraControlsProps {
  resolution: Resolution;
  actualResolution: string | null;
  changingResolution: boolean;
  arenaLanguage: MotionArenaLanguage;
  difficulty: MotionGameDifficulty;
  isLive: boolean;
  status: string;
  poseVisible: boolean;
  fullBodyVisible: boolean;
  lightOkay: boolean;
  luminance: number | null;
  disabled: boolean;
  inputSource?: "webcam" | "remote-sensor";
  remotePairingCode?: string;
  onChangeInputSource?: (source: "webcam" | "remote-sensor") => void;
  onChangeResolution: (resolution: Resolution) => Promise<void> | void;
  onChangeArenaLanguage: (language: MotionArenaLanguage) => void;
  onChangeDifficulty: (difficulty: MotionGameDifficulty) => void;
}

/**
 * Collapsible sidebar panel for camera input, resolution selection,
 * arena voice/language, game difficulty, and live readiness indicators.
 */
export function MotionCameraControls({
  resolution,
  actualResolution,
  changingResolution,
  arenaLanguage,
  difficulty,
  isLive,
  status,
  poseVisible,
  fullBodyVisible,
  lightOkay,
  luminance,
  disabled,
  inputSource = "webcam",
  remotePairingCode,
  onChangeInputSource,
  onChangeResolution,
  onChangeArenaLanguage,
  onChangeDifficulty,
}: MotionCameraControlsProps): React.JSX.Element {
  return (
    <details className="p100-motion-panel p100-motion-collapsible">
      <summary>
        <span>Input</span>
        <strong>Kameraläge</strong>
      </summary>
      {onChangeInputSource ? (
        <label className="p100-motion-select">
          <span>Kamerakälla</span>
          <select
            value={inputSource}
            onChange={(event) => onChangeInputSource(event.target.value as "webcam" | "remote-sensor")}
            disabled={disabled}
          >
            <option value="webcam">💻 Datorns webbkamera (Lokal)</option>
            <option value="remote-sensor">📱 iPhone Sensor (Trådlös LAN)</option>
          </select>
          {inputSource === "remote-sensor" && remotePairingCode ? (
            <small>
              Parning aktiv · Kod: <strong>{remotePairingCode}</strong>
            </small>
          ) : null}
        </label>
      ) : null}
      {inputSource === "webcam" ? (
        <label className="p100-motion-select">
          <span>Önskad upplösning</span>
          <select
            value={resolution}
            onChange={(event) => void onChangeResolution(event.target.value as Resolution)}
            disabled={disabled}
          >
            <option value="640x480">640 × 480 · baseline</option>
            <option value="1280x720">1280 × 720 · kvalitet</option>
          </select>
          <small>
            {changingResolution
              ? "Byter kameraläge…"
              : actualResolution
              ? `Kameran levererar ${actualResolution}`
              : "Aktiveras när kameran startar"}
          </small>
        </label>
      ) : null}
      <label className="p100-motion-select">
        <span>Arena-röst & Announcer</span>
        <select
          value={arenaLanguage}
          onChange={(event) => onChangeArenaLanguage(event.target.value as MotionArenaLanguage)}
        >
          <option value="en">Engelska (Arcade Announcer · 0 ms)</option>
          <option value="sv">Svenska (Klassisk)</option>
        </select>
        <small>Lokal webbläsarsyntes utan API-kostnad.</small>
      </label>
      <label className="p100-motion-select">
        <span>Svårighetsgrad</span>
        <select
          value={difficulty}
          onChange={(event) => onChangeDifficulty(event.target.value as MotionGameDifficulty)}
        >
          <option value="easy">Lätt (Stora noder · längre tid)</option>
          <option value="medium">Medel (Klassisk balans · sparkar)</option>
          <option value="hard">Svår (Snabba noder · dubbelslag · sparkar)</option>
        </select>
        <small>
          {difficulty === "easy"
            ? "För nybörjare eller mindre barn. Gott om tid på varje mål."
            : difficulty === "medium"
            ? "Balanserat tempo med sparkar när hela kroppen syns."
            : "Maximal utmaning: kräver dubbelslag med båda händerna samtidigt!"}
        </small>
      </label>
      <div className="p100-motion-readiness">
        <span className={isLive ? "ok" : ""}><i /> Kamera</span>
        <span className={status === "running" ? "ok" : ""}><i /> Worker</span>
        <span className={poseVisible ? "ok" : ""}><i /> 33 landmarks</span>
        <span className={fullBodyVisible ? "ok" : ""}><i /> Hel kropp</span>
        <span className={lightOkay ? "ok" : luminance === null ? "" : "warn"}>
          <i /> {luminance === null ? "Ljus väntar" : lightOkay ? "Ljus bra" : "Mer ljus"}
        </span>
      </div>
    </details>
  );
}
