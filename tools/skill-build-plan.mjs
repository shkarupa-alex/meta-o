/**
 * What each generated skill receives from `shared/`, and how each bundle is
 * closed.
 *
 * Kept apart from the build itself because it is data that grows with every
 * shipped helper, while the build logic around it does not.
 *
 * Implements §A-DISTRIBUTION-01 and §A-DISTRIBUTION-03.
 */

/**
 * The roots every Markdown-reading bundle carries.
 *
 * Measured from a trial build, not guessed: the parser pulls its own micromark
 * graph, and a hand-kept list drifts the first time upstream splits a package.
 */
export const MARKDOWN_ROOTS = [
  "character-entities",
  "decode-named-character-reference",
  "mdast-util-from-markdown",
  "mdast-util-to-string",
  "micromark",
  "micromark-core-commonmark",
  "micromark-factory-destination",
  "micromark-factory-label",
  "micromark-factory-space",
  "micromark-factory-title",
  "micromark-factory-whitespace",
  "micromark-util-character",
  "micromark-util-chunked",
  "micromark-util-classify-character",
  "micromark-util-combine-extensions",
  "micromark-util-decode-numeric-character-reference",
  "micromark-util-decode-string",
  "micromark-util-encode",
  "micromark-util-html-tag-name",
  "micromark-util-normalize-identifier",
  "micromark-util-resolve-all",
  "micromark-util-sanitize-uri",
  "micromark-util-subtokenize",
  "unist-util-stringify-position",
];

/**
 * One explicit closure per bundle: the package roots its metafile may contain
 * and the measured size it may not outgrow.
 *
 * §A-DISTRIBUTION-03 keeps the licence closure here rather than in the file
 * distribution, because roots belong to the bundle that pulls them, and one
 * mapping stopped describing a build that produces more than one bundle. An
 * unexpected root or a missing entry breaks generation; that is the property.
 */
export const BUNDLES = {
  "scripts/mo-models.mjs": {
    baselineBytes: 1_012_923,
    roots: ["@anthropic-ai/claude-agent-sdk"],
  },
  "scripts/mo-backlog.mjs": {
    baselineBytes: 196_079,
    roots: MARKDOWN_ROOTS,
  },
  "scripts/mo-knowledge-history.mjs": {
    baselineBytes: 321_157,
    roots: [...MARKDOWN_ROOTS, "js-yaml"],
  },
  "scripts/mo-review-report.mjs": {
    baselineBytes: 200_550,
    roots: MARKDOWN_ROOTS,
  },
  "scripts/mo-knowledge.mjs": {
    baselineBytes: 304_054,
    roots: [...MARKDOWN_ROOTS, "js-yaml"],
  },
  "scripts/mo-knowledge-layer.mjs": {
    baselineBytes: 188_819,
    roots: MARKDOWN_ROOTS,
  },
  // No third-party root: the bundle exists to merge the helper's own modules
  // into the one file a standalone skill can run.
  "scripts/mo-debug.mjs": {
    baselineBytes: 38_463,
    roots: [],
  },
};

/**
 * Which shared file lands in which skill.
 *
 * Every entry is a deliberate decision about standalone installability:
 * Orchestrators and standalone reviewers each carry their backend mechanics
 * plus the shared contracts they consume. Setup owns project readiness and the
 * watchdog owns only its methodology-independent observer helper. The two
 * diagnostics skills write nothing, so like the watchdog they get the feedback
 * channel and never the routing table.
 */
export const SHARED_PLAN = {
  "mo-orchestrate-orca": [
    ["references/methodology.md", "references/methodology.md"],
    ["references/backend-contract.md", "references/backend-contract.md"],
    ["references/review-protocol.md", "references/review-protocol.md"],
    ["references/review-brief.md", "references/review-brief.md"],
    ["references/purpose-and-architecture.md", "references/purpose-and-architecture.md"],
    ["references/orca-mechanics.md", "references/orca-mechanics.md"],
    ["references/issue-routing.md", "references/issue-routing.md"],
    ["references/methodology-feedback.md", "references/methodology-feedback.md"],
    ["scripts/mo-models.mjs", "scripts/mo-models.mjs"],
    ["scripts/mo-backlog.mjs", "scripts/mo-backlog.mjs"],
    ["scripts/mo-harness-screen.mjs", "scripts/mo-harness-screen.mjs"],
    ["scripts/mo-review-report.mjs", "scripts/mo-review-report.mjs"],
    ["scripts/mo-review-resource.mjs", "scripts/mo-review-resource.mjs"],
    ["scripts/mo-knowledge-layer.mjs", "scripts/mo-knowledge-layer.mjs"],
    ["scripts/mo-posture.sh", "scripts/mo-posture.sh"],
  ],
  "mo-review-orca": [
    ["references/backend-contract.md", "references/backend-contract.md"],
    ["references/issue-routing.md", "references/issue-routing.md"],
    ["references/methodology-feedback.md", "references/methodology-feedback.md"],
    ["references/review-protocol.md", "references/review-protocol.md"],
    ["references/review-brief.md", "references/review-brief.md"],
    ["references/purpose-and-architecture.md", "references/purpose-and-architecture.md"],
    ["references/orca-mechanics.md", "references/orca-mechanics.md"],
    ["scripts/mo-models.mjs", "scripts/mo-models.mjs"],
    ["scripts/mo-backlog.mjs", "scripts/mo-backlog.mjs"],
    ["scripts/mo-harness-screen.mjs", "scripts/mo-harness-screen.mjs"],
    ["scripts/mo-review-report.mjs", "scripts/mo-review-report.mjs"],
    ["scripts/mo-review-resource.mjs", "scripts/mo-review-resource.mjs"],
    ["scripts/mo-knowledge-layer.mjs", "scripts/mo-knowledge-layer.mjs"],
  ],
  "mo-reviewer": [
    ["references/review-protocol.md", "references/review-protocol.md"],
    ["references/methodology-feedback.md", "references/methodology-feedback.md"],
    ["scripts/mo-review-report.mjs", "scripts/mo-review-report.mjs"],
  ],
  "mo-setup": [
    ["references/project-setup.md", "references/project-setup.md"],
    ["references/issue-routing.md", "references/issue-routing.md"],
    ["references/methodology-feedback.md", "references/methodology-feedback.md"],
    ["scripts/mo-backlog.mjs", "scripts/mo-backlog.mjs"],
    ["scripts/mo-harness-screen.mjs", "scripts/mo-harness-screen.mjs"],
    ["scripts/mo-knowledge-history.mjs", "scripts/mo-knowledge-history.mjs"],
    ["scripts/mo-knowledge.mjs", "scripts/mo-knowledge.mjs"],
    ["scripts/mo-knowledge-layer.mjs", "scripts/mo-knowledge-layer.mjs"],
    ["references/backend-contract.md", "references/backend-contract.md"],
    ["references/purpose-and-architecture.md", "references/purpose-and-architecture.md"],
    ["scripts/mo-posture.sh", "scripts/mo-posture.sh"],
  ],
  "mo-convergence": [
    ["references/methodology.md", "references/methodology.md"],
    ["references/backend-contract.md", "references/backend-contract.md"],
    ["references/review-protocol.md", "references/review-protocol.md"],
    ["references/methodology-feedback.md", "references/methodology-feedback.md"],
  ],
  "mo-debug": [
    ["references/methodology-feedback.md", "references/methodology-feedback.md"],
    ["scripts/mo-debug.mjs", "scripts/mo-debug.mjs"],
  ],
  "mo-e2e": [
    ["references/methodology-feedback.md", "references/methodology-feedback.md"],
    ["scripts/mo-knowledge-layer.mjs", "scripts/mo-knowledge-layer.mjs"],
  ],
  "mo-watchdog": [
    ["references/watchdog.md", "references/watchdog.md"],
    ["references/methodology-feedback.md", "references/methodology-feedback.md"],
    ["scripts/mo-watchdog.sh", "scripts/mo-watchdog.sh"],
  ],
};
