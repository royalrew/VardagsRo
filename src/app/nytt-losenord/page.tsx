import type { Metadata } from "next";
import { Suspense } from "react";

import { NewPasswordForm } from "@/components/NewPasswordForm";

export const metadata: Metadata = {
  title: "Nytt lösenord – Vardagsro",
  robots: { index: false, follow: false },
};

export default function NewPasswordPage() {
  return (
    <Suspense fallback={null}>
      <NewPasswordForm />
    </Suspense>
  );
}
