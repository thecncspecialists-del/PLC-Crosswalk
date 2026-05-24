"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WheelEvent } from "react";

import {
  formatMiCredits,
  formatMiHours,
  formatMiNumber,
  hoursToMiCredits,
} from "@/lib/mi-hours";
import type { VisualPlanData, VisualPlanDecisionStatus } from "@/lib/visual-plan";

type TranscriptVisualPlanButtonProps = {
  disabled: boolean;
  transcriptId: string;
  transcriptLabel: string;
  visualPlan: VisualPlanData;
  toggleJourneyCourseAction: (formData: FormData) => void | Promise<void>;
  moveJourneyCourseAction: (formData: FormData) => void | Promise<void>;
  createJourneyGroupAction: (formData: FormData) => void | Promise<void>;
  renameJourneyGroupAction: (formData: FormData) => void | Promise<void>;
  deleteJourneyGroupAction: (formData: FormData) => void | Promise<void>;
  moveJourneyGroupAction: (formData: FormData) => void | Promise<void>;
};

type ConnectorPath = {
  id: string;
  d: string;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
};

type JourneyGroupView = {
  id: string;
  label: string;
  sortOrder: number;
  isSynthetic: boolean;
  nodes: VisualPlanData["catalogNodes"];
};

const DEFAULT_COURSE_SCROLL_STEP = 140;
const VISUAL_PLAN_NODE_SELECTOR = "[data-visual-plan-node='true']";

function externalNodeClasses(status: VisualPlanDecisionStatus) {
  if (status === "MAPPED") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }
  if (status === "CREDIT_ONLY") {
    return "border-sky-300 bg-sky-50 text-sky-800";
  }
  if (status === "NO_CREDIT") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function catalogNodeClasses(isMapped: boolean, isJourneySelected: boolean) {
  const mappedClasses = isMapped ? "bg-emerald-100 text-emerald-900" : "bg-white text-slate-700";
  const journeyBorderClasses = isJourneySelected
    ? "border-2 border-indigo-400 shadow-[0_0_0_1px_rgba(99,102,241,0.18)]"
    : "border border-slate-200";
  return `${mappedClasses} ${journeyBorderClasses}`;
}

function awardedNodeClasses() {
  return "border border-emerald-300 bg-emerald-50 text-emerald-900";
}

function journeyNodeClasses() {
  return "border border-indigo-300 bg-indigo-50 text-indigo-900";
}

function tooltip(parts: Array<string | number | null | undefined>) {
  return parts.filter((part) => part != null && String(part).trim().length > 0).join(" | ");
}

function decisionStatusLabel(status: VisualPlanDecisionStatus) {
  if (status === "MAPPED") {
    return "Mapped";
  }
  if (status === "CREDIT_ONLY") {
    return "Credit";
  }
  if (status === "NO_CREDIT") {
    return "No Credit";
  }
  return "Unreviewed";
}

function percent(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (value / total) * 100));
}

function SummaryMetric({
  label,
  value,
  detail,
  tone = "slate",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "slate" | "emerald";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];

  return (
    <div className={`rounded border px-4 py-3 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-normal">{value}</p>
      {detail ? <p className="mt-1 text-xs font-medium opacity-75">{detail}</p> : null}
    </div>
  );
}

function average(values: number[]) {
  if (values.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sumFiniteNumbers(values: Array<number | null | undefined>) {
  return values.reduce<number>(
    (sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0),
    0,
  );
}

function isVisibleInScroller(nodeRect: DOMRect, scrollerRect: DOMRect) {
  return nodeRect.bottom > scrollerRect.top && nodeRect.top < scrollerRect.bottom;
}

function courseScrollStep(scroller: HTMLDivElement) {
  const nodes = Array.from(scroller.querySelectorAll<HTMLElement>(VISUAL_PLAN_NODE_SELECTOR));
  if (nodes.length >= 2) {
    return Math.max(1, nodes[1].offsetTop - nodes[0].offsetTop);
  }

  const firstNode = nodes[0];
  if (firstNode) {
    return firstNode.getBoundingClientRect().height + 12;
  }

  return DEFAULT_COURSE_SCROLL_STEP;
}

function snappedScrollTop(scroller: HTMLDivElement, targetScrollTop: number) {
  const step = courseScrollStep(scroller);
  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const snappedTop = Math.round(targetScrollTop / step) * step;
  return Math.min(maxScrollTop, Math.max(0, snappedTop));
}

export function TranscriptVisualPlanButton({
  disabled,
  transcriptId,
  transcriptLabel,
  visualPlan,
  toggleJourneyCourseAction,
  moveJourneyCourseAction,
  createJourneyGroupAction,
  renameJourneyGroupAction,
  deleteJourneyGroupAction,
  moveJourneyGroupAction,
}: TranscriptVisualPlanButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [connectorPaths, setConnectorPaths] = useState<ConnectorPath[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupLabel, setEditingGroupLabel] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftScrollerRef = useRef<HTMLDivElement | null>(null);
  const rightScrollerRef = useRef<HTMLDivElement | null>(null);
  const journeyScrollerRef = useRef<HTMLDivElement | null>(null);
  const externalNodeRefs = useRef(new Map<string, HTMLElement>());
  const catalogNodeRefs = useRef(new Map<string, HTMLElement>());
  const awardedNodeRefs = useRef(new Map<string, HTMLElement>());
  const journeyNodeRefs = useRef(new Map<string, HTMLElement>());
  const animationFrameRef = useRef<number | null>(null);

  const catalogIndexById = useMemo(
    () => new Map(visualPlan.catalogNodes.map((node, index) => [node.id, index])),
    [visualPlan.catalogNodes],
  );
  const orderedExternalNodes = useMemo(() => {
    const originalOrderById = new Map(visualPlan.externalNodes.map((node, index) => [node.id, index]));
    const targetIndexesByExternalId = new Map<string, number[]>();

    for (const edge of visualPlan.edges) {
      const targetIndex = catalogIndexById.get(edge.programCourseId);
      if (targetIndex == null) {
        continue;
      }
      const indexes = targetIndexesByExternalId.get(edge.externalCourseId) ?? [];
      indexes.push(targetIndex);
      targetIndexesByExternalId.set(edge.externalCourseId, indexes);
    }

    return [...visualPlan.externalNodes].sort((left, right) => {
      const leftTargetIndexes = targetIndexesByExternalId.get(left.id) ?? [];
      const rightTargetIndexes = targetIndexesByExternalId.get(right.id) ?? [];
      const leftRank =
        left.status === "MAPPED"
          ? average(leftTargetIndexes)
          : visualPlan.catalogNodes.length + (left.status === "NO_CREDIT" || left.status === "CREDIT_ONLY" ? 0 : 1);
      const rightRank =
        right.status === "MAPPED"
          ? average(rightTargetIndexes)
          : visualPlan.catalogNodes.length + (right.status === "NO_CREDIT" || right.status === "CREDIT_ONLY" ? 0 : 1);

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftTargetIndex = Math.min(...leftTargetIndexes, Number.POSITIVE_INFINITY);
      const rightTargetIndex = Math.min(...rightTargetIndexes, Number.POSITIVE_INFINITY);
      if (leftTargetIndex !== rightTargetIndex) {
        return leftTargetIndex - rightTargetIndex;
      }

      return (originalOrderById.get(left.id) ?? 0) - (originalOrderById.get(right.id) ?? 0);
    });
  }, [catalogIndexById, visualPlan.catalogNodes.length, visualPlan.edges, visualPlan.externalNodes]);

  const awardedNodes = useMemo(() => {
    return visualPlan.catalogNodes
      .filter((node) => node.isAwardedMapped)
      .sort((left, right) => (catalogIndexById.get(left.id) ?? 0) - (catalogIndexById.get(right.id) ?? 0));
  }, [catalogIndexById, visualPlan.catalogNodes]);

  const journeySelectedNodes = useMemo(
    () => visualPlan.catalogNodes.filter((node) => node.isJourneySelected),
    [visualPlan.catalogNodes],
  );

  const journeyGroups = useMemo(() => {
    const byGroupId = new Map<string, VisualPlanData["catalogNodes"]>();
    for (const node of journeySelectedNodes) {
      const key = node.journeyGroupId ?? "__ungrouped__";
      const existing = byGroupId.get(key) ?? [];
      existing.push(node);
      byGroupId.set(key, existing);
    }

    const groupViews: JourneyGroupView[] = visualPlan.journeyGroups.map((group) => ({
      id: group.id,
      label: group.label,
      sortOrder: group.sortOrder,
      isSynthetic: false,
      nodes: (byGroupId.get(group.id) ?? []).sort((left, right) => {
        const leftOrder = left.journeySortOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.journeySortOrder ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return (catalogIndexById.get(left.id) ?? 0) - (catalogIndexById.get(right.id) ?? 0);
      }),
    }));

    const ungroupedNodes = (byGroupId.get("__ungrouped__") ?? []).sort(
      (left, right) => (catalogIndexById.get(left.id) ?? 0) - (catalogIndexById.get(right.id) ?? 0),
    );
    if (ungroupedNodes.length > 0) {
      groupViews.push({
        id: "__ungrouped__",
        label: "Unscheduled",
        sortOrder: Number.MAX_SAFE_INTEGER,
        isSynthetic: true,
        nodes: ungroupedNodes,
      });
    }

    return groupViews.sort(
      (left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label),
    );
  }, [catalogIndexById, journeySelectedNodes, visualPlan.journeyGroups]);

  const resolvedActiveGroupId = useMemo(() => {
    if (journeyGroups.length === 0) {
      return null;
    }

    if (activeGroupId && journeyGroups.some((group) => group.id === activeGroupId)) {
      return activeGroupId;
    }

    const firstRealGroup = journeyGroups.find((group) => !group.isSynthetic);
    return firstRealGroup?.id ?? journeyGroups[0]!.id;
  }, [activeGroupId, journeyGroups]);

  const setExternalNodeRef = useCallback((id: string, node: HTMLElement | null) => {
    if (node) {
      externalNodeRefs.current.set(id, node);
      return;
    }
    externalNodeRefs.current.delete(id);
  }, []);

  const setCatalogNodeRef = useCallback((id: string, node: HTMLElement | null) => {
    if (node) {
      catalogNodeRefs.current.set(id, node);
      return;
    }
    catalogNodeRefs.current.delete(id);
  }, []);

  const setAwardedNodeRef = useCallback((id: string, node: HTMLElement | null) => {
    if (node) {
      awardedNodeRefs.current.set(id, node);
      return;
    }
    awardedNodeRefs.current.delete(id);
  }, []);

  const setJourneyNodeRef = useCallback((id: string, node: HTMLElement | null) => {
    if (node) {
      journeyNodeRefs.current.set(id, node);
      return;
    }
    journeyNodeRefs.current.delete(id);
  }, []);

  const measureConnectors = useCallback(() => {
    const container = containerRef.current;
    const leftScroller = leftScrollerRef.current;
    const rightScroller = rightScrollerRef.current;
    const journeyScroller = journeyScrollerRef.current;
    if (!container || !leftScroller || !rightScroller || !journeyScroller) {
      setConnectorPaths([]);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const leftScrollerRect = leftScroller.getBoundingClientRect();
    const rightScrollerRect = rightScroller.getBoundingClientRect();
    const journeyScrollerRect = journeyScroller.getBoundingClientRect();

    const transcriptToCatalogPaths = visualPlan.edges.flatMap((edge) => {
      const sourceNode = externalNodeRefs.current.get(edge.externalCourseId);
      const targetNode = catalogNodeRefs.current.get(edge.programCourseId);
      if (!sourceNode || !targetNode) {
        return [];
      }

      const sourceRect = sourceNode.getBoundingClientRect();
      const targetRect = targetNode.getBoundingClientRect();
      if (!isVisibleInScroller(sourceRect, leftScrollerRect) || !isVisibleInScroller(targetRect, rightScrollerRect)) {
        return [];
      }

      const startX = sourceRect.right - containerRect.left;
      const startY = sourceRect.top + sourceRect.height / 2 - containerRect.top;
      const endX = targetRect.left - containerRect.left;
      const endY = targetRect.top + targetRect.height / 2 - containerRect.top;
      const midpointX = startX + (endX - startX) / 2;
      const d = `M ${startX} ${startY} C ${midpointX} ${startY}, ${midpointX} ${endY}, ${endX} ${endY}`;
      return [
        {
          id: edge.id,
          d,
          stroke: "rgb(16 185 129)",
          strokeOpacity: 0.64,
          strokeWidth: 2,
        },
      ];
    });

    const catalogToJourneyPaths = visualPlan.catalogNodes.flatMap((node) => {
      const sourceNode = catalogNodeRefs.current.get(node.id);
      if (!sourceNode) {
        return [];
      }

      const sourceRect = sourceNode.getBoundingClientRect();
      if (!isVisibleInScroller(sourceRect, rightScrollerRect)) {
        return [];
      }

      const buildPath = (targetNode: HTMLElement, suffix: string) => {
        const targetRect = targetNode.getBoundingClientRect();
        if (!isVisibleInScroller(targetRect, journeyScrollerRect)) {
          return null;
        }

        const startX = sourceRect.right - containerRect.left;
        const startY = sourceRect.top + sourceRect.height / 2 - containerRect.top;
        const endX = targetRect.left - containerRect.left;
        const endY = targetRect.top + targetRect.height / 2 - containerRect.top;
        const midpointX = startX + (endX - startX) / 2;
        const d = `M ${startX} ${startY} C ${midpointX} ${startY}, ${midpointX} ${endY}, ${endX} ${endY}`;
        return {
          id: `journey:${node.id}:${suffix}`,
          d,
          stroke: "rgb(79 70 229)",
          strokeOpacity: 0.56,
          strokeWidth: 2,
        };
      };

      const paths: ConnectorPath[] = [];
      const awardedTarget = awardedNodeRefs.current.get(node.id);
      if (awardedTarget) {
        const path = buildPath(awardedTarget, "awarded");
        if (path) {
          paths.push(path);
        }
      }

      const journeyTarget = journeyNodeRefs.current.get(node.id);
      if (journeyTarget) {
        const path = buildPath(journeyTarget, "journey");
        if (path) {
          paths.push(path);
        }
      }

      return paths;
    });

    setConnectorPaths([...transcriptToCatalogPaths, ...catalogToJourneyPaths]);
  }, [visualPlan.catalogNodes, visualPlan.edges]);

  const scheduleMeasure = useCallback(() => {
    if (animationFrameRef.current != null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = window.requestAnimationFrame(() => {
      measureConnectors();
    });
  }, [measureConnectors]);

  const handlePaneWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (event.deltaY === 0) {
        return;
      }

      event.preventDefault();
      const scroller = event.currentTarget;
      const direction = event.deltaY > 0 ? 1 : -1;
      const nextScrollTop = snappedScrollTop(scroller, scroller.scrollTop + direction * courseScrollStep(scroller));
      scroller.scrollTo({
        top: nextScrollTop,
        behavior: "auto",
      });
      scheduleMeasure();
    },
    [scheduleMeasure],
  );

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    scheduleMeasure();
    const leftScroller = leftScrollerRef.current;
    const rightScroller = rightScrollerRef.current;
    const journeyScroller = journeyScrollerRef.current;
    window.addEventListener("resize", scheduleMeasure);
    leftScroller?.addEventListener("scroll", scheduleMeasure);
    rightScroller?.addEventListener("scroll", scheduleMeasure);
    journeyScroller?.addEventListener("scroll", scheduleMeasure);

    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      leftScroller?.removeEventListener("scroll", scheduleMeasure);
      rightScroller?.removeEventListener("scroll", scheduleMeasure);
      journeyScroller?.removeEventListener("scroll", scheduleMeasure);
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isOpen, scheduleMeasure]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? "Select a program before viewing the visual planner." : "View visual planner"}
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
          }
        }}
        className="inline-flex h-10 items-center rounded border border-slate-400 bg-slate-50 px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Visualize Student Journey
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 grid bg-slate-950/60 p-3">
          <div className="mx-auto flex h-full w-full max-w-[98vw] flex-col overflow-hidden rounded border border-slate-300 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-slate-900">Visual Planner</h2>
                <p className="truncate text-xs text-slate-500">
                  {transcriptLabel} | {visualPlan.programName ?? "No program"} | {visualPlan.planStatus}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-8 items-center rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="relative z-40 border-b border-slate-200 bg-white px-4 py-3">
              <div className="grid gap-3 lg:grid-cols-5">
                <SummaryMetric
                  label="Transcript Hours"
                  value={formatMiHours(visualPlan.summary.transcriptHoursTotal)}
                  detail={formatMiCredits(visualPlan.summary.transcriptCreditsTotal)}
                />
                <SummaryMetric
                  label="Awarded"
                  value={formatMiHours(visualPlan.summary.awardedProgramHours)}
                  detail={formatMiCredits(visualPlan.summary.awardedProgramCredits)}
                  tone="emerald"
                />
                <SummaryMetric
                  label="Journey"
                  value={formatMiHours(visualPlan.summary.journeyProgramHours)}
                  detail={formatMiCredits(visualPlan.summary.journeyProgramCredits)}
                />
                <SummaryMetric
                  label="Total Earned"
                  value={formatMiHours(visualPlan.summary.totalEarnedProgramHours)}
                  detail={formatMiCredits(visualPlan.summary.totalEarnedProgramCredits)}
                />
                <SummaryMetric
                  label="Remaining"
                  value={formatMiHours(visualPlan.summary.remainingProgramHours)}
                  detail={formatMiCredits(visualPlan.summary.remainingProgramCredits)}
                />
              </div>
              <div className="mt-3 grid gap-2">
                <p className="text-[11px] text-slate-600">
                  Completed uses unique catalog courses. Total Earned includes both transcript-awarded and journey-taken credit, even when the same course appears in both.
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                  <span className="text-emerald-700">Completed: {formatMiHours(visualPlan.summary.completedProgramHours)}</span>
                  <span className="text-slate-700">Remaining: {formatMiHours(visualPlan.summary.remainingProgramHours)}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${percent(
                        visualPlan.summary.completedProgramHours,
                        visualPlan.summary.programHoursTotal,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden bg-slate-100/70 p-6">
              <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full" aria-hidden="true">
                {connectorPaths.map((path) => (
                  <path
                    key={path.id}
                    d={path.d}
                    fill="none"
                    stroke={path.stroke}
                    strokeLinecap="round"
                    strokeOpacity={path.strokeOpacity}
                    strokeWidth={path.strokeWidth}
                  />
                ))}
              </svg>

              <div className="relative z-20 grid h-full min-h-0 grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
                <div className="flex min-h-0 flex-col overflow-hidden rounded border border-slate-200 bg-white/75 shadow-sm">
                  <div className="shrink-0 border-b border-slate-200 bg-white/95 p-4 pb-3">
                    <div className="flex h-8 items-center rounded border border-slate-200 bg-white px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-sm">
                      Transcript Courses
                    </div>
                  </div>
                  <div
                    ref={leftScrollerRef}
                    onWheel={handlePaneWheel}
                    className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overflow-x-hidden overscroll-contain p-4 pt-3 [scroll-padding-top:0.75rem]"
                  >
                    <div className="grid gap-3 pb-8 pt-2">
                      {orderedExternalNodes.map((node) => {
                        const description = node.description?.trim();
                        return (
                          <div
                            key={node.id}
                            data-visual-plan-node="true"
                            ref={(element) => setExternalNodeRef(node.id, element)}
                            title={tooltip([
                              node.code,
                              node.title,
                              node.credits == null ? null : `${node.credits} credits`,
                              description,
                            ])}
                            className={`relative z-40 grid h-32 snap-start grid-rows-[auto_auto_1fr] gap-1 rounded border px-4 py-3 text-left text-xs ${externalNodeClasses(node.status)}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-bold">{node.code}</span>
                              <span className="shrink-0 rounded border border-current/20 bg-white/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                {decisionStatusLabel(node.status)}
                              </span>
                            </div>
                            <p className="line-clamp-2 text-sm font-semibold leading-snug">{node.title}</p>
                            <div className="min-h-0">
                              <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">
                                {node.credits == null ? "Credits: N/A" : `Credits: ${node.credits}`}
                              </p>
                              {description ? <p className="mt-1 line-clamp-2 leading-snug opacity-80">{description}</p> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-col overflow-hidden rounded border border-slate-200 bg-white/75 shadow-sm">
                  <div className="shrink-0 border-b border-slate-200 bg-white/95 p-4 pb-3">
                    <div className="flex h-8 items-center rounded border border-slate-200 bg-white px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-sm">
                      Program Catalog
                    </div>
                  </div>
                  <div
                    ref={rightScrollerRef}
                    onWheel={handlePaneWheel}
                    className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overflow-x-hidden overscroll-contain p-4 pt-3 [scroll-padding-top:0.75rem]"
                  >
                    <div className="grid gap-3 pb-8">
                      {visualPlan.catalogNodes.map((node) => {
                        const description = node.description?.trim();
                        return (
                          <form
                            key={node.id}
                            action={toggleJourneyCourseAction}
                            data-visual-plan-node="true"
                            ref={(element) => setCatalogNodeRef(node.id, element)}
                          >
                            <input type="hidden" name="transcriptId" value={transcriptId} />
                            <input type="hidden" name="programCourseId" value={node.id} />
                            <input type="hidden" name="groupId" value={resolvedActiveGroupId ?? ""} />
                            <button
                              type="submit"
                              title={tooltip([
                                node.code,
                                node.title,
                                node.creditHours == null ? null : `${formatMiNumber(node.creditHours)} hours`,
                                description,
                              ])}
                              className={`relative z-40 grid h-32 w-full snap-start grid-rows-[auto_auto_1fr] gap-1 rounded px-4 py-3 text-left text-xs transition hover:ring-1 hover:ring-indigo-300 ${catalogNodeClasses(node.isMapped, node.isJourneySelected)}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold">{node.code}</span>
                                <span className="shrink-0 rounded border border-current/20 bg-white/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                  {node.creditHours == null ? "Hours: N/A" : `${formatMiNumber(node.creditHours)} hours`}
                                </span>
                              </div>
                              <p className="line-clamp-2 text-sm font-semibold leading-snug">{node.title}</p>
                              <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">
                                Credit equivalent: {formatMiCredits(hoursToMiCredits(node.creditHours))}
                              </p>
                              {description ? <p className="min-h-0 line-clamp-2 leading-snug opacity-80">{description}</p> : null}
                            </button>
                          </form>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-col overflow-hidden rounded border border-slate-200 bg-white/75 shadow-sm">
                  <div className="shrink-0 border-b border-slate-200 bg-white/95 p-4 pb-3">
                    <div className="flex h-8 items-center rounded border border-slate-200 bg-white px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-sm">
                      Student Journey
                    </div>
                  </div>
                  <div
                    ref={journeyScrollerRef}
                    onWheel={handlePaneWheel}
                    className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 pr-6 pt-3 [scrollbar-gutter:stable]"
                  >
                    <div className="grid gap-3 pb-8">
                      <div className="rounded border border-emerald-200 bg-emerald-50/70 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Awarded Credit</p>
                        <div className="mt-2 grid gap-2">
                          {awardedNodes.length === 0 ? (
                            <p className="rounded border border-dashed border-emerald-300/80 bg-white/70 px-3 py-2 text-xs text-emerald-700/80">
                              No mapped transcript credit assigned yet.
                            </p>
                          ) : (
                            awardedNodes.map((node) => (
                              <div
                                key={`awarded:${node.id}`}
                                data-visual-plan-node="true"
                                ref={(element) => setAwardedNodeRef(node.id, element)}
                                className={`grid h-20 grid-rows-[1fr_auto] gap-1 rounded px-3 py-2 text-left text-xs ${awardedNodeClasses()}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="min-w-0 truncate text-sm font-semibold">
                                    {node.code} {node.title}
                                  </p>
                                  <span className="shrink-0 rounded border border-emerald-300 bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Awarded
                                  </span>
                                </div>
                                <p className="truncate text-[11px] text-emerald-700/80">
                                  {node.isJourneySelected
                                    ? "Derived from transcript mapping and also completed in journey"
                                    : "Derived from transcript mapping"}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {journeyGroups.map((group, groupIndex) => {
                        const isActiveGroup = resolvedActiveGroupId === group.id;
                        const canMoveUp = !group.isSynthetic && groupIndex > 0;
                        const canMoveDown =
                          !group.isSynthetic &&
                          groupIndex < journeyGroups.filter((item) => !item.isSynthetic).length - 1;
                        const isEditingThisGroup = editingGroupId === group.id;
                        const groupHours = sumFiniteNumbers(group.nodes.map((node) => node.creditHours));

                        return (
                          <div key={group.id} className="grid gap-2 rounded border border-slate-200 bg-white p-2">
                            <div
                              className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded border px-2 py-1 ${
                                isActiveGroup ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-slate-50"
                              }`}
                            >
                              {isEditingThisGroup ? (
                                <form
                                  action={renameJourneyGroupAction}
                                  onSubmit={() => {
                                    setEditingGroupId(null);
                                    setEditingGroupLabel("");
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <input type="hidden" name="transcriptId" value={transcriptId} />
                                  <input type="hidden" name="groupId" value={group.id} />
                                  <input
                                    type="text"
                                    name="label"
                                    value={editingGroupLabel}
                                    onChange={(event) => setEditingGroupLabel(event.currentTarget.value)}
                                    className="h-7 w-full rounded border border-slate-300 px-2 text-xs text-slate-800"
                                    maxLength={64}
                                    required
                                  />
                                  <button
                                    type="submit"
                                    className="inline-flex h-7 items-center rounded border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingGroupId(null);
                                      setEditingGroupLabel("");
                                    }}
                                    className="inline-flex h-7 items-center rounded border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                </form>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setActiveGroupId(group.id)}
                                  className="min-w-0 truncate text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700"
                                  title="Set active term"
                                >
                                  {group.label}
                                </button>
                              )}

                              <div className="flex items-center gap-1">
                                <span className="inline-flex h-6 items-center rounded border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-600">
                                  {formatMiNumber(groupHours)} hours
                                </span>
                                {!group.isSynthetic ? (
                                  <>
                                    <form action={moveJourneyGroupAction}>
                                      <input type="hidden" name="transcriptId" value={transcriptId} />
                                      <input type="hidden" name="groupId" value={group.id} />
                                      <input type="hidden" name="direction" value="up" />
                                      <button
                                        type="submit"
                                        disabled={!canMoveUp}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                                        title="Move term up"
                                      >
                                        ^
                                      </button>
                                    </form>
                                    <form action={moveJourneyGroupAction}>
                                      <input type="hidden" name="transcriptId" value={transcriptId} />
                                      <input type="hidden" name="groupId" value={group.id} />
                                      <input type="hidden" name="direction" value="down" />
                                      <button
                                        type="submit"
                                        disabled={!canMoveDown}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                                        title="Move term down"
                                      >
                                        v
                                      </button>
                                    </form>
                                    {!isEditingThisGroup ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingGroupId(group.id);
                                          setEditingGroupLabel(group.label);
                                        }}
                                        className="inline-flex h-6 items-center rounded border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                                        title="Rename term"
                                      >
                                        Rename
                                      </button>
                                    ) : null}
                                    <form action={deleteJourneyGroupAction}>
                                      <input type="hidden" name="transcriptId" value={transcriptId} />
                                      <input type="hidden" name="groupId" value={group.id} />
                                      <button
                                        type="submit"
                                        disabled={group.nodes.length > 0}
                                        className="inline-flex h-6 items-center rounded border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                                        title={
                                          group.nodes.length > 0 ? "Only empty terms can be deleted." : "Delete term"
                                        }
                                      >
                                        Delete
                                      </button>
                                    </form>
                                  </>
                                ) : null}
                              </div>
                            </div>

                            {group.nodes.length === 0 ? (
                              <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                Empty term.
                              </div>
                            ) : (
                              group.nodes.map((node) => (
                                <div key={node.id} className="relative">
                                  <div className="absolute left-2 top-2 z-10 flex items-center gap-1">
                                    <form action={moveJourneyCourseAction}>
                                      <input type="hidden" name="transcriptId" value={transcriptId} />
                                      <input type="hidden" name="programCourseId" value={node.id} />
                                      <input type="hidden" name="direction" value="up" />
                                      <button
                                        type="submit"
                                        className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                                        title="Move earlier"
                                        aria-label={`Move ${node.code} earlier`}
                                      >
                                        ^
                                      </button>
                                    </form>
                                    <form action={moveJourneyCourseAction}>
                                      <input type="hidden" name="transcriptId" value={transcriptId} />
                                      <input type="hidden" name="programCourseId" value={node.id} />
                                      <input type="hidden" name="direction" value="down" />
                                      <button
                                        type="submit"
                                        className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                                        title="Move later"
                                        aria-label={`Move ${node.code} later`}
                                      >
                                        v
                                      </button>
                                    </form>
                                  </div>
                                  <div
                                    data-visual-plan-node="true"
                                    ref={(element) => setJourneyNodeRef(node.id, element)}
                                    title={tooltip([node.code, node.title, group.label])}
                                    className={`grid h-20 w-full snap-start grid-rows-[1fr_auto] gap-1 rounded py-2 pl-16 pr-4 text-left text-xs ${journeyNodeClasses()}`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="min-w-0 truncate text-sm font-semibold">
                                        {node.code} {node.title}
                                      </p>
                                      <div className="flex shrink-0 items-center gap-1">
                                        <span className="rounded border border-current/25 bg-white/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                          {node.creditHours == null
                                            ? "Hours N/A"
                                            : `${formatMiNumber(node.creditHours)} hours`}
                                        </span>
                                        {node.isAwardedMapped ? (
                                          <span className="rounded border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                            Awarded
                                          </span>
                                        ) : null}
                                        <span className="rounded border border-current/25 bg-white/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                          {group.label}
                                        </span>
                                      </div>
                                    </div>
                                    <p className="truncate text-[11px] text-slate-600">
                                      {node.isAwardedMapped
                                        ? "Managed from Program Catalog (also transcript-awarded)"
                                        : "Managed from Program Catalog"}
                                    </p>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        );
                      })}

                      {journeyGroups.length === 0 && journeySelectedNodes.length === 0 ? (
                        <div className="rounded border border-dashed border-slate-300 bg-white px-4 py-5 text-xs text-slate-500">
                          Click a program catalog course to add it to the student journey.
                        </div>
                      ) : null}

                      <div className="rounded border border-slate-200 bg-white p-2">
                        {isCreatingGroup ? (
                          <form
                            action={createJourneyGroupAction}
                            onSubmit={() => {
                              setIsCreatingGroup(false);
                              setNewGroupLabel("");
                            }}
                            className="grid gap-2"
                          >
                            <input type="hidden" name="transcriptId" value={transcriptId} />
                            <input
                              type="text"
                              name="label"
                              value={newGroupLabel}
                              onChange={(event) => setNewGroupLabel(event.currentTarget.value)}
                              placeholder="Enter term label"
                              className="h-8 rounded border border-slate-300 px-2 text-xs text-slate-800"
                              required
                              maxLength={64}
                            />
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                className="inline-flex h-7 items-center rounded border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Save Term
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCreatingGroup(false);
                                  setNewGroupLabel("");
                                }}
                                className="inline-flex h-7 items-center rounded border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsCreatingGroup(true)}
                            className="inline-flex h-8 w-full items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Add Term
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
