# Jarvis Capability Backlog & Önskelista (Self-Improving Flywheel)

Detta dokument spårar funktioner, frågor och kommandon som Jimmy har ställt till Jarvis i vardagen (via Telegram eller webben) men som systemet ännu inte har full täckning för i koden.

Varje gång en förfrågan faller utanför Jarvis befintliga verktyg loggas den automatiskt i databasen (`jarvis_capability_gaps`). Databasen är den levande källan; den här filen är en statisk vägledning och fylls inte på automatiskt från Telegram.

---

## 🔄 Hur cykeln fungerar

1. **Vardagsanvändning:** Jimmy frågar Jarvis om något nytt (t.ex. *"När ska bilen besiktigas?"*, *"Räkna ut elkostnad"*, *"Vad ska vi laga för mat på resterna i kylen?"*).
2. **Ärligt svar & loggning:** Jarvis svarar att funktionen inte stöds än, men bekräftar att den har sparats till utvecklingsbackloggen.
3. **Session start:** När vi påbörjar en session läser vi av nya loggade önskemål och väljer vad vi ska bygga in.
4. **Implementation & test:** Vi bygger det nya verktyget i `jarvis-agent.ts`, testar och markerar gapet som löst (`implemented`).

---

## ✅ Nyligen Implementerade & Slutförda Funktioner

* [x] **Min trädgård i Telegram:** `/vanor`, `/tradgard` och ”🌱 Min trädgård” visar fem dagliga mikrovanor med avbockningsknappar. Samma privata tillstånd som på webbsidan; dagens bockar kan ångras och gamla knappar får inte ändra en ny dag. Kräver migration `029_project100_garden` och uppdaterad server. Liveprovning mot Telegram återstår.

* [x] **Telegram Påminnelser med schema-ankare & tidszoner:** "Påminn mig att köpa mjölk på fredag efter jobbet" eller "Påminn mig kl 20:00" skapar uppgift och pushar automatisk påminnelse till Telegram vid rätt klockslag svensk tid via den inbyggda bakgrundsmotorn.
* [x] **Morgon- & Kvällsbriefing i Telegram & Webb:** Fullt stöd för `/briefing`, `/morgonbrief`, `/kvallsbrief` och naturliga fraser ("God morgon Jarvis, vad har vi idag?", "Hur ser dagen ut?", "Kvällsavstämning", "Kvällsbrief"). Sammanfattar arbetspass, familj/skola, träningsfönster, 160g proteinmål & matlådor samt dagbok.
* [x] **Projekt 100 Före/Efter-kroppsscanning & Analys:** Interaktiv split/side/fade-jämförelse, tidsfilter (Start vs Senaste, 30d, 90d) och automatisk muskelökningsanalys (vikt vs midjemått).
* [x] **Röstinmatning & Tal-syntes i Telegram:** Röstmeddelanden i Telegram transkriberas via Whisper och besvaras med röstsvar (Onyx) och text.
* [x] **Naturlig vardagsloggning & belastningsanpassning:** Jarvis förstår bland annat "nu drack jag en proteindrink", "20 × 2 armhävningar", "nu gjorde jag 40 knäböj" och aktuella kroppskänningar. Proteinmängd gissas aldrig. En rapporterad känning påverkar kommande träningsförslag tills användaren säger att kroppsdelen känns bra igen.
* [x] **Kylskåpstömning & Proteinrika Måltidsförslag (`nutrition`):** "Vad kan vi laga på köttfärs och pasta?" eller "Kylskåpstömning: jag har ägg och potatis i kylen" analyserar råvaror, genererar måltider anpassade för Projekt 100 med beräknat protein- och kaloriinnehåll samt identifierar saknade basingredienser och erbjuder att lägga till dem på inköpslistan.
* [x] **Bilen & Fordon (`car`):** Besvarar svenska däcklagar ("När måste jag byta till vinterdäck?", lagkrav 1 dec – 31 mars, dubbdäck 1 okt – 15 apr), kontrollbesiktningsintervall (3 år, 2 år, därefter var 14:e månad) samt naturlig mätarställningslogg ("Bilen har gått 14 500 mil") som sparas och versionshanteras i hushållets minnesbank.

---

## 📋 Identifierade funktionsområden för framtida utbyggnad

### 1. Ekonomi & Hushållsavtal (`finance` / `house`)
- [ ] Elkostnadsberäkning & rörligt/fast elpris (t.ex. Nordpool API-integration).
- [ ] Avtal, försäkringsnummer och bindningstider.
- [ ] Sophämtningsdagar och slamsugning.

### 2. Barnen & Skola (`kids`)
- [ ] Lovdagar, studiedagar och schemabrytande aktiviteter från skolschemat.
- [ ] Packlistor för utflykter och idrottsdagar.

### 3. Dagens träningsuppdrag (`training`)
- [ ] Samla spontana övningar från Jarvis, Motion Lab och manuell loggning i ett
  öppet överkropps- eller underkroppsuppdrag över hela dagen.
- [ ] Svara källbundet på “vad återstår för att dagen ska vara 100 %?” med
  rörelsemönster, målset, aktuell miljö, tillgänglig utrustning och kroppskänningar.
- [ ] Skilj plantäckning från muskelbyggande stimulans och lova aldrig ett
  biologiskt resultat från ett enskilt pass.
- [x] Avsluta och spara även delvis genomförda dagar utan att skriva om planen
  eller skapa skamformuleringar.
