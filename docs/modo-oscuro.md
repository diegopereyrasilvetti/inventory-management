# Modo oscuro

## Cómo funciona

- Los colores son variables CSS en `src/index.css`. El tema oscuro redefine esas variables bajo `:root[data-theme="dark"]`; no hay colores nuevos fuera de los tokens.
- El tema inicial sale de lo guardado por la persona y, si no hay nada, de la preferencia del sistema (`prefers-color-scheme`). Un script en `index.html` lo aplica antes de pintar para evitar un destello claro.
- La elección se guarda en `localStorage` con la clave `theme` (`light` o `dark`). Es una preferencia de pantalla, no un dato sensible.
- Botón para cambiar: un interruptor con un sol y una luna chicos (la perilla se desliza al tema activo), en el menú de usuario del panel ("Modo oscuro / Modo claro"), en el encabezado de la página de inicio y en el de las pantallas de acceso.
- Código: `src/lib/theme.js`, `src/hooks/useTheme.js`, `src/components/ToggleTema.jsx`.

## Tokens nuevos

Algunos tokens servían para dos cosas a la vez (texto y relleno), lo que impedía invertirlos. Se separaron; en el tema claro tienen el mismo valor que antes, así que no cambia nada visualmente.

| Token | Uso | Antes |
|---|---|---|
| `--boton` | Relleno de botones con texto blanco | `--acento-hover` |
| `--boton-hover` | Relleno al pasar el mouse | `--texto` |
| `--alerta-fondo` | Insignia y botón de alerta con texto blanco | `--stock-agotado` |
| `--pie`, `--pie-texto` | Pie de página, oscuro en ambos temas | `--texto`, `#e8dcc8` |

## Contraste

`src/lib/theme.test.js` verifica contraste AA (4.5:1) de los pares usados en el tema oscuro y de los tokens nuevos en el claro.

## Limitaciones

- Los pares `--stock-bajo` sobre blanco y el texto blanco sobre `--acento` ya estaban por debajo de AA en el tema claro; no se tocaron.
- No se revisó visualmente cada pantalla en el navegador; falta una pasada manual y las capturas.
