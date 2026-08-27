import { describe, expect, it } from "vitest";

import { unsupportedHealthDocument } from "@/server/health-documents";

function document(documentType: string, title: string) {
  return { documentType, title };
}

describe("unsupportedHealthDocument", () => {
  it("refuses the care documents Version 1 deliberately avoids", () => {
    expect(unsupportedHealthDocument(document("Kallelse", "Tandläkarbesök"))).toBe("tandläkar");
    expect(unsupportedHealthDocument(document("Folktandvården", "Tid"))).toBe("tandvård");
    expect(unsupportedHealthDocument(document("Vårdcentralen", "Tid för besök"))).toBe(
      "vårdcentral",
    );
    expect(unsupportedHealthDocument(document("Kallelse", "Vaccination åk 8"))).toBe("vaccin");
    expect(unsupportedHealthDocument(document("Remiss", "Till logoped"))).toBe("remiss");
  });

  it("refuses the abbreviations that only mean care on their own", () => {
    expect(unsupportedHealthDocument(document("Kallelse BVC", "18 månader"))).toBe("bvc");
    expect(unsupportedHealthDocument(document("BUP", "Uppföljning"))).toBe("bup");
  });

  it("lets ordinary school post through, which is what the family mostly uploads", () => {
    expect(unsupportedHealthDocument(document("Skolbrev", "Veckobrev v36"))).toBeNull();
    expect(
      unsupportedHealthDocument(document("Kallelse", "Utvecklingssamtal 15 september")),
    ).toBeNull();
    expect(unsupportedHealthDocument(document("Skolschema", "Schema 7A vecka 36"))).toBeNull();
    expect(unsupportedHealthDocument(document("Blankett", "Tillstånd för utflykt"))).toBeNull();
    expect(unsupportedHealthDocument(document("Arbetsschema", "Medvind vecka 36"))).toBeNull();
  });

  it("matches the ordinary inflections, not just the dictionary form", () => {
    expect(unsupportedHealthDocument(document("Kallelse", "Tandläkartid"))).toBe("tandläkar");
    expect(unsupportedHealthDocument(document("Brev", "Från sjukhuset"))).toBe("sjukhus");
    expect(unsupportedHealthDocument(document("Brev", "Elevhälsan informerar"))).toBe("elevhälsa");
  });

  it("does not trip on a word that merely contains an abbreviation", () => {
    // "vc" inside another word is not a health centre.
    expect(unsupportedHealthDocument(document("Skolbrev", "Servicedag"))).toBeNull();
    expect(unsupportedHealthDocument(document("Information", "Bupolen sportlov"))).toBeNull();
  });

  it("reads the type and the title, not the whole document", () => {
    // A school letter that mentions the nurse in passing is still a school
    // letter. Refusing it would make the product useless for its main purpose.
    expect(unsupportedHealthDocument(document("Skolbrev", "Information inför höstterminen"))).toBeNull();
  });

  it("is case insensitive, because the model does not promise casing", () => {
    expect(unsupportedHealthDocument(document("KALLELSE", "TANDLÄKARE"))).toBe("tandläkar");
  });
});
