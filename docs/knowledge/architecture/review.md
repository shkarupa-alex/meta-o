# Architecture — review that is actually independent

## §A-INDEPENDENT-REVIEW — Bounded context, and closing rights that follow authorship

Implements §B-TRUST-01.

Two properties make a review worth its cost, and both are structural.

The first is bounded context. Reviewers receive the spec blob, the candidate,
the digest, the diff, affected knowledge, the QC manifest and result, and the
selection plan — and nothing else. Not the executor's reasoning, not the
implementation narrative, and not each other's findings. A reviewer who has read
the author's justification is reviewing the justification.

The second is who may close a finding. The executor can only reach
`fix_proposed`; `resolved` belongs to the reviewer who raised it, a replacement
in the same role, or a technical adjudicator (`src/core/findings.mts`). Without
that rule "all findings addressed" means "the author decided they were".

The finding contract is enforced at the boundary: `taste` may only be a
suggestion, `defect` and `engineering_risk` must be fixed including `minor`
ones, and a `passed` verdict with an open defect is rejected as malformed rather
than argued about.

## §A-CROSS-VENDOR-REVIEW — One reviewer shares the executor's family, one must not

Implements §B-TRUST-01.

Models from the same family fail in correlated ways. Two reviews from one vendor
are cheaper than two, not twice as good.

So the ModelSet is validated: `reviewerPrimary` shares the executor's vendor and
family — it is fluent in exactly the idiom the executor produced, and catches
the errors that idiom invites — while `reviewerCrossVendor` must be a different
vendor, and is there to catch what the first two agree about
(`src/core/model-set.mts`).

A reviewer timing out does not weaken the gate. The session is replaced and the
review is redone; one review is never enough, however inconvenient the second
one's absence is.
