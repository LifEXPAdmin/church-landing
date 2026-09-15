import {
  shareCardBody,
  shareCardLabel,
  type PublicShareCardInput
} from "../../lib/share-card";
export type { PublicShareCardInput } from "../../lib/share-card";

// Presentation only. The shared body escapes all supplied copy and contains no
// remote URLs. The caller still owns public eligibility, never this component.
export function ShareCard(input: PublicShareCardInput = {}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1200"
      height="630"
      viewBox="0 0 1200 630"
      role="img"
      aria-label={shareCardLabel}
      dangerouslySetInnerHTML={{ __html: shareCardBody(input) }}
    />
  );
}
