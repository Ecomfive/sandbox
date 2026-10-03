"use client";

import { useState, useTransition } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { EnlaceIcon, MasIcon } from "@/lib/nav-icons";
import { desvincularCuenta, listarUsuariosPlataforma, vincularCuenta, type UsuarioPlataforma } from "./actions";
import { PUNTAJE_MINIMO, parecido } from "@/lib/crm/sugerencias";
import { nombrePais, type FilaDropshipper } from "./def-crm";

/** Plataformas con pedidos que ya llegan al sistema. Boxful y EFI se suman aquí cuando tengan datos. */
const PLATAFORMAS = ["Dropi"] as const;

/** «Vincular cuenta»: elige a qué usuario de la plataforma (de los que ya tienen pedidos) corresponde este dropshipper. */
function PanelVincular({ d, codigoPais, alGuardar }: { d: FilaDropshipper; codigoPais: string; alGuardar?: () => void }) {
  const paises = d.paises.length ? d.paises : [codigoPais];
  const [pais, setPais] = useState(paises.includes(codigoPais) ? codigoPais : paises[0]);
  const [plataforma, setPlataforma] = useState<string>(PLATAFORMAS[0]);
  const [usuarios, setUsuarios] = useState<UsuarioPlataforma[] | "error" | null>(null);
  const [elegido, setElegido] = useState("");

  function cargar(p: string, plat: string) {
    setUsuarios(null);
    setElegido("");
    listarUsuariosPlataforma(p, plat)
      .then((r) => setUsuarios("usuarios" in r ? r.usuarios : "error"))
      .catch(() => setUsuarios("error"));
  }

  const usuario = Array.isArray(usuarios) ? usuarios.find((u) => u.idExterno === elegido) : undefined;
  // Los usuarios cuya tienda se parece a este dropshipper van primero, marcados con ★ (sin vincular a otro).
  const ordenados = (Array.isArray(usuarios) ? usuarios : [])
    .map((u) => ({ u, puntaje: Math.max(parecido(u.tienda, d.tienda), parecido(u.tienda, d.nombre) * 0.9) }))
    .map((x) => ({ ...x, sugerido: x.puntaje >= PUNTAJE_MINIMO && (!x.u.dropshipperId || x.u.dropshipperId === d.id) }))
    .sort((a, b) => Number(b.sugerido) - Number(a.sugerido) || b.puntaje - a.puntaje);

  return (
    <FichaCrear
      alGuardar={alGuardar}
      titulo="Vincular cuenta"
      etiquetaCrear="Vincular cuenta"
      action={vincularCuenta}
      mensajeExito="Cuenta vinculada"
      ocultos={{ dropshipper_id: d.id }}
      alAbrir={() => cargar(pais, plataforma)}
      boton={(abrir) => (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={abrir}
          className={`inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-accent ${anilloFoco}`}
        >
          <MasIcon className="h-3.5 w-3.5" />
          Vincular
        </button>
      )}
    >
      {({ faltante, invalido }) => (
        <Seccion icono={EnlaceIcon} titulo="Cuenta">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Plataforma" id="campo-plataforma-cuenta">
              <select
                id="campo-plataforma-cuenta"
                name="plataforma"
                value={plataforma}
                onChange={(e) => {
                  setPlataforma(e.target.value);
                  cargar(pais, e.target.value);
                }}
                className={`${fieldClass} w-full`}
              >
                {PLATAFORMAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="País" id="campo-pais-cuenta">
              <select
                id="campo-pais-cuenta"
                name="pais"
                value={pais}
                onChange={(e) => {
                  setPais(e.target.value);
                  cargar(e.target.value, plataforma);
                }}
                className={`${fieldClass} w-full`}
              >
                {paises.map((c) => (
                  <option key={c} value={c}>
                    {nombrePais(c)}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Usuario de la plataforma" id="campo-usuario-cuenta" obligatorio faltante={faltante}>
            {usuarios === "error" ? (
              <p id="campo-usuario-cuenta" role="alert" className="py-1 text-xs text-destructive">
                No se pudo cargar la lista de usuarios.
              </p>
            ) : (
              <select
                id="campo-usuario-cuenta"
                name="id_externo"
                required
                data-enfocar
                disabled={usuarios === null}
                aria-invalid={invalido("campo-usuario-cuenta")}
                value={elegido}
                onChange={(e) => setElegido(e.target.value)}
                className={`${fieldClass} w-full`}
              >
                <option value="">{usuarios === null ? "Cargando…" : "Selecciona un usuario"}</option>
                {ordenados.map(({ u, sugerido }) => (
                  <option key={u.idExterno} value={u.idExterno} disabled={!!u.dropshipperId && u.dropshipperId !== d.id}>
                    {sugerido ? "★ " : ""}
                    {u.tienda ?? "Sin tienda"} · usuario {u.idExterno} · {u.pedidos} {u.pedidos === 1 ? "pedido" : "pedidos"}
                    {u.dropshipperNombre ? ` · de ${u.dropshipperNombre}` : ""}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <input type="hidden" name="tienda_nombre" value={usuario?.tienda ?? ""} />
        </Seccion>
      )}
    </FichaCrear>
  );
}

/** Las cuentas de plataforma que tiene vinculadas el dropshipper, con «Vincular» y «Quitar». */
export function CuentasDropshipper({ d, codigoPais, puedeEscribir }: { d: FilaDropshipper; codigoPais: string; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [pendiente, start] = useTransition();

  function quitar(id: string) {
    start(async () => {
      const r = await desvincularCuenta(id);
      mostrarToast(r.error ?? "Cuenta desvinculada", r.error ? "destructive" : undefined);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {d.cuentas.length === 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">Sin cuentas vinculadas.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
          {d.cuentas.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                <strong className="font-medium">{c.plataforma}</strong> · {nombrePais(c.codigoPais)} · usuario {c.idExterno}
                {c.tienda ? ` · ${c.tienda}` : ""}
              </span>
              {puedeEscribir && (
                <button
                  type="button"
                  disabled={pendiente}
                  aria-label={`Quitar la cuenta ${c.plataforma} ${c.idExterno}`}
                  onClick={() => quitar(c.id)}
                  className={`shrink-0 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-40 ${anilloFoco}`}
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeEscribir && (
        <div>
          <PanelVincular key={`vincular-${d.id}`} d={d} codigoPais={codigoPais} />
        </div>
      )}
    </div>
  );
}
