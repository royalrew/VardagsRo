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

**Rekommendation: alternativ 2.**

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

**Etapp 1 — bekräfta det modellen tror.** Det som löser det uttalade behovet.

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
