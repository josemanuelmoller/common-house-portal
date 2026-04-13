# Common House — Platform Design System

Referencia canónica para construir nuevas vistas en `platform-admin.html`. Todo lo que hay aquí está extraído del CSS existente — no interpretar ni inventar variantes. Si algo no está aquí, pedir aprobación antes de crear.

---

## Tokens de color

```css
:root {
  --lime:    #c8f55a;   /* acento principal, CTAs, active states */
  --black:   #000000;   /* page headers, botones primarios */
  --white:   #ffffff;   /* cards, sidebar, fondos de contenido */
  --ink:     #0e0e0e;   /* texto principal */
  --muted:   #6b6b6b;   /* texto secundario, metadata, labels */
  --border:  #d8d8d0;   /* bordes de cards, divisores */
  --bg:      #eeeee8;   /* fondo general (off-white cálido) */

  /* Señales de relationship warmth */
  --hot:     #22c55e;   /* verde — relación activa y caliente */
  --warm:    #f59e0b;   /* ámbar — relación tibia */
  --cold:    #ef4444;   /* rojo — relación fría o problema */
  --dormant: #9ca3af;   /* gris — relación inactiva */
}
```

**Reglas de uso:**
- `--lime` solo en CTAs primarios, active states de nav, y pill de status destacado
- `--black` en page headers (dark) y botones `btn-primary`
- Nunca usar `#000` ni `#fff` directos — usar variables
- El fondo de página es `--bg` (#eeeee8), no blanco
- Para texto en fondo oscuro: `rgba(255,255,255,0.38)` para subtítulos, `rgba(255,255,255,0.2)` para eyebrows

---

## Tipografía

**Fuente:** Inter (Google Fonts) — pesos 300, 400, 500, 600, 700, 800, 900. Itálica en 700 y 800.

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,700;1,800&display=swap" rel="stylesheet">
```

### Escala tipográfica

| Uso | Size | Weight | Notas |
|-----|------|--------|-------|
| Page title | `2.6rem` | 300 | letter-spacing: -1.5px |
| Page title (em italic) | `2.6rem` | 900 italic | color: `--lime` |
| Card name / section header | `14–15px` | 800 | letter-spacing: -0.3–0.4px |
| Body text | `12–12.5px` | 400–600 | line-height: 1.5–1.65 |
| Label ALL-CAPS | `7–9px` | 700 | letter-spacing: 1.5–2.5px, uppercase |
| Stat value (grande) | `1.6rem` | 900 | letter-spacing: -1px |
| Meta / fecha | `9.5–10px` | 400–500 | color: `--muted` |
| Badge / pill text | `8–8.5px` | 700 | letter-spacing: 1.5px |
| Eyebrow | `8px` | 700 | letter-spacing: 2.5px, rgba(255,255,255,0.2) |

**Patrón de título de vista:**
```html
<h1 class="page-title">The <em>Garage</em></h1>
<!-- → "The" en weight 300, "Garage" en 900 italic lime -->
```

---

## Layout

### Estructura base
```
┌──────────────────────────────────────────────┐
│ sidebar (228px, fijo)  │  main (flex: 1)      │
│                        │  ┌─────────────────┐ │
│                        │  │ page-header     │ │
│                        │  │ (fondo negro)   │ │
│                        │  ├─────────────────┤ │
│                        │  │ .content        │ │
│                        │  │ padding: 36px   │ │
│                        │  │         52px    │ │
│                        │  └─────────────────┘ │
└──────────────────────────────────────────────┘
```

```css
--sidebar-w: 228px;

.main       { margin-left: var(--sidebar-w); }
.page-header { padding: 40px 52px 44px; background: var(--black); }
.content    { padding: 36px 52px 60px; }
```

### Grids de contenido

```css
.two-col    { grid-template-columns: 1fr 1fr;    gap: 20px; }
.two-col-32 { grid-template-columns: 2fr 1fr;    gap: 20px; }
.three-col  { grid-template-columns: repeat(3, 1fr); gap: 16px; }

/* Para stats en la Home */
.stats-row  { grid-template-columns: repeat(4, 1fr); gap: 12px; }
```

---

## Componentes

### Page Header (dark)
```html
<header class="page-header">
  <p class="page-eyebrow">Sección · Subsección</p>
  <div class="page-header-row">
    <div>
      <h1 class="page-title">Nueva <em>Vista</em></h1>
      <p class="page-sub">Descripción breve de lo que hace esta vista.</p>
    </div>
    <div><!-- botones opcionales --></div>
  </div>
</header>
```

### Card
```html
<div class="card">
  <div class="card-header">
    <div class="card-header-left">
      <div class="card-icon"><!-- emoji o svg --></div>
      <span class="card-label">Título</span>
    </div>
    <!-- acción opcional -->
  </div>
  <div class="card-body"><!-- contenido --></div>
</div>

<!-- Variantes del card-icon -->
<div class="card-icon">        <!-- fondo negro (default) -->
<div class="card-icon lime">   <!-- fondo lime -->
<div class="card-icon ghost">  <!-- fondo bg con borde -->
```

### Section bar (divisor con label)
```html
<div class="section-bar">
  <span class="section-label">Título de sección</span>
  <div class="section-line"></div>
  <span class="section-count">12</span>  <!-- opcional -->
</div>
```

### Stat pill
```html
<div class="stat-pill">
  <div class="stat-label">Métrica</div>
  <div class="stat-value">42</div>       <!-- o .stat-value.lime para verde -->
  <div class="stat-sub">descripción</div>
</div>
```

### Buttons
```html
<button class="btn btn-primary">Acción principal</button>  <!-- negro -->
<button class="btn btn-lime">⚡ CTA destacado</button>      <!-- lime -->
<button class="btn btn-ghost">Secundario</button>           <!-- outline -->
<button class="btn">Default</button>                        <!-- neutral -->
```

### Pills de status
```html
<span class="pill">Default</span>          <!-- negro -->
<span class="pill lime">Activo</span>      <!-- lime / positivo -->
<span class="pill ghost">Inactivo</span>   <!-- ghost / neutral -->
<span class="pill amber">Pendiente</span>  <!-- ámbar / advertencia -->
<span class="pill red">Urgente</span>      <!-- rojo / error -->
```

### Warmth dot (señal de relación)
```html
<span class="warmth">
  <span class="warmth-dot hot"></span> Hot
</span>
<!-- Opciones: hot | warm | cold | dormant -->
```

### Nav badge
```html
<span class="nav-badge">5</span>          <!-- gris neutro -->
<span class="nav-badge red">3</span>      <!-- rojo — alertas -->
```

### P1 Banner (alerta crítica)
```html
<div class="p1-banner">
  <div class="p1-dot"></div>
  <p class="p1-text"><strong>Título del problema:</strong> descripción breve.</p>
  <a class="p1-link">Revisar →</a>
</div>
```

---

## Patrones de navegación sidebar

```html
<!-- Grupo colapsable -->
<div class="nav-group" id="group-portfolio">
  <div class="nav-group-header" onclick="toggleGroup('portfolio')">
    <div class="nav-group-header-left">
      <span class="nav-icon">◧</span> Portfolio
    </div>
    <span class="nav-group-arrow">▾</span>
  </div>
  <div class="nav-group-items">
    <a class="nav-sub-item active" data-view="garage">
      <span class="nav-sub-icon">◧</span> Garage
      <span class="nav-badge">5</span>
    </a>
  </div>
</div>

<!-- Item simple (sin grupo) -->
<a class="nav-item" data-view="hall">
  <span class="nav-icon">⌂</span> The Hall
</a>
```

**Active state:** `border-left: 2px solid var(--lime); background: rgba(200,245,90,0.12–0.14)`

---

## Patrones de tabs internos

```html
<!-- Nav de tabs -->
<div class="garage-tabs-nav">
  <div class="garage-tabs">
    <button class="garage-tab active" onclick="switchGarageTab(this,'tab-id')">Tab 1</button>
    <button class="garage-tab" onclick="switchGarageTab(this,'tab-id-2')">Tab 2</button>
  </div>
  <button class="btn btn-lime" style="font-size:10px;padding:6px 14px;">Acción</button>
</div>

<!-- Contenido de tabs -->
<div id="tab-id" class="garage-tab-content active">...</div>
<div id="tab-id-2" class="garage-tab-content">...</div>
```

El mismo patrón aplica para OS Queue Tabs con `.os-queue-tab` y `switchOSQueueTab`.

---

## Señales y severity

| Nivel | Color | Uso |
|-------|-------|-----|
| Crítico | `#dc2626` rojo / `#fee2e2` bg | Bloquea — sin alternativa |
| Alto | `#d97706` ámbar / `#fffbeb` bg | Impacta significativamente |
| Medio | `#2563eb` azul / `#eff6ff` bg | Debilita — atender pronto |
| Bajo | `--muted` gris | Mejora — cuando haya tiempo |
| OK / Positivo | `#16a34a` verde / lime bg | Confirmado / completo |

```html
<!-- Ejemplo severity badge -->
<span class="vc-issue-sev critical">Crítico</span>   <!-- rojo -->
<span class="vc-issue-sev high">Alto</span>           <!-- ámbar -->
<span class="vc-issue-sev medium">Medio</span>        <!-- azul -->
```

---

## Transiciones y hover states

```css
/* Estándar en todos los componentes interactivos */
transition: border-color 0.2s, transform 0.15s;   /* cards */
transition: color 0.15s, background 0.15s;         /* nav items */
transition: opacity 0.15s;                         /* botones */

/* Elevación en hover de cards */
.card:hover { border-color: #aaa; transform: translateY(-2px); }

/* Botones */
.btn:hover { opacity: 0.82; }
```

---

## Bordes y radios

| Elemento | Border radius |
|----------|--------------|
| Cards principales | `14px` |
| Botones | `8px` |
| Pills de status | `20px` (fully rounded) |
| Avatares / iconos | `10px` (cuadrado redondeado) |
| Badges nav | `8px` |
| Inputs / textareas | `8px` |
| Barras de progreso | `2–4px` |

Border: siempre `1.5px solid var(--border)` en cards. `1px solid var(--border)` en divisores internos.

---

## Reglas de diseño — NO hacer

1. **No usar colores fuera de la paleta** — ningún color nuevo sin aprobación
2. **No usar font-weight < 300 ni > 900**
3. **No usar `border-radius` > 14px** en cards (excepto pills)
4. **No usar sombras (box-shadow)** — el sistema usa bordes, no elevación por sombra
5. **No poner fondos de color en cards** — siempre `var(--white)` o `var(--bg)`
6. **No usar texto con opacity < 0.18** — ilegible
7. **No crear variantes de componentes** sin documentarlas aquí primero
8. **No usar `px` > 52px para padding de contenido** — el sistema usa 52px como máximo
9. **El lime (`#c8f55a`) es solo para acciones positivas / CTAs** — no decorativo
10. **Cero emojis coloridos** — prohibido usar emojis que renderizan en color (🎙📄📁💰📊🎨👤🏆📡🌊⚠⛔ etc.). Solo se permiten:
    - Símbolos Unicode mínimos: `→ ← ↑ ↓ ▼ ▲ · — × ✓` (funcionales, sin color)
    - Caracteres geométricos neutros: `◧ ◉ ◦ ○ ●` (navegación/estado)
    - Texto literal como label en lugar de icono cuando sea posible
    - SVG inline si se necesita un icono real
    - **Nunca** emojis de objetos, caras, naturaleza, tecnología, símbolos de alerta coloridos

---

## Checklist al crear una nueva vista

- [ ] Header oscuro (`page-header` con `background: var(--black)`)
- [ ] Eyebrow en mayúsculas con la ruta (e.g. `Portfolio · Startups`)
- [ ] Título con patrón `texto-light <em>texto-bold-italic-lime</em>`
- [ ] Content area con `padding: 36px 52px`
- [ ] Cards con `border: 1.5px solid var(--border); border-radius: 14px`
- [ ] Labels ALL-CAPS en `7–9px / 700 / letter-spacing: 1.5–2px`
- [ ] Botón CTA principal en `btn-lime`
- [ ] P1 banner al tope si hay señales críticas
- [ ] Nav item con active state (`border-left: 2px lime + bg rgba lime`)
- [ ] Transiciones en todos los elementos interactivos
