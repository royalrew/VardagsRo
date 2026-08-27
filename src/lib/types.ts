export type EventCategory =
  | "work"
  | "school"
  | "sport"
  | "health"
  | "family"
  | "other";

export type ReviewStatus = "confirmed" | "needs_review";

export type TaskKind =
  | "homework"
  | "exam"
  | "bring"
  | "form"
  | "preparation"
  | "other";

export interface FamilyPerson {
  id: string;
  householdId: string;
  name: string;
  role: string;
  personType: "adult" | "child";
  aliases: string[];
  initials: string;
  color: string;
  tint: string;
}

export interface FamilyDocument {
  id: string;
  householdId: string;
  title: string;
  filename: string;
  mimeType: string;
  documentType: string;
  personId: string | null;
  folderId: string | null;
  status: ReviewStatus;
  uploadedAt: string;
  periodLabel: string;
  summary: string;
  storageKey: string | null;
  hash?: string | null;
  eventsCount: number;
  tasksCount: number;
}

export interface FamilyDocumentFolder {
  id: string;
  householdId: string;
  parentId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyEvent {
  id: string;
  householdId: string;
  /** null means the event concerns the whole family. */
  personId: string | null;
  documentId: string | null;
  title: string;
  category: EventCategory;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  status: ReviewStatus;
  confidence: number;
  sourceExcerpt: string | null;
}

export interface FamilyTask {
  id: string;
  householdId: string;
  personId: string;
  documentId: string | null;
  title: string;
  kind: TaskKind;
  dueAt: string | null;
  completedAt: string | null;
  notes: string | null;
  reviewStatus: ReviewStatus;
  confidence: number;
  sourceExcerpt: string | null;
}

export interface DashboardData {
  householdId: string;
  familyName: string;
  timezone: string;
  currentPersonId: string;
  people: FamilyPerson[];
  events: FamilyEvent[];
  tasks: FamilyTask[];
  folders: FamilyDocumentFolder[];
  documents: FamilyDocument[];
  dataMode: "database" | "demo";
}

/** A rectangle as fractions 0-1 of the page as the viewer sees it. */
export interface SourceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedEvent {
  id: string;
  title: string;
  category: EventCategory;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  /** Day-level annotation from the source, kept with the shift it belongs to. */
  notes: string | null;
  confidence: number;
  sourceExcerpt: string;
  /**
   * Where the excerpt stands on the page, one rectangle per line it spans.
   * Absent or empty means the place could not be found well enough to point at,
   * and the whole page is shown instead of a rectangle that only looks precise.
   */
  sourceBoxes?: SourceBox[] | null;
}

export interface ExtractedTask {
  id: string;
  title: string;
  kind: TaskKind;
  dueAt: string | null;
  notes: string | null;
  confidence: number;
  sourceExcerpt: string;
}

export interface DocumentExtraction {
  title: string;
  documentType: string;
  summary: string;
  personHint: string;
  personId: string | null;
  periodLabel: string;
  events: ExtractedEvent[];
  tasks: ExtractedTask[];
  originalFilename: string;
  mimeType: string;
  storageKey: string | null;
  hash: string;
  /** Size of the page the boxes refer to, after any rotation the viewer applies. */
  sourcePage?: { widthPx: number; heightPx: number } | null;
}

export type QuestionIntent = "schedule" | "work" | "overlap" | "reminder";

export type AnswerLanguage = "sv" | "so";

export interface QuestionPlan {
  /** Language the question was asked in. Absent means Swedish. */
  language?: AnswerLanguage;
  from: string;
  to: string;
  personIds: string[];
  activityTerms: string[];
  intent: QuestionIntent;
  needsOverlap: boolean;
}

export interface AnswerSource {
  id: string;
  title: string;
  documentId: string | null;
  kind: "event" | "task";
  eventId: string | null;
  taskId: string | null;
}

export interface AssistantAnswer {
  text: string;
  hasEnoughData: boolean;
  matchedEventIds: string[];
  matchedTaskIds: string[];
  sources: AnswerSource[];
  overlapMinutes: number;
  periodLabel: string;
  plan?: QuestionPlan;
}

export interface ConfirmDocumentInput {
  extraction: DocumentExtraction;
  personId: string;
  events: ExtractedEvent[];
  tasks: ExtractedTask[];
  /**
   * Last calendar date this schedule applies to, as YYYY-MM-DD. A school
   * timetable is printed for one week but holds until something changes, so the
   * family says how long it holds and the week is copied up to that date.
   * Absent means the document covers only the week it shows.
   */
  repeatWeeklyUntil?: string | null;
}

export interface ApiErrorShape {
  error: string;
  code?: string;
  details?: string;
}
