import { createContext, ReactNode, useContext, useState } from "react";

type DisclosureState = {
  expanded: Record<string, boolean>;
  setExpanded: (key: string, value: boolean) => void;
  offsets: Map<string, number>;
};

const DisclosureContext = createContext<DisclosureState | null>(null);

/** The transcript owns disclosure state, so regrouping and snapshots cannot close it. */
export function ToolDisclosureProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [offsets] = useState(() => new Map<string, number>());
  return (
    <DisclosureContext.Provider
      value={{
        expanded,
        setExpanded: (key, value) =>
          setExpanded((previous) => ({ ...previous, [key]: value })),
        offsets,
      }}
    >
      {children}
    </DisclosureContext.Provider>
  );
}

export function useDisclosureState(key: string | undefined, initial = false) {
  const context = useContext(DisclosureContext);
  const [local, setLocal] = useState(initial);
  const expanded = key && context ? (context.expanded[key] ?? initial) : local;
  const setExpanded = (value: boolean) => {
    if (key && context) context.setExpanded(key, value);
    else setLocal(value);
  };
  return [expanded, setExpanded] as const;
}

export function useDisclosureOffsets() {
  return useContext(DisclosureContext)?.offsets;
}
