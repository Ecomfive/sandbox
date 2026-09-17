import { PaisSelector } from "@/components/pais-selector";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { cerrarSesion } from "@/app/login/actions";
import type { UsuarioActual } from "@/lib/auth";

export async function NavBar({ usuario }: { usuario: UsuarioActual | null }) {
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-end gap-3 py-3 pr-6 pl-14 md:pl-6">
        {usuario && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              {usuario.nombre ?? usuario.email}
              {usuario.rolNombre ? ` · ${usuario.rolNombre}` : ""}
            </span>
            <form action={cerrarSesion}>
              <button type="submit" className="text-accent hover:text-accent-hover">
                Cerrar sesión
              </button>
            </form>
          </div>
        )}
        <PaisSelector actual={pais.codigo} />
      </div>
    </header>
  );
}
