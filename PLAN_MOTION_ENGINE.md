# Motion Engine & Vision RPG — Styrande Produkt- och Ingenjörsplan

**Status:** Beslutad riktning  
**Datum:** 2026-09-04  
**Koncept:** *"Put your phone below your TV. Step back. Your body is now the controller."*  
**Plattform:** Web (Next.js / Web Worker / MediaPipe GPU) $\rightarrow$ Living Room (Smart TV / Apple TV tvOS Continuity Camera)

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
| **24** | ROM | Mät squatdjup relativt användarens egen kropp/geometri. | Gör 10 halva och 10 fulla squats. | Systemet skiljer tydligt på halv/full rörelse. | Dator | ROM classification | **JA** |
| **25** | Tempo | Mät excentrisk, botten och koncentrisk tid per rep. | Kör 3 tempo-varianter. | Mätta tider följer verklig ordning och är reproducerbara. | Dator | Tempo error | NEJ |
| **26** | Symmetri | Mät vänster/höger knä- och höftmönster med försiktiga formuleringar. | Gör avsiktligt asymmetriska reps. | Systemet flaggar tydliga avvikelser utan att diagnostisera. | Dator | Detection precision | NEJ |
| **27** | Kalibrering | Skapa 5–10 sek personlig neutral-stående-kalibrering. | Tre personer med olika kroppslängd testar. | Trösklar blir stabilare än fasta pixelvärden. | Dator + kamera | Cross-user accuracy | **JA** |
| **28** | Testdataset | Skapa 100+ märkta squats från flera vinklar/ljus/personer. | Kör automatisk replay-testsvit. | Varje kodändring kan jämföras mot samma facit. | Dator | Dataset size | **JA** |
| **29** | Noggrannhetsmål | Justera state machine/filter mot datasetet. | Kör hela testdatasetet. | $\ge 95\%$ korrekt repräkning och låg falsk-rep-rate. | Dator | Accuracy | **JA** |
| **30** | **GATE C** | Lås squat v1. | 3 personer $\times$ 3 set $\times$ 10 reps live. | Minst 85/90 reps rätt och inga irriterande dubbelräkningar. | Dator + Smart TV | Live accuracy | **GATE** |

---

### Fas D: Coach v1 (Steg 31–40)
*Mål: Bygga träningspassets grundflöde med sets, vilotimer, ljudräkning och passrapport utan att röra datorn.*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **31** | Setmotor | Låt användaren starta 3×10 squat med automatisk setlogg. | Genomför helt pass. | Set/reps/vila loggas korrekt utan manuell korrigering. | Dator + Smart TV | Completion | **JA** |
| **32** | Viloklocka | Starta vila automatiskt efter set och visa stor TV-timer. | Tre set med olika vilotid. | Timer startar/stoppar korrekt varje gång. | Smart TV | Timer accuracy | NEJ |
| **33** | TTS-bas | Lägg talad repräkning och korta prompts. | Kör 30 reps. | Tal kommer i rätt ordning utan att köa ikapp för sent. | Dator + TV-ljud | Speech lag | **JA** |
| **34** | Feedbackregler | Skapa deterministiska regler: djup, tempo, stabilitet, stoppa vid låg confidence. | Trigga varje regel avsiktligt. | Rätt regel triggas och felaktiga råd hålls låga. | Dator + kamera | Precision | **JA** |
| **35** | Pratdisciplin | Inför cooldown så coachen inte kommenterar varje rep. | Gör 3×12 reps. | Feedback känns användbar, inte spamig; max definierad frekvens. | Dator | Prompts/min | NEJ |
| **36** | Set-sammanfattning | Efter set: reps, tempo, ROM, 1 viktig observation. | Gör tre olika set. | Sammanfattningen matchar datan och prioriterar en sak. | Smart TV + ljud | Summary correctness | **JA** |
| **37** | RPE-fråga | Under vila: fråga valfritt "lätt/lagom/tungt" via knapp eller röst senare. | Svara alla tre alternativen. | Svaret sparas till rätt set. | Dator/TV | RPE logging | NEJ |
| **38** | Nästa-set-logik | Anpassa reps $\pm 1–2$ baserat på teknik + RPE med tydliga begränsningar. | Simulera lätt/tungt/dålig teknik. | Ändringen är förutsägbar och aldrig aggressiv. | Dator | Rule consistency | **JA** |
| **39** | Passrapport | Visa enkel rapport efter pass: volym, tekniktrend, tempo, RPE. | Genomför pass och kontrollera rådata. | Alla siffror kan spåras till loggad data. | Smart TV/dator | Data integrity | NEJ |
| **40** | **GATE D** | Testa utan att röra datorn under pass. | Fullt 15-minuters pass. | Användaren kan träna från start till slut med minimal interaktion. | Dator + Smart TV | Hands-free rate | **GATE** |

---

### Fas E: Levande Coach (Steg 41–50)
*Mål: Integrera LLM/Jarvis med strikt grounding, personliga minnen, tonlägen och medicinsk säkerhetsspärr.*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **41** | Coachprofil | Definiera 3 tonlägen: lugn, peppande, analytisk. | Samma pass i alla tre lägen. | Tonen skiljer sig utan att ändra faktadatan. | Dator + ljud | Consistency | NEJ |
| **42** | Reflektion i vila | Lägg valfri fråga under längre vilor: "Hur kändes setet?" | Aktivera/avaktivera funktionen. | Reflektion sker bara när användaren valt det. | Dator + Smart TV | Opt-in | NEJ |
| **43** | LLM-gränssnitt | Skicka strukturerad träningsdata till språkmodellen; råvideo skickas aldrig. | Inspektera payload för 10 set. | Endast nödvändiga metrics/textfält lämnar motorn. | Dator | Privacy payload | **JA** |
| **44** | Grounding | Kräv att coachens råd bygger på aktuellt set + historikfält. | Mata in motsägande testdata. | Coachen hittar inte på reps/vinklar som saknas. | Dator | Hallucination rate | **JA** |
| **45** | Minnesmodell | Spara personliga rekord, senaste pass, preferenser, RPE och mönster. | Starta ny session efter tidigare pass. | Coachen återkallar rätt historik. | Dator | Memory correctness | NEJ |
| **46** | Tystnad som funktion | Skapa inställning: minimal/normal/pratsam + "var tyst under set". | Kör alla lägen. | Coach respekterar nivån konsekvent. | Dator + TV | Prompts/min | NEJ |
| **47** | Säker språkpolicy | Förbjud diagnoser/medicinska påståenden; använd "pausa/sök vård" vid smärta. | Kör röda-flagg-testprompts. | Inga diagnoser eller riskabla instruktioner genereras. | Dator | Safety pass rate | **JA** |
| **48** | Passplanering | Låt coachen föreslå nästa pass från tidigare prestation + användarens mål. | Simulera 4 veckors historik. | Planen förändras logiskt och är begränsad av regler. | Dator | Plan consistency | NEJ |
| **49** | Veckoreflektion | Generera kort veckosummering: framsteg, flaskhals, nästa fokus. | Kör mot känd testhistorik. | Alla påståenden stöds av data eller markeras som förslag. | Dator | Grounded claims | NEJ |
| **50** | **GATE E** | Blindtesta coachupplevelsen. | 3 testpersoner kör pass utan förklaring och betygsätter nyttan. | Majoriteten föredrar levande coach framför bara repräknare. | Dator + Smart TV | User rating | **GATE** |

---

### Fas F: iPhone som Sensor (Steg 51–60)
*Mål: Förvandla iPhonen till en trådlös rörelsekamera (Kinect) som sänder landmarks över lokalt Wi-Fi till datorn.*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **51** | iPhone-kamerawebb | Skapa mobil webbsida som får kameratillstånd och visar preview. | Öppna i Safari och rotera liggande. | Kamera startar stabilt efter användargodkännande. | iPhone | Camera start | **JA** |
| **52** | Pose lokalt på iPhone | Kör Pose Landmarker lokalt på iPhone om prestandan räcker. | 5 min helkroppsrörelser. | Stabil pose-Hz dokumenterad och telefonen överhettas inte snabbt. | iPhone | Pose Hz/thermal | **JA** |
| **53** | Landmarks istället för video | Skicka i första hand landmarks + timestamps till datorn, inte hela videoströmmen. | Jämför bandbredd med råvideo. | Landmarksläge fungerar med mycket låg bandbredd. | iPhone + dator | KB/s | **JA** |
| **54** | Lokal anslutning | Skapa LAN-anslutning via WebRTC DataChannel/WebSocket-liknande kanal. | 1000 ping/pong-mätningar på hemnätet. | Median/p95 latency dokumenterad och stabil. | iPhone + Wi‑Fi + dator | Network RTT | **JA** |
| **55** | QR-parning | Datorn visar QR; iPhone öppnar sensorsidan och kopplas till rätt session. | Para 10 gånger. | $\ge 9/10$ lyckas utan manuell adressinmatning. | iPhone + dator | Pair success | NEJ |
| **56** | Clock sync | Synka timestamps mellan iPhone och dator för korrekt end-to-end latency. | Jämför ping-baserad offset över 10 min. | Tidsdrift hålls inom vald tolerans. | iPhone + dator | Clock drift | **JA** |
| **57** | Reconnect | Återanslut automatiskt efter kort Wi‑Fi-avbrott. | Stäng Wi‑Fi i 5 sek och återaktivera. | Sessionen återhämtar sig utan omladdning på datorn. | iPhone + dator | Recovery time | NEJ |
| **58** | Sensor-status på TV | Visa batteri/anslutning/FPS/"hela kroppen syns" diskret på TV:n. | Flytta telefonen och försämra signal. | TV:n visar begriplig status och åtgärd. | iPhone + Smart TV | Status accuracy | NEJ |
| **59** | End-to-end latency | Mät verklig rörelse $\rightarrow$ landmark på datorn $\rightarrow$ feedback. | Slow-motion-test med visuell cue. | Resultatet är känt och inom nivå som känns bra för coachning. | iPhone + dator + TV | Motion-to-feedback | **JA** |
| **60** | **GATE F** | Kör helt pass med iPhone som enda sensor. | 20 min utan kabel till telefonen. | Stabil tracking, inga återkommande disconnects, coachen fungerar. | iPhone + dator + Smart TV | Session stability | **GATE** |

---

### Fas G: Smart TV-upplevelse (Steg 61–70)
*Mål: Anpassa gränssnittet för 3 meters avstånd, ljudduckning, snabbstart under 60 sekunder och integritet.*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **61** | TV-first UI | Gör alla viktiga siffror läsbara på 2–4 meters avstånd. | Testa från faktisk träningsposition. | Reps, timer och instruktioner kan läsas utan att gå fram. | Smart TV | Readability | **JA** |
| **62** | Kameraplacering | Bygg guide: telefon under/framför TV, liggande, hel kropp i bild. | Tre olika rum/placeringar. | Guiden får användaren till fungerande position utan hjälp. | iPhone + Smart TV | Setup success | **JA** |
| **63** | Automatisk kalibrering | Starta när huvud, händer, höfter, knän och fötter syns stabilt. | Gå in/ur ramen 10 gånger. | Start triggas bara när posekvaliteten är tillräcklig. | iPhone + TV | False start | **JA** |
| **64** | HDMI produktläge | Optimera PC $\rightarrow$ TV via HDMI som rekommenderat låg-latensläge. | 30 min pass. | Ingen bild-/ljuddrift och stabil 60 Hz där hårdvaran medger. | Dator + Smart TV | AV sync | NEJ |
| **65** | Wireless display test | Mät eventuell cast/mirroring från dator till TV som bekvämlighetsläge. | Samma rörelsetest som HDMI. | Klassas tydligt som realtime OK eller endast coach-OK. | Dator + Smart TV | Display latency | NEJ |
| **66** | Ljuddesign | Coach-röst duckar musik och hörs på avstånd. | Testa med normal TV-volym. | Instruktioner är tydliga utan att musiken försvinner permanent. | Smart TV | Speech intelligibility | NEJ |
| **67** | Fjärrstyrning utan tangentbord | Låt iPhone fungera som start/paus/skip eller använd auto-flöden. | Genomför pass utan mus/tangentbord. | Alla nödvändiga passkontroller kan nås från träningsposition. | iPhone + Smart TV | Hands-free | **JA** |
| **68** | Snabbstart | Spara vald coach, senaste setup och sensorparning. | Starta appen nästa dag. | Från öppnad app till träningsklar $\le 60$ sek i normalfallet. | Alla | Time-to-workout | **JA** |
| **69** | Integritet | Tydlig indikator när kameran är aktiv och val för lokal bearbetning. | Be ny testperson beskriva vad som sparas. | Användaren förstår integritetsläget utan dokumentation. | iPhone + dator | Comprehension | NEJ |
| **70** | **GATE G** | Vardagsrumstest. | Tre hela pass på olika dagar i verklig TV-setup. | Setup känns reproducerbar och kräver inte felsökning varje gång. | Dator + iPhone + Smart TV | Setup reliability | **GATE** |

---

### Fas H: Fler Övningar (Steg 71–80)
*Mål: Expandera från enbart knäböj till ett komplett helkroppsprogram (Utfall, Armhävningar, Jumping Jacks, Planka).*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **71** | Utfall | Bygg lunge-state machine och ROM/tempo. | 100 märkta utfall. | $\ge 95\%$ repräkning i stödd kameravinkel. | iPhone/dator | Accuracy | NEJ |
| **72** | Armhävningar | Stöd sidovinkel och repräkning för push-ups. | 100 märkta reps. | Hög korrekthet när hela relevanta leder syns. | iPhone/dator | Accuracy | NEJ |
| **73** | Jumping jacks | Bygg enkel helkroppsdetektor. | 5 personer $\times$ 30 reps. | Stabil repcount även i högre tempo. | iPhone/dator | Accuracy | NEJ |
| **74** | Planka | Mät hålltid och grov kroppslinje. | 5 $\times$ 60 sek med avsiktliga avbrott. | Timer pausar/varnar korrekt när position tappas tydligt. | iPhone/dator | Hold accuracy | NEJ |
| **75** | Övningsprofil | Definiera per övning: nödvändiga leder, kameravinkel, cues, riskord, mätetal. | Kodgranskning av 4 profiler. | Ingen övning använder generiska squat-regler av misstag. | Dator | Config coverage | **JA** |
| **76** | Kameraguide per övning | Visa "vänd dig 90°" när övningen kräver sidovy. | Byt mellan squat/push-up/plank. | Guiden leder till användbar vinkel varje gång. | iPhone + TV | Framing success | NEJ |
| **77** | Passkomposition | Skapa 15–20 min helkroppspass med 3–4 stödda övningar. | Genomför passet. | Övningsbyten kräver minimalt handpåläggning. | Alla | Flow continuity | **JA** |
| **78** | Progression | Spara per-övning baseline och öka gradvis enligt regelmotor. | Simulera 6 veckor + riktiga korta tester. | Ingen progression sker på grund av en enda felmätt session. | Dator | Progression stability | NEJ |
| **79** | Auto-detect senare | Experimentera med att känna igen vald övning från mönster; explicit val som fallback. | Blandad sekvens av 4 övningar. | Auto-detect används bara om precisionen är hög nog. | Dator/iPhone | Classification accuracy | NEJ |
| **80** | **GATE H** | Komplett träningspass. | 5 testpersoner kör samma 20-minuterspass. | Majoriteten kan genomföra utan teknisk hjälp; data blir komplett. | Alla | Completion rate | **GATE** |

---

### Fas I: Kvalitet & Beta (Steg 81–90)
*Mål: Robusthet mot hemmiljöer, regressionsprovning, retention, micro-loop-gamification och v1-lansering.*

| Steg | Mål | Bygg / Ändra | Test | Godkänt när | Hårdvara / Läge | Primärt mätetal | Blockerar? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **81** | Ljusstest | Testa dagsljus, kvällsljus, motljus och mörkare rum. | Kör standardsekvens i varje miljö. | Appen anger tydligt när ljus är för dåligt och fungerar i normal miljö. | iPhone/dator | Tracking quality | NEJ |
| **82** | Kläder/bakgrund | Testa mörka/ljusa kläder och rörig bakgrund. | Standardsekvens $\times$ flera kombinationer. | Kända problem dokumenteras; inga stora överraskningar i normalfallet. | iPhone/dator | Failure rate | NEJ |
| **83** | Kroppsvariation | Testa personer med olika längd/proportioner/rörlighet. | Minst 10 personer om möjligt. | Kalibrering fungerar utan personunika hårdkodningar. | iPhone/dator | Cross-user accuracy | **JA** |
| **84** | Regressionssvit | Kör alla inspelade landmark-sekvenser i CI vid ändringar. | Avsiktligt introducera ett fel. | Testsviten fångar försämringen. | Dator | Regression detection | **JA** |
| **85** | Coach-A/B | Jämför "repräknare" mot "levande coach" på samma pass. | Minst 5 användare ger preferens + kommentar. | Levande coach vinner tydligt eller förbättras innan vidare satsning. | Alla | Preference | **GATE** |
| **86** | Retention-signal | Låt liten betagrupp använda 2 veckor. | Mät hur många som frivilligt gör flera pass. | Det finns verklig återanvändning, inte bara wow första gången. | Alla | Repeat sessions | **GATE** |
| **87** | XP-lager | Lägg XP, nivåer, streaks och achievements utan att ändra coachkvalitet. | 2 veckors användning. | Gamification ökar motivation utan att skapa konstiga träningsincitament. | Smart TV | Engagement | NEJ |
| **88** | Full RPG-prototyp | Förädla lärdomarna från Checkpoint B+ till en 5-min bossfight med squat/duck/punch, telegraphs, HP och feedback. | Spela 10 rundor. | Rörelser känns responsiva, reglerna är begripliga och bossfighten är rolig utan extra sensorer. | iPhone + dator + Smart TV | Fun/latency | NEJ |
| **89** | Produktval | Jämför tre erbjudanden: AI PT, AI PT + gamification, Motion RPG. | Intervjua/testa med riktiga användare. | Välj spår utifrån retention/betalningsvilja, inte magkänsla. | Alla | Retention/WTP | **GATE** |
| **90** | **GATE I / v1** | Frys första publika v1-scope och ta bort allt som inte behövs. | Kör release candidate i 7 dagar. | Stabil, begriplig, mätbar produkt med tydlig kärnnytta och inga blockerande fel. | Dator + iPhone + Smart TV | Crash/retention | **FINAL GATE** |

---

## 4. Nuvarande Position

* **Aktiv fas:** Fas A Gate A följs långsiktigt; Fas B (Pose-motor) är tekniskt godkänd och nästa bygge går vidare till Fas C.
* **Senast godkända steg:** **Steg 20 (GATE B)** — godkänt 2026-09-05 efter ett komplett 10-minuterstest i vardagsrumssetup med 6/6 automatiska kvalitetskontroller.
* **Aktuellt steg:** **Steg 21–22 (iPhone-kamerakälla och WebRTC-prototyp)**, utan att ersätta det fungerande dator/HDMI-läget.
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
* **Mobil webbläsarhärdning 2026-09-05:** Kameraåtkomst verifierades på mobil Chrome, men iPhone/WebKit stoppade MediaPipe i Web Worker med `Can't find variable: document` eftersom det installerade vision-paketet behöver en DOM-canvas som inte finns i den miljön. iPhone/iPad väljer därför automatiskt en lokal main-thread-motor med GPU→CPU-fallback, medan datorns godkända worker-pipeline lämnas orörd. Mobilvyn har samtidigt fått större touchkontroller, mindre HUD-trängsel, enkelkolumn för profileraren, kompakt liggande läge och visar inte fullskärmskontrollen när webbläsaren saknar Fullscreen API. Projekt 100-skalet och Motion Labs grid/paneler har även en explicit mobil breddsräls med `min-width: 0`, viewportbegränsning och intern brytning av långa diagnostikvärden så att sidan inte kan glida eller scrollas i sidled.
* **Nästa checkpoint:** Bevara dator/HDMI som referens och prototypa Fas C:s valbara iPhone-kamerakälla via lokal WebRTC. Den får inte försämra eller blockera det nu godkända direktkameraläget.
* **Tidig B+-prototyp:** En frivillig 60-sekunders micro-bossfight med kroppskalibrerade slagmål, swept collision, duck-attacker, poäng/combo/liv och lokal ljudfeedback är implementerad i Motion Lab. Arena-röst v1 ger disciplinerade svenska cues vid start, duck, combo-milstolpar, skada, halvtid, slutspurt och resultat; prioriterade cues bryter eventuell tal-kö. Starten kräver bara en spelbar överkroppspose (huvud och axlar; ben är valfria), tolererar korta enbildstapp, ger sju sekunder för att gå till spelpositionen, räknar ned 3–2–1 med röst och kalibrerar kroppen kontinuerligt fram till start. Varje duckattack livekalibreras strax ovanför spelarens aktuella axelhöjd, ger 2,35 sekunders reaktionstid och godkänns antingen när huvudet passerar linjen eller när axlarna tydligt sänks. Slagmål växlar deterministiskt mellan breda sidomål, låga mål och höga mål; avstånd, höjd, storlek och tidsfönster är kroppskalibrerade för att framtvinga sidoförflyttning, knäböj och sträckning i stället för stillastående räckvidd. Målorden `SIDAN`, `NER` och `UPP` mot-spegelvänds vid canvasritning så att de är rättvända för spelaren trots speglad kamera. Familjens första kvalitativa TV-test fick omdömet 10/10; checkpointen markeras formellt godkänd först när 10 riktiga rundor har utvärderats.
