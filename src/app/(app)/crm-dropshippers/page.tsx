import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { crearDropshipper, actualizarDropshipper, registrarInteraccion } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fieldClass, fieldClassSm, labelClass, labelClassSm } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { DropshipperIcon } from "@/lib/nav-icons";

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

const ESTADOS = [
  { valor: "prospecto", etiqueta: "Prospecto" },
  { valor: "activo", etiqueta: "Activo" },
  { valor: "inactivo", etiqueta: "Inactivo" },
] as const;

const TIPOS_INTERACCION = [
  { valor: "llamada", etiqueta: "Llamada" },
  { valor: "whatsapp", etiqueta: "WhatsApp" },
  { valor: "email", etiqueta: "Correo" },
  { valor: "reunion", etiqueta: "Reunión" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

const toneEstado: Record<string, "neutral" | "success" | "info"> = {
  prospecto: "info",
  activo: "success",
  inactivo: "neutral",
};

export default async function CrmDropshippersPage() {
  await requireModulo("crm-dropshippers");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data: dropshippers }, { data: interacciones }] = await Promise.all([
    supabase
      .from("dropshippers")
      .select("id, nombre, contacto_email, contacto_telefono, estado, volumen_mensual_estimado, notas")
      .eq("pais_id", pais.id)
      .order("nombre"),
    supabase
      .from("interacciones_dropshipper")
      .select("id, fecha, tipo, nota, dropshippers!inner(nombre, pais_id)")
      .eq("dropshippers.pais_id", pais.id)
      .order("fecha", { ascending: false })
      .limit(50),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <DropshipperIcon className="h-5 w-5 text-muted-foreground" />
          CRM Dropshippers
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pais.nombre} — directorio y bitácora de comunicación con dropshippers. El volumen de
          ventas se ingresa a mano hasta conectar las órdenes de Dropi.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold tracking-tight">Agregar dropshipper</h2>
        <form
          action={crearDropshipper}
          className="mt-3 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4"
        >
          <input type="hidden" name="pais_id" value={pais.id} />
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Nombre</label>
            <input type="text" name="nombre" required className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Correo</label>
            <input type="email" name="contacto_email" className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Teléfono</label>
            <input type="text" name="contacto_telefono" className={fieldClass} />
          </div>
          <Button type="submit">Agregar</Button>
        </form>
      </div>

      <div>
        <h2 className="text-sm font-semibold tracking-tight">Dropshippers</h2>
        {(dropshippers ?? []).length === 0 ? (
          <EstadoVacio
            mensaje={`Todavía no hay dropshippers registrados para ${pais.nombre}.`}
            className="mt-3"
          />
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {(dropshippers ?? []).map((d) => (
              <form
                key={d.id}
                action={actualizarDropshipper}
                className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4"
              >
                <input type="hidden" name="id" value={d.id} />
                <div className="min-w-[10rem] flex-1">
                  <p className="text-sm font-medium">{d.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.contacto_email ?? "—"} {d.contacto_telefono ? `· ${d.contacto_telefono}` : ""}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClassSm}>Estado</label>
                  <select name="estado" defaultValue={d.estado} className={fieldClassSm}>
                    {ESTADOS.map((e) => (
                      <option key={e.valor} value={e.valor}>
                        {e.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClassSm}>Volumen mensual est.</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="volumen_mensual_estimado"
                    defaultValue={d.volumen_mensual_estimado ?? ""}
                    className={`${fieldClassSm} w-32 tabular-nums`}
                  />
                </div>
                <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
                  <label className={labelClassSm}>Notas</label>
                  <input type="text" name="notas" defaultValue={d.notas ?? ""} className={fieldClassSm} />
                </div>
                <Badge tone={toneEstado[d.estado] ?? "neutral"}>
                  {ESTADOS.find((e) => e.valor === d.estado)?.etiqueta ?? d.estado}
                </Badge>
                <Button type="submit" variant="secondary" className="text-xs">
                  Guardar
                </Button>
              </form>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold tracking-tight">Registrar interacción</h2>
        {(dropshippers ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Agrega al menos un dropshipper para poder registrar interacciones.
          </p>
        ) : (
          <form
            action={registrarInteraccion}
            className="mt-3 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Dropshipper</label>
              <select name="dropshipper_id" required className={fieldClass}>
                {(dropshippers ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Tipo</label>
              <select name="tipo" defaultValue="whatsapp" className={fieldClass}>
                {TIPOS_INTERACCION.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Fecha</label>
              <input type="date" name="fecha" defaultValue={hoy()} required className={fieldClass} />
            </div>
            <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
              <label className={labelClass}>Nota</label>
              <input type="text" name="nota" required className={fieldClass} />
            </div>
            <Button type="submit">Registrar</Button>
          </form>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold tracking-tight">Interacciones recientes</h2>
        <div className="mt-3 min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <th className="py-2 pr-3 pl-4 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">Dropshipper</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Nota</th>
              </tr>
            </thead>
            <tbody>
              {(interacciones ?? []).map((i) => {
                const dropshipper = i.dropshippers as unknown as { nombre: string } | null;
                return (
                  <tr key={i.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 pl-4">{formatearFecha(i.fecha)}</td>
                    <td className="py-2 pr-3 font-medium">{dropshipper?.nombre}</td>
                    <td className="py-2 pr-3">
                      <Badge tone="neutral">
                        {TIPOS_INTERACCION.find((t) => t.valor === i.tipo)?.etiqueta ?? i.tipo}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{i.nota}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(interacciones ?? []).length === 0 && (
            <EstadoVacio mensaje="Todavía no hay interacciones registradas." />
          )}
        </div>
      </div>
    </main>
  );
}
