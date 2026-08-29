import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { Project100Shell } from "@/components/project100/Project100Shell";
import { AppError } from "@/server/errors";
import { requireProject100Actor } from "@/server/project100";

export const metadata: Metadata = {
  title: { default: "Projekt 100", template: "%s – Projekt 100" },
  description: "Din privata arbetsyta för träning, kost, kropp och utveckling.",
  robots: { index: false, follow: false },
};

export default async function Project100Layout({ children }: { children: React.ReactNode }) {
  await connection();

  let actor;
  try {
    actor = await requireProject100Actor();
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_AUTHENTICATED") redirect("/login");
    if (error instanceof AppError && error.code === "NO_HOUSEHOLD_MEMBERSHIP") redirect("/");
    throw error;
  }
  if (actor.personType !== "adult") redirect("/");

  return <Project100Shell>{children}</Project100Shell>;
}
