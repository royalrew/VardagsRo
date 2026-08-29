import { ArrowRight, CheckCircle2, CircleDashed } from "lucide-react";
import Link from "next/link";

export function ProjectAreaScaffold({
  eyebrow,
  title,
  description,
  primaryLabel,
  features,
  nextSteps,
}: {
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  features: Array<{ title: string; detail: string }>;
  nextSteps: string[];
}) {
  return (
    <>
      <header className="p100-page-head">
        <div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
        <div className="p100-head-actions"><Link href="/projekt-100" className="p100-button-secondary">Till översikten</Link><span className="p100-button p100-button-planned">{primaryLabel} <ArrowRight /></span></div>
      </header>
      <div className="p100-area-grid">
        <section className="p100-area-main">
          <div className="p100-area-status"><CircleDashed /><span><small>Arbetsyta etablerad</small><strong>Grundflödet byggs i nästa leverans</strong></span></div>
          <div className="p100-feature-grid">{features.map((feature) => <article key={feature.title}><CheckCircle2 /><div><strong>{feature.title}</strong><p>{feature.detail}</p></div></article>)}</div>
        </section>
        <aside className="p100-next-panel"><span>Nästa steg här</span><ol>{nextSteps.map((step) => <li key={step}>{step}</li>)}</ol><p>Sidan har en egen route redan nu. Funktionerna kopplas på i den ordning som anges i huvudplanen.</p></aside>
      </div>
    </>
  );
}
