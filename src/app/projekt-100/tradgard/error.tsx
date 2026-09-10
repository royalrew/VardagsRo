"use client";

export default function GardenError({ reset }: { reset: () => void }) {
  return <section role="alert"><h1>Trädgården gick inte att hämta</h1><p>Kontrollera anslutningen och försök igen. Inga vanor har bockats av.</p><button type="button" onClick={reset}>Försök igen</button></section>;
}
