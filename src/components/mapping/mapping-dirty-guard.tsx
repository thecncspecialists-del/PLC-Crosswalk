"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const UNSAVED_MAPPING_MESSAGE = "You have unsaved mapping changes. Leave without saving?";

type MappingDirtyGuardContextValue = {
  confirmDiscardChanges: () => boolean;
  isDirty: boolean;
};

const MappingDirtyGuardContext = createContext<MappingDirtyGuardContextValue>({
  confirmDiscardChanges: () => true,
  isDirty: false,
});

type MappingDirtyGuardProps = {
  children: ReactNode;
  formId?: string;
};

function isPlainNavigationClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function shouldGuardAnchor(anchor: HTMLAnchorElement) {
  if (anchor.target && anchor.target !== "_self") {
    return false;
  }
  if (anchor.hasAttribute("download")) {
    return false;
  }

  const href = anchor.getAttribute("href");
  return Boolean(href && href !== "#" && !href.startsWith("#"));
}

export function MappingDirtyGuard({ children, formId }: MappingDirtyGuardProps) {
  const [dirtyState, setDirtyState] = useState({ formId: formId ?? "", isDirty: false });
  const isDirty = Boolean(formId && dirtyState.formId === formId && dirtyState.isDirty);

  useEffect(() => {
    const onStateChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ formId: string; isDirty: boolean }>;
      if (!customEvent.detail || customEvent.detail.formId !== formId) {
        return;
      }

      setDirtyState({
        formId,
        isDirty: customEvent.detail.isDirty,
      });
    };

    window.addEventListener("mapping-form-state-change", onStateChange);
    return () => {
      window.removeEventListener("mapping-form-state-change", onStateChange);
    };
  }, [formId]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [isDirty]);

  const value = useMemo<MappingDirtyGuardContextValue>(
    () => ({
      confirmDiscardChanges: () => !isDirty || window.confirm(UNSAVED_MAPPING_MESSAGE),
      isDirty,
    }),
    [isDirty],
  );

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const onDocumentClick = (event: MouseEvent) => {
      if (!isPlainNavigationClick(event)) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || !shouldGuardAnchor(anchor)) {
        return;
      }

      if (!value.confirmDiscardChanges()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("click", onDocumentClick, true);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [isDirty, value]);

  return <MappingDirtyGuardContext.Provider value={value}>{children}</MappingDirtyGuardContext.Provider>;
}

export function useMappingDirtyGuard() {
  return useContext(MappingDirtyGuardContext);
}
