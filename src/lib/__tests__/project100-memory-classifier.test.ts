import { describe, expect, it } from "vitest";

import {
  inferCategoryFromContent,
  parseMemoryCommand,
} from "@/lib/project100-memory-classifier";

describe("project100-memory-classifier", () => {
  it("parses explicit prefix syntax correctly", () => {
    const jobRes = parseMemoryCommand("Jobb - Koden till inkontinensförrådet är 2214");
    expect(jobRes).toEqual({
      type: "store",
      category: "job",
      kind: "fact",
      content: "Koden till inkontinensförrådet är 2214",
    });

    const carRes = parseMemoryCommand("Bilen - Däckdimensionen är 205/55 R16");
    expect(carRes).toEqual({
      type: "store",
      category: "car",
      kind: "fact",
      content: "Däckdimensionen är 205/55 R16",
    });

    const houseRes = parseMemoryCommand("Huset - Färgkoden i hallen är Jotun 10341");
    expect(houseRes).toEqual({
      type: "store",
      category: "house",
      kind: "fact",
      content: "Färgkoden i hallen är Jotun 10341",
    });
  });

  it("infers category from natural language statements", () => {
    expect(inferCategoryFromContent("Oljefiltret heter W712 till bilen")).toBe("car");
    expect(inferCategoryFromContent("Inkontinensförrådet på jobbet")).toBe("job");
    expect(inferCategoryFromContent("Färgkod i kök och hall")).toBe("house");
    expect(inferCategoryFromContent("Alice skostorlek")).toBe("kids");
  });

  it("parses natural language store phrases", () => {
    const res = parseMemoryCommand("Kom ihåg att oljefiltret till bilen heter W712");
    expect(res).toEqual({
      type: "store",
      category: "car",
      kind: "fact",
      content: "oljefiltret till bilen heter W712",
    });

    const directFact = parseMemoryCommand("Koden till inkontinensförrådet är 2214");
    expect(directFact).toEqual({
      type: "store",
      category: "job",
      kind: "fact",
      content: "Koden till inkontinensförrådet är 2214",
    });
  });

  it("parses memory queries with targeted categories", () => {
    const q1 = parseMemoryCommand("Vad är koden till inkontinensförrådet?");
    expect(q1.type).toBe("query");
    if (q1.type === "query") {
      expect(q1.category).toBe("job");
    }

    const q2 = parseMemoryCommand("Vilka däck har vi på bilen?");
    expect(q2.type).toBe("query");
    if (q2.type === "query") {
      expect(q2.category).toBe("car");
    }

    const q3 = parseMemoryCommand("Bilen däck");
    expect(q3).toEqual({
      type: "query",
      query: "däck",
      category: "car",
    });
  });

  it("returns none for normal non-memory questions", () => {
    expect(parseMemoryCommand("Jobbar jag på söndag?").type).toBe("none");
    expect(parseMemoryCommand("När börjar passet?").type).toBe("none");
    expect(parseMemoryCommand("Hej!").type).toBe("none");
  });
});
