# Oberoende verifiering av identitet, hushållsisolering och permissions

Skriven 2026-08-26 som en oberoende kontroll av Codex identitetsarbete.

**Listan är inte längre oberoende.** Codex tog slut mitt i arbetet och Nora bad
Claude ta över implementationen samma dag. Samma part skrev alltså både koden och
den här kontrollen. Det är sämre än en granskning av någon annan, och punkterna
nedan ska läsas med det i åtanke. Det som bevisas av tester och kommandon står
kvar; det som bara bevisas av att någon läst koden är svagare än det ser ut.

Status 2026-08-27: punkt 1–8 är körda mot en riktig lokal databas och en körande
server. Punkt 9 kräver en deploy och är fortfarande inte körd.

## 0. Utgångsläge som kontrollerna mäts mot

Fastställt genom läsning av trädet 2026-08-26:

- `src/server/database.ts:36` har `const ACTIVE_HOUSEHOLD_ID = "household-demo"` och
  konstanten används i ett femtiotal queries. Ingen läsning tar hushåll från en session.
- `src/server/telegram.ts:127` anropar `loadDashboard()` helt utan hushållsargument och
  skickar bara `account.personId` vidare till svarsmotorn.
- `src/proxy.ts` är Basic Auth-grinden. Den är staging-skydd, inte produktinloggning.
- Senaste migrationen är `006 Secure Telegram account linking` i `scripts/migrate.mjs`.
- Testbasen låg senast på 176/176 gröna.

## 1. Statisk kvalitet

```powershell
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

Godkänt: noll lintfel, noll typfel, alla tester gröna med fler tester än 176, och ett
rent Next 16-produktionsbygge. Ett bygge som varnar om `server-only`-moduler i
klientbundlen är inte godkänt.

## 2. Att hushållet faktiskt kommer från sessionen

```powershell
rg -n "ACTIVE_HOUSEHOLD_ID|household-demo" src scripts
```

Godkänt: konstanten är borta ur läs- och skrivvägarna. Om den finns kvar får den bara
förekomma i en tydligt avgränsad bootstrap eller seed, aldrig i en query som betjänar
en inloggad begäran. Varje kvarvarande träff ska kunna motiveras rad för rad.

Därefter, per API-route under `src/app/api/`: verifiera att hushålls-id härleds ur den
verifierade sessionen och inte ur något klienten skickar. Ett `householdId` som kommer
från request-body, query-parameter eller header är underkänt även om det råkar stämma.

## 3. Att permissions ligger före hämtning, inte efter

För `ask`, `documents`, `events`, `tasks`, `people` och `document-folders`: kontrollera
att behörighetsbeslutet fattas innan data lämnar databasen. En route som hämtar allt och
sedan filtrerar i minnet är underkänd — planen kräver permissions-before-retrieval.

Negativa tester som ska finnas och vara gröna:

- utloggad begäran mot varje route ger 401, inte 200 med tom data
- inloggad användare i hushåll A får 404 eller 403 på ett id i hushåll B, aldrig 200
- ett barn når inte det en vuxen når, med `personType` som grund

## 4. Att "Jag" betyder rätt person

Frågemotorn tolkade tidigare alltid "jag" som Nora. Godkänt: samma fråga ställd som
Mikael ger Mikaels schema. Det ska bevisas av ett test, inte av en manuell körning.

## 5. Migrations-idempotens

```powershell
pnpm db:migrate
pnpm db:migrate
```

Godkänt: första körningen listar den nya versionen, andra svarar exakt
`Databasen är redan migrerad.`

Särskild fälla: `scripts/migrate.mjs` checksummar varje migration. Om Codex redigerar en
redan applicerad version i stället för att lägga till `007` kastar körningen
`Migration ... har ändrats efter att den kördes.` mot en databas som redan har 001–006.
Kontrollera därför att identitetsarbetet ligger i nya versioner och att inget i 001–006
är rört. Kontrollera också att `personType` med värdena `adult` och `child` finns med i
den här migrationen, eftersom personer inte ska migreras två gånger.

## 6. Append-only audit

Godkänt: audit-tabellen saknar update- och delete-väg i applikationskoden, loggar vem,
vad, när och mot vilket hushåll, och skrivs i samma transaktion som ändringen den
beskriver. En audit-rad som kan gå förlorad när ändringen lyckas är underkänd.

## 7. Telegram är fortfarande read-only

```powershell
rg -n "insert into|update |delete from" src/server/telegram.ts src/app/api/telegram
```

Godkänt: de enda skrivningarna rör kontokoppling och dubblettskydd för updates, alltså
`telegram_link_requests`, `telegram_accounts` och `telegram_updates`. Ingen väg skapar
eller ändrar events, tasks eller dokument.

Kritisk punkt, inte kosmetisk: `processTelegramUpdate` anropar i dag `loadDashboard()`
utan hushåll. När hushållsisoleringen landar måste den läsa `account.householdId`,
annars svarar boten ur fel hushåll så fort ett andra hushåll finns. Kontrollera att
Telegram går genom samma policylager som webben och inte förbi det.

## 8. Hälsolinjen för V1

Beslutad 2026-08-26: kalendern får bära tid, plats och neutral planeringsinfo, men
aldrig diagnos, behandling eller annat hälsoinnehåll. Kontrollen ska bevisa regeln,
inte lita på avsikten.

- `health` finns kvar som eventkategori. Det är avsiktligt: en tandläkartid ska kunna
  planeras. Godkänt är att `title`, `summary`, `sourceExcerpt` och genererade svar bär
  tid och plats men inte diagnos, allergi, behandling eller remissinnehåll.
- `Tp`/Vab extraheras redan i `src/server/ai.ts`. Godkänt är att det stannar vid frånvaro
  och planering, utan uppgift om vad barnet hade.
- Dokument av vårdtyp ska nekas med ett uttryckligt "stöds inte än" och inte tyst
  inordnas bland vanliga dokument.
- Det ska finnas regressionstester med en skollapp eller kallelse som nämner diagnos
  eller allergi, och de ska bevisa att innehållet inte lagras. Utan test är detta bara
  en avsikt.

## 9. Fjärrverifiering

Först efter att 1–8 är gröna, och efter din deploy:

```powershell
$env:BASE_URL = 'https://www.zickaris.se'
$env:VARDAGSRO_GATE_USERNAME = 'vardagsro'
$env:VARDAGSRO_GATE_PASSWORD = [string](Get-Clipboard)
$env:VARDAGSRO_TEST_EMAIL = '<testkontots e-post>'
$env:VARDAGSRO_TEST_PASSWORD = [string](Get-Clipboard)
$env:RAILWAY_DEPLOYMENT_ID = '<aktuell deployment-id>'
try {
  pnpm release:smoke
  pnpm release:e2e
} finally {
  Remove-Item Env:BASE_URL,Env:VARDAGSRO_GATE_USERNAME,
    Env:VARDAGSRO_GATE_PASSWORD,Env:VARDAGSRO_TEST_EMAIL,
    Env:VARDAGSRO_TEST_PASSWORD,Env:RAILWAY_DEPLOYMENT_ID `
    -ErrorAction SilentlyContinue
}
```

Godkänt: smoke 6/6 och full E2E 27/27 eller fler, cleanup körd, och produktionen
tillbaka på samma antal events och dokument som före körningen.

Scriptet loggar numera in på riktigt. Det kräver `VARDAGSRO_TEST_EMAIL` och
`VARDAGSRO_TEST_PASSWORD` utöver grindens uppgifter, skickar `Origin` på alla
anrop eftersom servern nekar skrivningar från annan webbplats, och har fått två
nya kontroller före inloggningen:

- `product_requires_login`: `/` omdirigerar till `/login` och `/api/documents`
  svarar 401 när bara Basic Auth finns, alltså utan produktsession
- `product_login`: inloggningen lyckas och sätter en `vardagsro.`-sessionscookie

Smoke är därmed 8 kontroller i stället för 6, och full E2E 29 i stället för 27.
Godkänt betyder de nya siffrorna. En körning som fortfarande ger 6/6 har inte
kört den nya koden.

## 10. Efter godkänd körning

Uppdatera `CLAUDE_HANDOFF.md` med deployment-id, artifact-filer och vilka punkter i
"Saker som ännu inte får beskrivas som klara" som faktiskt får strykas. Punkter stryks
bara mot bevis i den här listan, aldrig mot en beskrivning av vad som byggts.


## Status efter övertagandet

### Kört mot en riktig databas och en körande server 2026-08-27

Lokal Postgres från `compose.yaml`, med `FAMILY_DATABASE_URL` satt explicit så att
`.env.local`-fallbacken aldrig kunde träffa produktionsdatabasen.

- **Migrationer.** Den lokala databasen stod på 005. `pnpm db:migrate` körde 006–009.
  Andra körningen svarade `Databasen är redan migrerad.` Backfillen av `person_type`
  gav 2 vuxna och 5 barn, vilket stämmer med hushållet.
- **Append-only bevisat i databasen.** `update` och `delete` mot `family_audit_log`
  avvisas båda med `family_audit_log is append-only`. Testraden går inte att ta
  bort igen, vilket är hela poängen; den ligger kvar i den lokala databasen.
- **Inloggning.** Två konton skapades med `bootstrap-account.mjs`. Försöket att ge
  ett barn ett konto stoppades och krävde `--allow-child`.
- **Grinden håller.** Utan produktsession: `/` ger 307 till `/login`,
  `/api/documents` ger 401 `NOT_AUTHENTICATED`. Med session: 200.
- **"Jag" är rätt person.** Samma anrop gav Noras person-id i Noras session och
  Mikaels i Mikaels. Det var buggen; den är borta.
- **Roller.** `PATCH /api/household` gav 403 `OWNER_REQUIRED` för adult och 200
  för owner.
- **Cross-site.** Samma anrop med främmande `Origin` gav 403.
- **Audit.** Skapa och ta bort en händelse gav två rader med rätt aktör och
  strukturerad metadata. Hushållet slutade på samma antal händelser som före.

### Två fel som bara den här körningen kunde hitta

1. **Ingen inloggning fungerade.** `generateId: "uuid"` betyder att Better Auth
   överlåter id till databasen och förväntar sig `gen_random_uuid()` som default.
   Migration 007 skapade auth-tabellernas id-kolumner utan default, så varje
   inloggning föll på en not-null-överträdelse. Rättat i migration 009.
2. **Audit-metadata var osökbar.** `JSON.stringify(...)::jsonb` lagrade en
   jsonb-*sträng*, så `metadata->>'fields'` gav null. Rättat; nya rader är
   `object`. Den första raden ligger kvar som `string` eftersom loggen inte kan
   ändras i efterhand.

Samma dubbelkodning finns kvar för `aliases` i `family_people`. Den är ofarlig
eftersom `aliases()` kompenserar vid läsning, men den är samma fel och bör rättas
när någon ändå rör den koden.

### Fortfarande inte kört

**Punkt 9, fjärrverifiering.** Kräver en deploy. Release-scriptet kan numera logga
in, men har inte körts mot någon miljö.
