# Granskning av träningsupplevelsen 2026-09-09

Granskad version: `09d8442`, inklusive implementationerna `43a6cea`, `291f022`
och `aabfee9`. Underlag: `PLAN_TRANINGSUPPLEVELSE.md`, befintliga huvudplaner,
källkod, lokal testkörning och isolerade reproduktioner i minnet.

**Dom: det återstår kodarbete. Det går inte att bekräfta att enbart fysiska
tester återstår.** En introduktionsdialog, välkomstyta, separat verifieringssida,
TV-komponenter och en brygga till träningsminnet har tillkommit, men flera
kritiska vägar uppfyller inte planens krav ännu.

Detta är en granskning; produktkoden har inte ändrats. Ingen kamera, TV eller
skarp databas har använts för att intyga resultat. En post i en statisk katalog
räknas inte som en färdig användarfunktion.

## Prioriterad restlista

P1 betyder att problemet bör rättas före godkännande av första kompletta passet
eller dataintegriteten. P2 är kvarvarande planarbete före att hela U0–U6 kan
markeras som genomförda. Det går fortfarande att göra avgränsade fysiska prov
av kamera och bild medan dessa problem rättas.

### P1 — föreslagna set markeras som genomförda före träning

`handleStartOnboardingWorkout` skapar ett utkast med `status: "completed"` och
förifyllda repetitioner, tider, belastningar och RPE. `handleUpdateSessionDraft`
sätter `done` utifrån om något sådant fält har innehåll. Därmed får det nya
träningsminnet gjorda set innan användaren utfört dem. Sparande av formuläret
skickar de förifyllda uppgifterna som faktiskt utfall.

Se [TrainingWorkspace.tsx](src/components/project100/TrainingWorkspace.tsx:1034)
och [startfunktionen](src/components/project100/TrainingWorkspace.tsx:1053).

Åtgärd: skilj planerade värden från bekräftat utfört arbete. Börja med noll
gjorda set; bekräftelse och fortlöpande lagring måste vara egna handlingar.
Testa start → paus utan träning → återuppta → delvis avslut.

### P1 — den manuella starten är fortfarande det gamla loggformuläret

"Starta träningen" anropar `setComposer("session")`. Användaren hamnar i
SessionComposer med alla övningar och loggfält, inte i en guidning av en övning
och ett set åt gången. U1:s instruktion, vila, byte och tydliga nästa steg är
därför inte levererade i den manuella vägen.

Se [startfunktionen](src/components/project100/TrainingWorkspace.tsx:1053)
och [SessionComposer](src/components/project100/TrainingWorkspace.tsx:345).

Åtgärd: bygg den faktiska guidade passvyn och använd samma sessionsidentitet vid
manuell träning, kamerahjälp och återkomst. Behåll loggformuläret för efterregistrering.

### P1 — kameravägen byter det föreslagna passet

Handståendets förslag skapas med `buildHandstandWorkout(1)`, men kameraknappen
länkar till `calisthenics-control`: pik-armhävningar, handstående och planka.
Det är inte introduktionsstegets handledsträning. Mjukstartens flerövningspass
länkar till enbart squat; styrkeförslaget länkar till ett annat fast program.
Länken stänger dialogen utan att lagra det valda förslaget.

Se [OnboardingWorkoutModal.tsx](src/components/project100/OnboardingWorkoutModal.tsx:76),
[kameraknappen](src/components/project100/OnboardingWorkoutModal.tsx:552)
och [Motion-programmen](src/lib/motion-programs.ts:77).

Åtgärd: överför samma valda övningar, mål och session till kameran. En övning utan
stöd ska fortsätta manuellt i samma pass. Testa nekad kamera före första setet.

### P1 — manuell återupptagning tappar vilka set som faktiskt gjorts

Motion-bryggan sparar både gjorda och återstående set med `done`. När ett
session-utkast återupptas kopierar `handleResumeSavedWorkout` inte `done` till
formuläret. Även återstående set har förifyllda mål. `submitSession` skickar alla
set via `apiExercises`, vilket kan göra ett delvis genomfört Motion-pass helt
genomfört i den manuella loggen.

Se [återupptagningen](src/components/project100/TrainingWorkspace.tsx:1085)
och [sparandet](src/components/project100/TrainingWorkspace.tsx:1239).

Åtgärd: bevara mål, faktiskt utfall och genomförandestatus genom hela kedjan.
Testa ett gjort set med flera återstående, växla till manuellt och avsluta.

### P1 — hålltid och träningsmätvärden blir missvisande

`convertProgramSessionToMemorySnapshot` använder `Math.round(seconds / 60)`.
En genomförd hålltid på 20 sekunder blir strängen `"0"` minuter och samtidigt
`"20"` reps i minnet. Den direkta API-vägen sparar däremot 20 sekunder.
Programmens uppskattade totallängd och `effort: 7` skickas som faktisk tid och
ansträngning även när underlaget bara innehåller ett enda set.

Se [bryggan](src/lib/project100-motion-bridge.ts:64)
och [API-konverteringen](src/lib/project100-motion-bridge.ts:205).

Isolerad körning av de riktiga konverteringsfunktionerna gav:

```text
Utfört: ett handstående på 20 sekunder.
Minnesväg: reps = "20", minuter = "0".
API-väg: hålltid = 20 sekunder, passlängd = 1320 sekunder, ansträngning = 7.
```

Åtgärd: bevara sekunder utan denna avrundning, skilj hålltid från reps, mät aktiv
tid och lämna saknad ansträngning okänd. Testa samma utfall genom båda vägarna.

### P1 — den nya Motion-sparningen skapar separat pass utan återförsöksskydd

`handleSaveSessionToLog` gör POST till `/api/project100/training/sessions`.
Den kopplar inte arbetet till ett öppet dagsuppdrag, och skickar ingen stabil
händelsenyckel. Serverns skapande genererar ett nytt sessions-id för varje POST.
Om servern sparar men svaret tappas kan ett återförsök skapa dubblett. Samma
arbete kan också hamna vid sidan av uppdragets befintliga blocklogg.

Se [MotionLab.tsx](src/components/project100/MotionLab.tsx:451)
och [serverns skapande](src/server/project100-training.ts:414).

Åtgärd: återanvänd uppdrag/block där det finns, behåll sessionsidentitet och
deduplicera återspelade händelser på servern. Testa förlorat svar efter lyckad
lagring och flera block från olika inmatningsvägar.

### P1 — nästa pass kan inte sparas efter det första i samma Motion-vy

`isSavedToLog` sätts till `true` efter sparandet och återställs aldrig till
`false` för ett nytt pass. Sparknapparna använder flaggan för att vara inaktiva.
Dessutom är sidopanelens sparknapp beroende av `workoutSession.completedSets`,
även när pågående arbete finns i `programSession`. Det hindrar den vägen för
delavslut av ett program.

Se [sparflaggan](src/components/project100/MotionLab.tsx:447)
och [sidopanelens sparknapp](src/components/project100/motion/MotionWorkoutPanel.tsx).

Åtgärd: bind sparstatus till rätt session/version. Testa två pass i samma vy
och delavslut av program med ett färdigt set.

### P1 — minnet raderas efter 24 timmar och start/stopp behöver skiljas från paus

Träningsminnet raderar ett äldre utkast automatiskt. En isolerad provning av
`loadWorkoutMemorySnapshot` med ett 25 timmar gammalt utkast gav `null` och
tog bort posten. Det strider mot kravet att visa ett gammalt utkast och låta
användaren avsluta det ärligt. Den nya bryggans fortlöpande sparning är lokal;
den är inte ett bevis på beständig serverlagring av varje set.

`toggleSquatTracking` skapar dessutom en ny session när spårningen aktiveras
igen. Start/stopp får därför inte användas som om det vore en bevarande paus.

Se [minnets livslängd](src/lib/project100-workout-memory.ts:98)
och [start/stopp](src/components/project100/MotionLab.tsx:1476).

Åtgärd: bevara bekräftat arbete, ha uttryckliga paus-/fortsätt-övergångar och
tydlig sparstatus. Testa återkomst efter mer än ett dygn och paus på samma sida.

### P2 — handståendets tio steg är en katalog, inte ett färdigt lärspår

Det finns data för tio steg och en byggfunktion. Den enda användarvägen anropar
alltid steg 1. Ingen ansluten väg för sparat aktuellt steg, kriteriebekräftelse,
avancemang eller återgång kunde hittas. Kamerapåståenden om exempelvis fri
svävtid och väggkontakt överstiger också vad den grundläggande inverterings-
och linjetrackern i sig visar.

Se [anropet](src/components/project100/OnboardingWorkoutModal.tsx:77),
[kursdata](src/lib/project100-handstand-track.ts)
och [trackern](src/lib/motion-library.ts:809).

Åtgärd: bygg en ansluten kursvy med sparad progression och skilj egen bekräftelse
från verifierad kameramätning. Granska kursinnehåll och mätpåståenden innan
användaren uppmanas att följa hela progressionen.

### P2 — förenklingen och personaliseringen är bara delvis gjorda

Välkomstytan ligger under ett sidhuvud som nu har sex handlingar. Dagsuppdrag,
statistik, mallar och historik visas fortfarande även vid första besöket.
Stimulansanalysen kommer fortfarande före nästa block. Översikten visar fortsatt
100 kg och fem pass som generella texter. Introduktionens svar finns bara i
dialogens komponenttillstånd och sparas inte som preferenser.

Se [TrainingWorkspace.tsx](src/components/project100/TrainingWorkspace.tsx:1327),
[DailyTrainingMission.tsx](src/components/project100/DailyTrainingMission.tsx:211),
[SoloView.tsx](src/components/SoloView.tsx:262)
och [introduktionens tillstånd](src/components/project100/OnboardingWorkoutModal.tsx:262).

Åtgärd: slutför tillståndsstyrd start, gradvis presentation och sparade val.
U4:s enkel/avancerad-växling, U5:s valbara lätta spelifiering och U6:s särskilda
återkomst-/vilodagsflöden behöver fortfarande implementeras eller knytas ihop.
Befintlig bossfight och detaljpaneler uppfyller inte ensamma dessa krav.

### P2 — förslagen går runt delar av den beslutade rekommendationsmodellen

Introduktionen skapar egna fasta listor och hårdkodar belastning och RPE. Den
läser inte användarens historik, erfarenhet eller befintliga känningar och
rekommenderar bänk-/stoldips som standard trots tidigare avgränsning. Påståendet
att mjukstart ger träning "utan träningsvärk" saknar grund i användarunderlaget.

Se [generateProposal](src/components/project100/OnboardingWorkoutModal.tsx:60).

Åtgärd: använd granskat Core 24-underlag, relevanta begränsningar och tydligt
separerade målvärden. Ta bort garantier och förifyllt utfall. Testa val av tid,
miljö, mål och kända begränsningar tillsammans.

## Bedömning per etapp

| Etapp | Granskningsbedömning |
| --- | --- |
| U0 | Delvis byggd. Separat verifieringssida finns; första skärmens tillstånd och förenkling återstår |
| U1 | Delvis byggd. Introduktionen finns; guidat manuellt pass och korrekt utfört arbete saknas |
| U2 | Delvis byggd. TV-vyer och länkar finns; rätt passöverföring och fallback behöver rättas före godkännande |
| U3 | Inte kodklar enligt acceptanskraven. Återupptagning, databevarande och deduplicering behöver rättas |
| U4 | Kvarvarande kod-/integrationsarbete samt verifiering |
| U5 | Befintlig RPG finns; det valbara sammanhängande upplevelselagret återstår |
| U6 | Kvarvarande arbete med vilodag, avslutad dag och återkomst |
| U7 | Nya användartester och vardagsprovning återstår; detta kan egna TV-prov inte ersätta |

Planens markeringar för U0–U3 bör inte användas som bevis på kodklar helhet.
Formuleringen "0 förlorade set" styrks inte av nuvarande implementation.

## Kontroller körda

- `node node_modules/vitest/vitest.mjs run --reporter=dot`: **128 testfiler
  godkända, 1001 tester godkända; 9 testfiler kunde inte laddas** eftersom
  `better-auth` eller `better-auth/crypto` saknas i den lokala installationen.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: stoppad
  av saknade lokala typfiler för `nodemailer` och `pg`.
- Isolerad exekvering av riktiga minnes-/bryggfunktioner bekräftade förlust av
  20 sekunders hålltid i minutkonverteringen och borttagning av gammalt utkast.

De lokala beroendeproblemen är separata från de konstaterade kodbristerna och
bevisar inte att samma installationsproblem finns i den driftsatta miljön.
Testsvitens befintliga gröna tester täcker inte hela användarkedjan ovan.

## Rekommenderad fortsättning

Rätta först uppdelningen mellan mål och faktiskt arbete, samma pass genom
manuell/kamera, och beständig återupptagning utan dubbletter. Slutför sedan den
guidade passvyn och dess enkla startsida. Kör kedjetester för start, avbrott,
fallback och delavslut innan U0–U3 på nytt bedöms som redo för godkännande.
Fortsätt därefter med U4–U6 och lärspåret. De fysiska testen behövs fortfarande,
men är inte den enda återstående arbetskategorin.
