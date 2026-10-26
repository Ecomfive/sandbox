"use client";

import type { ComponentType } from "react";
import { useFiltros } from "@/components/tabla/ganchos";
import { anilloFoco } from "@/components/ui/field";
import { alternarAtajo, atajoActivo, type AtajoFiltro } from "@/lib/tabla/atajos";
import { AlertaIcon, CalendarioIcon, ChatIcon, EnlaceIcon, PersonaIcon, VentasIcon } from "@/lib/nav-icons";
import { COLORES, type Color } from "../publicaciones-dropi/tablero-acciones";
import { actividad, DEF_DROPSHIPPERS, DIAS_SIN_PEDIR, type FilaCaso, type FilaDropshipper } from "./def-crm";

const seleccion = (campo: string, ...valores: string[]) => ({ campo, valor: { tipo: "seleccion" as const, valores } });

interface Tarjeta {
  id: string;
  titulo: string;
  icono: ComponentType<{ className?: string }>;
  color: Color;
  detalle: string;
  /** Qué dropshippers cuenta (y filtra), de los que no están inactivos. */
  cuenta: (d: FilaDropshipper) => boolean;
  atajo: AtajoFiltro;
  /** Un segundo número junto al grande, tras una barra: «/ 296». */
  junto?: (abiertos: FilaDropshipper[]) => number;
  /** Una línea más, en rojo (lo que alarma). */
  extra?: (abiertos: FilaDropshipper[], casos: FilaCaso[]) => string | null;
}

/** Lo que hay que atender hoy en el CRM (26 oct 2026, como el tablero de Gestión de IDs Dropi): cada tarjeta cuenta y filtra la lista. */
const TARJETAS: Tarjeta[] = [
  {
    id: "sin-responder",
    titulo: "Sin responder",
    icono: ChatIcon,
    color: "rojo",
    detalle: "Escribieron por WhatsApp y nadie les contestó",
    cuenta: (d) => !!d.whatsapp?.sinResponder,
    atajo: { id: "sin-responder", etiqueta: "Sin responder", ayuda: "Filtrar la lista: WhatsApp sin responder", filtro: seleccion("whatsapp", "sin_responder") },
  },
  {
    id: "casos",
    titulo: "Casos abiertos",
    icono: AlertaIcon,
    color: "ambar",
    detalle: "Problemas, pedidos, pagos y devoluciones por resolver",
    cuenta: (d) => d.casosAbiertos > 0,
    extra: (abiertos, casos) => {
      const ids = new Set(abiertos.map((d) => d.id));
      const n = casos.filter((c) => c.estado !== "resuelto" && c.prioridad === "alta" && ids.has(c.dropshipperId)).length;
      return n ? `${n} de prioridad alta` : null;
    },
    atajo: { id: "casos", etiqueta: "Casos abiertos", ayuda: "Filtrar la lista: con casos abiertos", filtro: seleccion("casos", "con_casos") },
  },
  {
    id: "sin-pedir",
    titulo: `Sin pedir en ${DIAS_SIN_PEDIR} días`,
    icono: CalendarioIcon,
    color: "ambar",
    detalle: "Activos que dejaron de pedir: hay que llamarlos",
    cuenta: (d) => d.estado === "activo" && actividad(d) === "sin_pedir",
    atajo: { id: "sin-pedir", etiqueta: `Sin pedir en ${DIAS_SIN_PEDIR} días`, ayuda: "Filtrar la lista: activos que dejaron de pedir", filtro: seleccion("actividad", "sin_pedir"), ademas: [seleccion("estado", "activo")] },
  },
  {
    id: "este-mes",
    titulo: "Pidieron este mes",
    icono: VentasIcon,
    color: "verde",
    detalle: "Con al menos un pedido en el mes, de los activos",
    cuenta: (d) => actividad(d) === "este_mes",
    junto: (abiertos) => abiertos.filter((d) => d.estado === "activo").length,
    atajo: { id: "este-mes", etiqueta: "Pidieron este mes", ayuda: "Filtrar la lista: pidieron este mes", filtro: seleccion("actividad", "este_mes") },
  },
  {
    id: "captacion",
    titulo: "En captación",
    icono: PersonaIcon,
    color: "violeta",
    detalle: "Captados o en onboarding: todavía no venden",
    cuenta: (d) => d.fase !== "activo",
    atajo: { id: "captacion", etiqueta: "En captación", ayuda: "Filtrar la lista: captados o en onboarding", filtro: seleccion("fase", "captado", "onboarding") },
  },
  {
    id: "sin-cuenta",
    titulo: "Sin cuenta vinculada",
    icono: EnlaceIcon,
    color: "azul",
    detalle: "Activos sin su usuario de Dropi: no se ven sus ventas",
    cuenta: (d) => d.estado === "activo" && d.cuentas.length === 0,
    atajo: { id: "sin-cuenta", etiqueta: "Sin cuenta vinculada", ayuda: "Filtrar la lista: activos sin cuenta vinculada", filtro: seleccion("cuenta", "sin_cuenta"), ademas: [seleccion("estado", "activo")] },
  },
];

/** Una tarjeta del tablero: ícono de color, título y el número grande. Es un botón que pone o quita su filtro en la lista. */
function TarjetaCrm({ t, valor, junto, extra }: { t: Tarjeta; valor: number; junto: number | null; extra: string | null }) {
  const [filtros, cambiarFiltros] = useFiltros(DEF_DROPSHIPPERS);
  const activa = atajoActivo(filtros, t.atajo);
  const c = COLORES[t.color];
  const Icono = t.icono;
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={() => cambiarFiltros(alternarAtajo(filtros, t.atajo))}
      className={`group flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${anilloFoco} ${
        activa ? `ring-2 ${c.activa}` : "border-border"
      }`}
    >
      <span className="flex items-center gap-3">
        <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icono}`}>
          <Icono className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase hyphens-auto">{t.titulo}</span>
      </span>
      <span className="flex items-baseline gap-1">
        <span className={`text-3xl leading-none font-semibold tabular-nums ${c.numero}`}>{valor.toLocaleString("es-PA")}</span>
        {junto !== null && <span className="text-sm text-muted-foreground tabular-nums">/ {junto.toLocaleString("es-PA")}</span>}
      </span>
      <span className="text-xs text-muted-foreground">
        {t.detalle}
        {extra && <span className="mt-0.5 block font-medium text-destructive">{extra}</span>}
        <span className="sr-only">. {activa ? "Filtrando la lista." : t.atajo.ayuda}</span>
      </span>
    </button>
  );
}

/** El tablero de arriba del CRM: lo que espera a alguien (chats, casos, quien dejó de pedir) y cómo va la cartera. */
export function TableroCrm({ dropshippers, casos }: { dropshippers: FilaDropshipper[]; casos: FilaCaso[] }) {
  const abiertos = dropshippers.filter((d) => d.estado !== "inactivo");
  return (
    <section aria-label="Qué hay que atender" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
      {TARJETAS.map((t) => (
        <TarjetaCrm key={t.id} t={t} valor={abiertos.filter(t.cuenta).length} junto={t.junto ? t.junto(abiertos) : null} extra={t.extra ? t.extra(abiertos, casos) : null} />
      ))}
    </section>
  );
}
