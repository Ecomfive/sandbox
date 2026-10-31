"use client";

import { useEffect, useState, useTransition } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { bandera } from "@/lib/whatsapp/origen-chat";
import { cambiarPaisNumero, numerosConPais, type NumeroConPais } from "./numeros-actions";

/**
 * «Números» (solo quien administra, 31 oct 2026, pedido de Hernán): de qué país es cada número de WhatsApp de la empresa. Cada chat lleva la bandera
 * del número por el que entró y la bandeja filtra por país. Se guarda al elegir; `alCambiar` refresca la bandeja.
 */
export function BotonNumerosPais({ alCambiar }: { alCambiar: () => void }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        title="De qué país es cada número de WhatsApp"
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

  function cambiar(n: NumeroConPais, codigo: string | null) {
    empezar(async () => {
      const r = await cambiarPaisNumero(n.id, codigo).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      setDatos((d) => (d && !("error" in d) ? { ...d, numeros: d.numeros.map((x) => (x.id === n.id ? { ...x, pais: codigo } : x)) } : d));
      mostrarToast(codigo ? `${n.nombre}: ${bandera(codigo)} ahora es de ese país.` : `${n.nombre} quedó sin país.`);
      alCambiar();
    });
  }

  return (
    <Ventana abierto alCerrar={alCerrar} titulo="País de cada número" ancho="md">
      <div className="flex flex-col gap-4 p-5 text-sm">
        <p className="m-0 text-muted-foreground">
          Cada chat lleva la bandera del país del número por el que entró, y la bandeja se puede filtrar por país. Así Atención, que contesta desde varios números, sabe de dónde es cada cliente.
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
                    {n.pais && <span aria-hidden="true">{bandera(n.pais)} </span>}
                    {n.nombre}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{n.numero}</span>
                </span>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  País
                  <select value={n.pais ?? ""} disabled={pendiente} onChange={(e) => cambiar(n, e.target.value || null)} className={`${fieldClass} h-9 text-sm`}>
                    <option value="">Sin país</option>
                    {datos.paises.map((p) => (
                      <option key={p.codigo} value={p.codigo}>
                        {bandera(p.codigo)} {p.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Ventana>
  );
}
