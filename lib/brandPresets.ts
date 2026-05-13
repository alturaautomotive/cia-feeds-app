/**
 * Brand color presets for dealer storefronts.
 *
 * Each preset is a small, opinionated theme keyed by an OEM (or our default
 * neutral). Storefront pages render with these via CSS custom properties
 * — see app/[slug]/layout.tsx.
 *
 * Color references are from each OEM's published brand guidelines as of 2024.
 * Lightness levels chosen for readability against both light and dark
 * neutrals: every preset passes WCAG AA contrast at the default body text
 * size against both #FFFFFF and #0A0A0A backgrounds where used.
 *
 * Adding a new preset:
 *   1. Append to BRAND_PRESETS below with the OEM's brand color.
 *   2. Optionally tweak `accent` (call-to-action contrast), `surface`
 *      (card/section background), or `radius`.
 *   3. The dashboard preset picker automatically lists every key.
 *
 * Use `getBrandPreset(key, overrides)` to resolve a preset by key with
 * optional JSON overrides applied on top.
 */

export interface BrandPreset {
  /** Display label in the dashboard picker. */
  label: string;
  /** Primary brand color (CTA backgrounds, accents). HEX. */
  primary: string;
  /** Foreground color used on top of `primary` (button text). */
  primaryForeground: string;
  /** Page background. */
  background: string;
  /** Default body text color on `background`. */
  foreground: string;
  /** Card / section backgrounds. */
  surface: string;
  /** Text color on top of `surface`. */
  surfaceForeground: string;
  /** Subtle accent for hover states, dividers, secondary buttons. */
  accent: string;
  /** Border color. */
  border: string;
  /** Corner radius for buttons + cards. CSS length (e.g. "6px", "12px"). */
  radius: string;
  /**
   * Optional Google Font family. If set, storefronts will load it via
   * `next/font/google`. Default falls back to the storefront layout's
   * system stack.
   */
  fontFamily?: string;
}

export const BRAND_PRESETS = {
  // Default — what every dealer gets until they pick one.
  neutral: {
    label: "Neutral (Default)",
    primary: "#0A0A0A",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#0A0A0A",
    surface: "#F5F5F5",
    surfaceForeground: "#0A0A0A",
    accent: "#E5E5E5",
    border: "#E5E5E5",
    radius: "8px",
  },
  // Custom — dashboard renders the full color picker; themeOverrides drives output.
  custom: {
    label: "Custom (use my own colors)",
    primary: "#0A0A0A",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#0A0A0A",
    surface: "#F5F5F5",
    surfaceForeground: "#0A0A0A",
    accent: "#E5E5E5",
    border: "#E5E5E5",
    radius: "8px",
  },

  // ── Automotive OEMs ──────────────────────────────────────────────────────
  toyota: {
    label: "Toyota",
    primary: "#EB0A1E",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F7F7F7",
    surfaceForeground: "#1A1A1A",
    accent: "#FFE5E7",
    border: "#E5E5E5",
    radius: "4px",
  },
  lexus: {
    label: "Lexus",
    primary: "#1A1A1A",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F2F2F2",
    surfaceForeground: "#1A1A1A",
    accent: "#C9B57B",
    border: "#D8D8D8",
    radius: "2px",
  },
  mazda: {
    label: "Mazda",
    primary: "#C8102E",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F8F8F8",
    surfaceForeground: "#1A1A1A",
    accent: "#FBE4E8",
    border: "#E5E5E5",
    radius: "6px",
  },
  ford: {
    label: "Ford",
    primary: "#003478",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#102B4D",
    surface: "#F1F4FA",
    surfaceForeground: "#102B4D",
    accent: "#D6E1F2",
    border: "#D6E1F2",
    radius: "6px",
  },
  chevrolet: {
    label: "Chevrolet",
    primary: "#CF9C2F",
    primaryForeground: "#0A0A0A",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F8F4EA",
    surfaceForeground: "#1A1A1A",
    accent: "#F4E7CC",
    border: "#E5DCC1",
    radius: "4px",
  },
  gmc: {
    label: "GMC",
    primary: "#CC092F",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F7F7F7",
    surfaceForeground: "#1A1A1A",
    accent: "#FBE4E9",
    border: "#E5E5E5",
    radius: "4px",
  },
  honda: {
    label: "Honda",
    primary: "#CC0000",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F7F7F7",
    surfaceForeground: "#1A1A1A",
    accent: "#FFE4E4",
    border: "#E5E5E5",
    radius: "6px",
  },
  acura: {
    label: "Acura",
    primary: "#E82127",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F7F7F7",
    surfaceForeground: "#1A1A1A",
    accent: "#FCE2E3",
    border: "#E5E5E5",
    radius: "4px",
  },
  nissan: {
    label: "Nissan",
    primary: "#C3002F",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F8F8F8",
    surfaceForeground: "#1A1A1A",
    accent: "#FBE3E8",
    border: "#E5E5E5",
    radius: "4px",
  },
  subaru: {
    label: "Subaru",
    primary: "#0E4090",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#102B4D",
    surface: "#F1F4FA",
    surfaceForeground: "#102B4D",
    accent: "#D8E2F2",
    border: "#D6E1F2",
    radius: "6px",
  },
  hyundai: {
    label: "Hyundai",
    primary: "#002C5F",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#102B4D",
    surface: "#F1F4FA",
    surfaceForeground: "#102B4D",
    accent: "#D6E1F2",
    border: "#D6E1F2",
    radius: "8px",
  },
  kia: {
    label: "Kia",
    primary: "#BB162B",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F8F8F8",
    surfaceForeground: "#1A1A1A",
    accent: "#FBE3E6",
    border: "#E5E5E5",
    radius: "8px",
  },
  jeep: {
    label: "Jeep",
    primary: "#3D4F26",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F4F5F0",
    surfaceForeground: "#1A1A1A",
    accent: "#E0E5D3",
    border: "#D6DAC8",
    radius: "4px",
  },
  ram: {
    label: "RAM",
    primary: "#D70000",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F7F7F7",
    surfaceForeground: "#1A1A1A",
    accent: "#FFD6D6",
    border: "#E5E5E5",
    radius: "2px",
  },
  dodge: {
    label: "Dodge",
    primary: "#D81E05",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F7F7F7",
    surfaceForeground: "#1A1A1A",
    accent: "#FBD9D6",
    border: "#E5E5E5",
    radius: "2px",
  },
  bmw: {
    label: "BMW",
    primary: "#0066B1",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F1F6FB",
    surfaceForeground: "#1A1A1A",
    accent: "#D9E8F5",
    border: "#D9E8F5",
    radius: "0px",
  },
  mercedes: {
    label: "Mercedes-Benz",
    primary: "#1B1B1B",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1B1B1B",
    surface: "#F4F4F4",
    surfaceForeground: "#1B1B1B",
    accent: "#D8D8D8",
    border: "#D8D8D8",
    radius: "0px",
  },
  audi: {
    label: "Audi",
    primary: "#BB0A30",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F7F7F7",
    surfaceForeground: "#1A1A1A",
    accent: "#FBE0E6",
    border: "#E5E5E5",
    radius: "2px",
  },
  volkswagen: {
    label: "Volkswagen",
    primary: "#001E50",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#001E50",
    surface: "#F1F4FA",
    surfaceForeground: "#001E50",
    accent: "#D6DEEC",
    border: "#D6DEEC",
    radius: "999px",
  },
  porsche: {
    label: "Porsche",
    primary: "#D5001C",
    primaryForeground: "#FFFFFF",
    background: "#FFFFFF",
    foreground: "#1A1A1A",
    surface: "#F8F8F8",
    surfaceForeground: "#1A1A1A",
    accent: "#FAD9DE",
    border: "#E5E5E5",
    radius: "2px",
  },
  tesla: {
    label: "Tesla",
    primary: "#CC0000",
    primaryForeground: "#FFFFFF",
    background: "#0A0A0A",
    foreground: "#F5F5F5",
    surface: "#1A1A1A",
    surfaceForeground: "#F5F5F5",
    accent: "#262626",
    border: "#262626",
    radius: "8px",
  },
} satisfies Record<string, BrandPreset>;

export type BrandPresetKey = keyof typeof BRAND_PRESETS;

/**
 * Resolve a preset by key with optional per-dealer overrides applied on top.
 * Falls back to "neutral" if the key is unknown.
 *
 * @param key      themePreset value from the Dealer row (may be null/unknown)
 * @param overrides JSON map of partial preset fields to override
 */
export function getBrandPreset(
  key: string | null | undefined,
  overrides: Partial<BrandPreset> | null | undefined = null
): BrandPreset {
  const base =
    (key && key in BRAND_PRESETS && BRAND_PRESETS[key as BrandPresetKey]) ||
    BRAND_PRESETS.neutral;
  if (!overrides) return base;
  return { ...base, ...sanitizeOverrides(overrides) };
}

/**
 * Discard unknown fields and sanitize color strings before applying overrides.
 * Keeps the type narrow and prevents dealer-supplied JSON from injecting
 * arbitrary CSS via a malformed color value.
 */
function sanitizeOverrides(o: Partial<BrandPreset>): Partial<BrandPreset> {
  const out: Partial<BrandPreset> = {};
  const colorFields: (keyof BrandPreset)[] = [
    "primary",
    "primaryForeground",
    "background",
    "foreground",
    "surface",
    "surfaceForeground",
    "accent",
    "border",
  ];
  for (const f of colorFields) {
    const v = o[f];
    if (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v)) {
      out[f] = v;
    }
  }
  if (typeof o.radius === "string" && /^[0-9]{1,3}(px|rem|%)$/.test(o.radius)) {
    out.radius = o.radius;
  }
  if (typeof o.fontFamily === "string" && /^[\w\s\-]+$/.test(o.fontFamily)) {
    out.fontFamily = o.fontFamily;
  }
  if (typeof o.label === "string" && o.label.length <= 50) {
    out.label = o.label;
  }
  return out;
}

/**
 * Render the preset as a CSS custom-property block (without the wrapping selector).
 * Caller wraps in `:root { ... }` or inlines on an element.
 */
export function brandPresetToCssVars(p: BrandPreset): string {
  return [
    `--brand-primary: ${p.primary}`,
    `--brand-primary-fg: ${p.primaryForeground}`,
    `--brand-bg: ${p.background}`,
    `--brand-fg: ${p.foreground}`,
    `--brand-surface: ${p.surface}`,
    `--brand-surface-fg: ${p.surfaceForeground}`,
    `--brand-accent: ${p.accent}`,
    `--brand-border: ${p.border}`,
    `--brand-radius: ${p.radius}`,
  ].join("; ");
}
