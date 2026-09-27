export class AccountError extends Error {
  code:
    | "invalid"
    | "password-unsafe"
    | "credentials"
    | "registration"
    | "session"
    | "grant"
    | "handle-invalid"
    | "handle-taken"
    | "profile"
    | "profile-event"
    | "profile-disclosure"
    | "profile-conflict";
  constructor(code: AccountError["code"]) {
    super(code);
    this.code = code;
  }
}
