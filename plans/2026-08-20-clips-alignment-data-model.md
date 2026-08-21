# Dificultad-bug: alineación de `.react-chip` / `.reply-btn` en clips SIN respuestas

> **Estado:** documentado para planificar — NO arreglado. Antes de tocar el
> frontend, hay que actualizar las tablas D1 (ver §5) para que la reparación
> sea limpia y no parche a trozos.
> **Fecha:** 2026-08-20 · **Afecta:** risa (y maria vía `flove-media.css`).

---

## 1. Síntoma (lo que ve el usuario)

En los clips de la lista que **tienen respuestas** (cadena), el chip de
reacciones (emoji) y el botón `+` (responder) quedan **pegados a la derecha**
de la tarjeta. En los clips **sin respuestas**, esos dos botones **no quedan
alineados a la derecha**: se quedan colgando a la izquierda de donde deberían,
como si el espacio flexible no se repartiera.

```
✓ con respuestas:     [▶]  Título ……………        [🤣] [+]
✗ sin respuestas:     [▶]  Título ……………  [🤣] [+]        ← hueco a la derecha
```

---

## 2. Por qué es una "dificultad" (y no un bug de una línea)

El renderizador **no produce la misma estructura** según si el clip tiene o no
respuestas, y el CSS depende de esa diferencia estructural. Los dos caminos
viven en `central/shared/code/js/flove-player.js` → `buildLi()`:

### Camino A — clip CON respuestas (`toggleLine` presente)

```
<li class="tgl">
  <div class="clip-card">            ← caja flexible con padding
    <div class="thread-item">        ← flex fila; .ti{flex:1} empuja a la derecha
      <span class="tag dl">▶</span>
      <span class="ti">Título …</span>
      … react-chip + reply-btn        ← pegados a la derecha ✓
    </div>
  </div>
  <div class="thread-toggle-line">…</div>
</li>
```

### Camino B — clip SIN respuestas (sin `toggleLine`)

```
<li>                                 ← el propio <li> es la caja (sin .clip-card)
  <div class="thread-item">          ← flex fila; .ti{flex:1} empuja a la derecha
    <span class="tag dl">▶</span>
    <span class="ti">Título …</span>
    … react-chip + reply-btn          ← NO empujan: .ti no ocupa todo el ancho ✗
  </div>
</li>
```

El **`li` base** de risa tiene su propio `display:flex; align-items:center;
gap:10px; padding:5px 12px` (línea 200 de `index.html`), y `.thread-item`
tiene `width:100%` (línea 600). Pero en el camino B el `li` es a la vez
contenedor flex **y** borde/padding de la tarjeta: el `.thread-item` (único
hijo) con `width:100%` debería llenarlo, y sin embargo el `flex:1` del `.ti`
no estira hasta el borde derecho porque el contexto flex de risa deja el
`thread-item` con `gap` interno que no se compensa con el `padding` del `li`.

En el camino A, el `.clip-card` **sí** tiene `display:flex; align-items:center;
gap:10px; padding:5px 12px; width:100%` (línea 374), y el `thread-item` con
`width:100%` queda dentro de ese flex con `padding` resuelto — por eso ahí
funciona.

**Conclusión del diagnóstico:** el alineado correcto en B depende de que
`li` no sea el contenedor estético + el flex del `thread-item` a la vez. Son
dos roles que chocan. La solución "parche" sería añadir `margin-left:auto` al
`.react-chip`/`.reply-btn` en el camino B o forzar `.ti{flex:1}` con un fix
de especificidad — todo eso es exactamente el tipo de parche que luego rompe
otra vista (maria, el feed, las páginas de autor).

---

## 3. Evidencia de medición (headless, 2026-08-20)

Render local de `risa/index.html` con Chrome headless (`--dump-dom`) y feed
inyectado. Medidas de `getBoundingClientRect()` sobre los clips del camino B:

```
tiRight:       100px   (distancia del borde derecho del <li> al borde del .ti)
reactRight:     51px   (el chip de emoji NO llega al borde: 51px de hueco)
replyRight:     14px   (el botón + sí llega: 14px = padding 12 + borde 2)
```

Es decir: **el `+` sí se pega a la derecha, el emoji chip no.** Ese hueco de
~37px entre `.react-chip` y `.reply-btn` es el `gap` + el ancho mal
repartido del `flex:1` del `.ti` en el contexto B. En el camino A ese hueco
no existe porque `.clip-card` media el layout.

---

## 4. Por qué arreglarlo bien exige tocar la base de datos primero

El frontend decide **qué camino** usa según `tree.children.get(cid)` →
`kids.length` (`flove-player.js:201-223`), y `cid` viene de `t.clip.id`. Esa
información de "¿tiene respuestas?" se deriva hoy de:

- `risa.json` (feed estático): **no** lleva `parent`/`depth` de forma fiable
  para todas las piezas (solo algunas filas de demo tienen `threads`).
- `threads` (tabla D1, `0001_initial.sql:48-54`): guarda `item_id, parent,
  app, depth`, pero **no** se sirve a la web en el render (la web lee
  `risa.json`; el Workers la replica, no la expone).
- `reactions` / `replies` (D1 `0007_community.sql:16-22, 50-59`): existen en
  la API (`/api/reactions`, `/api/replies`) pero **no** hay un endpoint que
  devuelva, para cada clip, "tiene respuestas / es respuesta de / depth".

Sin ese dato consistente por clip, el render no puede elegir el camino A/B de
forma fiable y se queda en el parche estético.

---

## 5. Trabajo previo en D1 (tablas) para desbloquear la reparación

1. **Exponer el grafo de hilos a la web** — nuevo endpoint `GET /api/threads?app=risa`
   (o ampliar `/api/search`) que devuelva `[{item_id, parent, depth}]` a partir de
   `threads` (+ `replies` como hojas `kind='quick'`), para que el frontend
   construya `tree.children` con datos reales y no con el feed estático.
2. **Normalizar `threads`** — añadir `kind` (`audio|video|quick|text`) y
   `src` opcional, para que un hilo mezcle respuestas de audio y quick-replies
   sin duplicar lógica. Añadir `parent_id` nullable en `replies` para
   anidamiento > 1 nivel.
3. **Relleno** — backfill de `threads` desde `replies` existentes
   (una `replies` sin `threads` = hoja de hilo huérfana hoy).
4. **Seed de demo** — ampliar `0001_initial.sql` (y/o `0007`) con un par de
   cadenas completas (padre + 1-2 respuestas) en `risa` para que el render
   A/B sea comprobable sin producción.

Una vez D1 da `parent/depth` por clip, `buildLi` puede renderizar **una sola
estructura** (camino A con `.clip-card` siempre, o el nuevo contrato único) y
eliminar el camino B divergente — ahí la alineación se arregla de una vez,
para risa y para maria, sin selectores de rescate.

---

## 6. Archivos y líneas implicadas

| Archivo | Línea | Qué es |
|---|---|---|
| `central/shared/code/js/flove-player.js` | 201-224 | Elección camino A/B en `buildLi` (`toggleLine`/`clip-card`) |
| `central/shared/code/js/flove-feed.js` | 69-119 | `threadOrder` / `buildTree` (derivan hijos por `clip.parent`) |
| `risa/index.html` | 200 | `li` base: flex + padding (contexto del camino B) |
| `risa/index.html` | 217 | `.ti{flex:1}` (el estiramiento que no llega en B) |
| `risa/index.html` | 298-308 | `.reply-btn` y `.react-chip` |
| `risa/index.html` | 374-375 | `.clip-card` (el contexto que funciona en A) |
| `risa/index.html` | 600 | `.thread-item{width:100%}` |
| `central/shared/code/css/flove-media.css` | 68-69, 107 | `.thread-item` compartido + `.thread-item.clip-remix` |
| `risa/worker/migrations/0001_initial.sql` | 48-54 | tabla `threads` |
| `risa/worker/migrations/0007_community.sql` | 16-22, 50-59 | `reactions`, `replies` |
| `risa/worker/api.mjs` | 212-257 | `POST /api/reactions`, `POST /api/replies` (no hay GET de hilos) |
| `maria/index.html` | 13, 38, 159-162 | importa `flove-media.css` + aliases de tokens (blasst radius) |

---

## 7. Notas para el arreglo final (post-D1)

- **Unificar el render**: siempre `.clip-card` como caja (camino A), con el
  `li` solo como contenedor de grid. Borrar el `li`-como-tarjeta del camino B.
- **`.ti` con `min-width:0`** ya está; asegurar `flex:1 1 0` no `1` a secas
  cuando el contenedor sea el `li` pelado.
- **Verificar en maria** después de tocar `flove-media.css`/`flove-player.js`:
  comparte el render de clips y sus tokens (`--paper-card`, `--app-accent`)
  ya mapeados (maria `index.html:38`).
- **No** añadir `margin-left:auto` suelto: es el parche que este doc quiere
  evitar. El dato de hilos en D1 es el que permite la unificación limpia.
