export interface CommonDataFields {
      to: string;
      priority?: string;
      username?: string;
}

export interface WelcomeEmailData extends CommonDataFields {
      verificationLink: string;
      email: string;
}

export type EmailJobData = WelcomeEmailData;
