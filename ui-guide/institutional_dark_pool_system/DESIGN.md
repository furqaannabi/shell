---
name: Institutional Dark Pool System
colors:
  surface: '#111318'
  surface-dim: '#111318'
  surface-bright: '#37393e'
  surface-container-lowest: '#0c0e12'
  surface-container-low: '#1a1c20'
  surface-container: '#1e2024'
  surface-container-high: '#282a2e'
  surface-container-highest: '#333539'
  on-surface: '#e2e2e8'
  on-surface-variant: '#bacac5'
  inverse-surface: '#e2e2e8'
  inverse-on-surface: '#2f3035'
  outline: '#859490'
  outline-variant: '#3c4a46'
  surface-tint: '#3cddc7'
  primary: '#57f1db'
  on-primary: '#003731'
  primary-container: '#2dd4bf'
  on-primary-container: '#00574d'
  inverse-primary: '#006b5f'
  secondary: '#bdc2ff'
  on-secondary: '#131e8c'
  secondary-container: '#2f3aa3'
  on-secondary-container: '#a8afff'
  tertiary: '#d8dadc'
  on-tertiary: '#2d3133'
  tertiary-container: '#bcbec0'
  on-tertiary-container: '#4a4d4f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#62fae3'
  primary-fixed-dim: '#3cddc7'
  on-primary-fixed: '#00201c'
  on-primary-fixed-variant: '#005047'
  secondary-fixed: '#e0e0ff'
  secondary-fixed-dim: '#bdc2ff'
  on-secondary-fixed: '#000767'
  on-secondary-fixed-variant: '#2f3aa3'
  tertiary-fixed: '#e0e3e5'
  tertiary-fixed-dim: '#c4c7c9'
  on-tertiary-fixed: '#191c1e'
  on-tertiary-fixed-variant: '#444749'
  background: '#111318'
  on-background: '#e2e2e8'
  surface-variant: '#333539'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  body-base:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  body-sm:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.4'
    letterSpacing: '0'
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.2'
    letterSpacing: '0'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin: 24px
  container-max: 1440px
---

## Brand & Style
This design system is engineered for an institutional on-chain dark pool, prioritizing the perception of absolute security and high-frequency performance. The aesthetic merges **Institutional Minimalism** with **Glassmorphism**, utilizing translucent layers to represent the "sealed" nature of Trusted Execution Environments (TEEs).

The visual narrative centers on "Encapsulated Intelligence"—where sensitive data is protected within visible but impenetrable boundaries. The interface avoids all decorative flourish, opting instead for ultra-thin 1px geometry and high information density to cater to professional traders and sovereign entities. The emotional response should be one of calm, clinical precision and total privacy.

## Colors
The palette is built on a foundation of **Deep Obsidian** (#0A0C10) to provide maximum contrast for critical data. 
- **Shell Teal (#2DD4BF):** Used for cryptographic validation states, successful "sealed" transactions, and primary action paths. It represents the encryption layer.
- **Seal Purple (#818CF8):** Used for TEE (Trusted Execution Environment) interactions, enclave status, and institutional-grade tools.
- **Neutral Grays:** A range from Slate 900 to 400 is used to establish hierarchy in secondary data, such as order history and low-priority metadata.
- **Data Visualization:** High-contrast greens and reds are reserved strictly for fill quality and execution delta, ensuring they pop against the obsidian background.

## Typography
The system employs a dual-font strategy to balance legibility with technical authority. 
- **Geist Sans:** The primary UI typeface, chosen for its Swiss-inspired precision and excellent readability at small sizes in data-dense environments. Use for all navigational elements and primary labels.
- **JetBrains Mono:** Reserved for the "Technical Layer." Any data that is machine-generated or requires verification—such as Transaction Hashes, PCR values, Order IDs, and execution timestamps—must be rendered in Monospace.

**Hierarchy Rules:**
1. Primary data (Price, Size) uses Crisp White (#FFFFFF).
2. Labels and metadata use Muted Slate (#94A3B8).
3. Monospaced data should always be 1-2pts smaller than adjacent sans-serif text to maintain visual balance.

## Layout & Spacing
The system uses a **Fixed-Grid Architecture** based on a 4px baseline shift to ensure mathematical alignment across all institutional tools.
- **Desktop:** 12-column grid with 16px gutters. Sidebars for trade execution and enclave status should remain fixed at 320px, while the central workspace (charts/order books) fluidly adapts.
- **Density:** High-density layouts are preferred. Padding within containers should be tight (8px to 12px) to allow more information to be visible above the fold.
- **Responsive:** On mobile, the 12-column grid collapses to 4 columns. Complex data tables should switch to a horizontal-scroll "list-card" format rather than stack vertically, to preserve the relationship between data points.

## Elevation & Depth
This design system utilizes **Tonal Layering and Glassmorphism** instead of traditional shadows to signify depth.
- **Level 0 (Base):** Deep Obsidian (#0A0C10). The foundation of the application.
- **Level 1 (Sealed Containers):** Translucent Slate (#1A1D23 at 80% opacity) with a 20px Backdrop Blur. These represent secure enclaves where trading activity occurs.
- **Level 2 (Active States):** Subtle glowing borders. Instead of a shadow, an active enclave or focused input field uses a 1px border of "Shell Teal" with a 4px outer bloom (box-shadow: 0 0 8px rgba(45, 212, 191, 0.3)).
- **Dividers:** Use 1px solid lines in #1E293B. Never use heavy shadows, as they contradict the clean, high-performance nature of the platform.

## Shapes
The shape language is "Soft-Industrial." Corners are not sharp (0px) but are kept to a minimal **4px radius (Soft)**. This provides a professional, modern feel without appearing overly consumer-focused or "bubbly."
- **Buttons & Inputs:** 4px radius.
- **Outer Containers:** 8px radius (rounded-lg).
- **Data Tags/Chips:** 2px radius or 0px to emphasize the technical nature.

## Components
- **Buttons:** Primary buttons use a solid "Shell Teal" background with black text. Secondary buttons use a 1px "Seal Purple" ghost border with white text. Hover states should include a subtle 2px glow.
- **Glass Cards:** Used for order entry and "Sealed" data. These must feature a 1px top-highlight (a lighter gray line at the very top edge) to simulate light hitting a glass surface.
- **Technical Lists:** Used for order books. Rows should have no visible borders; instead, use a subtle background highlight (#1A1D23) on hover.
- **Status Enclaves:** Small indicator chips that use a "pulsing" dot. A teal pulse indicates an active, secure TEE connection.
- **Inputs:** Dark backgrounds (#0A0C10) with 1px slate borders. Focus states transition the border to "Seal Purple" and add a monospaced "ENCRYPTED" label in the top-right corner of the field.
- **Data Viz:** Volume bars should be semi-transparent, allowing the background grid to show through, reinforcing the "dark pool" transparency-within-privacy metaphor.