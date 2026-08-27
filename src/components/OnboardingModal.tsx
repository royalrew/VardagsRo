"use client";

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  FileUp,
  Link2,
  MessageCircleQuestion,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { Avatar } from "@/components/ui";
import type { FamilyPerson } from "@/lib/types";

const LAST_STEP = 3;
const STEP_LABELS = [
  "Välkommen till Vardagsro",
  "Er familj",
  "Så fungerar dokumentflödet",
  "Kalender och frågor",
] as const;

export function OnboardingModal({
  open,
  familyName,
  people,
  onDismiss,
}: {
  open: boolean;
  familyName: string;
  people: FamilyPerson[];
  onDismiss: () => void;
}) {
  const [step, setStep] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, step]);

  if (!open) return null;

  function dismiss() {
    setStep(0);
    onDismiss();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;

    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="onboarding-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) dismiss();
      }}
    >
      <section
        ref={panelRef}
        className="onboarding-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="onboarding-header">
          <div className="onboarding-brand">
            <BrandMark size={42} />
            <span>Vardagsro</span>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={dismiss}
            aria-label="Hoppa över introduktionen"
          >
            <X size={19} />
          </button>
        </header>

        <div className="onboarding-content">
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {STEP_LABELS[step]}, steg {step + 1} av {LAST_STEP + 1}
          </p>
          {step === 0 ? (
            <div className="onboarding-step onboarding-welcome">
              <BrandMark size={82} label="Vardagsro" />
              <p className="eyebrow">Familjens gemensamma minne</p>
              <h2 ref={titleRef} id="onboarding-title" tabIndex={-1}>Välkommen, {familyName}</h2>
              <p>
                Här samlar ni lappar, scheman, uppgifter och tider — och kan fråga
                vad som gäller utan att leta i familjens alla chattar och papper.
              </p>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="onboarding-step">
              <span className="onboarding-step-icon"><UsersRound size={24} /></span>
              <p className="eyebrow">Er familj</p>
              <h2 ref={titleRef} id="onboarding-title" tabIndex={-1}>Vilka finns i Vardagsro?</h2>
              <p>Allt kopplas till rätt person så att kalendern och svaren blir begripliga.</p>
              <div className="onboarding-family-list">
                {people.map((person) => (
                  <div className="onboarding-person" key={person.id}>
                    <Avatar person={person} />
                    <span><strong>{person.name}</strong><small>{person.role}</small></span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="onboarding-step">
              <span className="onboarding-step-icon"><ShieldCheck size={24} /></span>
              <p className="eyebrow">AI hjälper — ni bestämmer</p>
              <h2 ref={titleRef} id="onboarding-title" tabIndex={-1}>Från lapp till familjekoll</h2>
              <div className="onboarding-flow" aria-label="Så fungerar dokumentflödet">
                <div><FileUp size={22} /><strong>1. Lägg in</strong><span>Foto, PDF eller screenshot</span></div>
                <ChevronRight size={18} aria-hidden="true" />
                <div><FileSearch size={22} /><strong>2. AI föreslår</strong><span>Tider och uppgifter hittas</span></div>
                <ChevronRight size={18} aria-hidden="true" />
                <div><Check size={22} /><strong>3. Ni godkänner</strong><span>Inget sparas blint</span></div>
              </div>
              <p className="onboarding-safety-note">
                Modellen får aldrig skriva direkt i familjedatan. En människa granskar
                alltid förslaget först.
              </p>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="onboarding-step">
              <span className="onboarding-step-icon"><CalendarDays size={24} /></span>
              <p className="eyebrow">Klart att använda</p>
              <h2 ref={titleRef} id="onboarding-title" tabIndex={-1}>Se veckan. Fråga familjens AI.</h2>
              <div className="onboarding-feature-grid">
                <div><CalendarDays size={22} /><strong>Kalender</strong><span>Dra tider, se veckan och hitta krockar.</span></div>
                <div><MessageCircleQuestion size={22} /><strong>Fråga</strong><span>“Jobbar pappa på söndag?” eller “Vad ska med?”</span></div>
                <div><Link2 size={22} /><strong>Källor</strong><span>Öppna dokumentet bakom svaret.</span></div>
              </div>
              <p>Prova gärna att börja med en skollapp eller ett arbetsschema.</p>
            </div>
          ) : null}
        </div>

        <footer className="onboarding-footer">
          <div className="onboarding-progress" aria-label={`Steg ${step + 1} av ${LAST_STEP + 1}`}>
            {Array.from({ length: LAST_STEP + 1 }, (_, index) => (
              <span
                key={index}
                className={index === step ? "active" : ""}
                aria-current={index === step ? "step" : undefined}
              />
            ))}
          </div>
          <div className="onboarding-actions">
            {step === 0 ? (
              <button type="button" className="button button-ghost" onClick={dismiss}>
                Hoppa över
              </button>
            ) : (
              <button type="button" className="button button-ghost" onClick={() => setStep((current) => current - 1)}>
                <ChevronLeft size={17} /> Tillbaka
              </button>
            )}
            {step < LAST_STEP ? (
              <button type="button" className="button button-primary" onClick={() => setStep((current) => current + 1)}>
                Nästa <ChevronRight size={17} />
              </button>
            ) : (
              <button type="button" className="button button-primary" onClick={dismiss}>
                Börja använda Vardagsro <Check size={17} />
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
