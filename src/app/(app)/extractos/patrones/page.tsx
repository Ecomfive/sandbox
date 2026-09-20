import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { crearPatron } from "./actions";
import { TablaPatrones } from "./tabla-patrones";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { FormularioConToast } from "@/components/ui/toast";

export const dynamic = "force-dynamic";

export default async function PatronesBancariosPage() {
  await requireModulo("extractos");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data: plataformas }, { data: patrones }] = await Promise.all([
    supabase.from("plataformas").select("id, nombre").order("nombre"),
    supabase
      .from("patrones_bancarios")
      .select("id, fragmento, plataforma_id, plataformas(nombre)")
      .eq("pais_id", pais.id)
      .order("fragmento"),
  ]);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Diccionario de patrones bancarios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pais.nombre} — cuando la descripción de un movimiento contiene uno de estos textos, el
          sistema le asigna la plataforma sola al cargar el extracto. Se llena automáticamente cada
          vez que asignas una plataforma a mano, pero también puedes agregar o afinar patrones aquí.
        </p>
      </div>

      <FormularioConToast
        action={crearPatron}
        mensajeExito="Patrón guardado"
        className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4"
      >
        <input type="hidden" name="pais_id" value={pais.id} />
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <label className={labelClass}>Texto a buscar</label>
          <input
            type="text"
            name="fragmento"
            required
            placeholder="Ej: TRANSF SINPE DROPI"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Plataforma</label>
          <select name="plataforma_id" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              Selecciona…
            </option>
            {(plataformas ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">Guardar patrón</Button>
      </FormularioConToast>

      <TablaPatrones
        patrones={(patrones ?? []).map((p) => ({
          id: p.id,
          fragmento: p.fragmento,
          plataforma: (p.plataformas as unknown as { nombre: string } | null)?.nombre ?? null,
        }))}
      />
    </Pagina>
  );
}
