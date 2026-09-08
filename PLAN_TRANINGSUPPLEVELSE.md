# Träningsupplevelsen — från första besök till hållbar träning

Datum: 2026-09-08  
Status: Plan framtagen på användarens uppdrag. Genomförande och verifiering återstår.  
Ägare: användaren  
Omfattning: Produktupplevelsen i Projekt 100, inklusive träning framför TV:n.

## 1. Uppdrag och avgränsning

Gör träningsdelen lätt att förstå, lätt att börja använda och värd att återvända
till. Nästa leverans ska vara en sammanhängande träningsupplevelse som användaren
kan prova fysiskt hemma. Planen är underlag för senare implementation; den innebär
inte att funktionerna nedan redan är byggda eller testade.

Kärnlöftet är:

> Bli starkare med träning som passar din dag. Träna sammanhängande eller i flera
> block — appen håller ihop planen och din utveckling. Spelglädje är valbar.

Första målgruppen är vuxna med oregelbunden vardag, från nybörjare till vana
motionärer som vill bygga styrka och muskler. Erfarna användare ska kunna styra
mer. Specialiserad elitidrott kräver senare val av idrott, tränarbehov och egen
validering; en avancerad vy är inte ett bevis på elitstöd.

Vid sidan av generell styrka och hypertrofi finns ett starkt intresse av att
faktiskt *lära sig något nytt* (inre motivation och motorisk bemästring).
Därför etableras ett tydligt avgränsat **färdighetsspår** (Skill Track), med exakt
en pilotövning till en början: **"Lär dig stå på händer"**. Här visar Motion Lab sin
starkaste sida genom att med kameran bedöma inverterad kroppslinje, axelstabilitet
och ackumulerad isometrisk hålltid.

**Utanför denna leverans:** Stripe, betalningar, abonnemangspaket, ny tenantmodell,
enterprise, organisationer, tränarportal, kommersiell lansering och betalningstest.
Ingen sådan infrastruktur behövs för att godkänna träningsupplevelsen. Befintlig
inloggning, användarisolering och integritet behålls. Ingen allmän ombyggnad av
kost, hushåll eller innehållsproduktion ingår.

### Förhållande till befintliga planer

- [PLAN_PROJEKT_100.md](PLAN_PROJEKT_100.md) styr datamodell, integritet,
  träningshistorik och kopplingen till befintlig familjekalender.
- [PLAN_MOTION_ENGINE.md](PLAN_MOTION_ENGINE.md) styr rörelsemätning, Core 24,
  kamerakvalitet och de tekniska och fysiska verifieringskraven.
- Detta dokument styr den aktuella användarresan, vad som visas när och
  byggordningen för förbättringen. Vid konflikt med äldre beskrivningar av en
  omfattande arbetsyta gäller denna plans gradvisa presentation för träningsflödet.
- Motion-planens spelvision gäller rörelsespelet. Den guidade styrketräningen
  har ett eget kvalitetskrav: begriplig, målstyrd träning även utan RPG.
- Läs [JARVIS_WISHES.md](JARVIS_WISHES.md) när Jarvis-flöden berörs. Bockar där
  eller i andra planer ersätter inte ett verifierat användarflöde.

## 2. Utgångsläge och prioriterade problem

Granskningen 2026-09-08 avsåg gränssnittskod och flöden, inte ett liveprov.

| Problem i nuvarande flöde | Beslut för förbättringen |
| --- | --- |
| Fem handlingar i träningssidans sidhuvud, två uppdragsstarter och 5+2-programmet konkurrerar | En rekommenderad huvudhandling utifrån användarens aktuella läge |
| Nytt pass öppnar ett formulär med Genomfört förvalt | Skilj Träna nu, Planera och Logga redan gjort med begripliga ingångar |
| K8, Live-gate och kodstatus visas på träningssidan | Flytta till separat verifieringsvy utanför normalt träningsflöde |
| Stimulansanalys visas före nästa träningsblock | Visa nästa övning först; underlag öppnas vid behov |
| Resan mot 100 kg och 5+2 presenteras generellt | Behåll personliga mål för den som valt dem; gör dem inte till allmänna krav |
| Tomma vyer ber användaren skapa mallar | Erbjud ett genomförbart första förslag och hjälp att förstå det |
| Tekniska ord, nytta/100 och kameraklassning kräver tolkning | Förklara vad användaren kan göra och vad mätningen klarar |

Viktigaste berörda filer är `TrainingWorkspace.tsx`, `DailyTrainingMission.tsx`,
`TrainingBlockPlanner.tsx`, `TrainingStimulusPanel.tsx`, `TrainingLiveGatePanel.tsx`,
`Project100Shell.tsx`, `SoloView.tsx`, `MotionLab.tsx` och komponenterna under
`src/components/project100/motion/`. Inventera befintliga vägar innan ändringar;
återanvänd fungerande träningslagring och återupptagning.

## 3. Produktregler

1. En tydlig huvudhandling per steg. Alternativ finns, men kräver inte att
   användaren först väljer mellan flera produktkoncept.
2. Visa information när den hjälper nästa beslut. En introduktionsdialog får
   inte följas av en full kontrollpanel.
3. Fråga bara efter sådant som påverkar nästa förslag eller övning. Spara
   relevanta val så att de inte måste anges varje gång.
4. Användaren bestämmer mål, detaljnivå och spelupplevelse oberoende av varandra.
5. Ge återkoppling på faktiskt arbete. Plan, utfört arbete, uppskattning och
   spelpoäng har olika betydelse och får aldrig blandas ihop.
6. Ett avbrott ska gå att återkomma från. Dagens avslut får vara delvis genomfört;
   framtida förslag får ändras utan att historiken skrivs om.
7. Kamera, röst och manuell registrering är likvärdiga sätt att bidra till
   träningsloggen. Deras observationsförmåga är olika och ska beskrivas ärligt.
8. Träningsglädje kan vara äventyr, gemenskap, skicklighet, koncentration eller
   tydliga framsteg. Samma belöningssystem passar inte alla.

## 4. Första resan — ett helt pass

### A. Första besöket

Visa ett välkomnande budskap och **Hjälp mig komma igång**. Sekundärt finns
**Jag har ett eget upplägg**. Inga tomma grafer, obligatoriska kroppsbilder,
viktmål, programinstallationer eller utvecklingspaneler krävs för att börja.

Introduktionen frågar en sak åt gången:

1. Vad vill du få ut av träningen? Komma igång, bli starkare, bygga muskler,
   lära mig något (stå på händer) eller osäker. Osäker leder till ett förklarat introduktionsförslag.
2. Var tränar du idag? Fråga bara om relevant utrustning. Kom ihåg vanliga miljöer.
3. Hur mycket tid har du just nu? Visa att tiden inkluderar rimlig förberedelse
   och vila, med ett tydligt ungefärligt tidsestimat.

Erfarenhet och relevanta begränsningar ska kunna fångas kort där de påverkar
första förslaget. Ingen svårighetsnivå får härledas enbart ur valt mål.
Uppgifter om känningar som redan finns ska användas; vid otillräckligt underlag
väljs en försiktig introduktion och användaren får enkelt byta eller avstå.
Vikt, detaljerad träningsprofil och veckoplan kan kompletteras efter första passet.

### B. Ett rekommenderat förslag

Visa passets syfte, ungefärlig tid, utrustning och en kort lista över övningarna.
Förklara med en mening varför det passar de angivna förutsättningarna.

Huvudknapp: **Starta träningen**. Sekundärt: **Anpassa**. Anpassning kan vara
kortare tid, annan övning eller annan miljö. Användaren behöver inte välja
överkropp/underkropp, malltyp eller kamera först.

Första förslaget ska komma från ett litet granskat upplägg med kända variationer.
Ett introduktionspass behöver inte täcka alla krav i ett ordinarie dagsuppdrag.
Representationen i befintlig sessionsmodell fastställs före implementation;
använd aldrig ett ändrat procentmål för att efteråt få passet att se komplett ut.

### C. Genomförande

Visa en övning åt gången: namn, enkel demonstration/instruktion, avsett antal
repetitioner eller hålltid och vad användaren gör sedan. Instruktionen ska fungera
även när kameran är avstängd. Teknikråd ska vara relevanta och verifierade.

- Kamera erbjuds som hjälp att räkna där stödet är verifierat.
- Manuell väg ger samma övningsguidning och ett enkelt sätt att bekräfta utfört set.
- Röst är ett komplement; nödvändiga handlingar ska också fungera utan mikrofon.
- Efter setet följer vila och nästa övning/set. Vilans slut är ingen order att
  fortsätta innan användaren är redo.
- RPE/RIR förklaras i vardagsspråk när uppgiften behövs. En nybörjares svar är
  osäkert underlag; ett överhoppat svar får inte bli ett påhittat värde.
- **Pausa**, **Byt övning** och **Avsluta för idag** är tillgängliga utan att
  träningsskärmen fylls av inställningar.
- Avslutade set ska sparas fortlöpande. Visa tydligt om sparandet inte lyckats.

### D. Avslut

Visa vad som faktiskt gjordes, ett begripligt nästa steg och en kort frivillig
återkoppling om upplevelsen. Mer statistik finns under **Visa detaljer**.
Undvik dubbel fråga om ansträngning redan registrerats i seten.

Ett delvis genomfört pass sparas som sådant utan skamtext eller krav på extra
repetitioner. Ingen garanterad muskeltillväxt eller exakt återhämtningstid härleds
ur ett pass. Eventuella prestationsjämförelser bygger på jämförbara loggar.

## 5. Återbesök och träning under dagen

| Tillstånd | Huvudhandling | Vad appen behöver förklara |
| --- | --- | --- |
| Ny användare | Hjälp mig komma igång | Att appen vägleder hela vägen |
| Pågående eller pausat pass | Fortsätt passet | Senast sparat arbete och nästa steg |
| Planerat pass idag | Starta dagens träning | Syfte, tid och eventuell relevant anpassning |
| Ingen plan idag | Få ett träningsförslag | Förslag utifrån mål, historik och dagens förutsättningar |
| Dagens träning avslutad | Visa dagens resultat | Vad som gjordes; ingen automatisk uppmaning till mer |
| Längre uppehåll | Kom tillbaka till träningen | Ett anpassningsbart förslag utan träningsskuld |
| Planerad vilodag | Se veckans plan | Vila är del av upplägget, ingen aktivitetsbrist |

Prioritera återupptagning när ett relevant pass pågår. Ett gammalt utkast får
inte för alltid blockera nästa förslag: visa datum och möjlighet att avsluta det
ärligt. Bestäm hur samtidiga äldre utkast och öppna dagsuppdrag hanteras innan
återupptagningsvägarna slås ihop.

**Uppdelning erbjuds som möjlighet.** Användaren kan göra nästa block senare med
annan utrustning. Appen ska minnas utfört arbete och bara föreslå relevant
återstående träning. Tre block betyder tre starter och kan innebära ny uppvärmning;
tidsestimat och guidning ska ta höjd för det. Utfört arbete från en annan aktivitet
får inte automatiskt fylla ett mål det inte motsvarar.

Manuell loggning, Jarvis och Motion ska skriva till samma relevanta session.
Samma händelse får inte räknas två gånger vid återförsök. Aktiv träningstid är
summan av blockens aktiva tid, inte tiden mellan morgonens och kvällens set.
När dagen tar slut sparas återstående mål som historiskt utfall; de flyttas inte
automatiskt som skuld. Träning runt midnatt måste använda befintlig tidszonslogik
och bevara passets identitet vid återupptagning.

Familjekalenderns befintliga jobbevent förblir read-only källa. Skapa ingen separat
jobbkalender. Avsaknad av arbetspass ska inte hindra ett träningsförslag.

## 6. Enkel vy, avancerad vy och navigation

Guidad vy är startläget. **Visa detaljer** finns där mer information kan hjälpa.
En erfaren användare kan välja **Eget upplägg / avancerad vy**, och valet sparas.
Valet kan ändras utan att träningsdata, mål eller pågående set ändras.

| Område | Guidad vy | Avancerad vy |
| --- | --- | --- |
| Före passet | Ett förslag med kort motivering | Egna mallar, planering, målset och variationer |
| Under passet | Övning, instruktion, reps/tid och vila | Valbara setdetaljer, belastning och ansträngning |
| Efter passet | Faktiskt resultat och nästa steg | Volym, trender, underlag, dataluckor och jämförelser |
| Anpassning | Några relevanta alternativ | Mer kontroll över upplägg och progression |

Även avancerad användning har en fokuserad träningsskärm framför TV:n. Utvecklar-
diagnostik är en separat verktygsvy och hör inte automatiskt till avancerad träning.

Träningens navigation prioriterar **Idag**, **Min träning** och **Utveckling**.
Befintliga övriga Projekt 100-sidor förblir nåbara, men behöver inte konkurrera
med träningshandlingen eller följa med in i TV-läget. Anpassa gemensam översikt
så att träningsingången blir tydlig utan en generell ombyggnad av hela produkten.

Språkexempel: "Plantäckning" blir "Gjort av dagens plan", "Motion Lab" kan i
användarflödet bli "Träna med kamera", och "ROM-confidence" förklaras under
kamerans mätunderlag. Dölj inte osäkerhet när den påverkar ett råd; gör den begriplig.

## 7. TV och kamera

Första referensmiljön är användarens faktiska dator, kamera och TV med HDMI.
Dokumentera utrustning, webbläsare, visningsläge och avstånd. iPhone-sensor är
en ytterligare konfiguration att verifiera, inte ett krav för första godkända passet.
Ingen ny TV-app, automatisk casting eller extra sensorer ingår som förutsättning.

- Guida uppställningen med en konkret instruktion åt gången: var kameran ska stå,
  hur användaren placerar sig och när den aktuella övningen kan observeras.
- Teknikval som upplösning får rimliga standardvärden; felsökning ligger separat.
- Be om kameratillstånd när användaren väljer kamerahjälp. Vid nekad åtkomst
  finns en tydlig väg att fortsätta manuellt utan att börja om passet.
- Kalibreringsrepetitioner ska hållas åtskilda från sparade arbetsset.
- Visa övning, reps/tid, vila och ett kort råd läsbart från träningsplatsen.
  Ljud kompletterar text och kan stängas av.
- Kartlägg varje nödvändig knapptryckning under ett riktigt pass. Första versionen
  väljer ett testat sätt att pausa/bekräfta från träningsplatsen med befintlig
  utrustning. Oprövad röst- eller geststyrning får inte antas lösa detta.
- Vid kameratapp pausas osäker räkning och feedback. Förklara hur användaren
  fortsätter och kan korrigera utfört arbete. Sparade set ska finnas kvar.

Latens och repnoggrannhet följer Motion-planens kriterier per konfiguration och
övning. Att en vy är läsbar på TV bevisar inte att mätningen är korrekt, och en
korrekt tracker bevisar inte att det är lätt att genomföra passet.

## 8. Core 24 och progression

Behåll riktningen 20–30 väl genomarbetade övningsfamiljer med relevanta variationer.
Antalet är en avgränsning för kvalitet, inte ett bevis på optimal träning.

Första kompletta användarflödet får använda ett mindre urval, exempelvis 3–5
redan lämpade övningar. Utöka efter att flödet fungerar; kräv inte 24 färdiga
kameratrackers innan första TV-testet. Motion-planens mål om 12 verifierade
Guld-familjer kvarstår som separat kvalitetsmål.

Inventera familjerna efter samma detaljnivå. Bedöm överlapp, rörelsemönster,
utrustning, träningsmål, långsiktig belastningsökning och möjliga alternativ.
Varje rekommenderad variant behöver instruktion, progression/regression och
tydlig beskrivning av vad kameran kan observera. Egna manuella övningar ska kunna
finnas utanför kärnan utan ogrundade mätpåståenden.

Guld/Silver/Manuell beskriver kamerastödets verifiering. De får inte presenteras
som en rangordning av träningseffekt. Nyttopoäng används i rekommendationsunderlag;
användaren får en konkret motivering framför ett ensamt "87/100 nytta".

Progression ska följa mål och historik. Svårare balansövning är inte automatiskt
bättre muskelträning. Föreslagna ökningar ska gå att förstå och ändra. Denna plan
föreskriver inga nya universella träningsdoser eller fysiologiska garantier.

### Färdighetsspår vs Muskelträning: Pilotspår "Lär dig stå på händer"
Att träna för att lära sig en specifik färdighet skiljer sig fysiologiskt och mentalt
från generell muskel- och volymträning. Därför hålls färdighetsspåret avgränsat:

- **Varför handstående?** Det är en klassisk kroppsviktsfärdighet som bygger axelstabilitet,
  båltryck och balans, och där datorseendet i Motion Lab är unikt starkt: kameran mäter
  inverterad kroppsställning ($y_{\text{ankel}} < y_{\text{höft}} < y_{\text{axel}} < y_{\text{näsa}}$),
  håller koll på lodrät linje, ackumulerar isometrisk hålltid i sekunder och ger direkta
  röst- och ljudcues vid milstolpar ("10 sekunder", "Bra balans!").
- **Strukturerad 10-stegs progression:**
  *Fas 1: Grundstyrka, leder och båltryck (På golvet)*
  1. *Handledspreparering & Rörlighet (Wrist Conditioning):* Vänja lederna vid 90° extension med kroppsviktbelastning. *Mål:* 60 s i fyrfota med 70 % kroppsvikt utan smärta. *Kamerastöd:* Guidat rörlighetsprotokoll.
  2. *Planka & Hollow Body (Core & Bäckenkontroll):* Motverka "bananrygg" genom posterior bäckenkippning och skulderelevation. *Mål:* 45 s Hollow Body Hold + 60 s strikt planka. *Kamerastöd:* Linjemätning och båltryck via befintlig `plank`-tracker.
  3. *Pik-ställning med upphöjda fötter (Box / Bench Pike Hold):* 90° vinkel mellan överkropp och ben med fötterna på bänk/stol. *Mål:* 3 set × 30 s med fullt sträckta armbågar. *Kamerastöd:* Vinkelanalys mellan bål och lår.
  4. *Pik-armhävningar (Pike Push-Ups):* Bygga vertikal press- och skulderstyrka. *Mål:* 3 set × 8 kontrollerade reps. *Kamerastöd:* Repräkning och bottenvinkel via `pike-pushup`-trackern.
  *Fas 2: Väggen – Raka linjer och rädslans upplösning*
  5. *Väggklättring (Wall Walk):* Fötterna klättrar uppåt längs väggen till 45° lutning. *Mål:* 3 kontrollerade klättringar upp och ner utan tappad bålspänning. *Kamerastöd:* Lutningsvinkel och stegvis höjdindikator.
  6. *Buken mot vägg (Chest-to-Wall Handstand):* Guldstandarden för rak linje. Näsa och tår touchar väggen lätt, axlar pressas mot öronen. *Mål:* 3 set × 30 s rak, obruten hålltid. *Kamerastöd:* Inverterad kroppsanalys och röstcues vid 10, 20 och 30 s.
  7. *Säker nergång – Piruetten (The Bail-Out):* Flytta en hand i sidled och vrida kroppen till mjuk landning på fötterna. Tar bort rädslan för att falla över. *Mål:* 5 godkända piruett-avstigningar åt båda håll utan tvekan.
  *Fas 3: Balans, fingertoppskänsla och fritt svävande*
  8. *Tå-släpp mot vägg (Wall Float / Toe Taps):* Lätta fingertopparna för att släppa tårna från väggen några centimeter och känna balanspunkten. *Mål:* Hålla 5–10 s fritt svävande balans. *Kamerastöd:* Automatisk tidtagning av den fria svävtiden.
  9. *Kontrollerad uppspark mot vägg (Kick-Up Control):* Mjuk uppspark med ett ben i taget så att hälarna fjäderlätt möter väggen utan krasch. *Mål:* 8 av 10 uppsparkar i lodlinjen på första försöket. *Kamerastöd:* Hastighets- och accelerationsbedömning vid väggkontakt.
  10. *Fritt handstående & Fingertoppsbroms (Freestanding Handstand):* Fritt stående med aktiva fingrar ("finger camber") som mikrojusterar balansen. *Mål:* 10–15 s fritt handstående med rak linje, kontrollerad andning och mjuk landning. *Kamerastöd:* Live balanstimer, lodrät balansmätare och milstolpesignal.
- **Bara 1 sak till en början:** Inga andra akrobatiska färdigheter (som hjulning, planche
  eller muscle-up) läggs till innan detta enda handståendespår är verifierat, begripligt och
  provat framför kameran.

## 9. Spelglädje och motivation

Spelvalet är oberoende av enkel/avancerad vy och behöver inte göras vid första
besöket. Erbjud ett prov när användaren förstår grundflödet.

| Upplevelse | Funktion | Träningsgräns |
| --- | --- | --- |
| Avskalat | Tydlig guidning, framsteg och valbar röst | Full träning fungerar utan spelbelöningar |
| Lätt spelifierat | Planerade steg för ett äventyr framåt | Vila och rimliga avslut bevarar progression |
| Rörelsespel/RPG | Kroppen styr en avgränsad spelrunda | Rörelser krediteras för det arbete som faktiskt registrerats |

Hård styrketräning får spelåterkoppling mellan set när det passar. Bossens behov
får aldrig kräva extra tunga reps, kortare vila eller att användaren ignorerar en
känning. Obegränsad träningsvolym ska inte vara vägen till obegränsad belöning.
Spelpoäng är spelpoäng, inte ett mått på muskelmassa eller idrottslig förmåga.

Första arbetet använder befintlig bossfight. Bygg inte ny värld, ekonomi eller
social plattform innan den befintliga rundan har provats. Bedöm respons,
begriplighet och lust att spela igen; nyhetseffekt och långvarig användning
redovisas separat. Gemenskap kan senare provas enkelt med frivilliga gemensamma
uppdrag, men är inget krav för denna leverans.

## 10. Designidéer att prototypa

Designriktningen ska provas tillsammans med flödet. Skisserna är koncept, inte
löften om funktioner eller slutliga skärmbilder. Återanvänd fungerande komponenter
och befintligt visuellt uttryck där det stödjer riktningen.

### Huvudidé: en lugn träningsstudio med ett valbart äventyr

Grundupplevelsen ska kännas trygg, varm och fokuserad. Ett stort dagens-förslag,
luft mellan innehåll och tydliga handlingar ger träningen huvudrollen. Den som
väljer RPG får en mer uttrycksfull inramning utan att lära om knappar eller flöde.

Tre visuella uttryck delar samma grund:

| Uttryck | Designidé | Lämplig användning |
| --- | --- | --- |
| Studio | Varma neutrala ytor, tydlig övningsdemonstration, få markeringar | Första besöket och avskalad träning |
| Resan | Ett diskret spår med milstolpar kopplade till egna mål och utförda pass | Veckoöverblick och lätt spelifiering |
| Arena | Mörk scen, tydliga mål, karaktär och korta effekter | Aktivt valt rörelsespel |

Detta är designuttryck inom samma produkt. De ska inte bli tre nya obligatoriska
val i introduktionen. Börja med Studio; erbjud Resan och Arena senare.

### Färg, typografi och ytor

Ett första färgprov utgår från varm ljus bakgrund `#F5F3EE`, mörk text `#202824`
och djupgrön handlingsfärg `#245746`. TV-läget prövas med mörk bakgrund `#111916`,
ljus text `#F2F5F0` och en mild grön accent `#9DD9AF`. RPG kan få en separat
violett/guldig accent för spelhändelser. Alla färgkombinationer ska kontrolleras
för kontrast innan de används; hexvärdena är förslag, inte verifierade tokens.

- Använd ett lättläst sans-serif-typsnitt, gärna projektets befintliga.
  Siffror för reps och vila ska hålla samma bredd så att vyn inte hoppar.
- Utgå från minst 16 px för normal brödtext på mobil. Prova omkring 28–36 px
  för TV-instruktion och 72–112 px för reps/vilotid på en 1080p-referensvy.
  Slutstorlek avgörs av faktiskt avstånd, upplösning och TV-test.
- Primärknappen får tydlig kontrast och text. Ikoner kompletterar orden.
- Gruppera relaterat innehåll med avstånd och få tydliga ytor. Undvik ett rutnät
  av små KPI-kort på första skärmen.
- Färg ska aldrig ensam bära status. Använd text och symbol för sparat, pausat
  och sådant som behöver åtgärdas. Fokusmarkering och tangentbordsordning behövs.
- Sikta på minst 44 × 44 CSS-pixlar för viktiga tryckytor. Kontrollera förstoring,
  kontrast enligt WCAG AA och att innehåll inte kräver sidscroll på mobil.

### Skiss A: första besöket

```text
Träning

Din första träning börjar här.
Vi hjälper dig välja övningar och visar hur du gör.

           [ Hjälp mig komma igång ]

              Jag har ett eget upplägg
```

En lugn illustration eller kort övningssekvens kan ge mänsklig närvaro. Den får
inte tränga undan startknappen eller se ut som att en viss kroppstyp krävs.
Undvik före/efter-bilder och stora viktmål som allmän välkomstbild.

Frågorna som följer får stora svarsknappar, enkel tillbaka-knapp och sparade svar.
Visa en kort framstegsindikator bara om antalet återstående steg är känt. Börja
inte en ny frågerunda varje gång användaren vill träna.

### Skiss B: Idag på mobil

```text
Hej! Här fortsätter din träning.

┌─────────────────────────────────────┐
│ Ditt förslag idag                    │
│ Styrka hemma                        │
│ Ungefär 20 min · hantlar             │
│ Anpassat efter det du gjorde senast. │
│                                     │
│          [ Starta träningen ]        │
│               Anpassa               │
└─────────────────────────────────────┘

Den här veckan
Två pass gjorda · Visa min utveckling

Idag          Min träning          Utveckling
```

Text, tid, utrustning och motivering är exempel och ska komma från det verkliga
förslaget. Ett pausat pass ersätter förslaget med ett kort **Fortsätt passet**.
Ett avslutat pass visar resultat och ger dagen ett tydligt slut. Övriga Projekt
100-områden nås via en diskret meny; bygg inte en extra bottennavigation ovanpå
den befintliga. Anpassa skalet för den aktiva arbetsytan.

### Skiss C: träningsläget framför TV:n

```text
Armhävning mot bänk                            Set 1 av 2

┌───────────────────────────────┐    Ditt set
│                               │
│ Kamera eller demonstration    │       6 / 8
│                               │
│                               │    Håll kroppen samlad.
└───────────────────────────────┘

        [ Pausa ]       [ Byt övning ]       Avsluta
```

Övning och mål är illustrativa. Vid manuell användning visas demonstration och
en tydlig knapp för att bekräfta/korrigera faktiskt genomfört set. Kameralägets
synliga räkning märks som uppskattad när kvaliteten inte räcker. Ingen siffra
ska fortsätta räknas som säker när kroppen tappas.

Vila får samma struktur med stor timer, nästa övning och möjlighet till mer tid.
Undvik menyer, diagram och långa teknikrapporter under arbete. Ett kort råd åt
gången. Låt användaren välja bort spegelbild och kroppens landmark-overlay utan
att själva guidningen försvinner.

Skärmkontrollerna kompletteras av den kontrollmetod som verifieras i U2. En stor
knapp på TV:n löser inte i sig att datorn står utom räckhåll.

### Skiss D: återkomst och ett pass i flera delar

```text
Du har redan gjort en del idag.

Morgon       Pressövningar        Sparat
Nästa block  Dragövningar         Förslag

             [ Fortsätt med nästa block ]
                Jag är klar för idag
```

Visa block som en enkel tidslinje först när det finns flera block. Den som tränar
sammanhängande behöver inte lära sig blockbegreppet. Veckovyn kan markera utfört,
planerat och vila med form, text och färg. Missade dagar behöver inte dominera
med röda luckor. Ett kort "Välkommen tillbaka" efter uppehåll ska följas av en
konkret handling, inte en lång motivationsmonolog.

### Skiss E: framsteg och RPG

I Resan kan ett genomfört planerat steg flytta en markör på en karta. En
milstolpe öppnar en kort berättelse eller kosmetisk belöning. Undvik tomma nivåer
som påstår att användaren blivit starkare utan jämförbara träningsdata.

I styrketräning kan ett färdigt set exempelvis bidra till ett gemensamt äventyr
eller en egen karaktärs resa. Belöningen visas efter setet och ska inte locka till
extra set. Börja med en egen resa; gemensamma uppdrag är en framtida idé och
kräver inte social infrastruktur nu.

I Arena prioriteras spelplanen, begripliga mål och tydliga tecken före en attack.
Paus ska vara tydlig även när spelet är intensivt. Effekter får aldrig täcka
kritiska instruktioner eller dölja att kameran tappat kroppen.

### Små detaljer som kan göra stor skillnad

- En diskret bekräftelse när ett set sparats; ett tydligt meddelande när det
  fortfarande väntar på att sparas. Ingen triumfeffekt innan lagringen lyckats.
- Kort ljudsignal som valbar återkoppling vid setslut, med motsvarande visuell
  signal. Undvik tal och ljudeffekter som pratar över varandra.
- Ett avslut med konkret framsteg: exempelvis fler reps vid samma belastning,
  om jämförelseunderlaget faktiskt finns. Annars räcker en ärlig summering.
- Respektera minskad rörelse. Animationer är korta, valbara och blockerar aldrig
  nästa handling. Spel och kamera måste behålla respons även med effekter.
- Detaljer öppnas i en tydlig fördjupning och kan stängas så att användaren
  kommer tillbaka till exakt samma träningssteg.

### Designleverans och granskning

I U0 tas enkla klickbara skisser fram för nytt konto, återbesök och pausat pass,
samt aktiv träning och vila på TV. Prova mobil omkring 390 px bredd och TV i
1080p med faktisk skalning. Börja med standardkomponenter; beställ inte ett stort
bildbibliotek innan layouten och flödet fungerar.

U1 får en liten gemensam uppsättning designvärden för färg, text, avstånd,
knappar och tillstånd. U2 testar läsbarhet och styrning på riktigt. U5 tillför
Resan/Arena utan att ändra grundnavigationen. Dokumentera vald riktning och
avvisade alternativ kort, med observerade problem som skäl.

Granska varje skärm med samma frågor: Vad ska jag göra nu? Förstår jag orden?
Kan jag läsa och nå kontrollerna i min träningsmiljö? Vet jag vad som är sparat?
Finns något här som kan vänta tills jag ber om det?

## 11. Byggordning och godkännanden

Alla etapper börjar som **Ej verifierade**. Befintlig kod återanvänds där den
fungerar; en etapp handlar om slutresultatet, inte om att skriva om allt.

| Etapp | Konkret leverans | Godkänd när | Beroende |
| --- | --- | --- | --- |
| U0: Avgränsa och städa ingången | Tillståndskarta, en huvudhandling, separerad diagnostik och personliga standardmål | Varje tillstånd i avsnitt 5 har bestämd väg; utvecklingskrav ligger utanför träningen | Ingen |
| U1: Första kompletta passet | Kort introduktion, granskat förslag, instruktion, manuell setbekräftelse och avslut | Ett riktigt introduktionspass går att genomföra och läsa tillbaka; inget krav på kamera eller färdig profil | U0 |
| U2: Guidad träning framför TV | Kamera, kalibrering, läsbar träningsskärm och testad kontrollmetod | Användaren genomför första hela TV-passet och provar nekad kamera och kameratapp; resultat dokumenterat | U1 |
| U3: Avbrott och flera block | Återupptagning, ändrad miljö, delavslut och gemensam logg från manuell/Motion/Jarvis | Ett verkligt uppdelat pass sparas rätt; omladdning och återförsök ger inga tappade bekräftade set eller dubbletter | U1; U2 för kameradelen |
| U4: Fördjupning och progression | Enkel/avancerad presentation, egna upplägg och granskat Core 24-urval | Detaljer kan öppnas utan att störa passet; nästa förslag kan förklaras från faktiskt underlag | U3 |
| U5: Valbar spelglädje | Avskalat/lätt spelifierat och begriplig ingång till befintlig RPG | Samma avsedda styrketräning behålls när spelval ändras; fysisk RPG-runda fungerar utan felaktiga träningsincitament | U2; U3 för korrekt lagring |
| U6: Återkomst i vardagen | Dagsavslut, vilodag, veckoperspektiv och återkomst efter uppehåll | Tillstånden fungerar utan skuld, omskriven historik eller obligatorisk ny konfigurering | U3–U5 |
| U7: Begriplighet för andra | Observerade tester med nya användare och avgränsad vardagsprovning | Faktiska observationer visar vad som fungerar, vad som stoppar och om personer återkommer | U1–U6 |

**Första arbetsbeställningen är U0 + U1.** Leverera en fungerande väg hela vägen
till sparat pass. Gör sedan U2 och användarens första fysiska test innan fortsatt
utbyggnad. Fel i start, guidning, lagring eller återupptagning prioriteras före
fler övningar och spelinnehåll. Sätt inte kalenderdeadline innan första TV-rundan
visat hur mycket som behöver rättas.

## 12. Praktiskt testprotokoll

Användaren utför fysisk träning och bedömer känslan. Utvecklingsarbetet förbereder
en testbar version, rättar fel och sammanställer återkopplingen. Fysiska resultat
får inte skrivas av den som bara har granskat kod eller automatiska tester.

### Testomgångar

| ID | Prova | Observera och kontrollera |
| --- | --- | --- |
| T1 | Börja från första besöket utan färdig profil | Är nästa handling självklar? Hur lång tid går till första instruerade övningen? |
| T2 | Genomför ett pass manuellt | Instruktion, set, vila, sparstatus och avslut fungerar utan kamera |
| T3 | Samma grundflöde framför TV med kamera | Läsbarhet från faktisk träningsplats, ljud, kontroller, korrekt kalibrering och repantal |
| T4 | Neka kamera och tappa kroppsbilden under ett annat försök | Begriplig återhämtning; ingen falsk feedback; utfört arbete kan bevaras/korrigeras |
| T5 | Pausa efter sparat set, ladda om och fortsätt | Nästa steg och sparade set stämmer; inget räknas två gånger |
| T6 | Dela upp träning under dagen och byt miljö | Samma uppdrag, rimliga alternativ, korrekt aktiv tid och ärligt delavslut |
| T7 | Växla detaljer och spelval mellan set | Valen ändrar presentation, inte utförd träning eller plan utan ett uttryckligt planval |
| T8 | Spela befintlig RPG i flera separata rundor | Regler, respons, falska träffar, pauser och lust att spela igen |
| T9 | Öppna efter avslutad dag, vilodag och uppehåll | Rätt nästa steg; ingen träningsskuld eller tvingad merträning |

Använd testkonto eller isolerade testdata för simulerade datum/tillstånd. Ändra
inte riktiga träningsloggar för att konstruera ett lyckat test.

Motion-planens K6 kräver egna prov i angivna miljöer. K8 kräver fortfarande de
två faktiska över-/underkroppsuppdragen med tre block och två miljöer vardera.
K8 är ett internt verifieringsscenario; vanliga användare ska inte få det som
träningskrav. Ett lyckat TV-pass ersätter inte dessa prov eller verifiering på
annan hårdvara och andra kroppar.

### Fyll i efter varje fysisk provning

```text
Test-ID och datum:
Version/commit:
Testperson och erfarenhet (så lite persondata som behövs):
Dator/telefon, webbläsare, kamera och TV-anslutning:
Miljö, ljus och ungefärligt avstånd till TV/kamera:
Övning/variant, presentation och spelval:
Tid till första övningen / tid för kamerauppställning:
Här behövde jag stanna, gissa eller gå fram till datorn:
Manuellt räknade reps / appens reps, inklusive falska eller missade reps:
Lagring och återupptagning kontrollerad mot faktiskt utfört arbete:
Begriplighet 1–5 / träningsglädje 1–5:
Vill jag göra detta igen? Varför/varför inte?
Fel att rätta först:
Utfall: godkänt / behöver rättas / inte prövat:
Nästa omtest:
```

Privata bilder eller videor behövs inte för enkel användaråterkoppling. Om de
används för mätvalidering hanteras de enligt befintliga integritetsregler.

## 13. Vad som räknas som kvalitet

Följande trösklar är föreslagna interna acceptansmål, inte forskningsresultat
eller branschstandarder. Justera öppet om provning visar att de är fel valda.

- I en första begriplighetsrunda med fem nya vuxna ska minst fyra kunna hitta
  starten och genomföra grundflödet utan muntlig vägledning. Anteckna all hjälp.
- Sikta på högst två minuter från träningsingång till första instruerade övning
  utan kamera, och högst tre minuter med första kamerauppställningen. Redovisa
  laddning och tillstånd separat så att väntetid inte göms.
- Noll förlorade bekräftade set och noll dubbletter i de prövade paus-, omladdnings-
  och återförsöksscenarierna. Ett nätverksfel ska visas som osparat/väntande.
- Alla nödvändiga steg i TV-testet ska kunna utföras med den dokumenterade
  kontrollmetoden. Blockerande text ska vara läsbar från träningsplatsen.
- Kamerakvalitet och latens prövas mot Motion-planens krav; ändra inte gränser
  tyst för att få ett godkänt resultat.
- Efter grundtesten kan en liten frivillig grupp prova under 2–4 veckor. Följ
  genomförda pass, återkomst efter avbrott och skäl att sluta. Appöppningar och
  insamlade XP är inte i sig bevis på bättre träning.

Användarens egna TV-prov räcker för godkännande i den egna dokumenterade miljön.
Om nya testpersoner ännu saknas kan arbetet fortsätta på oberoende delar, men
nybörjarbegriplighet och generell återanvändning ska stå kvar som ej verifierade.
Ingen rekrytering, kontakt med andra eller publicering sker automatiskt genom planen.

### Status och bevis

| Etapp | Kodstatus | Automatiska kontroller | Fysisk provning | Ny användare | Bevis / nästa steg |
| --- | --- | --- | --- | --- | --- |
| U0 | Ej inventerad mot nytt flöde | Ej körda | Ej prövad | Ej prövad | Inventera och bestäm tillstånd |
| U1 | Ej verifierad | Ej körda | Ej prövad | Ej prövad | Första kompletta passet |
| U2 | Befintliga delar finns; nytt flöde ej verifierat | Ej körda för etappen | Ej prövad för etappen | Ej prövad | T3–T4 |
| U3 | Befintliga delar finns; nytt flöde ej verifierat | Ej körda för etappen | Ej prövad för etappen | Ej prövad | T5–T6 |
| U4 | Ej verifierad | Ej körda | Ej prövad | Ej prövad | Granskat upplägg och detaljväxling |
| U5 | Befintlig RPG finns; nytt flöde ej verifierat | Ej körda för etappen | Ej prövad för etappen | Ej prövad | T7–T8 |
| U6 | Ej verifierad | Ej körda | Ej prövad | Ej prövad | T9 och vardagsprovning |
| U7 | Inte en kodleverans | Inte tillämpligt | Ej prövad | Ej prövad | Observationer och återanvändning |

Automatiska kontroller ska vara relevanta för ändringen: tillståndsövergångar,
bevarande av set vid paus/återförsök, korrekt källa och användarscope samt att
detalj-/spelval inte ändrar träningsdata. Använd befintliga tester och komplettera
där ändrade beteenden motiverar det. Följ projektets Next.js-guider vid kodarbete.
Gröna tester ersätter inte fysisk provning eller begriplighetstest.

Leveransen är klar för fortsatt privat vardagsanvändning när U0–U6 är verifierade
i den dokumenterade målmiljön, kvarvarande begränsningar är tydliga och inga
blockerande fel i start, guidning, sparande eller återkomst återstår. U7 behövs
för att påstå att upplevelsen även fungerar för nya användare. Kommersiell
beredskap och betalningsvilja bedöms i ett framtida separat arbete.
