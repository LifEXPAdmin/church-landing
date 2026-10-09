# Bounded native comment reading

Recorded 8 October 2026. This checkpoint prepares the shared native comment
controller and presentation. It is not connected to the running app yet.

## Canonical source

The comments schema, query, read endpoint, guest binding, fictional example and
contract tests come from the verified canonical reader
`4c20284065db45eca1c59a7e5a955ce78ffe9a18`. Only those released blocks were
consumed. Other contracts and the frozen initial native compatibility fixtures
are unchanged. Server comments, permissions, projection, cursor signing and
database implementation remain in their existing website owners.

The existing versioned endpoint is `GET /api/platform/v1/posts/:postId/comments`
with the `comments.read` capability. Its response decoder bounds a page to
20 comments, with at most one root, target and conversation-wide pin alongside
the page. The target may be outside the current page. This client does not
accumulate pages, cache content on disk or add a read timer.

## State and presentation

`mobile/src/reading/comment-controller.ts` receives the existing session and
parent reader, plus a narrow injected comments read port. It uses the canonical
decoder, verifies the requested post/sort/root/target relationships, and exposes
immutable snapshots. The eventual port must use the existing canonical request
executor and native transport. No alternate session, network client, credential
store or account policy is created here.

Reading is explicit. The selected authorized parent detail is required; revealing
its content note is not. This matches the website's separate comment discussion.
A plain repost uses its permitted original post's discussion. A quote uses its
own discussion. A missing plain-repost source cannot open comments.

Roots support oldest or newest order. Replies and linked context use oldest
order. A new selection and a refresh start without a cursor. Next page preserves
the exact query, so a context cursor never becomes a replies cursor. An unavailable
root can still open its permitted replies; its structural placeholder does not
grant a write permission. Malformed or mismatched responses never become visible.

Each command carries the exact snapshot that supplied its control. Owner or
generation changes, background concealment, route departure, a replaced parent
response, explicit closure and disposal abort pending work and drop the selected
query, cursor and response. Late promises cannot restore them. Only a confirmed
current canonical session rejection goes through the existing session authority.

The parent reader rechecks access after 30 seconds. Its loading state does not
identify a continuing navigation visit, so this preparation closes comments at
that boundary and requires an explicit reopening. A reveal-only presentation
change keeps the same post response and does not close comments. Preserving thread
selection across a passive recheck needs a separately reviewed navigation-visit
binding; matching a post ID alone is insufficient.

`mobile/src/ui/NativeCommentThread.tsx` is a semantic presentation leaf using the
existing Button, Card and Text primitives. It displays full accepted comment text,
including valid empty text, public person/church attribution, edited/post-author
markers, permitted mention names and null-aware Like counts. Unavailable comments
remain neutral. Legacy comments that require the website retain a structural
placeholder and permitted reply navigation. Pinned/root/target duplicates display
once. Writing, reactions, prayer operations and conversation settings remain on
the website. No inactive native write control or unreviewed external link is added.

The leaf carries the rendered snapshot with each action but owns no subscription
or lifecycle. Its eventual mounted owner must subscribe to the controller, apply
the app's existing privacy presentation, reject detached handlers, and record
foreground activity only after a current explicit action is admitted. Passive
reads must never renew session activity.

## Current verification

The focused source checks pass 19 controller tests, six actual leaf-handler tests
and 13 canonical contract/example tests. They cover bounded replacement, query
binding, hidden parents, off-page targets, capability gates, canceled/late reads,
account replacement, old handlers, getter-triggered expiry and the real parent
reader's passive recheck. The UI checks execute the actual transpiled leaf with
the real controller and fictional ports. Descriptor inspection is not a React
renderer, native layout measurement or screen-reader acceptance.

Independent review reproduced an ordering defect where an earlier parent
subscriber could read and refresh the old comments during synchronous expiry.
The regression failed before repair. Reentrant getters now conceal their snapshot,
actions fail closed, and subscribers are notified only after authority settles.
Getter-triggered disposal also cannot recreate a view. A follow-on regression
first reproduced a missed final subscriber notification; disposal now delivers
concealment before removing subscribers. The fixed focused checks include both
failure cases.

Full mobile TypeScript checking passes. The first check exposed an insufficiently
narrow discriminated snapshot type; separating idle and concealed variants fixed
it without a runtime behavior change. Scoped native lint passes. The portable gate
also passes 92 compatibility/request checks and seven compiled shared-package
checks, including its native consumer without DOM types. No dependency,
native module, permission, network policy or package identifier changed.

## Next integration and acceptance

Consume this prepared slice only after the current shared runtime changes are
released. Add the comments operation through the existing NativeClient and its
bounded executor; admit only its exact GET route in the JavaScript, Kotlin and
Swift policies. Compose the controller in the existing runtime, connect the
mounted leaf and explicit activity handling, and extend the existing fictional
fixture. Update the post's website-only copy when native reply reading is wired.
Do not build another foundation or duplicate the canonical backend.

Then verify adapter cancellation and owner binding through the actual request
path, runtime navigation/foreground/background/sign-out behavior, and the rebuilt
Android app's comment navigation, enlarged text, TalkBack and layout. Real backend
integration requires the reviewed nonproduction configuration and current server
receipt. Native transport, real account, physical-device and store acceptance are
still open. Existing fatal security and release gates remain unchanged.
