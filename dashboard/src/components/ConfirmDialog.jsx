import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, danger, resolve }
  const confirmButtonRef = useRef(null);

  const confirm = useCallback(({ title = "مطمئنی؟", message = "", danger = false } = {}) => {
    return new Promise((resolve) => {
      setState({ title, message, danger, resolve });
    });
  }, []);

  function close(result) {
    state?.resolve(result);
    setState(null);
  }

  useEffect(() => {
    if (!state) return;
    confirmButtonRef.current?.focus();
    function onKey(e) {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => close(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-panel p-6"
          >
            <h3 className="mb-1 font-semibold text-gray-100">{state.title}</h3>
            {state.message && <p className="mb-4 text-sm text-gray-400">{state.message}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="rounded-lg bg-panel2 px-3 py-1.5 text-sm text-gray-300 hover:bg-border"
              >
                انصراف
              </button>
              <button
                ref={confirmButtonRef}
                onClick={() => close(true)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${
                  state.danger ? "bg-bad hover:bg-bad/80" : "bg-accent hover:bg-accent/80"
                }`}
              >
                تایید
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
