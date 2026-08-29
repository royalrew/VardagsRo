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
  {
    version: "010_undo_entries",
    name: "A way back from a deletion",
    statements: [
      // Deletions stay hard. Marking rows as deleted instead would put
      // "and deleted_at is null" into every read in the product, and the one
      // that got forgotten would quietly serve deleted family data. The removed
      // row is copied here in the same transaction instead, where no read path
      // can trip over it.
      `create table if not exists family_undo_entries (
        id bigint generated always as identity primary key,
        household_id text not null references family_households(id) on delete cascade,
        actor_id text,
        action text not null,
        label text not null,
        payload jsonb not null,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null
      )`,
      `create index if not exists family_undo_entries_household_idx
        on family_undo_entries (household_id, created_at desc)`,
      `create index if not exists family_undo_entries_expiry_idx
        on family_undo_entries (expires_at)`,
    ],
  },
  {
    version: "011_solo_progress",
    name: "One adult's own progress, private from the household",
    statements: [
      // Keyed by user, never by household. Everything else in this schema is
      // shared family data on purpose; this is the one place where a row must
      // not become readable by living in the same house. There is no
      // household_id to filter by wrongly and no join that could reintroduce
      // one.
      `create table if not exists solo_actions (
        id text primary key,
        user_id text not null references auth_users(id) on delete cascade,
        kind text not null check (kind in (
          'outreach_sent', 'application_sent', 'portfolio_published',
          'interview_held', 'proposal_sent', 'offer_received',
          'invoice_sent', 'payment_received'
        )),
        occurred_on date not null,
        evidence text not null check (length(btrim(evidence)) > 0),
        amount_ore bigint check (amount_ore is null or amount_ore >= 0),
        xp integer not null check (xp >= 0),
        created_at timestamptz not null default now()
      )`,
      // Evidence is what separates this ledger from a wish list, so the
      // database refuses a blank one rather than trusting the form.
      `create index if not exists solo_actions_user_idx
        on solo_actions (user_id, occurred_on desc, id)`,
      `create table if not exists solo_health_days (
        user_id text not null references auth_users(id) on delete cascade,
        day date not null,
        sleep_hours numeric(4, 2) check (sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 24)),
        workouts integer not null default 0 check (workouts >= 0 and workouts <= 10),
        weight_kg numeric(5, 2) check (weight_kg is null or (weight_kg > 0 and weight_kg < 400)),
        energy integer check (energy is null or (energy >= 1 and energy <= 5)),
        diet_held boolean,
        note text,
        updated_at timestamptz not null default now(),
        primary key (user_id, day)
      )`,
    ],
  },
  {
    version: "012_solo_smaller_first_steps",
    name: "Three smaller rungs below the first outreach",
    statements: [
      // The ladder used to start at "contact a stranger". These three kinds sit
      // below it: making a link public, showing it to someone you already know,
      // and asking a question. All three leave the computer and can be checked,
      // and none of them can be refused by anyone.
      `alter table solo_actions drop constraint if exists solo_actions_kind_check`,
      `alter table solo_actions add constraint solo_actions_kind_check check (kind in (
        'made_visible', 'shown_to_someone', 'question_asked',
        'outreach_sent', 'application_sent', 'portfolio_published',
        'interview_held', 'proposal_sent', 'offer_received',
        'invoice_sent', 'payment_received'
      ))`,
    ],
  },
  {
    version: "013_solo_endurance",
    name: "Back care, and a weight goal to measure direction against",
    statements: [
      // Lifting people for a living wears a back out. This is the small daily
      // thing that protects it, kept apart from workouts on purpose: it has to
      // stay loggable on a day with nothing left for training.
      `alter table solo_health_days add column if not exists mobility boolean`,
      // A weight trend has no good direction without a target, so the target is
      // stored rather than guessed. Nothing else about a body belongs here.
      `create table if not exists solo_settings (
        user_id text primary key references auth_users(id) on delete cascade,
        weight_goal_kg numeric(5, 2) check (
          weight_goal_kg is null or (weight_goal_kg > 0 and weight_goal_kg < 400)
        ),
        updated_at timestamptz not null default now()
      )`,
    ],
  },
  {
    version: "014_solo_inbound",
    name: "The one kind that needs someone else to move first",
    statements: [
      // Being contacted cannot be manufactured, which is exactly why it is
      // worth recording separately from every outreach that went the other way.
      `alter table solo_actions drop constraint if exists solo_actions_kind_check`,
      `alter table solo_actions add constraint solo_actions_kind_check check (kind in (
        'made_visible', 'shown_to_someone', 'question_asked',
        'outreach_sent', 'application_sent', 'portfolio_published',
        'interview_held', 'inbound_received', 'proposal_sent',
        'offer_received', 'invoice_sent', 'payment_received'
      ))`,
    ],
  },
  {
    version: "015_project100_training",
    name: "Private normalized training sessions and templates",
    statements: [
      // Projekt 100 belongs to an account, never to the household. The user id
      // is repeated on child rows and included in every foreign key so even a
      // faulty future query cannot attach one adult's set to another adult's
      // session.
      `create table if not exists project100_exercises (
        id text primary key,
        user_id text not null references auth_users(id) on delete cascade,
        name text not null check (char_length(btrim(name)) between 1 and 120),
        normalized_name text not null check (char_length(btrim(normalized_name)) between 1 and 120),
        archived_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (id, user_id),
        unique (user_id, normalized_name)
      )`,
      `create table if not exists project100_training_templates (
        id text primary key,
        user_id text not null references auth_users(id) on delete cascade,
        name text not null check (char_length(btrim(name)) between 1 and 100),
        activity_type text not null check (activity_type in (
          'strength_home', 'forest', 'outdoor_gym', 'running',
          'cycling', 'spinning', 'mobility', 'other'
        )),
        description text check (description is null or char_length(description) <= 1000),
        archived_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (id, user_id)
      )`,
      `create unique index if not exists project100_training_templates_user_name_idx
        on project100_training_templates (user_id, lower(btrim(name)))
        where archived_at is null`,
      `create table if not exists project100_training_template_exercises (
        id text primary key,
        user_id text not null references auth_users(id) on delete cascade,
        template_id text not null,
        exercise_id text not null,
        position integer not null check (position >= 0 and position < 100),
        notes text check (notes is null or char_length(notes) <= 500),
        unique (id, user_id),
        unique (user_id, template_id, position),
        constraint project100_template_exercises_template_fk
          foreign key (template_id, user_id)
          references project100_training_templates(id, user_id)
          on delete cascade,
        constraint project100_template_exercises_exercise_fk
          foreign key (exercise_id, user_id)
          references project100_exercises(id, user_id)
          on delete restrict
      )`,
      `create table if not exists project100_training_template_sets (
        id text primary key,
        user_id text not null references auth_users(id) on delete cascade,
        template_exercise_id text not null,
        position integer not null check (position >= 0 and position < 100),
        target_reps integer check (target_reps is null or (target_reps >= 0 and target_reps <= 10000)),
        target_weight_kg numeric(7, 2) check (target_weight_kg is null or (target_weight_kg >= 0 and target_weight_kg < 5000)),
        target_duration_seconds integer check (target_duration_seconds is null or (target_duration_seconds >= 0 and target_duration_seconds <= 604800)),
        target_distance_meters bigint check (target_distance_meters is null or (target_distance_meters >= 0 and target_distance_meters <= 10000000)),
        target_rpe numeric(3, 1) check (target_rpe is null or (target_rpe >= 1 and target_rpe <= 10)),
        unique (id, user_id),
        unique (user_id, template_exercise_id, position),
        constraint project100_template_sets_exercise_fk
          foreign key (template_exercise_id, user_id)
          references project100_training_template_exercises(id, user_id)
          on delete cascade,
        check (
          target_reps is not null or target_weight_kg is not null or
          target_duration_seconds is not null or target_distance_meters is not null or
          target_rpe is not null
        )
      )`,
      `create table if not exists project100_training_sessions (
        id text primary key,
        user_id text not null references auth_users(id) on delete cascade,
        source_template_id text,
        title text not null check (char_length(btrim(title)) between 1 and 160),
        activity_type text not null check (activity_type in (
          'strength_home', 'forest', 'outdoor_gym', 'running',
          'cycling', 'spinning', 'mobility', 'other'
        )),
        status text not null check (status in ('planned', 'in_progress', 'completed', 'skipped')),
        session_date date not null,
        planned_start_at timestamptz,
        planned_end_at timestamptz,
        started_at timestamptz,
        ended_at timestamptz,
        duration_seconds integer check (duration_seconds is null or (duration_seconds >= 0 and duration_seconds <= 604800)),
        location text check (location is null or char_length(location) <= 200),
        effort integer check (effort is null or (effort >= 1 and effort <= 10)),
        body_before text check (body_before is null or char_length(body_before) <= 1000),
        body_after text check (body_after is null or char_length(body_after) <= 1000),
        notes text check (notes is null or char_length(notes) <= 3000),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (id, user_id),
        constraint project100_training_sessions_template_fk
          foreign key (source_template_id, user_id)
          references project100_training_templates(id, user_id)
          on delete restrict,
        check (planned_end_at is null or (planned_start_at is not null and planned_end_at > planned_start_at)),
        check (ended_at is null or (started_at is not null and ended_at > started_at)),
        check (status <> 'in_progress' or (started_at is not null and ended_at is null)),
        check (status <> 'planned' or (started_at is null and ended_at is null)),
        check (status <> 'skipped' or (started_at is null and ended_at is null))
      )`,
      `create unique index if not exists project100_training_sessions_one_active_idx
        on project100_training_sessions (user_id)
        where status = 'in_progress'`,
      `create index if not exists project100_training_sessions_upcoming_idx
        on project100_training_sessions (user_id, session_date, planned_start_at, id)
        where status = 'planned'`,
      `create index if not exists project100_training_sessions_history_idx
        on project100_training_sessions (user_id, session_date desc, created_at desc, id)
        where status = 'completed'`,
      `create index if not exists project100_training_sessions_template_idx
        on project100_training_sessions (user_id, source_template_id)
        where source_template_id is not null`,
      `create table if not exists project100_training_session_exercises (
        id text primary key,
        user_id text not null references auth_users(id) on delete cascade,
        session_id text not null,
        exercise_id text not null,
        position integer not null check (position >= 0 and position < 100),
        notes text check (notes is null or char_length(notes) <= 500),
        unique (id, user_id),
        unique (user_id, session_id, position),
        constraint project100_session_exercises_session_fk
          foreign key (session_id, user_id)
          references project100_training_sessions(id, user_id)
          on delete cascade,
        constraint project100_session_exercises_exercise_fk
          foreign key (exercise_id, user_id)
          references project100_exercises(id, user_id)
          on delete restrict
      )`,
      `create index if not exists project100_training_session_exercise_history_idx
        on project100_training_session_exercises (user_id, exercise_id, session_id)`,
      `create index if not exists project100_training_template_exercise_history_idx
        on project100_training_template_exercises (user_id, exercise_id)`,
      `create table if not exists project100_training_session_sets (
        id text primary key,
        user_id text not null references auth_users(id) on delete cascade,
        session_exercise_id text not null,
        position integer not null check (position >= 0 and position < 100),
        target_reps integer check (target_reps is null or (target_reps >= 0 and target_reps <= 10000)),
        target_weight_kg numeric(7, 2) check (target_weight_kg is null or (target_weight_kg >= 0 and target_weight_kg < 5000)),
        target_duration_seconds integer check (target_duration_seconds is null or (target_duration_seconds >= 0 and target_duration_seconds <= 604800)),
        target_distance_meters bigint check (target_distance_meters is null or (target_distance_meters >= 0 and target_distance_meters <= 10000000)),
        target_rpe numeric(3, 1) check (target_rpe is null or (target_rpe >= 1 and target_rpe <= 10)),
        actual_reps integer check (actual_reps is null or (actual_reps >= 0 and actual_reps <= 10000)),
        actual_weight_kg numeric(7, 2) check (actual_weight_kg is null or (actual_weight_kg >= 0 and actual_weight_kg < 5000)),
        actual_duration_seconds integer check (actual_duration_seconds is null or (actual_duration_seconds >= 0 and actual_duration_seconds <= 604800)),
        actual_distance_meters bigint check (actual_distance_meters is null or (actual_distance_meters >= 0 and actual_distance_meters <= 10000000)),
        actual_rpe numeric(3, 1) check (actual_rpe is null or (actual_rpe >= 1 and actual_rpe <= 10)),
        completed boolean not null default false,
        unique (id, user_id),
        unique (user_id, session_exercise_id, position),
        constraint project100_session_sets_exercise_fk
          foreign key (session_exercise_id, user_id)
          references project100_training_session_exercises(id, user_id)
          on delete cascade,
        check (
          target_reps is not null or target_weight_kg is not null or
          target_duration_seconds is not null or target_distance_meters is not null or
          target_rpe is not null or actual_reps is not null or
          actual_weight_kg is not null or actual_duration_seconds is not null or
          actual_distance_meters is not null or actual_rpe is not null
        )
      )`,
    ],
  },
  {
    version: "016_project100_media",
    name: "Private image library with its own object keys",
    statements: [
      // A body photo is the most private row in this system. It is keyed by
      // user like the rest of Projekt 100, and the object key repeats the user
      // id so a stored key can be checked against the reader before it is ever
      // signed. Nothing here is reachable from a household join.
      `create table if not exists project100_media (
        id text primary key,
        user_id text not null references auth_users(id) on delete cascade,
        category text not null check (category in ('body', 'food', 'training', 'content')),
        captured_on date not null,
        caption text check (caption is null or char_length(caption) <= 500),
        original_key text not null unique,
        original_mime text not null check (original_mime in ('image/jpeg', 'image/png', 'image/webp')),
        original_bytes integer not null check (original_bytes > 0 and original_bytes <= 12582912),
        preview_key text unique,
        preview_bytes integer check (preview_bytes is null or (preview_bytes > 0 and preview_bytes <= 1048576)),
        width integer check (width is null or (width > 0 and width <= 20000)),
        height integer check (height is null or (height > 0 and height <= 20000)),
        sha256 text not null check (char_length(sha256) = 64),
        session_id text,
        created_at timestamptz not null default now(),
        unique (id, user_id),
        check ((preview_key is null) = (preview_bytes is null)),
        constraint project100_media_session_fk
          foreign key (session_id, user_id)
          references project100_training_sessions(id, user_id)
          on delete set null
      )`,
      // The timeline reads by day, the gallery by category. Both stay inside
      // one user by having the user id first in every index.
      `create index if not exists project100_media_timeline_idx
        on project100_media (user_id, captured_on desc, created_at desc, id)`,
      `create index if not exists project100_media_category_idx
        on project100_media (user_id, category, captured_on desc, id)`,
      `create index if not exists project100_media_session_idx
        on project100_media (user_id, session_id)
        where session_id is not null`,
    ],
  },
  {
    version: "017_project100_body",
    name: "Weight, measurements and the goal they point at",
    statements: [
      // Projekt 100 gets its own settings rather than borrowing the Solo table
      // it is meant to replace. The goal is stored because a weight trend has
      // no direction without one; nothing else about a body belongs here.
      `create table if not exists project100_settings (
        user_id text primary key references auth_users(id) on delete cascade,
        weight_goal_kg numeric(5, 2) check (
          weight_goal_kg is null or (weight_goal_kg > 0 and weight_goal_kg < 400)
        ),
        start_weight_kg numeric(5, 2) check (
          start_weight_kg is null or (start_weight_kg > 0 and start_weight_kg < 400)
        ),
        height_cm numeric(4, 1) check (
          height_cm is null or (height_cm > 50 and height_cm < 260)
        ),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`,
      // One row per measured day carries what the numbers cannot: how the day
      // felt. The measurements themselves hang off it.
      `create table if not exists project100_body_entries (
        user_id text not null references auth_users(id) on delete cascade,
        measured_on date not null,
        note text check (note is null or char_length(note) <= 1000),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (user_id, measured_on)
      )`,
      // A long row of nullable columns would have to be altered for every new
      // tape measure. One row per measured thing charts directly and lets the
      // user add their own without a migration.
      `create table if not exists project100_body_measurements (
        id text primary key,
        user_id text not null references auth_users(id) on delete cascade,
        measured_on date not null,
        metric text not null check (metric ~ '^[a-z][a-z0-9_]{0,39}$'),
        label text check (label is null or char_length(btrim(label)) between 1 and 40),
        unit text not null check (unit in ('kg', 'cm')),
        value numeric(7, 2) not null check (value > 0 and value < 100000),
        unique (user_id, measured_on, metric),
        constraint project100_body_measurements_entry_fk
          foreign key (user_id, measured_on)
          references project100_body_entries(user_id, measured_on)
          on delete cascade
      )`,
      // The chart reads one metric across time; the day view reads one day.
      `create index if not exists project100_body_metric_idx
        on project100_body_measurements (user_id, metric, measured_on)`,
      `create index if not exists project100_body_entries_recent_idx
        on project100_body_entries (user_id, measured_on desc)`,
      // Carry the goal over from the ladder this workspace replaces.
      `insert into project100_settings (user_id, weight_goal_kg)
       select user_id, weight_goal_kg from solo_settings
       where weight_goal_kg is not null
       on conflict (user_id) do nothing`,
      // Every weight already logged is part of this journey. The daily note is
      // deliberately left behind: it was written about sleep and diet, and
      // moving it here would put words next to a body they were not about.
      `insert into project100_body_entries (user_id, measured_on)
       select user_id, day from solo_health_days
       where weight_kg is not null
       on conflict (user_id, measured_on) do nothing`,
      `insert into project100_body_measurements (id, user_id, measured_on, metric, unit, value)
       select md5(user_id || ':' || day::text || ':weight'), user_id, day, 'weight', 'kg', weight_kg
       from solo_health_days
       where weight_kg is not null
       on conflict (user_id, measured_on, metric) do nothing`,
    ],
  },
  {
    version: "018_project100_journal",
    name: "A private diary the assistant can be shut out of",
    statements: [
      // One entry per day, like the body log next to it. A day is the unit the
      // rest of Projekt 100 is read in, and a diary that agreed with the
      // calendar everywhere else would be easier to look back through.
      `create table if not exists project100_journal_entries (
        user_id text not null references auth_users(id) on delete cascade,
        written_on date not null,
        body text check (body is null or char_length(body) <= 20000),
        mood integer check (mood is null or (mood >= 1 and mood <= 5)),
        energy integer check (energy is null or (energy >= 1 and energy <= 5)),
        sleep_hours numeric(4, 2) check (
          sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 24)
        ),
        -- The one flag that keeps a thought out of the assistant's memory.
        -- It defaults to false so nothing is silently withheld, and the user
        -- decides per entry rather than per account.
        excluded_from_ai boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (user_id, written_on),
        check (
          body is not null or mood is not null or energy is not null
          or sleep_hours is not null
        )
      )`,
      `create index if not exists project100_journal_recent_idx
        on project100_journal_entries (user_id, written_on desc)`,
      // Searching your own years of writing should not read every row.
      `create index if not exists project100_journal_search_idx
        on project100_journal_entries
        using gin (to_tsvector('swedish', coalesce(body, '')))`,
      // The daily note from the old health log was diary writing all along; it
      // was left out of the body tables on purpose and belongs here instead,
      // together with the day's energy and sleep.
      `insert into project100_journal_entries
         (user_id, written_on, body, energy, sleep_hours)
       select user_id, day, nullif(btrim(note), ''), energy, sleep_hours
       from solo_health_days
       where nullif(btrim(note), '') is not null
          or energy is not null
          or sleep_hours is not null
       on conflict (user_id, written_on) do nothing`,
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
