/** Select only at count-owning projections, never in public author/mention DTOs. */
export const reactionCountAuthorSelect = {
  socialPreferences: {
    select: {
      hideAuthoredReactionCounts: true,
      reactionCountRecoveryRequired: true
    }
  }
} as const;

export function projectedReactionCount(
  source: {
    authorChurchId: string | null;
    author: {
      socialPreferences: {
        hideAuthoredReactionCounts: boolean;
        reactionCountRecoveryRequired: boolean;
      } | null;
    };
  },
  count: number
): number | null {
  // A church's public voice never inherits its undisclosed operator's choices.
  if (source.authorChurchId) return count;
  const choice = source.author.socialPreferences;
  return choice?.hideAuthoredReactionCounts ||
    choice?.reactionCountRecoveryRequired
    ? null
    : count;
}
