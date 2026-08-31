"use client";

import {
  ArrowLeftRight,
  ChevronsLeftRight,
  Columns,
  Eye,
  EyeOff,
  ImageIcon,
  Lock,
  Sliders,
  Sparkles,
  SplitSquareVertical,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import type { Project100MediaItem } from "@/lib/project100-media";
import {
  calculateBodyComparison,
  type BodyComparisonStats,
} from "@/lib/project100-body-compare";

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatPhotoLabel(
  photo: Project100MediaItem,
  weight: number | undefined,
): string {
  const dateStr = dateFormatter.format(new Date(`${photo.capturedOn}T12:00:00`));
  const weightStr = weight !== undefined ? ` · ${weight} kg` : "";
  return `${dateStr}${weightStr}`;
}

export function BodyComparisonSlider({
  photos,
  weightsByDay,
  revealPhotos,
  onToggleReveal,
}: {
  photos: Project100MediaItem[];
  weightsByDay: Map<string, number>;
  revealPhotos: boolean;
  onToggleReveal: () => void;
}) {
  // Sort photos chronologically
  const sortedPhotos = useMemo(() => {
    return [...photos].sort((a, b) => a.capturedOn.localeCompare(b.capturedOn));
  }, [photos]);

  const [beforeId, setBeforeId] = useState<string>("");
  const [afterId, setAfterId] = useState<string>("");
  const [sliderPos, setSliderPos] = useState<number>(50); // 0 to 100 %
  const [fadePos, setFadePos] = useState<number>(50); // 0 to 100 %
  const [viewMode, setViewMode] = useState<"split" | "side" | "fade">("split");
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const beforePhoto = useMemo(() => {
    if (beforeId) {
      const match = sortedPhotos.find((p) => p.id === beforeId);
      if (match) return match;
    }
    return sortedPhotos[0] ?? null;
  }, [sortedPhotos, beforeId]);

  const afterPhoto = useMemo(() => {
    if (afterId) {
      const match = sortedPhotos.find((p) => p.id === afterId);
      if (match) return match;
    }
    return sortedPhotos[sortedPhotos.length - 1] ?? null;
  }, [sortedPhotos, afterId]);

  const stats: BodyComparisonStats | null = useMemo(
    () => calculateBodyComparison(beforePhoto, afterPhoto, weightsByDay),
    [beforePhoto, afterPhoto, weightsByDay],
  );

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const clampedPercentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(Math.round(clampedPercentage * 10) / 10);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    updatePosition(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updatePosition(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (viewMode === "split") {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSliderPos((prev) => Math.max(0, prev - 5));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSliderPos((prev) => Math.min(100, prev + 5));
      } else if (e.key === "Home") {
        e.preventDefault();
        setSliderPos(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setSliderPos(100);
      }
    } else if (viewMode === "fade") {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFadePos((prev) => Math.max(0, prev - 5));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setFadePos((prev) => Math.min(100, prev + 5));
      }
    }
  };

  const handleSwap = () => {
    setBeforeId(afterId);
    setAfterId(beforeId);
  };

  const handleQuickPreset = (preset: "start_latest" | "30d" | "90d") => {
    if (sortedPhotos.length < 2) return;
    const latest = sortedPhotos[sortedPhotos.length - 1];
    setAfterId(latest.id);

    if (preset === "start_latest") {
      setBeforeId(sortedPhotos[0].id);
      return;
    }

    const targetDaysAgo = preset === "30d" ? 30 : 90;
    const latestDate = new Date(`${latest.capturedOn}T12:00:00Z`).getTime();
    const targetTime = latestDate - targetDaysAgo * 24 * 60 * 60 * 1000;

    let closest = sortedPhotos[0];
    let minDiff = Infinity;
    for (const p of sortedPhotos) {
      if (p.id === latest.id) continue;
      const pTime = new Date(`${p.capturedOn}T12:00:00Z`).getTime();
      const diff = Math.abs(pTime - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      }
    }
    setBeforeId(closest.id);
  };

  if (photos.length < 2) {
    return null;
  }

  return (
    <div className="p100-body-compare-card">
      <header className="p100-compare-header">
        <div className="p100-compare-title">
          <Sparkles />
          <div>
            <h3>Före & Efter – Jämförelse</h3>
            <p>Jämför kroppsbilder över tid i samma vinkel och belysning.</p>
          </div>
        </div>

        <div className="p100-compare-toolbar">
          <div className="p100-view-mode-toggle" role="group" aria-label="Visningsläge">
            <button
              type="button"
              className={viewMode === "split" ? "active" : ""}
              onClick={() => setViewMode("split")}
              title="Skiljelinje (dragbar)"
            >
              <SplitSquareVertical />
              <span>Skiljelinje</span>
            </button>
            <button
              type="button"
              className={viewMode === "side" ? "active" : ""}
              onClick={() => setViewMode("side")}
              title="Sida vid sida"
            >
              <Columns />
              <span>Sida vid sida</span>
            </button>
            <button
              type="button"
              className={viewMode === "fade" ? "active" : ""}
              onClick={() => setViewMode("fade")}
              title="Övertoning"
            >
              <Sliders />
              <span>Övertoning</span>
            </button>
          </div>

          <button
            type="button"
            className={`p100-btn p100-btn-sm ${revealPhotos ? "p100-btn-active" : ""}`}
            onClick={onToggleReveal}
            title={revealPhotos ? "Dölj bilder" : "Visa bilder"}
          >
            {revealPhotos ? <EyeOff /> : <Eye />}
            <span>{revealPhotos ? "Dölj" : "Visa"}</span>
          </button>
        </div>
      </header>

      {/* Quick Presets Bar */}
      <div className="p100-compare-presets-bar">
        <span className="p100-presets-label">Snabbval:</span>
        <button
          type="button"
          className={`p100-preset-chip ${beforeId === sortedPhotos[0]?.id && afterId === sortedPhotos[sortedPhotos.length - 1]?.id ? "active" : ""}`}
          onClick={() => handleQuickPreset("start_latest")}
        >
          Start vs Senaste
        </button>
        {sortedPhotos.length >= 3 ? (
          <>
            <button
              type="button"
              className="p100-preset-chip"
              onClick={() => handleQuickPreset("30d")}
            >
              Senaste 30d
            </button>
            <button
              type="button"
              className="p100-preset-chip"
              onClick={() => handleQuickPreset("90d")}
            >
              Senaste 90d
            </button>
          </>
        ) : null}
      </div>

      {/* Selectors & Delta Stat Bar */}
      <div className="p100-compare-controls">
        <div className="p100-photo-selector-group">
          <div className="p100-field">
            <label htmlFor="before-photo-select">Före (Start)</label>
            <select
              id="before-photo-select"
              value={beforeId}
              onChange={(e) => setBeforeId(e.target.value)}
            >
              {sortedPhotos.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatPhotoLabel(p, weightsByDay.get(p.capturedOn))}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="p100-swap-btn"
            onClick={handleSwap}
            title="Växla Före och Efter"
            aria-label="Växla Före och Efter"
          >
            <ArrowLeftRight />
          </button>

          <div className="p100-field">
            <label htmlFor="after-photo-select">Efter (Utfall)</label>
            <select
              id="after-photo-select"
              value={afterId}
              onChange={(e) => setAfterId(e.target.value)}
            >
              {sortedPhotos.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatPhotoLabel(p, weightsByDay.get(p.capturedOn))}
                </option>
              ))}
            </select>
          </div>
        </div>

        {stats ? (
          <div className="p100-compare-stats-chips">
            <div className="p100-stat-chip">
              <span>Tidsrymd:</span>
              <strong>{Math.abs(stats.daysDiff)} dagar</strong>
            </div>
            {stats.weightDeltaKg !== null ? (
              <div className="p100-stat-chip">
                <span>Viktförändring:</span>
                <strong className={stats.weightDeltaKg > 0 ? "gain" : "loss"}>
                  {stats.weightDeltaKg > 0 ? `+${stats.weightDeltaKg}` : stats.weightDeltaKg} kg
                </strong>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Interactive Visual Canvas */}
      <div className="p100-compare-canvas-wrapper">
        {!revealPhotos ? (
          <div className="p100-compare-locked-state">
            <Lock />
            <h4>Kroppsbilder är dolda</h4>
            <p>Tryck på Visa-knappen för att låsa upp bildjämförelsen.</p>
            <button
              type="button"
              className="p100-btn p100-btn-primary"
              onClick={onToggleReveal}
            >
              <Eye /> Visa bilder
            </button>
          </div>
        ) : (
          <>
            {viewMode === "split" && beforePhoto && afterPhoto ? (
              <div
                ref={containerRef}
                className="p100-split-slider-container"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                tabIndex={0}
                role="slider"
                aria-label="Före och efter skiljelinje"
                aria-valuenow={sliderPos}
                aria-valuemin={0}
                aria-valuemax={100}
                onKeyDown={handleKeyDown}
              >
                {/* Background: After image */}
                <div className="p100-split-image-after">
                  {afterPhoto.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={afterPhoto.previewUrl} alt="Efter" draggable={false} />
                  ) : (
                    <div className="p100-photo-fallback"><ImageIcon /></div>
                  )}
                  <span className="p100-image-badge after">
                    Efter: {formatPhotoLabel(afterPhoto, weightsByDay.get(afterPhoto.capturedOn))}
                  </span>
                </div>

                {/* Foreground Overlay: Before image */}
                <div
                  className="p100-split-image-before"
                  style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                >
                  {beforePhoto.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={beforePhoto.previewUrl} alt="Före" draggable={false} />
                  ) : (
                    <div className="p100-photo-fallback"><ImageIcon /></div>
                  )}
                  <span className="p100-image-badge before">
                    Före: {formatPhotoLabel(beforePhoto, weightsByDay.get(beforePhoto.capturedOn))}
                  </span>
                </div>

                {/* Draggable Divider Handle */}
                <div
                  className={`p100-split-handle ${isDragging ? "dragging" : ""}`}
                  style={{ left: `${sliderPos}%` }}
                >
                  <div className="p100-split-handle-line" />
                  <div className="p100-split-handle-grip" title="Dra i skiljelinjen">
                    <ChevronsLeftRight />
                  </div>
                </div>
              </div>
            ) : null}

            {viewMode === "side" && beforePhoto && afterPhoto ? (
              <div className="p100-side-by-side-container">
                <div className="p100-side-card">
                  <header>
                    <strong>Före</strong>
                    <span>{formatPhotoLabel(beforePhoto, weightsByDay.get(beforePhoto.capturedOn))}</span>
                  </header>
                  <div className="p100-side-image-wrapper">
                    {beforePhoto.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={beforePhoto.previewUrl} alt="Före" />
                    ) : (
                      <div className="p100-photo-fallback"><ImageIcon /></div>
                    )}
                  </div>
                </div>

                <div className="p100-side-card">
                  <header>
                    <strong>Efter</strong>
                    <span>{formatPhotoLabel(afterPhoto, weightsByDay.get(afterPhoto.capturedOn))}</span>
                  </header>
                  <div className="p100-side-image-wrapper">
                    {afterPhoto.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={afterPhoto.previewUrl} alt="Efter" />
                    ) : (
                      <div className="p100-photo-fallback"><ImageIcon /></div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {viewMode === "fade" && beforePhoto && afterPhoto ? (
              <div className="p100-fade-container">
                <div className="p100-fade-image-stack">
                  <div className="p100-fade-layer base">
                    {afterPhoto.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={afterPhoto.previewUrl} alt="Efter" />
                    ) : (
                      <div className="p100-photo-fallback"><ImageIcon /></div>
                    )}
                    <span className="p100-image-badge after">Efter: 100%</span>
                  </div>
                  <div
                    className="p100-fade-layer top"
                    style={{ opacity: (100 - fadePos) / 100 }}
                  >
                    {beforePhoto.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={beforePhoto.previewUrl} alt="Före" />
                    ) : (
                      <div className="p100-photo-fallback"><ImageIcon /></div>
                    )}
                    <span className="p100-image-badge before">Före: {100 - fadePos}%</span>
                  </div>
                </div>

                <div className="p100-fade-slider-row">
                  <span>Före ({beforePhoto.capturedOn})</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={fadePos}
                    onChange={(e) => setFadePos(Number(e.target.value))}
                    onKeyDown={handleKeyDown}
                    aria-label="Övertoningsreglage"
                  />
                  <span>Efter ({afterPhoto.capturedOn})</span>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
