import type { Mailer } from "./types.js";

export interface SentEmail {
  to: string;
  subject: string;
  token: string;
  url: string;
  type: "verification" | "reset";
  timestamp: Date;
}

/**
 * Console/Dev transport mailer.
 * Default mailer transport for local development and offline testing.
 * Logs email links to the console and records sent emails in memory for assertions.
 */
export class ConsoleMailer implements Mailer {
  public sentEmails: SentEmail[] = [];

  async sendVerificationEmail(to: string, token: string, verifyUrl: string): Promise<void> {
    const subject = "Verify your CiteDocs account";
    this.sentEmails.push({
      to,
      subject,
      token,
      url: verifyUrl,
      type: "verification",
      timestamp: new Date(),
    });

    if (process.env.NODE_ENV !== "test") {
      console.log(`[CiteDocs Mailer] ✉️ Verification email sent to: ${to}`);
      console.log(`[CiteDocs Mailer] 👉 Verification URL: ${verifyUrl}`);
      console.log(`[CiteDocs Mailer] 🔑 Token: ${token}`);
    }
  }

  async sendPasswordResetEmail(to: string, token: string, resetUrl: string): Promise<void> {
    const subject = "Reset your CiteDocs password";
    this.sentEmails.push({
      to,
      subject,
      token,
      url: resetUrl,
      type: "reset",
      timestamp: new Date(),
    });

    if (process.env.NODE_ENV !== "test") {
      console.log(`[CiteDocs Mailer] ✉️ Password reset email sent to: ${to}`);
      console.log(`[CiteDocs Mailer] 👉 Reset URL: ${resetUrl}`);
      console.log(`[CiteDocs Mailer] 🔑 Token: ${token}`);
    }
  }

  clear(): void {
    this.sentEmails = [];
  }

  getLastEmail(): SentEmail | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  getEmailsFor(to: string): SentEmail[] {
    return this.sentEmails.filter((e) => e.to.toLowerCase() === to.toLowerCase());
  }
}

/**
 * Creates the active mailer instance based on environment configuration.
 * Pluggable: defaults to ConsoleMailer.
 */
export function createMailer(): Mailer {
  return new ConsoleMailer();
}
