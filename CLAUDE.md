@AGENTS.md
## UI/UX & Aesthetic Guidelines: Pinterest-Style Social Layer

Adhere strictly to these design system principles, tokens, and visual standards for all UI components in the social layer (`src/app/feed/`, `src/app/p/`, `src/app/share/`, and `src/components/social/`). The design language must feel like a modern, visual-first interior design editorial (e.g., *Architectural Digest*, *Are.na*, *Kinfolk*, or *Pinterest*), prioritizing imagery, spatial breathing room, and warm minimalism over dense dashboard widgets.

---

### 1. Color System & Palette Tokens

Never use stark black (`#000000`), stark white (`#FFFFFF`), or default tech colors (indigo, standard blue, neon accents). Use organic, warm-toned neutrals and earthy accent highlights.

* **Background Layering:**
  * App Base: `bg-[#FAF8F5]` (Warm linen / travertine off-white)
  * Card Surfaces: `bg-[#F4F0EA]` or `bg-white/80` with `backdrop-blur-sm`
  * Overlay Panels & Sheets: `bg-[#ECE7DF]/90`
* **Text & Contrast:**
  * Primary Headings & Body: `text-[#1C1A17]` (Deep warm charcoal)
  * Secondary Metadata / Captions: `text-[#706B63]` (Muted stone)
  * Subtle Labels & Borders: `text-[#9E988E]` / `border-[#E5E0D8]`
* **Accent Palette (Used Sparingly):**
  * Primary Accent (Active states, Likes, Primary CTA): `bg-[#B85A3E]` / `text-[#B85A3E]` (Terracotta / Burnt Sienna)
  * Secondary Accent (Tags, Highlights): `bg-[#E8E2D5]` / `text-[#4A453E]` (Warm Clay / Sand)

---

### 2. Typography & Hierarchy

Combine an elegant serif display font with a clean, low-contrast sans-serif for UI elements.

* **Display / Post Titles / Editorial Quotes:**
  * Class: `font-serif text-stone-900 tracking-tight` (Use lightweight Playfair Display, Cormorant, or system serif fonts).
  * Scale: `text-2xl` for card titles, `text-4xl sm:text-5xl font-light` for post detail headers.
* **UI Controls, Badges, & Filter Tabs:**
  * Class: `font-sans text-xs uppercase tracking-[0.15em] font-medium text-[#706B63]`
* **Body & Comments:**
  * Class: `font-sans text-sm text-[#38342FE6] leading-relaxed font-normal`

---

### 3. Layout & Grid Architecture (Masonry First)

Avoid rigid, flat grids. Use a Pinterest-style dynamic multi-column masonry layout where cards flow naturally according to their natural aspect ratios.

* **Grid Container:**
  * Responsive Column Flow: `columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6`
  * Layout Container Padding: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8`
* **Card Ratios:**
  * Support natural architectural aspect ratios: Vertical portrait `aspect-[3/4]`, square `aspect-square`, and wide panoramic `aspect-[16/9]`.
  * Break up feed monotony by varying visual weights between full 3D renders and floor-plan vector maps.

---

### 4. Cards & Visual Containers

* **Border & Shadow Treatments:**
  * Do NOT use standard `shadow-lg` or thick drop-shadows.
  * Use micro-borders: `border border-[#E5E0D8]/80`
  * Ambient Soft Elevation: `shadow-[0_4px_20px_-2px_rgba(28,26,23,0.03)]`
  * Hover Elevation: `hover:shadow-[0_12px_30px_-4px_rgba(28,26,23,0.08)] transition-all duration-300 ease-out`
* **Image Container & Overlay Controls:**
  * Rounded Corners: `rounded-2xl` (Soft, organic curvature across containers).
  * Floating Badges (e.g., Stamp count, Room Type): Position inside the image container using translucent backdrop overlays: `absolute bottom-3 left-3 bg-[#FAF8F5]/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/40 text-xs font-medium text-[#1C1A17] shadow-sm`.

---

### 5. Interactive Elements & Components

* **Filter Tabs (For You / Month / All Time):**
  * Do NOT use tab boxes or filled grey pills.
  * Use a minimalist underlined text bar or warm pill layout:
    ```tsx
    // Active Tab
    "px-4 py-2 rounded-full bg-[#1C1A17] text-[#FAF8F5] text-xs uppercase tracking-widest transition-colors duration-200"
    // Inactive Tab
    "px-4 py-2 rounded-full text-[#706B63] hover:text-[#1C1A17] hover:bg-[#E5E0D8]/50 text-xs uppercase tracking-widest transition-colors duration-200"
    ```
* **"Stamp" (Like) & Action Buttons:**
  * Icon styling: Use `lucide-react` icons with light strokes (`strokeWidth={1.25}`).
  * Animated Stamp Button: Soft tactile rebound effect on interaction (`active:scale-95 hover:scale-105 transition-transform`). Active stamps transition smoothly to `fill-[#B85A3E] text-[#B85A3E]`.
* **Floor Plan SVG Fallbacks:**
  * Ensure SVG vector thumbnails match the warm palette: Room background fill `#F4F0EA`, wall paths stroke `#2B2825` (2.5px width), and furniture outlines `#B85A3E` or `#8C867A`.

---

### 6. Animations & Motion Standards

Use `framer-motion` for page state transitions and feed card loading.

* **Staggered Card Load:**
  ```tsx
  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 1, 0.5, 1] } }
  };
  
### 7. Strict Anti-Patterns (Do NOT Generate)

1. **NO Default Tailwind Blue/Indigo/Purple:** Avoid `bg-blue-600`, `bg-indigo-500`, or purple gradient borders.
2. **NO Heavy Dark Shadows:** Avoid `shadow-2xl` or dark opaque drop shadows.
3. **NO Cluttered Meta Bars:** Do not crowd card footers with unnecessary technical IDs, timestamps, or raw database parameters. Keep metadata restricted to author handle, room type badge, and stamp count.
4. **NO Sharp Square Edges:** Avoid `rounded-none` or harsh `rounded-sm` corners on feed visual cards unless explicitly rendering a blueprint frame.