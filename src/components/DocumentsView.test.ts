import { describe, expect, it } from "vitest";

import { descendantFolderIds } from "@/components/DocumentsView";
import type { FamilyDocumentFolder } from "@/lib/types";

const timestamp = "2026-08-21T12:00:00.000Z";
const folders: FamilyDocumentFolder[] = [
  { id: "school", householdId: "household-demo", parentId: null, name: "Skola", createdAt: timestamp, updatedAt: timestamp },
  { id: "letters", householdId: "household-demo", parentId: "school", name: "Brev", createdAt: timestamp, updatedAt: timestamp },
  { id: "weekly", householdId: "household-demo", parentId: "letters", name: "Veckobrev", createdAt: timestamp, updatedAt: timestamp },
  { id: "sports", householdId: "household-demo", parentId: null, name: "Sport", createdAt: timestamp, updatedAt: timestamp },
];

describe("document tree contracts", () => {
  it("collects every descendant used to prevent folder cycles", () => {
    expect([...descendantFolderIds(folders, "school")].sort()).toEqual(["letters", "weekly"]);
    expect([...descendantFolderIds(folders, "sports")]).toEqual([]);
  });
});
