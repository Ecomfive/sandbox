function inicialesDe(texto: string): string {
  const partes = texto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
  return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase();
}

const TAMANOS = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
} as const;

/** Foto de la persona, o un círculo con sus iniciales (del nombre, o de la primera letra del
 * correo si todavía no tiene nombre) — mismo estilo que el avatar propio del pie del menú. */
export function AvatarPersona({
  nombre,
  email,
  avatarUrl,
  tamano = "md",
}: {
  nombre: string | null;
  email: string;
  avatarUrl: string | null;
  tamano?: keyof typeof TAMANOS;
}) {
  return (
    <span
      className={`relative ${TAMANOS[tamano]} shrink-0 overflow-hidden rounded-full border border-border bg-muted`}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-medium text-muted-foreground">
          {inicialesDe(nombre || email)}
        </span>
      )}
    </span>
  );
}
