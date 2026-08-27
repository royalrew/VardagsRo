import "server-only";

import { createTransport, type Transporter } from "nodemailer";

import { appBaseUrl, isProductionRuntime, smtpConfig } from "@/server/config";

/**
 * Sends the two letters this product needs: a password reset and an invitation.
 *
 * Neither carries family content. A reset mail holds a link; an invitation holds
 * a link and the household's name. No schedule, no document, no child's name
 * leaves the system this way, which is what makes an external mail provider an
 * ordinary choice here rather than a decision about processing children's data.
 */

let cached: Transporter | null = null;
let cachedKey = "";

function transporter(): Transporter | null {
  const config = smtpConfig();
  if (!config) return null;

  const key = `${config.host}:${config.port}:${config.user}`;
  if (!cached || cachedKey !== key) {
    cached = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
    });
    cachedKey = key;
  }
  return cached;
}

export function mailIsConfigured(): boolean {
  return smtpConfig() !== null;
}

interface Letter {
  to: string;
  subject: string;
  lines: string[];
  link: { label: string; url: string };
}

function textBody(letter: Letter): string {
  return [...letter.lines, "", letter.link.label, letter.link.url, "", "— Vardagsro"].join("\n");
}

async function send(letter: Letter): Promise<void> {
  const config = smtpConfig();
  const mailer = transporter();

  if (!config || !mailer) {
    if (isProductionRuntime()) {
      throw new Error("E-post är inte konfigurerad.");
    }
    // Development without mail configured is ordinary. Printing the link keeps
    // the flow testable locally without inventing a fake mail server.
    console.info(`[mail] ${letter.subject} → ${letter.to}\n${letter.link.url}`);
    return;
  }

  await mailer.sendMail({
    from: config.from,
    to: letter.to,
    subject: letter.subject,
    text: textBody(letter),
  });
}

export async function sendPasswordReset(to: string, url: string): Promise<void> {
  await send({
    to,
    subject: "Återställ ditt lösenord i Vardagsro",
    lines: [
      "Någon har begärt ett nytt lösenord till ditt konto i Vardagsro.",
      "Länken gäller en kort stund och kan bara användas en gång.",
      "Har du inte begärt det behöver du inte göra något alls.",
    ],
    link: { label: "Välj ett nytt lösenord här:", url },
  });
}

export async function sendHouseholdInvitation(
  to: string,
  householdName: string,
  url: string,
): Promise<void> {
  await send({
    to,
    subject: `Du är inbjuden till ${householdName} i Vardagsro`,
    lines: [
      `Du har blivit inbjuden till ${householdName} i Vardagsro.`,
      "Följ länken för att välja ett lösenord och komma igång.",
    ],
    link: { label: "Skapa din inloggning här:", url },
  });
}

/** The address the product is reachable at, for links inside letters. */
export function mailLinkBase(): string {
  return appBaseUrl();
}
