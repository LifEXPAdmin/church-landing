# Browse before joining

## Implementation — September 9, 2026

The `codex/guest-browsing` branch implements browsing public posts, comments and
church pages before creating an account. Local regression, browser acceptance and
the final production build passed; production publication is the next step.

Home invites visitors to look around and links to church discovery. Visitor
navigation opens public Churches; Explore also links to church pages. There are
no recurring signup overlays. Public author names and usernames remain visible,
while member profiles require authentication before the profile query runs.
Home, post details and anonymous search select only basic author information.
Anonymous search cannot match private-to-members biography text.

The new `/platform/posts/[postId]` page displays an eligible public post and its
discussion. Thirty comments are shown per page, with a stable timestamp/ID cursor
for older comments and a link back to the latest comments. Feed cards link to this
page so the existing six-comment preview does not hide the rest of a discussion.
Inactive authors' posts/comments remain excluded. Direct public church lookup
is independent of the first list page; guest church discovery has bounded pages
of 100 with an explicit More churches link.

Likes and adding a comment lead guests to a contextual Join or Sign in choice.
Member-profile access and settings receive the same account guidance. Connecting
to a church also preserves its destination. Existing actions still enforce their
session/origin/ownership rules. Authentication never automatically submits a like,
comment or membership request; the person chooses the action after returning.

The shared account-entry helper preserves only known in-app destinations and
bounded reading/search state. It rejects external/traversal/encoded destinations
and authentication loops, and drops arbitrary query parameters and fragments.
Login validates the destination again on the server. Switching signup/sign-in
and registration's subsequent sign-in retain the intended destination.

The existing private portal/support development guard remains. Public church
discovery can render in development through its explicit public-only projection,
without reading account cookies or private snapshots there. Membership, directory,
review, operator and support permissions are unchanged.

About, Help, Privacy, audience pages, settings and profile-edit guidance now
distinguish public posts/comments from member profiles. The profile gate does not
claim that material already viewed or saved has been erased.

## Scope and remaining work

This slice reuses the existing public post model. Full threaded replies, richer
post audiences, saved collections and reposts retain their owning roadmap tasks.
They must reuse the guest account-entry boundary when implemented. No nonworking
save/repost buttons are added. User-created topic communities are specified in the
private canonical roadmap, with discussion/moderation foundations; they are not
implemented by this slice. No production communities or activity are fabricated.

The authenticated church portal retains its existing bounded snapshot behavior;
broader church search/onboarding remains separate work. Topic communities never
confer church roles or verification.

No schema migration or dependency change is required. Rolling back to the prior
application would restore anonymous member-profile access, so a rollback must
retain the profile gate and minimal guest projections.

## Verification completed locally

Five new groups cover safe returns, anonymous HTML/RSC projections versus
authenticated profiles, complete comment pagination/inactive content, church
pagination/direct links and actual sign-in return behavior without automatic
participation. Existing session/lifecycle tests retain their authorization checks
while recognizing contextual guest entry.

The first full run passed the other guest checks and exposed a test expectation
about streamed missing-post responses. Direct reproduction showed document HTTP
404 and RSC HTTP 200 containing `NEXT_HTTP_ERROR_FALLBACK;404`, matching
[Next.js not-found behavior](https://nextjs.org/docs/app/api-reference/file-conventions/not-found).
The test now asserts both the appropriate transport status and the not-found
envelope, plus absence of unavailable content. The production page behavior did
not need changing for that finding.

The full isolated suite passed 121 applicable checks with no failures. Two
enabled-delivery cases are intentionally skipped in the disabled production-mode
pass; they pass in the enabled local run. Synthetic upgrade, restore, fresh
migrations and production process restart passed. Final lint/TypeScript and the
production build passed; runtime validation checked 55 traces, 3,977 entries and
127 server JavaScript files with no Prisma configuration-loader path.

Actual browser acceptance used an isolated loopback development server and
fictional accounts/content. A visitor read all 35 comments across 30/5 pages,
followed church pagination, opened a church introduction and saw the contextual
connection prompt. A member biography was absent before authentication. From a
post's Like link, keyboard signup and subsequent sign-in returned to that exact
post with zero likes; only a subsequent explicit Like changed it to one. The
member profile then exposed its biography, and explicit logout ended the session.

Guest Home and account prompts were visually inspected at 320, 390 and 1,440 px;
the settled document widths matched the viewport without horizontal overflow.
Browser warning/error logs were empty. The development-only Next.js tool button
overlapped the mobile Home control at 390 px; the logo and keyboard Home worked.
That tool is absent from production. These checks are browser viewport tests,
not physical Samsung/Safari or password-manager acceptance.

Production serving identity and read-only live results will be recorded after
publication. Full roadmap parents remain open.
