"use client";

import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  ImageIcon,
  ListChecks,
  LoaderCircle,
  MapPin,
  NotebookPen,
  Quote,
  Sparkles,
  Trash2,
  TriangleAlert,
  UploadCloud,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { calendarDateInTimeZone } from "@/lib/dates";
import { SourcePreview } from "@/components/SourcePreview";
import { createDemoExtraction } from "@/lib/demo-data";
import { weeksToRepeat } from "@/lib/weekly-schedule";
import type {
  ConfirmDocumentInput,
  DocumentExtraction,
  ExtractedEvent,
  ExtractedTask,
  FamilyDocument,
  FamilyEvent,
  FamilyPerson,
  FamilyTask,
  TaskKind,
} from "@/lib/types";
import { buildDocumentConfirmationFormData } from "@/components/release-contracts";

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);
const TASK_KIND_OPTIONS: ReadonlyArray<readonly [TaskKind, string]> = [
  ["homework", "Läxa"],
  ["exam", "Prov"],
  ["bring", "Ta med"],
  ["form", "Blankett"],
  ["preparation", "Förberedelse"],
  ["other", "Annat"],
];

type ModalStep = "pick" | "processing" | "review" | "saving" | "done";

type SaveNotice = {
  kind: "success" | "warning";
  title: string;
  message: string;
};

export interface AddDocumentModalProps {
  open: boolean;
  people: FamilyPerson[];
  allowLocalDemo: boolean;
  timezone: string;
  onClose: () => void;
  onSaved: (document: FamilyDocument, events: FamilyEvent[], tasks: FamilyTask[]) => void;
}

export function AddDocumentModal(props: AddDocumentModalProps) {
  if (!props.open) return null;

  return <AddDocumentModalContent {...props} />;
}

function AddDocumentModalContent({
  people,
  allowLocalDemo,
  timezone,
  onClose,
  onSaved,
}: AddDocumentModalProps) {
  const fileInputId = useId();
  const titleInputId = useId();
  const personInputId = useId();
  const repeatInputId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<ModalStep>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  // Empty means the document covers only the week it shows. A schedule usually
  // holds longer than that, and only the family knows until when.
  const [repeatWeeklyUntil, setRepeatWeeklyUntil] = useState("");
  // Which proposal the original is currently showing. Null means no highlight.
  const [shownSourceId, setShownSourceId] = useState<string | null>(null);
  // Empty means nobody is chosen yet. The document has to say, or the family
  // has to say; the product never picks.
  const [personId, setPersonId] = useState("");
  const [events, setEvents] = useState<ExtractedEvent[]>([]);

  // The schedule cannot stop before the week it describes, and the summary says
  // in plain words what confirming will actually create.
  const lastDayInDocument = useMemo(
    () =>
      events.reduce<string | null>((latest, event) => {
        const day = calendarDateInTimeZone(event.startsAt, timezone);
        return latest === null || day > latest ? day : latest;
      }, null),
    [events, timezone],
  );
  const extraWeeks = useMemo(
    () =>
      repeatWeeklyUntil
        ? weeksToRepeat(events, { untilCalendarDate: repeatWeeklyUntil, timezone })
        : 0,
    [events, repeatWeeklyUntil, timezone],
  );
  const repeatSummary = extraWeeks
    ? `Upprepas ${extraWeeks + 1} veckor, ${events.length * (extraWeeks + 1)} tillfällen totalt.`
    : "Lämna tomt om schemat bara gäller veckan i dokumentet.";
  const [tasks, setTasks] = useState<ExtractedTask[]>([]);
  const [isDemoExtraction, setIsDemoExtraction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);

  const canClose = step !== "processing" && step !== "saving";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && canClose) onClose();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [canClose, onClose]);

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && canClose) onClose();
  }

  function chooseFile(candidate: File | null) {
    setError(null);
    if (!candidate) return;

    const extension = candidate.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_FILE_TYPES.has(candidate.type) && !ACCEPTED_EXTENSIONS.has(extension)) {
      setFile(null);
      setError("Den filtypen känner vi inte igen ännu. Välj JPG, PNG, WebP eller PDF.");
      return;
    }

    if (candidate.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("Filen är större än 12 MB. Prova gärna en mindre bild eller PDF.");
      return;
    }

    setFile(candidate);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 1) {
      setFile(null);
      setError("Välj en fil i taget, så håller vi ordning på allt.");
      return;
    }
    chooseFile(event.dataTransfer.files.item(0));
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLLabelElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      document.getElementById(fileInputId)?.click();
    }
  }

  function applyExtraction(result: DocumentExtraction, fromDemo: boolean) {
    const matchedPersonId = findPersonId(result, people);
    setExtraction(result);
    setDocumentTitle(result.title);
    setPersonId(matchedPersonId ?? "");
    setEvents(
      result.events.map((event) => ({
        ...event,
        id: event.id || makeId(),
      })),
    );
    setTasks(
      result.tasks.map((task) => ({
        ...task,
        id: task.id || makeId(),
      })),
    );
    setIsDemoExtraction(fromDemo);
    setError(null);
    setStep("review");
  }

  async function extractFile() {
    if (!file) {
      setError("Välj en bild eller PDF först.");
      return;
    }

    setError(null);
    setStep("processing");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });
      const body = await readResponseBody(response);

      if (!response.ok) {
        throw new Error(readApiError(body) ?? "Dokumentet kunde inte läsas just nu.");
      }

      const candidate = unwrapExtraction(body);
      if (!isDocumentExtraction(candidate)) {
        throw new Error("Vi fick ett oväntat svar när dokumentet lästes.");
      }

      applyExtraction(candidate, false);
    } catch (caught) {
      setStep("pick");
      setError(
        caught instanceof Error
          ? caught.message
          : "Något gick snett när dokumentet lästes. Försök gärna igen.",
      );
    }
  }

  function useDemoData() {
    setFile(null);
    applyExtraction(createDemoExtraction("demodata-skola.jpg"), true);
  }

  function returnToPicker() {
    setExtraction(null);
    setDocumentTitle("");
    setEvents([]);
    setTasks([]);
    setIsDemoExtraction(false);
    setError(null);
    setStep("pick");
  }

  function updateEvent<K extends keyof ExtractedEvent>(
    eventId: string,
    key: K,
    value: ExtractedEvent[K],
  ) {
    setEvents((current) =>
      current.map((event) => (event.id === eventId ? { ...event, [key]: value } : event)),
    );
  }

  function updateEventDate(eventId: string, dateValue: string) {
    setEvents((current) =>
      current.map((event) => {
        if (event.id !== eventId) return event;
        return moveEventToDate(event, dateValue);
      }),
    );
  }

  function updateEventStartTime(eventId: string, timeValue: string) {
    setEvents((current) =>
      current.map((event) => {
        if (event.id !== eventId) return event;
        const startsAt = withLocalTime(event.startsAt, timeValue);
        let endsAt = event.endsAt;
        if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
          endsAt = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();
        }
        return { ...event, startsAt, endsAt };
      }),
    );
  }

  function updateEventEndTime(eventId: string, timeValue: string) {
    setEvents((current) =>
      current.map((event) => {
        if (event.id !== eventId) return event;
        return { ...event, endsAt: endTimeForEvent(event.startsAt, timeValue) };
      }),
    );
  }

  function updateTask<K extends keyof ExtractedTask>(
    taskId: string,
    key: K,
    value: ExtractedTask[K],
  ) {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, [key]: value } : task)),
    );
  }

  function updateTaskDeadline(taskId: string, value: string) {
    updateTask(taskId, "dueAt", value ? localDateTimeToIso(value) : null);
  }

  async function saveDocument() {
    if (!extraction) return;

    if (!personId) {
      setError("Välj vem dokumentet gäller innan du sparar.");
      return;
    }

    const cleanTitle = documentTitle.trim();
    if (!cleanTitle) {
      setError("Ge dokumentet en titel, så blir det lätt att hitta igen.");
      return;
    }
    if (!personId) {
      setError("Välj vem dokumentet gäller.");
      return;
    }
    if (!isDemoExtraction && !file) {
      setError("Originalfilen saknas. Välj dokumentet igen och låt oss läsa om det.");
      return;
    }

    const eventWithoutTitle = events.find((event) => !event.title.trim());
    if (eventWithoutTitle) {
      setError("Ett av tillfällena saknar titel. Fyll i en titel eller ta bort raden.");
      return;
    }

    const invalidEvent = events.find(
      (event) =>
        Number.isNaN(new Date(event.startsAt).getTime()) ||
        Number.isNaN(new Date(event.endsAt).getTime()) ||
        new Date(event.endsAt).getTime() <= new Date(event.startsAt).getTime(),
    );
    if (invalidEvent) {
      setError(`Kontrollera datum och tider för ”${invalidEvent.title}”.`);
      return;
    }

    const taskWithoutTitle = tasks.find((task) => !task.title.trim());
    if (taskWithoutTitle) {
      setError("En av uppgifterna saknar titel. Fyll i en titel eller ta bort raden.");
      return;
    }

    const invalidTask = tasks.find(
      (task) => task.dueAt && Number.isNaN(new Date(task.dueAt).getTime()),
    );
    if (invalidTask) {
      setError(`Kontrollera deadline för ”${invalidTask.title}”.`);
      return;
    }

    const reviewedEvents = events.map((event) => ({
      ...event,
      title: event.title.trim(),
      location: event.location?.trim() || null,
    }));
    const reviewedTasks = tasks.map((task) => ({
      ...task,
      title: task.title.trim(),
      notes: task.notes?.trim() || null,
    }));
    const reviewedExtraction: DocumentExtraction = {
      ...extraction,
      title: cleanTitle,
      personId,
      events: reviewedEvents,
      tasks: reviewedTasks,
    };
    const input: ConfirmDocumentInput = {
      extraction: reviewedExtraction,
      personId,
      events: reviewedEvents,
      tasks: reviewedTasks,
      repeatWeeklyUntil: repeatWeeklyUntil || null,
    };

    setError(null);
    setStep("saving");

    try {
      const formData = buildDocumentConfirmationFormData(input, file);
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      const body = await readResponseBody(response);
      if (!response.ok) {
        throw new Error(readApiError(body) ?? "Databasen svarade inte.");
      }

      const saved = unwrapSavedDocument(body);
      if (!saved) throw new Error("Servern bekräftade inte att dokumentet sparades.");

      setSaveNotice({
        kind: "success",
        title: "Klart – allt är på plats",
        message: saveSummary(saved.events.length, saved.tasks.length),
      });
      setStep("done");
      onSaved(saved.document, saved.events, saved.tasks);
    } catch (caught) {
      if (!allowLocalDemo) {
        setStep("review");
        setError(
          caught instanceof Error
            ? caught.message
            : "Dokumentet kunde inte sparas. Försök igen.",
        );
        return;
      }
      const local = createLocalRecords(reviewedExtraction, personId, people);
      setSaveNotice({
        kind: "warning",
        title: "Sparat tillfälligt i den här vyn",
        message:
          "Vi fick inte kontakt med databasen. Familjen ser uppgifterna här nu, men de kan försvinna när sidan laddas om. Försök gärna spara igen senare.",
      });
      setStep("done");
      onSaved(local.document, local.events, local.tasks);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="modal-shell upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-document-title"
        aria-describedby="add-document-description"
        tabIndex={-1}
      >
        <header className="modal-header">
          <div className="modal-heading-group">
            <span className="modal-heading-icon" aria-hidden="true">
              <FileText size={20} strokeWidth={2} />
            </span>
            <div>
              <p className="modal-eyebrow">Nytt underlag</p>
              <h2 className="modal-title" id="add-document-title">
                {step === "review" || step === "saving"
                  ? "Kolla att allt blev rätt"
                  : step === "done"
                    ? "Färdigt"
                    : "Lägg till i familjens vardag"}
              </h2>
            </div>
          </div>
          <button
            className="modal-close-button"
            type="button"
            onClick={onClose}
            disabled={!canClose}
            aria-label={canClose ? "Stäng" : "Vänta medan dokumentet behandlas"}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="modal-body">
          {step === "pick" ? (
            <section className="upload-picker" aria-labelledby="upload-picker-title">
              <div className="upload-intro">
                <h3 className="upload-section-title" id="upload-picker-title">
                  Fota, välj eller dra in dokumentet
                </h3>
                <p className="upload-description" id="add-document-description">
                  Ett schema, en kallelse eller ett veckobrev fungerar fint. Vi plockar ut
                  datumen, och du får kontrollera allt innan det sparas.
                </p>
              </div>

              <div
                className={`upload-dropzone${isDragging ? " upload-dropzone-active" : ""}${
                  file ? " upload-dropzone-selected" : ""
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsDragging(false);
                  }
                }}
                onDrop={handleDrop}
              >
                <input
                  className="upload-file-input"
                  id={fileInputId}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => {
                    chooseFile(event.target.files?.item(0) ?? null);
                    event.target.value = "";
                  }}
                />
                <label
                  className="upload-dropzone-label"
                  htmlFor={fileInputId}
                  tabIndex={0}
                  onKeyDown={handleDropzoneKeyDown}
                >
                  <span className="upload-dropzone-icon" aria-hidden="true">
                    {file ? <CheckCircle2 size={30} /> : <UploadCloud size={30} />}
                  </span>
                  {file ? (
                    <span className="upload-selected-file">
                      <span className="upload-selected-name">{file.name}</span>
                      <span className="upload-selected-meta">
                        {formatFileSize(file.size)} · Tryck för att välja en annan
                      </span>
                    </span>
                  ) : (
                    <span className="upload-dropzone-copy">
                      <span className="upload-dropzone-title">
                        Släpp filen här eller välj från enheten
                      </span>
                      <span className="upload-dropzone-help">JPG, PNG, WebP eller PDF · max 12 MB</span>
                    </span>
                  )}
                </label>
              </div>

              {error ? (
                <div className="upload-message upload-message-error" role="alert">
                  <TriangleAlert size={18} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ) : null}

              <button
                className="upload-primary-button"
                type="button"
                onClick={extractFile}
                disabled={!file}
              >
                <WandSparkles size={18} aria-hidden="true" />
                Läs dokumentet
              </button>

              {allowLocalDemo ? (
                <>
                  <div className="upload-divider" aria-hidden="true">
                    <span>eller</span>
                  </div>

                  <button className="upload-demo-button" type="button" onClick={useDemoData}>
                    <Sparkles size={18} aria-hidden="true" />
                    <span>
                      <strong>Prova med demodata</strong>
                      <small>Se hela flödet utan att ladda upp något</small>
                    </span>
                  </button>
                </>
              ) : null}

              <p className="upload-privacy-note">
                <ImageIcon size={15} aria-hidden="true" />
                Du granskar alltid allt innan något sparas till familjen.
              </p>
            </section>
          ) : null}

          {step === "processing" || step === "saving" ? (
            <section className="upload-processing" aria-live="polite" aria-busy="true">
              <div className="upload-processing-orbit" aria-hidden="true">
                <LoaderCircle className="upload-spinner" size={38} />
              </div>
              <p className="upload-processing-eyebrow">
                {step === "saving" ? "Nästan klart" : "Vi läser dokumentet"}
              </p>
              <h3 className="upload-processing-title">
                {step === "saving"
                  ? "Sparar till familjen…"
                  : "Letar efter namn, tider och saker att göra…"}
              </h3>
              <p className="upload-processing-copy">
                {step === "saving"
                  ? "Vi lägger dokumentet, tiderna och uppgifterna på rätt plats."
                  : "Det brukar bara ta en liten stund."}
              </p>
            </section>
          ) : null}

          {step === "review" && extraction ? (
            <section className="upload-review" aria-labelledby="upload-review-title">
              <button className="upload-back-button" type="button" onClick={returnToPicker}>
                <ArrowLeft size={17} aria-hidden="true" />
                Välj en annan fil
              </button>

              <div className="upload-found-banner">
                <span className="upload-found-icon" aria-hidden="true">
                  <Sparkles size={20} />
                </span>
                <div>
                  <h3 id="upload-review-title">Vi hittade {reviewSummary(events.length, tasks.length)}</h3>
                  <p>
                    Kontrollera både tider och uppgifter. Du kan ändra allt innan du sparar.
                  </p>
                </div>
              </div>

              <div className="upload-document-fields">
                <div className="upload-field">
                  <label className="upload-label" htmlFor={personInputId}>
                    <UserRound size={16} aria-hidden="true" />
                    Vem gäller det?
                  </label>
                  <select
                    className="upload-select"
                    id={personInputId}
                    value={personId}
                    onChange={(event) => setPersonId(event.target.value)}
                    disabled={people.length === 0}
                  >
                    {people.length === 0 ? (
                      <option value="">Ingen familjemedlem ännu</option>
                    ) : (
                      <option value="">Välj familjemedlem…</option>
                    )}
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} · {person.role}
                      </option>
                    ))}
                  </select>
                  {extraction && !personId ? (
                    <p className="upload-field-hint">
                      {extraction.personHint
                        ? `Dokumentet säger ”${extraction.personHint}”, vilket inte pekar ut någon i familjen. Välj vem det gäller.`
                        : "Dokumentet säger inte vem det gäller. Välj vem det gäller."}
                    </p>
                  ) : null}
                </div>

                <div className="upload-field upload-field-grow">
                  <label className="upload-label" htmlFor={titleInputId}>
                    <FileText size={16} aria-hidden="true" />
                    Dokumentets titel
                  </label>
                  <input
                    className="upload-input"
                    id={titleInputId}
                    value={documentTitle}
                    onChange={(event) => setDocumentTitle(event.target.value)}
                    autoComplete="off"
                  />
                </div>

                <div className="upload-field">
                  <label className="upload-label" htmlFor={repeatInputId}>
                    <CalendarDays size={16} aria-hidden="true" />
                    Gäller till och med
                  </label>
                  <input
                    className="upload-input"
                    id={repeatInputId}
                    type="date"
                    value={repeatWeeklyUntil}
                    min={lastDayInDocument ?? undefined}
                    onChange={(event) => setRepeatWeeklyUntil(event.target.value)}
                  />
                  <p className="upload-field-hint">
                    {repeatSummary}
                  </p>
                </div>
              </div>

              <div className="upload-events-heading">
                <div>
                  <h3>Datum och tider</h3>
                  <p>De här tillfällena läggs in i familjens översikt.</p>
                </div>
                <span className="upload-event-count">{events.length}</span>
              </div>

              {file && shownSourceId ? (
                <SourcePreview
                  file={file}
                  boxes={events.find((event) => event.id === shownSourceId)?.sourceBoxes ?? null}
                  caption="Markeringen visar var uppgiften lästes."
                />
              ) : null}

              <div className="upload-event-list">
                {events.map((event, index) => {
                  const eventBaseId = `${titleInputId}-event-${index}`;
                  const isOvernight = localDateValue(event.startsAt) !== localDateValue(event.endsAt);
                  return (
                    <article className="upload-event-card" key={event.id}>
                      <div className="upload-event-card-head">
                        <span className="upload-event-number" aria-hidden="true">
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          className="upload-event-source"
                          aria-pressed={shownSourceId === event.id}
                          onClick={() =>
                            setShownSourceId(shownSourceId === event.id ? null : event.id)
                          }
                        >
                          {shownSourceId === event.id ? "Dölj originalet" : "Visa i originalet"}
                        </button>
                        <div className="upload-field upload-event-title-field">
                          <label className="upload-label" htmlFor={`${eventBaseId}-title`}>
                            Titel
                          </label>
                          <input
                            className="upload-input"
                            id={`${eventBaseId}-title`}
                            value={event.title}
                            onChange={(change) => updateEvent(event.id, "title", change.target.value)}
                          />
                        </div>
                        <button
                          className="upload-remove-button"
                          type="button"
                          onClick={() =>
                            setEvents((current) => current.filter((item) => item.id !== event.id))
                          }
                          aria-label={`Ta bort ${event.title || `tillfälle ${index + 1}`}`}
                        >
                          <Trash2 size={17} aria-hidden="true" />
                        </button>
                      </div>

                      <div className="upload-event-grid">
                        <div className="upload-field">
                          <label className="upload-label" htmlFor={`${eventBaseId}-date`}>
                            <CalendarDays size={15} aria-hidden="true" />
                            Datum
                          </label>
                          <input
                            className="upload-input"
                            id={`${eventBaseId}-date`}
                            type="date"
                            value={localDateValue(event.startsAt)}
                            onChange={(change) => updateEventDate(event.id, change.target.value)}
                          />
                        </div>

                        <div className="upload-field">
                          <label className="upload-label" htmlFor={`${eventBaseId}-start`}>
                            <Clock3 size={15} aria-hidden="true" />
                            Börjar
                          </label>
                          <input
                            className="upload-input"
                            id={`${eventBaseId}-start`}
                            type="time"
                            value={localTimeValue(event.startsAt)}
                            disabled={event.allDay}
                            onChange={(change) => updateEventStartTime(event.id, change.target.value)}
                          />
                        </div>

                        <div className="upload-field">
                          <label className="upload-label" htmlFor={`${eventBaseId}-end`}>
                            <Clock3 size={15} aria-hidden="true" />
                            Slutar{isOvernight ? " nästa dag" : ""}
                          </label>
                          <input
                            className="upload-input"
                            id={`${eventBaseId}-end`}
                            type="time"
                            value={localTimeValue(event.endsAt)}
                            disabled={event.allDay}
                            onChange={(change) => updateEventEndTime(event.id, change.target.value)}
                          />
                        </div>

                        <div className="upload-field upload-field-location">
                          <label className="upload-label" htmlFor={`${eventBaseId}-location`}>
                            <MapPin size={15} aria-hidden="true" />
                            Plats
                          </label>
                          <input
                            className="upload-input"
                            id={`${eventBaseId}-location`}
                            value={event.location ?? ""}
                            placeholder="Valfritt"
                            onChange={(change) => updateEvent(event.id, "location", change.target.value)}
                          />
                        </div>
                      </div>

                      <label className="upload-all-day-option">
                        <input
                          type="checkbox"
                          checked={event.allDay}
                          onChange={(change) => updateEvent(event.id, "allDay", change.target.checked)}
                        />
                        <span>Hela dagen</span>
                      </label>
                    </article>
                  );
                })}

                {events.length === 0 ? (
                  <div className="upload-empty-events">
                    <CalendarDays size={23} aria-hidden="true" />
                    <div>
                      <strong>Inga tider sparas</strong>
                      <p>Dokumentet kan ändå sparas och finnas kvar som underlag.</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="upload-events-heading upload-tasks-heading">
                <div>
                  <h3>Uppgifter och saker att komma ihåg</h3>
                  <p>Läxor, blanketter och saker att ta med visas i “Att göra”.</p>
                </div>
                <span className="upload-event-count">{tasks.length}</span>
              </div>

              <div className="upload-task-list">
                {tasks.map((task, index) => {
                  const taskBaseId = `${titleInputId}-task-${index}`;
                  return (
                    <article className="upload-event-card upload-task-card" key={task.id}>
                      <div className="upload-event-card-head">
                        <span className="upload-event-number upload-task-number" aria-hidden="true">
                          {index + 1}
                        </span>
                        <div className="upload-field upload-event-title-field">
                          <label className="upload-label" htmlFor={`${taskBaseId}-title`}>
                            Titel
                          </label>
                          <input
                            className="upload-input"
                            id={`${taskBaseId}-title`}
                            value={task.title}
                            onChange={(change) => updateTask(task.id, "title", change.target.value)}
                          />
                        </div>
                        <button
                          className="upload-remove-button"
                          type="button"
                          onClick={() =>
                            setTasks((current) => current.filter((item) => item.id !== task.id))
                          }
                          aria-label={`Ta bort ${task.title || `uppgift ${index + 1}`}`}
                        >
                          <Trash2 size={17} aria-hidden="true" />
                        </button>
                      </div>

                      <div className="upload-task-grid">
                        <div className="upload-field">
                          <label className="upload-label" htmlFor={`${taskBaseId}-kind`}>
                            <ListChecks size={15} aria-hidden="true" />
                            Typ
                          </label>
                          <select
                            className="upload-select"
                            id={`${taskBaseId}-kind`}
                            value={task.kind}
                            onChange={(change) =>
                              updateTask(task.id, "kind", change.target.value as TaskKind)
                            }
                          >
                            {TASK_KIND_OPTIONS.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="upload-field">
                          <label className="upload-label" htmlFor={`${taskBaseId}-due`}>
                            <CalendarDays size={15} aria-hidden="true" />
                            Deadline
                          </label>
                          <input
                            className="upload-input"
                            id={`${taskBaseId}-due`}
                            type="datetime-local"
                            value={task.dueAt ? localDateTimeValue(task.dueAt) : ""}
                            onChange={(change) => updateTaskDeadline(task.id, change.target.value)}
                          />
                        </div>

                        <div className="upload-field upload-task-notes">
                          <label className="upload-label" htmlFor={`${taskBaseId}-notes`}>
                            <NotebookPen size={15} aria-hidden="true" />
                            Anteckning
                          </label>
                          <input
                            className="upload-input"
                            id={`${taskBaseId}-notes`}
                            value={task.notes ?? ""}
                            placeholder="Valfritt"
                            onChange={(change) => updateTask(task.id, "notes", change.target.value)}
                          />
                        </div>
                      </div>

                      {task.sourceExcerpt ? (
                        <p className="upload-task-source">
                          <Quote size={13} aria-hidden="true" />
                          <span>{task.sourceExcerpt}</span>
                        </p>
                      ) : null}
                    </article>
                  );
                })}

                {tasks.length === 0 ? (
                  <div className="upload-empty-events upload-empty-tasks">
                    <ListChecks size={23} aria-hidden="true" />
                    <div>
                      <strong>Inga uppgifter sparas</strong>
                      <p>Dokumentet och eventuella tider kan ändå sparas.</p>
                    </div>
                  </div>
                ) : null}
              </div>

              {error ? (
                <div className="upload-message upload-message-error" role="alert">
                  <TriangleAlert size={18} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="upload-review-actions">
                <button className="upload-secondary-button" type="button" onClick={onClose}>
                  Avbryt
                </button>
                <button
                  className="upload-primary-button"
                  type="button"
                  onClick={saveDocument}
                  disabled={!personId || !documentTitle.trim()}
                >
                  <CheckCircle2 size={18} aria-hidden="true" />
                  Spara till familjen
                </button>
              </div>
            </section>
          ) : null}

          {step === "done" && saveNotice ? (
            <section
              className={`upload-result upload-result-${saveNotice.kind}`}
              aria-live="polite"
            >
              <span className="upload-result-icon" aria-hidden="true">
                {saveNotice.kind === "success" ? (
                  <CheckCircle2 size={38} />
                ) : (
                  <TriangleAlert size={38} />
                )}
              </span>
              <p className="upload-result-eyebrow">
                {saveNotice.kind === "success" ? "Sparat" : "Bra att veta"}
              </p>
              <h3 className="upload-result-title">{saveNotice.title}</h3>
              <p className="upload-result-message">{saveNotice.message}</p>
              <button className="upload-primary-button" type="button" onClick={onClose} autoFocus>
                Klart
              </button>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Who the document concerns, or null when it does not say.
 *
 * There is deliberately no fallback to the first family member. A school
 * timetable names a class, not a child, so the old fallback quietly proposed
 * every such document for whoever happened to be first in the household — the
 * one with the role "Jag". A parent then saw their child's lessons offered as
 * their own working hours. Asking is the honest answer; guessing looked like an
 * answer and was not.
 */
export function findPersonId(
  extraction: DocumentExtraction,
  people: FamilyPerson[],
): string | null {
  if (extraction.personId && people.some((person) => person.id === extraction.personId)) {
    return extraction.personId;
  }

  const hint = extraction.personHint.trim().toLocaleLowerCase("sv-SE");
  if (!hint) return null;

  const match = people.find((person) =>
    [person.name, person.role, ...person.aliases].some(
      (value) => value.trim().toLocaleLowerCase("sv-SE") === hint,
    ),
  );
  return match?.id ?? null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("sv-SE", {
    maximumFractionDigits: 1,
  })} MB`;
}

function reviewSummary(eventCount: number, taskCount: number): string {
  const parts = [
    eventCount ? `${eventCount} ${eventCount === 1 ? "tid" : "tider"}` : null,
    taskCount ? `${taskCount} ${taskCount === 1 ? "uppgift" : "uppgifter"}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" och ") : "inga tider eller uppgifter";
}

function saveSummary(eventCount: number, taskCount: number): string {
  const found = reviewSummary(eventCount, taskCount);
  return eventCount || taskCount
    ? `Dokumentet är sparat. ${capitalizeFirst(found)} finns nu i familjens gemensamma vy.`
    : "Dokumentet finns nu i familjens gemensamma vy.";
}

function capitalizeFirst(value: string): string {
  return value.charAt(0).toLocaleUpperCase("sv-SE") + value.slice(1);
}

function localDateValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function localDateTimeValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${localDateValue(iso)}T${localTimeValue(iso)}`;
}

function localDateTimeToIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function parseLocalDate(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
}

function moveEventToDate(event: ExtractedEvent, dateValue: string): ExtractedEvent {
  const parts = parseLocalDate(dateValue);
  const oldStart = new Date(event.startsAt);
  const oldEnd = new Date(event.endsAt);
  if (!parts || Number.isNaN(oldStart.getTime()) || Number.isNaN(oldEnd.getTime())) return event;

  const startDay = new Date(
    oldStart.getFullYear(),
    oldStart.getMonth(),
    oldStart.getDate(),
  ).getTime();
  const endDay = new Date(oldEnd.getFullYear(), oldEnd.getMonth(), oldEnd.getDate()).getTime();
  const daySpan = Math.max(0, Math.round((endDay - startDay) / 86_400_000));
  const [year, month, day] = parts;
  const nextStart = new Date(
    year,
    month,
    day,
    oldStart.getHours(),
    oldStart.getMinutes(),
    0,
    0,
  );
  const nextEnd = new Date(
    year,
    month,
    day + daySpan,
    oldEnd.getHours(),
    oldEnd.getMinutes(),
    0,
    0,
  );

  return { ...event, startsAt: nextStart.toISOString(), endsAt: nextEnd.toISOString() };
}

function withLocalTime(iso: string, timeValue: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(timeValue);
  const date = new Date(iso);
  if (!match || Number.isNaN(date.getTime())) return iso;
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date.toISOString();
}

function endTimeForEvent(startsAt: string, timeValue: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(timeValue);
  const start = new Date(startsAt);
  if (!match || Number.isNaN(start.getTime())) return startsAt;

  const end = new Date(start);
  end.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  return end.toISOString();
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDocumentExtraction(value: unknown): value is DocumentExtraction {
  if (!isRecord(value)) return false;
  return (
    typeof value.title === "string" &&
    typeof value.documentType === "string" &&
    typeof value.summary === "string" &&
    typeof value.personHint === "string" &&
    typeof value.periodLabel === "string" &&
    typeof value.originalFilename === "string" &&
    typeof value.mimeType === "string" &&
    typeof value.hash === "string" &&
    Array.isArray(value.events) &&
    Array.isArray(value.tasks)
  );
}

function unwrapExtraction(value: unknown): unknown {
  if (isRecord(value) && "extraction" in value) return value.extraction;
  return value;
}

function isFamilyDocument(value: unknown): value is FamilyDocument {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.filename === "string"
  );
}

function isFamilyEvent(value: unknown): value is FamilyEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.personId === "string" &&
    typeof value.title === "string" &&
    typeof value.startsAt === "string" &&
    typeof value.endsAt === "string"
  );
}

function isFamilyTask(value: unknown): value is FamilyTask {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.personId === "string" &&
    typeof value.title === "string" &&
    (value.recurrence === "once" || value.recurrence === "daily") &&
    (typeof value.dueAt === "string" || value.dueAt === null) &&
    (typeof value.completedAt === "string" || value.completedAt === null)
  );
}

function unwrapSavedDocument(
  value: unknown,
): { document: FamilyDocument; events: FamilyEvent[]; tasks: FamilyTask[] } | null {
  if (!isRecord(value)) return null;
  const direct = value;
  const nested = isRecord(value.data) ? value.data : null;
  const candidate = isFamilyDocument(direct.document)
    ? direct
    : nested && isFamilyDocument(nested.document)
      ? nested
      : null;

  if (
    !candidate ||
    !Array.isArray(candidate.events) ||
    !candidate.events.every(isFamilyEvent) ||
    !Array.isArray(candidate.tasks) ||
    !candidate.tasks.every(isFamilyTask)
  ) {
    return null;
  }
  return {
    document: candidate.document as FamilyDocument,
    events: candidate.events,
    tasks: candidate.tasks,
  };
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readApiError(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!isRecord(value)) return null;
  if (typeof value.error === "string" && value.error.trim()) return value.error;
  if (typeof value.message === "string" && value.message.trim()) return value.message;
  return null;
}

function createLocalRecords(
  extraction: DocumentExtraction,
  personId: string,
  people: FamilyPerson[],
): { document: FamilyDocument; events: FamilyEvent[]; tasks: FamilyTask[] } {
  const selectedPerson = people.find((person) => person.id === personId);
  const householdId = selectedPerson?.householdId ?? people[0]?.householdId ?? "household-local";
  const documentId = makeId();
  const document: FamilyDocument = {
    id: documentId,
    householdId,
    title: extraction.title,
    filename: extraction.originalFilename,
    mimeType: extraction.mimeType,
    documentType: extraction.documentType,
    personId,
    folderId: null,
    status: "confirmed",
    uploadedAt: new Date().toISOString(),
    periodLabel: extraction.periodLabel,
    summary: extraction.summary,
    storageKey: extraction.storageKey,
    hash: extraction.hash,
    eventsCount: extraction.events.length,
    tasksCount: extraction.tasks.length,
  };
  const localEvents: FamilyEvent[] = extraction.events.map((event) => ({
    id: event.id || makeId(),
    householdId,
    personId,
    documentId,
    title: event.title,
    category: event.category,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    location: event.location,
    notes: null,
    status: "confirmed",
    confidence: event.confidence,
    sourceExcerpt: event.sourceExcerpt || null,
  }));
  const localTasks: FamilyTask[] = extraction.tasks.map((task) => ({
    id: task.id || makeId(),
    householdId,
    personId,
    documentId,
    title: task.title,
    kind: task.kind,
    recurrence: "once",
    dueAt: task.dueAt,
    completedAt: null,
    notes: task.notes,
    reviewStatus: "confirmed",
    confidence: task.confidence,
    sourceExcerpt: task.sourceExcerpt || null,
  }));
  return { document, events: localEvents, tasks: localTasks };
}

export default AddDocumentModal;
