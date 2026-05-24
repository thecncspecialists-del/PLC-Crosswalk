import { CourseDecisionStatus } from "@prisma/client";

type DecisionNoopState = {
  status: CourseDecisionStatus;
  awardedCredits: number | null;
  rationale: string | null;
  selectionCount: number;
  rationaleEvidence: string;
  evidenceNote: string;
};

export function isNoopDecisionUpdate(args: {
  current: DecisionNoopState;
  target: DecisionNoopState;
}) {
  return (
    args.current.status === args.target.status &&
    args.current.awardedCredits === args.target.awardedCredits &&
    (args.current.rationale ?? null) === (args.target.rationale ?? null) &&
    args.current.selectionCount === args.target.selectionCount &&
    args.current.rationaleEvidence === args.target.rationaleEvidence &&
    args.current.evidenceNote === args.target.evidenceNote
  );
}
