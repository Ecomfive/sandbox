"use client";

import Link from "next/link";
import { useState } from "react";
import type { PedidoRuta } from "@/lib/despacho/datos-repartidor";
import { plata, type ResumenCierre, type Seccion } from "@/lib/despacho/panel-repartidor";
import { EstadoConexion, NavRepartidor, PastillaEstado, consultaDia, enlaceMapa, telefonoLimpio } from "./piezas";

/**
 * «Mi ruta de hoy» (pantalla 1 del prototipo aprobado): el avance del día, los contadores, lo cobrado (el efectivo por tienda) y los pedidos en tres
 * pestañas: en ruta, entregados y no entregados. Cada pedido abre su ficha; Llamar y Mapa van directo.
 */
export function MiRuta({
  nombre,
  dia,
  hoy,
  diaTexto,
  dias,
  pedidos,
  resumen,
}: {
  nombre: string;
  dia: string;
  hoy: string;
  diaTexto: string;
  /** Los días de la semana en curso (de lunes a hoy), para el selector. */
  dias: { iso: string; texto: string; marca: boolean }[];
  pedidos: PedidoRuta[];
  resumen: ResumenCierre;
}) {
  const consulta = consultaDia(dia, hoy);
  const seMarca = dias.find((d) => d.iso === dia)?.marca ?? false;
  const [pestana, setPestana] = useState<Seccion>("ruta");
  const cerrados = resumen.pedidos - resumen.enRuta;
  const avance = resumen.pedidos ? Math.round((cerrados / resumen.pedidos) * 100) : 0;
  const faltaCobrar = pedidos.filter((p) => p.seccion === "ruta").reduce((t, p) => t + (p.porCobrar ?? 0), 0);
  const cuenta = (s: Seccion) => pedidos.filter((p) => p.seccion === s).length;
  const lista = pedidos.filter((p) => p.seccion === pestana);
  const pestanas: { id: Seccion; texto: string }[] = [
    { id: "ruta", texto: `En ruta ${cuenta("ruta")}` },
    { id: "entregados", texto: `Entregados ${cuenta("entregados")}` },
    { id: "no", texto: `No entregados ${cuenta("no")}` },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-col gap-3 bg-primario px-[18px] pt-[18px] pb-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] opacity-90">{diaTexto} · Ciudad</span>
            <span className="text-xl font-bold">Hola, {nombre}</span>
          </div>
          <EstadoConexion />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[13px]">
            <span>
              {cerrados} de {resumen.pedidos} pedidos cerrados
            </span>
            <b>{avance} %</b>
          </div>
          <div className="h-2 rounded-full bg-white/25">
            <div className="h-2 rounded-full bg-white" style={{ width: `${avance}%` }} />
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 px-3.5 pt-3.5">
        {/* Los días de la semana en curso (24 nov 2026): cada lunes empieza de nuevo. Lo de días que ya no se marcan se ve en solo lectura. */}
        {dias.length > 1 && (
          <nav aria-label="Días de la semana" className="-mx-3.5 flex gap-1.5 overflow-x-auto px-3.5">
            {dias.map((d) => (
              <Link
                key={d.iso}
                href={d.iso === hoy ? "/repartidor" : `/repartidor?dia=${d.iso}`}
                aria-current={d.iso === dia ? "page" : undefined}
                className={`flex min-h-9 shrink-0 items-center rounded-full border px-3 text-[13px] whitespace-nowrap no-underline ${d.iso === dia ? "border-primario bg-primario-suave font-semibold text-[#5b2386]" : "border-[#e3e3e3] bg-white font-medium text-[#3f3f46]"}`}
              >
                {d.texto}
              </Link>
            ))}
          </nav>
        )}
        {!seMarca && <p className="m-0 rounded-[10px] bg-[#fef3c7] px-3 py-2 text-xs text-[#8a4b08]">Este día ya no se puede marcar desde el panel: solo se ve. Si falta algo, avísale a Soporte.</p>}
        <div className="grid grid-cols-4 gap-2">
          {[
            { n: resumen.enRuta, t: "En ruta" },
            { n: resumen.entregados, t: "Entregados" },
            { n: resumen.pospuestos, t: "Pospuestos" },
            { n: resumen.fallidos, t: "Fallidos" },
          ].map((c) => (
            <div key={c.t} className="flex flex-col items-center gap-0.5 rounded-xl border border-[#e3e3e3] bg-white px-1.5 py-2">
              <span className="text-xl font-bold">{c.n}</span>
              <span className="text-[11px] text-[#636363]">{c.t}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1.5 rounded-[14px] border border-[#dcc6f3] bg-primario-suave px-3.5 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-[#5b2386]">Efectivo en mano</span>
            <b className="text-[15px]">{plata(resumen.efectivoTotal)}</b>
            {resumen.efectivo.length > 0 && <span className="text-[10px] leading-tight text-[#5b2386]">{resumen.efectivo.map((e) => `${e.tienda} ${e.monto.toFixed(2)}`).join(" · ")}</span>}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-[#5b2386]">Yappy · MiPOS · transf.</span>
            <b className="text-[15px]">{plata(resumen.digitalesTotal)}</b>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-[#5b2386]">Falta cobrar</span>
            <b className="text-[15px]">{plata(faltaCobrar)}</b>
          </div>
        </div>

        <nav aria-label="Pedidos" className="flex gap-1.5 overflow-x-auto">
          {pestanas.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={pestana === p.id}
              onClick={() => setPestana(p.id)}
              className={`min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] whitespace-nowrap ${pestana === p.id ? "border-primario bg-primario font-semibold text-white" : "border-[#e3e3e3] bg-white font-medium text-[#3f3f46]"}`}
            >
              {p.texto}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-3.5 pt-2.5 pb-4">
        {lista.length === 0 && (
          <p className="m-0 rounded-[14px] border border-dashed border-[#dcc6f3] bg-white px-4 py-6 text-center text-sm text-[#636363]">
            {pestana === "ruta" ? (resumen.pedidos ? "No te quedan pedidos en ruta." : "Todavía no tienes pedidos asignados hoy.") : "Nada por aquí todavía."}
          </p>
        )}
        {lista.map((p) => {
          const tel = telefonoLimpio(p.cliente?.telefono);
          const mapa = enlaceMapa(p.cliente?.direccion, p.cliente?.corregimiento);
          const monto = p.seccion === "entregados" ? (p.cobrado ?? p.porCobrar) : p.porCobrar;
          return (
            <div key={p.itemId} className="flex flex-col gap-1.5 rounded-[14px] border border-[#e3e3e3] bg-white px-3 py-2.5">
              <Link href={`/repartidor/pedido/${p.itemId}${consulta}`} className="flex flex-col gap-1.5 text-[#18181b] no-underline">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <b className="text-[15px]">#{p.numero}</b>
                    <span className="rounded-full bg-primario-suave px-2 py-0.5 text-[11px] font-semibold text-[#5b2386]">{(p.tienda ?? "Sin tienda").toUpperCase()}</span>
                    {p.seccion !== "ruta" && <PastillaEstado estado={p.estado} />}
                  </span>
                  <b className="text-[15px]">{plata(monto)}</b>
                </span>
                <span className="truncate text-[13px] text-[#3f3f46]">{p.productos.length ? `${p.productos[0]}${p.productos.length > 1 ? ` +${p.productos.length - 1}` : ""}` : "Productos: en la ficha del pedido"}</span>
              </Link>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-[#636363]">
                  {p.cliente?.corregimiento?.trim() || "Sin zona"} · {tel?.corto ?? "sin teléfono"}
                </span>
                <span className="flex shrink-0 gap-1.5">
                  {tel && (
                    <a href={`tel:${tel.tel}`} className="rounded-lg border border-[#dcc6f3] px-2 py-1 text-xs font-semibold text-primario no-underline">
                      Llamar
                    </a>
                  )}
                  {mapa && (
                    <a href={mapa} target="_blank" rel="noreferrer" className="rounded-lg border border-[#dcc6f3] px-2 py-1 text-xs font-semibold text-primario no-underline">
                      Mapa
                    </a>
                  )}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <NavRepartidor activa="ruta" consulta={consulta} />
    </div>
  );
}
