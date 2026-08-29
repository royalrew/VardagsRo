"use client";

import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  Camera,
  ChevronLeft,
  Dumbbell,
  LayoutDashboard,
  Menu,
  Plus,
  Scale,
  Settings,
  Utensils,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const groups = [
  {
    label: "Idag",
    items: [
      { href: "/projekt-100", label: "Översikt", icon: LayoutDashboard },
      { href: "/projekt-100/schema", label: "Schema", icon: CalendarDays },
    ],
  },
  {
    label: "Bygg",
    items: [
      { href: "/projekt-100/traning", label: "Träning", icon: Dumbbell },
      { href: "/projekt-100/kost", label: "Kost", icon: Utensils },
      { href: "/projekt-100/kropp", label: "Kropp", icon: Scale },
    ],
  },
  {
    label: "Reflektera",
    items: [
      { href: "/projekt-100/dagbok", label: "Dagbok", icon: BookOpen },
      { href: "/projekt-100/insikter", label: "Insikter", icon: BarChart3 },
      { href: "/projekt-100/media", label: "Media", icon: Camera },
    ],
  },
  {
    label: "Skapa",
    items: [
      { href: "/projekt-100/jarvis", label: "Jarvis", icon: Bot },
      { href: "/projekt-100/innehall", label: "Innehåll", icon: Video },
    ],
  },
] as const;

const titles: Record<string, string> = {
  "/projekt-100": "Översikt",
  "/projekt-100/schema": "Schema",
  "/projekt-100/traning": "Träning",
  "/projekt-100/kost": "Kost",
  "/projekt-100/kropp": "Kropp",
  "/projekt-100/dagbok": "Dagbok",
  "/projekt-100/insikter": "Insikter",
  "/projekt-100/media": "Media",
  "/projekt-100/jarvis": "Jarvis",
  "/projekt-100/innehall": "Innehåll",
  "/projekt-100/installningar": "Inställningar",
};

function activeFor(pathname: string, href: string) {
  return href === "/projekt-100"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function Project100Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const title = titles[pathname] ?? "Projekt 100";
  const quickLogHref = pathname.startsWith("/projekt-100/traning")
    ? "/projekt-100/traning?new=session"
    : "/projekt-100?log=check-in";

  return (
    <div className="p100-shell">
      <aside className={`p100-sidebar ${menuOpen ? "open" : ""}`}>
        <div className="p100-brand">
          <span className="p100-brand-mark">Z</span>
          <span><strong>PROJEKT 100</strong><small>Utvecklingscentral</small></span>
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Stäng meny"><X /></button>
        </div>

        <nav aria-label="Projekt 100">
          {groups.map((group) => (
            <div className="p100-nav-group" key={group.label}>
              <span>{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeFor(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}>
                    <Icon /> {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p100-sidebar-foot">
          <Link href="/projekt-100/installningar" className={activeFor(pathname, "/projekt-100/installningar") ? "active" : ""}><Settings /> Inställningar</Link>
          <Link href="/"><ChevronLeft /> Till Vardagsro</Link>
        </div>
      </aside>

      {menuOpen ? <button className="p100-scrim" aria-label="Stäng meny" onClick={() => setMenuOpen(false)} /> : null}

      <div className="p100-workspace">
        <header className="p100-topbar">
          <button className="p100-menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Öppna meny"><Menu /></button>
          <div><span>Projekt 100</span><strong>{title}</strong></div>
          <Link className="p100-quick-log" href={quickLogHref}><Plus /> Logga</Link>
        </header>
        <main className="p100-content">{children}</main>
      </div>

      <nav className="p100-mobile-nav" aria-label="Snabbnavigering">
        {[
          { href: "/projekt-100", label: "Översikt", icon: Activity },
          { href: "/projekt-100/traning", label: "Träning", icon: Dumbbell },
          { href: "/projekt-100/kost", label: "Kost", icon: Utensils },
          { href: "/projekt-100/jarvis", label: "Jarvis", icon: Bot },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeFor(pathname, item.href);
          return <Link key={item.href} href={item.href} className={active ? "active" : ""}><Icon /><span>{item.label}</span></Link>;
        })}
      </nav>
    </div>
  );
}
