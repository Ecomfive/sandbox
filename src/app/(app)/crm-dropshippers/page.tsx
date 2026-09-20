import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { crearDropshipper, registrarInteraccion } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { DropshipperIcon } from "@/lib/nav-icons";
import { TIPOS_INTERACCION, type FilaDropshipper, type FilaInteraccion } from "./def-crm";
import { ListaDropshippers } from "./lista-dropshippers";
import { TablaInteracciones } from "./tabla-interacciones";

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

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

  const filasDropshippers: FilaDropshipper[] = (dropshippers ?? []).map((d) => ({
    id: d.id,
    nombre: d.nombre,
    email: d.contacto_email,
    telefono: d.contacto_telefono,
    estado: d.estado,
    volumen: d.volumen_mensual_estimado === null ? null : Number(d.volumen_mensual_estimado),
    notas: d.notas,
  }));

  const filasInteracciones: FilaInteraccion[] = (interacciones ?? []).map((i) => ({
    id: i.id,
    fecha: i.fecha,
    dropshipper: (i.dropshippers as unknown as { nombre: string } | null)?.nombre ?? "",
    tipo: i.tipo,
    nota: i.nota,
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-10">
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
        <div className="mt-3">
          <ListaDropshippers dropshippers={filasDropshippers} pais={pais.nombre} />
        </div>
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
        <div className="mt-3">
          <TablaInteracciones interacciones={filasInteracciones} />
        </div>
      </div>
    </Pagina>
  );
}
