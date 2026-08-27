import { randomUUID } from "node:crypto";

import postgres from "postgres";

import { hashPasswordForAuth } from "./auth-password.mjs";

import { requiredDatabaseUrl } from "./database-env.mjs";

/**
 * Creates the first product logins. Sign-up is disabled in the application on
 * purpose, so accounts are made here, deliberately, by someone with database
 * access. The password is read from the environment rather than argv so it does
 * not end up in shell history or process listings.
 *
 *   VARDAGSRO_BOOTSTRAP_PASSWORD=... node scripts/bootstrap-account.mjs \
 *     --email mikael@example.se --name Mikael --person "Mikael" --role owner
 *
 *   node scripts/bootstrap-account.mjs --list
 */

const ROLES = new Set(["owner", "adult", "viewer"]);
const MIN_PASSWORD_LENGTH = 12;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const sql = postgres(requiredDatabaseUrl(), {
  max: 1,
  connect_timeout: 10,
  prepare: false,
  onnotice: () => undefined,
});

try {
  const households = await sql`select id, name from family_households order by created_at asc`;

  if (args.list) {
    for (const household of households) {
      console.log(`${household.id}  ${household.name}`);
      const people = await sql`
        select p.id, p.name, p.role, p.person_type, m.role as membership_role, u.email
        from family_people p
        left join family_memberships m on m.person_id = p.id and m.household_id = p.household_id
        left join auth_users u on u.id = m.user_id
        where p.household_id = ${household.id}
        order by p.created_at asc
      `;
      for (const person of people) {
        const account = person.email ? `${person.email} (${person.membership_role})` : "inget konto";
        console.log(`    ${person.id}  ${person.name} – ${person.role} [${person.person_type}] – ${account}`);
      }
    }
    process.exit(0);
  }

  const email = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
  if (!email.includes("@")) fail("Ange --email.");

  const password = process.env.VARDAGSRO_BOOTSTRAP_PASSWORD ?? "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`Sätt VARDAGSRO_BOOTSTRAP_PASSWORD till minst ${MIN_PASSWORD_LENGTH} tecken.`);
  }

  const role = typeof args.role === "string" ? args.role : "adult";
  if (!ROLES.has(role)) fail(`--role måste vara owner, adult eller viewer.`);

  let household;
  if (typeof args.household === "string") {
    household = households.find((candidate) => candidate.id === args.household);
    if (!household) fail("Hushållet finns inte. Kör --list.");
  } else if (households.length === 1) {
    household = households[0];
  } else {
    fail("Flera hushåll finns. Ange --household. Kör --list för att se dem.");
  }

  const needle = typeof args.person === "string" ? args.person.trim() : "";
  if (!needle) fail("Ange --person med personens id eller namn.");

  const people = await sql`
    select id, name, person_type from family_people
    where household_id = ${household.id} and (id = ${needle} or lower(name) = lower(${needle}))
  `;
  if (people.length === 0) fail("Familjemedlemmen finns inte i hushållet. Kör --list.");
  if (people.length > 1) fail("Flera personer matchar namnet. Ange id i stället.");
  const person = people[0];

  if (person.person_type !== "adult" && !args["allow-child"]) {
    fail(
      `${person.name} är registrerad som barn. Ett eget konto till ett barn är ett medvetet beslut: ` +
        "kör om med --allow-child om det är avsikten.",
    );
  }

  const name = typeof args.name === "string" ? args.name : person.name;
  const hashed = await hashPasswordForAuth(password);

  const summary = await sql.begin(async (tx) => {
    const existing = await tx`select id from auth_users where lower(email) = ${email} limit 1`;
    const userId = existing[0]?.id ?? randomUUID();
    let created = false;

    if (existing[0]) {
      await tx`
        update auth_users set name = ${name}, updated_at = now() where id = ${userId}
      `;
    } else {
      created = true;
      await tx`
        insert into auth_users (id, name, email, email_verified, created_at, updated_at, role)
        values (${userId}, ${name}, ${email}, true, now(), now(), 'user')
      `;
    }

    // Better Auth looks the credential account up by issuer, provider and
    // account id, so all three have to match what sign-in expects.
    const account = await tx`
      select id from auth_accounts
      where user_id = ${userId} and provider_id = 'credential' and issuer = 'local:credential'
      limit 1
    `;
    if (account[0]) {
      await tx`
        update auth_accounts set password = ${hashed}, updated_at = now()
        where id = ${account[0].id}
      `;
    } else {
      await tx`
        insert into auth_accounts
          (id, issuer, account_id, provider_id, user_id, password, created_at, updated_at)
        values
          (${randomUUID()}, 'local:credential', ${userId}, 'credential', ${userId},
           ${hashed}, now(), now())
      `;
    }

    const membership = await tx`
      select id, person_id from family_memberships
      where household_id = ${household.id} and user_id = ${userId}
      limit 1
    `;
    if (membership[0]) {
      await tx`
        update family_memberships
        set person_id = ${person.id}, role = ${role}, updated_at = now()
        where id = ${membership[0].id}
      `;
    } else {
      await tx`
        insert into family_memberships (id, household_id, user_id, person_id, role)
        values (${randomUUID()}, ${household.id}, ${userId}, ${person.id}, ${role})
      `;
    }

    await tx`
      insert into family_audit_log
        (household_id, actor_kind, actor_id, action, target_type, target_id, metadata)
      values (
        ${household.id}, 'system', ${userId},
        ${membership[0] ? "membership.update" : "membership.create"},
        'membership', ${person.id},
        ${JSON.stringify({ role, createdUser: created })}::jsonb
      )
    `;

    return { userId, created };
  });

  console.log(
    `${summary.created ? "Skapade" : "Uppdaterade"} konto ${email} som ${person.name} ` +
      `(${role}) i ${household.name}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? `Misslyckades: ${error.message}` : "Misslyckades.");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
