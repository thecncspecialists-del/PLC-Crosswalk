import { db } from "@/lib/db";

const REVIEWER_COMMENT_SOURCE_REFS = ["reviewer-rationale", "reviewer-evidence-note"] as const;

export type MappingCommentCleanupCounts = {
  courseMappingDecisionRationale: number;
  courseMappingEvidenceComments: number;
  legacyMappingDecisionRationale: number;
  legacyMappingEvidenceComments: number;
};

type MappingCommentCleanupClient = Pick<
  typeof db,
  "courseMappingDecision" | "courseMappingEvidence" | "mappingDecision" | "mappingEvidence"
>;

export function totalMappingCommentCleanupCount(counts: MappingCommentCleanupCounts) {
  return (
    counts.courseMappingDecisionRationale +
    counts.courseMappingEvidenceComments +
    counts.legacyMappingDecisionRationale +
    counts.legacyMappingEvidenceComments
  );
}

export async function getMappingCommentCleanupCounts(
  client: MappingCommentCleanupClient = db,
): Promise<MappingCommentCleanupCounts> {
  const [
    courseMappingDecisionRationale,
    courseMappingEvidenceComments,
    legacyMappingDecisionRationale,
    legacyMappingEvidenceComments,
  ] = await Promise.all([
    client.courseMappingDecision.count({ where: { rationale: { not: null } } }),
    client.courseMappingEvidence.count({
      where: {
        OR: [
          { kind: "ADMIN_NOTE" },
          { sourceRef: { in: [...REVIEWER_COMMENT_SOURCE_REFS] } },
        ],
      },
    }),
    client.mappingDecision.count({ where: { NOT: { rationale: "" } } }),
    client.mappingEvidence.count({
      where: {
        OR: [
          { kind: "ADMIN_NOTE" },
          { sourceRef: { in: [...REVIEWER_COMMENT_SOURCE_REFS] } },
        ],
      },
    }),
  ]);

  return {
    courseMappingDecisionRationale,
    courseMappingEvidenceComments,
    legacyMappingDecisionRationale,
    legacyMappingEvidenceComments,
  };
}

export async function clearMappingComments(
  client: MappingCommentCleanupClient & Pick<typeof db, "$transaction"> = db,
): Promise<MappingCommentCleanupCounts> {
  return client.$transaction(async (tx) => {
    const courseMappingEvidenceComments = await tx.courseMappingEvidence.deleteMany({
      where: {
        OR: [
          { kind: "ADMIN_NOTE" },
          { sourceRef: { in: [...REVIEWER_COMMENT_SOURCE_REFS] } },
        ],
      },
    });
    const courseMappingDecisionRationale = await tx.courseMappingDecision.updateMany({
      where: { rationale: { not: null } },
      data: { rationale: null },
    });
    const legacyMappingEvidenceComments = await tx.mappingEvidence.deleteMany({
      where: {
        OR: [
          { kind: "ADMIN_NOTE" },
          { sourceRef: { in: [...REVIEWER_COMMENT_SOURCE_REFS] } },
        ],
      },
    });
    const legacyMappingDecisionRationale = await tx.mappingDecision.updateMany({
      where: { NOT: { rationale: "" } },
      data: { rationale: "" },
    });

    return {
      courseMappingDecisionRationale: courseMappingDecisionRationale.count,
      courseMappingEvidenceComments: courseMappingEvidenceComments.count,
      legacyMappingDecisionRationale: legacyMappingDecisionRationale.count,
      legacyMappingEvidenceComments: legacyMappingEvidenceComments.count,
    };
  });
}
