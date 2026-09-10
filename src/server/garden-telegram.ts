import { GARDEN_HABITS, type GardenAction, type GardenView } from "@/lib/garden";

export function isGardenCommand(text: string): boolean {
  return /^(?:\/(?:vanor|tradgard)(?:@[a-z0-9_]+)?|🌱 Min trädgård|mina vanor|min trädgård|trädgården)$/i.test(text.trim());
}

export function parseGardenCallback(data: string | undefined): { kind: "garden"; input?: GardenAction } | null {
  if (data === "garden:show") return { kind: "garden" };
  const start = /^garden:start:(\d{4}-\d{2}-\d{2})$/.exec(data ?? "");
  if (start) return { kind: "garden", input: { action: "start", date: start[1] } };
  const check = /^garden:check:(\d{4}-\d{2}-\d{2}):(move|love|learn|teeth|tomorrow):([01])$/.exec(data ?? "");
  if (!check) return null;
  const habit = GARDEN_HABITS.find(habit => habit.id === check[2]);
  return habit ? { kind: "garden", input: { action: "check", date: check[1], habit: habit.id, done: check[3] === "1" } } : null;
}

export function gardenTelegramMessage(view: GardenView) {
  const lines = [
    "🌱 Min trädgård",
    `${view.date} · ${view.streak} dagar i följd · ${view.checks.length}/5 klara`,
    "",
    ...GARDEN_HABITS.map(habit => `${view.checks.includes(habit.id) ? "✅" : "▫️"} ${habit.title}\n${habit.detail}`),
    "",
    !view.started ? "Plantera fröet för att börja idag." : view.checks.length === 5 ? "Alla fem klara. Trädgården har vuxit idag!" : "Tryck för att bocka av. Tryck igen för att ångra.",
    ...(view.resetOn === view.date ? ["En dag blev inte klar. Trädgården har börjat om från ett nytt frö."] : []),
    ...(view.surprises.some(gift => !gift.gift) ? ["✨ Något väntar i trädgården! Öppna Projekt 100 → Min trädgård för att upptäcka det."] : []),
    `Alla fem varje dag, före kl. 00.00 (${view.timeZone}). En missad dag återställer hela trädgården.`,
  ];
  return {
    text: lines.join("\n"),
    replyMarkup: {
      inline_keyboard: view.started ? [
        ...GARDEN_HABITS.map(habit => [{
          text: `${view.checks.includes(habit.id) ? "✅" : habit.icon} ${habit.title}`,
          callback_data: `garden:check:${view.date}:${habit.id}:${view.checks.includes(habit.id) ? "0" : "1"}`,
        }]),
        [{ text: "↻ Hämta dagens vanor", callback_data: "garden:show" }],
      ] : [[{ text: "🌱 Plantera mitt frö", callback_data: `garden:start:${view.date}` }]],
    },
  };
}
