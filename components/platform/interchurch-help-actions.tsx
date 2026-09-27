"use client";
import Link from "next/link";
import { reportEntryHref } from "@/lib/platform/community-report-types";
import { useState } from "react";
import { EXCHANGE_ITEM_POLICY } from "@/lib/platform/exchange-options";
import {
  helpOfferStates,
  helpAgreementStates,
  emptyHelpTerms,
  type HelpTermsFields
} from "@/lib/platform/interchurch-help-options";
import {
  HelpCheck,
  HelpField,
  HelpSelect,
  HelpTermsEditor,
  HelpTermsSummary,
  helpButton,
  type HelpCommand,
  type HelpPageData
} from "./interchurch-help-editor";
type Context = Extract<HelpPageData, { view: "context" }>;
type Request = Extract<HelpPageData, { view: "request" }>;
export function HelpOfferForm({
  request,
  churches,
  visible,
  blocked,
  command,
  onDirty
}: {
  request: Request;
  churches: Context["churches"];
  visible: boolean;
  blocked: boolean;
  command: HelpCommand;
  onDirty: (v: boolean) => void;
}) {
  const [kind, setKind] = useState("PERSONAL"),
    [church, setChurch] = useState(""),
    [terms, setTerms] = useState(request.request.terms),
    [accepted, accept] = useState(false),
    [notices, setNotices] = useState(false);
  if (!visible) return null;
  return (
    <form
      aria-label="Private help offer"
      className="space-y-4 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void command({
          operation: "help-offer",
          requestId: request.request.id,
          expectedVersion: request.request.termsVersion,
          kind,
          respondingChurchId: kind === "PERSONAL" ? null : church,
          schema: 1,
          terms,
          acceptResponsibility: accepted,
          externalNotices: notices
        });
      }}
    >
      <h2 className="text-2xl">Offer help privately</h2>
      <p>
        Only you and the named coordinator can read this offer. Other responders
        and church managers cannot read it. No phone number is required.
      </p>
      <fieldset disabled={blocked} className="min-w-0 space-y-3">
        <HelpSelect
          label="I am offering"
          value={kind}
          onChange={(v) => {
            setKind(v);
            onDirty(true);
          }}
          choices={{
            PERSONAL: "My own participation or resources",
            ORGANIZATION: "Resources of a church I may represent"
          }}
        />
        {kind === "ORGANIZATION" && (
          <HelpSelect
            label="Represented church"
            value={church}
            onChange={(v) => {
              setChurch(v);
              onDirty(true);
            }}
            choices={Object.fromEntries(
              churches.filter((c) => c.canOffer).map((c) => [c.id, c.name])
            )}
          />
        )}
        {kind === "ORGANIZATION" && !churches.some((c) => c.canOffer) && (
          <p>
            No current church commitment permission is available. Church
            membership and Exchange management do not authorize a church offer.
          </p>
        )}
        <HelpTermsEditor
          value={terms}
          onChange={(v) => {
            setTerms(v);
            onDirty(true);
          }}
        />
        <HelpCheck
          checked={accepted}
          onChange={(v) => {
            accept(v);
            onDirty(true);
          }}
        >
          I explicitly accept responsibility for the scope shown. I offer only
          my own participation or church resources I am authorized to represent.
          I cannot sign up other adults.
        </HelpCheck>
        <HelpCheck
          checked={notices}
          onChange={(v) => {
            setNotices(v);
            onDirty(true);
          }}
        >
          Allow optional push notices for this private offer, subject to my
          notification settings and quiet hours.
        </HelpCheck>
        <button className={helpButton}>Submit private offer</button>
      </fieldset>
    </form>
  );
}
export function HelpRequestActions({
  page,
  visible,
  blocked,
  command,
  onDirty
}: {
  page: Request;
  visible: boolean;
  blocked: boolean;
  command: HelpCommand;
  onDirty: (v: boolean) => void;
}) {
  const [confirmed, confirm] = useState(false),
    [reason, setReason] = useState(""),
    [outcome, setOutcome] = useState("CLOSED"),
    [display, setDisplay] = useState("");
  if (!visible || !page.manage) return null;
  const base = {
    requestId: page.request.id,
    expectedVersion: page.request.version
  };
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-2xl">Request controls</h2>
      <fieldset className="min-w-0 space-y-3" disabled={blocked}>
        {page.listing.state === "DRAFT" && (
          <>
            <HelpCheck
              checked={confirmed}
              onChange={(v) => {
                confirm(v);
                onDirty(true);
              }}
            >
              I may publish this request and have described its audience, duties
              and compensation honestly.
            </HelpCheck>
            <button
              type="button"
              className={helpButton}
              onClick={() =>
                void command({
                  operation: "help-publish",
                  ...base,
                  itemPolicy: EXCHANGE_ITEM_POLICY,
                  itemConfirmed: confirmed
                })
              }
            >
              Publish request
            </button>
          </>
        )}
        {!page.isCoordinator && (
          <>
            <HelpField
              label="My public coordinator name or role"
              value={display}
              onChange={(v) => {
                setDisplay(v);
                onDirty(true);
              }}
            />
            <HelpCheck
              checked={confirmed}
              onChange={(v) => {
                confirm(v);
                onDirty(true);
              }}
            >
              I explicitly accept current coordinator responsibility. Old
              private offers will not transfer to me.
            </HelpCheck>
            <button
              type="button"
              className={helpButton}
              onClick={() =>
                void command({
                  operation: "help-coordinator",
                  ...base,
                  acceptCoordinator: confirmed,
                  coordinatorDisplay: display
                })
              }
            >
              Accept coordinator responsibility
            </button>
          </>
        )}
        <HelpSelect
          label="Request outcome"
          value={outcome}
          onChange={(v) => {
            setOutcome(v);
            onDirty(true);
          }}
          choices={{
            CLOSED: "Close to new offers",
            CANCELED: "Cancel request",
            PARTIAL: "Partly fulfilled",
            FULFILLED: "Fulfilled"
          }}
        />
        <HelpField
          label="Outcome explanation and delivered scope"
          type="textarea"
          value={reason}
          maxLength={1000}
          onChange={(v) => {
            setReason(v);
            onDirty(true);
          }}
        />
        <p>
          Closing stops new offers. It does not complete an agreement. Fulfilled
          requires the current coordinator’s explicit confirmation that the full
          requested scope and every selected agreement were completed.
        </p>
        <button
          type="button"
          className={helpButton}
          onClick={() =>
            void command({ operation: "help-close", ...base, outcome, reason })
          }
        >
          Record request outcome
        </button>
      </fieldset>
    </section>
  );
}
type Offer = Extract<HelpPageData, { view: "offers" }>["offers"][number];
export function HelpOfferCard({
  row,
  visible,
  blocked,
  command,
  onDirty
}: {
  row: Offer;
  visible: boolean;
  blocked: boolean;
  command: HelpCommand;
  onDirty: (v: boolean) => void;
}) {
  const [accepted, accept] = useState(false),
    [contactAccepted, acceptContact] = useState(false),
    [amendAccepted, acceptAmendment] = useState(false),
    [notices, setNotices] = useState(false),
    [reason, setReason] = useState(""),
    [contact, setContact] = useState("");
  const [terms, setTerms] = useState<HelpTermsFields>(
    row.available
      ? ((row.agreement?.terms as HelpTermsFields) ?? row.terms)
      : emptyHelpTerms
  );
  if (!visible) return null;
  const a = row.agreement;
  const action = (
    operation: string,
    extra: Record<string, unknown> = {},
    offerAction = false
  ) =>
    void command({
      operation: "help-" + operation,
      offerId: row.id,
      expectedVersion: offerAction ? row.version : (a?.version ?? 0),
      ...extra
    });
  return (
    <article
      className="space-y-4 rounded-xl border p-4"
      aria-label="Private ministry offer"
    >
      <h2 className="text-2xl">
        {row.available ? row.requestTitle : "Your ministry help responsibility"}
      </h2>
      {!row.available ? (
        <p>
          Current source access is unavailable. Only your own withdrawal,
          contact withdrawal and cancellation remain available. Old private
          logistics are concealed.
        </p>
      ) : (
        <>
          <p>
            {row.kind === "PERSONAL" ? "Personal offer" : "Organization offer"}{" "}
            · {helpOfferStates[row.state as keyof typeof helpOfferStates]}
          </p>
          <p>
            Named responder: {row.responderName}. Request coordinator:{" "}
            {row.coordinatorDisplay}.
          </p>
          {row.kind === "ORGANIZATION" && (
            <p>
              Represented church: {row.respondingChurchName}. This offer does
              not enroll other people or establish qualifications.
            </p>
          )}
          <HelpTermsSummary terms={row.terms} />
        </>
      )}
      {row.available && (
        <Link
          className="underline"
          href={reportEntryHref("INTERCHURCH_OFFER", row.id)}
        >
          Report this selected private offer
        </Link>
      )}
      <fieldset className="min-w-0 space-y-3" disabled={blocked}>
        {row.state === "OFFERED" && row.own && (
          <button
            className={helpButton}
            type="button"
            onClick={() => action("withdraw", {}, true)}
          >
            Withdraw pending offer
          </button>
        )}
        {row.available && row.state === "OFFERED" && (
          <>
            <HelpCheck
              checked={accepted}
              onChange={(v) => {
                accept(v);
                onDirty(true);
              }}
            >
              I explicitly accept the displayed scope and responsibility.
            </HelpCheck>
            <HelpCheck
              checked={notices}
              onChange={(v) => {
                setNotices(v);
                onDirty(true);
              }}
            >
              Allow optional push notices, subject to my notification settings.
            </HelpCheck>
            {row.own ? (
              <details>
                <summary>Edit my pending offer</summary>
                <HelpTermsEditor
                  value={terms}
                  onChange={(v) => {
                    setTerms(v);
                    onDirty(true);
                  }}
                />
                <button
                  type="button"
                  className={helpButton}
                  onClick={() =>
                    action(
                      "edit-offer",
                      {
                        schema: 1,
                        terms,
                        requestTermsVersion: row.requestTermsVersion,
                        acceptResponsibility: accepted
                      },
                      true
                    )
                  }
                >
                  Save revised offer
                </button>
              </details>
            ) : (
              <>
                <button
                  type="button"
                  className={helpButton}
                  onClick={() =>
                    action(
                      "select",
                      {
                        requestTermsVersion: row.requestTermsVersion,
                        acceptTerms: accepted,
                        externalNotices: notices
                      },
                      true
                    )
                  }
                >
                  Select and acknowledge offer
                </button>
                <button
                  type="button"
                  className={helpButton}
                  onClick={() => action("decline", {}, true)}
                >
                  Decline offer
                </button>
              </>
            )}
          </>
        )}
        {a && (
          <>
            <h3 className="text-xl">
              Agreement:{" "}
              {helpAgreementStates[a.state as keyof typeof helpAgreementStates]}
            </h3>
            {row.available && row.agreement && "terms" in row.agreement && (
              <>
                <HelpTermsSummary
                  terms={row.agreement.terms as HelpTermsFields}
                />
                <p>
                  Terms version {row.agreement.termsVersion}. Each participant
                  must acknowledge this exact version.
                </p>
                <p>
                  Coordinator acknowledgment:{" "}
                  {row.agreement.requesterAcknowledged ===
                  row.agreement.termsVersion
                    ? "Recorded"
                    : "Pending"}
                  . Responder acknowledgment:{" "}
                  {row.agreement.responderAcknowledged ===
                  row.agreement.termsVersion
                    ? "Recorded"
                    : "Pending"}
                  .
                </p>
                {!["COMPLETED", "CANCELED", "REVOKED"].includes(a.state) && (
                  <>
                    <HelpCheck
                      checked={accepted}
                      onChange={(v) => {
                        accept(v);
                        onDirty(true);
                      }}
                    >
                      I acknowledge the exact current terms shown for this
                      private agreement.
                    </HelpCheck>
                    <HelpCheck
                      checked={notices}
                      onChange={(v) => {
                        setNotices(v);
                        onDirty(true);
                      }}
                    >
                      Allow optional push notices for this agreement, subject to
                      my notification settings.
                    </HelpCheck>
                    <button
                      type="button"
                      className={helpButton}
                      onClick={() =>
                        action("acknowledge", {
                          termsVersion: row.agreement!.termsVersion,
                          requestTermsVersion: row.requestTermsVersion,
                          acceptTerms: accepted,
                          externalNotices: notices
                        })
                      }
                    >
                      Acknowledge current agreement
                    </button>
                    <details>
                      <summary>Propose a material amendment</summary>
                      <HelpTermsEditor
                        value={terms}
                        onChange={(v) => {
                          setTerms(v);
                          acceptAmendment(false);
                          onDirty(true);
                        }}
                      />
                      <HelpCheck
                        checked={amendAccepted}
                        onChange={(v) => {
                          acceptAmendment(v);
                          onDirty(true);
                        }}
                      >
                        I explicitly accept the revised terms entered above.
                      </HelpCheck>
                      <button
                        type="button"
                        className={helpButton}
                        onClick={() =>
                          action("amend", {
                            schema: 1,
                            terms,
                            requestTermsVersion: row.requestTermsVersion,
                            acceptTerms: amendAccepted
                          })
                        }
                      >
                        Propose new terms
                      </button>
                    </details>
                  </>
                )}
                {a.state === "CONFIRMED" && (
                  <>
                    <p>
                      My chosen contact:{" "}
                      {row.agreement.ownContact || "Not shared"}
                    </p>
                    <p>
                      Other participant’s chosen contact:{" "}
                      {row.agreement.otherContact || "Not shared"}
                    </p>
                    <HelpField
                      label="My optional contact for this exact pair"
                      value={contact}
                      maxLength={250}
                      onChange={(v) => {
                        setContact(v);
                        acceptContact(false);
                        onDirty(true);
                      }}
                    />
                    <HelpCheck
                      checked={contactAccepted}
                      onChange={(v) => {
                        acceptContact(v);
                        onDirty(true);
                      }}
                    >
                      Share only the contact value I entered with this
                      agreement’s other participant.
                    </HelpCheck>
                    <button
                      type="button"
                      className={helpButton}
                      onClick={() =>
                        action("contact", {
                          termsVersion: row.agreement!.termsVersion,
                          contact,
                          consent: contactAccepted
                        })
                      }
                    >
                      Share chosen contact
                    </button>
                  </>
                )}
                {row.agreement.completionNote && (
                  <p>Recorded outcome: {row.agreement.completionNote}</p>
                )}
              </>
            )}
            <button
              type="button"
              className={helpButton}
              onClick={() => action("withdraw-contact")}
            >
              Withdraw my contact sharing
            </button>
            {!["CANCELED", "COMPLETED"].includes(a.state) && (
              <>
                <HelpField
                  label="Cancellation or completion explanation"
                  type="textarea"
                  value={reason}
                  maxLength={1000}
                  onChange={(v) => {
                    setReason(v);
                    onDirty(true);
                  }}
                />
                <button
                  type="button"
                  className={helpButton}
                  onClick={() => action("cancel", { reason })}
                >
                  Cancel my remaining commitment
                </button>
                {row.available && !row.own && a.state === "CONFIRMED" && (
                  <button
                    type="button"
                    className={helpButton}
                    onClick={() => action("complete", { reason })}
                  >
                    Confirm agreed scope completed
                  </button>
                )}
              </>
            )}
          </>
        )}
      </fieldset>
    </article>
  );
}
