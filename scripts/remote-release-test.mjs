import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const FULL_MODE = process.argv.includes("--full");
const REQUEST_TIMEOUT_MS = 20_000;
const EXTRACTION_TIMEOUT_MS = 90_000;
const CLEANUP_DISCOVERY_ATTEMPTS = 8;
const CLEANUP_DISCOVERY_INTERVAL_MS = 2_500;
const startedAt = new Date();
const checks = [];

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Miljovariabeln ${name} saknas.`);
  return value;
}

function safeReleaseId(value) {
  if (!value) return null;
  return /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function futureTuesday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Stockholm",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const localNoonUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  const daysAhead = (2 - localNoonUtc.getUTCDay() + 7) % 7 || 7;
  localNoonUtc.setUTCDate(localNoonUtc.getUTCDate() + daysAhead);
  return localNoonUtc.toISOString().slice(0, 10);
}

function pdfString(value) {
  return value.replace(/([\\()])/g, "\\$1").replace(/[\r\n]+/g, " ");
}

function createTextPdf(lines) {
  const commands = ["BT", "/F1 14 Tf", "72 760 Td"];
  for (const [index, line] of lines.entries()) {
    if (index > 0) commands.push("0 -24 Td");
    commands.push(`(${pdfString(line)}) Tj`);
  }
  commands.push("ET");
  const stream = `${commands.join("\n")}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

async function request(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  return fetch(url, {
    ...options,
    redirect: options.redirect ?? "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function jsonResponse(response, expectedStatus, label) {
  assert(
    response.status === expectedStatus,
    `${label} gav HTTP ${response.status}, vantade ${expectedStatus}.`,
  );
  const contentType = response.headers.get("content-type") ?? "";
  assert(contentType.includes("application/json"), `${label} gav inte JSON.`);
  return response.json();
}

async function runCheck(name, action) {
  const before = Date.now();
  try {
    const result = await action();
    checks.push({ name, status: "passed", durationMs: Date.now() - before });
    console.log(`PASS ${name}`);
    return result;
  } catch (error) {
    checks.push({ name, status: "failed", durationMs: Date.now() - before });
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function writeArtifact(baseUrl, status) {
  const finishedAt = new Date();
  const artifact = {
    schemaVersion: 1,
    targetHost: baseUrl.host,
    mode: FULL_MODE ? "full" : "smoke",
    status,
    railwayDeploymentId: safeReleaseId(
      process.env.RAILWAY_DEPLOYMENT_ID ?? process.env.RELEASE_ID,
    ),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    checks,
  };
  const directory = path.resolve("artifacts", "releases");
  await mkdir(directory, { recursive: true });
  const timestamp = finishedAt.toISOString().replace(/[:.]/g, "-");
  const filename = `railway-${FULL_MODE ? "e2e" : "smoke"}-${timestamp}.json`;
  const artifactPath = path.join(directory, filename);
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(`RESULT ${artifactPath}`);
}

async function main() {
  const baseUrl = new URL(requiredEnv("BASE_URL"));
  assert(baseUrl.protocol === "https:", "BASE_URL maste anvanda HTTPS.");
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, "")}/`;
  baseUrl.search = "";
  baseUrl.hash = "";

  const username = requiredEnv("VARDAGSRO_GATE_USERNAME");
  const password = requiredEnv("VARDAGSRO_GATE_PASSWORD");
  const testEmail = requiredEnv("VARDAGSRO_TEST_EMAIL");
  const testPassword = requiredEnv("VARDAGSRO_TEST_PASSWORD");

  /*
   * Two separate gates, and the run has to pass both. Basic Auth keeps the whole
   * staging site private; the product session decides which household the
   * requests below may touch. Origin is sent from the start because the server
   * refuses cross-site mutations, and a release test that skipped it would be
   * testing a weaker server than the one being shipped.
   */
  const authHeaders = {
    Authorization: basicAuth(username, password),
    Origin: baseUrl.origin,
  };
  const url = (pathname) => new URL(pathname.replace(/^\/+/, ""), baseUrl);

  let extraction = null;
  let personId = null;
  let documentId = null;
  let taskId = null;
  let confirmedEvent = null;
  let manualEventId = null;
  let detachedEventId = null;
  let calendarTestTitle = null;
  let fixtureFilename = null;
  let rootFolderId = null;
  let childFolderId = null;
  let rootFolderName = null;
  let childFolderInitialName = null;
  let childFolderName = null;
  let renamedDocumentTitle = null;
  let originalDocumentTitle = null;
  let originalDocumentFolderId = null;
  let confirmAttempted = false;
  let eventCreateAttempted = false;
  let rootFolderCreateAttempted = false;
  let childFolderCreateAttempted = false;
  let documentOrganizationAttempted = false;
  let mainError = null;

  try {
    await runCheck("ready_public", async () => {
      const response = await request(url("api/ready"));
      const body = await jsonResponse(response, 200, "Publik readiness");
      assert(body.status === "ready", "Readiness ar inte ready.");
    });

    await runCheck("gate_rejects_anonymous_ui", async () => {
      const response = await request(url("/"));
      assert(response.status === 401, `UI utan auth gav HTTP ${response.status}.`);
      assert(
        (response.headers.get("www-authenticate") ?? "").startsWith("Basic "),
        "Basic Auth-utmaning saknas.",
      );
    });

    await runCheck("gate_protects_health", async () => {
      const response = await request(url("api/health"));
      assert(response.status === 401, `Health utan auth gav HTTP ${response.status}.`);
    });

    await runCheck("product_requires_login", async () => {
      const page = await request(url("/"), { headers: authHeaders });
      assert(
        page.status >= 300 && page.status < 400,
        `UI utan produktsession gav HTTP ${page.status}, vantade en omdirigering.`,
      );
      const target = page.headers.get("location") ?? "";
      assert(target.includes("/login"), `UI omdirigerade till ${target}, inte till /login.`);

      const api = await request(url("api/documents"), { headers: authHeaders });
      assert(
        api.status === 401,
        `API utan produktsession gav HTTP ${api.status}, vantade 401.`,
      );
    });

    await runCheck("product_login", async () => {
      const response = await request(url("api/auth/sign-in/email"), {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });
      assert(response.status === 200, `Inloggning gav HTTP ${response.status}.`);

      const cookies = response.headers.getSetCookie?.() ?? [];
      const session = cookies
        .map((cookie) => cookie.split(";")[0])
        .filter((pair) => pair.startsWith("vardagsro."));
      assert(session.length > 0, "Inloggningen satte ingen sessionscookie.");
      authHeaders.Cookie = session.join("; ");
    });

    await runCheck("authenticated_ui", async () => {
      const response = await request(url("/"), { headers: authHeaders });
      assert(response.status === 200, `UI med session gav HTTP ${response.status}.`);
      const contentType = response.headers.get("content-type") ?? "";
      assert(contentType.includes("text/html"), "UI gav inte HTML.");
    });

    await runCheck("production_health", async () => {
      const response = await request(url("api/health"), { headers: authHeaders });
      const body = await jsonResponse(response, 200, "Health med auth");
      assert(body.status === "ok", "Produktionshealth ar inte ok.");
      assert(body.services?.database === "ok", "Databasen ar inte ok.");
      assert(body.services?.openai === "configured", "OpenAI ar inte konfigurerat.");
      assert(body.services?.r2 === "ok", "R2 ar inte ok.");
    });

    const dashboard = await runCheck("dashboard_database", async () => {
      const response = await request(url("api/documents"), { headers: authHeaders });
      const body = await jsonResponse(response, 200, "Dashboard");
      assert(body.dataMode === "database", "Dashboard anvander demo-data.");
      assert(Array.isArray(body.people) && body.people.length > 0, "Familjeprofiler saknas.");
      assert(Array.isArray(body.documents), "Dokumentlistan saknas.");
      assert(Array.isArray(body.events), "Kalenderlistan saknas.");
      assert(Array.isArray(body.tasks), "Tasklistan saknas.");
      assert(Array.isArray(body.folders), "Mapplistan saknas.");
      return body;
    });

    if (!FULL_MODE) return { baseUrl, status: "passed" };

    const father = dashboard.people.find((person) => {
      const terms = [person.role, person.name, ...(person.aliases ?? [])]
        .filter((value) => typeof value === "string")
        .map((value) => value.toLocaleLowerCase("sv-SE"));
      return terms.includes("pappa") || terms.includes("mikael");
    });
    assert(father?.id, "Ingen testprofil for pappa/Mikael hittades.");
    personId = father.id;

    const runId = crypto.randomUUID().slice(0, 8);
    const eventDate = futureTuesday();
    calendarTestTitle = `Railway kalenderdrag ${runId}`;
    rootFolderName = `Railway E2E ${runId}`;
    childFolderInitialName = `Inkorg ${runId}`;
    childFolderName = `Verifierat ${runId}`;
    renamedDocumentTitle = `Railway dokument ${runId}`;
    const initialCalendarStart = new Date(`${eventDate}T08:00:00.000Z`);
    const initialCalendarEnd = new Date(initialCalendarStart.getTime() + 60 * 60_000);
    const movedCalendarStart = new Date(initialCalendarStart.getTime() + 28.5 * 60 * 60_000);
    const movedCalendarEnd = new Date(movedCalendarStart.getTime() + 90 * 60_000);

    await runCheck("create_manual_calendar_event", async () => {
      eventCreateAttempted = true;
      const response = await request(url("api/events"), {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          title: calendarTestTitle,
          category: "family",
          startsAt: initialCalendarStart.toISOString(),
          endsAt: initialCalendarEnd.toISOString(),
          allDay: false,
          location: "E2E startplats",
          notes: "Skapad av Railways releaseprov",
        }),
      });
      const body = await jsonResponse(response, 201, "Ny kalenderpost");
      const event = body.event ?? body;
      assert(typeof event.id === "string", "Ny kalenderpost saknar id.");
      manualEventId = event.id;
      assert(event.notes === "Skapad av Railways releaseprov", "Anteckningen sparades inte.");
    });

    await runCheck("move_and_edit_calendar_event", async () => {
      const response = await request(url(`api/events/${encodeURIComponent(manualEventId)}`), {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          title: calendarTestTitle,
          category: "family",
          startsAt: movedCalendarStart.toISOString(),
          endsAt: movedCalendarEnd.toISOString(),
          allDay: false,
          location: "E2E flyttad plats",
          notes: "Flyttad och bekräftad via kalenderns PATCH-kontrakt",
        }),
      });
      const body = await jsonResponse(response, 200, "Flyttad kalenderpost");
      assert(body.event?.id === manualEventId, "PATCH returnerade fel kalenderpost.");
      assert(
        body.event.startsAt === movedCalendarStart.toISOString() &&
          body.event.endsAt === movedCalendarEnd.toISOString(),
        "Kalenderpostens nya tider sparades inte.",
      );
      assert(body.event.location === "E2E flyttad plats", "Kalenderplatsen uppdaterades inte.");
    });

    await runCheck("calendar_update_visible_in_dashboard", async () => {
      const response = await request(url("api/documents"), { headers: authHeaders });
      const body = await jsonResponse(response, 200, "Kalenderkontroll");
      const event = body.events?.find((candidate) => candidate.id === manualEventId);
      assert(event, "Den flyttade kalenderposten saknas i dashboarden.");
      assert(event.startsAt === movedCalendarStart.toISOString(), "Dashboarden visar gammal starttid.");
      assert(
        event.notes === "Flyttad och bekräftad via kalenderns PATCH-kontrakt",
        "Dashboarden visar inte den sparade anteckningen.",
      );
    });

    const templatePath = fileURLToPath(
      new URL("./fixtures/railway-e2e-template.txt", import.meta.url),
    );
    const fixture = await readFile(templatePath, "utf8");
    const fixtureLines = fixture
      .replaceAll("{{RUN_ID}}", runId)
      .replaceAll("{{DATE}}", eventDate)
      .trim()
      .split(/\r?\n/);
    const pdf = createTextPdf(fixtureLines);
    fixtureFilename = `vardagsro-railway-e2e-${runId}.pdf`;

    await runCheck("upload_and_extract", async () => {
      const form = new FormData();
      form.set(
        "file",
        new Blob([pdf], { type: "application/pdf" }),
        fixtureFilename,
      );
      const response = await request(
        url("api/extract"),
        { method: "POST", headers: authHeaders, body: form },
        EXTRACTION_TIMEOUT_MS,
      );
      const body = await jsonResponse(response, 201, "Dokumenttolkning");
      extraction = body;
      assert(typeof body.hash === "string" && body.hash.length >= 32, "Filhash saknas.");
      assert(
        body.storageKey === null,
        "Dokumentet lagrades fore manniskan hade godkant tolkningen.",
      );
      assert(Array.isArray(body.events) && body.events.length > 0, "AI hittade inget arbetspass.");
      assert(
        body.events.some(
          (event) =>
            event.category === "work" && event.startsAt?.startsWith(eventDate),
        ),
        "AI hittade inte det vantade arbetspasset.",
      );
      assert(Array.isArray(body.tasks) && body.tasks.length > 0, "AI hittade ingen task.");
      assert(
        body.tasks.some(
          (task) => task.kind === "bring" && task.dueAt?.startsWith(eventDate),
        ),
        "AI hittade inte den vantade ta-med-tasken med deadline.",
      );
      return body;
    });

    await runCheck("confirm_document", async () => {
      const form = new FormData();
      form.set(
        "input",
        JSON.stringify({
          extraction,
          personId,
          events: extraction.events,
          tasks: extraction.tasks,
        }),
      );
      form.set(
        "file",
        new Blob([pdf], { type: "application/pdf" }),
        fixtureFilename,
      );
      confirmAttempted = true;
      const response = await request(url("api/documents"), {
        method: "POST",
        headers: authHeaders,
        body: form,
      }, 45_000);
      const body = await jsonResponse(response, 201, "Bekraftelse");
      assert(body.document?.id, "Bekraftat dokument-id saknas.");
      // Capture the ID before later assertions so cleanup targets this exact
      // record instead of creating a second recovery record.
      documentId = body.document.id;
      originalDocumentTitle = body.document.title;
      originalDocumentFolderId = body.document.folderId ?? null;
      assert(Array.isArray(body.events) && body.events.length > 0, "Bekraftade handelser saknas.");
      confirmedEvent = body.events.find(
        (event) => event.category === "work" && event.startsAt?.startsWith(eventDate),
      );
      assert(confirmedEvent?.id, "Bekraftat arbetspass saknar id.");
      assert(Array.isArray(body.tasks) && body.tasks.length > 0, "Bekraftade tasks saknas.");
      const confirmedTask = body.tasks.find(
        (task) => task.kind === "bring" && task.dueAt?.startsWith(eventDate),
      );
      assert(confirmedTask?.id, "Bekraftad ta-med-task saknar id.");
      taskId = confirmedTask.id;
      return body;
    });

    await runCheck("create_document_folder_tree", async () => {
      rootFolderCreateAttempted = true;
      const rootResponse = await request(url("api/document-folders"), {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ name: rootFolderName, parentId: null }),
      });
      const rootBody = await jsonResponse(rootResponse, 201, "Ny rotmapp");
      assert(typeof rootBody.folder?.id === "string", "Rotmappen saknar id.");
      rootFolderId = rootBody.folder.id;
      assert(rootBody.folder.name === rootFolderName, "Rotmappen fick fel namn.");
      assert(rootBody.folder.parentId === null, "Rotmappen fick en overmapp.");

      childFolderCreateAttempted = true;
      const childResponse = await request(url("api/document-folders"), {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ name: childFolderInitialName, parentId: rootFolderId }),
      });
      const childBody = await jsonResponse(childResponse, 201, "Ny undermapp");
      assert(typeof childBody.folder?.id === "string", "Undermappen saknar id.");
      childFolderId = childBody.folder.id;
      assert(childBody.folder.parentId === rootFolderId, "Undermappen ligger inte i rotmappen.");
    });

    await runCheck("rename_and_reparent_document_folder", async () => {
      const detachResponse = await request(
        url(`api/document-folders/${encodeURIComponent(childFolderId)}`),
        {
          method: "PATCH",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ name: childFolderName, parentId: null }),
        },
      );
      const detached = await jsonResponse(detachResponse, 200, "Flyttad undermapp");
      assert(detached.folder?.id === childFolderId, "Mapp-PATCH returnerade fel mapp.");
      assert(detached.folder.name === childFolderName, "Undermappens nya namn sparades inte.");
      assert(detached.folder.parentId === null, "Undermappen flyttades inte till roten.");

      const attachResponse = await request(
        url(`api/document-folders/${encodeURIComponent(childFolderId)}`),
        {
          method: "PATCH",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: rootFolderId }),
        },
      );
      const attached = await jsonResponse(attachResponse, 200, "Aterflyttad undermapp");
      assert(attached.folder?.name === childFolderName, "Undermappens namn tappades vid flytten.");
      assert(attached.folder.parentId === rootFolderId, "Undermappen aterstalldes inte under roten.");
    });

    await runCheck("move_and_rename_document", async () => {
      documentOrganizationAttempted = true;
      const response = await request(
        url(`api/documents/${encodeURIComponent(documentId)}`),
        {
          method: "PATCH",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            title: renamedDocumentTitle,
            folderId: childFolderId,
          }),
        },
      );
      const body = await jsonResponse(response, 200, "Flyttat dokument");
      assert(body.document?.id === documentId, "Dokument-PATCH returnerade fel dokument.");
      assert(body.document.title === renamedDocumentTitle, "Dokumentets nya namn sparades inte.");
      assert(body.document.folderId === childFolderId, "Dokumentet flyttades inte till undermappen.");
    });

    await runCheck("document_folder_tree_visible_in_dashboard", async () => {
      const response = await request(url("api/documents"), { headers: authHeaders });
      const body = await jsonResponse(response, 200, "Mappkontroll i dashboard");
      const root = body.folders?.find((folder) => folder.id === rootFolderId);
      const child = body.folders?.find((folder) => folder.id === childFolderId);
      const document = body.documents?.find((candidate) => candidate.id === documentId);
      assert(root?.name === rootFolderName && root.parentId === null, "Rotmappen saknas i dashboarden.");
      assert(
        child?.name === childFolderName && child.parentId === rootFolderId,
        "Undermappens hierarki saknas i dashboarden.",
      );
      assert(document?.title === renamedDocumentTitle, "Dashboarden visar dokumentets gamla namn.");
      assert(document?.folderId === childFolderId, "Dashboarden visar dokumentet i fel mapp.");
    });

    await runCheck("non_empty_folder_rejects_delete", async () => {
      const response = await request(
        url(`api/document-folders/${encodeURIComponent(childFolderId)}`),
        { method: "DELETE", headers: authHeaders },
      );
      const body = await jsonResponse(response, 409, "Radering av icke-tom mapp");
      assert(body.code === "FOLDER_NOT_EMPTY", "Icke-tom mapp gav fel konfliktkod.");
    });

    await runCheck("list_confirmed_task", async () => {
      const response = await request(url("api/tasks"), { headers: authHeaders });
      const body = await jsonResponse(response, 200, "Tasklista");
      const task = body.tasks?.find((candidate) => candidate.id === taskId);
      assert(task, "Den bekraftade tasken saknas i tasklistan.");
      assert(task.documentId === documentId, "Tasken saknar ratt dokumentkalla.");
      assert(task.completedAt === null, "En ny task ar redan markerad som klar.");
    });

    await runCheck("ask_with_verified_source", async () => {
      const response = await request(url("api/ask"), {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Jobbar pappa nasta tisdag?" }),
      }, 45_000);
      const body = await jsonResponse(response, 200, "Familjefraga");
      assert(body.hasEnoughData === true, "Svaret saknar tillrackligt underlag.");
      assert(
        Array.isArray(body.sources) &&
          body.sources.some(
            (source) =>
              source.documentId === documentId &&
              source.kind === "event" &&
              typeof source.eventId === "string" &&
              source.taskId === null,
          ),
        "Svaret saknar det verifierade testdokumentet som kalla.",
      );
    });

    await runCheck("ask_task_with_verified_source", async () => {
      const response = await request(url("api/ask"), {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Vad ska pappa ta med nasta tisdag?" }),
      }, 45_000);
      const body = await jsonResponse(response, 200, "Taskfraga");
      assert(body.hasEnoughData === true, "Tasksvaret saknar tillrackligt underlag.");
      assert(
        Array.isArray(body.sources) &&
          body.sources.some(
            (source) =>
              source.documentId === documentId &&
              source.kind === "task" &&
              source.taskId === taskId &&
              source.eventId === null,
          ),
        "Tasksvaret saknar det verifierade testdokumentet som kalla.",
      );
      assert(
        Array.isArray(body.matchedTaskIds) && body.matchedTaskIds.includes(taskId),
        "Tasksvaret redovisar inte matchad task.",
      );
    });

    await runCheck("complete_task", async () => {
      const response = await request(url(`api/tasks/${encodeURIComponent(taskId)}`), {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
      const body = await jsonResponse(response, 200, "Klarmarkering");
      assert(body.task?.id === taskId, "Klarmarkering returnerade fel task.");
      assert(
        typeof body.task.completedAt === "string" && Number.isFinite(Date.parse(body.task.completedAt)),
        "Klarmarkeringen saknar completedAt.",
      );
    });

    await runCheck("completed_task_is_not_answered", async () => {
      const response = await request(url("api/ask"), {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Vad ska pappa ta med nasta tisdag?" }),
      }, 45_000);
      const body = await jsonResponse(response, 200, "Taskfraga efter klarmarkering");
      assert(
        !body.sources?.some((source) => source.documentId === documentId),
        "En klar task anvandes fortfarande som aktuellt svarsunderlag.",
      );
    });

    await runCheck("signed_source", async () => {
      const response = await request(url(`api/documents/${encodeURIComponent(documentId)}`), {
        headers: authHeaders,
      });
      const body = await jsonResponse(response, 200, "Kallank");
      assert(typeof body.url === "string", "Signerad kallank saknas.");
      const signedUrl = new URL(body.url);
      assert(signedUrl.protocol === "https:", "Signerad kallank anvander inte HTTPS.");
      const sourceResponse = await request(signedUrl, { redirect: "follow" });
      assert(sourceResponse.status === 200, `Kallfil gav HTTP ${sourceResponse.status}.`);
      assert(
        (sourceResponse.headers.get("content-type") ?? "").includes("application/pdf"),
        "Kallfilen ar inte en PDF.",
      );
      await sourceResponse.body?.cancel();
    });

    await runCheck("manual_override_detaches_document_source", async () => {
      detachedEventId = confirmedEvent.id;
      const durationMs = Date.parse(confirmedEvent.endsAt) - Date.parse(confirmedEvent.startsAt);
      const startsAt = new Date(Date.parse(confirmedEvent.startsAt) + 30 * 60_000).toISOString();
      const endsAt = new Date(Date.parse(startsAt) + durationMs).toISOString();
      const response = await request(
        url(`api/events/${encodeURIComponent(detachedEventId)}`),
        {
          method: "PATCH",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            personId: confirmedEvent.personId,
            title: confirmedEvent.title,
            category: confirmedEvent.category,
            startsAt,
            endsAt,
            allDay: confirmedEvent.allDay,
            location: confirmedEvent.location,
            notes: "Manuell override i releaseprovet",
          }),
        },
      );
      const body = await jsonResponse(response, 200, "Manuell kalenderoverride");
      assert(body.event?.id === detachedEventId, "Override returnerade fel kalenderpost.");
      assert(body.event.documentId === null, "Override beholl en missvisande dokumentkalla.");
      assert(body.event.sourceExcerpt === null, "Override beholl ett missvisande kallutdrag.");
      assert(body.event.confidence === 1, "Override markerades inte som manuell familjedata.");
    });
  } catch (error) {
    mainError = error;
  } finally {
    const cleanupDocumentIds = new Set(documentId ? [documentId] : []);
    const cleanupEventIds = new Set(
      [manualEventId, detachedEventId].filter((id) => typeof id === "string"),
    );
    const cleanupChildFolderIds = new Set(
      [childFolderId].filter((id) => typeof id === "string"),
    );
    const cleanupRootFolderIds = new Set(
      [rootFolderId].filter((id) => typeof id === "string"),
    );

    if (
      fixtureFilename ||
      calendarTestTitle ||
      rootFolderName ||
      childFolderInitialName ||
      childFolderName
    ) {
      const needsLateDocumentDiscovery = confirmAttempted && !documentId;
      const needsLateEventDiscovery = eventCreateAttempted && !manualEventId;
      const needsLateRootFolderDiscovery =
        rootFolderCreateAttempted && cleanupRootFolderIds.size === 0;
      const needsLateChildFolderDiscovery =
        childFolderCreateAttempted && cleanupChildFolderIds.size === 0;
      const discoveryAttempts =
        needsLateDocumentDiscovery ||
        needsLateEventDiscovery ||
        needsLateRootFolderDiscovery ||
        needsLateChildFolderDiscovery
          ? CLEANUP_DISCOVERY_ATTEMPTS
          : 1;
      let discoveryError = null;
      for (let attempt = 1; attempt <= discoveryAttempts; attempt += 1) {
        try {
          const response = await request(url("api/documents"), { headers: authHeaders });
          const body = await jsonResponse(response, 200, "Stadningsinventering");
          for (const document of body.documents ?? []) {
            if (
              fixtureFilename &&
              document.filename === fixtureFilename &&
              typeof document.id === "string"
            ) {
              cleanupDocumentIds.add(document.id);
            }
          }
          for (const event of body.events ?? []) {
            if (
              calendarTestTitle &&
              event.title === calendarTestTitle &&
              typeof event.id === "string"
            ) {
              cleanupEventIds.add(event.id);
            }
          }
          for (const folder of body.folders ?? []) {
            if (
              rootFolderName &&
              folder.name === rootFolderName &&
              typeof folder.id === "string"
            ) {
              cleanupRootFolderIds.add(folder.id);
              rootFolderId ??= folder.id;
            }
            if (
              (folder.name === childFolderInitialName || folder.name === childFolderName) &&
              typeof folder.id === "string"
            ) {
              cleanupChildFolderIds.add(folder.id);
              childFolderId ??= folder.id;
            }
          }
          discoveryError = null;
          const lateDocumentResolved =
            !needsLateDocumentDiscovery || cleanupDocumentIds.size > 0;
          const lateEventResolved = !needsLateEventDiscovery || cleanupEventIds.size > 0;
          const lateRootFolderResolved =
            !needsLateRootFolderDiscovery || cleanupRootFolderIds.size > 0;
          const lateChildFolderResolved =
            !needsLateChildFolderDiscovery || cleanupChildFolderIds.size > 0;
          if (
            lateDocumentResolved &&
            lateEventResolved &&
            lateRootFolderResolved &&
            lateChildFolderResolved
          ) {
            break;
          }
        } catch (error) {
          discoveryError = error;
        }

        if (attempt < discoveryAttempts) {
          await delay(CLEANUP_DISCOVERY_INTERVAL_MS);
        }
      }
      const unresolvedLateDiscovery =
        (needsLateDocumentDiscovery && cleanupDocumentIds.size === 0) ||
        (needsLateEventDiscovery && cleanupEventIds.size === 0) ||
        (needsLateRootFolderDiscovery && cleanupRootFolderIds.size === 0) ||
        (needsLateChildFolderDiscovery && cleanupChildFolderIds.size === 0);
      if (discoveryError && unresolvedLateDiscovery) {
        if (!mainError) {
          mainError = discoveryError;
        } else {
          checks.push({
            name: "cleanup_discovery",
            status: "failed",
            durationMs: 0,
          });
        }
      }
      if (
        unresolvedLateDiscovery &&
        !discoveryError
      ) {
        checks.push({
          name: "cleanup_late_confirm_grace_period",
          status: "passed",
          durationMs:
            (CLEANUP_DISCOVERY_ATTEMPTS - 1) * CLEANUP_DISCOVERY_INTERVAL_MS,
        });
      }
    }

    if (
      documentOrganizationAttempted &&
      typeof documentId === "string" &&
      typeof originalDocumentTitle === "string"
    ) {
      try {
        await runCheck("cleanup_restore_document_organization", async () => {
          const response = await request(
            url(`api/documents/${encodeURIComponent(documentId)}`),
            {
              method: "PATCH",
              headers: { ...authHeaders, "Content-Type": "application/json" },
              body: JSON.stringify({
                title: originalDocumentTitle,
                folderId: originalDocumentFolderId,
              }),
            },
          );
          const body = await jsonResponse(response, 200, "Aterstallt dokument");
          assert(body.document?.title === originalDocumentTitle, "Dokumentnamnet aterstalldes inte.");
          assert(
            body.document.folderId === originalDocumentFolderId,
            "Dokumentet flyttades inte tillbaka till sin ursprungliga mapp.",
          );

          const dashboardResponse = await request(url("api/documents"), {
            headers: authHeaders,
          });
          const dashboardBody = await jsonResponse(
            dashboardResponse,
            200,
            "Dokumentkontroll efter aterstallning",
          );
          const restored = dashboardBody.documents?.find(
            (document) => document.id === documentId,
          );
          assert(restored?.title === originalDocumentTitle, "Dashboarden visar inte aterstallt namn.");
          assert(
            restored.folderId === originalDocumentFolderId,
            "Dashboarden visar inte dokumentets ursprungliga mapp.",
          );
        });
      } catch (cleanupError) {
        if (!mainError) mainError = cleanupError;
      }
    }

    if (cleanupEventIds.size > 0) {
      try {
        await runCheck("cleanup_test_calendar_events", async () => {
          const failures = [];
          for (const id of cleanupEventIds) {
            try {
              const response = await request(
                url(`api/events/${encodeURIComponent(id)}`),
                { method: "DELETE", headers: authHeaders },
              );
              const body = await jsonResponse(response, 200, "Kalenderstadning");
              assert(body.deleted === true, `Kalenderposten ${id} togs inte bort.`);
            } catch (error) {
              failures.push(error instanceof Error ? error.message : `Okant fel for ${id}`);
            }
          }
          assert(
            failures.length === 0,
            `Kalenderstadningen misslyckades for ${failures.length} poster.`,
          );

          const response = await request(url("api/documents"), { headers: authHeaders });
          const body = await jsonResponse(response, 200, "Kalenderkontroll efter stadning");
          assert(
            !body.events?.some(
              (event) =>
                cleanupEventIds.has(event.id) || event.title === calendarTestTitle,
            ),
            "Minst en testpost blev kvar i kalendern.",
          );
        });
      } catch (cleanupError) {
        if (!mainError) mainError = cleanupError;
      }
    }

    if (cleanupDocumentIds.size > 0) {
      try {
        await runCheck("cleanup_test_documents", async () => {
          const failures = [];
          for (const id of cleanupDocumentIds) {
            try {
              const response = await request(
                url(`api/documents/${encodeURIComponent(id)}`),
                { method: "DELETE", headers: authHeaders },
              );
              const body = await jsonResponse(response, 200, "Stadning");
              assert(body.deleted === true, `Testdokumentet ${id} togs inte bort.`);
              assert(body.storageDeleted === true, `Testfilen ${id} togs inte bort fran R2.`);
            } catch (error) {
              failures.push(error instanceof Error ? error.message : `Okant fel for ${id}`);
            }
          }
          assert(failures.length === 0, `Stadningen misslyckades for ${failures.length} dokument.`);

          const documentsResponse = await request(url("api/documents"), {
            headers: authHeaders,
          });
          const documentsBody = await jsonResponse(
            documentsResponse,
            200,
            "Dokumentkontroll efter stadning",
          );
          assert(
            !documentsBody.documents?.some(
              (document) => document.filename === fixtureFilename,
            ),
            "Minst en kopia av testdokumentet blev kvar.",
          );

          const tasksResponse = await request(url("api/tasks"), { headers: authHeaders });
          const tasksBody = await jsonResponse(tasksResponse, 200, "Taskstadning");
          assert(
            !tasksBody.tasks?.some(
              (task) => cleanupDocumentIds.has(task.documentId) || task.id === taskId,
            ),
            "Minst en testtask blev kvar efter att dokumenten togs bort.",
          );
        });
      } catch (cleanupError) {
        if (!mainError) mainError = cleanupError;
      }
    }

    if (
      cleanupChildFolderIds.size > 0 ||
      cleanupRootFolderIds.size > 0 ||
      rootFolderCreateAttempted ||
      childFolderCreateAttempted
    ) {
      try {
        await runCheck("cleanup_test_document_folders", async () => {
          const failures = [];
          const removeFolders = async (ids, label) => {
            for (const id of ids) {
              try {
                const response = await request(
                  url(`api/document-folders/${encodeURIComponent(id)}`),
                  { method: "DELETE", headers: authHeaders },
                );
                if (response.status === 404) continue;
                const body = await jsonResponse(response, 200, label);
                assert(body.deleted === true && body.id === id, `Mappen ${id} togs inte bort.`);
              } catch (error) {
                failures.push(error instanceof Error ? error.message : `Okant fel for ${id}`);
              }
            }
          };

          // Foreign-key and API invariants require deepest children first.
          await removeFolders(cleanupChildFolderIds, "Stadning av undermapp");
          await removeFolders(cleanupRootFolderIds, "Stadning av rotmapp");
          assert(failures.length === 0, `Mappstadningen misslyckades for ${failures.length} mappar.`);

          const response = await request(url("api/documents"), { headers: authHeaders });
          const body = await jsonResponse(response, 200, "Mappkontroll efter stadning");
          assert(
            !body.folders?.some(
              (folder) =>
                cleanupChildFolderIds.has(folder.id) ||
                cleanupRootFolderIds.has(folder.id) ||
                folder.name === rootFolderName ||
                folder.name === childFolderInitialName ||
                folder.name === childFolderName,
            ),
            "Minst en testmapp blev kvar efter stadningen.",
          );
        });
      } catch (cleanupError) {
        if (!mainError) mainError = cleanupError;
      }
    }
  }

  if (mainError) throw mainError;
  return { baseUrl, status: "passed" };
}

let baseUrlForArtifact = null;
try {
  const result = await main();
  baseUrlForArtifact = result.baseUrl;
  await writeArtifact(result.baseUrl, result.status);
} catch (error) {
  try {
    baseUrlForArtifact = new URL(process.env.BASE_URL ?? "https://invalid.invalid");
    await writeArtifact(baseUrlForArtifact, "failed");
  } catch {
    // Do not hide the original failure when even the sanitized artifact cannot be written.
  }
  console.error(error instanceof Error ? error.message : "Remote test misslyckades.");
  process.exitCode = 1;
}
