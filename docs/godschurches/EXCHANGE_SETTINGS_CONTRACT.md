# Exchange settings and capability gates

September 16, 2026. This finishing integration belongs to the current Exchange
search/saved-choice feature. It reuses the searchable Settings registry and
current owned listing, contact and notification services. A navigation entry
does not create a stored default or grant access to its destination.

| Choice | Current owner and boundary |
| --- | --- |
| Listing type, price and audience | `exchange-listings.ts` owns explicit per-listing choices. Public and One approved church remain distinct. No global paid/free or audience preference is written, and an old draft is never widened. |
| General listing area | The listing editor chooses a catalog country/town. Exact pickup instructions stay out of published text. Private reusable pickup defaults require the accepted-participant handoff owner before storage or disclosure. |
| Contact | The existing `privacy.messages` registration owns contact requests. Its default is NOBODY; current adult eligibility, explicit acceptance and bilateral blocks remain authoritative. A listing, favorite or alert never opts into contact. |
| Favorites and named searches | `ExchangeFavorite` and `ExchangeSavedSearch` remain owner-only. The existing saved-choice screen edits criteria and per-search alerts; disabling alerts retains the search. Discovery/profile location preferences are separate and are not copied into a listing. |
| Activity and phone alerts | Link the existing `notifications.availability` registration. Exchange Activity follows explicit search consent; phone delivery also requires dated category consent and a current registered device. Quiet hours and source revocation retain the shared delivery owner. |
| Giving, payments, payouts and receipts | No active registration, add-card form or bank-data field. Future controls require approved provider/financial policy, supported eligibility, refund/dispute handling and the canonical giving/receipt owners. Provider-hosted management must handle sensitive financial data. Optional updates must remain separate from essential transaction receipts; no blanket tax-deductibility claim is allowed. |

Settings, Exchange presents listing, area and saved-choice destinations followed
by the existing related contact and notification rows. Static labels/aliases
participate in current Settings search. The folder and linked private screens
retain sign-in returns, current-account concealment and their original service
checks. Loading the folder neither reads private pickup instructions nor fetches
an additional Exchange collection. Financial sections remain hidden for every
current account because no approved payment capability is implemented.

This completes the capability map and available navigation portion. Persistent
listing/pickup defaults remain dependent on private handoff authority. Broader
giving and receipt bindings retain their own requirements; this integration
must not close those unfinished parent scopes. Actual release and browser results
belong in [the search implementation receipt](EXCHANGE_SEARCH_IMPLEMENTATION.md).
