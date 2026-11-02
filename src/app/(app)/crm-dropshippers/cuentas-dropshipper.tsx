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

/**
 * «Vincular cuenta»: elige a qué usuarios de la plataforma (de los que ya tienen pedidos) corresponde este dropshipper. Un mismo dropshipper (un
 * mismo WhatsApp) puede tener varios usuarios de Dropi, así que se marcan varios de una vez. Desde el 29 oct 2026 es un buscador (tienda, número de
 * usuario o dueño) con la lista debajo, en vez de un desplegable de cientos de renglones.
 */
function PanelVincular({ d, codigoPais, alGuardar }: { d: FilaDropshipper; codigoPais: string; alGuardar?: () => void }) {
  const paises = d.paises.length ? d.paises : [codigoPais];
  const [pais, setPais] = useState(paises.includes(codigoPais) ? codigoPais : paises[0]);
  const [plataforma, setPlataforma] = useState<string>(PLATAFORMAS[0]);
  const [usuarios, setUsuarios] = useState<UsuarioPlataforma[] | "error" | null>(null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [buscar, setBuscar] = useState("");

  function cargar(p: string, plat: string) {
    setUsuarios(null);
    setElegidos([]);
    listarUsuariosPlataforma(p, plat)
      .then((r) => setUsuarios("usuarios" in r ? r.usuarios : "error"))
      .catch(() => setUsuarios("error"));
  }

  // Primero los que se parecen a este dropshipper («Se parece», sin vincular a otro); luego los libres, los de más pedidos primero; al final los que
  // ya son suyos y, atenuados, los de otros dropshippers.
  const grupo = (x: { u: UsuarioPlataforma; sugerido: boolean }) => (x.sugerido ? 0 : !x.u.dropshipperId ? 1 : x.u.dropshipperId === d.id ? 2 : 3);
  const ordenados = (Array.isArray(usuarios) ? usuarios : [])
    .map((u) => ({ u, puntaje: Math.max(...d.tiendas.map((t) => parecido(u.tienda, t)), parecido(u.tienda, d.nombre) * 0.9) }))
    .map((x) => ({ ...x, sugerido: x.puntaje >= PUNTAJE_MINIMO && !x.u.dropshipperId }))
    .sort((a, b) => grupo(a) - grupo(b) || (grupo(a) === 0 ? b.puntaje - a.puntaje : b.u.pedidos - a.u.pedidos));
  const q = buscar.trim().toLowerCase();
  const visibles = ordenados.filter(({ u }) => !q || [u.tienda, u.idExterno, u.dropshipperNombre].some((x) => x?.toLowerCase().includes(q)));
  const elegidosDatos = elegidos.map((id) => ordenados.find((x) => x.u.idExterno === id)?.u).filter((u): u is UsuarioPlataforma => !!u);
  const alternar = (id: string) => setElegidos((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  return (
    <FichaCrear
      alGuardar={alGuardar}
      titulo="Vincular cuenta"
      etiquetaCrear={elegidos.length > 1 ? `Vincular ${elegidos.length} cuentas` : "Vincular cuenta"}
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
          <Campo
            etiqueta="Usuarios de la plataforma"
            id="campo-usuario-cuenta"
            obligatorio
            // El dato que falta es la marca de abajo (sin usuarios elegidos); el aviso sale junto al buscador.
            faltante={faltante === "campo-usuario-cuenta-elegidos" ? "campo-usuario-cuenta" : faltante}
          >
            {usuarios === "error" ? (
              <p id="campo-usuario-cuenta" role="alert" className="py-1 text-xs text-destructive">
                No se pudo cargar la lista de usuarios.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  id="campo-usuario-cuenta"
                  type="search"
                  data-enfocar
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  disabled={usuarios === null}
                  placeholder={usuarios === null ? "Cargando usuarios…" : "Buscar por tienda, número de usuario o dueño"}
                  aria-controls="lista-usuarios-cuenta"
                  aria-invalid={invalido("campo-usuario-cuenta-elegidos")}
                  className={`${fieldClass} w-full`}
                />
                {/* Lo que se va a vincular: se quita con la ×. */}
                {elegidosDatos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" aria-label="Usuarios elegidos">
                    {elegidosDatos.map((u) => (
                      <span key={u.idExterno} className="inline-flex items-center gap-1 rounded-full bg-primario-suave py-0.5 pr-1 pl-2.5 text-xs font-medium text-primario">
                        {u.tienda ?? "Sin tienda"} · {u.idExterno}
                        <button
                          type="button"
                          onClick={() => alternar(u.idExterno)}
                          aria-label={`Quitar ${u.tienda ?? "el usuario"} ${u.idExterno}`}
                          className={`flex h-5 w-5 items-center justify-center rounded-full hover:bg-primario/15 ${anilloFoco}`}
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div id="lista-usuarios-cuenta" role="group" aria-label="Usuarios de la plataforma" className="max-h-72 overflow-y-auto rounded-lg border border-border">
                  {usuarios === null ? (
                    <p className="m-0 px-3 py-6 text-center text-sm text-muted-foreground">Cargando…</p>
                  ) : !visibles.length ? (
                    <p className="m-0 px-3 py-6 text-center text-sm text-muted-foreground">{q ? "Ningún usuario coincide con la búsqueda." : "No hay usuarios con pedidos en este país."}</p>
                  ) : (
                    visibles.map(({ u, sugerido }) => {
                      const deOtro = !!u.dropshipperId && u.dropshipperId !== d.id;
                      const yaSuyo = u.dropshipperId === d.id;
                      const marcado = elegidos.includes(u.idExterno);
                      return (
                        <label
                          key={u.idExterno}
                          className={`flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 ${deOtro || yaSuyo ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted"} ${marcado ? "bg-primario-suave/60" : ""}`}
                        >
                          <input type="checkbox" checked={marcado || yaSuyo} disabled={deOtro || yaSuyo} onChange={() => alternar(u.idExterno)} className="h-4 w-4 flex-none accent-[var(--primario)]" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="flex items-center gap-1.5 text-sm font-medium">
                              <span className="truncate">{u.tienda ?? "Sin tienda"}</span>
                              {sugerido && !yaSuyo && <span className="flex-none rounded-full bg-success-soft px-1.5 py-px text-[11px] font-semibold text-success">Se parece</span>}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              Usuario {u.idExterno} · {u.pedidos} {u.pedidos === 1 ? "pedido" : "pedidos"}
                              {yaSuyo ? " · ya es de este dropshipper" : deOtro ? ` · ya es de ${u.dropshipperNombre ?? "otro dropshipper"}` : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                {Array.isArray(usuarios) && (
                  <span className="text-xs text-muted-foreground">
                    {q ? `${visibles.length} de ${ordenados.length} usuarios` : `${ordenados.length} usuarios con pedidos`} · primero los que se parecen a este dropshipper y los libres
                  </span>
                )}
              </div>
            )}
          </Campo>
          {/* Lo que se manda: un id_externo (y su tienda) por usuario elegido. El campo de abajo solo exige elegir al menos uno. */}
          {elegidosDatos.map((u) => (
            <span key={u.idExterno} hidden>
              <input type="hidden" name="id_externo" value={u.idExterno} />
              <input type="hidden" name="tienda_nombre" value={u.tienda ?? ""} />
            </span>
          ))}
          <input
            id="campo-usuario-cuenta-elegidos"
            required
            tabIndex={-1}
            aria-hidden="true"
            data-destino="campo-usuario-cuenta"
            value={elegidosDatos.length ? String(elegidosDatos.length) : ""}
            onChange={() => {}}
            className="sr-only"
          />
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
