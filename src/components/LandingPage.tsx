import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import {
  LANDING_CONTACT,
  LANDING_PRINCIPLES,
  LANDING_PROSE,
  LANDING_STACK,
  LANDING_STEPS,
} from "@/components/landing-contracts";

/**
 * The public face. Everything on this page is static: it takes no session,
 * touches no database and names no member of the household, so it can be shown
 * to a stranger without deciding anything about the family first.
 */

export function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-top">
        <span className="landing-brand">
          <BrandMark size={34} />
          <strong>Vardagsro</strong>
        </span>
        <Link className="landing-login" href="/login">
          Logga in
        </Link>
      </header>

      <section className="landing-hero">
        <h1>Familjens gemensamma minne.</h1>
        <p className="landing-lead">{LANDING_PROSE[0]}</p>
        <p className="landing-principle">AI tolkar. Familjen bestämmer.</p>
      </section>

      <section className="landing-problem">
        <h2>Problemet det är byggt för</h2>
        <p>{LANDING_PROSE[1]}</p>
      </section>

      <section className="landing-steps">
        <h2>Så fungerar det</h2>
        <ol>
          {LANDING_STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="landing-step-number">{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-principles">
        <h2>Byggt för att gå sönder på rätt sätt</h2>
        <p className="landing-section-lead">{LANDING_PROSE[2]}</p>
        <div className="landing-grid">
          {LANDING_PRINCIPLES.map((principle) => (
            <article key={principle.title}>
              <h3>{principle.title}</h3>
              <p>{principle.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-maker">
        <h2>Byggt av Jimmy</h2>
        <p>{LANDING_PROSE[3]}</p>
        <p>{LANDING_PROSE[4]}</p>
        <ul className="landing-stack">
          {LANDING_STACK.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <ul className="landing-contact">
          {LANDING_CONTACT.map((link) => (
            <li key={link.href}>
              <span>{link.label}</span>
              <a
                href={link.href}
                rel={link.href.startsWith("http") ? "me noopener" : undefined}
              >
                {link.text}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <footer className="landing-foot">
        <p>Vardagsro är ett privat familjesystem. Inloggning krävs.</p>
        <Link className="landing-login" href="/login">
          Logga in
        </Link>
      </footer>
    </div>
  );
}
