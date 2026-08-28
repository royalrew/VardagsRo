import { headers } from "next/headers";
import { connection } from "next/server";

import { FamilyApp } from "@/components/FamilyApp";
import { LandingPage } from "@/components/LandingPage";
import { requireActorFromHeaders } from "@/server/actor";
import { demoFallbackAllowed } from "@/server/config";
import { loadDashboard } from "@/server/database";
import { AppError } from "@/server/errors";

export default async function HomePage() {
  await connection();

  let initialData;
  try {
    const actor = await requireActorFromHeaders(await headers());
    initialData = await loadDashboard(actor);
  } catch (error) {
    // Not signed in, or signed in without a household: both mean there is no
    // family data this visitor may see. They get the public page, which needs
    // no session and shows nothing about the household, rather than a login box
    // that explains nothing. Any other failure is a real error and must not be
    // hidden behind it.
    if (
      error instanceof AppError &&
      (error.code === "NOT_AUTHENTICATED" || error.code === "NO_HOUSEHOLD_MEMBERSHIP")
    ) {
      return <LandingPage />;
    }
    throw error;
  }

  return <FamilyApp initialData={initialData} allowLocalDemo={demoFallbackAllowed()} />;
}
