# Display preferences and system inheritance

September 12, 2026. Uses the existing reading provider and browser cookie; no
account preference, new schema, provider, permission or feed source is added.

| Choice | Default and effective behavior |
| --- | --- |
| Appearance | `system` follows live OS color-scheme changes through CSS. Explicit `light` or `dark` overrides that preference. Member profile palette/background/order remain independently owned by ProfilePresentation. |
| Post text | `comfortable` (1.125rem); standard (1rem), large (1.25rem), largest (1.5rem). Root text/zoom still scales rem units. Settings retain responsive controls and unconditional comfortable spacing; there is no separate density preference. |
| Home reading layout | `pages`; `list` scrolls cards. This changes presentation, never feed sources, ranking, audience or reply eligibility. |
| Reduce motion | false leaves OS preference active; true also suppresses nonessential transitions/page-turn animation. No setting can force animation when OS reduced motion is on. |
| Reduce photo data | false retains existing responsive thumbnails; true uses smaller previews/one gallery photo per deliberate step. Large image access remains deliberate and audience-checked. |

The Display form stages all five choices in a local sample preview. Explicit Save
uses the existing provider and exact cookie readback. The preview cannot change
another screen or browser persistence before Save. Footer quick appearance keeps
its immediate-save behavior. If that shortcut changes preferences while a preview
is open, the preview is retained; Save deliberately applies the displayed choices,
and Discard restores the latest provider state. No cross-tab synchronization or
server version is invented for a browser cookie.

On failed persistence, the provider retains applied choices and its confirmed
snapshot. Display locks choice editing until exact retry or discard; retry sends
the same five fields, discard writes nothing and restores confirmed values.
Unsaved previews and failed saves participate in existing navigation, native Back
and safe-update protection. A successful Save clears only the local preview.
Reset is separately reviewed and confirmed, limited to the original five fields;
mandatory device reduced motion remains active after reset.

Keyboard access, visible focus, accessible names, semantic headings, readable
contrast and browser zoom are unconditional. Preview navigation uses native
buttons and announces sample content. No animation is required to use a preview.
The preview uses the same theme/text tokens as real content, with its own bounded
surface; it neither calls a media provider nor renders private member content.
Physical assistive-device acceptance remains separate from automated verification.
