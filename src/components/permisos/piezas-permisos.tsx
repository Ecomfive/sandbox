import type { ReactNode } from "react";
import { CandadoIcon } from "@/lib/nav-icons";
import { colorDeRol, inicialDeRol } from "@/lib/permisos/color-rol";

/** El cuadro con la inicial del rol y su color. */
export function AvatarRol({ nombre, color, tamano = "md" }: { nombre: string; color: string | null; tamano?: "sm" | "md" | "lg" }) {
  const c = colorDeRol(color, nombre);
  const medida = tamano === "lg" ? "h-[52px] w-[52px] rounded-[14px] text-xl" : tamano === "sm" ? "h-6 w-6 rounded-[7px] text-[11px]" : "h-8 w-8 rounded-[9px] text-[13px]";
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center font-bold ${medida}`} style={{ backgroundColor: c.fondo, color: c.texto }}>
      {inicialDeRol(nombre)}
    </span>
  );
}

/** La marca de un módulo con datos sensibles o que da poder de administrar. */
export function ChipSensible() {
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-warning-soft px-2.5 text-xs font-semibold text-warning">
      <CandadoIcon className="h-3.5 w-3.5" />
      Sensible
    </span>
  );
}

/** Una insignia redonda (la de la cobertura, los ajustes, «Personalizado»). */
export function Chip({ tono = "neutro", children, className = "" }: { tono?: "neutro" | "ok" | "aviso" | "azul" | "primario" | "error"; children: ReactNode; className?: string }) {
  const tonos = {
    neutro: "border border-border bg-muted text-foreground-soft",
    ok: "bg-success-soft text-success",
    aviso: "bg-warning-soft text-warning",
    azul: "bg-azul-soft text-azul",
    primario: "bg-primario-suave text-primario",
    error: "bg-destructive-soft text-destructive",
  } as const;
  return <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap ${tonos[tono]} ${className}`}>{children}</span>;
}

/** La barra de cobertura: cuántos módulos tiene con edición, con lectura y sin acceso. */
export function BarraCobertura({ w, r, n, etiqueta, ancho }: { w: number; r: number; n: number; etiqueta: string; ancho?: string }) {
  return (
    <div role="img" aria-label={etiqueta} style={ancho ? { width: ancho } : undefined} className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-border">
      <i className="block h-full min-w-0 bg-nivel-edicion transition-[flex] duration-200" style={{ flex: w }} />
      <i className="block h-full min-w-0 bg-nivel-lectura transition-[flex] duration-200" style={{ flex: r }} />
      <i className="block h-full min-w-0 bg-sin-acceso transition-[flex] duration-200" style={{ flex: n }} />
    </div>
  );
}

/** La leyenda de la barra de cobertura (la lee el lector de pantalla por la propia barra, así que aquí se oculta). */
export function LeyendaCobertura({ w, r, n }: { w: number; r: number; n: number }) {
  const item = (color: string, numero: number, texto: string) => (
    <span className="inline-flex items-center gap-2">
      <i className={`inline-block h-2.5 w-2.5 rounded-[3px] ${color}`} />
      <b className="font-semibold text-foreground">{numero}</b> {texto}
    </span>
  );
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-x-[18px] gap-y-1 text-[13px] text-foreground-soft">
      {item("bg-nivel-edicion", w, "con edición")}
      {item("bg-nivel-lectura", r, "de solo lectura")}
      {item("bg-sin-acceso", n, "sin acceso")}
    </div>
  );
}

/** Interruptor con su texto: un `checkbox` de verdad con `role="switch"`, así que se maneja con el teclado y se lee como interruptor. */
export function Interruptor({
  nombre,
  activo,
  alCambiar,
  deshabilitado,
  className = "",
  children,
}: {
  nombre: string;
  activo: boolean;
  alCambiar: (activo: boolean) => void;
  deshabilitado?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <label className={`flex items-center gap-3.5 ${deshabilitado ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${className}`}>
      {children}
      <span className="relative inline-flex h-6 w-10 shrink-0">
        <input
          type="checkbox"
          role="switch"
          name={nombre}
          checked={activo}
          disabled={deshabilitado}
          onChange={(e) => alCambiar(e.target.checked)}
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-[inherit] opacity-0"
        />
        <i className="absolute inset-0 rounded-full bg-border-control transition-colors peer-checked:bg-nivel-edicion peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primario" />
        <i className="absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-full bg-white transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
