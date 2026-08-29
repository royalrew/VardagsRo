# Projekt 100 — styrande produktplan

Status: Beslutad riktning  
Senast uppdaterad: 2026-08-29  
Ägare: användaren  
Gäller: ersättaren till "Mitt spår"

## Genomförandestatus

- [x] Styrande produktplan och informationsarkitektur beslutad.
- [x] Egen routebaserad arbetsyta under `/projekt-100`.
- [x] Grupperad desktopnavigation och mobil snabbnavigation.
- [x] Översikten flyttad ur Vardagsros packade enkelsida.
- [x] Read-only veckosida för den inloggade vuxnas befintliga jobbevent.
- [x] Strikt serverfråga på aktörens hushåll, person, kategori och datumperiod.
- [x] Egna routes etablerade för träning, kost, kropp, dagbok, insikter,
  media, Jarvis, innehåll och inställningar.
- [x] Ny Projekt 100-domänmodell med egna `project100_*`-tabeller, användarscope
  i varje främmande nyckel och ett eget `/api/project100`-kontrakt.
- [x] Full träningslogg: pass, övningar, set, passmallar, sökbar historik och
  planerade pass som kan genomföras, flyttas eller hoppas över utan att
  historiken skrivs om.
- [x] Privat medielagring: egna objektnycklar per användare, kortlivade
  signerade adresser, förhandsbilder och fullständig radering.
- [x] Kroppsresan: vikt, kroppsmått och egna mått som normaliserade rader,
  härledda milstolpar, tillgänglig utvecklingsgraf och kroppsbilder bredvid
  vikten. Vikterna ur den gamla hälsologgen är migrerade hit.
- [x] Dagbok med dagsform, sökbart arkiv och en per-anteckning-grind som håller
  assistenten ute — villkoret ligger i frågan, inte i ett filter efteråt.
- [x] Gemensam privat tidslinje som väver samman pass, mätningar, bilder och
  anteckningar per dag.
- [ ] Avveckling av de gamla Solo-tabellerna och den inbäddade Solo-vyn.
- [ ] Måltidslogg, insikter, Jarvis-minne och innehållsflöde.

## Vision

Projekt 100 ska vara ett privat operativsystem för resan från cirka 80 kg mot
100 kg: träning, kost, kropp, återhämtning, dagbok, bilder, minne och synlighet
i ett sammanhängande flöde.

Det är inte bara en träningslogg. Systemet ska hjälpa användaren att:

1. fånga vad som faktiskt händer,
2. minnas hela resan,
3. förstå utveckling och återkommande mönster,
4. välja nästa rimliga handling,
5. berätta delar av resan offentligt när användaren själv väljer det.

Den styrande produktprincipen är:

> Logga en sak en gång. Använd den sedan för tidslinjen, graferna,
> veckosummeringen, Jarvis-minnet och eventuellt framtida innehåll.

## Jobbschemat är en del av kärnan

Projekt 100 ska planera runt användarens verkliga jobbschema som redan finns i
Vardagsros kalender. Arbetspassen ska inte kopieras till ett andra schema.
Familjekalenderns befintliga jobbevent är källan till sanningen.

På serversidan hämtas endast jobbevent som tillhör den inloggade aktörens
`householdId` och `personId`, med kategorin `work`. Klienten får aldrig välja en
annan persons id i en förfrågan. Hushållets tidszon används för alla datum och
beräkningar.

Projekt 100 ska använda schemat för att:

- visa nästa arbetspass och hur långt det är,
- hitta realistiska träningsfönster före eller efter arbetet,
- skilja på arbetsdag, ledig dag, kvällspass, nattpass och lång arbetsdag,
- föreslå kortare pass när tiden eller återhämtningen är begränsad,
- planera matförberedelser och måltider runt arbetstiderna,
- undvika Jarvis-notiser under arbetspass,
- flytta framtida träningsförslag när jobbschemat ändras,
- förklara veckobelastningen utan att kalla en tung arbetsvecka för misslyckad.

### Integritetsgränsen

Jobbschemat är hushållsdata. Kroppsbilder, vikt, dagbok, kost och privata
träningsdetaljer är personlig Projekt 100-data. De två får användas tillsammans
för planering, men får inte blandas ihop i lagringen.

Planerade träningspass ska därför ligga privat i Projekt 100. Om användaren
aktivt väljer "Visa i familjekalendern" får endast ett neutralt kalenderblock,
exempelvis "Träning" eller "Egentid", skapas. Vikt, kropp, kost, dagbok och
Jarvis-analys får aldrig kopieras till familjekalendern.

## Produktens fem lager

### 1. Fånga

- Träningspass och övningar
- Kroppsvikt och kroppsmått
- Måltider och matbilder
- Kroppsbilder och träningsklipp
- Sömn, energi, återhämtning och dagsform
- Dagboksanteckningar
- Idéer, utkast och publicerat innehåll

### 2. Minnas

Allt ordnas i en privat kronologisk tidslinje. En vecka ska i efterhand kunna
berätta vad användaren gjorde, åt, kände, lärde sig och dokumenterade.

### 3. Förstå

- Vikt- och måttutveckling
- Träningsvolym, distans och personbästa
- Sömn, energi och kontinuitet
- Kost och proteinöversikt
- Belastning från både arbete och träning
- Vecko- och månadssummeringar

Systemet får visa samband men inte påstå orsak utan tillräckligt stöd.

### 4. Agera

Jarvis ska hjälpa användaren välja nästa rimliga steg med hänsyn till mål,
jobbschema, återhämtning, tillgänglig utrustning och tidigare loggar.

### 5. Berätta

Privat material kan aktivt väljas till ett separat innehållsprojekt. Ingenting
får publiceras eller lämna den privata delen utan uttryckligt godkännande.

## Informationsarkitektur — en egen arbetsyta

Projekt 100 ska inte byggas som en enda lång sida med många små kort. När
användaren går in i Projekt 100 öppnas en egen, fullstor arbetsyta med separat
navigation. Vardagsros huvudnavigation har fortfarande en tydlig ingång till
Projekt 100, men själva produkten får därefter den plats och det djup som en
enterprise-liknande applikation behöver.

Den tekniska målbilden är riktiga App Router-sidor under `/projekt-100`, inte
hashbaserade låtsassidor eller en komponent som gömmer och visar stora delar av
samma DOM. En gemensam nested layout ansvarar för navigation, behörighet,
snabbloggning och gemensam kontext.

Föreslagen struktur:

```text
/projekt-100
├── /                         Översikt
├── /schema                   Jobb, träningsfönster och veckoplan
├── /traning                  Planera och logga träning
│   ├── /pass/[id]            Ett genomfört eller planerat pass
│   ├── /historik             Alla pass
│   └── /mallar               Återanvändbara passmallar
├── /kost                     Måltider, matbilder och näringsöversikt
│   ├── /maltider/[id]        En måltid
│   ├── /favoriter            Återkommande måltider och recept
│   └── /planering            Mat runt jobb- och träningsveckan
├── /kropp                    Vikt, mått, bilder och milstolpar
├── /dagbok                   Anteckningar och privat tidslinje
├── /insikter                 Grafer, trender och rapporter
├── /media                    Privat bild- och videobibliotek
├── /jarvis                   AI-chatt, minnen och förslag
├── /innehall                 YouTube och synlighetsprojekt
└── /installningar            Mål, integritet, utrustning och export
```

Svenska URL-segment kan senare förenklas om tekniska skäl kräver det, men
sidgränserna och ansvarsfördelningen är ett produktbeslut och ska bestå.

### Arbetsytans skal

På större skärmar består Projekt 100 av:

- en fast vänsterspalt med grupperad navigation,
- en toppbar med sidtitel, datumkontext, sök och global `+ Logga`-knapp,
- en rymlig huvudyta anpassad efter sidan,
- en valfri högerspalt för aktuell kontext, exempelvis nästa arbetspass eller
  Jarvis-förslag,
- breadcrumbs endast på sidor som ligger djupare än huvudnivån.

Navigationen grupperas efter användarens mentala modell:

```text
IDAG
  Översikt
  Schema

BYGG
  Träning
  Kost
  Kropp

REFLEKTERA
  Dagbok
  Insikter
  Media

SKAPA
  Jarvis
  Innehåll

SYSTEM
  Inställningar
```

På mobil blir vänsterspalten en meny. De mest använda vägarna — Översikt,
Träning, Kost och Jarvis — ligger i en kompakt bottennavigation. Den globala
loggknappen är alltid nåbar med tummen.

### Global snabbloggning

`+ Logga` ska fungera från samtliga sidor och öppna en meny för:

- träningspass,
- måltid eller matbild,
- vikt eller kroppsmått,
- kroppsbild,
- dagboksanteckning,
- dagsform/check-in,
- innehållsidé.

Snabbloggningen ska öppna rätt fokuserade formulär eller föra användaren till
rätt sida. Ett stort universellt formulär ska undvikas. Tangentbordsgenvägar och
senast använda loggtyp kan läggas till efter att grundflödena är stabila.

## Sidornas ansvar

### Översikt

Översikten svarar endast på fyra frågor:

1. Vad händer idag?
2. Hur går resan just nu?
3. Vad är nästa rimliga handling?
4. Finns något som kräver min uppmärksamhet?

Den ska innehålla högst ett fåtal prioriterade moduler:

- dagens jobb- och träningsfönster,
- aktuell viktresa och närmaste milstolpe,
- veckans träningsstatus,
- dagens kost/check-in,
- senaste relevanta Jarvis-insikt,
- snabbvägar till fördjupningssidorna.

Översikten ska inte innehålla fullständiga formulär, stora gallerier, hela
dagboken eller detaljerade tabeller.

### Schema

Schemasidan visar jobbschemat som befintlig, read-only grund och lägger privata
Projekt 100-planer ovanpå som ett separat lager.

- Dag-, vecka- och agendaformat.
- Jobbpass, privat planerad träning och måltidsförberedelser.
- Synliga fria fönster och återhämtningsperioder.
- Förslag före/efter jobb med tydlig motivering.
- Dra och flytta privata planer utan att ändra jobbeventet.
- Aktivt val för neutral spegling till familjekalendern.
- Vid schemaändring visas vilka framtida planer som behöver ses över.

### Träning

Träningssidan är en riktig arbetsyta, inte ett formulärkort.

- Dagens plan och snabb start av pass.
- Vecko- och månadsplan.
- Passmallar för hemma, skogen, utegym, löpning, cykel och spinning.
- Pågående pass med stora, lättanvända kontroller.
- Historik med sök, filter och jämförelse.
- Övningsdetaljer, personbästa, volym, tid och distans.
- Detaljsida för varje planerat eller genomfört pass.

### Kost

- Dagens måltider i kronologisk ordning.
- Kameraknapp som primär handling på mobil.
- Protein och energi som översikt, inte som skamindikator.
- Veckovy och mat runt kommande arbetspass.
- Favoriter, recept och återkommande måltider.
- Möjlighet att komplettera en snabb bildlogg senare.
- Tydlig märkning av manuella värden respektive AI-uppskattningar.

### Kropp

- Viktkurva och milstolpar.
- Kroppsmått över valfri period.
- Kroppsbilder med datum, vinkel och vikt.
- Före/efter-jämförelse.
- Samband med styrkeutveckling utan att påstå exakt muskelmassa.
- Privat fokusläge där inga känsliga bilder visas som standard i öppna
  översikter.

### Dagbok

- ~~Ren skrivyta med minimala störningar.~~ Klar 2026-08-29.
- ~~Fritext eller valfria reflektionsfrågor.~~ Klar 2026-08-29.
- ~~Kronologisk historik med dagsform och sömn.~~ Klar 2026-08-29.
- ~~Kopplingar till dagens pass, mätningar och bilder via tidslinjen.~~
  Klar 2026-08-29. Jobbpassen och måltiderna vävs in när schemalagret
  respektive kostmodellen är på plats.
- ~~Sök i egna anteckningar.~~ Klar 2026-08-29, via textsökning i databasen.
- ~~Markera en anteckning som extra privat och utesluta den från
  Jarvis-minnet.~~ Klar 2026-08-29.
- Månadskalender som överblick. Återstår.

### Insikter

- Dedikerad analystyta med datumintervall och jämförelseperiod.
- Vikt, mått, träning, kost, sömn, energi och arbetsbelastning.
- Underliggande datapunkter kan öppnas från varje graf.
- Tydlig datatäckning och osäkerhet.
- Vecko- och månadsrapporter.
- Ingen AI-genererad slutsats utan synliga källor.

### Media

- Privat galleri för kropp, mat, träning och innehåll.
- Filter på kategori, datum och kopplad loggpost.
- List- och gallervy.
- Fullskärmsvisning, metadata, omkategorisering och fullständig radering.
- Aktivt val av media till innehållsprojekt.
- Ingen delningsfunktion nära privata kroppsbilder utan ett separat
  bekräftelsesteg.

### Jarvis

Jarvis får en fullstor chattyta med:

- separata konversationer,
- förslag på relevanta frågor,
- källhänvisningar till personliga loggar,
- panel för fakta och minnen som Jarvis använder,
- möjlighet att rätta, glömma eller utesluta ett minne,
- förhandsvisning av föreslagna ändringar innan något sparas,
- aktuell kontext från jobb, träning, kost och återhämtning.

Chatten ska kunna läsa från hela Projekt 100 men inte bli ett alternativt sätt
att skriva ogenomskinliga data. När Jarvis föreslår ett pass eller en måltid
skapas ett strukturerat utkast som användaren kan granska.

### Innehåll

- Kanban eller tabell för idé, manus, inspelning, redigering och publicering.
- Detaljsida för varje video eller innehållsprojekt.
- Urval av godkänt material från den privata mediatidslinjen.
- Manus, hook, titel, thumbnail och publiceringschecklista.
- Publicerat innehåll och resultat kan loggas utan att privata original blir
  offentliga.

### Inställningar

- Målvikt och delmål.
- Tillgänglig utrustning och träningsmiljöer.
- Restid, sömnbuffert och preferenser runt arbetspass.
- Jarvis-minne och AI-behörigheter.
- Integritet och eventuell neutral kalenderspegling.
- Export, backup och fullständig radering.

## Gemensamma enterprise-mönster

Alla sidor ska använda samma grundmönster:

- konsekvent sidhuvud med titel, beskrivning och primär handling,
- URL-baserade filter där en vy ska kunna bokmärkas,
- tydliga tom-, laddnings-, fel- och offlinelägen,
- tabeller för täta historikdata och kort endast när visuell överblick hjälper,
- listor med sök, filter, sortering och paginering när datamängden växer,
- detaljsidor eller sidopaneler i stället för växande modaler,
- optimistiska uppdateringar endast när de säkert kan ångras,
- synlig sparstatus och möjlighet att korrigera eller ta bort loggar,
- samma datumintervall när användaren går mellan relaterade analysvyer,
- tillgängliga diagram med textalternativ och underliggande värden.

Enterprise-känslan ska komma från tydlighet, stabilitet, djup och konsekventa
arbetsflöden — inte från att visa så mycket information som möjligt samtidigt.

## Teknisk sidstrategi

- `src/app/projekt-100/layout.tsx` blir serverrenderat behörighets- och
  navigationsskal.
- Varje huvudområde får en egen route och kan laddas oberoende.
- Server Components hämtar initial, aktörsscopead data nära databasen.
- Små Client Components används för formulär, diagram, drag-and-drop och chatt.
- Gemensamma query-parametrar används för datumintervall, filter och valda id:n.
- Tung media, chatt och analys laddas först när respektive sida öppnas.
- En gemensam Projekt 100-komponentkatalog ger samma tabeller, sidhuvuden,
  tomlägen, filterrader och detaljpaneler.
- Navigationen ska fungera med direktlänkar, bakåtknapp och uppdatering av sidan.
- Den gamla inbäddade `SoloView` avvecklas stegvis när de nya sidorna tar över.

### Migreringsordning för gränssnittet

1. ~~Skapa layout, route-struktur och riktig navigation.~~ Klar 2026-08-29.
2. ~~Flytta nuvarande Projekt 100-översikt till `/projekt-100`.~~ Klar 2026-08-29.
3. ~~Skapa schemasidan och läs jobbevent read-only.~~ Klar 2026-08-29.
4. Flytta dagens check-in till rätt domänsidor och global snabbloggning.
5. ~~Bygg träningssidorna.~~ Klar 2026-08-29. Detaljsidor per pass
   (`/traning/pass/[id]`, `/historik`, `/mallar`) återstår; arbetsytan bär
   flödet så länge.
6. ~~Bygg kropp, dagbok och media ovanpå tidslinjen.~~ Klar 2026-08-29.
   Kostsidorna står härnäst.
7. Bygg kostsidorna och måltidsflödet.
8. Bygg insikter när tillräcklig strukturerad data finns.
9. Bygg Jarvis som egen arbetsyta.
10. Bygg innehåll och YouTube-flöde.
11. Ta bort den gamla inbäddade Solo-vyn när alla länkar och data har flyttats.

Man ska inte skapa tio tomma sidor och kalla navigationen färdig. Skalet och
sidgränserna skapas tidigt, men varje område blir synligt som aktiv destination
först när det har ett meningsfullt arbetsflöde eller ett ärligt "kommer härnäst"
med tydlig funktion.

## Genomförandeplan

### Fas 0 — Rensa och stabilisera fundamentet

Mål: gamla "Mitt spår" ska ersättas på riktigt, inte bara visuellt.

- Byt domänspråk från Solo/Mitt spår till Projekt 100.
- Ta bort beroendet av karriär-, ekonomi-, XP-, boss- och talangträdslogik.
- Migrera värdefull vikt-, hälso- och dagboksdata.
- Ta backup innan gamla tabeller eller kolumner raderas.
- Introducera ett tydligt `/api/project100`-kontrakt.
- Ge användaren export och fullständig radering av personlig data.
- Behåll tydlig audit utan att lägga känsligt innehåll i auditloggen.

Klart när Projekt 100 inte längre behöver den gamla speldomänen och befintlig
hälsodata fortfarande är tillgänglig.

### Fas 1 — Gemensam tidslinje och riktig bildlagring

Mål: skapa minnet som resten av produkten kan byggas ovanpå.

- ~~Skapa en generell privat tidslinje för check-ins, pass, mått, bilder och
  anteckningar.~~ Klar 2026-08-29. Måltider vävs in när kostmodellen finns.
- Lagra originalbilder privat i befintlig objektlagring.
- Skapa mindre förhandsbilder för snabb laddning.
- Använd kortlivade signerade bildadresser.
- Stöd kategorierna kropp, mat, träning och innehåll.
- Lagra datum, typ, valfri kommentar och koppling till relevant loggpost.
- Låt användaren radera både databasrad, original och förhandsbild.
- Lägg till kameraflöde på mobil och vanlig filväljare på dator.

Klart när en bild kan tas, sparas privat, visas i tidslinjen och raderas helt.

### Fas 2 — Den riktiga träningsloggen

Mål: ett vanligt pass ska kunna loggas med få tryck.

- Träningsformer: hemma, skogen, utegym, löpning, cykling och spinning.
- Passmallar för återkommande upplägg.
- Övningar med set, repetitioner, vikt, tid, distans och ansträngning.
- Anteckning om kroppen före och efter passet.
- Personbästa och jämförelse med föregående liknande pass.
- Total volym, tid och distans.
- Planerade pass separeras från genomförda pass.
- Ett planerat pass kan markeras klart, kortas, flyttas eller hoppas över utan
  att historiken förvanskas.

Jobbschemat används här för att föreslå möjliga tider. Förslaget är aldrig en
automatisk bokning.

Klart när användaren kan skapa en mall, planera den runt arbetet, genomföra den
och se den i historiken.

### Fas 3 — Kroppsresan

Mål: beskriva utvecklingen bättre än med endast vågens tal.

- ~~Vikt, midja, bröst, armar, lår och valfria egna mått.~~ Klar 2026-08-29.
- ~~Kroppsbilder med datum och vikt bredvid varandra.~~ Klar 2026-08-29.
- ~~Påminnelse om samma ljus, avstånd och vinkel.~~ Klar 2026-08-29.
- ~~Milstolpar, exempelvis 82,5, 85, 90, 95 och 100 kg.~~ Klar 2026-08-29,
  härledda mellan startvikt och mål i stället för inskrivna.
- ~~Målet 100 kg behandlas som riktning, inte bevis på ren muskelökning.~~
- Före/efter-jämförelse med dragbar skiljelinje. Återstår.
- Styrkeutveckling bredvid vikt och mått. Återstår; kräver att träningsvolymen
  läses över samma period som måtten.

Grafen ritar ett mått i taget på en axel. Kilo och centimeter delar ingen skala,
och ett diagram med båda skulle påstå ett samband som inte finns i talen.
Samma värden står alltid i en tabell under grafen.

### Fas 4 — Kost och måltider

Mål: göra kostloggning visuell, snabb och korrigerbar.

- Fotografera måltiden först; detaljer är valfria i stunden.
- Måltidstyp, innehåll, mängd, protein och uppskattad energi.
- Hunger före, mättnad efter och hur måltiden kändes.
- Återanvändbara favoriter och recept.
- Matförberedelser kopplade till kommande arbetsdagar.
- Veckoöversikt över protein och måltidskontinuitet.
- Senare bildanalys får endast ge förslag som användaren kan rätta.
- AI-uppskattningar märks tydligt och presenteras aldrig som exakta värden.

Klart när en måltid kan loggas med en bild på några sekunder och kompletteras
senare.

### Fas 5 — Schemasmart planering

Mål: Projekt 100 ska fungera i användarens verkliga vardag.

- Skapa en serverfunktion som läser aktörens egna kommande jobbevent.
- Klassificera pass efter lokal starttid och längd, men behåll originaleventet
  som sanningen.
- Lägg till privata inställningar för restid, önskad sömnbuffert och vilka
  träningsfönster som är realistiska.
- Visa arbetsbelastning och planerad träningsbelastning tillsammans.
- Föreslå "fullt pass", "kort pass", "aktiv återhämtning" eller "vila".
- Låt användaren låsa ett planerat pass så att Jarvis inte flyttar det.
- När arbetspass ändras omräknas endast framtida förslag, aldrig historik.
- Tillåt neutral, uttryckligen godkänd spegling till familjekalendern.

Klart när en ändring av ett framtida arbetspass ger nya förslag utan att privat
data exponeras eller gamla loggar ändras.

### Fas 6 — Grafer, recensioner och återkoppling

Mål: omvandla loggar till begripliga beslut.

- Vikt, kroppsmått och milstolpar.
- Träningsvolym, personbästa, löpning och cykling.
- Sömn, energi, kost och återhämtning.
- Arbetsdagar jämfört med lediga dagar.
- Veckosummering: gjort, fungerade, svårt, nästa fokus.
- Månadssummering och valfri delbar rapport.
- Visa datatäckning så att svaga slutsatser ser svaga ut.

Klart när varje graf går att spåra tillbaka till konkreta loggposter.

### Fas 7 — Jarvis och personligt minne

Mål: assistenten ska vara personlig utan att hitta på.

Tre minnestyper:

- Fakta: mål, utrustning, preferenser, begränsningar och arbetssituation.
- Händelser: pass, måltider, bilder, anteckningar och milstolpar.
- Lärdomar: återkommande mönster som användaren kan bekräfta eller avvisa.

Jarvis ska kunna svara på frågor som:

- Vad tränade jag senast?
- Hur ser min vecka ut runt jobbet?
- När finns nästa realistiska träningsfönster?
- Hur har vikt, styrka och energi förändrats?
- Vilka måltider fungerade under mina bästa träningsveckor?
- Vad skrev jag när motivationen var hög?
- Vilket är det minsta bra steget idag?

Varje svar om personlig historik ska kunna visa vilka loggar det bygger på.
Jarvis får inte skapa eller ändra fakta, mål eller planer utan godkännande.

Klart när svar är källbundna, korrigerbara och respekterar privatgränserna.

### Fas 8 — YouTube och synlighet

Mål: göra resan berättningsbar utan att innehåll tar över träningen.

- Idé, hook, manus, inspelningslista och status.
- Aktivt valda bilder och klipp från den privata tidslinjen.
- Titel- och thumbnail-idéer.
- Utkast, inspelad, redigerad och publicerad.
- Länk och publiceringsdatum.
- Jarvis kan föreslå berättelser ur veckan men aldrig välja privat material åt
  användaren eller publicera automatiskt.

Klart när en privat vecka kan bli ett godkänt videoutkast utan att privat och
offentligt material blandas ihop.

### Fas 9 — Robusthet och långsiktigt ägande

- Mobil först och installerbar PWA.
- Offlineloggning med tydlig synkstatus.
- Full export i maskinläsbart format samt nedladdning av originalmedia.
- Backup, återställning och kontrollerad datamigrering.
- Tillgänglighet och tangentbordsstöd.
- Prestanda för flera års loggar och många bilder.
- Tester för användarscope, hushållsscope och medialäckage.

## Rekommenderad byggordning från nu

1. Rensa domänen och definiera nya datakontrakt.
2. Bygg privat tidslinje och säker bildlagring.
3. Bygg träningslogg och passmallar.
4. Koppla in jobbschemat för schemasmart planering.
5. Lägg till kroppsmått och utvecklingsgrafer.
6. Bygg den bildbaserade matloggen.
7. Bygg veckosummeringar och analys.
8. Lägg Jarvis-minne ovanpå pålitlig data.
9. Bygg YouTube- och synlighetsflödet.
10. Förstärk offline, export, backup och flerårig prestanda.

Jobbschemat specificeras från början men byggs in fullt efter träningsloggen;
annars har schemat inget riktigt träningsobjekt att planera. Däremot ska alla
tidiga datamodeller utformas så att denna koppling inte kräver en ombyggnad.

## Principer som inte får kompromissas bort

- Privat som standard.
- Ingen automatisk publicering.
- Ingen dold kopiering av kroppsinformation till familjekalendern.
- Familjekalendern är källan till jobbschemat.
- Ett arbetspass ska inte behöva registreras två gånger.
- AI-förslag ska vara märkta, korrigerbara och källbundna.
- Missade dagar är luckor i data, inte moraliska misslyckanden.
- En ändrad plan får inte skriva om det som faktiskt hände.
- Vikt är en datapunkt; prestation, mått, bilder och välmående ger helheten.
- Användaren ska kunna exportera och radera allt.

## Levererat fundament

Fas 0, fas 1 och fas 2 vilar nu på riktig kod:

1. Projekt 100-domänkontrakt med egna tabeller och `/api/project100`-routes.
2. Normaliserad träningsmodell: pass, övningar, set och mallar, där planerade
   mål (`target_*`) och faktiskt utfall (`actual_*`) ligger i skilda kolumner.
3. Privat mediamodell med objektnycklar på formen `p100/{userId}/{kategori}/…`,
   som kontrolleras mot den inloggade läsaren innan någon adress signeras.
   Kroppsmodellen ligger bredvid: en rad per mätt sak, per dag, per konto.
4. Privat tidslinje som väver samman fyra källor per dag utan att foga ihop dem
   i en fråga, och en dagbok med en grind assistenten inte kan gå runt.
5. Read-only servervy av den inloggade personens jobbschema.
6. Tester som bevisar användarscope, vuxengräns, mallägarskap, medieläckage och
   att en ändrad plan inte skriver om historiken.

Bildlagringen kräver konfigurerad objektlagring (`R2_*`). Utan den vägrar
servern spara en bild i stället för att skapa en rad utan bild.

## Nästa konkreta leverans

1. Kost och måltider: den bildbaserade matloggen, med matbilderna från
   mediebiblioteket som primär väg in och måltiderna invävda i tidslinjen.
2. Styrkeutvecklingen bredvid vikt och mått, över samma period.
3. Insikter när det finns tillräckligt med strukturerad data att jämföra.
4. Avveckling av `solo_*`-tabellerna och den inbäddade `SoloView` när deras
   data har flyttats. Vikt, energi, sömn och dagsanteckning är redan migrerade;
   kvar står karriärstegen, som Projekt 100 inte ärver.
