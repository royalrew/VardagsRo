import postgres from "postgres";

import { requiredDatabaseUrl } from "./database-env.mjs";

if (
  process.env.VARDAGSRO_ENV !== "staging" ||
  process.env.ALLOW_STAGING_DEMO_SEED !== "true"
) {
  console.error(
    "Seed stoppad: sätt VARDAGSRO_ENV=staging och ALLOW_STAGING_DEMO_SEED=true explicit.",
  );
  process.exit(1);
}

process.env.TZ = "Europe/Stockholm";

const HOUSEHOLD_ID = "household-demo";

function startOfWeek() {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
}

function relativeIso(dayOffset, hour, minute = 0) {
  const monday = startOfWeek();
  return new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + dayOffset,
    hour,
    minute,
  ).toISOString();
}

function uploadedIso(daysAgo, hour = 18) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

const people = [
  ["person-nora", "Nora", "Jag", ["jag", "mig", "nora"], "N", "#476b5b", "#dfece4"],
  ["person-mikael", "Mikael", "Pappa", ["pappa", "far", "mikael"], "M", "#5577a6", "#e4ebf6"],
  ["person-sara", "Sara", "Mamma", ["mamma", "mor", "sara"], "S", "#a6606e", "#f5e5e8"],
  ["person-leo", "Leo", "Lillebror", ["leo", "lillebror"], "L", "#bc7448", "#f8e9dc"],
];

const documents = [
  ["document-jobb", "Mikaels jobbschema", "jobbschema-augusti.jpg", "image/jpeg", "Jobbschema", "person-mikael", "confirmed", uploadedIso(2), "Den här veckan", "Arbetspass för Mikael under veckan."],
  ["document-fotboll", "Matchkallelse från IFK", "matchkallelse.png", "image/png", "Kallelse", "person-nora", "confirmed", uploadedIso(1, 20), "Söndag", "Samling och fotbollsmatch på Ekängens IP."],
  ["document-skola", "Information från skolan", "veckobrev.pdf", "application/pdf", "Skolbrev", "person-nora", "needs_review", uploadedIso(0, 7), "Nästa vecka", "Ett möjligt föräldramöte behöver kontrolleras."],
];

const folders = [
  ["folder-skola", null, "Skola"],
  ["folder-veckobrev", "folder-skola", "Veckobrev"],
  ["folder-scheman", null, "Scheman"],
  ["folder-aktiviteter", null, "Aktiviteter"],
];

const documentFolders = new Map([
  ["document-jobb", "folder-scheman"],
  ["document-fotboll", "folder-aktiviteter"],
  ["document-skola", "folder-veckobrev"],
]);

const events = [
  ["event-school-thursday", "person-nora", null, "Skoldag", "school", relativeIso(3, 8, 10), relativeIso(3, 14, 20), "Södra skolan", "confirmed", 1, null],
  ["event-dentist", "person-leo", null, "Tandläkaren", "health", relativeIso(3, 15, 30), relativeIso(3, 16, 15), "Folktandvården", "confirmed", 1, null],
  ["event-job-friday", "person-mikael", "document-jobb", "Jobb", "work", relativeIso(4, 7), relativeIso(4, 16), "Akutmottagningen", "confirmed", 0.98, "Fre 07.00–16.00 Mikael"],
  ["event-swim", "person-leo", null, "Simskola", "sport", relativeIso(5, 10, 30), relativeIso(5, 11, 15), "Badhuset", "confirmed", 1, null],
  ["event-job-sunday", "person-mikael", "document-jobb", "Jobb", "work", relativeIso(6, 7), relativeIso(6, 16), "Akutmottagningen", "confirmed", 0.98, "Sön 07.00–16.00 Mikael"],
  ["event-football-sunday", "person-nora", "document-fotboll", "Fotbollsmatch", "sport", relativeIso(6, 14, 30), relativeIso(6, 16), "Ekängens IP", "confirmed", 0.96, "Match söndag. Samling 14.30, slut cirka 16.00."],
  ["event-parent-meeting", "person-nora", "document-skola", "Föräldramöte?", "school", relativeIso(8, 18), relativeIso(8, 19, 30), "Södra skolan", "needs_review", 0.61, "Föräldramöte tisdag kl. 18 – kontrollera datum."],
];

const tasks = [
  ["task-bring-sportswear", "person-nora", "document-skola", "Ta med idrottskläder", "bring", relativeIso(8, 8), null, "Packa tröja, shorts och inneskor.", "confirmed", 0.96, "Ta med idrottskläder på tisdag."],
  ["task-form-consent", "person-nora", "document-skola", "Lämna in samtyckesblanketten", "form", relativeIso(10, 23, 59), null, "Blanketten ska vara underskriven av vårdnadshavare.", "confirmed", 0.94, "Samtyckesblanketten lämnas senast torsdag."],
];

const sql = postgres(requiredDatabaseUrl(), {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 20,
  prepare: false,
  onnotice: () => undefined,
});

try {
  await sql.begin(async (tx) => {
    const migration = await tx`
      select exists (
        select 1 from app_schema_migrations where version = '004_document_folders'
      ) as current
    `;
    if (!migration[0]?.current) {
      throw new Error("Kör db:migrate före staging-seed.");
    }

    const foreignHouseholds = await tx`
      select count(*)::int as count from family_households where id <> ${HOUSEHOLD_ID}
    `;
    if (Number(foreignHouseholds[0]?.count ?? 0) > 0) {
      throw new Error("Seed vägrar skriva i en databas med ett annat hushåll.");
    }

    await tx`
      insert into family_households (id, name, timezone)
      values (${HOUSEHOLD_ID}, 'Familjen Lindberg', 'Europe/Stockholm')
      on conflict (id) do update set
        name = excluded.name,
        timezone = excluded.timezone
    `;

    for (const person of people) {
      await tx`
        insert into family_people
          (id, household_id, name, role, aliases, initials, color, tint)
        values
          (${person[0]}, ${HOUSEHOLD_ID}, ${person[1]}, ${person[2]},
           ${JSON.stringify(person[3])}::jsonb, ${person[4]}, ${person[5]}, ${person[6]})
        on conflict (id) do update set
          name = excluded.name,
          role = excluded.role,
          aliases = excluded.aliases,
          initials = excluded.initials,
          color = excluded.color,
          tint = excluded.tint
      `;
    }

    for (const folder of folders) {
      await tx`
        insert into family_document_folders (id, household_id, parent_id, name)
        values (${folder[0]}, ${HOUSEHOLD_ID}, ${folder[1]}, ${folder[2]})
        on conflict (id) do update set
          parent_id = excluded.parent_id,
          name = excluded.name,
          updated_at = now()
      `;
    }

    for (const document of documents) {
      await tx`
        insert into family_documents
          (id, household_id, title, filename, mime_type, document_type, person_id,
           folder_id, status, uploaded_at, period_label, summary, storage_key, sha256)
        values
          (${document[0]}, ${HOUSEHOLD_ID}, ${document[1]}, ${document[2]},
           ${document[3]}, ${document[4]}, ${document[5]}, ${documentFolders.get(document[0])},
           ${document[6]},
           ${document[7]}, ${document[8]}, ${document[9]}, null, null)
        on conflict (id) do update set
          title = excluded.title,
          filename = excluded.filename,
          mime_type = excluded.mime_type,
          document_type = excluded.document_type,
          person_id = excluded.person_id,
          folder_id = excluded.folder_id,
          status = excluded.status,
          uploaded_at = excluded.uploaded_at,
          period_label = excluded.period_label,
          summary = excluded.summary
      `;
    }

    for (const event of events) {
      await tx`
        insert into family_events
          (id, household_id, person_id, document_id, title, category, starts_at,
           ends_at, all_day, location, status, confidence, source_excerpt)
        values
          (${event[0]}, ${HOUSEHOLD_ID}, ${event[1]}, ${event[2]}, ${event[3]},
           ${event[4]}, ${event[5]}, ${event[6]}, false, ${event[7]}, ${event[8]},
           ${event[9]}, ${event[10]})
        on conflict (id) do update set
          person_id = excluded.person_id,
          document_id = excluded.document_id,
          title = excluded.title,
          category = excluded.category,
          starts_at = excluded.starts_at,
          ends_at = excluded.ends_at,
          all_day = excluded.all_day,
          location = excluded.location,
          status = excluded.status,
          confidence = excluded.confidence,
          source_excerpt = excluded.source_excerpt
      `;
    }

    for (const task of tasks) {
      await tx`
        insert into family_tasks
          (id, household_id, person_id, document_id, title, kind, due_at,
           completed_at, notes, review_status, confidence, source_excerpt)
        values
          (${task[0]}, ${HOUSEHOLD_ID}, ${task[1]}, ${task[2]}, ${task[3]},
           ${task[4]}, ${task[5]}, ${task[6]}, ${task[7]}, ${task[8]},
           ${task[9]}, ${task[10]})
        on conflict (id) do update set
          person_id = excluded.person_id,
          document_id = excluded.document_id,
          title = excluded.title,
          kind = excluded.kind,
          due_at = excluded.due_at,
          notes = excluded.notes,
          review_status = excluded.review_status,
          confidence = excluded.confidence,
          source_excerpt = excluded.source_excerpt,
          updated_at = now()
      `;
    }
  });
  console.log("Stagingens demohushåll är seedat.");
} catch (error) {
  console.error(
    error instanceof Error ? `Seed misslyckades: ${error.message}` : "Seed misslyckades.",
  );
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
