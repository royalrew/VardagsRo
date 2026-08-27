import { createHash } from "node:crypto";

import postgres from "postgres";

import { requiredDatabaseUrl } from "./database-env.mjs";

const MIGRATION_LOCK_ID = 194_293_612;

const migrations = [
  {
    version: "001_initial_schema",
    name: "Initial family schema",
    statements: [
      `create table if not exists family_households (
        id text primary key,
        name text not null,
        timezone text not null,
        created_at timestamptz not null default now()
      )`,
      `create table if not exists family_people (
        id text primary key,
        household_id text not null references family_households(id) on delete cascade,
        name text not null,
        role text not null,
        aliases jsonb not null default '[]'::jsonb,
        initials text not null,
        color text not null,
        tint text not null,
        created_at timestamptz not null default now()
      )`,
      `create table if not exists family_documents (
        id text primary key,
        household_id text not null references family_households(id) on delete cascade,
        title text not null,
        filename text not null,
        mime_type text not null,
        document_type text not null,
        person_id text references family_people(id) on delete set null,
        status text not null check (status in ('confirmed', 'needs_review')),
        uploaded_at timestamptz not null default now(),
        period_label text not null default '',
        summary text not null default '',
        storage_key text,
        sha256 text,
        created_at timestamptz not null default now()
      )`,
      `create table if not exists family_events (
        id text primary key,
        household_id text not null references family_households(id) on delete cascade,
        person_id text not null references family_people(id) on delete cascade,
        document_id text references family_documents(id) on delete cascade,
        title text not null,
        category text not null check (category in ('work', 'school', 'sport', 'health', 'family', 'other')),
        starts_at timestamptz not null,
        ends_at timestamptz not null,
        all_day boolean not null default false,
        location text,
        status text not null check (status in ('confirmed', 'needs_review')),
        confidence double precision not null check (confidence >= 0 and confidence <= 1),
        source_excerpt text,
        created_at timestamptz not null default now(),
        check (ends_at > starts_at)
      )`,
      `create index if not exists family_events_household_time_idx
        on family_events (household_id, starts_at, ends_at)`,
      `create index if not exists family_documents_household_uploaded_idx
        on family_documents (household_id, uploaded_at desc)`,
    ],
  },
  {
    version: "002_family_tasks",
    name: "Family tasks and deadlines",
    statements: [
      `create table if not exists family_tasks (
        id text primary key,
        household_id text not null references family_households(id) on delete cascade,
        person_id text not null references family_people(id) on delete cascade,
        document_id text references family_documents(id) on delete cascade,
        title text not null,
        kind text not null check (kind in ('homework', 'exam', 'bring', 'form', 'preparation', 'other')),
        due_at timestamptz,
        completed_at timestamptz,
        notes text,
        review_status text not null check (review_status in ('confirmed', 'needs_review')),
        confidence double precision not null check (confidence >= 0 and confidence <= 1),
        source_excerpt text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`,
      `create index if not exists family_tasks_household_due_idx
        on family_tasks (household_id, due_at)`,
      `create index if not exists family_tasks_household_open_idx
        on family_tasks (household_id, completed_at, due_at)`,
      `create index if not exists family_tasks_document_idx
        on family_tasks (document_id)`,
    ],
  },
  {
    version: "003_event_notes",
    name: "Editable event notes",
    statements: [
      `alter table family_events
        add column if not exists notes text`,
    ],
  },
  {
    version: "004_document_folders",
    name: "Household document folders",
    statements: [
      `create table if not exists family_document_folders (
        id text primary key,
        household_id text not null references family_households(id) on delete cascade,
        parent_id text,
        name text not null check (char_length(btrim(name)) between 1 and 80),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (id, household_id),
        constraint family_document_folders_parent_household_fk
          foreign key (parent_id, household_id)
          references family_document_folders(id, household_id)
          on delete restrict
      )`,
      `create unique index if not exists family_document_folders_root_name_idx
        on family_document_folders (household_id, lower(name))
        where parent_id is null`,
      `create unique index if not exists family_document_folders_child_name_idx
        on family_document_folders (household_id, parent_id, lower(name))
        where parent_id is not null`,
      `create index if not exists family_document_folders_household_parent_idx
        on family_document_folders (household_id, parent_id, name)`,
      `alter table family_documents
        add column if not exists folder_id text`,
      `alter table family_documents
        add constraint family_documents_folder_household_fk
        foreign key (folder_id, household_id)
        references family_document_folders(id, household_id)
        on delete restrict`,
      `create index if not exists family_documents_household_folder_idx
        on family_documents (household_id, folder_id, uploaded_at desc)`,
    ],
  },
  {
    version: "005_family_wide_events",
    name: "Events that concern the whole family",
    statements: [
      // A null person means the event concerns everyone, the same convention
      // family_documents already uses. Dinner at grandma's is one row, not one
      // per family member.
      `alter table family_events
        alter column person_id drop not null`,
      `create index if not exists family_events_household_person_idx
        on family_events (household_id, person_id, starts_at)`,
    ],
  },
  {
    version: "006_telegram_accounts",
    name: "Secure Telegram account linking",
    statements: [
      `create table if not exists telegram_link_requests (
        code_hash text primary key,
        household_id text not null references family_households(id) on delete cascade,
        telegram_user_id text not null,
        telegram_chat_id text not null,
        telegram_username text,
        telegram_display_name text not null,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      )`,
      `create unique index if not exists telegram_link_requests_user_idx
        on telegram_link_requests (telegram_user_id)`,
      `create index if not exists telegram_link_requests_expiry_idx
        on telegram_link_requests (expires_at)`,
      `create table if not exists telegram_accounts (
        telegram_user_id text primary key,
        household_id text not null references family_households(id) on delete cascade,
        person_id text not null references family_people(id) on delete cascade,
        telegram_chat_id text not null,
        telegram_username text,
        telegram_display_name text not null,
        linked_at timestamptz not null default now(),
        unique (household_id, person_id)
      )`,
      `create table if not exists telegram_updates (
        update_id bigint primary key,
        received_at timestamptz not null default now()
      )`,
      `create index if not exists telegram_updates_received_idx
        on telegram_updates (received_at)`,
    ],
  },
  {
    version: "007_identity_permissions_audit",
    name: "Product identity, household permissions and append-only audit",
    statements: [
      `create table if not exists auth_users (
        id text primary key,
        name text not null,
        email text not null unique,
        email_verified boolean not null default false,
        image text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        role text,
        banned boolean not null default false,
        ban_reason text,
        ban_expires timestamptz
      )`,
      `create table if not exists auth_sessions (
        id text primary key,
        expires_at timestamptz not null,
        token text not null unique,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        ip_address text,
        user_agent text,
        user_id text not null references auth_users(id) on delete cascade,
        impersonated_by text
      )`,
      `create index if not exists auth_sessions_user_idx on auth_sessions (user_id)`,
      `create table if not exists auth_accounts (
        id text primary key,
        issuer text not null,
        account_id text not null,
        provider_id text not null,
        user_id text not null references auth_users(id) on delete cascade,
        access_token text,
        refresh_token text,
        id_token text,
        access_token_expires_at timestamptz,
        refresh_token_expires_at timestamptz,
        scope text,
        password text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (issuer, account_id)
      )`,
      `create index if not exists auth_accounts_user_idx on auth_accounts (user_id)`,
      `create table if not exists auth_verifications (
        id text primary key,
        identifier text not null,
        value text not null,
        expires_at timestamptz not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`,
      `create index if not exists auth_verifications_identifier_idx
        on auth_verifications (identifier)`,
      `create table if not exists auth_rate_limits (
        id text primary key,
        key text not null unique,
        count integer not null,
        last_request bigint not null
      )`,
      `alter table family_people add column if not exists person_type text`,
      `update family_people
        set person_type = case
          when lower(btrim(role)) in (
            'jag', 'mamma', 'pappa', 'mor', 'far', 'förälder', 'vårdnadshavare',
            'sambo', 'make', 'maka', 'fru', 'man', 'bonusmamma', 'bonuspappa'
          ) then 'adult'
          else 'child'
        end
        where person_type is null`,
      `alter table family_people alter column person_type set not null`,
      `alter table family_people
        add constraint family_people_person_type_check
        check (person_type in ('adult', 'child'))`,
      `alter table family_people
        add constraint family_people_id_household_unique unique (id, household_id)`,
      `create table if not exists family_memberships (
        id text primary key,
        household_id text not null references family_households(id) on delete restrict,
        user_id text not null references auth_users(id) on delete restrict,
        person_id text not null,
        role text not null check (role in ('owner', 'adult', 'viewer')),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (household_id, user_id),
        unique (household_id, person_id),
        constraint family_memberships_person_household_fk
          foreign key (person_id, household_id)
          references family_people(id, household_id)
          on delete restrict
      )`,
      `create index if not exists family_memberships_user_idx on family_memberships (user_id)`,
      `create table if not exists family_account_invitations (
        id text primary key,
        household_id text not null references family_households(id) on delete cascade,
        person_id text not null,
        email text not null,
        role text not null check (role in ('adult', 'viewer')),
        token_hash text not null unique,
        expires_at timestamptz not null,
        accepted_at timestamptz,
        invited_by_user_id text not null,
        created_at timestamptz not null default now(),
        constraint family_account_invitations_person_household_fk
          foreign key (person_id, household_id)
          references family_people(id, household_id)
          on delete cascade
      )`,
      `create unique index if not exists family_account_invitations_pending_person_idx
        on family_account_invitations (household_id, person_id)
        where accepted_at is null`,
      `create table if not exists family_audit_log (
        id bigint generated always as identity primary key,
        household_id text not null references family_households(id) on delete restrict,
        actor_kind text not null check (actor_kind in ('user', 'telegram', 'system')),
        actor_id text,
        action text not null,
        target_type text not null,
        target_id text,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )`,
      `create index if not exists family_audit_log_household_created_idx
        on family_audit_log (household_id, created_at desc)`,
      `create or replace function prevent_family_audit_mutation()
        returns trigger language plpgsql as $$
        begin
          raise exception 'family_audit_log is append-only';
        end
        $$`,
      `do $$
        begin
          if not exists (
            select 1 from pg_trigger where tgname = 'family_audit_log_append_only'
          ) then
            create trigger family_audit_log_append_only
              before update or delete on family_audit_log
              for each row execute function prevent_family_audit_mutation();
          end if;
        end
        $$`,
    ],
  },
  {
    version: "008_telegram_link_without_household",
    name: "Telegram link codes carry no household until redeemed",
    statements: [
      // The bot issues a code before anyone has proven who they are, so it
      // cannot know a household. Keeping the column would let the unauthenticated
      // side of the flow name the household the code later binds to. The
      // household is now taken from the redeeming session instead.
      `alter table telegram_link_requests drop column if exists household_id`,
    ],
  },
  {
    version: "009_auth_generated_ids",
    name: "Auth tables generate their own ids",
    statements: [
      // `generateId: "uuid"` does not mean Better Auth generates the value. On
      // Postgres it means Better Auth leaves the id to the database and expects
      // `gen_random_uuid()` as the column default. Migration 007 created these
      // columns without one, so every sign-in failed on a not-null violation.
      // Found by signing in against a real database; no unit test can see it.
      `alter table auth_users alter column id set default gen_random_uuid()::text`,
      `alter table auth_sessions alter column id set default gen_random_uuid()::text`,
      `alter table auth_accounts alter column id set default gen_random_uuid()::text`,
      `alter table auth_verifications alter column id set default gen_random_uuid()::text`,
      `alter table auth_rate_limits alter column id set default gen_random_uuid()::text`,
    ],
  },
];

function checksum(migration) {
  return createHash("sha256")
    .update(`${migration.version}\n${migration.name}\n${migration.statements.join("\n-- statement --\n")}`)
    .digest("hex");
}

const sql = postgres(requiredDatabaseUrl(), {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 20,
  prepare: false,
  onnotice: () => undefined,
});

try {
  const applied = [];
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK_ID})`;
    await tx`
      create table if not exists app_schema_migrations (
        version text primary key,
        name text not null,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `;

    const existing = await tx`
      select version, checksum from app_schema_migrations
    `;
    const byVersion = new Map(existing.map((row) => [row.version, row.checksum]));

    for (const migration of migrations) {
      const expectedChecksum = checksum(migration);
      const appliedChecksum = byVersion.get(migration.version);
      if (appliedChecksum) {
        if (appliedChecksum !== expectedChecksum) {
          throw new Error(
            `Migration ${migration.version} har ändrats efter att den kördes.`,
          );
        }
        continue;
      }

      for (const statement of migration.statements) {
        await tx.unsafe(statement);
      }
      await tx`
        insert into app_schema_migrations (version, name, checksum)
        values (${migration.version}, ${migration.name}, ${expectedChecksum})
      `;
      applied.push(migration.version);
    }
  });

  if (applied.length === 0) {
    console.log("Databasen är redan migrerad.");
  } else {
    console.log(`Körde migrationer: ${applied.join(", ")}.`);
  }
} catch (error) {
  console.error(
    error instanceof Error ? `Migration misslyckades: ${error.message}` : "Migration misslyckades.",
  );
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
