import type { FamilyPerson, FamilyTask } from "@/lib/types";

export interface CleaningAreaDef {
  personName: string;
  area: string;
  icon: string;
  description: string;
  presetTasks: string[];
}

export const KIDS_CLEANING_AREAS: CleaningAreaDef[] = [
  {
    personName: "Alma",
    area: "Lilla vardagsrummet",
    icon: "🛋️",
    description: "Plocka undan leksaker & prylar, puffa kuddar och dammsuga golvet.",
    presetTasks: [
      "Dammsuga lilla vardagsrummet",
      "Plocka undan leksaker & prylar",
      "Ordna kuddar och vika filtar",
      "Damma av bord och bänkar",
      "Torka av soffbordet",
    ],
  },
  {
    personName: "Shureym",
    area: "Stora vardagsrummet",
    icon: "📺",
    description: "Dammsuga stora vardagsrummet, plocka undan på bordet och torka bänken.",
    presetTasks: [
      "Dammsuga stora vardagsrummet",
      "Plocka undan på vardagsrumsbordet",
      "Ställa i ordning soffkuddar & filtar",
      "Torka av tv-bänken & bord",
      "Vädra och plocka undan glas & muggar",
    ],
  },
  {
    personName: "Cuzeyr",
    area: "Köket",
    icon: "🍳",
    description: "Torka köksbänkar och matbord, tömma diskmaskin och gå ut med soporna.",
    presetTasks: [
      "Torka av köksbänkar & matbord",
      "Tömma eller fylla diskmaskinen",
      "Gå ut med kökssoporna",
      "Sopa / dammsuga köksgolvet",
      "Plocka undan disk och ställa in i skåpen",
    ],
  },
];

export function getCleaningAreaForPerson(
  person: FamilyPerson | null | undefined,
): CleaningAreaDef | null {
  if (!person?.name) return null;
  const lowerName = person.name.toLowerCase();
  const lowerAliases = (person.aliases || []).map((a) => a.toLowerCase());

  return (
    KIDS_CLEANING_AREAS.find(
      (def) =>
        lowerName.includes(def.personName.toLowerCase()) ||
        lowerAliases.some((a) => a.includes(def.personName.toLowerCase())),
    ) ?? null
  );
}

export function getCleaningAreaByName(name: string): CleaningAreaDef | null {
  const lower = name.toLowerCase();
  return (
    KIDS_CLEANING_AREAS.find(
      (def) =>
        lower.includes(def.personName.toLowerCase()) ||
        lower.includes(def.area.toLowerCase()),
    ) ?? null
  );
}

export interface KidChoreSummary {
  person: FamilyPerson;
  cleaningArea: CleaningAreaDef | null;
  tasks: FamilyTask[];
  openCount: number;
  completedCount: number;
  allDone: boolean;
}

export function getKidsChoresOverview(
  people: FamilyPerson[],
  tasks: FamilyTask[],
): KidChoreSummary[] {
  const kids = people.filter(
    (p) => p.personType === "child" || getCleaningAreaForPerson(p) !== null,
  );

  return kids.map((person) => {
    const cleaningArea = getCleaningAreaForPerson(person);
    const personTasks = tasks.filter((t) => t.personId === person.id);
    const openCount = personTasks.filter((t) => !t.completedAt).length;
    const completedCount = personTasks.filter((t) => Boolean(t.completedAt)).length;
    const allDone = personTasks.length > 0 && openCount === 0;

    return {
      person,
      cleaningArea,
      tasks: personTasks,
      openCount,
      completedCount,
      allDone,
    };
  });
}
