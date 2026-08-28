# Vardagsro

Vardagsro samlar familjens scheman, kallelser och viktiga tider på ett ställe. Lägg in en bild eller PDF, kontrollera vad som hittades och fråga sedan på vanlig svenska.

## Version 1

Kärnflödet är:

```text
Bild eller PDF → AI-förslag → familjen kontrollerar → godkänner → kalender + tasks
                                                                  ↓
Fråga på svenska → typad frågeplan → exakt urval → svar med verifierad källa
```

Det som fungerar i denna version:

- Responsiv hemvy, veckokalender med bekräftad drag-and-drop, frågeassistent och dokumentbibliotek.
- Gemensam modal för att skapa och redigera kalenderposter med person, datum,
  tider, heldag, kategori, plats och anteckning. Mobil och tangentbord har en
  fullvärdig Redigera-knapp.
- Uppladdning av JPG, PNG, WebP och PDF upp till 12 MB.
- Magic-byte-kontroll, SHA-256 och säkra slumpade lagringsnamn.
- Bild- och PDF-tolkning via OpenAI Responses API med strikt Zod-schema.
- Obligatorisk mänsklig granskning innan hittade tider eller tasks blir bekräftade.
- Originalfilen skrivs inte till R2 under granskningen. Vid Spara verifieras
  filsignatur, MIME, filnamn och SHA-256 igen innan lagring.
- PostgreSQL för familjemedlemmar, dokument, kalenderposter och tasks/deadlines.
- Cloudflare R2-adapter för originalfiler och tidsbegränsade källänkar.
- Svenska frågor om idag, imorgon, veckodagar, helgen, jobb, skola, fotboll,
  läxor, prov, blanketter, deadlines och saker att ta med.
- Deterministisk beräkning av tider och överlapp; AI:n får aldrig hitta på kalenderfakta.
- Lokal demodata och webbläsarlagring i utvecklingsläge. Production är fail-closed
  och får aldrig se fungerande ut genom demo-data när databas eller lagring är trasig.

## Kom igång

Krav: Node 22+, pnpm och Docker.

```powershell
pnpm install
docker compose up -d database
pnpm dev
```

Öppna [http://localhost:3000](http://localhost:3000). Databasen exponeras lokalt på port `5434` så att den inte krockar med en vanlig PostgreSQL-installation på `5432`.

Hela lösningen kan också köras i Docker:

```powershell
docker compose up --build
```

### Miljövariabler

Projektet läser befintliga hemligheter från `.env.local`. Filen är git-ignorerad och ska aldrig checkas in. Se `.env.example` för variabelnamn.

- `OPENAI_API_KEY` aktiverar riktig dokumenttolkning och språkplanering.
- `OPENAI_MODEL` är valfri och använder `gpt-5.6-terra` som standard.
- `R2_*` aktiverar lagring av originalfiler.
- `FAMILY_DATABASE_URL` används före den generella `DATABASE_URL` för att undvika att röra andra lokala databaser.

Status kan kontrolleras utan att exponera några hemligheter:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Om R2 visas som `unavailable` med `NoSuchBucket`, kontrollera att
`R2_BUCKET_NAME` finns i samma Cloudflare-konto som API-tokenen har åtkomst till.
AI-tolkningen kan fortfarande visas för granskning, men production vägrar
godkänna dokumentet tills originalfilen kan lagras säkert.

## Kvalitetskontroller

```powershell
pnpm lint
pnpm test
pnpm build
```

Frågemotorns tester täcker bland annat svenska relativa datum, personalias, felskrivningar, helger, sommartid, källor och exakt tidsöverlapp.

## Railway: skyddad testmiljö

Railway bygger rotens `Dockerfile`. [Config as Code](https://docs.railway.com/config-as-code/reference)
i `railway.json` kör databasmigreringen före varje release och kräver att den publika
`/api/ready` svarar `200` innan ny trafik växlas över. Railway använder denna probe
vid driftsättning, inte som kontinuerlig övervakning.

Skapa två Railway-tjänster i samma projekt: webbappen och Railway PostgreSQL.
Databasen behöver ingen publik TCP-proxy. Sätt webbappens `DATABASE_URL` som en
Railway-referens till `${{Postgres.DATABASE_URL}}` (byt `Postgres` om tjänsten har
ett annat namn). Då går trafiken över Railways privata nät.

Följande servervariabler krävs i Railway:

- `DATABASE_URL` eller `FAMILY_DATABASE_URL`
- `OPENAI_API_KEY` och valfri `OPENAI_MODEL`
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` samt
  `R2_ACCOUNT_ID` eller `R2_ENDPOINT_URL`
- `VARDAGSRO_AUTH_SECRET` och `VARDAGSRO_BASE_URL` för produktinloggningen

Lägg dem i Railway Variables, aldrig i repositoryt eller en deploylogg. R2-bucketen
ska fortsätta vara privat; appen lämnar bara ut kortlivade signerade källänkar.
`.railwayignore` och `.dockerignore` stoppar lokala `.env`-filer från deployarkivet.

Driftsättning sker från GitHub. Tjänsten `vardagsro-web` bygger `main` i
`royalrew/VardagsRo`, så **en push till main är en driftsättning**:

```powershell
git push origin main
```

Deploya inte med `railway up`. Under en övergång låg en CLI-deploy aktiv samtidigt
som GitHub-kopplingen, och de två serverade olika kod medan båda rapporterade
lyckat resultat. En väg in är hela poängen.

Ett grönt deploy-status betyder att bygget gick igenom, inte att just den koden
körs. Det kontrolleras genom att leta efter en fras som bara finns i den nya
versionen:

```powershell
railway ssh sh -c 'grep -rl <ny-fras> /app/.next/server | wc -l'
```

I Git Bash krävs `MSYS_NO_PATHCONV=1`, annars skrivs `/app` om till en
Windows-sökväg innan kommandot når containern.

En helt ny, dedikerad stagingdatabas kan bootstrapas med uttrycklig, ofarlig
demodata. Sätt då de två skyddsflaggorna tillfälligt och använd
`node scripts/predeploy-staging.mjs` som pre-deploy-kommando för den första
releasen:

```powershell
railway variables --service vardagsro-web --set "VARDAGSRO_ENV=staging" `
  --set "ALLOW_STAGING_DEMO_SEED=true"
```

Bootstrap-kommandot kör migration och staging-seedning i samma Node-process, så
att det fungerar utan shell och databasen kan klara readiness vid första deploy.
Seed-skriptet vägrar skriva om miljön inte uttryckligen är `staging`, om den andra
flaggan saknas eller om databasen innehåller ett annat hushåll.

Efter den första gröna releasen återställer du `railway.json` till
`node scripts/migrate.mjs` och sätter `ALLOW_STAGING_DEMO_SEED=false`. Normal
deploy får aldrig seeda eller skriva över familjedata automatiskt.

### Egen domän via DNS-leverantören

Lägg domänen under webbappens **Settings → Networking → Custom Domain**, eller kör:

```powershell
railway domain familj.example.se --port 3000 --json
```

Railway visar en `CNAME` och en verifierande `TXT`-post. Lägg in båda exakt som
Railway anger hos den auktoritativa DNS-leverantören, exempelvis Loopia; utan
TXT-verifieringen routas inte domänen. För en `www`-domän pekar CNAME direkt mot
Railways angivna mål. Låt rotdomänen göra en permanent `301`-omdirigering till
`www` om DNS-leverantören inte erbjuder lämplig CNAME-flattening. Railway utfärdar
TLS-certifikatet automatiskt.

Produktinloggningen gäller på både den egna domänen och en eventuell
`*.up.railway.app`-adress. `/api/ready` är publik och lämnar bara readiness-status;
den detaljerade `/api/health` kräver en verifierad familjesession. Cloudflare R2
är filstorage och behöver inte vara samma leverantör som domänens DNS.

### Svart-på-vitt-test efter deploy

Smoke-testet verifierar publik readiness, att anonym trafik stoppas, inloggad UI,
strikt health och databasdashboard. Fullt E2E skapar och flyttar dessutom en
kalenderpost, provar anteckning och server-PATCH, skapar ett unikt PDF-schema,
kör OpenAI-tolkning, granskningskontrakt, R2-lagring, event/task-frågor,
task-completion, signerad källa och en manuell override utan falsk dokumentkälla.
Slutligen inventeras och raderas alla testevents, tasks, dokument och R2-objekt —
även efter ett osäkert nätverkssvar.

Läs testlösenordet från urklipp så att det inte hamnar i PowerShell-historiken:

```powershell
$env:BASE_URL = "https://familj.example.se"
$env:VARDAGSRO_TEST_EMAIL = "testkonto@familj.example.se"
$env:VARDAGSRO_TEST_PASSWORD = [string](Get-Clipboard)

pnpm release:smoke
pnpm release:e2e

Remove-Item Env:\BASE_URL, Env:\VARDAGSRO_TEST_EMAIL, Env:\VARDAGSRO_TEST_PASSWORD
```

Testet skriver endast ett sanitiserat kvitto under `artifacts/releases/`: värdnamn,
UTC-tid, release-id om tillgängligt samt namn, status och tid för varje kontroll.
Inga credentials, familjeuppgifter, API-svar eller signerade R2-länkar sparas.

## Viktig avgränsning

Det här är en MVP för ett hushåll. Individuella konton, hushållsisolering och
rollbaserad åtkomstkontroll finns, men gallring, export och en fullständig
integritetsbedömning återstår. Lägg inte in medicinska dokument eller andra
särskilt känsliga personuppgifter innan de delarna är klara.

AI:n föreslår; en människa godkänner. Ett tomt sökresultat betyder inte automatiskt att någon är ledig — assistenten svarar att underlag saknas när den inte kan styrka svaret.

## Nästa naturliga steg

1. Dokumentgallring, export och revisionslogg.
2. Notiser samt Google-, Apple- och Outlook-synk.
3. Installationsbar PWA med offline-läsning av redan synkade tider.
