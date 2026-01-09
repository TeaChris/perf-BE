export interface CommonDataFields {
        to: string;
        priority?: string;
        username?: string;
}

export interface WelcomeEmailData extends CommonDataFields {
        verificationLink: string;
        email: string;
}

export type EmailJobData = { type: 'welcomeEmail'; data: WelcomeEmailData };
//   | { type: 'resetPassword'; data: ResetPasswordData }
//   | { type: 'forgotPassword'; data: ForgotPasswordData }
//   | { type: 'restoreAccount'; data: RestoreAccountData }
//   | { type: 'fallbackOTP'; data: FallbackOTPEmailData };
