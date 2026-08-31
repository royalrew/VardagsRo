# Jarvis Capability Backlog & Önskelista (Self-Improving Flywheel)

Detta dokument spårar funktioner, frågor och kommandon som Jimmy har ställt till Jarvis i vardagen (via Telegram eller webben) men som systemet ännu inte har full täckning för i koden.

Varje gång en förfrågan faller utanför Jarvis befintliga verktyg loggas den automatiskt i databasen (`jarvis_capability_gaps`) och visas här som underlag för nästa utvecklingssession.

---

## 🔄 Hur cykeln fungerar

1. **Vardagsanvändning:** Jimmy frågar Jarvis om något nytt (t.ex. *"När ska bilen besiktigas?"*, *"Räkna ut elkostnad"*, *"Vad ska vi laga för mat på resterna i kylen?"*).
2. **Ärligt svar & loggning:** Jarvis svarar att funktionen inte stöds än, men bekräftar att den har sparats till utvecklingsbackloggen.
3. **Session start:** När vi påbörjar en session läser vi av nya loggade önskemål och väljer vad vi ska bygga in.
4. **Implementation & test:** Vi bygger det nya verktyget i `jarvis-agent.ts`, testar och markerar gapet som löst (`implemented`).

---

## ✅ Nyligen Implementerade & Slutförda Funktioner

* [x] **Telegram Påminnelser med schema-ankare & tidszoner:** "Påminn mig att köpa mjölk på fredag efter jobbet" eller "Påminn mig kl 20:00" skapar uppgift och pushar automatisk påminnelse till Telegram vid rätt klockslag svensk tid via den inbyggda bakgrundsmotorn.
* [x] **Morgon- & Kvällsbriefing i Telegram & Webb:** Fullt stöd för `/briefing`, `/morgonbrief`, `/kvallsbrief` och naturliga fraser ("God morgon Jarvis, vad har vi idag?", "Hur ser dagen ut?", "Kvällsavstämning", "Kvällsbrief"). Sammanfattar arbetspass, familj/skola, träningsfönster, 160g proteinmål & matlådor samt dagbok.
* [x] **Projekt 100 Före/Efter-kroppsscanning & Analys:** Interaktiv split/side/fade-jämförelse, tidsfilter (Start vs Senaste, 30d, 90d) och automatisk muskelökningsanalys (vikt vs midjemått).
* [x] **Röstinmatning & Tal-syntes i Telegram:** Röstmeddelanden i Telegram transkriberas via Whisper och besvaras med röstsvar (Onyx) och text.

---

## 📋 Identifierade funktionsområden för framtida utbyggnad

### 1. Bilen & Fordon (`car`)
- [ ] Besiktningstid & körförbudskoll.
- [ ] Påminnelse om däckbyte (vinterdäck/sommardäck lagkrav).
- [ ] Serviceintervall och mätarställningslogg.

### 2. Ekonomi & Hushållsavtal (`finance` / `house`)
- [ ] Elkostnadsberäkning & rörligt/fast elpris.
- [ ] Avtal, försäkringsnummer och bindningstider.
- [ ] Sophämtningsdagar och slamsugning.

### 3. Mat & Kylskåp (`nutrition`)
- [ ] "Kylskåpstömning": AI-förslag på middagar baserat på vad som finns i kylen/skafferiet.
- [ ] Automatisk inköpslista genererad från saknade basingredienser.

### 4. Barnen & Skola (`kids`)
- [ ] Lovdagar, studiedagar och schemabrytande aktiviteter från skolschemat.
- [ ] Packlistor för utflykter och idrottsdagar.
