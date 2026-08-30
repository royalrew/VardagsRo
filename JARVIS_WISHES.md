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
