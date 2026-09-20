"use client";

import { createContext, useCallback, useContext, useState, type FormHTMLAttributes, type ReactNode } from "react";

type TonoToast = "success" | "destructive" | "info";

interface Toast {
  id: number;
  mensaje: string;
  tono: TonoToast;
}

interface ToastContextValue {
  mostrarToast: (mensaje: string, tono?: TonoToast) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const tonos: Record<TonoToast, string> = {
  success: "border-success/30 bg-success-soft text-success",
  destructive: "border-destructive/30 bg-destructive-soft text-destructive",
  info: "border-border bg-card text-foreground",
};

let idSiguiente = 1;

export function useToast(): ToastContextValue {
  const contexto = useContext(ToastContext);
  if (!contexto) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return contexto;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const mostrarToast = useCallback((mensaje: string, tono: TonoToast = "success") => {
    const id = idSiguiente++;
    setToasts((actuales) => [...actuales, { id, mensaje, tono }]);
    setTimeout(() => {
      setToasts((actuales) => actuales.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ mostrarToast }}>
      {children}
      {/* role="status": los avisos («Vista guardada») se anuncian a los lectores de pantalla sin quitar el foco. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-md border px-4 py-2 text-sm shadow-lg ${tonos[t.tono]}`}
          >
            {t.mensaje}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Envuelve un <form action={serverAction}> para mostrar un toast de confirmación
 * cuando la acción del servidor termina. Solo agrega el aviso visual — la acción
 * en sí sigue corriendo en el servidor exactamente igual que un form normal.
 *
 * `mensajeExito` acepta un texto fijo, o una función que recibe lo que devolvió
 * la acción del servidor para elegir el mensaje/tono según el resultado real
 * (por ejemplo, distinguir un cierre normal de uno con discrepancia).
 */
export function FormularioConToast<TResultado = void>({
  action,
  mensajeExito,
  children,
  ...props
}: Omit<FormHTMLAttributes<HTMLFormElement>, "action"> & {
  action: (formData: FormData) => Promise<TResultado>;
  mensajeExito: string | ((resultado: TResultado) => { mensaje: string; tono?: TonoToast });
}) {
  const { mostrarToast } = useToast();

  async function accionConAviso(formData: FormData) {
    const resultado = await action(formData);
    if (typeof mensajeExito === "function") {
      const { mensaje, tono } = mensajeExito(resultado);
      mostrarToast(mensaje, tono);
    } else {
      mostrarToast(mensajeExito);
    }
  }

  return (
    <form action={accionConAviso} {...props}>
      {children}
    </form>
  );
}
