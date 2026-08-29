"use client";

import {
  Bell,
  CalendarDays,
  Check,
  CircleHelp,
  Cloud,
  FileText,
  Home,
  Menu,
  Plus,
  Bug,
  KeyRound,
  LogOut,
  Settings,
  Sparkles,
  Swords,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddDocumentModal } from "@/components/AddDocumentModal";
import { AskView } from "@/components/AskView";
import { BrandMark } from "@/components/BrandMark";
import { CalendarView } from "@/components/CalendarView";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { DocumentDetailModal, EventDetailModal } from "@/components/DetailsModals";
import { DebugPanel } from "@/components/DebugPanel";
import { DocumentsView } from "@/components/DocumentsView";
import { FamilySettingsModal } from "@/components/FamilySettingsModal";
import type { PersonDraft } from "@/components/FamilySettingsModal";
import { HomeView } from "@/components/HomeView";
import { ManualEventModal } from "@/components/ManualEventModal";
import { OnboardingModal } from "@/components/OnboardingModal";
import { onboardingStorageKey } from "@/components/onboarding-contracts";
import { authClient } from "@/lib/auth-client";
import {
  clearDiagnostics,
  collectDiagnosticsReport,
  installDiagnosticsListeners,
} from "@/lib/diagnostics";
import type { DiagnosticsReport } from "@/lib/diagnostics";
import { confirmsDocumentDeletion } from "@/components/release-contracts";
import { Avatar } from "@/components/ui";
import type {
  DashboardData,
  FamilyDocument,
  FamilyDocumentFolder,
  FamilyEvent,
  FamilyPerson,
  FamilyTask,
} from "@/lib/types";

type View = "home" | "calendar" | "ask" | "documents";
type NavigationItem = {
  label: string;
  icon: typeof Home;
} & (
  | { id: View; href?: undefined }
  | { id: "project100"; href: "/projekt-100" }
);

const STORAGE_KEY = "vardagsro-v1-family-data";

const navigation: NavigationItem[] = [
  { id: "home", label: "Hem", icon: Home },
  { id: "calendar", label: "Kalender", icon: CalendarDays },
  { id: "ask", label: "Fråga", icon: Sparkles },
  { id: "documents", label: "Dokument", icon: FileText },
  { id: "project100", label: "Projekt 100", icon: Swords, href: "/projekt-100" },
];

export function FamilyApp({
  initialData,
  allowLocalDemo,
}: {
  initialData: DashboardData;
  allowLocalDemo: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(() => normalizeDashboardData(initialData));
  const [activeView, setActiveView] = useState<View>("home");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [familySettingsOpen, setFamilySettingsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [debugReport, setDebugReport] = useState<DiagnosticsReport | null>(null);
  const [eventEditor, setEventEditor] = useState<{
    event: FamilyEvent | null;
    moveProposal: boolean;
  } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<FamilyEvent | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<FamilyDocument | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // What can still be taken back. Offered beside the confirmation of a deletion,
  // because that is the moment a mistake is noticed.
  const [undoable, setUndoable] = useState<{ id: string; label: string } | null>(null);
  const hydrated = useRef(false);

  const currentPerson = data.people.find((person) => person.id === data.currentPersonId) ?? data.people[0];
  const reviewCount = data.documents.filter((document) => document.status === "needs_review").length;
  // Mitt spår is one adult's private page. A child signing in never sees the
  // way in; the endpoint behind it is scoped to the account either way, so this
  // is about not offering a door rather than about holding one shut.
  const visibleNavigation = navigation.filter(
    (item) => item.id !== "project100" || currentPerson?.personType === "adult",
  );

  useEffect(() => {
    if (!allowLocalDemo) {
      hydrated.current = true;
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const requestedHash = window.location.hash.slice(1);
      if (requestedHash === "solo") {
        router.replace("/projekt-100");
        return;
      }
      const requestedView = requestedHash as View;
      if (navigation.some((item) => item.id === requestedView && !item.href)) {
        setActiveView(requestedView);
      }
      let localData: DashboardData | null = null;
      try {
        const local = window.localStorage.getItem(STORAGE_KEY);
        if (local) {
          const parsed = JSON.parse(local) as DashboardData;
          if (parsed.people?.length && parsed.events && parsed.documents) {
            const normalized = normalizeDashboardData(parsed);
            setData(normalized);
            localData = normalized;
          }
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }

      void fetch("/api/documents")
        .then(async (response) => {
          if (!response.ok) return null;
          const payload = (await response.json()) as DashboardData | { data: DashboardData };
          return "data" in payload ? payload.data : payload;
        })
        .then((remote) => {
          if (!remote?.people?.length) return;
          if (remote.dataMode === "database" || !localData) setData(normalizeDashboardData(remote));
        })
        .catch(() => undefined);
      hydrated.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [allowLocalDemo, router]);

  useEffect(() => {
    if (!allowLocalDemo || !hydrated.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [allowLocalDemo, data]);

  useEffect(() => {
    if (!toast) return;
    // An undo offer needs time to be read and acted on, and it must disappear
    // with the message it belongs to. Left behind, it would attach itself to the
    // next toast and offer to undo something the family had stopped thinking
    // about.
    const timer = window.setTimeout(
      () => {
        setToast(null);
        setUndoable(null);
      },
      undoable ? 12_000 : 3500,
    );
    return () => window.clearTimeout(timer);
  }, [toast, undoable]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        if (window.localStorage.getItem(onboardingStorageKey(data.householdId))) return;
      } catch {
        // A blocked preference store should not hide the first-run introduction.
      }
      setOnboardingOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [data.householdId]);

  useEffect(() => installDiagnosticsListeners(), []);

  const showToast = useCallback((message: string) => setToast(message), []);

  function dismissOnboarding() {
    try {
      window.localStorage.setItem(onboardingStorageKey(data.householdId), new Date().toISOString());
    } catch {
      // The introduction can still be dismissed for this page view.
    }
    setOnboardingOpen(false);
  }

  function navigate(view: View) {
    setActiveView(view);
    setMobileMenuOpen(false);
    window.history.replaceState(null, "", view === "home" ? window.location.pathname : `#${view}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startQuestion(question: string) {
    setPendingQuestion(question);
    navigate("ask");
  }

  function handleDocumentSaved(
    document: FamilyDocument,
    events: FamilyEvent[],
    tasks: FamilyTask[],
  ) {
    setData((current) => ({
      ...current,
      documents: [document, ...current.documents.filter((item) => item.id !== document.id)],
      events: [...current.events.filter((item) => !events.some((event) => event.id === item.id)), ...events],
      tasks: [...current.tasks.filter((item) => !tasks.some((task) => task.id === item.id)), ...tasks],
    }));
    const savedParts = [
      events.length ? `${events.length} ${events.length === 1 ? "tid" : "tider"}` : null,
      tasks.length ? `${tasks.length} ${tasks.length === 1 ? "uppgift" : "uppgifter"}` : null,
    ].filter((part): part is string => Boolean(part));
    showToast(savedParts.length ? `${savedParts.join(" och ")} sparade` : "Dokumentet är sparat");
  }

  function handleEventSaved(event: FamilyEvent) {
    const alreadyExists = data.events.some((item) => item.id === event.id);
    setData((current) => {
      const previous = current.events.find((item) => item.id === event.id);
      return {
        ...current,
        events: previous
          ? current.events.map((item) => (item.id === event.id ? event : item))
          : [...current.events, event],
        documents:
          previous?.documentId && previous.documentId !== event.documentId
            ? current.documents.map((document) =>
                document.id === previous.documentId
                  ? { ...document, eventsCount: Math.max(0, document.eventsCount - 1) }
                  : document,
              )
            : current.documents,
      };
    });
    setSelectedEvent((current) => (current?.id === event.id ? event : current));
    showToast(alreadyExists ? "Kalenderposten är uppdaterad" : "Kalenderposten är sparad");
  }

  async function handleTaskToggle(task: FamilyTask, completed: boolean): Promise<boolean> {
    if (data.dataMode === "database") {
      try {
        const response = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed }),
        });
        const body: unknown = await response.json().catch(() => null);
        const savedTask =
          isRecord(body) && isFamilyTask(body.task) && body.task.id === task.id
            ? body.task
            : null;
        if (!response.ok || !savedTask) throw new Error("task update failed");

        setData((current) => ({
          ...current,
          tasks: current.tasks.map((item) => (item.id === savedTask.id ? savedTask : item)),
        }));
        showToast(completed ? "Uppgiften är klar" : "Uppgiften är öppen igen");
        return true;
      } catch {
        showToast("Uppgiften kunde inte ändras. Försök igen.");
        return false;
      }
    }

    if (!allowLocalDemo) {
      showToast("Familjens databas är inte tillgänglig.");
      return false;
    }

    const updatedTask: FamilyTask = {
      ...task,
      completedAt: completed ? new Date().toISOString() : null,
    };
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((item) => (item.id === updatedTask.id ? updatedTask : item)),
    }));
    showToast(completed ? "Uppgiften är klar" : "Uppgiften är öppen igen");
    return true;
  }

  async function deleteDocument(document: FamilyDocument) {
    const confirmed = window.confirm(
      `Radera “${document.title}” och alla tider och uppgifter som kommer från dokumentet?`,
    );
    if (!confirmed) return;

    if (data.dataMode === "database") {
      try {
        const response = await fetch(`/api/documents/${document.id}`, {
          method: "DELETE",
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !confirmsDocumentDeletion(body)) {
          throw new Error("delete not confirmed");
        }
      } catch {
        showToast("Dokumentet kunde inte raderas. Försök igen.");
        return;
      }
    } else if (!allowLocalDemo) {
      showToast("Familjens databas är inte tillgänglig.");
      return;
    }

    setSelectedDocument(null);
    setData((current) => ({
      ...current,
      documents: current.documents.filter((item) => item.id !== document.id),
      events: current.events.filter((event) => event.documentId !== document.id),
      tasks: current.tasks.filter((task) => task.documentId !== document.id),
    }));
    showToast("Dokumentet är raderat");
    void offerUndo();
  }

  async function createDocumentFolder(input: {
    name: string;
    parentId: string | null;
  }): Promise<FamilyDocumentFolder | null> {
    if (data.dataMode === "database") {
      try {
        const response = await fetch("/api/document-folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body: unknown = await response.json().catch(() => null);
        const folder = isRecord(body) && isFamilyDocumentFolder(body.folder) ? body.folder : null;
        if (!response.ok || !folder) {
          showToast(apiErrorText(body, "Mappen kunde inte skapas."));
          return null;
        }
        setData((current) => ({ ...current, folders: [...current.folders, folder] }));
        showToast("Mappen \u00e4r skapad");
        return folder;
      } catch {
        showToast("Mappen kunde inte skapas. F\u00f6rs\u00f6k igen.");
        return null;
      }
    }
    if (!allowLocalDemo) {
      showToast("Familjens databas \u00e4r inte tillg\u00e4nglig.");
      return null;
    }
    if (!localFolderChangeAllowed(data, null, input.name, input.parentId)) {
      showToast("Mappnamnet anv\u00e4nds redan p\u00e5 den platsen.");
      return null;
    }
    const now = new Date().toISOString();
    const folder: FamilyDocumentFolder = {
      id: crypto.randomUUID(),
      householdId: data.householdId,
      parentId: input.parentId,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };
    setData((current) => ({ ...current, folders: [...current.folders, folder] }));
    showToast("Mappen \u00e4r skapad");
    return folder;
  }

  async function openDebugReport() {
    setDebugReport(
      await collectDiagnosticsReport({
        dataMode: data.dataMode,
        householdId: data.householdId,
        timezone: data.timezone,
        activeView,
        counts: {
          people: data.people.length,
          events: data.events.length,
          tasks: data.tasks.length,
          documents: data.documents.length,
          folders: data.folders.length,
        },
      }),
    );
  }

  async function signOut() {
    try {
      await authClient.signOut();
    } catch {
      // The session cookie may already be gone. Either way, leave the page.
    }
    router.replace("/login");
    router.refresh();
  }

  /** Asks what can be taken back, right after something was removed. */
  async function offerUndo() {
    try {
      const response = await fetch("/api/undo", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { undo?: { id: string; label: string } | null };
      setUndoable(body.undo ?? null);
    } catch {
      // Undo is an offer, not a promise. If we cannot ask, we do not offer.
    }
  }

  async function undoLastDeletion() {
    if (!undoable) return;
    const entry = undoable;
    setUndoable(null);
    try {
      const response = await fetch("/api/undo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entry.id }),
      });
      const body = (await response.json()) as {
        error?: string;
        restoredEvents?: number;
        originalFileLost?: boolean;
      };
      if (!response.ok) throw new Error(body.error ?? "Det gick inte att ångra.");

      // The file really is gone: it was removed from storage before the row was.
      // Saying so is the honest half of an undo that cannot be complete.
      const times = body.restoredEvents
        ? ` med ${body.restoredEvents} ${body.restoredEvents === 1 ? "tid" : "tider"}`
        : "";
      showToast(
        body.originalFileLost
          ? `”${entry.label}” är tillbaka${times}. Originalfilen gick inte att återställa.`
          : `”${entry.label}” är tillbaka${times}`,
      );
      router.refresh();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Det gick inte att ångra.");
    }
  }

  function requireDatabase(): boolean {
    if (data.dataMode === "database") return true;
    showToast("Familjen kan bara ändras när databasen är ansluten.");
    return false;
  }

  async function saveFamilyName(name: string): Promise<boolean> {
    if (!requireDatabase()) return false;
    try {
      const response = await fetch("/api/household", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body: unknown = await response.json().catch(() => null);
      const familyName =
        isRecord(body) && typeof body.familyName === "string" ? body.familyName : null;
      if (!response.ok || !familyName) {
        showToast(apiErrorText(body, "Familjenamnet kunde inte sparas."));
        return false;
      }
      setData((current) => ({ ...current, familyName }));
      showToast("Familjenamnet är sparat");
      return true;
    } catch {
      showToast("Familjenamnet kunde inte sparas. Försök igen.");
      return false;
    }
  }

  async function createPerson(draft: PersonDraft): Promise<boolean> {
    if (!requireDatabase()) return false;
    try {
      const response = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body: unknown = await response.json().catch(() => null);
      const person = isRecord(body) && isFamilyPerson(body.person) ? body.person : null;
      if (!response.ok || !person) {
        showToast(apiErrorText(body, "Familjemedlemmen kunde inte läggas till."));
        return false;
      }
      setData((current) => ({ ...current, people: [...current.people, person] }));
      showToast(`${person.name} är tillagd`);
      return true;
    } catch {
      showToast("Familjemedlemmen kunde inte läggas till. Försök igen.");
      return false;
    }
  }

  async function updatePerson(person: FamilyPerson, draft: PersonDraft): Promise<boolean> {
    if (!requireDatabase()) return false;
    try {
      const response = await fetch(`/api/people/${encodeURIComponent(person.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body: unknown = await response.json().catch(() => null);
      const saved = isRecord(body) && isFamilyPerson(body.person) ? body.person : null;
      if (!response.ok || !saved) {
        showToast(apiErrorText(body, "Familjemedlemmen kunde inte ändras."));
        return false;
      }
      setData((current) => ({
        ...current,
        people: current.people.map((item) => (item.id === saved.id ? saved : item)),
      }));
      showToast(`${saved.name} är uppdaterad`);
      return true;
    } catch {
      showToast("Familjemedlemmen kunde inte ändras. Försök igen.");
      return false;
    }
  }

  async function deletePerson(person: FamilyPerson): Promise<boolean> {
    if (!requireDatabase()) return false;
    try {
      const response = await fetch(`/api/people/${encodeURIComponent(person.id)}`, {
        method: "DELETE",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        showToast(apiErrorText(body, "Familjemedlemmen kunde inte tas bort."));
        return false;
      }
      setData((current) => ({
        ...current,
        people: current.people.filter((item) => item.id !== person.id),
      }));
      showToast(`${person.name} är borttagen`);
      return true;
    } catch {
      showToast("Familjemedlemmen kunde inte tas bort. Försök igen.");
      return false;
    }
  }

  async function updateDocumentFolder(
    folder: FamilyDocumentFolder,
    input: { name?: string; parentId?: string | null },
  ): Promise<FamilyDocumentFolder | null> {
    if (data.dataMode === "database") {
      try {
        const response = await fetch(`/api/document-folders/${encodeURIComponent(folder.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body: unknown = await response.json().catch(() => null);
        const saved = isRecord(body) && isFamilyDocumentFolder(body.folder) ? body.folder : null;
        if (!response.ok || !saved || saved.id !== folder.id) {
          showToast(apiErrorText(body, "Mappen kunde inte \u00e4ndras."));
          return null;
        }
        setData((current) => ({
          ...current,
          folders: current.folders.map((item) => item.id === saved.id ? saved : item),
        }));
        showToast("Mappen \u00e4r uppdaterad");
        return saved;
      } catch {
        showToast("Mappen kunde inte \u00e4ndras. F\u00f6rs\u00f6k igen.");
        return null;
      }
    }
    if (!allowLocalDemo) return null;
    const name = input.name ?? folder.name;
    const parentId = input.parentId === undefined ? folder.parentId : input.parentId;
    if (!localFolderChangeAllowed(data, folder.id, name, parentId)) {
      showToast("Mappen kan inte flyttas dit eller s\u00e5 anv\u00e4nds namnet redan.");
      return null;
    }
    const saved = { ...folder, name, parentId, updatedAt: new Date().toISOString() };
    setData((current) => ({
      ...current,
      folders: current.folders.map((item) => item.id === saved.id ? saved : item),
    }));
    showToast("Mappen \u00e4r uppdaterad");
    return saved;
  }

  async function deleteDocumentFolder(folder: FamilyDocumentFolder): Promise<boolean> {
    if (data.dataMode === "database") {
      try {
        const response = await fetch(`/api/document-folders/${encodeURIComponent(folder.id)}`, {
          method: "DELETE",
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !isRecord(body) || body.deleted !== true || body.id !== folder.id) {
          showToast(apiErrorText(body, "Mappen kunde inte tas bort."));
          return false;
        }
      } catch {
        showToast("Mappen kunde inte tas bort. F\u00f6rs\u00f6k igen.");
        return false;
      }
    } else {
      if (!allowLocalDemo) return false;
      const hasContent = data.folders.some((item) => item.parentId === folder.id) ||
        data.documents.some((document) => document.folderId === folder.id);
      if (hasContent) {
        showToast("Mappen m\u00e5ste vara tom innan den kan tas bort.");
        return false;
      }
    }
    setData((current) => ({
      ...current,
      folders: current.folders.filter((item) => item.id !== folder.id),
    }));
    showToast("Mappen \u00e4r borttagen");
    return true;
  }

  async function updateDocumentOrganization(
    document: FamilyDocument,
    input: { title?: string; folderId?: string | null },
  ): Promise<FamilyDocument | null> {
    if (data.dataMode === "database") {
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body: unknown = await response.json().catch(() => null);
        const saved = isRecord(body) && isFamilyDocument(body.document) ? body.document : null;
        if (!response.ok || !saved || saved.id !== document.id) {
          showToast(apiErrorText(body, "Dokumentet kunde inte \u00e4ndras."));
          return null;
        }
        setData((current) => ({
          ...current,
          documents: current.documents.map((item) => item.id === saved.id ? saved : item),
        }));
        setSelectedDocument((current) => current?.id === saved.id ? saved : current);
        showToast("Dokumentet \u00e4r uppdaterat");
        return saved;
      } catch {
        showToast("Dokumentet kunde inte \u00e4ndras. F\u00f6rs\u00f6k igen.");
        return null;
      }
    }
    if (!allowLocalDemo) return null;
    if (input.folderId && !data.folders.some((item) => item.id === input.folderId)) {
      showToast("Mappen finns inte l\u00e4ngre.");
      return null;
    }
    const saved: FamilyDocument = {
      ...document,
      title: input.title ?? document.title,
      folderId: input.folderId === undefined ? document.folderId : input.folderId,
    };
    setData((current) => ({
      ...current,
      documents: current.documents.map((item) => item.id === saved.id ? saved : item),
    }));
    setSelectedDocument((current) => current?.id === saved.id ? saved : current);
    showToast("Dokumentet \u00e4r uppdaterat");
    return saved;
  }

  function openDocumentById(documentId: string) {
    const document = data.documents.find((item) => item.id === documentId);
    if (document) {
      setSelectedDocument(document);
      return;
    }
    showToast("Källdokumentet finns inte längre");
  }

  const eventPerson = selectedEvent
    ? data.people.find((person) => person.id === selectedEvent.personId) ?? null
    : null;
  const eventDocument = selectedEvent?.documentId
    ? data.documents.find((document) => document.id === selectedEvent.documentId) ?? null
    : null;
  const documentPerson = selectedDocument?.personId
    ? data.people.find((person) => person.id === selectedDocument.personId) ?? null
    : null;
  const documentEvents = selectedDocument
    ? data.events.filter((event) => event.documentId === selectedDocument.id)
    : [];

  const content = useMemo(() => {
    switch (activeView) {
      case "calendar":
        return (
          <CalendarView
            data={data}
            onAddManual={() => setEventEditor({ event: null, moveProposal: false })}
            onEventClick={setSelectedEvent}
            onEditEvent={(event, moveProposal = false) =>
              setEventEditor({ event, moveProposal })
            }
          />
        );
      case "ask":
        return (
          <AskView
            data={data}
            useLocalContext={allowLocalDemo}
            initialQuestion={pendingQuestion}
            onInitialQuestionHandled={() => setPendingQuestion(null)}
            onOpenDocument={openDocumentById}
          />
        );
      case "documents":
        return (
          <DocumentsView
            data={data}
            onAdd={() => setUploadOpen(true)}
            onOpen={setSelectedDocument}
            onDelete={(document) => void deleteDocument(document)}
            onCreateFolder={createDocumentFolder}
            onUpdateFolder={updateDocumentFolder}
            onDeleteFolder={deleteDocumentFolder}
            onUpdateDocument={updateDocumentOrganization}
          />
        );
      default:
        return (
          <HomeView
            data={data}
            onAsk={startQuestion}
            onAdd={() => setUploadOpen(true)}
            onNavigate={navigate}
            onEventClick={setSelectedEvent}
            onToggleTask={handleTaskToggle}
            onOpenDocument={openDocumentById}
          />
        );
    }
    // Callbacks intentionally read the freshest component state on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, data, pendingQuestion]);

  return (
    <div className="app-shell">
      <aside className={mobileMenuOpen ? "sidebar mobile-open" : "sidebar"}>
        <div className="brand">
          <BrandMark className="brand-logo" size={42} />
          <span>
            <strong>Vardagsro</strong>
            <small>{data.familyName}</small>
          </span>
          <button className="mobile-menu-close" onClick={() => setMobileMenuOpen(false)} aria-label="Stäng meny">
            <X size={20} />
          </button>
        </div>

        <nav className="main-nav" aria-label="Huvudmeny">
          <span className="nav-label">Översikt</span>
          {visibleNavigation.map((item) => {
            const Icon = item.icon;
            if (item.href) {
              return (
                <Link key={item.id} href={item.href}>
                  <Icon size={19} strokeWidth={2} />
                  {item.label}
                </Link>
              );
            }
            return (
              <button
                key={item.id}
                className={activeView === item.id ? "active" : ""}
                onClick={() => navigate(item.id)}
                aria-current={activeView === item.id ? "page" : undefined}
              >
                <Icon size={19} strokeWidth={2} />
                {item.label}
                {item.id === "documents" && reviewCount ? <span className="nav-count">{reviewCount}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
        <button className="replay-intro-button" onClick={() => setOnboardingOpen(true)}>
          <CircleHelp size={16} /> Visa introduktionen igen
        </button>
        <div className="storage-note">
          <Cloud size={17} />
          <span>
            <strong>{data.dataMode === "database" ? "Ansluten" : "Demoläge"}</strong>
            <small>{data.dataMode === "database" ? "Familjen är synkad" : "Sparas på enheten"}</small>
          </span>
        </div>
        <div className="sidebar-tools">
          <button
            type="button"
            className="sidebar-tool"
            onClick={() => void openDebugReport()}
            title="Skapa en teknisk rapport att skicka vidare"
          >
            <Bug size={16} /> Fels&ouml;kning
          </button>
          <button type="button" className="sidebar-tool" onClick={() => setPasswordOpen(true)}>
            <KeyRound size={16} /> Byt l&ouml;senord
          </button>
          <button type="button" className="sidebar-tool" onClick={() => void signOut()}>
            <LogOut size={16} /> Logga ut
          </button>
        </div>
        <button className="profile-button" onClick={() => setFamilySettingsOpen(true)}>
          <Avatar person={currentPerson} />
          <span>
            <strong>{currentPerson.name}</strong>
            <small>Familjeadmin</small>
          </span>
          <Settings size={17} />
        </button>
      </aside>

      {mobileMenuOpen ? <button className="sidebar-scrim" aria-label="Stäng meny" onClick={() => setMobileMenuOpen(false)} /> : null}

      <div className="app-content">
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setMobileMenuOpen(true)} aria-label="Öppna meny">
            <Menu size={21} />
          </button>
          <div className="mobile-brand">
            <BrandMark className="brand-logo small" size={31} />
            <strong>Vardagsro</strong>
          </div>
          <button className="icon-button notification-button" aria-label="Notiser" onClick={() => showToast("Inga nya notiser") }>
            <Bell size={20} />
          </button>
        </header>
        <main>{content}</main>
      </div>

      <nav className="mobile-nav" aria-label="Mobilmeny">
        {visibleNavigation.slice(0, 2).map((item) => {
          const Icon = item.icon;
          if (item.href) {
            return <Link key={item.id} href={item.href}><Icon size={20} /> <span>{item.label}</span></Link>;
          }
          return (
            <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
              <Icon size={20} /> <span>{item.label}</span>
            </button>
          );
        })}
        <button className="mobile-add-button" onClick={() => setUploadOpen(true)} aria-label="Lägg till">
          <Plus size={23} />
        </button>
        {visibleNavigation.slice(2).map((item) => {
          const Icon = item.icon;
          if (item.href) {
            return <Link key={item.id} href={item.href}><Icon size={20} /> <span>{item.label}</span></Link>;
          }
          return (
            <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
              <Icon size={20} /> <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <AddDocumentModal
        open={uploadOpen}
        people={data.people}
        allowLocalDemo={allowLocalDemo}
        timezone={data.timezone}
        onClose={() => setUploadOpen(false)}
        onSaved={handleDocumentSaved}
      />
      <ChangePasswordModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onChanged={showToast}
      />
      {eventEditor ? (
        <ManualEventModal
          key={`${eventEditor.event?.id ?? "new"}:${eventEditor.event?.startsAt ?? "default"}:${eventEditor.moveProposal}`}
          open
          people={data.people}
          householdId={data.householdId}
          allowLocalDemo={allowLocalDemo}
          event={eventEditor.event}
          moveProposal={eventEditor.moveProposal}
          onClose={() => setEventEditor(null)}
          onSaved={handleEventSaved}
        />
      ) : null}
      <EventDetailModal
        event={selectedEvent}
        person={eventPerson}
        document={eventDocument}
        onClose={() => setSelectedEvent(null)}
        onOpenDocument={(document) => {
          setSelectedEvent(null);
          setSelectedDocument(document);
        }}
      />
      <DocumentDetailModal
        document={selectedDocument}
        person={documentPerson}
        events={documentEvents}
        onClose={() => setSelectedDocument(null)}
        onDelete={(document) => void deleteDocument(document)}
      />
      <OnboardingModal
        open={onboardingOpen}
        familyName={data.familyName}
        people={data.people}
        onDismiss={dismissOnboarding}
      />
      {debugReport ? (
        <DebugPanel
          report={debugReport}
          onRefresh={() => void openDebugReport()}
          onClear={() => {
            clearDiagnostics();
            void openDebugReport();
          }}
          onClose={() => setDebugReport(null)}
        />
      ) : null}
      <FamilySettingsModal
        open={familySettingsOpen}
        data={data}
        onClose={() => setFamilySettingsOpen(false)}
        onSaveFamilyName={saveFamilyName}
        onCreatePerson={createPerson}
        onUpdatePerson={updatePerson}
        onDeletePerson={deletePerson}
      />

      {toast ? (
        <div className="toast" role="status">
          <Check size={17} /> {toast}
          {undoable ? (
            <button
              type="button"
              className="toast-undo"
              onClick={() => void undoLastDeletion()}
            >
              Ångra
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeDashboardData(data: DashboardData): DashboardData {
  return {
    ...data,
    events: data.events.map((event) => ({ ...event, notes: event.notes ?? null })),
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    folders: Array.isArray(data.folders) ? data.folders.filter(isFamilyDocumentFolder) : [],
    documents: data.documents.map((document) => ({
      ...document,
      folderId: typeof document.folderId === "string" ? document.folderId : null,
      tasksCount: document.tasksCount ?? 0,
    })),
  };
}

function isFamilyPerson(value: unknown): value is FamilyPerson {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.householdId === "string" &&
    typeof value.name === "string" &&
    typeof value.role === "string" &&
    Array.isArray(value.aliases) &&
    value.aliases.every((alias) => typeof alias === "string") &&
    typeof value.initials === "string" &&
    typeof value.color === "string" &&
    typeof value.tint === "string"
  );
}

function isFamilyDocumentFolder(value: unknown): value is FamilyDocumentFolder {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.householdId === "string" &&
    (typeof value.parentId === "string" || value.parentId === null) &&
    typeof value.name === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isFamilyDocument(value: unknown): value is FamilyDocument {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.householdId === "string" &&
    typeof value.title === "string" &&
    typeof value.filename === "string" &&
    typeof value.mimeType === "string" &&
    typeof value.documentType === "string" &&
    (typeof value.personId === "string" || value.personId === null) &&
    (typeof value.folderId === "string" || value.folderId === null) &&
    (value.status === "confirmed" || value.status === "needs_review") &&
    typeof value.uploadedAt === "string" &&
    typeof value.periodLabel === "string" &&
    typeof value.summary === "string" &&
    (typeof value.storageKey === "string" || value.storageKey === null) &&
    typeof value.eventsCount === "number" &&
    typeof value.tasksCount === "number"
  );
}

function apiErrorText(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string" && value.error.length <= 300
    ? value.error
    : fallback;
}

function localFolderChangeAllowed(
  data: DashboardData,
  folderId: string | null,
  name: string,
  parentId: string | null,
): boolean {
  const normalizedName = name.trim().toLocaleLowerCase("sv");
  if (!normalizedName || (parentId !== null && !data.folders.some((folder) => folder.id === parentId))) {
    return false;
  }
  if (folderId && parentId) {
    const byId = new Map(data.folders.map((folder) => [folder.id, folder]));
    const visited = new Set<string>();
    let currentId: string | null = parentId;
    while (currentId && !visited.has(currentId)) {
      if (currentId === folderId) return false;
      visited.add(currentId);
      currentId = byId.get(currentId)?.parentId ?? null;
    }
  }
  return !data.folders.some(
    (folder) =>
      folder.id !== folderId &&
      folder.parentId === parentId &&
      folder.name.trim().toLocaleLowerCase("sv") === normalizedName,
  );
}

function isFamilyTask(value: unknown): value is FamilyTask {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.personId === "string" &&
    typeof value.title === "string" &&
    (typeof value.completedAt === "string" || value.completedAt === null)
  );
}
