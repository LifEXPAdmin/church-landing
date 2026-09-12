export class AccountError extends Error {
  code:
    | "invalid"
    | "credentials"
    | "registration"
    | "session"
    | "grant"
    | "handle-invalid"
    | "handle-taken"
    | "profile"
    | "profile-conflict";
  constructor(code: AccountError["code"]) {
    super(code);
    this.code = code;
  }
}
