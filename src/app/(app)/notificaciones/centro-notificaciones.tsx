"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { formatearFechaHoraCompleta } from "@/lib/formato";
import { calcularCambios, ETIQUETA_ACCION } from "@/lib/auditoria-cambios";
import { AlertaIcon, PedidoIcon, WalletIcon, ConciliacionIcon, BuscarIcon } from "@/lib/nav-icons";
import type { PendientesHoy } from "@/lib/pendientes-hoy";

interface EventoAuditoria {
  id: string;
  usuario_nombre: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: string | null;
  antes: Record<string, string> | null;
  despues: Record<string, string> | null;
  creado_en: string;
}

interface SesionDropi {
  pais_codigo: string;
  tipo: string;
  renovada_en: string;
  ok: boolean;
  mensaje: string | null;
}

const PESTANAS = [
  { clave: "corregir", etiqueta: "Por corregir" },
  { clave: "bitacora", etiqueta: "Bitácora" },
  { clave: "sincronizacion", etiqueta: "Sincronización con Dropi" },
] as const;

type Pestana = (typeof PESTANAS)[number]["clave"];

const ETIQUETA_TIPO_SESION: Record<string, string> = {
  proveedor: "Proveedor",
  dropshipper: "Dropshipper",
};

export function CentroNotificaciones({
  pendientes,
  eventos,
  sesionesDropi,
  codigoPais,
}: {
  pendientes: PendientesHoy;
  eventos: EventoAuditoria[];
  sesionesDropi: SesionDropi[];
  codigoPais: string;
}) {
  const [pestana, setPestana] = useState<Pestana>("corregir");
  const tablistId = useId();

  function alPresionarFlecha(e: React.KeyboardEvent, indiceActual: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const siguiente = e.key === "ArrowRight" ? indiceActual + 1 : indiceActual - 1;
    const destino = PESTANAS[(siguiente + PESTANAS.length) % PESTANAS.length];
    setPestana(destino.clave);
    document.getElementById(`${tablistId}-tab-${destino.clave}`)?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Secciones del centro de notificaciones" className="flex flex-wrap gap-1 border-b border-border">
        {PESTANAS.map((p, i) => {
          const activa = pestana === p.clave;
          return (
            <button
              key={p.clave}
              id={`${tablistId}-tab-${p.clave}`}
              role="tab"
              type="button"
              aria-selected={activa}
              aria-controls={`${tablistId}-panel-${p.clave}`}
              tabIndex={activa ? 0 : -1}
              onClick={() => setPestana(p.clave)}
              onKeyDown={(e) => alPresionarFlecha(e, i)}
              className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                activa
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.etiqueta}
            </button>
          );
        })}
      </div>

      <div
        id={`${tablistId}-panel-corregir`}
        role="tabpanel"
        aria-labelledby={`${tablistId}-tab-corregir`}
        hidden={pestana !== "corregir"}
        tabIndex={0}
      >
        <PorCorregir pendientes={pendientes} />
      </div>

      <div
        id={`${tablistId}-panel-bitacora`}
        role="tabpanel"
        aria-labelledby={`${tablistId}-tab-bitacora`}
        hidden={pestana !== "bitacora"}
        tabIndex={0}
      >
        <Bitacora eventos={eventos} codigoPais={codigoPais} />
      </div>

      <div
        id={`${tablistId}-panel-sincronizacion`}
        role="tabpanel"
        aria-labelledby={`${tablistId}-tab-sincronizacion`}
        hidden={pestana !== "sincronizacion"}
        tabIndex={0}
      >
        <SincronizacionDropi sesiones={sesionesDropi} codigoPais={codigoPais} />
      </div>
    </div>
  );
}

function PorCorregir({ pendientes }: { pendientes: PendientesHoy }) {
  const tarjetas = [
    {
      clave: "alertas",
      cantidad: pendientes.alertasInventario,
      titulo: "Alertas de inventario abiertas",
      href: "/alertas",
      Icono: AlertaIcon,
    },
    {
      clave: "novedad",
      cantidad: pendientes.pedidosConNovedad,
      titulo: "Pedidos de Dropi en Novedad",
      href: "/pedidos-dropi",
      Icono: PedidoIcon,
    },
    {
      clave: "saldos",
      cantidad: pendientes.saldosSinRegistrar,
      titulo: "Plataformas sin saldo de wallet registrado",
      href: "/retiros",
      Icono: WalletIcon,
    },
    {
      clave: "sin-vincular",
      cantidad: pendientes.retirosDropiSinVincular,
      titulo: "Retiros de Dropi sin vincular",
      href: "/retiros",
      Icono: ConciliacionIcon,
    },
  ].filter((t) => t.cantidad > 0);

  if (tarjetas.length === 0) {
    return <EstadoVacio mensaje="¡Todo al día! No hay pendientes por corregir en este país." />;
  }

  return (
    <KpiGrid>
      {tarjetas.map((t) => (
        <Link key={t.clave} href={t.href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <KpiCard
            tono="destructive"
            titulo={
              <span className="flex items-center gap-1.5">
                <t.Icono className="h-4 w-4" aria-hidden="true" />
                {t.titulo}
              </span>
            }
            valor={t.cantidad}
          />
        </Link>
      ))}
    </KpiGrid>
  );
}

function Bitacora({ eventos, codigoPais }: { eventos: EventoAuditoria[]; codigoPais: string }) {
  const [busqueda, setBusqueda] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return eventos;
    return eventos.filter((e) => {
      const accion = ETIQUETA_ACCION[e.accion] ?? e.accion;
      return (
        (e.usuario_nombre ?? "").toLowerCase().includes(q) ||
        accion.toLowerCase().includes(q) ||
        e.entidad.toLowerCase().includes(q) ||
        (e.detalle ?? "").toLowerCase().includes(q)
      );
    });
  }, [eventos, busqueda]);

  return (
    <div className="flex flex-col gap-3">
      <label className="relative">
        <span className="sr-only">Buscar en la bitácora por usuario, acción o entidad</span>
        <BuscarIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por usuario, acción o entidad…"
          className="w-full max-w-sm rounded-md border border-border bg-card py-1.5 pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              <th className="py-2 pr-3 pl-4 font-medium">Fecha</th>
              <th className="py-2 pr-3 font-medium">Usuario</th>
              <th className="py-2 pr-3 font-medium">Acción</th>
              <th className="py-2 pr-3 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((e) => {
              const cambios = calcularCambios(e.antes, e.despues);
              return (
                <tr key={e.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 pl-4 whitespace-nowrap align-top">
                    {formatearFechaHoraCompleta(e.creado_en, codigoPais)}
                  </td>
                  <td className="py-2 pr-3 font-medium align-top">{e.usuario_nombre ?? "—"}</td>
                  <td className="py-2 pr-3 align-top">{ETIQUETA_ACCION[e.accion] ?? e.accion}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {cambios.length > 0 ? (
                      <ul className="flex flex-col gap-0.5">
                        {cambios.map((c) => (
                          <li key={c.campo}>
                            <span className="text-foreground">{c.campo}</span>: {c.antes}{" "}
                            <span aria-hidden="true">→</span>
                            <span className="sr-only"> cambió a </span> {c.despues}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      e.detalle
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <EstadoVacio
            mensaje={
              eventos.length === 0
                ? "Todavía no hay movimientos registrados en el historial de auditoría."
                : "Ningún movimiento coincide con la búsqueda."
            }
          />
        )}
      </div>
    </div>
  );
}

function SincronizacionDropi({ sesiones, codigoPais }: { sesiones: SesionDropi[]; codigoPais: string }) {
  if (sesiones.length === 0) {
    return (
      <EstadoVacio mensaje="Todavía no hay reportes de sincronización. Se llenará solo cuando corra la tarea programada que mantiene viva la sesión de Dropi." />
    );
  }

  const ahora = Date.now();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Cada país tiene una sesión abierta con Dropi que una tarea programada en el equipo del
        proveedor renueva cada 6 horas. Aquí queda el resultado de la última vez que corrió.
      </p>
      <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              <th className="py-2 pr-3 pl-4 font-medium">País</th>
              <th className="py-2 pr-3 font-medium">Sesión</th>
              <th className="py-2 pr-3 font-medium">Última renovación</th>
              <th className="py-2 pr-3 font-medium">Estado</th>
              <th className="py-2 pr-3 font-medium">Mensaje</th>
            </tr>
          </thead>
          <tbody>
            {sesiones.map((s) => {
              const horas = (ahora - new Date(s.renovada_en).getTime()) / 36e5;
              const atrasada = horas > 8;
              return (
                <tr key={`${s.pais_codigo}-${s.tipo}`} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 pl-4 align-top font-medium">{s.pais_codigo}</td>
                  <td className="py-2 pr-3 align-top">{ETIQUETA_TIPO_SESION[s.tipo] ?? s.tipo}</td>
                  <td className="py-2 pr-3 align-top whitespace-nowrap">
                    {formatearFechaHoraCompleta(s.renovada_en, codigoPais)}
                  </td>
                  <td className="py-2 pr-3 align-top">
                    {!s.ok ? (
                      <Badge tone="destructive">Expiró</Badge>
                    ) : atrasada ? (
                      <Badge tone="warning">Sin novedades hace {Math.round(horas)} h</Badge>
                    ) : (
                      <Badge tone="success">Activa</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3 align-top text-muted-foreground">{s.mensaje ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
