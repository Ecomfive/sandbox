"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { buscarPedido, crearSolicitud, type PedidoEncontrado } from "@/app/(app)/despacho-cambios/actions";
import type { Persona } from "@/lib/postventa/datos";
import { formaPagoDespacho, nombreSolicitud, TIENDAS, TIPOS, textoSolicitud, type Linea } from "@/lib/postventa/reglas";
import type { TipoPostventa } from "@/lib/monday/postventa";

const MOTIVOS = [
  "El producto no funciona",
  "Llegó roto o derramado",
  "No le llegó el producto correcto",
  "Pedido incompleto (falta un producto)",
  "No es lo que esperaba",
  "Quiere otra variante, talla o graduación",
  "El pedido no se pudo despachar",
  "Otro",
];

const ESTADO_PEDIDO: Record<string, string> = { entregada: "entregado", devuelta: "devuelto", cancelada: "cancelado", en_transito: "en ruta", pendiente: "pendiente", no_gestionada: "sin gestionar" };

type LineaForm = Linea & { marcado: boolean };

/** Cambios y reembolsos › Nueva solicitud (16 nov 2026): el formulario con la vista previa del texto de siempre. */
export function FormularioSolicitud({ personas, hoy, puedeCuentas, usuarioId }: { personas: Persona[]; hoy: string; puedeCuentas: boolean; usuarioId: string }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [ocupado, empezar] = useTransition();
  const [tienda, setTienda] = useState("KENKU");
  const [numero, setNumero] = useState("");
  const [pedido, setPedido] = useState<PedidoEncontrado | null | undefined>(undefined);
  const [tipos, setTipos] = useState<TipoPostventa[]>(["cambio"]);
  const [retirar, setRetirar] = useState<LineaForm[]>([]);
  const [enviar, setEnviar] = useState<Linea[]>([{ cantidad: 1, producto: "" }]);
  const [reembolso, setReembolso] = useState("");
  const [reembolsoComo, setReembolsoComo] = useState("Transferencia");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [detalle, setDetalle] = useState("");
  const [costo, setCosto] = useState("3.50");
  const [paga, setPaga] = useState<"empresa" | "cliente">("empresa");
  const [responsable, setResponsable] = useState(usuarioId);
  const [fecha, setFecha] = useState(hoy);
  const [programar, setProgramar] = useState(true);
  const [cuenta, setCuenta] = useState("");

  const t = (x: TipoPostventa) => tipos.includes(x);
  const conRetirar = t("cambio") || t("retiro") || t("reembolso");
  const conEnviar = t("cambio") || t("complemento") || t("faltante") || t("envio") || t("garantia");
  const retirarElegido = conRetirar ? retirar.filter((l) => l.marcado).map(({ cantidad, producto }) => ({ cantidad, producto })) : [];
  const enviarElegido = conEnviar ? enviar.filter((l) => l.producto.trim() && l.cantidad > 0) : [];
  const monto = (v: string) => (v.trim() && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : null);
  const conReparto = retirarElegido.length > 0 || enviarElegido.length > 0;
  const datos = {
    tienda,
    numero: numero || "…",
    tipos,
    retirar: retirarElegido,
    enviar: enviarElegido,
    reembolso: t("reembolso") ? monto(reembolso) : null,
    reembolsoComo: t("reembolso") ? reembolsoComo : null,
    motivo,
    detalle: detalle.trim() || null,
    costoEnvio: conReparto ? monto(costo) : null,
    enviaPaga: paga,
  };

  const buscar = (tiendaElegida = tienda, n = numero) => {
    if (n.replace(/\D/g, "").length < 3) return setPedido(undefined);
    empezar(async () => {
      const r = await buscarPedido(tiendaElegida, n);
      if ("error" in r) return mostrarToast(r.error, "destructive");
      setPedido(r.pedido);
      if (r.pedido) setRetirar(r.pedido.lineas.map((l) => ({ ...l, marcado: true })));
    });
  };

  const enviarFormulario = () =>
    empezar(async () => {
      const r = await crearSolicitud({
        tienda,
        numero,
        tipos,
        retirar: retirarElegido,
        enviar: enviarElegido,
        reembolso: datos.reembolso,
        reembolsoComo: datos.reembolsoComo,
        motivo,
        detalle: datos.detalle,
        costoEnvio: datos.costoEnvio,
        envioPaga: paga,
        responsableId: responsable || null,
        fecha: fecha || null,
        cuenta: puedeCuentas && t("reembolso") ? cuenta.trim() || null : null,
        programar: programar && conReparto,
      });
      if (r.error) mostrarToast(r.error, "destructive");
      if (r.itemId) {
        mostrarToast("Solicitud creada.", "success");
        router.push(`/despacho-cambios?caso=${r.itemId}`);
      }
    });

  const chip = (activo: boolean) =>
    `min-h-10 rounded-full border px-3.5 text-[13px] font-medium ${anilloFoco} ${activo ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"}`;
  const tarjeta = "flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-4";
  const etiqueta = "flex flex-col gap-1.5 text-[13px] font-semibold";

  return (
    <div className="grid grid-cols-1 items-start gap-5 min-[1200px]:grid-cols-[minmax(0,1fr)_420px]">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          enviarFormulario();
        }}
      >
        <section className={tarjeta} aria-labelledby="f1">
          <h2 id="f1" className="m-0 text-[15px] font-bold">
            1 · El pedido
          </h2>
          <div role="group" aria-label="Tienda" className="flex flex-wrap gap-1.5">
            {TIENDAS.map((x) => (
              <button
                key={x.nombre}
                type="button"
                aria-pressed={tienda === x.nombre}
                onClick={() => {
                  setTienda(x.nombre);
                  buscar(x.nombre);
                }}
                className={chip(tienda === x.nombre)}
              >
                {x.nombre}
              </button>
            ))}
          </div>
          <label className={etiqueta}>
            Número de pedido
            <span className="flex flex-wrap gap-2">
              <input value={numero} onChange={(e) => setNumero(e.target.value)} onBlur={() => buscar()} placeholder="Ej. 44510 o CS17220" className={`${fieldClass} max-w-64`} required />
              <button type="button" onClick={() => buscar()} disabled={ocupado} className={`rounded-md border border-border px-3 text-sm ${anilloFoco}`}>
                Buscar
              </button>
            </span>
          </label>
          {pedido === null && <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-xs">No se encontró ese pedido de {tienda} en el sistema. Puedes crear la solicitud igual y escribir los productos.</p>}
          {pedido && (
            <div className="rounded-xl border border-primario/30 bg-primario-suave/40 p-3 text-[13px]">
              <b>
                Pedido #{pedido.numero} · {ESTADO_PEDIDO[pedido.estado] ?? pedido.estado}
              </b>
              <div className="text-muted-foreground">
                Del {pedido.fecha.split("-").reverse().join("/")} · total ${pedido.total.toFixed(2)}
                {pedido.metodo ? ` · pagó con ${pedido.metodo}` : ""}
              </div>
              <div className="text-muted-foreground">Productos: {pedido.lineas.map((l) => `${l.cantidad} × ${l.producto}`).join(" · ") || "—"}</div>
            </div>
          )}
        </section>

        <section className={tarjeta} aria-labelledby="f2">
          <h2 id="f2" className="m-0 text-[15px] font-bold">
            2 · Qué hay que hacer
          </h2>
          <div role="group" aria-label="Tipo (puedes elegir varios)" className="flex flex-wrap gap-1.5">
            {TIPOS.map((x) => (
              <button key={x.clave} type="button" aria-pressed={t(x.clave)} onClick={() => setTipos((ts) => (ts.includes(x.clave) ? ts.filter((y) => y !== x.clave) : [...ts, x.clave]))} className={chip(t(x.clave))}>
                {x.nombre}
              </button>
            ))}
          </div>
          {conRetirar && (
            <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
              <legend className="mb-1 text-[13px] font-semibold">Retirar (del pedido)</legend>
              {retirar.length ? (
                retirar.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px] items-center gap-2 border-b border-border/50 py-1 text-[13px]">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={l.marcado} onChange={(e) => setRetirar((rs) => rs.map((x, k) => (k === i ? { ...x, marcado: e.target.checked } : x)))} />
                      {l.producto}
                    </label>
                    <input
                      value={l.cantidad}
                      inputMode="numeric"
                      aria-label={`Unidades de ${l.producto} a retirar`}
                      onChange={(e) => setRetirar((rs) => rs.map((x, k) => (k === i ? { ...x, cantidad: Number(e.target.value) || 0 } : x)))}
                      className={fieldClass}
                    />
                  </div>
                ))
              ) : (
                <p className="m-0 text-xs text-muted-foreground">Escribe el número de pedido para elegir sus productos.</p>
              )}
            </fieldset>
          )}
          {conEnviar && (
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1 text-[13px] font-semibold">Enviar / entregar</legend>
              {enviar.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_auto] items-center gap-2">
                  <input
                    value={l.producto}
                    list="productos-pedido"
                    placeholder="Producto"
                    aria-label={`Producto a enviar ${i + 1}`}
                    onChange={(e) => setEnviar((es) => es.map((x, k) => (k === i ? { ...x, producto: e.target.value } : x)))}
                    className={fieldClass}
                  />
                  <input
                    value={l.cantidad}
                    inputMode="numeric"
                    aria-label={`Unidades a enviar ${i + 1}`}
                    onChange={(e) => setEnviar((es) => es.map((x, k) => (k === i ? { ...x, cantidad: Number(e.target.value) || 0 } : x)))}
                    className={fieldClass}
                  />
                  <button type="button" aria-label={`Quitar producto ${i + 1}`} onClick={() => setEnviar((es) => (es.length > 1 ? es.filter((_, k) => k !== i) : [{ cantidad: 1, producto: "" }]))} className={`rounded-md border border-border px-2.5 py-2 text-xs ${anilloFoco}`}>
                    Quitar
                  </button>
                </div>
              ))}
              <datalist id="productos-pedido">
                {(pedido?.lineas ?? []).map((l) => (
                  <option key={l.producto} value={l.producto} />
                ))}
              </datalist>
              <button type="button" onClick={() => setEnviar((es) => [...es, { cantidad: 1, producto: "" }])} className={`self-start rounded-md border border-border px-3 py-1.5 text-xs font-medium ${anilloFoco}`}>
                + Otro producto
              </button>
            </fieldset>
          )}
          {t("reembolso") && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-3">
                <label className={`${etiqueta} flex-1 basis-40`}>
                  Monto a reembolsar ($)
                  <input value={reembolso} onChange={(e) => setReembolso(e.target.value)} inputMode="decimal" className={fieldClass} />
                </label>
                <label className={`${etiqueta} flex-1 basis-48`}>
                  Cómo se reembolsa
                  <select value={reembolsoComo} onChange={(e) => setReembolsoComo(e.target.value)} className={fieldClass}>
                    <option>Transferencia</option>
                    <option>Yappy</option>
                    <option>Saldo a favor</option>
                  </select>
                </label>
              </div>
              {puedeCuentas ? (
                <label className={etiqueta}>
                  Datos para el reembolso <span className="text-xs font-normal text-muted-foreground">(solo los ve Finanzas; se borran al marcar Hecho)</span>
                  <textarea value={cuenta} onChange={(e) => setCuenta(e.target.value)} rows={3} maxLength={1000} placeholder="Titular, banco, tipo y número de cuenta (o Yappy)" className={`${fieldClass} resize-y font-normal`} />
                </label>
              ) : (
                <p className="m-0 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Los datos bancarios del cliente los anota Finanzas en la solicitud.</p>
              )}
            </div>
          )}
          <label className={etiqueta}>
            Motivo
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={fieldClass}>
              {MOTIVOS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className={etiqueta}>
            Detalle <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
            <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={2} maxLength={500} placeholder="Ej. el cliente indica que las antenas no le funcionan" className={`${fieldClass} resize-y font-normal`} />
          </label>
        </section>

        <section className={tarjeta} aria-labelledby="f3">
          <h2 id="f3" className="m-0 text-[15px] font-bold">
            3 · Envío y responsable
          </h2>
          {conReparto && (
            <div className="flex flex-wrap gap-3">
              <label className={`${etiqueta} flex-1 basis-36`}>
                Costo del envío ($)
                <input value={costo} onChange={(e) => setCosto(e.target.value)} inputMode="decimal" className={fieldClass} />
              </label>
              <div className={`${etiqueta} flex-[2] basis-60`}>
                Lo paga
                <div role="group" aria-label="Quién paga el envío" className="flex gap-1.5">
                  {(["empresa", "cliente"] as const).map((x) => (
                    <button key={x} type="button" aria-pressed={paga === x} onClick={() => setPaga(x)} className={chip(paga === x)}>
                      {x === "empresa" ? "La empresa" : "El cliente (se cobra al entregar)"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <label className={`${etiqueta} flex-1 basis-52`}>
              Responsable
              <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={fieldClass}>
                <option value="">Sin responsable</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${etiqueta} flex-1 basis-44`}>
              Fecha acordada con el cliente
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={fieldClass} />
            </label>
          </div>
          {conReparto && (
            <label className="flex items-start gap-2.5 text-[13px]">
              <input type="checkbox" checked={programar} onChange={(e) => setProgramar(e.target.checked)} className="mt-1" />
              <span>
                <b>Programarla ya en Despacho ciudad</b> para la fecha acordada (crea la fila del reparto con forma de pago {formaPagoDespacho(tipos, enviarElegido.length > 0)}). Al entregarse, la solicitud pasa a Hecho sola.
              </span>
            </label>
          )}
        </section>

        <div className="flex flex-wrap gap-2.5">
          <button type="submit" disabled={ocupado} className={`boton-neon min-h-10 rounded-md px-4 text-sm font-medium text-white ${anilloFoco}`}>
            Crear solicitud
          </button>
          <Link href="/despacho-cambios" className={`inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm ${anilloFoco}`}>
            Cancelar
          </Link>
        </div>
      </form>

      <aside aria-label="Vista previa" className={`${tarjeta} min-[1200px]:sticky min-[1200px]:top-4`}>
        <h2 className="m-0 text-[15px] font-bold">Así queda en el tablero</h2>
        <div className="rounded-lg border border-border border-l-4 border-l-[#579bfc] px-3 py-2 text-[13px] font-semibold">{nombreSolicitud(datos)}</div>
        <p className="m-0 text-xs text-muted-foreground">Grupo «Cambios/Retiros/Reembolsos/Complementos» · Estado En Proceso</p>
        <h3 className="m-0 text-[13px] font-semibold">Y la solicitud, con el formato de siempre</h3>
        <pre className="m-0 rounded-lg border border-border/70 bg-muted/40 p-3 font-sans text-[13px] whitespace-pre-wrap">{textoSolicitud(datos)}</pre>
      </aside>
    </div>
  );
}
