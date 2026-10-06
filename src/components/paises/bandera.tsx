/**
 * La bandera de un país por su código ISO de dos letras, como imagen (en Windows los emojis de bandera salen como dos
 * letras). Sirve para cualquier país que se agregue desde el sistema. Es decorativa: el nombre del país va al lado.
 */
export function Bandera({ codigo, className = "" }: { codigo: string; className?: string }) {
  const iso = codigo.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(iso)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/${iso}.svg`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className={`inline-block h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-border ${className}`}
    />
  );
}
