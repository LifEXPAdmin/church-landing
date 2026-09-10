"use client";
import { useRef, useState } from "react";
import { PasswordField } from "./account-fields";
import {
  GoogleButton,
  AccountConfirmation,
  useAccountConfirmation,
  googleRequest
} from "./google-account";

export function GoogleSignInMethods() {
  const confirmation = useAccountConfirmation("unlink-google");
  const linkForm = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  if (!confirmation.enabled) return null;
  const methods = confirmation.methods;
  return (
    <section
      className="gc-settings"
      aria-labelledby="sign-in-methods-title"
      aria-busy={pending}
    >
      <h2 id="sign-in-methods-title">Sign-in methods</h2>
      {!methods ? (
        <p role="status">
          {confirmation.loading
            ? "Loading sign-in methods…"
            : "Your sign-in methods could not be loaded."}
        </p>
      ) : (
        <>
          <p>
            Password: {methods.password ? "Available" : "Not set"}. Google:{" "}
            {methods.google ? "Connected" : "Not connected"}.
          </p>
          <p className="text-gc-muted">
            Your Google identity signs into this same account. Changing your
            Google email does not change your Godschurches sign-in email.
          </p>
          {!methods.password && (
            <p>
              <a
                href="#account-change-password-form"
                className="text-gc-accent underline"
              >
                Add a password
              </a>{" "}
              before removing Google. Keep at least one sign-in method.
            </p>
          )}
          {methods.google ? (
            methods.password ? (
              <form
                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (busy.current || !confirmation.ready) return;
                  busy.current = true;
                  setPending(true);
                  setMessage("");
                  const form = event.currentTarget;
                  try {
                    const result = await googleRequest({
                      operation: "unlink",
                      ...confirmation.credentials(new FormData(form))
                    });
                    form.reset();
                    setMessage(result.message);
                    confirmation.finish();
                    await confirmation.refresh();
                  } catch (error) {
                    confirmation.finish();
                    setMessage(
                      error instanceof Error && !(error instanceof TypeError)
                        ? error.message
                        : "Could not confirm the response. Reload your sign-in methods before trying again."
                    );
                  } finally {
                    busy.current = false;
                    setPending(false);
                  }
                }}
              >
                <p className="text-gc-muted">
                  Disconnecting Google signs out other sessions. This session
                  and your password keep working.
                </p>
                <AccountConfirmation
                  value={confirmation}
                  id="unlink-google-password"
                  label="Confirm Google disconnection"
                />
                <button
                  className="gc-button gc-button-quiet"
                  type="submit"
                  disabled={pending || !confirmation.ready}
                >
                  Disconnect Google
                </button>
              </form>
            ) : (
              <p className="text-gc-muted">
                Google is your only sign-in method. Add a password below before
                disconnecting it.
              </p>
            )
          ) : methods.password ? (
            <form
              ref={linkForm}
              className="space-y-4"
              onSubmit={(event) => event.preventDefault()}
            >
              <p className="text-gc-muted">
                Confirm your current password, then choose the Google account
                you want to connect.
              </p>
              <PasswordField
                id="link-google-password"
                name="currentPassword"
                label="Current password to connect Google"
                autocomplete="current-password"
              />
              <GoogleButton
                submit
                label="Sign in with Google to connect this account"
                body={() => {
                  if (!linkForm.current?.reportValidity()) return null;
                  return {
                    operation: "link",
                    currentPassword: new FormData(linkForm.current).get(
                      "currentPassword"
                    )
                  };
                }}
              />
            </form>
          ) : (
            <p className="text-gc-muted">
              Use verified account recovery before adding a sign-in method.
            </p>
          )}
        </>
      )}
      {message && (
        <p role="status" className="break-words text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
