import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { FamilyApp } from "@/components/FamilyApp";
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
    // Not signed in, or signed in without a household: both mean there is
    // nothing this visitor may see, and the login page is where they say who
    // they are. Any other failure is a real error and must not be hidden.
    if (
      error instanceof AppError &&
      (error.code === "NOT_AUTHENTICATED" || error.code === "NO_HOUSEHOLD_MEMBERSHIP")
    ) {
      redirect("/login");
    }
    throw error;
  }

  return <FamilyApp initialData={initialData} allowLocalDemo={demoFallbackAllowed()} />;
}
