"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "tema";

function SolIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function LunaIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

/** Interruptor Claro/Oscuro — persiste en localStorage y setea data-theme en <html>.
 * El script inline en layout.tsx aplica el tema guardado antes del primer pintado. */
export function ThemeToggle({ expanded }: { expanded: boolean }) {
  const [oscuro, setOscuro] = useState(false);

  useEffect(() => {
    setOscuro(document.documentElement.dataset.theme === "dark");
  }, []);

  function elegir(tema: "light" | "dark") {
    document.documentElement.dataset.theme = tema;
    window.localStorage.setItem(STORAGE_KEY, tema);
    setOscuro(tema === "dark");
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => elegir(oscuro ? "light" : "dark")}
        aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        className="flex w-full items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {oscuro ? <LunaIcon className="h-4 w-4" /> : <SolIcon className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <div role="group" aria-label="Tema de la interfaz" className="flex gap-1 rounded-md border border-border bg-muted p-1">
      <button
        type="button"
        onClick={() => elegir("light")}
        aria-pressed={!oscuro}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
          !oscuro ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <SolIcon className="h-3.5 w-3.5" />
        Claro
      </button>
      <button
        type="button"
        onClick={() => elegir("dark")}
        aria-pressed={oscuro}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
          oscuro ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <LunaIcon className="h-3.5 w-3.5" />
        Oscuro
      </button>
    </div>
  );
}
