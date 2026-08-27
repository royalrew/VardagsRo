# Plan: källmarkering med bbox

Målet är det konceptet redan formulerar: *"Det ska gå att trycka på ett svar och
öppna exakt där uppgiften stod."* Den här planen tar det från formulering till
något som går att bygga och bevisa.

Skriven 2026-08-27, efter att identitet, hushållsisolering, permissions och audit
landat.

## Varför nu

Konceptet sätter själv grinden: *"permissions och godkännandestatus filtreras före
modellen"*. Det lagret finns sedan i dag. En bbox pekar in i ett dokument som
tillhör ett hushåll, och utan serverstyrd behörighet vore markeringen en ny väg
runt isoleringen i stället för en funktion.

Det finns också ett konkret behov. Skolschemat för 9A2 tolkades med slöjden på
fredag trots att den ligger i torsdagskolumnen, och tider avrundades några
minuter. Sådana fel är svåra att se i en lista och triviala att se om
förslaget kan pekas ut i originalet.

## Det som redan finns

- Originalfilen bevaras i R2 med `storage_key` och `sha256`
- `document_id`, `source_excerpt` och `confidence` ger textuell provenance
- Hushållsstyrd åtkomst till dokument och signerade käll-URL:er
- `review_status` skiljer granskat från ogranskat

## Det som saknas

- Ingen sidmodell. Ett dokument är i dag en fil, inte sidor.
- Ingen OCR och inga koordinater. Ingenting i systemet vet var på bilden en text står.
- Ingen bildvisare. "Visa källa" öppnar filen i en ny flik; det finns inget att rita i.
- Ingen versionshantering av dokument. En bbox kan i dag peka in i en ersatt fil.

## Det enda beslut som formar allt annat

Var kommer koordinaterna ifrån?

**Alternativ 1: fråga extraktionsmodellen.** Billigt, ingen ny leverantör, ingen
ny kod. Men vision-modeller är opålitliga på pixelkoordinater, och ett skolschema
är ett rutnät där en kolumn fel är värre än ingen markering alls. Resultatet blir
dessutom olika mellan körningar, precis som lunchraderna redan visat.

**Alternativ 2: separat OCR som ger ordrutor, och deterministisk matchning av
`sourceExcerpt` mot dem.** Träffsäkert och testbart utan att anropa någon modell,
och samma mönster som `mergeMedvindWorkEvents` och `mergeParallelSchoolLessons`
redan använder: modellen tolkar, koden avgör.

**Beslut 2026-08-27: alternativ 2, med `tesseract.js` som körs i egen process.**

Avgörande för valet var att 95 procent av materialet är fotograferade papper med
vanlig löptext — kallelser och brev från skolan. Scheman är ovanliga. Löptext är
precis vad Tesseract är bra på, och rutnät är dess svaghet. Molntjänsternas
tabellstöd hade alltså betalat för det sällsynta fallet och inte för det vanliga.

### Och det är ett compliance-beslut, inte bara ett tekniskt

En molnbaserad OCR-tjänst innebär att barnens skoldokument skickas till ännu ett
personuppgiftsbiträde. DPA med OpenAI är redan en öppen punkt i handoffen; att
lägga till en till leverantör innan den är på plats gör läget sämre, inte bättre.

Därför: **OCR som körs i den egna processen**, till exempel `tesseract.js`. Det
kostar bygg- och minnesutrymme på Railway och är sämre än en molntjänst på svåra
bilder, men det lägger inte till en ny mottagare av barnens uppgifter. Kvaliteten
går att omvärdera senare; leverantörsvalet är dyrare att backa.

## Datamodell

Tre nya tabeller, alla med `household_id` från början eftersom det enligt
handoffens compliance-avsnitt är billigt nu och omöjligt att retrofitta.

`family_document_pages`
: `document_id`, `page_number`, `width_px`, `height_px`, `rotation`,
  `render_version`, `storage_key` för den renderade sidbilden

`family_document_segments`
: `household_id`, `document_id`, `page_id`, `ordinal`, `text`, `boxes jsonb`,
  `confidence`. Ett segment är ett sammanhängande textområde med en eller flera
  rektanglar, eftersom konceptet kräver att flera områden kan markeras.

`family_event_sources` och `family_task_sources`
: kopplar en händelse eller uppgift till ett eller flera segment. Många-till-många,
  inte en kolumn på händelsen, av samma skäl.

### Koordinatkontraktet måste pinnas

Rektanglar lagras som andelar 0–1 av sidans renderade bredd och höjd, tillsammans
med `rotation` och `render_version`. Ändras renderingen utan att versionen ändras
hamnar varje gammal markering fel, tyst. Kontraktet ska ligga på ett ställe, med
tester, och `render_version` ska höjas när renderingen ändras.

### Öppen fråga som måste besvaras före migrationen

Ett segment är OCR-text ur ett skoldokument. Det är en kopia av barnets uppgifter
på en ny plats i databasen. Retention på segment måste bestämmas i samma
migration som skapar dem — samma resonemang som handoffen redan för om dokument.

## Etapper

**Etapp 1 — bekräfta det modellen tror. Levererad 2026-08-27.**

Ingen migration behövdes. Granskningen sker innan dokumentet sparas, så rutorna
följer med tolkningen i svaret och behöver aldrig lagras. Det gjorde första
leveransen betydligt mindre än planerat, och skjuter retention-frågan till
etapp 2 där segmenten faktiskt ska sparas.

- Rendera dokumentet till en sidbild vid bekräftelsen, spara mått och rotation
- Kör OCR, spara segment med rutor
- Matcha varje `sourceExcerpt` mot segment deterministiskt
- Visa originalet med markering i granskningssteget, per vald händelse
- Faller matchningen ut tomt: visa hela sidan och säg att exakt område saknas

Efter etapp 1 kan ett schema granskas mot bilden innan det sparas. Slöjden på fel
dag hade fastnat här.

**Etapp 2 — källklick från kalendern.** Samma visare, nådd från en sparad händelse
och från ett svar. Kräver att segmenten filtreras genom hushållet före hämtning,
vilket lagret som landade i dag redan gör.

**Etapp 3 — dokumentversioner.** Ett nytt schema ersätter ett gammalt utan att
historiken försvinner, och en bbox pekar aldrig in i en ersatt fil. `sha256` finns
redan som ankare.

**Etapp 4 — segmenten i retrieval.** Först här blir det multimodal RAG. Innan dess
är bbox en granskningsfunktion, vilket är den som efterfrågats.

## Vad som bevisar att det är klart

Konceptet anger provet, och det ska vara ett riktigt E2E-test:
svar → källa → rätt sida → synlig markering → rätt källtext.

Utöver det:

- Ett test som bevisar att koordinaterna överlever en rotation
- Ett test som bevisar att ett segment ur ett annat hushåll aldrig returneras
- Ett test som bevisar att UI faller tillbaka till sidnivå när exakt bbox saknas,
  i stället för att gissa en rektangel

## Vad planen medvetet inte innehåller

Hybrid retrieval, dubblettidentifiering och freshness hör till samma avsnitt i
konceptet men löser inte det här problemet. De hör till etapp 4 och senare.


## Mätt hittills

`tesseract.js@7` kör svenska på ett fotograferat schema på cirka två sekunder och
ger 248 ord med koordinater. Språkdata ligger versionerad i `vendor/tessdata`, så
ingenting laddas ner vid körning och inget nätanrop sker på Railway.

`locateExcerpt` i `src/server/source-location.ts` knyter ett källutdrag till ett
område deterministiskt, utan att anropa någon modell. Tio enhetstester.

På schemat, alltså det svåraste materialet, hittas 4 av 12 utdrag. De övriga åtta
faller tillbaka till sidnivå i stället för att peka fel, vilket är kravet.

Två saker gjorde matchningen ärlig i stället för gissande:

- Tokens viktas efter hur ovanliga de är på sidan. `Samhällsorienterande ämnen`
  står fem gånger i ett schema och säger nästan ingenting om var man är;
  klockslaget bredvid säger nästan allt. Utan viktningen pekade två olika
  lektioner på samma ruta.
- Flera likvärdiga träffar på skilda ställen ger inget svar alls.

Löptextfallet, alltså de 95 procenten, är ännu inte mätt. Det kräver ett riktigt
papper i `private/` att köra mot.

## Verktyg för den lokala slingan

`node scripts/ocr-probe.mjs "private/Kallelse.jpg"` visar vad OCR såg: tid,
säkerhet, andel osäkra ord och texten. Med `--words` även varje ord med sin ruta.
Tänkt för att titta på riktiga papper innan man bestämmer vad koden ska göra.


## Två saker som bara en körning i den riktiga appen kunde visa

**Tesseract fungerar inte paketerad.** Next buntar in serverberoenden, och
Tesseract letar upp sitt eget worker-skript på disk vid körning. Bundlad letade
den efter en omskriven sökväg som inte finns, och varje anrop dog med
`MODULE_NOT_FOUND`. Lösningen är `serverExternalPackages: ["tesseract.js"]` i
`next.config.ts`, så att paketet krävs in nativt i stället.

Felet hade inte synts förrän i produktion om OCR bara testats från ett skript.

**Språkdata följer inte med standalone-bygget av sig självt.** Filen läses från
disk, inte importeras, så bygget ser den inte. `outputFileTracingIncludes` tar med
`vendor/tessdata/**/*`, verifierat i `.next/standalone`.

Efter det: OCR körd genom en riktig route i Next ger 66 rader och 171 ord med
koordinater på ett fotograferat schema.

## Läget

Klart och verifierat: OCR i egen process, sidmått och EXIF-rotation ur filen,
deterministisk matchning av källutdrag mot område, och allt paketerat så att det
fungerar i produktionsbygget.

Kvar för etapp 1: migrationen för sidor och segment, bildvisaren med markering,
och inkopplingen i granskningssteget. Migrationen väntar på beslutet om hur länge
OCR-texten får ligga kvar.


## Etapp 1 är levererad

`/api/extract` kör OCR efter att dokumenttypen godkänts och returnerar för varje
förslag var på sidan utdraget lästes. Granskningssteget visar originalet med
markering, och säger uttryckligen "hela sidan visas" när området inte kunde
fastställas.

Rutorna returneras i den rymd webbläsaren målar i, med rotationen redan
applicerad. Klienten ritar procent och behöver aldrig veta hur fotot hölls.

### Platserna delas ut, de söks inte var för sig

Första versionen slog upp varje utdrag oberoende. Tre olika lektioner fick då
samma ruta, eftersom ett schema upprepar samma ämnesnamn på flera dagar och
OCR läste klockslagen fel. Två av tre markeringar var alltså felaktiga och såg
lika säkra ut.

`locateExcerpts` delar i stället ut varje plats högst en gång. Det starkaste
anspråket får platsen, övriga får hitta en egen eller stå utan. På det riktiga
schemat gav det sju markeringar utan en enda delad plats, mot åtta med tre
kollisioner tidigare. Färre markeringar, men inga falska.

### Kvar

Etapp 2 och framåt: sidor och segment i databasen, källklick från kalendern,
dokumentversioner och segmenten i retrieval. Retention-beslutet behövs först då.
