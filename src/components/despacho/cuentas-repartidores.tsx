"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cambiarCuentaRepartidorActiva, crearCuentaRepartidor, nuevaClaveRepartidor, type CuentaRepartidorFila } from "@/app/(app)/despacho-ciudad/repartidores-actions";
import { claseTdLista, claseThLista, MarcoTabla, Pastilla } from "@/components/panel/piezas-panel";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatearFechaHora } from "@/lib/formato";

const boton = `min-h-9 rounded-md border border-border bg-card px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-60 ${anilloFoco}`;
const botonPrincipal = `min-h-10 rounded-md bg-primario px-4 text-sm font-semibold text-white disabled:opacity-60 ${anilloFoco}`;

/** La clave temporal recién generada: se muestra una sola vez, con la dirección de entrada (como en las cuentas del proveedor). */
function ClaveTemporal({ nombre, clave, entrada, alCerrar }: { nombre: string; clave: string; entrada: string; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  return (
    <div role="status" className="flex flex-col gap-2 rounded-lg border border-primario/30 bg-primario-suave px-4 py-3 text-sm">
      <span>
        Clave temporal de <b>{nombre}</b>: se muestra <b>solo ahora</b>. Pásasela por un medio seguro junto con la dirección de entrada. Al entrar, el panel le
        pide elegir la suya.
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-card px-2 py-1 text-[15px] font-semibold tracking-wide select-all">{clave}</code>
        <button
          type="button"
          className={boton}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(clave);
              mostrarToast("Copiado");
            } catch {
              mostrarToast("No se pudo copiar: selecciónalo y cópialo a mano.", "destructive");
            }
          }}
        >
          Copiar clave
        </button>
        <button type="button" className={boton} onClick={alCerrar}>
          Listo
        </button>
      </span>
      <span className="text-muted-foreground">
        Entra en <b className="break-all text-foreground">{entrada}</b> desde el celular; se puede agregar a la pantalla de inicio como una app.
      </span>
    </div>
  );
}

/**
 * Envíos Delivery › Cuentas de repartidores (24 nov 2026, solo administradores): una cuenta por delivery, unida a su nombre en Envíos Delivery, para entrar
 * a su panel. Crear, dar una clave temporal nueva o desactivar.
 */
export function CuentasRepartidores({ cuentas, repartidores, entrada }: { cuentas: CuentaRepartidorFila[]; repartidores: string[]; entrada: string }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [clave, setClave] = useState<{ nombre: string; clave: string } | null>(null);
  const [courier, setCourier] = useState(repartidores[0] ?? "");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");

  const crear = () =>
    empezar(async () => {
      const r = await crearCuentaRepartidor(courier, nombre, email);
      if (r.error) return mostrarToast(r.error, "destructive");
      setClave({ nombre: r.cuenta!.nombre, clave: r.clave! });
      setNombre("");
      setEmail("");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      {clave && <ClaveTemporal nombre={clave.nombre} clave={clave.clave} entrada={entrada} alCerrar={() => setClave(null)} />}

      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          crear();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Repartidor en Envíos Delivery</span>
          <select value={courier} onChange={(e) => setCourier(e.target.value)} className={fieldClass}>
            {repartidores.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} required placeholder="July Calle" className={fieldClass} />
        </label>
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
          <span className={labelClass}>Correo para entrar</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="correo@…" className={fieldClass} />
        </label>
        <button type="submit" disabled={pendiente} className={botonPrincipal}>
          {pendiente ? "Creando…" : "Crear cuenta"}
        </button>
      </form>

      <MarcoTabla ariaLabel="Cuentas de repartidores">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={claseThLista}>Nombre</th>
              <th scope="col" className={claseThLista}>Repartidor</th>
              <th scope="col" className={claseThLista}>Correo</th>
              <th scope="col" className={claseThLista}>Último ingreso</th>
              <th scope="col" className={claseThLista}>Estado</th>
              <th scope="col" className={claseThLista}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.length === 0 && (
              <tr>
                <td colSpan={6} className={`${claseTdLista} text-center text-muted-foreground`}>
                  Todavía no hay cuentas.
                </td>
              </tr>
            )}
            {cuentas.map((c) => (
              <tr key={c.id}>
                <td className={claseTdLista}>{c.nombre}</td>
                <td className={claseTdLista}>{c.courier}</td>
                <td className={claseTdLista}>{c.email}</td>
                <td className={claseTdLista}>{c.ultimoIngreso ? formatearFechaHora(c.ultimoIngreso) : "Nunca"}</td>
                <td className={claseTdLista}>{c.activo ? <Pastilla tono="exito">Activa</Pastilla> : <Pastilla>Desactivada</Pastilla>}</td>
                <td className={claseTdLista}>
                  <span className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pendiente || !c.activo}
                      className={boton}
                      onClick={() =>
                        empezar(async () => {
                          const r = await nuevaClaveRepartidor(c.id);
                          if (r.error) return mostrarToast(r.error, "destructive");
                          setClave({ nombre: c.nombre, clave: r.clave! });
                          if (r.aviso) mostrarToast(r.aviso, "destructive");
                        })
                      }
                    >
                      Clave nueva
                    </button>
                    <button
                      type="button"
                      disabled={pendiente}
                      className={boton}
                      onClick={() =>
                        empezar(async () => {
                          const r = await cambiarCuentaRepartidorActiva(c.id, !c.activo);
                          if (r.error) return mostrarToast(r.error, "destructive");
                          if (r.aviso) mostrarToast(r.aviso, "destructive");
                          router.refresh();
                        })
                      }
                    >
                      {c.activo ? "Desactivar" : "Reactivar"}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </MarcoTabla>
    </div>
  );
}
