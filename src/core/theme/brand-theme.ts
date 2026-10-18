/**
 * "Wellness & Enterprise" palette tokens — mirrors
 * lib/core/constants/brand_theme.dart (deep teal / sage mint,
 * light + dark pairs). Used for inline styling in React; layout
 * classes use the Tailwind theme tokens defined in index.css.
 */
export const BrandTheme = {
  // Light
  lightBackground: '#f4f7f6',
  lightPanel: '#ffffff',
  lightSidebar: '#fbfdfc',
  lightBorder: '#dbe4e1',
  lightTextPrimary: '#15252b',
  lightTextSecondary: '#5b6f75',
  lightAccent: '#0f766e',
  lightSuccess: '#5f9e8f',
  lightError: '#c2554f',
  lightHover: '#e9f1ef',
  lightWarn: '#d9a441',

  // Dark
  darkBackground: '#0a1e25',
  darkPanel: '#0f2a33',
  darkSidebar: '#0c232c',
  darkBorder: '#1d3a45',
  darkTextPrimary: '#e6f0ee',
  darkTextSecondary: '#93a9ad',
  darkAccent: '#2dd4bf',
  darkSuccess: '#6fc2ae',
  darkError: '#f08c86',
  darkHover: '#14333e',
  darkWarn: '#e0b45c',

  // Radius / density ("corporate compact")
  radiusSm: 4,
  radiusMd: 8,
  fontBase: 12,
  fontTitle: 14,
  fontHeading: 16,
} as const;

export function brandTokens(isDark: boolean) {
  return isDark
    ? {
        background: BrandTheme.darkBackground,
        panel: BrandTheme.darkPanel,
        sidebar: BrandTheme.darkSidebar,
        border: BrandTheme.darkBorder,
        textPrimary: BrandTheme.darkTextPrimary,
        textSecondary: BrandTheme.darkTextSecondary,
        accent: BrandTheme.darkAccent,
        success: BrandTheme.darkSuccess,
        error: BrandTheme.darkError,
        hover: BrandTheme.darkHover,
      }
    : {
        background: BrandTheme.lightBackground,
        panel: BrandTheme.lightPanel,
        sidebar: BrandTheme.lightSidebar,
        border: BrandTheme.lightBorder,
        textPrimary: BrandTheme.lightTextPrimary,
        textSecondary: BrandTheme.lightTextSecondary,
        accent: BrandTheme.lightAccent,
        success: BrandTheme.lightSuccess,
        error: BrandTheme.lightError,
        hover: BrandTheme.lightHover,
      };
}
