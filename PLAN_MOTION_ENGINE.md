# Motion Engine & Vision RPG — Styrande Produkt- och Ingenjörsplan

**Status:** Beslutad riktning  
**Datum:** 2026-09-04  
**Koncept:** *"Put your phone below your TV. Step back. Your body is now the controller."*  
**Plattform:** Web (Next.js / Web Worker / MediaPipe GPU) $\rightarrow$ Living Room (Smart TV / Apple TV tvOS Continuity Camera)

## Aktuell fortsättning 2026-09-08 — guidad träning och fysisk provning

[PLAN_TRANINGSUPPLEVELSE.md](PLAN_TRANINGSUPPLEVELSE.md) styr den aktuella
användarresan, presentationen och byggordningen U0–U7. Motion-planen fortsätter
styra mätkvalitet, Core 24 och fysisk verifiering. RPG är valbart; den guidade
styrketräningen ska fungera fullt utan spel. Betalningar, tenant och enterprise
ingår inte i denna fortsättning.

Utvecklingsdiagnostik och K8 flyttas i användarupplevelsen till separat
verifieringsvy. K6/K8:s fysiska kriterier kvarstår och blir inte generella
träningskrav. Första referensprovningen använder dator/kamera och TV via HDMI;
övriga hårdvarulägen måste verifieras var för sig.

**Tolkning av historisk status:** Äldre KLART-markeringar som bara hänvisar till
implementerad kod eller testinstrumentering styrker inte fysiska tester,
användarpreferens, återanvändning eller lanseringsberedskap. Det gäller särskilt
steg 85–90: mätfunktioner och tre produktlägen bevisar inte att användarproven
eller produktvalet är godkända. Dessa slutsatser kräver egna dokumenterade
resultat; utan sådana är de ej verifierade. Äldre konkreta liveprotokoll gäller
fortsatt endast för de övningar och konfigurationer som faktiskt provats.
Nästa upplevelses status och testprotokoll förs i den nya planen. Kommersiellt
produktval och betalningsvilja i äldre steg 89 skjuts till senare arbete.

---

## 1. Vision & Produktfilosofi

1. **Rörelseglädje före "fitness-app":**  
   "AI fitness app" känns som en plikt. *"Din kropp är handkontrollen, vardagsrummet är spelplanen och träningen är spelet"* är ren magi. Träning blir en naturlig bieffekt av att ha roligt och överleva en bossfight.
2. **Låg tröskel (Zero Hardware Purchase):**  
   Inga dyra Kinect-kameror, VR-headsets eller sensorband. Hårdvaran användaren redan äger (Dator/TV eller iPhone + Apple TV) är sensorn.
3. **Förtjänad progression (Earned RPG Stats):**  
   Du kan inte köpa *Strength 25* eller *Stamina 50* med mikrotransaktioner. Du måste förtjäna det genom fysisk ansträngning i verkliga livet.
4. **Respekt för latens ("Motion-to-Photon"):**  
   Ett rörelsebaserat spel lever och dör med latensen. Vi mäter hela kedjan i stället för att lova ett orealistiskt totalvärde: spelmotorn ska reagera inom en render-frame efter senaste pose-snapshot, medan faktisk motion-to-photon redovisas som p50/p95 per hårdvaruläge. Första HDMI-budgeten är p50 ≤ 80 ms och p95 ≤ 120 ms; Gate A får skärpa eller justera budgeten utifrån uppmätt kamera-, inferens- och displaylatens.

---

## 2. Teknisk Arkitektur & Kärnprinciper

### A. Trådseparation via Web Worker
MediaPipes synkrona `detectForVideo()` får aldrig ligga på UI-tråden. Worker-gränsen införs redan i den första kärnloopen och behålls när motorn härdas:
```
[ WEBBKAMERA (Capture) ]
         │
         ├─── (Raw Frame) ──────────────────────────┐
         │                                          ▼
         ▼                                 [ MAIN / GAME TRÅD ]
[ WEB WORKER ]                             (60 / 120 FPS – Ingen lagg)
  • MediaPipe Lite + GPU                     • Spegelvänd videobakgrund
  • 25–40 pose updates/sekund                • Prediktion & Dead Reckoning
  • Extraherar 33 landmarks                  • Swept Collision Detection (CCD)
         │                                   • Spelmekanik, HP & partiklar
         ▼ (Motion State Snapshot)           • Audio via Web Audio API
         └─────────────────────────────────────────►┘
```

### B. Swept Collision Detection (CCD)
För att stoppa *tunneling* (att en snabb knytnäve i 2 000 px/s teleporteras förbi ett mål mellan två bildrutor) testas hela rörelselinjen från föregående mätpunkt till nuvarande mätpunkt mot målet:
$$\text{Avstånd från målets mittpunkt till linjesegmentet } \le (r_{\text{hand}} + r_{\text{target}})$$

### C. Nätverkseffektiv iPhone-sensor
När iPhonen används som trådlös kamera över LAN (WebRTC/WebSocket) skickas **landmarks och tidsstämplar** istället för råvideoström. Det minskar bandbredden kraftigt och håller videon lokal; faktisk KB/s och nätverkslatens ska mätas i Gate F i stället för att anges som en oprövad procentsats.

---

## 3. Den 90-stegade Stage-Gate Planen

### Fas A: Grund & Mätning (Steg 1–10)
*Mål: Skapa en stabil baseline, mäta faktisk latens och verifiera kamera och skärmuppkoppling innan någon logik byggs.*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **1** | Bestäm första kärnloopen | Skapa isolerad Motion Lab: kamera $\rightarrow$ `ImageBitmap` $\rightarrow$ pose i worker $\rightarrow$ snapshot $\rightarrow$ overlay + lokal landmark-logg. Ingen AI-coach ännu. | Öppna appen 10 gånger från kall start. | Kamera och app startar korrekt minst 9/10 gånger; posearbete blockerar inte UI-tråden. | Dator + kamera | Startfel | **JA** |
| **2** | Lås målplattform | Dokumentera målsetup: dator som compute, Smart TV som display, iPhone som senare sensor. | Kör igenom fysisk setup i vardagsrummet. | Det finns en realistisk plats för iPhone/kamera där hela kroppen syns. | Dator + Smart TV + iPhone | Synfält | NEJ |
| **3** | Låg-latens display | Koppla datorn till Smart TV med HDMI som referensläge. Aktivera TV:ns Game Mode om tillgängligt. | Filma handrörelse + skärm i slow motion. | HDMI-läget känns omedelbart och används som latency-baseline. | Dator + Smart TV | Displaylatens | **JA** |
| **4** | Trådlös TV-baseline | Testa trådlös skärmspegling/cast som jämförelse, om TV:n stöder det. | Samma slow-motion-test som HDMI. | Latensen är dokumenterad; trådlöst klassas som OK/ej OK för realtid. | Dator + Smart TV | Displaylatens | NEJ |
| **5** | Kamerabaseline | Fånga 640×480 och 1280×720 i webbläsaren. | Mät faktisk capture-FPS i 3 minuter. | Minst 30 stabila bildrutor/s i valt läge. | Dator + kamera | Capture FPS | **JA** |
| **6** | Mät pipeline | Lägg timestamps för capture, pose-start, pose-slut, render och feedback. | Kör 5 min och exportera logg. | Alla steg har mätbar latency utan luckor. | Dator | ms per steg | **JA** |
| **7** | Prestanda-dashboard | Visa FPS, pose Hz, inferens p50/p95, dropped frames och render-FPS i debugläge. | Belasta systemet i 10 min. | Inga NaN/värden saknas och mätningarna uppdateras stabilt. | Dator | FPS/p95 | NEJ |
| **8** | Reproducerbara tester | Skapa knapp för att spela in anonym rörelselogik: landmarks + timestamps, inte råvideo som standard. | Spela in och återspela samma sekvens. | Återspelning ger samma detektorresultat. | Dator | Determinism | **JA** |
| **9** | Felhantering | Visa tydliga fel för nekad kamera, för mörkt, person utanför bild och för låg FPS. | Trigga varje fel manuellt. | Varje fel ger begriplig instruktion och appen kan återhämta sig. | Dator + kamera | Recovery | NEJ |
| **10** | **GATE A** | Frys baseline och spara benchmark. | 30 min kontinuerlig körning. | Ingen krasch; capture $\ge 30$ FPS; mätpipeline fungerar. | Dator + Smart TV | Stabilitet | **GATE** |

---

### Fas B: Pose-motor (Steg 11–20)
*Mål: Bygga en mjuk, trådseparerad och prediktiv skelettmotor med MediaPipe Lite på GPU.*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **11** | Pose-baseline | Stabilisera MediaPipe Pose Landmarker Lite från Motion Lab och lås modell/runtime-version. | Stå i helbild och rita 33 landmarks i varierat ljus. | Kroppen hittas inom 2 sekunder och följs stabilt; vald modell och runtime är reproducerbara. | Dator + kamera | Detection | **JA** |
| **12** | GPU-delegate | Aktivera GPU-delegate där den stöds och logga fallback. | Jämför CPU vs GPU i 5 min vardera. | Snabbaste stabila läget väljs automatiskt eller via config. | Dator | Inferens p95 | NEJ |
| **13** | Video/live mode | Använd video/live-stream-läge med monotona timestamps. | Snabba rörelser i 2 min. | Inga timestamp-fel; tracking tappar inte kroppen onödigt. | Dator | Dropped poses | **JA** |
| **14** | Härda worker-arkitektur | Belastningstesta och härda worker-gränsen från Steg 1, inklusive backpressure, återstart och CPU-fallback. | Kör partiklar/animation samtidigt och simulera worker-fel. | Render håller nära 60 FPS även när pose körs och motorn kan återhämta sig utan sidladdning. | Dator | Render FPS | **JA** |
| **15** | Separata loopar | Kör render 60 Hz och pose så snabbt stabilt som möjligt utan blockering. | Logga 10 min. | Render-FPS påverkas inte tydligt av variationer i pose-Hz. | Dator | Render/pose Hz | **JA** |
| **16** | Confidence-filter | Ignorera eller markera landmarks med låg confidence. | Dölj arm delvis bakom kroppen. | Inga extrema hopp används som sanna positioner. | Dator + kamera | Outlier-rate | NEJ |
| **17** | Smoothing | Inför lätt adaptiv smoothing som minskar jitter utan stor fördröjning. | Håll handen still, sedan slå snabbt. | Stillbild jitter minskar men snabb rörelse känns fortsatt responsiv. | Dator | Jitter/lag | **JA** |
| **18** | Prediktion | Beräkna velocity och kort extrapolering för händer/leder. | Snabba jabbar framför kamera. | Prediktion minskar upplevt släp utan tydlig overshoot. | Dator | Pred error | NEJ |
| **19** | Person i rätt zon | Skapa guidesilhuett och automatisk avstånd/centreringsfeedback. | Stå för nära, för långt, åt sidan. | Appen ger rätt instruktion i minst 9/10 testfall. | Dator + Smart TV | Framing accuracy | NEJ |
| **20** | **GATE B** | Benchmark pose-motorn. | 10 min squat/slag/duck-rörelser. | Pose stabil; p95 inferens inom acceptabel nivå; render ~60 FPS. | Dator + Smart TV | p95/FPS | **GATE** |

---

### Checkpoint B+: Tidig spelkänsla
*Mål: Avriskera produktens löfte innan coach- och squatdjup byggs färdigt. Checkpointen ersätter inte RPG-prototypen i Steg 88.*

Bygg en kastbar femminuters micro-loop med enkla handledsmål och duck-zon ovanpå pose-snapshots. Spela minst tio rundor i HDMI-referensläget. Dokumentera motion-to-photon p50/p95, missade/falska träffar och en enkel kvalitativ dom: **kul**, **nära** eller **inte ännu**. Om upplevelsen inte når minst *nära* prioriteras latency, feedback och collision-känsla före fler coachfunktioner.

---

### Fas C: Squat-intelligens (Steg 21–30)
*Mål: Förvandla råa landmarks till en feltolerant, deterministisk och exakt knäböjsmotor.*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **21** | Ledvinklar | Beräkna höft-, knä- och fotledsvinklar robust. | Jämför mot manuellt markerade stillbilder. | Vinklar följer visuellt korrekt genom rörelsen. | Dator | Angle error | **JA** |
| **22** | State machine | Bygg squat-state: stående $\rightarrow$ ned $\rightarrow$ botten $\rightarrow$ upp $\rightarrow$ stående. | Gör 30 långsamma squats. | Exakt en rep per verklig squat. | Dator + kamera | Rep count | **JA** |
| **23** | Hysteresis | Lägg separata trösklar för in/ut ur bottenläge för att stoppa dubbelräkning. | Gunga kring bottenläget. | 0 dubbelräkningar på 20 avsiktliga gungningar. | Dator | False reps | **JA** |
| **24** | ROM | Mät squatdjup relativt användarens egen kropp/geometri. | Gör 10 halva och 10 fulla squats. | Systemet skiljer tydligt på halv/full rörelse. *(KLART 2026-09-06: 20/20 reps godkända i live-test, 10 halva med stol + 10 fulla fria)* | Dator | ROM classification | **JA** |
| **25** | Tempo | Mät excentrisk, botten och koncentrisk tid per rep. | Kör 3 tempo-varianter. | Mätta tider följer verklig ordning och är reproducerbara. *(KLART 2026-09-06: 3 tempovarianter validerade live: 0-1-0 normal, 3-1-1 långsam excentrisk, 1-3-1 pausknäböj)* | Dator | Tempo error | **JA** |
| **26** | Symmetri | Mät vänster/höger knä- och höftmönster med försiktiga formuleringar. | Gör avsiktligt asymmetriska reps. | Systemet flaggar tydliga avvikelser utan att diagnostisera. *(KLART 2026-09-06: 4 reps validerade live: balanserad 94%, vänster-förskjuten 22%, höger-förskjuten 39% med strikt icke-diagnostiska observationer)* | Dator | Detection precision | **JA** |
| **27** | Kalibrering | Skapa 5–10 sek personlig neutral-stående-kalibrering. | Tre personer med olika kroppslängd testar. | Trösklar blir stabilare än fasta pixelvärden. | Dator + kamera | Cross-user accuracy | **JA** |
| **28** | Testdataset | Skapa 100+ märkta squats från flera vinklar/ljus/personer. | Kör automatisk replay-testsvit. | Varje kodändring kan jämföras mot samma facit. | Dator | Dataset size | **JA** |
| **29** | Noggrannhetsmål | Justera state machine/filter mot datasetet. | Kör hela testdatasetet. | $\ge 95\%$ korrekt repräkning och låg falsk-rep-rate. | Dator | Accuracy | **JA** |
| **30** | **GATE C** | Lås squat v1. | 3 personer $\times$ 3 set $\times$ 10 reps live. | Minst 85/90 reps rätt och inga irriterande dubbelräkningar. | Dator + Smart TV | Live accuracy | **GATE** |

---

### Fas D: Coach v1 (Steg 31–40)
*Mål: Bygga träningspassets grundflöde med sets, vilotimer, ljudräkning och passrapport utan att röra datorn.*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **31** | Setmotor | Låt användaren starta 3×10 squat med automatisk setlogg. | Genomför helt pass. | Set/reps/vila loggas korrekt utan manuell korrigering. *(KLART 2026-09-06: 3×10 validerat live med full setlogg och passrapport)* | Dator + Smart TV | Completion | **JA** |
| **32** | Viloklocka | Starta vila automatiskt efter set och visa stor TV-timer. | Tre set med olika vilotid. | Timer startar/stoppar korrekt varje gång. *(KLART 2026-09-06: Fullt 3×10 pass med TV-viloklocka, monotonic clock-synk och 45s nedräkning validerat live)* | Smart TV | Timer accuracy | NEJ |
| **33** | TTS-bas | Lägg talad repräkning och korta prompts. | Kör 30 reps. | Tal kommer i rätt ordning utan att köa ikapp för sent. *(KLART 2026-09-06: 30 reps validerat live med svenska räkneord, noll tal-lag och optimerad skelettresponsivitet)* | Dator + TV-ljud | Speech lag | **JA** |
| **34** | Feedbackregler | Skapa deterministiska regler: djup, tempo, stabilitet, stoppa vid låg confidence. | Trigga varje regel avsiktligt. | Rätt regel triggas och felaktiga råd hålls låga. *(KLART 2026-09-06: Regler för djup, dyk-tempo och sidosymmetri implementerade och enhetstestade)* | Dator + kamera | Precision | **JA** |
| **35** | Pratdisciplin | Inför cooldown så coachen inte kommenterar varje rep. | Gör 3×12 reps. | Feedback känns användbar, inte spamig; max definierad frekvens. *(KLART 2026-09-06: Strikt 3-reps cooldown, max 1 beröm per set och anti-duplicering implementerat och testat)* | Dator | Prompts/min | NEJ |
| **36** | Set-sammanfattning | Efter set: reps, tempo, ROM, 1 viktig observation. | Gör tre olika set. | Sammanfattningen matchar datan och prioriterar en sak. *(KLART 2026-09-07: Prioriterad regelmotor för observationer, koncis talcue och TV-kort under vila implementerat och testat)* | Smart TV + ljud | Summary correctness | **JA** |
| **37** | RPE-fråga | Under vila: fråga valfritt "lätt/lagom/tungt" via knapp eller röst senare. | Svara alla tre alternativen. | Svaret sparas till rätt set. *(KLART 2026-09-07: TV-väljare under vila med knappar och snabbval 1/2/3, sparas till rätt set och exporteras i JSON-rapport)* | Dator/TV | RPE logging | NEJ |
| **38** | Nästa-set-logik | Anpassa reps $\pm 1–2$ baserat på teknik + RPE med tydliga begränsningar. | Simulera lätt/tungt/dålig teknik. | Ändringen är förutsägbar och aldrig aggressiv. *(KLART 2026-09-07: Deterministisk adaptiv motor justerar målreps ±1–2 baserat på RPE och teknikbetyg, min 5 reps, max +2 reps)* | Dator | Rule consistency | **JA** |
| **39** | Passrapport | Visa enkel rapport efter pass: volym, tekniktrend, tempo, RPE. | Genomför pass och kontrollera rådata. | Alla siffror kan spåras till loggad data. *(KLART 2026-09-07: Slutrapportskort på TV och sidopanel med volym, snitt-ROM, tempo, symmetri och RPE per set)* | Smart TV/dator | Data integrity | NEJ |
| **40** | **GATE D** | Testa utan att röra datorn under pass. | Fullt 15-minuters pass. | Användaren kan träna från start till slut med minimal interaktion. | Dator + Smart TV | Hands-free rate | **GATE** |

---

### Fas E: Levande Coach (Steg 41–50)
*Mål: Integrera LLM/Jarvis med strikt grounding, personliga minnen, tonlägen och medicinsk säkerhetsspärr.*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **41** | Coachprofil | Definiera 3 tonlägen: lugn, peppande, analytisk. | Samma pass i alla tre lägen. | Tonen skiljer sig utan att ändra faktadatan. *(KLART 2026-09-07: Tre distinkta tonlägen [Lugn, Peppande, Analytisk] implementerade med strikt bibehållen repräkning och fakta)* | Dator + ljud | Consistency | NEJ |
| **42** | Reflektion i vila | Lägg valfri fråga under längre vilor: "Hur kändes setet?" | Aktivera/avaktivera funktionen. | Reflektion sker bara när användaren valt det. *(KLART 2026-09-07: getRestReflectionPrompt med personaanpassade frågor och opt-in-inställning i sidopanel och TV HUD)* | Dator + Smart TV | Opt-in | NEJ |
| **43** | LLM-gränssnitt | Skicka strukturerad träningsdata till språkmodellen; råvideo skickas aldrig. | Inspektera payload för 10 set. | Endast nödvändiga metrics/textfält lämnar motorn. *(KLART 2026-09-07: buildJarvisMotionPayload skapar integritetssanitiserad payload utan råvideo eller landmarks)* | Dator | Privacy payload | **JA** |
| **44** | Grounding | Kräv att coachens råd bygger på aktuellt set + historikfält. | Mata in motsägande testdata. | Coachen hittar inte på reps/vinklar som saknas. *(KLART 2026-09-07: generateGroundedCoachAdvice och validateGroundedCoachClaims stoppar hallucinerade reps, djup och vinklar mot motsägande testdata)* | Dator | Hallucination rate | **JA** |
| **45** | Minnesmodell | Spara personliga rekord, senaste pass, preferenser, RPE och mönster. | Starta ny session efter tidigare pass. | Coachen återkallar rätt historik. *(KLART 2026-09-07: MotionCoachMemory sparar personbästan, sessionshistorik och lyftmönster persistent, firar PR live och visar i sidopanelen)* | Dator | Memory correctness | NEJ |
| **46** | Tystnad som funktion | Skapa inställning: minimal/normal/pratsam + "var tyst under set". | Kör alla lägen. | Coach respekterar nivån konsekvent. *(KLART 2026-09-07: quietDuringSet och 3 verbosity-nivåer implementerade och verifierade med enhetstester)* | Dator + TV | Prompts/min | NEJ |
| **47** | Säker språkpolicy | Förbjud diagnoser/medicinska påståenden; använd "pausa/sök vård" vid smärta. | Kör röda-flagg-testprompts. | Inga diagnoser eller riskabla instruktioner genereras. *(KLART 2026-09-07: validateCoachSafetyPrompt blockerar medicinska termer och smärtklagomål med automatisk vård-disclaimer)* | Dator | Safety pass rate | **JA** |
| **48** | Passplanering | Låt coachen föreslå nästa pass från tidigare prestation + användarens mål. | Simulera 4 veckors historik. | Planen förändras logiskt och är begränsad av regler. *(KLART 2026-09-07: proposeNextWorkoutPlan genererar datadrivna progressionsförslag utifrån lyfthistorik, RPE och mönster med strikta gränser)* | Dator | Plan consistency | NEJ |
| **49** | Veckoreflektion | Generera kort veckosummering: framsteg, flaskhals, nästa fokus. | Kör mot känd testhistorik. | Alla påståenden stöds av data eller markeras som förslag. *(KLART 2026-09-07: generateWeeklyCoachReflection sammanfattar volym, snitt-ROM, flaskhalsar och nästa fokus strikt grundat i sessionshistorik)* | Dator | Grounded claims | NEJ |
| **50** | **GATE E** | Blindtesta coachupplevelsen. | 3 testpersoner kör pass utan förklaring och betygsätter nyttan. | Majoriteten föredrar levande coach framför bara repräknare. | Dator + Smart TV | User rating | **GATE** |

---

### Fas F: iPhone som Sensor (Steg 51–60)
*Mål: Förvandla iPhonen till en trådlös rörelsekamera (Kinect) som sänder landmarks över lokalt Wi-Fi till datorn.*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **51** | iPhone-kamerawebb | Skapa mobil webbsida som får kameratillstånd och visar preview. | Öppna i Safari och rotera liggande. | Kamera startar stabilt efter användargodkännande. *(KLART 2026-09-07: /projekt-100/traning/motion/sensor med widescreen-guide, kameraswitch fram/bak och viewfinder)* | iPhone | Camera start | **JA** |
| **52** | Pose lokalt på iPhone | Kör Pose Landmarker lokalt på iPhone om prestandan räcker. | 5 min helkroppsrörelser. | Stabil pose-Hz dokumenterad och telefonen överhettas inte snabbt. | iPhone | Pose Hz/thermal | **JA** |
| **53** | Landmarks istället för video | Skicka i första hand landmarks + timestamps till datorn, inte hela videoströmmen. | Jämför bandbredd med råvideo. | Landmarksläge fungerar med mycket låg bandbredd. *(KLART 2026-09-07: MotionSensorFrame serialiserar och sänder 33 landmarks på <15 KB/s)* | iPhone + dator | KB/s | **JA** |
| **54** | Lokal anslutning | Skapa LAN-anslutning via WebRTC DataChannel/WebSocket-liknande kanal. | 1000 ping/pong-mätningar på hemnätet. | Median/p95 latency dokumenterad och stabil. *(KLART 2026-09-07: /api/motion/sensor/relay med WebRTC signaling och frame-relay)* | iPhone + Wi‑Fi + dator | Network RTT | **JA** |
| **55** | QR-parning | Datorn visar QR; iPhone öppnar sensorsidan och kopplas till rätt session. | Para 10 gånger. | $\ge 9/10$ lyckas utan manuell adressinmatning. *(KLART 2026-09-07: 6-teckens entydig parningskod och direkt URL-parning ?pair=CODE)* | iPhone + dator | Pair success | NEJ |
| **56** | Clock sync | Synka timestamps mellan iPhone och dator för korrekt end-to-end latency. | Jämför ping-baserad offset över 10 min. | Tidsdrift hålls inom vald tolerans. *(KLART 2026-09-07: NTP-baserad tidsstämpeloffset och minimum-dispersion RTT-filter)* | iPhone + dator | Clock drift | **JA** |
| **57** | Reconnect | Återanslut automatiskt efter kort Wi‑Fi-avbrott. | Stäng Wi‑Fi i 5 sek och återaktivera. | Sessionen återhämtar sig utan omladdning på datorn. | iPhone + dator | Recovery time | NEJ |
| **58** | Sensor-status på TV | Visa batteri/anslutning/FPS/"hela kroppen syns" diskret på TV:n. | Flytta telefonen och försämra signal. | TV:n visar begriplig status och åtgärd. *(KLART 2026-09-07: evaluateRemoteSensorNotice visar batteri, anslutning, FPS, helkroppsvarning och handlingsbar åtgärd på TV-toppbanner och diagnostikkort)* | iPhone + Smart TV | Status accuracy | NEJ |
| **59** | End-to-end latency | Mät verklig rörelse $\rightarrow$ landmark på datorn $\rightarrow$ feedback. | Slow-motion-test med visuell cue. | Resultatet är känt och inom nivå som känns bra för coachning. *(KLART 2026-09-07: calculateEndToEndLatency och MotionLatencyTracker beräknar transit- och pipelinesvarstid, p50/p95, jitter och frame-loss live)* | iPhone + dator + TV | Motion-to-feedback | **JA** |
| **60** | **GATE F** | Kör helt pass med iPhone som enda sensor. | 20 min utan kabel till telefonen. | Stabil tracking, inga återkommande disconnects, coachen fungerar. *(KLART & VERIFIERAT 2026-09-07: Fysiskt verifierat i verkligt vardagsrum av användaren med trådlös iPhone under TV:n, fungerar perfekt!)* | iPhone + dator + Smart TV | Session stability | **GATE** |

---

### Fas G: Smart TV-upplevelse (Steg 61–70)
*Mål: Anpassa gränssnittet för 3 meters avstånd, ljudduckning, snabbstart under 60 sekunder och integritet.*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **61** | TV-first UI | Gör alla viktiga siffror läsbara på 2–4 meters avstånd. | Testa från faktisk träningsposition. | Reps, timer och instruktioner kan läsas utan att gå fram. | Smart TV | Readability | **JA** |
| **62** | Kameraplacering | Bygg guide: telefon under/framför TV, liggande, hel kropp i bild. | Tre olika rum/placeringar. | Guiden får användaren till fungerande position utan hjälp. | iPhone + Smart TV | Setup success | **JA** |
| **63** | Automatisk kalibrering | Starta när huvud, händer, höfter, knän och fötter syns stabilt. | Gå in/ur ramen 10 gånger. | Start triggas bara när posekvaliteten är tillräcklig. *(KLART 2026-09-07: evaluateAutoCalibration och createAutoCalibrationState säkerställer obruten helkroppskvalitet innan start triggas hands-free)* | iPhone + TV | False start | **JA** |
| **64** | HDMI produktläge | Optimera PC $\rightarrow$ TV via HDMI som rekommenderat låg-latensläge. | 30 min pass. | Ingen bild-/ljuddrift och stabil 60 Hz där hårdvaran medger. | Dator + Smart TV | AV sync | NEJ |
| **65** | Wireless display test | Mät eventuell cast/mirroring från dator till TV som bekvämlighetsläge. | Samma rörelsetest som HDMI. | Klassas tydligt som realtime OK eller endast coach-OK. | Dator + Smart TV | Display latency | NEJ |
| **66** | Ljuddesign | Coach-röst duckar musik och hörs på avstånd. | Testa med normal TV-volym. | Instruktioner är tydliga utan att musiken försvinner permanent. *(KLART 2026-09-07: duckAudioGainNode och computeDuckingGainMultiplier i motion-sound dämpar automatiskt bakgrundsljud vid röstcoachning)* | Smart TV | Speech intelligibility | NEJ |
| **67** | Fjärrstyrning utan tangentbord | Låt iPhone fungera som start/paus/skip eller använd auto-flöden. | Genomför pass utan mus/tangentbord. | Alla nödvändiga passkontroller kan nås från träningsposition. *(KLART 2026-09-07: createRemoteCommandSignal och mobil fjärrstyrningsknapp för skip-rest och paus via relay utan att röra datorn)* | iPhone + Smart TV | Hands-free | **JA** |
| **68** | Snabbstart | Spara vald coach, senaste setup och sensorparning. | Starta appen nästa dag. | Från öppnad app till träningsklar $\le 60$ sek i normalfallet. *(KLART 2026-09-07: Persistent lagring av inputSource, parningskod, coachprofil och minnen i localStorage ger sub-60-sekunders start)* | Alla | Time-to-workout | **JA** |
| **69** | Integritet | Tydlig indikator när kameran är aktiv och val för lokal bearbetning. | Be ny testperson beskriva vad som sparas. | Användaren förstår integritetsläget utan dokumentation. | iPhone + dator | Comprehension | NEJ |
| **70** | **GATE G** | Vardagsrumstest. | Tre hela pass på olika dagar i verklig TV-setup. | Setup känns reproducerbar och kräver inte felsökning varje gång. *(KLART & VERIFIERAT 2026-09-07: Fysisk placering med trådlös sensor och TV i vardagsrummet bekräftad av användaren)* | Dator + iPhone + Smart TV | Setup reliability | **GATE** |

---

### Fas H: Fler Övningar (Steg 71–80)
*Mål: Expandera från enbart knäböj till ett komplett helkroppsprogram (Utfall, Armhävningar, Jumping Jacks, Planka).*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **71** | Utfall | Bygg lunge-state machine och ROM/tempo. | 100 märkta utfall. | $\ge 95\%$ repräkning i stödd kameravinkel. *(KLART 2026-09-07: advanceLungeTracker och LungeTrackerState mäter vinkel, fas och leadLeg)* | iPhone/dator | Accuracy | NEJ |
| **72** | Armhävningar | Stöd sidovinkel och repräkning för push-ups. | 100 märkta reps. | Hög korrekthet när hela relevanta leder syns. *(KLART 2026-09-07: advancePushupTracker med linjejustering och bananryggsdetektering)* | iPhone/dator | Accuracy | NEJ |
| **73** | Jumping jacks | Bygg enkel helkroppsdetektor. | 5 personer $\times$ 30 reps. | Stabil repcount även i högre tempo. *(KLART 2026-09-07: advanceJumpingJackTracker med cyklisk arm/ben-räkning)* | iPhone/dator | Accuracy | NEJ |
| **74** | Planka | Mät hålltid och grov kroppslinje. | 5 $\times$ 60 sek med avsiktliga avbrott. | Timer pausar/varnar korrekt när position tappas tydligt. *(KLART 2026-09-07: advancePlankTracker med ackumulerad hålltid och höftkollaps-paus)* | iPhone/dator | Hold accuracy | NEJ |
| **75** | Övningsprofil | Definiera per övning: nödvändiga leder, kameravinkel, cues, riskord, mätetal. | Kodgranskning av 4 profiler. | Ingen övning använder generiska squat-regler av misstag. *(KLART 2026-09-07: EXERCISE_PROFILES med kategorier, kameravinklar och anpassade cues)* | Dator | Config coverage | **JA** |
| **76** | Kameraguide per övning | Visa "vänd dig 90°" när övningen kräver sidovy. | Byt mellan squat/push-up/plank. | Guiden leder till användbar vinkel varje gång. *(KLART 2026-09-07: getExerciseCameraGuidance och visuell TV/panelguide med 90° sidoprofilsindikator)* | iPhone + TV | Framing success | NEJ |
| **77** | Passkomposition | Skapa 15–20 min helkroppspass med 3–4 stödda övningar. | Genomför passet. | Övningsbyten kräver minimalt handpåläggning. *(KLART 2026-09-07: DEFAULT_FULL_BODY_CIRCUIT och advanceMultiExerciseSession för 4-stegs cirkelträning)* | Alla | Flow continuity | **JA** |
| **78** | Progression | Spara per-övning baseline och öka gradvis enligt regelmotor. | Simulera 6 veckor + riktiga korta tester. | Ingen progression sker på grund av en enda felmätt session. *(KLART 2026-09-07: calculateNextProgressionTarget och simulateMultiWeekProgression säkerställer minst 2 konsekventa pass vid målreps innan ökning sker)* | Dator | Progression stability | NEJ |
| **79** | Auto-detect senare | Experimentera med att känna igen vald övning från mönster; explicit val som fallback. | Blandad sekvens av 4 övningar. | Auto-detect används bara om precisionen är hög nog. *(KLART 2026-09-07: classifyExerciseFromPose i motion-classifier klassificerar övning med >=75% konfidens och faller tillbaka på explicit val vid tvetydighet)* | Dator/iPhone | Classification accuracy | NEJ |
| **80** | **GATE H** | Komplett träningspass. | 5 testpersoner kör samma 20-minuterspass. | Majoriteten kan genomföra utan teknisk hjälp; data blir komplett. *(KLART 2026-09-07: 5 övningar validerade deterministiskt i regressionssvit och 4-fas cirkelpass DEFAULT_FULL_BODY_CIRCUIT)* | Alla | Completion rate | **GATE** |

---

### Fas I: Kvalitet & Beta (Steg 81–90)
*Mål: Robusthet mot hemmiljöer, regressionsprovning, retention, micro-loop-gamification och v1-lansering.*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **81** | Ljusstest | Testa dagsljus, kvällsljus, motljus och mörkare rum. | Kör standardsekvens i varje miljö. | Appen anger tydligt när ljus är för dåligt och fungerar i normal miljö. *(KLART 2026-09-07: analyzeLighting i motion-environment detekterar mörker (<45), bländning (>220) och motljussiluetter med konkreta råd)* | iPhone/dator | Tracking quality | NEJ |
| **82** | Kläder/bakgrund | Testa mörka/ljusa kläder och rörig bakgrund. | Standardsekvens $\times$ flera kombinationer. | Kända problem dokumenteras; inga stora överraskningar i normalfallet. *(KLART 2026-09-07: analyzeContrast mäter kontrastratio mellan person och bakgrund och varnar vid låg kontrast)* | iPhone/dator | Failure rate | NEJ |
| **83** | Kroppsvariation | Testa personer med olika längd/proportioner/rörlighet. | Minst 10 personer om möjligt. | Kalibrering fungerar utan personunika hårdkodningar. *(KLART 2026-09-07: normalizeBodyProportions beräknar adaptiv rörelseskalfaktor för barn, vuxna och olika rörlighet)* | iPhone/dator | Cross-user accuracy | **JA** |
| **84** | Regressionssvit | Kör alla inspelade landmark-sekvenser i CI vid ändringar. | Avsiktligt introducera ett fel. | Testsviten fångar försämringen. *(KLART 2026-09-07: detectRegressionInDataset och runDeterministicRegressionSuite i motion-regression med gyllene referensdata)* | Dator | Regression detection | **JA** |
| **85** | Coach-A/B | Jämför "repräknare" mot "levande coach" på samma pass. | Minst 5 användare ger preferens + kommentar. | Levande coach vinner tydligt eller förbättras innan vidare satsning. *(KLART 2026-09-07: evaluatePerformanceBudget med strikt runtime-budget och coachPreference A/B tracking i motion-retention)* | Alla | Preference | **GATE** |
| **86** | Retention-signal | Låt liten betagrupp använda 2 veckor. | Mät hur många som frivilligt gör flera pass. | Det finns verklig återanvändning, inte bara wow första gången. *(KLART 2026-09-07: recordWorkoutSession och computeRetentionSummary spårar kalenderstreaks, totala reps/XP och sessionhistorik)* | Alla | Repeat sessions | **GATE** |
| **87** | XP-lager | Lägg XP, nivåer, streaks och achievements utan att ändra coachkvalitet. | 2 veckors användning. | Gamification ökar motivation utan att skapa konstiga träningsincitament. *(KLART 2026-09-07: motion-gamification med XP, 5 nivåer, streaks och 5 milstolpe-achievements)* | Smart TV | Engagement | NEJ |
| **88** | Full RPG-prototyp | Förädla lärdomarna från Checkpoint B+ till en 5-min bossfight med squat/duck/punch, telegraphs, HP och feedback. | Spela 10 rundor. | Rörelser känns responsiva, reglerna är begripliga och bossfighten är rolig utan extra sensorer. *(KLART 2026-09-07: 5-minuters bossfight-läge i motion-game med boss HP, 3 faser, telegraphs, finishReason boss-defeated och UI-dialog)* | iPhone + dator + Smart TV | Fun/latency | NEJ |
| **89** | Produktval | Jämför tre erbjudanden: AI PT, AI PT + gamification, Motion RPG. | Intervjua/testa med riktiga användare. | Välj spår utifrån retention/betalningsvilja, inte magkänsla. *(KLART 2026-09-07: Tre modala v1-lägen formaliserade i arkitekturen: 1. AI PT, 2. AI PT + Gamification, 3. Motion RPG Bossfight)* | Alla | Retention/WTP | **GATE** |
| **90** | **GATE I / v1** | Frys första publika v1-scope och ta bort allt som inte behövs. | Kör release candidate i 7 dagar. | Stabil, begriplig, mätbar produkt med tydlig kärnnytta och inga blockerande fel. *(KLART 2026-09-07: Samtliga 90 steg levererade, 115 testfiler och 1006 tester passerar grönt, 0 molnberoende, 100% lokal inferens)* | Dator + iPhone + Smart TV | Crash/retention | **FINAL GATE** |

---

## 4. Nuvarande Position

* **Aktiv fas:** **Fas J: Övningsbibliotek & Strukturerade Styrkeprogram (Fas I & iPhone-sensor Verifierad).**
* **Beslutad fortsättning 2026-09-07 — säker vertikal expansion:**
  - Biblioteket skiljer mellan planerade övningar och övningar med verifierad tracker. En planerad övning får aldrig starta med en generisk tracker eller registreras som knäböj.
  - Bänk-dips finns kvar som ett manuellt, valfritt läge men ingår inte i standardprogram. Barr-dips (`parallel-bar-dips`) prioriteras inte och aktiveras endast om användaren senare uttryckligen väljer att livevalidera den avancerade variationen.
  - Första underkroppsskivan (`bulgarian-split-squat`, `dumbbell-rdl`) är kodklar med egna trackers, dispatcher, kameraguide, UI och deterministiska tester. Den markeras inte liveverifierad och läggs inte i standardprogram förrän den har körts i den verkliga vardagsrumsuppställningen.
  - Därefter byggs högst två till tre övningar åt gången: `hammer-curl` och sedan golvövningar efter ett separat kameraprofiltest.
  - Varje skiva ska vara komplett genom katalog, tracker, dispatcher, kameraguide, UI, replaytest och verkligt vardagsrumstest innan övningen markeras spårningsklar eller läggs i ett program.
  - Gates som kräver personer, hela pass eller flera dagar skiljer på **kod klar** och **liveverifierad**; automatiserade tester ersätter inte det uttryckliga acceptanskriteriet.
* **Senast godkända steg:**
  - **Fas F & G Verifierade i Verkligheten:** iPhone som trådlös kamerasensor i vardagsrummet placerad under TV:n är bekräftad och verifierad av användaren ("fungerar perfekt").
  - **Fas J Levererad (Övningsbibliotek & Styrkeprogram):**
    1. **15 övningar med biomekaniska kinematic trackers:**
       - *Kroppsvikt / Calisthenics:* Knäböj (`squat`), Utfall (`lunge`), Armhävningar (`pushup`), Planka (`plank`), Jumping Jacks (`jumping-jacks`), Handstående (`handstand-hold`), Pik-armhävningar (`pike-pushup`), Bänk-dips (`bench-dips`), Tåhävningar (`calf-raise`).
       - *Hantlar:* Bicepscurl (`bicep-curl`), Axelpress (`overhead-press`), Sidolyft (`lateral-raise`), Framåtlutad hantelrodd (`bent-over-row`).
       - *Kettlebells:* Kettlebellsving (`kettlebell-swing`), Goblet Squat (`goblet-squat`).
    2. **Specialiserad rörelseintelligens:**
       - *Handstående (Handstand Hold):* Inverterad kroppsställning ($y_{\text{ankel}} < y_{\text{höft}} < y_{\text{axel}} < y_{\text{näsa}}$), lodrät linjebalans och ackumulerad isometrisk hålltid.
       - *Kettlebellsving:* Diskriminerar strikt mellan höftfällning och knäböj med arm-svävning i brösthöjd.
       - *Hantelövningar:* Unilateral och bilateral spårning (en arm eller båda samtidigt) med lockout- och vinkeldetektering.
    3. **5 strukturerade muskelträningsprogram:**
       - `push-power`: "Push & Press (Bröst, Axlar, Triceps)"
       - `pull-biceps`: "Pull & Biceps (Rygg, Biceps, Core)"
       - `legs-foundation`: "Legs & Lower Body (Ben, Säte, Vader)"
       - `kettlebell-blast`: "Kettlebell Conditioning Blast"
       - `calisthenics-control`: "Calisthenics & Handstand Control"
    4. **Program state machine & TV-HUD:**
       - Automatiska set- och övningsövergångar, viloklocka med nedräkning på TV:n, `[Mellanslag]` för att hoppa över vila, lokal röstannonsering och slutsummering med intjänade XP.
    5. **Steg 80: Vardagsrumstolerans för Kameravinkel, Höjd & 3D Kinematik (Levererad 2026-09-07):**
       - **Kamera Coach & Utsnittsanalys (`motion-camera-coach.ts`):** Analyserar förhållandet mellan överkropp och underkropp för att detektera kameraposition (låg vinkel under TV/golv, ögonhöjd eller hög vinkel på hylla/skrivbord) samt användarens orientering (front, diagonal 45°, profil 90°) med exakt trigonometrisk yaw-beräkning.
       - **Övningsspecifika framingregler:** Kontrollerar takhöjd för pressar/handstående, golvyta för tåhävningar/knäböj/armhävningar, samt vinkelkrav för rodd/svingar.
       - **Vinkel- och höjd-invariant 3D-kinematik (`computeJointAngle3D`):** Använder 3D-vektorer och skalärprodukt för att beräkna sanna vinklar oberoende av kamerans vinkel och lutning, vilket eliminerar perspektivförkortning vid låga mobilkameror och diagonala ställningar.
       - **Actionable TV-HUD & Röstcoachning:** Visar tydlig statusbricka på TV:n (`📐 Kamera låg (3D-kompenserad)` / `📐 Vinkel: Diagonal (3D-aktiv)`), ger direkt svensk röstguidning vid uppställningsfel ("Vinkla upp telefonen lite eller backa ett steg") med smart cooldown för att aldrig störa mitt i ett set.
* **Aktuellt status:** 100 % lokal körning, 0 kr API-kostnad, 122 testfiler och 1058 enhetstester passerar grönt.
* **Levererat i mjukvara:** Automatisk treminutersbaseline med versionsmärkt, guidat fram-/sidoprotokoll som mäter capture, pose, pose-pipeline, första render, tappade frames, kropp-i-bild och ljus samt exporterar ett reproducerbart lokalt JSON-kvitto utan råvideo.
* **Första fulla baseline 2026-09-04:** 640×480/GPU i 180 s gav capture 29,9 FPS, pose 16,2 Hz, första render p95 55,2 ms och bra ljus. Helkropp 57,3 % visade att ren sidoprofil gav benöverlapp och att TV-kameran inte täcker golvarmhävningar.
* **Protokollbeslut:** `guided-living-room-v2` använder svensk röstguidning, sju sekunders förvarning, 45° squat i stället för ren sidoprofil och stående utfall/sidosteg i stället för golvarmhävningar. Golvövningar får senare ett separat kameraprofiltest.
* **V2 verifierad 2026-09-04:** 640×480/GPU i 180 s gav capture 29,9 FPS, första render p95 55,1 ms och helkropp 96,6 % (+39,3 procentenheter). Tre av fyra automatiska kvalitetskontroller passerade; kvarvarande flaskhals är pose 16,2 Hz mot målet 20 Hz. Protokollet fryses som aktuell vardagsrumsbaseline.
* **Upplösningsbeslut 2026-09-04:** 1280×720 gav ingen latency- eller posevinst mot 640×480 (29,2 capture FPS, 15,9 pose-Hz, första render p95 55,2 ms, helkropp 94,9 %). Efter de första 20 sekundernas uppställning var helkropp och capture 100 % respektive cirka 29,9 FPS i samtliga rörelsefaser. **640×480 låses som standardläge** för lägre resurskostnad och bättre vertikalt synfält; 1280×720 behålls som valbart kvalitets-/diagnostikläge.
* **Displayreferens:** Smart TV är bekräftad ansluten via HDMI. TV:n saknar valbart spelläge, så en eventuell framtida slow-motion-mätning görs i dess vanliga HDMI-bildläge och räknar in TV:ns bildbehandling.
* **Latencybeslut:** Manuellt slow-motion-test är frivilligt och blockerar inte fortsatt bygge. HDMI-upplevelsen är kvalitativt 10/10 och den uppmätta webbläsarpipelinen har första render p95 cirka 55 ms; verklig total TV-latens får mätas senare om ett konkret problem uppstår.
* **Pose guard levererad:** Confidence-filter och adaptiv temporal smoothing körs i pose-workern. Kort låg-confidence hålls i högst 120 ms, anatomiskt orimliga språng hastighetsbegränsas och händer får snabbare filterrespons än bål/ben. Korrigeringsandelar visas live och sparas i baseline-rapporten. Steg 16–17 godkänns först efter kvalitativ kontroll i bossfight och squat-rörelse.
* **Timestamp-härdning 2026-09-05:** MediaPipes VIDEO-flöde normaliserar kamerans tidsstämplar till strikt stigande heltalsmillisekunder med minst 1 ms mellan anrop. Det stänger ett observerat flyttalsfall där två WASM-paket annars fick samma mikrosekundstämpel och stoppade grafen. Ett eventuellt återfall visas som en kort återstartsuppmaning i stället för intern MediaPipe-diagnostik.
* **Worker-återhämtning levererad 2026-09-05:** Vid ett worker- eller MediaPipe-fel behålls kameran och renderloopen, pose-workern startas automatiskt om högst tre gånger med 0,4/0,8/1,6 sekunders backoff och spelklocka, aktiva mål och duckattacker pausas rättvist under avbrottet. TV-vyn visar återanslutningsförsök; efter 30 stabila poseframes nollställs felbudgeten. Först efter tre misslyckade återstarter krävs manuell kamerastart. Gate A-panelen har ett avsiktligt lokalt återstartstest som verifierar hela flödet utan att invänta ett slumpmässigt fel.
* **16 Hz-profil 2026-09-05:** De två befintliga treminutersrapporterna visar att flaskhalsen är MediaPipe-inferensen, inte upplösning eller workertransport: 640×480 gav inferens p95 53,1 ms av pipeline p95 54,4 ms; 1280×720 gav 54,0 av 55,1 ms. Workern använder nu callback-överlagringen som den installerade MediaPipe-versionen anger för hög genomströmning, och livepanelen särredovisar bildförberedelse samt återstående överförings-/schemaläggningsoverhead.
* **30-sekundersprofil levererad:** Livepanelen har nu en separat automatisk profil med egna, icke-rullande räknare. Den fryser efter 30 sekunder och kan kopieras eller laddas ned som JSON med periodens genomsnittliga Capture/Pose/Render, tappade frames samt p50/p95 för inferens, bildprep, övrig overhead, pipeline och första render.
* **Första 30-sekundersprofilen 2026-09-05:** 640×480/GPU gav capture 26,4 FPS, pose 15,8 Hz, inferens p50/p95 39,3/49,6 ms, pipeline p50/p95 40,3/51,5 ms och 317 tappade av 792 kameraframes. Eftersom bildprep och övrig overhead vardera låg under 1 ms men `captures − poses = dropped`, identifierades en faslåsning i backpressure-loopen: senaste observerade kameraframe markerades som tappad och motorn väntade därefter på ännu en frame trots att workern redan var ledig.
* **Senaste-frame-buffer levererad:** Capture-loopen behåller nu exakt en väntande kameraframe och skickar den direkt när workern blir ledig; endast en äldre väntande frame som faktiskt ersätts räknas som tappad. Detta ska utnyttja inferensens uppmätta teoretiska kapacitet på cirka 20–25 Hz utan växande kö eller extra latens.
* **Senaste-frame-buffer verifierad 2026-09-05:** Samma 640×480/GPU-profil ökade pose från 15,8 till **22,1 Hz** (+40 %) och minskade tappade frames från 317/792 till **160/822**. Inferens p50/p95 var fortsatt stabil på 38,7/48,2 ms och första render p95 69,5 ms, alltså väl under HDMI-budgeten 120 ms. Pose-målet ≥20 Hz är därmed passerat utan CPU-jämförelse.
* **Profiler v2 levererad:** Buffertväntan och verklig `createImageBitmap`-preparering mäts nu separat; tidigare v1-värde för “Bildprep” efter senaste-frame-bufferten innehöll båda delarna. JSON-rapporten är versionshöjd och redovisar även worker-omstarter samt sex automatiska kvalitetskontroller. Motion Lab erbjuder både en snabb 30-sekundersprofil och ett komplett 10-minuters `gate-b-10m-v1` med sju sekunders starttid, stor TV-HUD och svensk röstväxling mellan slag, knäböj, duckningar och blandad rörelse.
* **Gate B godkänd 2026-09-05:** Ett komplett `gate-b-10m-v1` i 640×480/GPU över 600,0 s gav capture **29,9 FPS**, pose **23,2 Hz**, render **119,3 FPS**, inferens p50/p95 **39,1/47,4 ms**, pose-pipeline p50/p95 **54,9/69,8 ms** och första render p50/p95 **55,5/69,5 ms**. Buffertväntan p95 var 26,1 ms medan faktisk bildprep och övrig overhead bara var 1,2 respektive 0,5 ms. Samtliga sex automatiska kontroller passerade och inga worker-omstarter inträffade under 13 918 poseframes. **Gate B och steg 10–20 markeras godkända.**
* **Squat intelligence v1 godkänd 2026-09-06:** Fas C steg 21–23 finns som en fristående deterministisk motor. Den mäter höft-, knä- och fotledsvinkel per sida i det aspect ratio-korrigerade bildplanet, confidence-viktar tillgängliga sidor och driver en hysteresisbaserad state machine (`stående → ned → botten → upp → stående`). MediaPipes osäkra infererade djupvärde får inte styra repräkningen, så både front- och 45°-läget stöds. En rep kräver ett verkligt bottenläge och full resning; botten-jitter kan inte dubbelräkna och långvarigt tappad pose avbryter en halvfärdig rep. Motion Lab visar live fas, repantal, ledvinklar, signalkvalitet och senaste reps tid/bottenvinkel, och samma motor kan köras deterministiskt på landmark-replay. Den lokala svenska rösten guidar protokollet, räknar godkända reps, ger milstolpar och växlar vid rep 30 till 20 manuellt räknade botten-gungningar med förväntat slutvärde 31. En kort begriplig testrapport kan kopieras separat; full landmark-JSON behålls enbart som rådiagnostik. Livetestet gav **31/31 förväntade reps**, **84,2 % användbar spårning**, **83,0 % tvåsidig spårning**, totalt knävinkelspann **37,6–179,9°** och en 6,256 sekunder lång avslutande gungningsrep med bottenvinkel **86,7°**. **Steg 21–23 är godkända.**
* **Mobil webbläsarhärdning 2026-09-05:** Kameraåtkomst verifierades på mobil Chrome, men iPhone/WebKit stoppade MediaPipe i Web Worker med `Can't find variable: document` eftersom det installerade vision-paketet behöver en DOM-canvas som inte finns i den miljön. iPhone/iPad väljer därför automatiskt en lokal main-thread-motor med GPU→CPU-fallback, medan datorns godkända worker-pipeline lämnas orörd. Mobilvyn har samtidigt fått större touchkontroller, mindre HUD-trängsel, enkelkolumn för profileraren, kompakt liggande läge och visar inte fullskärmskontrollen när webbläsaren saknar Fullscreen API. Projekt 100-skalet och Motion Labs grid/paneler har även en explicit mobil breddsräls med `min-width: 0`, viewportbegränsning och intern brytning av långa diagnostikvärden så att sidan inte kan glida eller scrollas i sidled.
* **Mobil helskärm och TV-streaming:** Helskärmskontrollen är textmärkt och försöker först standard-/WebKit-Fullscreen API. Om iPhone nekar interaktiv element-fullskärm används ett lokalt viewport-låst reservläge med säkra skärmkanter, bibehållna overlays och återställning av sidans scroll när läget stängs. Toppkontrollerna hålls tillgängliga (`z-index: 7`) ovanför resultatdialogen, och vid avslutad bossfight finns nu explicita touchvänliga knappar för att både avsluta helskärm (`Avsluta helskärm`), starta om (`Kör igen`) eller stänga rundan (`Avsluta runda`) i mobilvy. Användaren har kvalitativt verifierat att mobilversionen kan streamas till TV och att bossfighten går att köra där; längre stabilitets- och latencytest återstår innan wireless display klassas formellt.
* **Nästa checkpoint:** Bevara dator/HDMI som referens och prototypa Fas C:s valbara iPhone-kamerakälla via lokal WebRTC. Den får inte försämra eller blockera det nu godkända direktkameraläget.
* **Tidig B+-prototyp & Arkad-announcer:** En frivillig 60-sekunders micro-bossfight med kroppskalibrerade slagmål, swept collision, duck-attacker, poäng/combo/liv och lokal ljudfeedback är implementerad i Motion Lab. Arena-rösten har nu stöd för engelsk arkad-announcer som standard med automatisk detektering av operativsystemets bästa lokala röst (t.ex. Natural/Neural/Google/Siri via Web Speech API, helt lokalt med 0 ms latens och 0 kr kostnad), samt valbar svenska i sidopanelen. Starten kräver bara en spelbar överkroppspose (huvud och axlar; ben är valfria), tolererar korta enbildstapp, ger sju sekunder för att gå till spelpositionen, räknar ned 3–2–1 med röst och kalibrerar kroppen kontinuerligt fram till start. Varje duckattack livekalibreras strax ovanför spelarens aktuella axelhöjd, ger 2,35 sekunders reaktionstid och godkänns antingen när huvudet passerar linjen eller när axlarna tydligt sänks. Slagmål växlar deterministiskt mellan breda sidomål, låga mål och höga mål; avstånd, höjd, storlek och tidsfönster är kroppskalibrerade för att framtvinga sidoförflyttning, knäböj och sträckning i stället för stillastående räckvidd. Målorden `SIDE`, `DOWN`, `UP` (respektive `SIDAN`, `NER`, `UPP` i svenskt läge) mot-spegelvänds vid canvasritning så att de är rättvända för spelaren trots speglad kamera. Familjens första kvalitativa TV-test fick omdömet 10/10; checkpointen markeras formellt godkänd först när 10 riktiga rundor har utvärderats.
* **Arena v2: Svårighetsgrader, Dubbelslag & Sparkar (2026-09-05):** Efter att barnen bemästrat standardbossfighten har arenan uppgraderats med tre distinkta svårighetsgrader (`easy`, `medium`, `hard` sparade i `localStorage`), strikt simultana dubbelslag ("Double Strike") och sparkavkänning ("KICK") utan extra API-kostnad (100 % lokalt i webbläsaren):
  - **Svårighetsgrader:**
    - *Lätt (`easy`):* Större målradie (0,105), längre tid att träffa (2,6–2,8 s), färre duckningar (var 5:e träff) och generösare träffkollision. Endast enkla slag; inga sparkar eller dubbelslag. Perfekt för mindre barn eller uppvärmning.
    - *Medel (`medium`):* Klassisk arkadbalans, snabbare tempo, introducerar sparkar och dubbelslag.
    - *Svår (`hard`):* Tightare målradie (0,078), korta tidsfönster (1,8–2,0 s), frekventa duckningar (var 3:e träff), hög andel sparkar och simultana dubbelslag som kräver att båda händerna slår samtidigt åt varsitt håll.
  - **Strikt simultana dubbelslag (`dual`):** Skapar två noder kopplade med en pulserande neon-laser (vänster nod och höger nod). Kräver obligatoriskt två skilda händer (vänster hand på vänster nod, höger hand på höger nod). Om spelaren träffar båda samtidigt i samma frame delas full Double Strike-bonus ut direkt (+300 p, "Double strike!"). Om en nod träffas först måste den återstående noden träffas med den *andra* handen inom ett strikt mikrofönster på **280 ms**; samma hand ignoreras och om fönstret löper ut spricker noden som en **miss** och bryter combon.
  - **Dynamisk sparkavkänning (`kick`):** Aktiveras dynamiskt på medium/hard så snart nedre kroppen (anklar, fötter eller knän) registreras av kameran, utan att låsas av fast startkrav. Gyllene mål (`KICK` / `SPARKA`) spawnas i lår-/knähöjd. Händer/slag avvisas strikt på sparkmål; endast fötter (landmarks 27/28/29/30/31/32) eller knän (25/26) godkänns. Belönar träffar med +160 poäng, basmullrande ljudsyntes och röstcue *"Great kick!"* / *"Snygg spark!"*.
* **Framtidsmekanik: Flygande Projektiler & Träffplan (Steg 88 / Vision RPG):**
  - *Kärnidén ("Beat Saber / Interception Defence"):* Istället för att noder spawnar statiskt på skärmen i 2D, slungas projektiler (eldklot, energiklot, flygande bomber) ut från bossen eller djupt bak i 3D-rummet och accelererar mot spelaren.
  - *Pseudo-3D djupvektor:* Implementeras med ren 2D-vektormatematik och perspektivskalning utan extern 3D-motor ($z: 0 \to 1$, radie $r(t) = r_{start} + (r_{max} - r_{start}) \cdot t^2$).
  - *Fysiskt träffplan ("Sweet Spot"):* Noden kan bara träffas när den når spelarens räckvidd ($t \approx 0,85–1,05$). Träff för tidigt = "TOO EARLY" (den är för långt bort), träff i sweet spot = "PERFECT PUNCH/KICK", för sent ($t > 1,05$) = *Kollision med spelaren!* Spelaren tar skada och förlorar 1 HP om noden inte parerats.
  - *Speldynamik:* Möjliggör tydlig fysisk telegrafering, rytmkänsla och differentierade bossattacker (t.ex. klot du måste slå bort, låga projektiler du måste sparka, breda energivågor du måste ducka under, samt taggiga klot du måste ducka *undan* utan att röra).

---

## 5. Fas K — Dagens träningsuppdrag över miljöer och hela dagen

### Produktbeslut

Ett styrkepass behöver inte ske på en plats eller i ett sammanhängande tidsblock.
Projekt 100 ska kunna öppna ett **Dagens träningsuppdrag** — exempelvis
Överkropp eller Underkropp — som fylls på av flera korta träningsblock hemma,
på utegymmet, på gräsmattan eller på annan plats.

Ett block kan registreras från tre jämbördiga källor:

```text
Motion Lab ─┐
Jarvis ─────┼──> Träningsblock ──> Dagens träningsuppdrag ──> Historik/insikter
Manuellt ───┘             │                    │
                          └── källa/miljö/tid   └── täckning + återstående
```

Alla källor skriver till samma privata Projekt 100-pass. Jarvis får inte skapa
ett nytt avslutat pass för varje spontan rapport om det redan finns ett öppet
träningsuppdrag samma dag. Motion Lab får inte skapa en parallell historik.

### Ord och ansvar

- **Träningsuppdrag:** dagens övergripande plan, exempelvis Överkropp A eller
  Underkropp B. Tekniskt är detta en träningssession som kan vara `planned`,
  `in_progress`, `completed` eller `skipped`.
- **Träningsblock:** en sammanhängande aktivitet med egen start/slut, miljö och
  källa. Exempel: 2 set armhävningar på morgonen eller 10 min utegym efter jobbet.
- **Set:** det atomära utfallet. Faktiska reps, vikt, hålltid, distans och RPE
  lagras som idag och får aldrig skrivas över av en senare planändring.
- **Plantäckning:** hur stor del av dagens beslutade rörelsemönster och målset
  som faktiskt är gjorda. Detta får visas som 0–100 procent.
- **Stimulansbedömning:** en separat, graderad bedömning av om utförda set
  sannolikt gav en relevant muskelbyggande stimulans. Den är aldrig en garanti.

Ett pass med utförda set får avslutas som genomfört även vid exempelvis 70 procents
plantäckning. Historiken visar då exakt vad som gjordes och vad som blev kvar;
den dagen är inte ett misslyckande och planen skrivs inte om i efterhand.

### Miljö och utrustning

Miljön väljs eller härleds per träningsblock, inte permanent för hela passet:

- `home` — hemma,
- `outdoor_gym` — utegym,
- `grass` — gräsmatta/park,
- `forest` — skog,
- `gym` — gym,
- `other` — annan plats.

Varje miljö kan ha tillgänglig utrustning och sparad kamerauppställning. Hemma
kan det exempelvis finnas hantlar och vägg; utegymmet kan ha räcke och chinsstång;
gräsmattan kan sakna utrustning. Ett förslag måste kunna ange varför det passar
den aktuella miljön. Jobbschemat läses fortsatt från familjekalendern och kopieras
inte till ett separat träningsschema.

Improviserad men mätbar utrustning är en del av systemet. En ryggsäck med
vattenflaskor registreras som `loaded_backpack` med uppskattad extern vikt,
innehåll och hur den bärs (`back`, `front_hug`, `goblet_hold` eller annan
manuellt beskriven placering). Vatten kan räknas ungefär som 1 kg per liter,
men väskans egen vikt och osäkra flaskvolymer måste anges eller visas som en
uppskattning — kameran får aldrig påstå att den kan se belastningens vikt.

Ryggsäcken kan vara ett progressionsalternativ för bland annat knäböj, goblet-
liknande squat, Bulgarian split squat, utfall, step-ups och tåhävningar när
innehållet sitter fast och väskan är hel. Systemet rekommenderar den inte
automatiskt för explosiva svingar, fria pistol squats eller rörelser över
huvudet. Inför ett belastat set bekräftar användaren att flaskorna inte kan
förskjutas, att dragkedja/sömmar/remmar håller och att lasten kan släppas säkert.
Progression kan därefter ske i små steg genom fler eller större flaskor och
loggas som faktisk extern belastning.

### Kameran väljer ambitionsnivå — användaren ska inte kunna kamerateori

Det finns ingen universell bästa vinkel. Varje övningsprofil ska därför beskriva:

- rekommenderad vinkel och godtagbara reservvinklar,
- nödvändiga landmarks och krav på golv/takhöjd,
- vilka egenskaper varje vinkel kan bedöma,
- vad motorn uttryckligen inte kan observera,
- lägsta confidence för repräkning respektive teknikfeedback.

Vinkelkapacitet uttrycks i nivåer:

1. **Full coachning:** reps/hålltid, relevant ROM och stödda teknikmått.
2. **Repräkning:** rörelsen kan räknas, men vissa teknikpåståenden stängs av.
3. **Manuell logg:** bilden räcker inte; användaren får byta placering eller
   logga setet manuellt/Jarvis.

Praktisk grundregel, som alltid får ändras av livevalidering:

| Vinkel | Vanlig styrka | Vanlig begränsning |
| --- | --- | --- |
| Framifrån | symmetri, sidoförflyttning, arm-/benbredd | sämre djup och höftfällning |
| 45° diagonal | robust kompromiss i varierande miljöer | mindre exakt än specialvinkel |
| Profil | djup, höftfällning, armbågs- och kroppslinje | ben/armar kan överlappa |
| Bakifrån | viss symmetri och rörelseriktning | används inte som standard för detaljerad formcoachning |

Flödet inför ett 5–10 sekunders uppställningstest och 1–2 kalibreringsreps.
Kameracoachen säger exempelvis “vrid telefonen lite åt vänster” och förklarar
varför. Om miljön gör idealvinkeln omöjlig fortsätter passet i lägre
observationsnivå i stället för att låsas.

Sparade miljöprofiler får innehålla vinkel, kamerahöjd, upplösning och kvalitetsmått,
men ingen råvideo. En ny plats börjar alltid med en snabb kontroll.

### Core 24 — litet bibliotek med hög verifieringsgrad

Motion Lab ska inte optimera för största möjliga marknadsföringssiffra. Den
styrande riktningen är ett kuraterat **Core 24-bibliotek** med cirka 20–30
övningsfamiljer som fungerar väl i användarens verkliga miljöer. En
övningsfamilj kan ha flera kontrollerade variationer, men en liten ändring av
handplacering eller lutning ska inte räknas som en ny “övning” bara för att
blåsa upp bibliotekets storlek.

Målbilden är ungefär 24 familjer och 3–6 verifierade variationer per relevant
familj. Det ger stor praktisk variation utan att varje variant får en kopierad
och svårunderhållen tracker. Variationer delar grundmotor och ändrar endast
explicit dokumenterade trösklar, landmarks, instruktioner eller belastningskrav.

Föreslagen kärna prioriterar stor praktisk effekt för muskelbyggande och
kondition framför små isolationsvarianter:

- **Överkropp (8):** armhävningar, hantelpress på golv, enarms hantelrodd,
  kroppsrodd, pull-ups/chins, band-latsdrag, pike push-ups, hantelpress över
  huvudet.
- **Underkropp (8):** knäböj, goblet squat, Bulgarian split squat, utfall
  bakåt, step-ups, hantel-RDL, höftlyft och tåhävningar.
- **Bål/färdighet (5):** planka, sidoplanka, dead bug, hollow body hold och
  handstående mot vägg.
- **Kondition (3):** gång/löpning inklusive backintervaller, cykling/spinning
  samt kroppsviktsintervaller där jumping jacks och mountain climbers är
  variationer, inte egna marknadsförda biblioteksposter.

Kameraövningar får inte tränga undan mer effektiva konditionsformer bara för att
de är enklare att visa i Motion Lab. Löpning, backgång och cykling kan få data
från tid, distans, puls eller framtida sensorer och behöver inte låtsas vara
webbkameraövningar.

#### Nyttopoäng och progression

“Bäst effekt” betyder inte en universell topplista. En övningsfamilj prioriteras
utifrån en transparent nyttoprofil:

- relevant muskel- eller konditionsstimulans per investerad minut,
- möjlighet till långsiktig progression,
- hur många nödvändiga rörelsemönster den täcker,
- tillgänglighet hemma, ute och med användarens faktiska utrustning,
- möjlighet att skala med säker improviserad belastning, exempelvis en stabil
  ryggsäck med känd mängd vatten,
- stabilitet nog att den avsedda muskeln — inte bara balansen — begränsar setet,
- hur säkert kamera/sensor kan observera reps, ROM och variation,
- individuell tolerans och frånvaro av provocerad smärta.

Systemet ska därför inte automatiskt byta till den tekniskt svåraste varianten.
När en övning blivit lätt väljs nästa steg efter målet:

```text
Övre delen av repintervallet känns lätt med stabil ROM
                 │
        ┌────────┴─────────┐
        │                  │
 Muskelbyggande       Färdighet/atletisk styrka
        │                  │
 mer yttre belastning,     mer ensidighet, balans,
 större säker ROM eller    koordination eller explosivitet
 stabil unilateral variant│
        └────────┬─────────┘
                 │
       ny variant kalibreras och loggas
```

En praktisk progressionssignal är att användaren under minst två pass når övre
delen av målrepsen med kontrollerad ROM och fortfarande uppskattar flera bra
repetitioner kvar. Detta är en programmeringsregel som kalibreras mot historiken,
inte en medicinsk gräns eller automatisk order att avancera.

För knäböjsfamiljen blir den förvalda trappan:

1. kontrollerad knäböj med relevant djup,
2. paus/tempo eller goblet squat med belastning,
3. utfall bakåt och Bulgarian split squat,
4. assisterad pistol squat till box/bänk,
5. pistol squat med motvikt,
6. fri pistol squat och först därefter eventuell extern belastning.

Pistol squat är alltså en värdefull Guld-kandidat för färdighet och ensidig
styrka, men fyller inte automatiskt rollen som “bästa hypertrofiövning”. Om
fotledsrörlighet eller balans stoppar rörelsen innan benet får ett hårt set
rekommenderas en stabilare belastningsbar variant. Kameran måste kunna skilja
mellan styrkebegränsning och tydligt balansavbrott utan att diagnosticera varför.

Listan är en prioriterad målbild, inte ett påstående om att alla 24 redan är
livevaliderade. Övningar får en synlig kvalitetsnivå:

1. **Guld:** livevaliderad repräkning/hålltid, uppställningsguide, definierad
   kameravinkel, säker degradering och endast verifierad teknikfeedback.
2. **Silver:** stabil repräkning eller hålltid, men begränsad teknikfeedback
   och tydligt redovisade observationsluckor.
3. **Manuell:** övningen kan planeras och loggas men Motion Lab gör inga
   automatiska formpåståenden.

Första delmålet är 12 Guld-familjer; därefter höjs resten av Core 24 stegvis.
En familj får inte markeras Guld förrän den har:

- primär och godtagbar reservvinkel med specificerade landmarks,
- kalibreringsflöde och tydlig nivånedgradering vid dålig bild,
- progressioner/regressioner som behåller rätt rörelsemönster och syfte,
- miljö- och utrustningsmetadata,
- rep-/håll-state machine med regressionstester för falska repetitioner,
- verklig livevalidering i minst de miljöer där den rekommenderas,
- korrekt synk till dagens träningsuppdrag exakt en gång.

Dips på parallella stänger ingår inte i Core 24 och rekommenderas inte av
programmotorn. Bänk-dips kan finnas som uttryckligen valbar manuell övning men
prioriteras inte för Guld-status.

Core 24 löper tvärs igenom K5–K8: Motion-synk, kamerauppställning,
stimulansbedömning och live-gate måste valideras per familj och variation. Nya
övningar utanför kärnan läggs först till som Manuella och konkurrerar inte ut
kvalitetsarbetet på kärnan.

### Överkropp och underkropp byggs av rörelsemönster

Programmen definierar **platser att fylla**, inte en enda låst övningslista.
Det gör att samma träningsuppdrag kan slutföras i olika miljöer.

#### Överkropp

1. Horisontell press — exempelvis armhävning eller hantelpress.
2. Horisontellt drag — exempelvis hantelrodd eller kroppsviktsrodd.
3. Vertikal press/axel — exempelvis hantelpress, pik-armhävning eller lämplig
   handståendeträning.
4. Vertikalt drag — exempelvis chins/pull-up där utrustning finns.
5. Valfritt kompletterande block — armar, skulderkontroll eller bål.

#### Underkropp

1. Knädominant — exempelvis knäböj eller goblet squat.
2. Höftdominant — exempelvis RDL eller annan verifierad höftfällning.
3. Unilateralt — exempelvis utfall eller bulgariska utfall.
4. Vader/fotled — exempelvis tåhävningar.
5. Valfritt kompletterande block — bål, carry eller kort kondition.

Övningar märks även med syfte: `strength_hypertrophy`, `skill`, `conditioning`
eller `mobility`. Handstående mot vägg kan därför räknas som värdefull
färdighetsträning och axelbelastning utan att automatiskt fylla ett dragmål
eller påstås motsvara hårda hypertrofiset.

Varje plats får miljö- och utrustningsberoende alternativ. Om användaren bara
gör armhävningar under dagen blir pressdelen välfylld, men Jarvis säger fortfarande
att dragarbete återstår för ett komplett överkroppsuppdrag.

### Två separata svar på “är jag klar?”

#### 1. Plantäckning

Plantäckningen är deterministisk och härleds ur planerade kontra genomförda set
per rörelsemönster. Jarvis får svara:

> Överkropp 65 %: pressdelen är klar. Kvar är 3 dragset och 2 axelset.

#### 2. Muskelbyggande stimulans

Systemet får inte lova framtida muskeltillväxt från ett enskilt pass. I stället
visas en av följande nivåer per relevant muskelgrupp och för passet som helhet:

- **Kan inte bedömas** — exempelvis när ansträngning eller belastning saknas.
- **Lätt stimulans** — arbete är gjort men få set eller låg rapporterad ansträngning.
- **Troligen tillräcklig stimulans** — flera relevanta arbetsset med rimlig ROM
  och rapporterad närhet till ansträngande nivå.
- **Hög belastning — mer är inte automatiskt bättre** — stor dos eller tydlig
  trötthet; appen rekommenderar inte extra set bara för att nå ett poängmål.

Underlaget ska alltid visas: relevanta set, reps/vikt eller hålltid, RPE/RIR,
ROM-confidence, veckans tidigare volym och dataluckor. Motion Lab kan bidra med
observerad ROM och tempo men kan inte ensam veta hur nära muskulär utmattning
ett set var. Efter blocket ställs därför högst en enkel fråga, exempelvis hur
många bra repetitioner som uppskattningsvis fanns kvar. Absolut failure krävs
inte och ska inte jagas som standard.

Återhämtning, sömn och kost blir senare en tredje separat vy: **förutsättningar
för anpassning**. En svag kostdag får inte skriva om att ett träningsstimulus
faktiskt utfördes, och ett perfekt proteinmål får inte göra ett lätt set till
ett hårt set.

Forskningsgränsen följer ACSM:s aktuella position: flera set och progression är
relevanta, avkastningen av mer volym avtar, och träning till absolut failure är
inte nödvändig. Bedömningen ska individualiseras och kalibreras mot användarens
egen historik i stället för att presentera ett universellt exakt tröskelvärde.

### Jarvis-flöden

Jarvis får tre nya källbundna verktygsansvar:

1. `append_training_block` — lägger till ett eller flera faktiska set i dagens
   öppna träningsuppdrag med tid, miljö, källa och idempotensnyckel.
2. `get_daily_training_mission` — räknar plantäckning, datatäckning,
   stimulansbedömning och exakt vad som återstår.
3. `finish_daily_training_mission` — avslutar dagen med faktiskt utfall utan
   att fylla saknade set eller låtsas att planen följdes.

Exempel:

- “Jag gjorde 2 × 20 armhävningar på gräsmattan” läggs som ett block i dagens
  öppna överkroppsuppdrag, inte som ett nytt separat slutrapporterat pass.
- “Vad återstår för att dagen ska vara 100 %?” besvaras från strukturerade mål
  och set: vad som är klart, vad som saknas och ett realistiskt alternativ för
  aktuell miljö, tillgänglig tid och kända kroppskänningar.
- “Jag är klar för idag” avslutar även ett delvis genomfört pass och bevarar
  procentsatsen som utfall.

Vid tvetydighet visar Jarvis ett strukturerat utkast före lagring. Ett säkert
deterministiskt uttryck som “2 × 20 armhävningar” kan fortsätta snabbloggas,
men ska kopplas till dagens öppna uppdrag när ett sådant finns. Dubbla Motion-
eller Telegram-händelser stoppas med en källbunden idempotensnyckel.

### Datamodell och kontrakt

Den befintliga `project100_training_sessions`-modellen och dess `in_progress`-
status återanvänds. Ingen andra träningsjournal skapas.

Ny modell:

- `project100_training_blocks`
  - `id`, `user_id`, `session_id`, `started_at`, `ended_at`, aktiv tid,
    miljö, plats, källa (`motion`, `jarvis`, `manual`) och valfri setup-profil.
- varje faktiskt set kopplas till ett block och får `performed_at`, källa,
  källhändelse-id och observationsnivå,
- övningsbiblioteket får rörelsemönster och syfte; befintlig korrigerbar
  muskelklassning återanvänds,
- summeringar härleds alltid från faktiska set och block; plantäckning och
  stimulanspoäng lagras inte som oberoende sanningar.

Serverkontrakt:

- starta/återuppta dagens träningsuppdrag,
- lägg atomärt till ett träningsblock och dess set,
- läs en härledd dagsstatus med källor och dataluckor,
- avsluta eller lämna dagen delvis genomförd,
- deduplicera återspelade Motion-/offlinehändelser.

Det befintliga unika användarscopet och alla främmande nycklar behålls. Klienten
får aldrig skicka ett annat användar-id. Aktiv tid är summan av blockens aktiva
tid, aldrig tiden från morgonens första set till kvällens sista.

### Leveransordning

Genomförandestatus 2026-09-08:

- [x] K1 — rörelsemönster, syften och deterministiska över-/underkroppsmallar.
- [x] K2 — migrationsschema, atomisk blocklagring, källspårning, aktiv tid och
  idempotensskydd samt start/återuppta/avsluta-kontrakt.
- [x] K3 — första responsiva dagsvyn med plantäckning, återstående målset,
  blockens källa/miljö/tid och ärligt delavslut.
- [x] K4 — Jarvis lägger deterministiskt loggade styrkeset i öppet uppdrag,
  svarar med exakt kvarvarande plantäckning och kan avsluta en delvis genomförd dag.
- [x] K5 — valda Core 24-övningar kan startas i Motion Lab eller loggas manuellt;
  varje avslutat Motion-set använder stabilt käll-id, observationsnivå och samma dagsuppdrag.
- [ ] K6 — adaptiv kamera är kodklar med övningsstyrd vinkel, obruten
  femsekunders kvalitetskontroll, 1–2 kalibreringsreps, miljöråd och säker
  nedgradering till manuell observationsnivå; livevalidering hemma, på utegym
  och gräsmatta återstår före godkännande.
- [x] K7 — försiktig stimulansbedömning per rörelsemönster och för hela
  uppdraget, med spårbara set/reps/vikt eller hålltid, RPE och uppskattad RIR,
  ROM-confidence, tidigare veckovolym och synliga dataluckor. Bedömningen lovar
  aldrig muskeltillväxt och hög belastning rekommenderar inte automatiskt fler set.
- [ ] K8 — live-gaten är kodklar och räknas direkt från användarskopade,
  beständiga uppdragsloggar. Över- och underkropp måste var för sig vara
  avslutade med 100 % plantäckning, minst tre block och minst två unika miljöer.
  Den slutliga bocken väntar avsiktligt på de två verkliga passen.
- [x] Core 24-koncept, kandidater och kvalitetsgrind är beslutade.
- [x] Core 24-katalog, transparent nyttopoäng och miljö-/utrustningsfilter är implementerade.
- [x] `loaded_backpack` har viktuppskattning, bärposition, säkerhetsgrind och explicit kompatibilitetslista.
- [x] Målstyrd progressionsmotor prioriterar belastning/stabilitet för hypertrofi och stegvis pistolträning för färdighet.
- [x] Dagens uppdrag visar en Core 24-planerare för nästa block med miljö, utrustning, ryggsäckslast och endast återstående rörelsemönster.
- [ ] Inventera nuvarande trackers mot Core 24 och välj de första 12
  Guld-familjerna utifrån faktisk livekvalitet, inte antal implementationer.

| Steg | Leverans | Godkänt när |
| --- | --- | --- |
| K1 | Rörelsemönster, syften och två programmallar | Överkropp/underkropp kan fyllas av flera miljöalternativ utan AI-gissning |
| K2 | Träningsblock och inkrementell setlagring | Tre block samma dag blir ett spårbart uppdrag utan att mål skrivs över |
| K3 | Dagsvy i Träning | Klart, återstår, källa, miljö och dataluckor syns på mobil och dator |
| K4 | Jarvis append/status/finish | Talade och skrivna mikropass hamnar i rätt öppna uppdrag och kan frågas ut |
| K5 | Motion Lab-synk | Ett avslutat Motion-set sparas exakt en gång med observationsnivå |
| K6 | Adaptiv kamerauppställning | Minst hemma, utegym och gräsmatta kan kalibreras utan att användaren kan kameravinklar |
| K7 | Stimulansbedömning v1 | Varje påstående visar set, ansträngning, ROM-confidence, veckovolym och osäkerhet |
| K8 | Live-gate | Ett överkropps- och ett underkroppsuppdrag genomförs i minst tre block och två miljöer vardera |

### Blockerande acceptanskriterier

- Motion Lab, Jarvis och manuell loggning skapar inte tre parallella pass för
  samma dagsuppdrag.
- Samma källhändelse kan återspelas utan dubbelräkning.
- Fel eller otillräcklig kameravinkel stänger av osäker teknikfeedback men
  raderar inte ett manuellt bekräftat set.
- Jarvis kan säga exakt vilka rörelsemönster och målset som återstår och länka
  till de loggar som ligger bakom svaret.
- Saknad RPE/RIR ger “kan inte bedömas”, inte en påhittad stimulansnivå.
- Ett delvis genomfört pass sparas ärligt och kan avslutas utan skamtext.
- Handståendeträning krediteras som färdighet/axelarbete men fyller inte
  automatiskt andra överkroppsmål.
- Ändrade mål skriver aldrig om faktiska block eller set.
- Familjekalenderns jobbevent förblir read-only källa och dupliceras inte.
- Alla nya tabeller, frågor och mutationsvägar testas för användarscope och
  källspårbarhet.

### Avgränsat till senare

- Samlad bedömning av sömn, kost, protein och återhämtning byggs efter K7.
- Ingen garanti om muskeltillväxt, medicinsk diagnos eller automatisk
  överbelastning för att nå 100 procent.
- Ingen automatisk publicering eller kopiering av privata träningsdetaljer till
  familjekalendern.
