import { supabaseConfigurado } from "../lib/supabase.js";

/** Aviso fijo que aparece solo cuando faltan las claves de Supabase en el archivo .env */
export default function AvisoConfiguracion() {
  if (supabaseConfigurado) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-(--stock-bajo) bg-(--viz-naranja-fondo) px-4 py-3 text-sm text-(--viz-naranja-texto)"
      role="alert"
    >
      <strong className="font-semibold">Falta configurar Supabase.</strong> Copiá{" "}
      <code className="rounded bg-(--superficie) px-1">.env.example</code> como{" "}
      <code className="rounded bg-(--superficie) px-1">.env</code>, completá{" "}
      <code className="rounded bg-(--superficie) px-1">VITE_SUPABASE_URL</code> y{" "}
      <code className="rounded bg-(--superficie) px-1">VITE_SUPABASE_ANON_KEY</code> y reiniciá{" "}
      <code className="rounded bg-(--superficie) px-1">npm run dev</code>. Mientras tanto, el inicio de sesión no funciona.
    </div>
  );
}
