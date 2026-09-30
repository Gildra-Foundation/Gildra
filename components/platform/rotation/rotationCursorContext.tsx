"use client";

import { createContext, useCallback, useContext, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

export const RotationCursorValueContext = createContext(0);

const RotationCursorUpdateContext = createContext<Dispatch<SetStateAction<number>>>(() => {});
const RotationCursorRefContext = createContext<{ current: number }>({ current: 0 });

export function RotationCursorProvider({ children }: { children: ReactNode }) {
  const [cursor, setCursorState] = useState(0);
  const cursorRef = useRef(0);
  const setCursor = useCallback<Dispatch<SetStateAction<number>>>((update) => {
    const next = typeof update === "function" ? update(cursorRef.current) : update;
    cursorRef.current = next;
    setCursorState(next);
  }, []);

  return (
    <RotationCursorUpdateContext.Provider value={setCursor}>
      <RotationCursorRefContext.Provider value={cursorRef}>
        <RotationCursorValueContext.Provider value={cursor}>{children}</RotationCursorValueContext.Provider>
      </RotationCursorRefContext.Provider>
    </RotationCursorUpdateContext.Provider>
  );
}

export function useRotationCursorUpdate() {
  return useContext(RotationCursorUpdateContext);
}

export function useRotationCursorRef() {
  return useContext(RotationCursorRefContext);
}
