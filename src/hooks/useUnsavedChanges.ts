"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Warns the user when they try to leave a page with unsaved changes.
 *
 * Handles three cases:
 * 1. Browser-level navigation (closing tab, refreshing, typing a new URL)
 *    via the `beforeunload` event.
 * 2. Next.js client-side navigation (clicking links within the app)
 *    by intercepting `history.pushState` and `history.replaceState`.
 * 3. Browser back/forward buttons via `popstate`.
 *
 * Returns a `clearChanges` callback that disables the guard.
 * Call it before intentional programmatic navigation (e.g., after duplicate or delete).
 */
export function useUnsavedChanges(hasChanges: boolean) {
  const guardEnabled = useRef(hasChanges);
  guardEnabled.current = hasChanges;

  // Browser-level: beforeunload
  useEffect(() => {
    if (!hasChanges) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  // Client-side navigation: intercept pushState/replaceState
  useEffect(() => {
    if (!hasChanges) return;

    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    const intercept = (
      original: typeof history.pushState,
      data: unknown,
      unused: string,
      url?: string | URL | null
    ) => {
      // If guard was disabled via clearChanges(), allow navigation silently
      if (!guardEnabled.current) {
        original(data, unused, url);
        return;
      }
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to leave this page?"
      );
      if (confirmed) {
        original(data, unused, url);
      }
    };

    history.pushState = function (data, unused, url) {
      intercept(originalPushState, data, unused, url);
    };

    history.replaceState = function (data, unused, url) {
      intercept(originalReplaceState, data, unused, url);
    };

    // Also handle browser back/forward buttons
    const handlePopState = () => {
      if (!guardEnabled.current) return;
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to leave this page?"
      );
      if (!confirmed) {
        originalPushState(null, "", window.location.href);
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", handlePopState);
    };
  }, [hasChanges]);

  // Returns a function that disables the guard for intentional navigation
  const clearChanges = useCallback(() => {
    guardEnabled.current = false;
  }, []);

  return { clearChanges };
}
