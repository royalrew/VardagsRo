"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleAlert,
  FileImage,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Home,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { Avatar, EmptyState } from "@/components/ui";
import { formatCompactDate } from "@/lib/dates";
import type {
  DashboardData,
  FamilyDocument,
  FamilyDocumentFolder,
} from "@/lib/types";

export const RECOMMENDED_DOCUMENT_CATEGORIES = [
  { name: "🧠 Jarvis Levande Dokument", description: "Sammanfattningar, rutiner och hushållsinstruktioner" },
  { name: "🏥 Kallelser & Vård", description: "Tandläkare, vårdcentral, bvc och läkarbesök" },
  { name: "👶 Skola & Barnens schema", description: "Veckobrev, aktiviteter, förskola och idrott" },
  { name: "🏠 Hushåll, Avtal & Ekonomi", description: "Hyra, fordon/bil, försäkringar och kvitton" },
  { name: "📁 Övrigt & Inkorg", description: "Osorterade dokument och underlag" },
] as const;

type Filter = "all" | "confirmed" | "needs_review";
type DraggedItem = { kind: "document" | "folder"; id: string };
type FolderChange = { name?: string; parentId?: string | null };
type DocumentChange = { title?: string; folderId?: string | null };

interface FolderEditorState {
  mode: "create" | "edit";
  folder: FamilyDocumentFolder | null;
  name: string;
  parentId: string | null;
}

interface DocumentEditorState {
  document: FamilyDocument;
  title: string;
  folderId: string | null;
}

interface DocumentsViewProps {
  data: DashboardData;
  onAdd: () => void;
  onOpen: (document: FamilyDocument) => void;
  onDelete: (document: FamilyDocument) => void;
  onCreateFolder: (input: { name: string; parentId: string | null }) => Promise<FamilyDocumentFolder | null>;
  onUpdateFolder: (folder: FamilyDocumentFolder, input: FolderChange) => Promise<FamilyDocumentFolder | null>;
  onDeleteFolder: (folder: FamilyDocumentFolder) => Promise<boolean>;
  onUpdateDocument: (document: FamilyDocument, input: DocumentChange) => Promise<FamilyDocument | null>;
}

export function descendantFolderIds(
  folders: readonly FamilyDocumentFolder[],
  folderId: string,
): Set<string> {
  const result = new Set<string>();
  const pending = [folderId];
  while (pending.length) {
    const parentId = pending.pop();
    for (const folder of folders) {
      if (folder.parentId === parentId && !result.has(folder.id)) {
        result.add(folder.id);
        pending.push(folder.id);
      }
    }
  }
  return result;
}

function sortedFolders(folders: readonly FamilyDocumentFolder[]): FamilyDocumentFolder[] {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name, "sv", { sensitivity: "base" }));
}

function folderPath(
  folderId: string | null,
  byId: ReadonlyMap<string, FamilyDocumentFolder>,
): string {
  const names: string[] = [];
  const visited = new Set<string>();
  let currentId = folderId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = byId.get(currentId);
    if (!folder) break;
    names.unshift(folder.name);
    currentId = folder.parentId;
  }
  return names.join(" / ");
}

function flattenFolderOptions(
  folders: readonly FamilyDocumentFolder[],
  excluded: ReadonlySet<string> = new Set(),
): Array<{ folder: FamilyDocumentFolder; depth: number }> {
  const byParent = new Map<string | null, FamilyDocumentFolder[]>();
  for (const folder of folders) {
    if (excluded.has(folder.id)) continue;
    const parentId = folder.parentId && !excluded.has(folder.parentId) ? folder.parentId : null;
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), folder]);
  }
  const result: Array<{ folder: FamilyDocumentFolder; depth: number }> = [];
  const visit = (parentId: string | null, depth: number, visited: Set<string>) => {
    for (const folder of sortedFolders(byParent.get(parentId) ?? [])) {
      if (visited.has(folder.id)) continue;
      result.push({ folder, depth });
      const next = new Set(visited);
      next.add(folder.id);
      visit(folder.id, depth + 1, next);
    }
  };
  visit(null, 0, new Set());
  return result;
}

export function DocumentsView({
  data,
  onAdd,
  onOpen,
  onDelete,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onUpdateDocument,
}: DocumentsViewProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedCategory, setSelectedCategory] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(data.folders.map((folder) => folder.id)));
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [dragged, setDragged] = useState<DraggedItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [folderEditor, setFolderEditor] = useState<FolderEditorState | null>(null);
  const [documentEditor, setDocumentEditor] = useState<DocumentEditorState | null>(null);

  const expandAllFolders = () => {
    setExpanded(new Set(data.folders.map((folder) => folder.id)));
  };

  const collapseAllFolders = () => {
    setExpanded(new Set());
  };

  const handleCreateRecommendedCategories = async () => {
    setBusy("folders:seed");
    try {
      for (const cat of RECOMMENDED_DOCUMENT_CATEGORIES) {
        if (!data.folders.some((f) => f.name.toLowerCase() === cat.name.toLowerCase())) {
          await onCreateFolder({ name: cat.name, parentId: null });
        }
      }
      setExpanded(new Set(data.folders.map((f) => f.id)));
    } finally {
      setBusy(null);
    }
  };

  const folderById = useMemo(
    () => new Map(data.folders.map((folder) => [folder.id, folder])),
    [data.folders],
  );
  const folderIds = useMemo(() => new Set(data.folders.map((folder) => folder.id)), [data.folders]);
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("sv");
    return data.documents
      .filter((document) => filter === "all" || document.status === filter)
      .filter((document) => {
        if (!needle) return true;
        return [
          document.title,
          document.summary,
          document.filename,
          folderPath(document.folderId, folderById),
        ].some((value) => value.toLocaleLowerCase("sv").includes(needle));
      })
      .sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt));
  }, [data.documents, filter, folderById, search]);
  const visibleIds = useMemo(() => new Set(visible.map((document) => document.id)), [visible]);

  const documentsForFolder = (folderId: string | null) =>
    visible.filter((document) => {
      if (folderId === null) return document.folderId === null || !folderIds.has(document.folderId);
      return document.folderId === folderId;
    });

  const folderContainsVisibleDocument = (folderId: string): boolean => {
    const allowed = descendantFolderIds(data.folders, folderId);
    allowed.add(folderId);
    return data.documents.some(
      (document) => visibleIds.has(document.id) && document.folderId !== null && allowed.has(document.folderId),
    );
  };

  const folderSubtreeMatchesSearch = (folderId: string): boolean => {
    const needle = search.trim().toLocaleLowerCase("sv");
    if (!needle) return true;
    const allowed = descendantFolderIds(data.folders, folderId);
    allowed.add(folderId);
    return data.folders.some(
      (folder) => allowed.has(folder.id) && folder.name.toLocaleLowerCase("sv").includes(needle),
    );
  };

  const toggleFolder = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startDrag = (event: ReactDragEvent, item: DraggedItem) => {
    if (busy) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-vardagsro-tree-item", JSON.stringify(item));
    setDragged(item);
    setOpenMenu(null);
  };

  const endDrag = () => {
    setDragged(null);
    setDropTarget(null);
  };

  const moveDragged = async (parentId: string | null) => {
    const item = dragged;
    endDrag();
    if (!item) return;
    if (item.kind === "document") {
      const document = data.documents.find((candidate) => candidate.id === item.id);
      if (!document || document.folderId === parentId) return;
      setBusy(`document:${document.id}`);
      await onUpdateDocument(document, { folderId: parentId });
      setBusy(null);
      if (parentId) setExpanded((current) => new Set(current).add(parentId));
      return;
    }

    const folder = data.folders.find((candidate) => candidate.id === item.id);
    if (!folder || folder.parentId === parentId) return;
    setBusy(`folder:${folder.id}`);
    await onUpdateFolder(folder, { parentId });
    setBusy(null);
    if (parentId) setExpanded((current) => new Set(current).add(parentId));
  };

  const dropProps = (folderId: string | null) => ({
    onDragOver: (event: ReactDragEvent) => {
      if (!dragged || (dragged.kind === "folder" && dragged.id === folderId)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTarget(folderId ?? "root");
    },
    onDragLeave: (event: ReactDragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
    },
    onDrop: (event: ReactDragEvent) => {
      event.preventDefault();
      void moveDragged(folderId);
    },
  });

  const openCreateFolder = (parentId: string | null) => {
    setOpenMenu(null);
    setEditorError(null);
    setFolderEditor({ mode: "create", folder: null, name: "", parentId });
  };

  const openEditFolder = (folder: FamilyDocumentFolder) => {
    setOpenMenu(null);
    setEditorError(null);
    setFolderEditor({ mode: "edit", folder, name: folder.name, parentId: folder.parentId });
  };

  const saveFolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!folderEditor || !folderEditor.name.trim()) return;
    setEditorError(null);
    setBusy(folderEditor.folder ? `folder:${folderEditor.folder.id}` : "folder:new");
    const saved = folderEditor.folder
      ? await onUpdateFolder(folderEditor.folder, {
          name: folderEditor.name.trim(),
          parentId: folderEditor.parentId,
        })
      : await onCreateFolder({
          name: folderEditor.name.trim(),
          parentId: folderEditor.parentId,
        });
    setBusy(null);
    if (!saved) {
      setEditorError("Mappen kunde inte sparas. Kontrollera namnet och f\u00f6rs\u00f6k igen.");
      return;
    }
    setExpanded((current) => {
      const next = new Set(current);
      next.add(saved.id);
      if (saved.parentId) next.add(saved.parentId);
      return next;
    });
    setFolderEditor(null);
  };

  const saveDocument = async (event: FormEvent) => {
    event.preventDefault();
    if (!documentEditor || !documentEditor.title.trim()) return;
    setEditorError(null);
    setBusy(`document:${documentEditor.document.id}`);
    const saved = await onUpdateDocument(documentEditor.document, {
      title: documentEditor.title.trim(),
      folderId: documentEditor.folderId,
    });
    setBusy(null);
    if (!saved) {
      setEditorError("Dokumentet kunde inte sparas. F\u00f6rs\u00f6k igen.");
      return;
    }
    if (saved.folderId) setExpanded((current) => new Set(current).add(saved.folderId as string));
    setDocumentEditor(null);
  };

  const removeFolder = async (folder: FamilyDocumentFolder) => {
    setOpenMenu(null);
    if (!window.confirm(`Ta bort den tomma mappen \u201d${folder.name}\u201d?`)) return;
    setBusy(`folder:${folder.id}`);
    await onDeleteFolder(folder);
    setBusy(null);
  };

  const renderDocument = (document: FamilyDocument) => {
    const person = data.people.find((item) => item.id === document.personId);
    const isPdf = document.mimeType === "application/pdf";
    const menuId = `document:${document.id}`;
    return (
      <article
        className={`document-tree-file${busy === menuId ? " is-busy" : ""}`}
        key={document.id}
        draggable={!busy}
        onDragStart={(event) => startDrag(event, { kind: "document", id: document.id })}
        onDragEnd={endDrag}
      >
        <button className="document-tree-file-main" onClick={() => onOpen(document)}>
          <span className={isPdf ? "tree-file-icon pdf" : "tree-file-icon image"}>
            {isPdf ? <FileText size={19} /> : <FileImage size={19} />}
          </span>
          <span className="tree-file-copy">
            <strong>{document.title}</strong>
            <small>
              {person ? <Avatar person={person} size="small" /> : null}
              <span>{person?.name ?? "Hela familjen"}</span>
              <i aria-hidden="true" />
              <span>{formatCompactDate(document.uploadedAt)}</span>
              <i aria-hidden="true" />
              <span>{document.eventsCount} tider</span>
              {document.tasksCount ? (
                <><i aria-hidden="true" /><ListChecks size={12} /> <span>{document.tasksCount} uppgifter</span></>
              ) : null}
            </small>
          </span>
          <span className={document.status === "confirmed" ? "tree-status confirmed" : "tree-status review"}>
            {document.status === "confirmed" ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
            {document.status === "confirmed" ? "Kontrollerat" : "Beh\u00f6ver kollas"}
          </span>
        </button>
        <div className="tree-row-menu-wrap">
          <button
            className="tree-more-button"
            aria-label={`Inst\u00e4llningar f\u00f6r ${document.title}`}
            aria-expanded={openMenu === menuId}
            onClick={() => setOpenMenu((current) => current === menuId ? null : menuId)}
          >
            <MoreHorizontal size={18} />
          </button>
          {openMenu === menuId ? (
            <div className="tree-action-menu" role="menu">
              <button role="menuitem" onClick={() => { setOpenMenu(null); onOpen(document); }}><FileText size={15} /> Öppna</button>
              <button role="menuitem" onClick={() => { setOpenMenu(null); setEditorError(null); setDocumentEditor({ document, title: document.title, folderId: document.folderId }); }}><Pencil size={15} /> Byt namn</button>
              <button role="menuitem" onClick={() => { setOpenMenu(null); setEditorError(null); setDocumentEditor({ document, title: document.title, folderId: document.folderId }); }}><FolderInput size={15} /> Flytta</button>
              <button className="danger" role="menuitem" onClick={() => { setOpenMenu(null); onDelete(document); }}><Trash2 size={15} /> Radera</button>
            </div>
          ) : null}
        </div>
      </article>
    );
  };

  const renderFolder = (
    folder: FamilyDocumentFolder,
    depth: number,
    ancestors: ReadonlySet<string>,
  ): ReactNode => {
    if (ancestors.has(folder.id)) return null;
    if (
      search.trim() &&
      !folderContainsVisibleDocument(folder.id) &&
      !folderSubtreeMatchesSearch(folder.id)
    ) return null;
    const children = sortedFolders(data.folders.filter((candidate) => candidate.parentId === folder.id));
    const documents = documentsForFolder(folder.id);
    const isExpanded = expanded.has(folder.id) || Boolean(search.trim());
    const menuId = `folder:${folder.id}`;
    const nextAncestors = new Set(ancestors).add(folder.id);
    return (
      <section className="document-tree-folder" key={folder.id} style={{ "--tree-depth": depth } as CSSProperties}>
        <div
          className={`document-tree-folder-row${dropTarget === folder.id ? " is-drop-target" : ""}${busy === menuId ? " is-busy" : ""}`}
          draggable={!busy}
          onDragStart={(event) => startDrag(event, { kind: "folder", id: folder.id })}
          onDragEnd={endDrag}
          {...dropProps(folder.id)}
        >
          <button className="folder-toggle" onClick={() => toggleFolder(folder.id)} aria-expanded={isExpanded}>
            {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
            {isExpanded ? <FolderOpen size={19} /> : <Folder size={19} />}
            <strong>{folder.name}</strong>
            <span>{documents.length + children.length}</span>
          </button>
          <div className="tree-row-menu-wrap">
            <button
              className="tree-more-button"
              aria-label={`Inst\u00e4llningar f\u00f6r mappen ${folder.name}`}
              aria-expanded={openMenu === menuId}
              onClick={() => setOpenMenu((current) => current === menuId ? null : menuId)}
            >
              <MoreHorizontal size={18} />
            </button>
            {openMenu === menuId ? (
              <div className="tree-action-menu" role="menu">
                <button role="menuitem" onClick={() => openCreateFolder(folder.id)}><Plus size={15} /> Ny undermapp</button>
                <button role="menuitem" onClick={() => openEditFolder(folder)}><Pencil size={15} /> Mappinställningar</button>
                <button className="danger" role="menuitem" onClick={() => void removeFolder(folder)}><Trash2 size={15} /> Ta bort tom mapp</button>
              </div>
            ) : null}
          </div>
        </div>
        {isExpanded ? (
          <div className="document-tree-children">
            {children.map((child) => renderFolder(child, depth + 1, nextAncestors))}
            {documents.map(renderDocument)}
            {!children.length && !documents.length ? <p className="tree-empty-folder">Släpp dokument här</p> : null}
          </div>
        ) : null}
      </section>
    );
  };

  const rootFolders = sortedFolders(
    data.folders.filter((folder) => folder.parentId === null || !folderIds.has(folder.parentId)),
  );
  const rootDocuments = documentsForFolder(null);

  const displayedFolders = selectedCategory === "all"
    ? rootFolders
    : rootFolders.filter((f) => f.id === selectedCategory);

  const displayedRootDocuments = selectedCategory === "all" || selectedCategory === "root"
    ? rootDocuments
    : [];

  const hasResults = visible.length > 0 || (!search.trim() && data.folders.length > 0);

  return (
    <div className="documents-view view-enter" onClick={(event) => {
      if (!(event.target as Element).closest(".tree-row-menu-wrap")) setOpenMenu(null);
    }}>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Familjens samlade underlag</p>
          <h1>Dokument & Filträd</h1>
          <p>Kallelser, barnens scheman och levande Jarvis-dokument &mdash; ordnade i kategorier så att hela familjen hittar.</p>
        </div>
        <div className="document-heading-actions">
          {data.folders.length > 0 ? (
            <>
              <button
                type="button"
                className="button button-ghost"
                onClick={expandAllFolders}
                title="Expandera alla mappar"
              >
                <ChevronsUpDown size={16} /> Expandera alla
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={collapseAllFolders}
                title="Fäll ihop alla mappar"
              >
                <ChevronsDownUp size={16} /> Fäll ihop
              </button>
            </>
          ) : null}
          <button className="button button-soft" onClick={() => openCreateFolder(null)}>
            <Folder size={17} /> Ny mapp
          </button>
          <button className="button button-primary" onClick={onAdd}>
            <Plus size={18} /> L&auml;gg till dokument
          </button>
        </div>
      </section>

      {/* 1-Click Standard Categories Seed Banner if no folders exist */}
      {data.folders.length === 0 ? (
        <section className="card recommended-folders-banner">
          <div className="banner-content">
            <div className="banner-icon-wrap">
              <Sparkles size={22} />
            </div>
            <div>
              <strong>Skapa rekommenderade kategorier</strong>
              <p>
                Organisera familjens dokument direkt med standardmappar för <b>🧠 Jarvis Levande Dokument</b>, <b>🏥 Kallelser & Vård</b>, <b>👶 Skola & Barnens schema</b> och <b>🏠 Hushåll & Avtal</b>.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="button button-primary"
            onClick={() => void handleCreateRecommendedCategories()}
            disabled={Boolean(busy)}
          >
            <FolderPlus size={16} /> {busy ? "Skapar mappar..." : "Skapa 5 standardkategorier"}
          </button>
        </section>
      ) : null}

      <section className="documents-toolbar card">
        <div className="filter-tabs" role="tablist" aria-label="Dokumentstatus">
          {([
            ["all", "Alla", data.documents.length],
            ["confirmed", "Kontrollerade", data.documents.filter((document) => document.status === "confirmed").length],
            ["needs_review", "Beh\u00f6ver kollas", data.documents.filter((document) => document.status === "needs_review").length],
          ] as const).map(([value, label, count]) => (
            <button role="tab" aria-selected={filter === value} className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>
              {label} <span>{count}</span>
            </button>
          ))}
        </div>
        <label className="document-search">
          <Search size={17} />
          <span className="sr-only">S&ouml;k dokument</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök dokument eller mapp" />
        </label>
      </section>

      {/* Category Pills Quick Bar when folders exist */}
      {data.folders.length > 0 ? (
        <nav className="document-category-pills" aria-label="Kategorier">
          <button
            type="button"
            className={`category-pill ${selectedCategory === "all" ? "active" : ""}`}
            onClick={() => setSelectedCategory("all")}
          >
            <Home size={14} />
            <span>Alla kategorier</span>
            <small>{data.documents.length}</small>
          </button>
          {rootFolders.map((folder) => {
            const docCount = data.documents.filter((d) => {
              if (d.folderId === folder.id) return true;
              const descendants = descendantFolderIds(data.folders, folder.id);
              return d.folderId !== null && descendants.has(d.folderId);
            }).length;

            return (
              <button
                key={folder.id}
                type="button"
                className={`category-pill ${selectedCategory === folder.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedCategory((curr) => (curr === folder.id ? "all" : folder.id));
                  setExpanded((curr) => new Set(curr).add(folder.id));
                }}
              >
                <Folder size={14} />
                <span>{folder.name}</span>
                <small>{docCount}</small>
              </button>
            );
          })}
        </nav>
      ) : null}

      {hasResults ? (
        <section className="document-tree card" aria-busy={Boolean(busy)}>
          <div
            className={`document-tree-root${dropTarget === "root" ? " is-drop-target" : ""}`}
            {...dropProps(null)}
          >
            <Home size={18} />
            <strong>Alla dokument</strong>
            <span>{visible.length}</span>
            <small>Dra och släpp dokument här för att flytta till roten</small>
          </div>
          <div className="document-tree-content">
            {displayedFolders.map((folder) => renderFolder(folder, 0, new Set()))}
            {displayedRootDocuments.map(renderDocument)}
          </div>
        </section>
      ) : (
        <div className="card empty-card">
          <EmptyState
            icon={search ? Search : FolderOpen}
            title={search ? "Inga dokument matchar" : "Inga dokument \u00e4nnu"}
            text={search ? "Prova ett annat s\u00f6kord." : "N\u00e4r ni l\u00e4gger till scheman och kallelser samlas de h\u00e4r."}
            action={!search ? <button className="button button-soft" onClick={onAdd}><Plus size={16} /> L&auml;gg till det f&ouml;rsta</button> : null}
          />
        </div>
      )}

      {folderEditor ? (
        <div className="modal-backdrop organization-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target && !busy) setFolderEditor(null);
        }}>
          <section className="organization-modal card" role="dialog" aria-modal="true" aria-labelledby="folder-editor-title">
            <header>
              <div><p className="eyebrow">Filtr&auml;d</p><h2 id="folder-editor-title">{folderEditor.mode === "create" ? "Ny mapp" : "Mappinst\u00e4llningar"}</h2></div>
              <button className="icon-button" onClick={() => setFolderEditor(null)} disabled={Boolean(busy)} aria-label="Stäng"><X size={19} /></button>
            </header>
            <form onSubmit={(event) => void saveFolder(event)}>
              <label><span>Namn</span><input autoFocus value={folderEditor.name} maxLength={80} onChange={(event) => setFolderEditor({ ...folderEditor, name: event.target.value })} /></label>
              <label>
                <span>Plats</span>
                <select value={folderEditor.parentId ?? ""} onChange={(event) => setFolderEditor({ ...folderEditor, parentId: event.target.value || null })}>
                  <option value="">Alla dokument (roten)</option>
                  {flattenFolderOptions(
                    data.folders,
                    folderEditor.folder
                      ? new Set([folderEditor.folder.id, ...descendantFolderIds(data.folders, folderEditor.folder.id)])
                      : new Set(),
                  ).map(({ folder, depth }) => <option key={folder.id} value={folder.id}>{`${"\u00a0\u00a0".repeat(depth)}${folder.name}`}</option>)}
                </select>
              </label>
              {editorError ? <p className="organization-error" role="alert">{editorError}</p> : null}
              <footer><button type="button" className="button button-ghost" onClick={() => setFolderEditor(null)} disabled={Boolean(busy)}>Avbryt</button><button className="button button-primary" disabled={Boolean(busy) || !folderEditor.name.trim()}>{busy ? "Sparar\u2026" : "Spara mapp"}</button></footer>
            </form>
          </section>
        </div>
      ) : null}

      {documentEditor ? (
        <div className="modal-backdrop organization-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target && !busy) setDocumentEditor(null);
        }}>
          <section className="organization-modal card" role="dialog" aria-modal="true" aria-labelledby="document-editor-title">
            <header>
              <div><p className="eyebrow">Dokumentinst&auml;llningar</p><h2 id="document-editor-title">Namn och plats</h2></div>
              <button className="icon-button" onClick={() => setDocumentEditor(null)} disabled={Boolean(busy)} aria-label="Stäng"><X size={19} /></button>
            </header>
            <form onSubmit={(event) => void saveDocument(event)}>
              <label><span>Visningsnamn</span><input autoFocus value={documentEditor.title} maxLength={200} onChange={(event) => setDocumentEditor({ ...documentEditor, title: event.target.value })} /></label>
              <label>
                <span>Mapp</span>
                <select value={documentEditor.folderId ?? ""} onChange={(event) => setDocumentEditor({ ...documentEditor, folderId: event.target.value || null })}>
                  <option value="">Alla dokument (roten)</option>
                  {flattenFolderOptions(data.folders).map(({ folder, depth }) => <option key={folder.id} value={folder.id}>{`${"\u00a0\u00a0".repeat(depth)}${folder.name}`}</option>)}
                </select>
              </label>
              {editorError ? <p className="organization-error" role="alert">{editorError}</p> : null}
              <footer><button type="button" className="button button-ghost" onClick={() => setDocumentEditor(null)} disabled={Boolean(busy)}>Avbryt</button><button className="button button-primary" disabled={Boolean(busy) || !documentEditor.title.trim()}>{busy ? "Sparar\u2026" : "Spara dokument"}</button></footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
