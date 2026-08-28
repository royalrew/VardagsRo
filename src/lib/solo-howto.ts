/**
 * The practical half of every node: what to actually do tonight.
 *
 * Kept apart from the talent definitions so those stay readable, and written
 * for one person rather than for anyone. Generic advice is free everywhere and
 * worth what it costs; these name real companies in Växjö, the real repository,
 * and the real evenings that exist after five children are asleep.
 *
 * A test requires an entry for every node, so a new talent cannot ship without
 * one.
 */
export const SOLO_TALENT_HOWTO: Record<string, readonly string[]> = {
  // Synlighet
  visible: [
    "Gör VardagsRo publikt. Det är det enda du byggt som kör i produktion, och skillnaden mot ett övningsprojekt syns på en gång.",
    "Gå igenom git-historiken efter hemligheter först. Borttagna filer ligger kvar i gamla commits även när de är borta i dag.",
    "Beviset är länken någon annan kan öppna utan att fråga dig om lov.",
  ],
  case_published: [
    "600–900 ord räcker. Problemet, tre beslut du tog, och en sak som gick sönder.",
    "Bäst tre beslut: fail-closed i produktion, mänsklig granskning före förtroende, deterministiska svar som pekar på sin källa.",
    "Lägg den på zickaris.se. Du äger domänen redan.",
  ],
  shown: [
    "Skicka länken till en person med en enda fråga: förstår du vad det gör på trettio sekunder?",
    "Din fru räknas. En kollega på jobbet räknas.",
    "Vad de svarar spelar ingen roll för noden. Att du skickade gör det.",
  ],
  profile: [
    "Skriv en mening som beskrivning på varje publikt repo. Ett repo utan beskrivning är en mapp med ett namn, och en besökare ger profilen trettio sekunder.",
    "Fäst de sex du är stoltast över högst upp. GitHub visar dem först, så det är i praktiken din portfölj — låt inte sorteringen välja åt dig.",
    "LinkedIn-rubriken är det enda de flesta läser: undersköterska som bygger och driftsätter produktionssystem.",
    "Sätt Öppen för arbete med Växjö som ort. Rekryterare filtrerar på just det fältet.",
  ],
  asked: [
    "Skriv till någon som bygger vårdteknik och ställ en enda fråga. Be inte om något.",
    "Exempel: hur löser ni att personal dokumenterar i bilen efter passet?",
    "Du behöver inget svar för att noden ska räknas. Bara att frågan gick iväg.",
  ],
  voice: [
    "En i veckan. Tvåhundra ord räcker gott.",
    "Skriv om det du nyss löste: cachen på en publik readiness-endpoint, migrationen som nästan sänkte en deploy.",
    "Publicera samma text på två ställen i stället för att skriva två texter.",
  ],
  first_contact: [
    "Växjö: Visma, Combitech, Sigma, Linnéuniversitetet, kommunens IT-avdelning.",
    "Tre meningar. Vem du är, vad du byggt, vad du söker. Länk. Skicka.",
    "Skriv till en människa med namn, aldrig till info@.",
  ],
  recognised: [
    "Den här går inte att göra. Den går bara att förbereda.",
    "Håll profilen och caset uppdaterade, så att den som hittar dig ser något färskt.",
    "Svara inom ett dygn när det händer. Det är hela förberedelsen.",
  ],
  applicant: [
    "Sök även när du inte uppfyller alla krav. Annonser är önskelistor, inte kravspecar.",
    "Ha en grund i brevet och byt två meningar per ansökan. Annars blir tre ansökningar ett heltidsjobb.",
    "Tre stycken, inte trettio. Kvalitet på urvalet, inte volym.",
  ],
  in_the_room: [
    "Förbered en berättelse: varför du byggde Vardagsro och vad som gick sönder på vägen.",
    "Vårdbakgrunden är inte något att ursäkta. Den är svaret på varför just du.",
    "Ha en fråga tillbaka om hur de arbetar. Ett samtal slår ett förhör.",
  ],
  wanted: [
    "Förhandla alltid en gång. Ett nej kostar ingenting när erbjudandet redan ligger på bordet.",
    "Fråga efter spannet innan du säger en siffra.",
    "Räkna om till månad efter skatt innan du jämför med 30 000.",
  ],

  // Egen fot
  reach: [
    "Fem olika håll, inte fem mejl till samma bolag.",
    "Blanda: vårdtechbolag, kommuner, konsultbolag i Växjö.",
    "Håll en enkel lista över vem och när. Du kommer inte minnas det om tre veckor.",
  ],
  first_proposal: [
    "Sätt ett timpris innan samtalet, inte under det.",
    "Fast pris på små uppdrag, timpris på långa. Fast pris utan tydlig avgränsning är en fälla.",
    "Skriv vad som ingår och vad som inte gör det. Den andra halvan är den viktiga.",
  ],
  first_invoice: [
    "Enskild firma räcker för de första uppdragen. Ansök om F-skatt hos Skatteverket i god tid, det tar ett tag.",
    "Fakturera direkt när arbetet är klart, inte i slutet av månaden.",
    "Trettio dagars betalningsvillkor är normalt. Skriv ut förfallodatumet.",
  ],
  first_krona: [
    "Påminn dag trettioett. Vänligt, kort, utan ursäkt.",
    "Spara undan för skatt och egenavgifter samma dag pengarna kommer, inte i deklarationen.",
    "Efter den här noden är resten en fråga om antal.",
  ],
  floor: [
    "Räkna bara det som faktiskt kommit in på kontot de senaste trettio dagarna.",
    "Två återkommande kunder är stabilare än en stor. Sikta på det.",
    "När den här öppnas: säg inte upp dig samma vecka. Se att den håller i två månader först.",
  ],
  freedom: [
    "Femtio tusen fakturerat, inte femtio tusen utlovat.",
    "Det som ligger emellan trettio och femtio är semester, pension, sjukdom och de veckor ingen hör av sig.",
    "Nu först är friheten betald och inte lånad.",
  ],

  // Uthållighet
  rhythm: [
    "Logga vid samma hållpunkt varje dag. När du lagt dig fungerar bäst.",
    "Ofullständigt räknas. Bara sömnen ifylld är en loggad dag.",
    "Sju av fjorton, inte fjorton av fjorton. Hälften räcker.",
  ],
  moving: [
    "Lägg passet i en lucka som redan finns, inte i en du måste skapa. När de minsta somnat.",
    "Femton minuter kroppsvikt hemma: knäböj, utfall, plankan. Ingen restid, inget ombyte.",
    "En promenad räknas fullt ut. Cykel till jobbet räknas fullt ut.",
  ],
  sleeping: [
    "Efter ett kvällspass: samma nedvarvning varje gång, så kroppen känner igen signalen.",
    "6,5 timmar är tröskeln med flit. Den ska gå att nå efter ett sent pass.",
    "Sju nätter av fjorton. De andra sju får vara vad de blir.",
  ],
  energy_kept: [
    "Skatta innan du sätter dig vid datorn, inte efteråt.",
    "Ligger den på 1–2 flera kvällar i rad är det sömnen eller maten, inte viljan.",
    "Det här är noden karriärgrenen står på. Finns ingen ork blir inget av det andra gjort.",
  ],
  comeback: [
    "Den här kräver ett uppehåll först. Får du ett — bra, då är den plötsligt möjlig.",
    "Gör återkomstpasset löjligt litet med flit. Tio minuter. Målet är att bryta uppehållet, inte att ta igen det.",
    "Ta aldrig igen missade pass. Det är så nästa uppehåll börjar.",
  ],
  back_care: [
    "Fem minuter efter passet eller när du borstat tänderna. Koppla det till något du ändå gör.",
    "Har du ont i ryggen på riktigt: fråga en fysioterapeut vilka rörelser som passar just dig innan du kör ett program från nätet.",
    "Tio av trettio dagar. Det är var tredje dag, inte varje.",
  ],
  direction: [
    "Sätt viktmålet i formuläret först. Utan mål har vikten ingen riktning att mätas mot.",
    "Väg dig samma veckodag, samma tid, morgon före frukost.",
    "Noden läser trettio dagar. Dagsvärdet betyder ingenting och ska inte betyda något.",
  ],
  durable: [
    "Tjugofyra pass på nittio dagar är två i veckan med uppehållen inräknade.",
    "Missade veckor är redan inbakade i siffran. Du behöver inte kompensera dem.",
    "Öppnas den här har du gjort något du inte gjort förut: hållit i ett kvartal.",
  ],
};
