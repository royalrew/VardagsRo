import {
  answerTaskQuestionDeterministically,
  answerQuestionDeterministically,
  parseSwedishTaskQuestion,
  parseSwedishQuestion,
} from "@/lib/question-engine";
import type { AssistantAnswer, DashboardData } from "@/lib/types";
import { hasUnresolvedFamilyReference, planQuestionWithAI } from "@/server/ai";
import { translateAnswer } from "@/server/answer-translation";

export type QuestionData = Pick<
  DashboardData,
  "people" | "events" | "tasks" | "documents" | "currentPersonId" | "timezone"
>;

export async function answerFamilyQuestion(
  question: string,
  data: QuestionData,
  currentPersonId = data.currentPersonId,
): Promise<AssistantAnswer> {
  const now = new Date();
  const unresolvedPerson = hasUnresolvedFamilyReference(question, data.people, currentPersonId);
  const taskPlan = unresolvedPerson
    ? null
    : parseSwedishTaskQuestion(question, {
        people: data.people,
        now,
        timeZone: data.timezone,
        currentPersonId,
      });
  if (taskPlan) {
    return answerTaskQuestionDeterministically({
      plan: taskPlan,
      people: data.people,
      tasks: data.tasks,
      documents: data.documents,
      timeZone: data.timezone,
    });
  }

  const aiPlan = unresolvedPerson
    ? null
    : await planQuestionWithAI({
        question,
        people: data.people,
        timezone: data.timezone,
        now,
        currentPersonId,
      });
  const plan = unresolvedPerson
    ? null
    : aiPlan ??
      parseSwedishQuestion(question, {
        people: data.people,
        now,
        timeZone: data.timezone,
        currentPersonId,
      });
  if (!plan) {
    return {
      text: "Jag förstod inte vilken tid eller person du menade. Prova till exempel: ”Jobbar pappa på söndag?”",
      hasEnoughData: false,
      matchedEventIds: [],
      matchedTaskIds: [],
      sources: [],
      overlapMinutes: 0,
      periodLabel: "",
    };
  }

  const answer = answerQuestionDeterministically({
    plan,
    people: data.people,
    events: data.events,
    documents: data.documents,
    timeZone: data.timezone,
  });
  return translateAnswer(answer, plan.language);
}
