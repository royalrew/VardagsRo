# Vardagsro / Family OS — handoff till Claude Code

Senast uppdaterad: 2026-08-25 (Europe/Stockholm).

Det här är en levande överlämning. Börja med att läsa hela filen, därefter
`AGENTS.md`, `koncept.tct`, `README.md` och relevanta källfiler. Kontrollera alltid
det faktiska filläget och Railway-statusen innan du antar att ett pågående steg är
klart.

## Produktmål och viktigaste princip

Vardagsro är familjens privata AI-minne. Familjen laddar upp exempelvis skollappar,
scheman, screenshots och PDF:er. AI:n tolkar dem, en människa granskar resultatet,
och först därefter blir uppgifterna betrodd familjedata som kan visas i kalendern
och användas i källgrundade svar.

Den viktigaste regeln är:

> AI tolkar och föreslår. Familjen bestämmer.

Modellen får aldrig ha en direkt skrivväg till familjedatan. Alla framtida
ändringar från AI eller Telegram ska vara typade förslag som går genom identitet,
permissions, förhandsgranskning, explicit bekräftelse, idempotens, audit och Ångra.

`koncept.tct` är produktplanens källa. Leveransprincipen är production-first: en
funktion räknas inte som klar förrän den har driftsatts på Railway och verifierats
via den riktiga domänen med ett fjärr-E2E-test.

## Nuvarande produktbas

Följande vertikala kärnflöde finns och har verifierats:

1. JPG, PNG, WebP eller PDF laddas upp.
2. Filtyp, signatur och storlek valideras.
3. OpenAI extraherar dokumentmetadata, kalenderhändelser och tasks med strikt schema.
4. Användaren granskar och kan ändra eller ta bort AI-förslag; inget original har
   ännu lagrats i R2.
5. Vid explicit godkännande skickas originalfilen igen. Servern verifierar
   filsignatur, MIME, säkert filnamn och SHA-256 mot extraktionen.
6. Först därefter lagras originalet privat i Cloudflare R2 och dokument, events
   och tasks sparas atomiskt i PostgreSQL.
7. Kalendern och familjevyn läser serverdata.
8. Frågevyn svarar deterministiskt på smala kalenderfrågor och visar källor.
9. Signerade, kortlivade R2-URL:er används för originalkällor.

Produktionsmiljön är fail-closed: den får inte falla tillbaka till demo-data eller
`localStorage` om PostgreSQL eller R2 är trasigt.

## Säkerhets- och releasehärdning som är klar

- Next.js 16-proxy med Basic Auth framför UI, statiska resurser och alla API:er.
- Endast exakt `/api/ready` är publik för Railway health checks.
- Saknade gate-secrets i production ger `503` (fail-closed).
- Fel/saknad Basic Auth ger `401`, `WWW-Authenticate`, `no-store` och `noindex`.
- Primära secrets är `VARDAGSRO_GATE_USERNAME` och
  `VARDAGSRO_GATE_PASSWORD`.
- Staging använder ett unikt gate-lösenord, inte adminlösenordet.
- Separat, idempotent databasmigrering körs före deploy.
- Bootstrap-seed är redan genomförd. Återkommande staging-seed är avstängd.
- `/api/health` är skyddad och detaljerad; `/api/ready` är publik och minimal.
- Dockerimagen kör som icke-root och innehåller runtime-migreringarna.
- Secrets och `.env`-filer exkluderas från build context och Git-mönster.

Basic Auth är bara en privat staginggrind. Den ersätter inte framtida riktig
inloggning, hushållsisolering eller permissions.

## Railway-status vid överlämningen

- Projekt: `vardagsro-staging`
- Project ID: `36aba3c1-44a9-49fc-9561-768bc2fc3b96`
- Environment ID: `49f97884-8fca-41d0-a42a-986ce82fa797`
- Web service: `vardagsro-web`
- Service ID: `6f719150-0bc3-4ac9-ac76-2078f759a4f1`
- PostgreSQL service ID: `02c90646-41c1-4db0-9a5c-f52aec3df909`
- Senast verifierade deploy: `f408ac5d-a5f2-4b0f-9e6d-79dee969bdd8`
- Deploystatus för den releasen: `SUCCESS`
- Port: `3000`
- Railway CLI är inloggad och katalogen är länkad till projektet.

Hemligheter finns i Railway och lokalt i `.env.local`. Skriv aldrig ut dem i
terminaloutput, loggar, artifacts eller den här filen. Staging-användarnamnet är
`vardagsro`; lösenordet finns som Railway-variable. Vid senaste uppdateringen låg
det även i Windows urklipp, men anta inte att det fortfarande gör det.

### Tillfällig Railway-domän är borttagen

En tillfällig Railway-domän användes medan den egna domänens certifikat väntade
på DNS-cache:

- URL: `https://vardagsro-web-production.up.railway.app`
- Service-domain ID: `53cf25cc-75ac-4000-9766-7713cf36ba7d`

Den togs bort via Railways `serviceDomainDelete` efter grönt full-E2E på
`https://www.zickaris.se`. Railway-status visar nu `serviceDomains: 0` och endast
custom-domänen `www.zickaris.se`. Skapa inte en ny standarddomän utan ett konkret
testbehov.

## Egen domän och DNS

- Produktdomän: `https://www.zickaris.se`
- `https://zickaris.se` vidarebefordrar till `https://www.zickaris.se` hos Loopia.
- DNS ligger hos Loopia. Cloudflare används här för R2, inte som DNS-provider.
- Custom-domain ID hos Railway:
  `146d87fc-9975-415a-9f52-60ef73eaedcb`
- Auktoritativ CNAME på både `ns1.loopia.se` och `ns2.loopia.se` pekar på
  `urphaunl.up.railway.app`.
- Auktoritativ `_railway-verify.www` TXT matchar Railways aktuella
  verification-token. Tokenvärdet ska inte kopieras till den här filen.
- Loopia-zonen uppdaterades cirka 18:55 svensk tid och har TTL 3600 sekunder.
- Klockan cirka 19:54 slog Railway-status om till
  `CERTIFICATE_STATUS_TYPE_VALID` och normal TLS-validering började fungera.
- `https://www.zickaris.se/api/ready` har verifierats ge `200` och `ready`.
- `https://zickaris.se/` har verifierats ge `301` till
  `https://www.zickaris.se/` med normal TLS-validering.
- Anonym startsida har verifierats ge `401` med Basic Auth-utmaning.
- Autentiserad `/api/health` har verifierats ge `200`, med databas, OpenAI och R2
  friska.
- Cache-purge för CNAME och TXT begärdes hos Cloudflare 1.1.1.1. Google kräver
  reCAPTCHA för manuell flush, så dess gamla svar måste normalt löpa ut via TTL.

Acceptera inte `curl -k` eller avstängd TLS-validering som releasebevis. Det
nuvarande certifikatet fungerar med normal klientvalidering.

## Fjärrtest som är grönt på den riktiga domänen

På `https://www.zickaris.se` är följande verifierat mot deploy
`f169c382-7a59-4f1a-a50d-b964b2c8d9ee`, databasen, OpenAI och R2:

- publik readiness ger `200` och `{ "status": "ready" }`
- anonym startsida ger `401`
- anonym `/api/health` ger `401`
- autentiserad UI ger `200`
- databas, OpenAI-konfiguration och R2 är friska
- dashboarden använder `dataMode: "database"`
- syntetisk PDF laddas upp och AI-extraheras
- manuell kalenderpost skapas, flyttas via strikt PATCH och syns uppdaterad i dashboarden
- dokumentet bekräftas och sparas
- kalender- och taskfrågor besvaras med verifierad källa
- task completion gör att den inte längre används som aktuellt svarsunderlag
- signerad originalkälla kan öppnas
- dokumentbundet event kan bli manuell override utan falsk dokumentkälla
- alla testevents, tasks, dokument och R2-objekt städas bort

Senaste gröna artifacts för den aktuella releasen:

- `artifacts/releases/railway-smoke-2026-08-21T18-39-41-212Z.json`
- `artifacts/releases/railway-e2e-2026-08-21T18-40-06-749Z.json`

Artifacts är sanitiserade och Git-ignorerade. `scripts/remote-release-test.mjs`
fick en lokal fix så att root-URL inte råkar bygga `//api/ready` och få HTTP 308.
Efter den fixen passerade lint, TypeScript och 40/40 tester.

## Levererat i staging: Tasks, deadlines och “ta med”

V1-slicen är implementerad och verifierad på Railway/domänen. Den lokala slutliga
releasegrinden för den kombinerade task- och kalenderslicen var lint, strikt
TypeScript, 101/101 tester, Next-produktionsbygge och Docker-smoke.

Låst typkontrakt:

```ts
type TaskKind =
  | "homework"
  | "exam"
  | "bring"
  | "form"
  | "preparation"
  | "other";

interface FamilyTask {
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
```

`DashboardData` ska få `tasks`. `DocumentExtraction` och
`ConfirmDocumentInput` ska få extraherade tasks. `FamilyDocument` ska få
`tasksCount`. Dokumentbekräftelse ska spara dokument, events och tasks atomiskt.

Låst API-kontrakt:

- `GET /api/tasks` → `{ tasks }`
- `POST /api/tasks` med
  `{ personId, title, kind, dueAt: string|null, notes: string|null }`
  → HTTP 201 `{ task }`
- `PATCH /api/tasks/:id` med exakt `{ completed: boolean }`
  → HTTP 200 `{ task }`
- `DELETE /api/tasks/:id` → `{ deleted: true, id }`
- `POST /api/documents` använder i production `multipart/form-data` med fälten
  `input` (JSON för `ConfirmDocumentInput`) och `file` (exakt originalfil), och
  svarar `{ document, events, tasks }`. Ingen post-commit dashboard-read görs.
- `/api/extract` tolkar filen men svarar alltid med `storageKey: null`; R2-skrivning
  sker först vid godkännande.

Krav för slicen:

- ny idempotent migration 002 för tasks
- OpenAI extraherar homework/exam/bring/form/preparation/other utan att hitta på
  deadlines
- granskaren kan ändra eller ta bort hittade tasks före godkännande
- hemvyn visar öppna tasks med person, deadline och källa
- klart/öppen ändras via API och får inte ge falsk optimistic success
- frågor ska klara bland annat:
  - “Vad ska Ida ha med sig imorgon?”
  - “Vilka läxor har Kalle nästa vecka?”
  - “När ska blanketten lämnas?”
- completed och `needs_review` får inte användas som aktuellt svarsunderlag
- svar ska visa dokumentkälla eller tydligt säga att underlag saknas

Remote-E2E är lokalt utökat för task-extraktion, multipart-godkännande, listning,
källgrundad fråga, completion och cleanup. Det gör aldrig om ett osäkert confirm-
anrop; i stället inventerar det alla dokument med det unika testfilnamnet och
poller under en begränsad grace-period om servern kan avsluta efter klient-timeout.

Svarskällor har nu ett semantiskt kontrakt: `kind: "event" | "task"`, nullable
`eventId` och `taskId`, samt separata `matchedEventIds` och `matchedTaskIds`.
Frågan “Vad har vi kvar att göra i veckan?” avgränsas till aktuell svensk
kalendervecka och kan inte dra in nästa veckas tasks.

Dokumentradering kör lagringsradering före databasradering. Ett R2-fel lämnar
databasen orörd och returnerar fel; ett senare DB-fel efter lyckad R2-radering
returneras explicit och får inte visas som lyckad UI-radering. Tombstone/outbox
är fortfarande den robustare framtida lösningen för automatisk återhämtning.

## Levererat i staging: kalenderdrag och eventmodal

Användaren bad 20:20 om drag-and-drop i kalendern och en bättre modal. Kravet är
inskrivet i Version 1 i `koncept.tct` och implementerat lokalt: skapa/redigera med
person, titel, datum, start/slut, heldag, kategori, plats och anteckning;
desktop-drag öppnar samma modal med föreslagen ny dag/tid och sparar först efter
explicit bekräftelse. Mobil och tangentbord har Redigera som fullvärdigt
alternativ. Nattpass som 22:00–01:00 stöds och lika start/slut nekas.

`PATCH /api/events/:id` tar en strikt komplett body
`{personId,title,category,startsAt,endsAt,allDay,location,notes}` och svarar
`{event}`. Uppdateringen är hushållsfiltrerad. Om eventet kom från ett dokument
detachas det avsiktligt till en manuell override (`documentId:null`,
`sourceExcerpt:null`, `confidence:1`) så originaldokumentet aldrig citeras som stöd
för familjens nya tid. UI visar en tydlig varning före Spara.

`FamilyEvent.notes` och idempotent migration `003_event_notes` är klara och körda
av Railway predeploy. Flerdagars heldag och nattpass bevaras; PATCH kräver exakt
alla åtta fält. Remote-E2E verifierade create → PATCH/flytt →
dashboard-verifiering → provenance-detach → DELETE och cleanup via unik titel på
den riktiga domänen.

## Levererat i staging: tidszonssäker kalendergeometri

Den föregående sessionen tog slut mitt i en av de två blockerande
korrigeringarna före deploy. Läget vid övertagandet var:

- Mappflytt-korrigeringen var **klar**. `updateDocumentFolder`,
  `updateDocumentOrganization` och `removeDocumentFolder` tar
  `pg_advisory_xact_lock` som första sats i en transaktion, så två samtidiga
  flyttar inte kan skapa en cykel. Testerna verifierar både att låset tas först
  och att en ren titeländring inte tar låset alls.
- Tidszonskorrigeringen var **påbörjad men inte inkopplad**. `src/lib/dates.ts`
  hade fått en komplett verktygslåda (`calendarDateInTimeZone`,
  `startOfCalendarWeek`, `zonedDateTimeToInstant`, `addCalendarDateDays`,
  `isoWeekNumberForCalendarDate`) som ingenting anropade. Kalendern räknade
  fortfarande med runtimens lokala `Date`-metoder.

Det gav en verklig bugg: `next dev`/`next start` renderar `CalendarView` på
servern. På Railway är containern UTC, i webbläsaren Europe/Stockholm. Mellan
00:00 och 02:00 svensk tid var det olika kalenderdygn i de två miljöerna, vilket
gav fel dag, fel veckonummer, fel nu-linje och hydration mismatch.

### Vad som är gjort

Kalendergeometrin är nu tidszonsexplicit. Dagidentitet är en kalenderdatumsträng
`"YYYY-MM-DD"` i hushållets tidszon i stället för ett `Date` i runtimens zon.

- `eventOccursOnLocalDay` → `eventOccursOnCalendarDay(event, calendarDate, timeZone)`
- `timedEventSegmentForLocalDay` → `timedEventSegmentForCalendarDay(event, calendarDate, timeZone)`
- `suggestEventMove(event, targetDate: string, targetMinute?, timeZone)`
- `eventFormDateTimeValues(startsAt, endsAt, timeZone)`
- `eventIntervalFromForm(date, startTime, endTime, allDay, allDayEndDate?, timeZone)`
- `isoWeekNumber` togs bort; `isoWeekNumberForCalendarDate` i `dates.ts` används.
- `LocalDayEventSegment` heter nu `CalendarDayEventSegment`.

Dygnsgränser är riktiga instants via `zonedDateTimeToInstant`, så ett DST-dygn är
korrekt 23 eller 25 timmar. Minuter inom dygnet är väggklocksminuter, vilket är
det som matchar den renderade timaxeln. `CalendarView` håller `weekStart` som
kalenderdatum, och `formatMonthYear` togs bort eftersom den blev oanvänd.

Nya hjälpare i `dates.ts`: `minuteOfDayInTimeZone`, `clockValueInTimeZone` och
`minuteOfDayFromClockValue`. `zonedDateTimeParts`, `calendarDateInTimeZone`,
`minuteOfDayInTimeZone` och `clockValueInTimeZone` tar även epoch-nummer.

`ManualEventModal` behövde ingen ändring; `timeZone` är sista valfria parametern
och defaultar till `DEFAULT_TIME_ZONE`.

### Bevis

`src/lib/dates.test.ts` är ny med 7 tester: 23-timmarsdygnet 2026-03-29,
25-timmarsdygnet 2026-10-25, en obefintlig tid som skjuts framåt över
vårgapet, en tvetydig höst-tid som väljer det tidigare instantet, samt
avvisning av ogiltiga datum och klockslag.

`src/components/calendar-contracts.test.ts` är omskriven. Varje instant skrivs
som UTC, så inget test beror på maskinens tidszon. Tillagt: att ett släpp läser
tidszonen från argumentet och inte från runtime, att 23:30 UTC hamnar på rätt
svensk dag, att ett nattpass över DST får sin verkliga längd (22:00–04:00 är fem
timmar på våren och sju på hösten) och att ett draget pass behåller väggklockan
över ett DST-skifte.

Lokal grind: `pnpm lint`, `pnpm exec tsc --noEmit`, 132/132 tester och
`pnpm build` är gröna. Sviten kördes dessutom med `TZ=UTC` (Railway-likt) och med
`TZ=America/Los_Angeles` och gav identiskt resultat — det är själva beviset för
att buggen är borta.

Visuell kontroll i Chromium mot dev-servern bekräftade veckovyn (vecka 34, rätt
dagnummer 17–23, fredag 21 markerad som idag, timaxel, nu-linje), dokumentträdet
med trepunktsmenyer och introduktionen med familjenamn från databasen.

Obs för framtida visuella kontroller: använd `http://localhost:<port>`, inte
`http://127.0.0.1:<port>`. Next 16 blockerar dev-resurser cross-origin, sidan
hydrerar då aldrig och hela appen ser stum ut utan att något fel loggas.

### Deployat och verifierat

Slicen är driftsatt och verifierad enligt production-first-principen.

- Deployment: `47d7d78a-6e6d-4835-8a0f-61b13e40b1f6`
- Bygget lyckades och healthchecken mot `/api/ready` gick igenom på första försöket.
- `pnpm release:smoke`: 6/6 gröna.
- `pnpm release:e2e`: 27/27 gröna, inklusive all städning.
- Artifacts: `artifacts/releases/railway-smoke-2026-08-21T19-53-46-716Z.json` och
  `artifacts/releases/railway-e2e-2026-08-21T19-54-09-383Z.json`

Utöver API-testerna kontrollerades den deployade kalendern visuellt i Chromium mot
`https://www.zickaris.se`: vecka 34, dagnummer 17-23, fredag 21 markerad som idag,
timaxel 06-22, nu-linjen synlig och sex tidsatta pass. Konsolen var helt tom, det
vill säga ingen hydration mismatch mellan server och klient.

Railway-CLI:t var inte längre länkat till katalogen vid den här sessionen.
Länka om med projekt-, environment- och service-ID:na ovan innan `railway up`.
`railway up --ci` kan tappa loggströmmen ("Failed to retrieve build log") utan att
bygget påverkas; följ upp med `railway logs --build` i stället.

### Om TZ-variabeln på Railway

`TZ=Europe/Stockholm` är satt som service-variable. Den dämpade den ursprungliga
server/klient-divergensen för svenska användare, men den löser inte problemet.
En familjemedlem vars webbläsare står i en annan tidszon fick fortfarande fel
rutnät efter hydrering, eftersom den gamla koden läste dygnsgränserna från
respektive runtime. Nu är hushållets tidszon auktoritativ i koden och `TZ` är bara
ett extra skyddsnät som ingen korrekthet vilar på. Ta ändå inte bort variabeln
utan skäl.

## Levererat i staging: familjemedlemmar och hushållsnamn

Byggt och driftsatt 2026-08-25.

Produktfokus flyttades den 25 augusti: Vardagsro byggs nu klart för ägarens egen
familj, inte för att säljas till andra hushåll. Inloggning, hushållsisolering och
permissions är därmed nedprioriterade. Det som styr istället är att appen ska gå
att använda på riktigt i vardagen.

Det första hindret var att appen körde seedad demodata. Familjen gick inte att
ändra i produkten.

### API-kontrakt

- `GET /api/people` → `{ people }`
- `POST /api/people` med `{ name, role, aliases }` → HTTP 201 `{ person }`
- `PATCH /api/people/:id` med minst ett av `{ name, role, aliases }` → `{ person }`
- `DELETE /api/people/:id` → `{ deleted: true, id }`
- `PATCH /api/household` med `{ name }` → `{ familyName }`

Allt är hushållsfiltrerat mot `ACTIVE_HOUSEHOLD_ID`.

### Radering är avsiktligt spärrad

`family_events.person_id` och `family_tasks.person_id` ligger med
`on delete cascade`. En oförsiktig radering av en familjemedlem hade alltså tagit
med sig hela hens kalender och alla uppgifter, tyst.

Servern nekar därför radering så länge personen har kalenderposter, uppgifter
eller dokument, och svarar `409 PERSON_NOT_EMPTY` med en text som räknar upp vad
som ligger kvar. Samma princip som för mappar med innehåll. Verifierat mot
körande app: försök att radera Nora gav 409 med "3 kalenderposter, 2 uppgifter,
2 dokument" och hon fanns kvar efteråt.

Ändra inte de här cascade-reglerna till att bli tystare. Spärren i
`removePerson` är det enda som står mellan ett felklick och en raderad kalender.

### Detaljer värda att minnas

- Rollen `Jag` avgör vem appen hälsar på. `loadDashboard` väljer
  `currentPersonId` genom att leta efter rollen "jag" skiftlägesokänsligt, annars
  första personen. Roll är fritext, inte enum.
- Aliasen matas in kommaseparerat och normaliseras i schemat: trimmade, tomma
  bortplockade och dubbletter borttagna skiftlägesokänsligt. De används av
  frågemotorn för att matcha namn i dokument.
- Initialer härleds från förnamnet vid både skapande och namnändring. Färg och
  tint tilldelas från `PERSON_PALETTE` efter antalet befintliga personer och
  ändras aldrig vid uppdatering.
- Familjen kan bara ändras när `dataMode` är `database`. I demoläge visas ett
  meddelande i stället; familjemedlemskap ska inte kunna fejkas lokalt.

### Tidszonstråden är knuten

`CalendarView` använde fortfarande konstanten `DEFAULT_TIME_ZONE` trots att
geometrin tar tidszon som parameter och `family_households.timezone` redan går
hela vägen ut i `DashboardData.timezone`. Vyn läser nu hushållets tidszon via
`resolveCalendarTimeZone(data.timezone || DEFAULT_TIME_ZONE)`. En familjemedlem
vars webbläsare står i en annan zon ser därmed familjens dygn, inte sitt eget.

### Grind

Lint, strikt TypeScript, 145/145 tester och Next-produktionsbygge är gröna. Nya
tester: `src/server/database.people.test.ts` (8) och
`src/server/schemas.people.test.ts` (5). Familjevyn kontrollerades visuellt i
Chromium, och skapa/ändra/radera kördes mot körande app med databas.

### Demofamiljen är borttagen

Genomfört 2026-08-25. Hushållet innehåller nu enbart den riktiga familjen, som
lades in via familjevyn. Inga personuppgifter finns i källkoden, och namnen står
medvetet inte i den här filen.

Raderingen gjordes via de befintliga API-vägarna, inte med rå SQL, så de riktiga
kodvägarna kördes:

1. Demodokumenten togs bort via `DELETE /api/documents/:id`. Alla tre hade
   `storage_key = NULL`, så seeden hade aldrig skrivit något till R2 och det fanns
   inga objekt att städa. `document_id` cascadar till events och tasks, så det
   steget tog med sig fyra kalenderposter och båda uppgifterna.
2. De tre kvarvarande manuella kalenderposterna togs bort via
   `DELETE /api/events/:id`.
3. De fyra demopersonerna togs bort via `DELETE /api/people/:id`, som nu
   passerade eftersom de var tomma.

Slutläge: 7 personer, 0 dokument, 0 events, 0 tasks, 4 mappar kvar som struktur.
Startsidan renderar korrekt tomma tillstånd i stället för trasiga vyer.

Demofamiljen kan inte återuppstå av misstag. Railways `preDeployCommand` är enbart
`node scripts/migrate.mjs`; `predeploy-staging.mjs` körs inte vid deploy. Seeden
kräver dessutom både `VARDAGSRO_ENV=staging` och `ALLOW_STAGING_DEMO_SEED=true`,
och den senare står på `false` i Railway.

### Deployat och verifierat

- Deployment: `f408ac5d-a5f2-4b0f-9e6d-79dee969bdd8`
- Ny kod svarade på `/api/people` efter cirka 75 sekunder.
- `pnpm release:smoke`: 6/6. `pnpm release:e2e`: 27/27, inklusive städning.
- Artifacts: `artifacts/releases/railway-smoke-2026-08-25T17-40-55-524Z.json` och
  `artifacts/releases/railway-e2e-2026-08-25T17-41-18-360Z.json`
- Startsidan kontrollerades i Chromium mot den riktiga domänen. Konsolen var tom.

`railway up --ci` tappade loggströmmen igen med "Failed to retrieve build log".
Det påverkar inte bygget. Polla i stället en endpoint som bara finns i den nya
koden tills den svarar; det är ett tydligare livstecken än loggen.

### Produktionsdatabasen är uppsatt med den riktiga familjen

En deploy flyttar kod, inte data. Produktionen hade fortfarande demofamiljen efter
driftsättningen och sattes upp separat, via samma API-vägar som lokalt och i samma
ordning: riktig familj in först, demodata ut sedan.

Slutläge i produktion: 7 personer, 0 dokument, 0 uppgifter, hushållet omdöpt.
Demopersonerna och deras tre dokument, sju kalenderposter och två uppgifter är
borta. Dokumentraderingen gick via `DELETE /api/documents/:id`, som tar
R2-objektet före databasraden.

De seedade posterna har deterministiska id:n som är identiska i båda miljöerna
(`document-jobb`, `event-dentist` och så vidare). Det gjorde produktionsrensningen
möjlig utan direkt databasåtkomst, eftersom det inte finns någon `GET /api/events`.

### Personuppgifter hör hemma i databasen

Familjens uppgifter läggs in via familjevyn och ska aldrig seedas i källkoden.
`Familjen.txt` i projektroten innehåller ägarens egna anteckningar om familjen och
låg utan skydd i build context; den är nu utesluten i `.railwayignore`,
`.dockerignore` och `.gitignore`, tillsammans med katalogen `/private/` som är
avsedd för framtida anteckningar av samma sort.

Anteckningarna innehåller känsliga uppgifter om barnen som medvetet inte har lagts
in i datamodellen. Uppfinn ingen plats för dem. Det är produktkontext, inte data
appen ska lagra.

### Namnmatchning i en familj med blandade efternamn

Alla i hushållet har inte samma efternamn, och två syskon delar ett. Fullständiga
namn ligger därför som alias per person, eftersom skolan skriver hela namnet i sina
dokument.

`resolvePeople` i frågemotorn matchar alias längst-först och behandlar
`person.name` och `person.role` som söktermer automatiskt. Rena dubbletter av
förnamnet som alias fyller alltså ingen funktion. Ett ensamt delat efternamn
förblir tvetydigt och löses aldrig upp till en av syskonen; att svara för fel barn
är värre än att fråga.

Detta är låst av `src/lib/question-engine.names.test.ts`, som använder påhittade
namn med samma struktur som det riktiga hushållet: blandade efternamn och två
syskon som delar ett.

### Vad datamodellen ännu saknar för den här familjen

Ägarens anteckningar pekar ut konkreta luckor:

- Födelseår eller ålder finns inte. Med fem barn födda över tretton år är ålder det
  som avgör vad som är relevant för vem.
- Skola och klass finns inte, trots att det är den naturliga kopplingen mellan ett
  dokument och rätt barn.
- Förskolan publicerar information i SchoolSoft. Idag måste allt laddas upp för
  hand.
- Kalendern saknar upprepning, så återkommande datum som födelsedagar kan inte
  läggas in en gång.
- Familjen flyttar i oktober och byter både skolor och arbeten. Modellen behöver
  klara ett skolbyte utan att gammal information blir tyst fel.

## Levererat i staging: veckovy per person, utloggning och felrapport

### Gemensamma händelser: null betyder hela familjen

Migration `005_family_wide_events` gör `family_events.person_id` nullbar. En
händelse utan person gäller hela familjen, samma konvention som
`family_documents` redan använde. Middag hos mormor är en rad, inte en per
familjemedlem.

Det fanns en fälla: `HomeView` slog upp personen med `find(...)!`. Den
icke-null-försäkran tystade TypeScript, så ett nullbart `personId` hade gett
`undefined` och kraschat renderingen i stället för att ge ett kompileringsfel.
Använd aldrig `!` för uppslagningar som kan missa.

`src/lib/family-scope.ts` löser det generellt: `personForEvent` returnerar alltid
någon att rendera, och faller tillbaka på familjen både för gemensamma händelser
och för en person som hunnit raderas medan sidan varit öppen. Ingen vy kan tappa
en händelse tyst.

Frågemotorn behandlar en gemensam händelse som att den rör alla: den filtreras
aldrig bort på person, och den räknas som täckning för vem frågan än gällde.

### Kalendern har två lägen

`Vem gör vad` är standard: veckan som ett rutnät med en kolumn per
familjemedlem och familjen först. Det svarar på frågan en familj ställer oftast,
och det gör dessutom barnens vy självförklarande — man tittar i sin egen kolumn,
utan flikar eller filter att förstå.

`Tider` är det befintliga timrutnätet med drag-and-drop. Det behålls för att
personrutnätet har dagar som rader och därför saknar tidsaxel att dra i. De
svarar på olika frågor och ersätter inte varandra.

Under 860 pixlar döljs personrutnätet och mobilagendan tar över. Åtta kolumner
går inte att läsa på en telefon.

### Utloggning är med flit ärlig om sin begränsning

`/api/logout` svarar alltid 401 med en Basic-utmaning. Knappen anropar den med
ett förbrukat lösenord, vilket får de flesta webbläsare att släppa det de cachat
för realmet, och laddar sedan om.

Basic Auth har ingen äkta utloggning. Toasten säger därför rakt ut att fliken kan
behöva stängas. Riktig utloggning kommer först med riktig inloggning; lova inget
annat i gränssnittet.

### Felrapporten får inte innehålla familjeinnehåll

`installDiagnosticsListeners` lindar `window.fetch` och lyssnar på ouppfångade
fel. Att fånga på ett ställe i stället för vid varje anropsställe gör att
uppladdning, extraktion och bekräftelse täcks också, och att inget framtida
anropsställe kan glömma att rapportera. Svar klonas innan de inspekteras, så
anroparen får en oläst body.

Rapporten bär id:n, felkoder, antal, tider och en färsk hälsokontroll. Den bär
aldrig namn, dokumenttitlar eller fritext. Sökvägar maskeras till `:id`. Det är
låst av test, eftersom rapporten är gjord för att klistras in någon annanstans.

### Fallgrop värd att minnas

Svenska tecken i `curl -d` genom Git Bash blir sönderkodade. Åtta kalenderposter
skapades med trasiga å/ä/ö innan det upptäcktes. Både `psql` genom `docker exec`
och Node-utskrift i det här skalet visar dessutom mojibake även när datan är
korrekt, så terminalen duger inte som facit. Skicka svensk text via ett
Python-skript som styr kodningen, och verifiera i webbläsaren.

### Grind

Lint, strikt TypeScript, 163/163 tester och produktionsbygge gröna. Migrationen
kördes två gånger lokalt och är idempotent. Nya tester:
`src/lib/family-scope.test.ts` (6) och `src/lib/diagnostics.test.ts` (6).

## Levererat i staging: svar på frågeställarens språk

En av föräldrarna har somaliska som modersmål. Kravet blev medvetet smalt: hon
skriver på somaliska eller svenska, AI:n svårar på samma språk. **Gränssnittet
förblir svenskt.** Att översätta hela sidan hade inneburit ett underhållsarbete vid
varje ny funktion, och gav minst värde.

Samma invändning gäller en språkordlista för svaren: varje ny mening hade behövt en
somalisk tvilling för alltid. Därför är frågemotorn orörd.

### Hur det fungerar

1. Planeraren rapporterar frågans språk i `plannedQuestionSchema.language`.
   Svenska frågor som regelparsern klarar når aldrig AI:n och kostar ingenting.
2. Svaret räknas fram deterministiskt på svenska ur bekräftad familjedata, precis
   som förut. Motorn kan fortfarande inte hitta på något.
3. Först därefter översätts det färdiga svaret av `translateAnswer`.

Kalenderposternas titlar översätts inte. De kommer från familjens gemensamma data
och läses av alla, så ett språkval får inte skriva om vad de andra ser. Svaren blir
därför språkligt blandade, och det är avsiktligt.

### Faktakontrollen är poängen

Att lägga tillbaka en modell i svarsvägen är en risk: ett svar där 22.00 blivit
23.00 är begripligt men fel.

`checkTranslationKeepsFacts` kräver därför att varje siffra, klockslag och citerad
kalendertitel i originalet finns kvar i översättningen, med rätt antal förekomster,
och att längden inte skenat. Faller kontrollen returneras det svenska svaret.

Håll kontrollen sträng. Familjen läser svenska, så fallbacken kostar ingenting -
det är själva skälet till att den får vara snäv. Mjuka inte upp den för att få
fler översättningar igenom.

Låst av `src/lib/answer-facts.test.ts`: tappat klockslag, ändrat klockslag,
hopslagen upprepad tid, bortöversatt titel, tom och skenande översättning.

### Känd lucka

Frågor om uppgifter går genom `parseSwedishTaskQuestion`, en separat svensk parser
som körs före AI-planeraren. Somaliska uppgiftsfrågor hanteras därför inte ännu.

### Deployat och verifierat

- Deployment: `3bfc2889-5477-4cb9-8c5c-24c315bc9f95`
- Migration `005_family_wide_events` kördes av Railways preDeploy före den nya
  koden, vilket är rätt ordning: kolumnen blir nullbar innan något skriver `null`.
- Ny kod svarade efter cirka 45 sekunder.
- `release:smoke` 6/6, `release:e2e` 27/27.
- Artifacts: `artifacts/releases/railway-smoke-2026-08-25T18-47-19-064Z.json` och
  `artifacts/releases/railway-e2e-2026-08-25T18-47-32-025Z.json`
- Funktionellt verifierat mot den riktiga domänen: en gemensam händelse skapades
  med `personId: null`, en somalisk fråga gav somaliskt svar med bevarade
  klockslag, samma fråga på svenska gav svenskt svar, och testposten städades bort.

## Viktiga filer

- Produktplan: `koncept.tct`
- Next.js-regler: `AGENTS.md` och `CLAUDE.md`
- Typer: `src/lib/types.ts`
- AI-extraktion: `src/server/ai.ts`
- Validering: `src/server/schemas.ts`
- Databas: `src/server/database.ts`
- Migrering: `scripts/migrate.mjs`
- Granskningsmodal: `src/components/AddDocumentModal.tsx`
- App-state: `src/components/FamilyApp.tsx`
- Hemvy: `src/components/HomeView.tsx`
- Frågemotor: `src/lib/question-engine.ts`
- Ask API: `src/app/api/ask/route.ts`
- Access gate: `src/proxy.ts`, `src/lib/access-gate.ts`
- Readiness/health: `src/app/api/ready`, `src/app/api/health`
- Railway config: `railway.json`
- Docker: `Dockerfile`
- Remote releaseprov: `scripts/remote-release-test.mjs`

Next.js-versionen har brytande ändringar. Läs relevant dokumentation under
`node_modules/next/dist/docs/` innan Next-specifika ändringar, enligt
`AGENTS.md`.

## Rekommenderad fortsättningsordning

1. Kör `rg --files` och inspektera alla lokala ändringar. Katalogen saknade
   `.git` vid den här överlämningen, så lita inte på `git diff` som enda källa.
2. Utgå från att deployment `f169c382-7a59-4f1a-a50d-b964b2c8d9ee` och de två
   senaste artifacts ovan är den gröna baslinjen. Gör inte om staging-seed.
3. Behandla task-, dokument- och kalenderflödena som frysta tills nästa avsiktliga
   produktändring eller ett konkret fel. Kör då alltid:

   ```powershell
   pnpm lint
   pnpm exec tsc --noEmit
   pnpm test
   pnpm build
   ```

4. Nästa stora säkerhetssteg i planen är riktig inloggning, hushållsisolering och
   permissions-before-retrieval/actions. Basic Auth är fortfarande bara staging.
5. För varje framtida databasändring: kör migrationen två gånger lokalt, bygg
   slutimagen och kör production-smoke innan Railway.
6. Efter varje framtida deploy: kör smoke/full-E2E mot
   `BASE_URL=https://www.zickaris.se`, kontrollera cleanup och uppdatera denna fil
   med deployment-ID och artifacts. Standarddomänen är borttagen och ska normalt
   förbli borttagen.

Exempel på säker fjärrkörning utan att skriva lösenordet i kommandot:

```powershell
$env:BASE_URL = 'https://www.zickaris.se'
$env:VARDAGSRO_GATE_USERNAME = 'vardagsro'
$env:VARDAGSRO_GATE_PASSWORD = [string](Get-Clipboard)
$env:RAILWAY_DEPLOYMENT_ID = '<aktuell deployment-id>'
try {
  pnpm release:smoke
  pnpm release:e2e
} finally {
  Remove-Item Env:BASE_URL,Env:VARDAGSRO_GATE_USERNAME,
    Env:VARDAGSRO_GATE_PASSWORD,Env:RAILWAY_DEPLOYMENT_ID `
    -ErrorAction SilentlyContinue
}
```

Verifiera först att urklippet faktiskt matchar Railway-variable utan att skriva
ut något av värdena.

## Compliance: trösklar och beslut

Det här avsnittet är produktbeslut och tekniska trösklar, inte juridisk rådgivning.
Innan det första externa hushållet läggs in ska en riktig jurist granska
behandlingen. Fram till dess styr besluten nedan vad som byggs och i vilken ordning.

### Den avgörande tröskeln är det andra hushållet, inte Stripe

Så länge Vardagsro körs på ägarens egen familj faller behandlingen sannolikt under
hushållsundantaget i GDPR artikel 2.2 c. I samma stund som ett andra hushåll läggs
in — gratis, som betatestare eller som familjemedlem — behandlas någon annans barns
personuppgifter och undantaget upphör. Betalning är juridiskt irrelevant för den
gränsen.

Planera därför alla compliance-leveranser mot händelsen *första externa hushållet*,
inte mot Stripe-integrationen. Lägg inte in ett andra hushåll i produktion innan
identitet, hushållsisolering, permissions och audit är på plats.

### AI Act är inte den stora frågan för den här produkten

Vardagsro bedöms inte vara ett högrisksystem. Bilaga III träffar utbildning i
betydelsen tillträde till utbildning och bedömning av studieresultat. Att tolka en
skollapp och föreslå en kalenderpost är inte det.

Det som gäller är transparenskraven, och de uppfylls redan av produktprincipen:
AI:n föreslår, familjen granskar och godkänner innan något blir betrodd
familjedata. Den principen får därför inte urholkas av bekvämlighetsskäl — den är
både produktlöfte och regelefterlevnad.

Reservation: den här bedömningen skrevs 2026-08-21 av en modell med kunskapsgräns i
maj 2026, och det fanns förslag om att skjuta upp delar av högriskreglerna.
Verifiera datum och status innan något byggs som vilar på dem. Slutsatsen att
produkten inte är högrisk påverkas dock inte av tidplanen.

### GDPR är den stora frågan

Två saker gör Vardagsro känsligare än vanlig SaaS:

- **Barn.** Skollappar, läxor, provdatum och scheman rör barn, som har förstärkt
  skydd. I Sverige går gränsen för digitalt samtycke vid 13 år.
- **Artikel 9-data.** Tandläkarkallelser finns redan i konceptet, och en skollapp
  som nämner allergi eller diagnos är särskild kategori av personuppgift om barn.

### Öppet beslut som ska tas före nästa datamodelländring

Ska Vardagsro medvetet stödja hälsouppgifter, eller aktivt undvika dem?

Beslutet formar arkitekturen: klassificering redan vid extraktion, eventuell separat
behandling och egna retentionsregler. Det går inte att skjuta upp billigt, eftersom
alternativet är att klassificera redan lagrad data vars innehåll ingen känner till.
Ta beslutet innan nästa migration som rör dokument eller personer.

### Billigt nu, dyrt att retrofitta

Följande finns redan och ska behandlas som compliance-tillgångar, inte bara som
produktfunktioner: `householdId` på samtliga entiteter, hushållsfiltrerade queries
med tester, provenance via `documentId`, `sourceExcerpt` och `confidence`, samt
`reviewStatus`/`status` som skiljer granskat från ogranskat.

Det som saknas och blir dyrt att lägga till i efterhand:

- **Append-only audit** över vem som gjorde vad och när. Ligger redan i planen som
  del av Safe Action Engine och bör byggas tillsammans med identitet, inte efter.
- **Retention på dokument.** Ett fält som inte används på länge kostar ingenting nu;
  att backfilla det mot tusentals redan lagrade dokument går inte.
- **Vuxen eller barn på `FamilyPerson`.** Styr åtkomst och samtycke och kan inte
  gissas i efterhand.
- **DPA med OpenAI samt begäran om zero data retention.** Administration, inte
  utveckling. Ska göras oavsett hur produkten utvecklas.

### Medvetet uppskjutet

DPIA, registerförteckning enligt artikel 30, integritetspolicy, DSAR-flöden och
eventuell certifiering beskriver en produkt som ännu inte har sin slutform. De hör
hemma strax före första externa hushållet. Att skriva dem nu innebär att de skrivs
om flera gånger utan att skydda någon.

## Saker som ännu inte får beskrivas som klara

- Riktig produktinloggning och flerhushållsisolering
- serverstyrda roller/permissions före retrieval och actions
- skapa/redigera familj och familjemedlemmar
- reminders/leveransscheduler
- countdowns
- Daily Brief som genererad och levererad produktfunktion
- Telegram-kontokoppling, inbox, röst och Mini App
- Safe Action Engine med audit och Ångra
- full multimodal RAG med OCR/layoutsegment, sida och bbox

BBox är uttryckligen placerat i Version 2 i `koncept.tct`. Det ska lagras med
dokument-/sidreferens, normaliserade koordinater, rotation och renderingsversion.
Källklick ska öppna rätt sida och markera exakt område; ett E2E-test ska bevisa
svar → källa → sida → synlig bbox → rätt text. Permissions ska filtrera segmentet
innan retrieval, och UI får endast falla tillbaka tydligt till sidnivå om exakt
bbox saknas.

Bygg inte Telegram-skrivningar före identitet, permissions och Safe Action
Engine. En första privat read-only-bot/inbox kan dogfoodas tidigare, men den får
inte bli en separat databas eller en genväg runt serverns policykontroller.

## Deploy 2026-08-25: Medvind Fp, Bo/Ob och kalenderanteckningar

Originalbilder för Nora och Mikael verifierades lokalt i `private/` och Mikaels
första originalbild verifierades därefter mot produktionens `/api/extract`.
Extraktionen känner nu `Fp` som `Föräldraledigt` i kategori `family`. `Ar`, `Bo`
och `Ob` betyder arbete; överlappande eller direkt sammanhängande rader slås ihop
deterministiskt till ett `Jobb`-event, medan en verklig tidslucka bevarar två pass.
Gula Medvind-rutor följer med som `notes` och skapar inga tasks.

Regressionerna finns i `src/server/ai.medvind.test.ts`. Lokal verifiering:
175/175 tester, lint utan fel och rent Next 16-produktionsbygge. På Mikaels två
originalbilder extraherades alla tio `Fp` korrekt och alla sammanhängande
`Ar`/`Bo`/`Ob` slogs ihop. Produktionsprovet på första bilden gav 24 events,
4 föräldraledigheter, 10 events med anteckningar, 0 tasks och `storageKey:null`.

- Railway deployment: `4c19bf26-2499-4787-a63c-7a4f630e0936` (`SUCCESS`)
- Smoke: 6/6, `artifacts/releases/railway-smoke-2026-08-25T19-32-20-030Z.json`
- Full E2E: 27/27, `artifacts/releases/railway-e2e-2026-08-25T19-33-34-437Z.json`
- En riktig produktionsfråga mot ett tillfälligt Mikael-pass svarade korrekt att
  hon jobbade 07.00–16.00 den 30 september. Båda tillfälliga testevents städades
  bort; produktionen slutade på 0 events och 0 documents.

### Kalenderkort visar hela tidsintervallet

Familjerutnätets kalenderkort visade tidigare bara starttiden. De visar nu
`start–slut`, exempelvis `07.00–16.00`, formaterat i hushållets tidszon. Heldagar
visar fortsatt `Hela dagen`.

- Railway deployment: `ae6a7bf5-675a-4a2e-808c-e277445c349c` (`SUCCESS`)
- Lokal verifiering: 175/175 tester, lint utan fel och rent produktionsbygge
- Smoke: 6/6, `artifacts/releases/railway-smoke-2026-08-25T19-41-23-038Z.json`

### Snabbare kalender och korrekta månadsskiften

Kalenderns personvy gjorde tidigare en full filtrering av alla events för varje
kombination av sju dagar och samtliga personkolumner, samtidigt som den dolda
timvyn också beräknades. Events indexeras nu en gång per synlig vecka och dag,
celluppslag återanvänder indexet och timvyns segment/layout räknas bara när
`Tider` faktiskt visas. Övriga appvyer lämnades orörda efter användarens
förtydligande att kalendern var den långsamma delen.

Veckor som korsar en månad visar nu båda månaderna. Exempel: vecka 36,
31 augusti–6 september, visar `Augusti–september 2026`. Årsskiften stöds också
och täcks tillsammans med månadsskiftet av `src/lib/dates.test.ts`.

- Railway deployment: `81953976-3a0d-4425-9204-a1cbf77b3c35` (`SUCCESS`)
- Lokal verifiering: 176/176 tester, lint utan fel och rent produktionsbygge
- Smoke: 6/6, `artifacts/releases/railway-smoke-2026-08-25T19-57-37-019Z.json`

## 2026-08-26: identitet, hushållsisolering, permissions och audit

Codex byggde grunden och tog slut mitt i arbetet. Claude tog över samma dag och
slutförde steget. Ingenting av detta är migrerat eller deployat — se
`CLAUDE_VERIFIERING.md` för vad som faktiskt är kört.

### Vad som landade

**Identitet.** Better Auth 1.7 med e-post och lösenord, sign-up avstängd.
`/api/auth/[...all]` är den enda platsen som hanterar inloggningsuppgifter.
`src/server/auth.ts` byggs lat via `getAuth()`; att läsa hemligheter vid import
gjorde `next build` beroende av produktionsvariabler och fick bygget att falla.

**Sessionslager.** `src/server/actor.ts` löser en verifierad session till ett
`ActorContext` med hushåll, person, roll och `personType` — allt hämtat ur
sessionen och `family_memberships`, aldrig ur request. Sidan `/` och samtliga
API-routes går genom `requireActor` innan någon data hämtas.

**Hushållsisolering.** `ACTIVE_HOUSEHOLD_ID = "household-demo"` är borta ur
`database.ts`; alla 23 datafunktioner tar `actor` och filtrerar på
`actor.householdId`. Även R2-nycklarna bär numera hushållet som första segment.
Gamla `household-demo/...`-nycklar accepteras fortsatt av validatorn.

**"Jag" betyder rätt person.** `currentPersonId` kom tidigare från den som råkade
ha rollen `Jag`, vilket gjorde att alla sessioner svarade som Nora. Den kommer nu
från medlemskapet. Bevisas av `src/server/database.current-person.test.ts`.

**Roller.** `owner` förvaltar hushåll och familjesammansättning, `adult` ändrar
innehåll, `viewer` läser bara. Kontrollen sker före hämtning, inte efter.

**Audit.** `family_audit_log` är append-only i databasen via trigger, och
`recordAudit` skriver i samma transaktion som ändringen den beskriver. Flera
funktioner som tidigare körde en ensam query fick en transaktion just för det.
Metadata beskriver formen på en ändring, aldrig dess innehåll.

**Telegram.** Fortsatt strikt read-only, men inte längre bunden till ett
hårdkodat hushåll: boten löser sin aktör ur `telegram_accounts` och läser genom
samma policylager som webben. En länkad person utan eget konto blir `viewer`.
Migration 008 tar bort `household_id` från `telegram_link_requests`: den
oautentiserade sidan av flödet ska inte kunna peka ut vilket hushåll en kod
senare binds till.

**Fel som hittades under arbetet.** `telegramAccountRows` fick en ny parameter och
två anropsställen skickade Telegram-id:t som hushållsfilter. Kompilatorn kunde
inte se det eftersom båda är `string`. Rättat, men värt att minnas som mönster.

### Migrationer

- `007_identity_permissions_audit` (Codex): auth-tabeller, `person_type` med
  backfill, `family_memberships`, `family_account_invitations`, `family_audit_log`
  med append-only-trigger
- `008_telegram_link_without_household`
- `009_auth_generated_ids`

Körda mot den lokala compose-databasen 2026-08-27, från 005 och uppåt, två gånger.
Inte körda mot staging eller produktion.

### Att skapa det första kontot

Sign-up är avstängd med flit. Konton skapas med:

```powershell
node scripts/bootstrap-account.mjs --list
$env:VARDAGSRO_BOOTSTRAP_PASSWORD = '<minst 12 tecken>'
pnpm account:bootstrap -- --email nora@exempel.se --person "Nora" --role owner
Remove-Item Env:VARDAGSRO_BOOTSTRAP_PASSWORD
```

Lösenordet läses ur miljön och aldrig ur argumentlistan.

### Två fel som bara en riktig körning hittade

`generateId: "uuid"` betyder inte att Better Auth genererar id:t. På Postgres
överlåter det id:t till databasen och förväntar sig `gen_random_uuid()` som
default. Migration 007 skapade auth-tabellerna utan default, så **varje inloggning
misslyckades** med en not-null-överträdelse. Rättat i 009. Ingen mängd enhetstester
hade sett det; det syntes först vid en riktig inloggning mot en riktig databas.

`JSON.stringify(...)::jsonb` lagrar en jsonb-*sträng*, inte ett objekt, så
audit-metadata var osökbar med `metadata->>'fält'`. Rättat i `audit.ts`. Samma
mönster finns kvar för `aliases` i `family_people`, där det kompenseras vid
läsning; rätta det när någon ändå rör den koden.

### Release-testet loggar in

`scripts/remote-release-test.mjs` kräver nu `VARDAGSRO_TEST_EMAIL` och
`VARDAGSRO_TEST_PASSWORD`, skickar `Origin` på alla anrop och har två nya
kontroller: `product_requires_login` och `product_login`. Smoke är därmed 8
kontroller och full E2E 29. En körning som ger 6/6 har inte kört den nya koden.

### Kvar innan detta får deployas

- `VARDAGSRO_AUTH_SECRET` måste finnas på Railway. `.env.local` har i dag
  `AUTH_SECRET`, vilket är ett annat namn som applikationen inte läser
- Ett riktigt konto per vuxen måste skapas i målmiljön med `account:bootstrap`
  innan release-testet kan köras där
- Fjärrverifieringen är inte körd mot någon miljö

## 2026-08-27: skolscheman och gruppdelade lektioner

Testat på två riktiga scheman i `private/`: ett foto av en färgutskrift (7A, v36)
och en telefonskärmdump av en PDF (9A2, v35). Båda tolkades redan som
`Skolschema` med rätt veckonummer-till-datum-räkning.

### Felet: tvärsäkert ofullständig

Prompten sade `utelämna osäkra händelser`. För smala parallellkolumner — språkval,
svenska mot svenska som andraspråk, två slöjdgrupper — gjorde modellen precis det
och kastade dem. Kvarvarande händelser fick confidence 0.98–0.99.

Resultatet var det sämsta tänkbara: en kalender som ser komplett ut men har hål.
För 7A saknades torsdagens slöjd 08:10–09:30, alltså 80 minuter. Kalendern
påstod att pojken började 09:40 den dagen.

### Vad som ändrades

Instruktionen är omformulerad: en händelse utelämnas bara när dess *tid* är okänd.
Osäkerhet om vad som händer under en känd tid ska returneras.

Skolschemaregler tillkom: lektionsruta blir kategori `school`, salskoden är
location och skolans namn är aldrig en sal, ämneskoder skrivs ut läsbart, och
varje parallellkolumn returneras som en egen händelse.

`mergeParallelSchoolLessons` i `src/server/ai.ts` slår sedan ihop dem
deterministiskt, på samma sätt som `mergeMedvindWorkEvents`. Regeln är att en
elev inte kan vara på två lektioner samtidigt, så överlappande skolhändelser är
per definition gruppalternativ. De blir en post som täcker hela tidsluckan, med
alternativen i notes, och confidence 0.4 så att den läses som en fråga.

Delar klassen sig bara i grupper behålls ämnet som titel — `Slöjd`, inte
`Slöjd / Slöjd`. Skiljer sig ämnena listas de: `Svenska som andraspråk / Svenska`.

Regressioner i `src/server/ai.school.test.ts`, åtta stycken, byggda på de
verkliga tidsluckorna ur båda schemana.

### Uppmätt på de riktiga bilderna

- 7A: 25 → 32 händelser. Alla sju gruppdelade luckor tillbaka, inklusive slöjden.
- 9A2: 20 → 27 händelser, och salarna blev riktiga koder i stället för att varje
  händelse fick skolans ortsnamn som location i stället för salskoden.

### Kvar att veta

Skärmdumpen är fortfarande sämre underlag än fotot. Slöjden på 9A2 hamnade på
fredag trots att den ligger i torsdagskolumnen, och tider avrundas ibland med
några minuter. Skärmdumpens högerkant är dessutom avklippt, så en del data finns
inte i bilden alls. Foto av utskrift ger märkbart bättre resultat än skärmdump.

Extraktionen är inte deterministisk. Två körningar av samma bild skilde sig med
fem rader, alla lunchrader. Om lunch ska vara en kalenderhändelse eller inte är
ett öppet produktbeslut; just nu avgör modellen det per körning.

Vilken grupp ett barn tillhör står inte i schemat. Att lagra det på
`FamilyPerson` skulle göra valet automatiskt, men kräver en migration och är
därför inte gjort här.

### Schemat gäller längre än sin vecka

Barnen säger att grundschemat står sig hela terminen, och familjen flyttar till
en annan ort i oktober. Ett schema har alltså en verklig giltighetstid som varken
veckonumret eller dokumentet känner till.

Bekräftelsesteget har därför ett fält, `Gäller till och med`. Sätts det kopieras
veckan fram till det datumet vid sparandet. Kopiorna delar `documentId` med
originalet, så hela perioden försvinner när dokumentet tas bort — verifierat:
189 händelser skapade, 189 borttagna i ett steg.

Upprepningen materialiseras som vanliga händelser i stället för att modelleras
som en återkommanderegel. Varje händelse i hushållet har redan konkreta tider,
och kalendern, redigeringen och frågemotorn bygger alla på det. En riktig
recurrence-modell hade varit en ombyggnad utan synlig vinst i det här läget.

`repeatWeeklyEvents` i `src/lib/weekly-schedule.ts` räknar i väggklocka, inte i
timmar. Sju gånger tjugofyra timmar hade flyttat en 08:10-lektion till 07:10 när
klockan ställs om sista söndagen i oktober. Täckt av test.

Taket är 30 veckor. Ett schema som påstår sig gälla längre är en felskrivning,
inte en termin.

Uppmätt lokalt: 27 lektioner i veckan, giltiga till 16 oktober, gav 7 veckor och
189 händelser med rätt måndag-till-fredag-fördelning och bevarade klockslag.

Lovveckor hanteras inte. För det här schemat spelar det ingen roll eftersom
höstlovet ligger efter flytten, men ett schema som spänner över ett lov lägger in
lektioner på lediga dagar. Det ska lösas innan någon förlitar sig på en hel
termin.
