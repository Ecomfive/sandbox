"use client";

import { useEffect, useState, useTransition } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { cambiarAreaNumero, cambiarPaisNumero, numerosConPais, type NumeroConPais } from "./numeros-actions";
import { Bandera } from "@/components/paises/bandera";

const AREAS = [
  ["atencion", "Atención"],
  ["comercial", "Comercial"],
  ["direccion", "Dirección"],
] as const;

/**
 * «Números» (solo quien administra, 31 oct 2026, pedido de Hernán): de qué país es cada número de WhatsApp de la empresa y en qué área caen sus
 * chats. Cada chat lleva la bandera del número por el que entró y la bandeja filtra por país. Un número con su clave en el servidor que todavía no
 * recibió mensajes sale como «Esperando su primer mensaje»: el área que se le elija la toma al entrar. Se guarda al elegir; `alCambiar` refresca la
 * bandeja.
 */
export function BotonNumerosPais({ alCambiar }: { alCambiar: () => void }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        title="País y área de cada número de WhatsApp"
        className={`inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--wa-borde)] px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 22V4M4 4h12l-2 4 2 4H4" />
        </svg>
        Números
      </button>
      {abierta && <VentanaNumeros alCerrar={() => setAbierta(false)} alCambiar={alCambiar} />}
    </>
  );
}

function VentanaNumeros({ alCerrar, alCambiar }: { alCerrar: () => void; alCambiar: () => void }) {
  const { mostrarToast } = useToast();
  const [datos, setDatos] = useState<{ numeros: NumeroConPais[]; paises: { codigo: string; nombre: string }[] } | { error: string } | null>(null);
  const [pendiente, empezar] = useTransition();
  // Se pide al abrir (la ventana solo existe abierta).
  useEffect(() => {
    let vigente = true;
    numerosConPais().then(
      (r) => vigente && setDatos(r),
      () => vigente && setDatos({ error: "No se pudieron leer los números." }),
    );
    return () => {
      vigente = false;
    };
  }, []);

  function cambiarArea(n: NumeroConPais, area: NumeroConPais["area"]) {
    const nombre = AREAS.find(([a]) => a === area)?.[1] ?? area;
    empezar(async () => {
      const r = await cambiarAreaNumero(n.id, area).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      setDatos((d) => (d && !("error" in d) ? { ...d, numeros: d.numeros.map((x) => (x.id === n.id ? { ...x, area, nombre: x.previsto ? `Ecomfive · ${nombre}` : x.nombre } : x)) } : d));
      mostrarToast(
        n.previsto
          ? `Listo: cuando llegue su primer mensaje, el número entra en ${nombre} con todos sus chats.`
          : `${n.nombre}: sus chats caen en ${nombre}${r.movidos ? ` (${r.movidos} ${r.movidos === 1 ? "chat pasó" : "chats pasaron"} a ${nombre})` : ""}.`,
      );
      alCambiar();
    });
  }

  function cambiar(n: NumeroConPais, codigo: string | null) {
    empezar(async () => {
      const r = await cambiarPaisNumero(n.id, codigo).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      setDatos((d) => (d && !("error" in d) ? { ...d, numeros: d.numeros.map((x) => (x.id === n.id ? { ...x, pais: codigo } : x)) } : d));
      mostrarToast(codigo ? `${n.nombre} ahora es de ${(datos && !("error" in datos) ? datos.paises.find((p) => p.codigo === codigo)?.nombre : null) ?? codigo}.` : `${n.nombre} quedó sin país.`);
      alCambiar();
    });
  }

  return (
    <Ventana abierto alCerrar={alCerrar} titulo="País y área de cada número" ancho="md">
      <div className="flex flex-col gap-4 p-5 text-sm">
        <p className="m-0 text-muted-foreground">
          Cada chat lleva la bandera del país del número por el que entró, y la bandeja se puede filtrar por país. Así Atención, que contesta desde varios números, sabe de dónde es cada cliente.
        </p>
        <p className="m-0 text-muted-foreground">
          El área dice dónde caen los chats del número: los contactos y mensajes que entran por él los ve esa área. Al cambiarla, sus chats pasan también a la nueva área.
        </p>
        {datos === null ? (
          <p className="m-0 text-muted-foreground">Cargando…</p>
        ) : "error" in datos ? (
          <p role="alert" className="m-0 text-destructive">
            {datos.error}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {datos.numeros.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">
                    {n.pais && <Bandera codigo={n.pais} className="mr-1.5 align-[-1px]" />}
                    {n.nombre}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {n.numero}
                    {n.previsto && " · Esperando su primer mensaje"}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Área
                    <select value={n.area} disabled={pendiente} onChange={(e) => cambiarArea(n, e.target.value as NumeroConPais["area"])} className={`${fieldClass} h-9 text-sm`}>
                      {AREAS.map(([a, nombre]) => (
                        <option key={a} value={a}>
                          {nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!n.previsto && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      País
                      <select value={n.pais ?? ""} disabled={pendiente} onChange={(e) => cambiar(n, e.target.value || null)} className={`${fieldClass} h-9 text-sm`}>
                        <option value="">Sin país</option>
                        {datos.paises.map((p) => (
                          <option key={p.codigo} value={p.codigo}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Ventana>
  );
}
