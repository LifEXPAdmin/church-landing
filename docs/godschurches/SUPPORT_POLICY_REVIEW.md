# Ordinary support privacy review

## Current decision, September 8, 2026

Deploy Stage 2C code and fictional demonstration, but keep real new-case intake off.
The existing public Privacy/Terms pages principally describe the landing waitlist;
they do not establish the operational facts required for real support case intake.
This internal review is not legal approval, jurisdiction advice or a public policy.
No legal entity, retention period, deletion guarantee or independent responder is
inferred from the domain, provider account, software, or founding role.

## Facts that are established

- The website is Godschurches at https://godschurches.com. Andrew is the only confirmed
  operator. The published direct contact is mcdrew169@yahoo.com.
- No real active verified adult account has been deliberately granted RESPOND and
  selected as the actual support recipient. Software permissions do not appoint him.
- Ordinary support stores account-linked plain text, optional fixed church context,
  conversation participants, status/feature decisions and minimal operational records
  in the existing PostgreSQL database. The site runs on the existing Vercel project.
- The requester and one currently assigned explicitly authorized support owner can
  read a case. Only deliberate requester sharing adds one eligible coordinator, with
  access to existing history and future replies. Other church members cannot read it.
- In-app updates only. No support email/SMS is sent. No guaranteed response time.
- Restricted redaction changes active content, not copies already seen or all backups.
  Existing protected database backup/restore access is restricted to the owner machine.

## Missing facts and prepared changes

| Required fact | Prepared change before enabling intake |
| --- | --- |
| Actual controller/operator identity and applicable audience/jurisdiction | Confirm identity, contact and relevant jurisdiction privately; have a qualified reviewer approve accurate public policy wording. Do not assume a legal company or worldwide legal compliance. |
| Who really receives/responds to requests | Verify the intended adult account and authority; document explicit RESPOND grant and default ownership. Publish that person's actual name through the form's scoped recipient disclosure. No automatic founder privilege. |
| Purpose and applicable processing basis | Review ordinary setup/account/feature support purpose and appropriate basis with the intended audience. UI sharing consent is an access decision, not proof of all legal requirements. |
| Retention and backup handling | Set a real operational retention/review period, backup access/expiry policy and verified data-request procedure. Do not invent a deletion scheduler or instant-backup-erasure promise. |
| Processors/transfers and rights/contact | Review actual Vercel/Neon processing arrangements and relevant rights/complaint authority. Incorporate support scope in the real privacy notice and link it from intake. |
| Independent privacy/security complaint route | Identify an actual independent route before real church pilot. Andrew cannot independently handle a complaint about himself. Do not imply this route is already staffed. |

Prepared public notice substance, subject to factual/legal review:
"Use this form for ordinary account, website and church setup help or feature
suggestions. We save your request and replies to provide and follow up on that help.
Before sending, you will see the assigned Godschurches support owner. A church
coordinator is not included unless you choose to share the conversation, including
its existing history. You can remove that optional access. Do not send passwords,
sign-in codes, private member lists or sensitive pastoral details. Replies are
available in My requests; this form does not send email."

This text is not a complete privacy policy. Add only the confirmed facts above to the
public policy, review it, then record the matching application notice version in
SupportIntakeSetting. Until then leave both the production feature switch off and
its database setting absent/disabled. A successful software deployment is not approval
of public intake. Existing direct contact remains available for people unable to sign in.

## Restricted request procedure

Use SUPPORT_OPERATIONS.md: verify requester identity/record scope privately, never
request passwords or codes, use assigned owner plus explicit REDACT capability, keep
only structured reason/reference in ordinary audit, and separately control backups.
Handle accidentally disclosed credentials by rotation at the issuing service, not by
merely redacting a case. Do not paste case content into general logs, analytics, chat
or screenshots. No real redaction, member import or sensitive intake is authorized by
this build. All implementation tests use fictional records on loopback databases.

## Sources and scope

The [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
supports deny-by-default, per-request authorization and relationship-scoped access.
The [ICO privacy information guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/)
identifies factual notice topics such as purposes, recipients, retention and rights.
It is a useful review reference, not evidence that UK GDPR applies or that this draft
satisfies any particular law. Technical privacy tests do not establish legal adequacy.
