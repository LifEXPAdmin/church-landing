# Compact post actions and Bookmarks

September 12, 2026. Post cards and details group Comment, Like, Bookmark and
external Share into one compact row. Existing saved items and private collections
remain at `/platform/saved`, now labeled Bookmarks in Menu and the page heading.
The visibility-aware bookmark control reads the existing owner-scoped saved status
and toggles its canonical item/version. Unknown status is disabled rather than
presented as an unsaved result. Status reads do not lock feed navigation as if they
were submissions. Pending mutations retain the original body and retry key.

A recoverable error opens an anchored review surface. Refreshing after a conflict
loads the current version and returns focus to the stable bookmark button;
closing the surface preserves any pending retry. The existing workspace, source
readability, privacy, rate/version checks and collection behavior are unchanged.
Bookmarking does not distribute a post or alert its author.

External Share keeps canonical public-preview revalidation before Copy, native
share or QR. It preserves manual copying, native cancellation/error messages,
source revocation and the existing QR renderer. Post-specific short labels do not
change church/event/site sharing contracts. No sharing action creates a feed item.

More stays beside the author. Edit/Delete navigate to the existing permitted
editor and explicit deletion confirmation. Other-author Follow/Mute/Block use the
current relationship controller, versions, exact retries and draft guards.
Comment Edit/Delete/Pin use the same existing handlers in a compact More menu.
Unsupported reporting and the separately owned repost lifecycle remain gated.
No second service, new audience, permission, storage schema or provider is added.

The shared nonmodal popover fits the visual viewport, repositions after layout
changes, inherits the platform theme, and remains inside a native dialog when
opened from a discussion. Outside press, keyboard Escape and focus return work;
child QR dialogs retain their own Escape behavior. Retry state belongs to the
owning control rather than the transient popover.

## Verification

Nineteen isolated built-browser groups pass with zero browser errors: six
Bookmark/collection groups (including identical lost-response retries, concurrent
save/version refresh, removal, account changes, private pagination, collection
conflicts and source revocation); four compact-action groups (real Like/Follow,
block cancellation, guest return, 320/390/1280 widths, both themes, doubled text,
keyboard/focus, authorized Edit/Delete and comment More inside a native dialog);
four focused sharing groups (Copy/native success/failure/cancel, QR decoding,
withdrawn/private sources and authorized event returns); and five comment-reader
groups (pin/conversation versions, lost-response edit retry, dirty close, target
focus, List/detail Back scroll restoration and revoked event visibility).

Visual inspection caught and verified repairs for the theme surface, enlarged-text
placement and stable bookmark recovery. Fourteen focused navigation/release tests,
scoped lint, types and production build pass. Runtime verification covers 121
traces, 10,298 entries and 301 server JavaScript files, excluding private artifacts.
Native sharing uses browser simulation; these results are separate from physical
phone or provider acceptance. All writes are confined to isolated fictional data.

Production status is recorded after exact deployment and canonical live checks.
