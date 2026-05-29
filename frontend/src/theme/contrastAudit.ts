// frontend/src/theme/contrastAudit.ts
/**
 * WCAG contrast audit utility.
 *
 * Computes relative luminance and contrast ratio per WCAG 2.1 §1.4.3 / §1.4.6,
 * then reports pass/fail for each CSS variable pair defined by a theme.
 */

import type { AppTheme, ThemeKey } from './themes';
import { ALL_THEMES } from './themes';

// ==================== types ====================

export interface ContrastEntry {
    foregroundVar: string;
    foregroundHex: string;
    backgroundVar: string;
    backgroundHex: string;
    ratio: number;
    aaNormal: boolean;   // ≥ 4.5:1
    aaLarge: boolean;    // ≥ 3:1
    aaaNormal: boolean;  // ≥ 7:1
    aaaLarge: boolean;   // ≥ 4.5:1
    uiComponent: boolean; // ≥ 3:1
}

export interface ContrastReport {
    themeKey: ThemeKey;
    themeName: string;
    entries: ContrastEntry[];
    aaNormalPass: number;
    aaNormalFail: number;
    aaaNormalPass: number;
    aaaNormalFail: number;
    uiComponentPass: number;
    uiComponentFail: number;
}

// ==================== WCAG math ====================

/** Linearize a single sRGB channel (0-255) */
function linearize(channel8: number): number {
    const s = channel8 / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance from hex string */
export function relativeLuminance(hex: string): number {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two hex colors */
export function contrastRatio(fg: string, bg: string): number {
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

// ==================== audit ====================

/** Key variable pairs to audit for text contrast */
const TEXT_PAIRS: [string, string, string][] = [
    ['--app-text-primary', '--app-bg', 'Primary text on page bg'],
    ['--app-text-primary', '--app-card-bg', 'Primary text on card bg'],
    ['--app-text-secondary', '--app-bg', 'Secondary text on page bg'],
    ['--app-text-secondary', '--app-card-bg', 'Secondary text on card bg'],
    ['--app-text-tertiary', '--app-bg', 'Tertiary text on page bg'],
    ['--app-text-tertiary', '--app-card-bg', 'Tertiary text on card bg'],
    ['--app-brand-color', '--app-header-bg', 'Brand color on header bg'],
];

/** Key variable pairs to audit for UI component contrast (≥3:1) */
const UI_PAIRS: [string, string, string][] = [
    ['--app-card-border', '--app-card-bg', 'Card border on card bg'],
    ['--app-divider-color', '--app-bg', 'Divider on page bg'],
    ['--app-card-bg-hover', '--app-card-bg', 'Card hover on card bg'],
];

/** Accent variable pairs to audit */
const ACCENT_PAIRS: [string, string, string][] = [
    ['--color-accent-blue', '--color-accent-blue-bg', 'Blue accent text on bg'],
    ['--color-accent-green', '--color-accent-green-bg', 'Green accent text on bg'],
    ['--color-accent-amber', '--color-accent-amber-bg', 'Amber accent text on bg'],
    ['--color-accent-purple', '--color-accent-purple-bg', 'Purple accent text on bg'],
    ['--color-accent-orange', '--color-accent-orange-bg', 'Orange accent text on bg'],
    ['--color-accent-cyan', '--color-accent-cyan-bg', 'Cyan accent text on bg'],
    ['--color-accent-rose', '--color-accent-rose-bg', 'Rose accent text on bg'],
    ['--color-danger', '--color-danger-bg', 'Danger text on bg'],
];

/** Audit a single theme and return a report */
export function auditThemeContrast(theme: AppTheme): ContrastReport {
    const vars = theme.cssVariables;
    const entries: ContrastEntry[] = [];

    const addEntry = (fgVar: string, bgVar: string, label: string, isUI: boolean) => {
        const fgHex = vars[fgVar];
        const bgHex = vars[bgVar];
        if (!fgHex || !bgHex) return; // skip if variable doesn't exist

        const ratio = contrastRatio(fgHex, bgHex);
        entries.push({
            foregroundVar: fgVar,
            foregroundHex: fgHex,
            backgroundVar: bgVar,
            backgroundHex: bgHex,
            ratio: Math.round(ratio * 100) / 100,
            aaNormal: ratio >= 4.5,
            aaLarge: ratio >= 3,
            aaaNormal: ratio >= 7,
            aaaLarge: ratio >= 4.5,
            uiComponent: ratio >= 3,
        });
    };

    for (const [fg, bg, label] of TEXT_PAIRS) addEntry(fg, bg, label, false);
    for (const [fg, bg, label] of UI_PAIRS) addEntry(fg, bg, label, true);
    for (const [fg, bg, label] of ACCENT_PAIRS) addEntry(fg, bg, label, false);

    const aaNormalPass = entries.filter(e => e.aaNormal).length;
    const aaNormalFail = entries.filter(e => !e.aaNormal).length;
    const aaaNormalPass = entries.filter(e => e.aaaNormal).length;
    const aaaNormalFail = entries.filter(e => !e.aaaNormal).length;
    const uiComponentPass = entries.filter(e => e.uiComponent).length;
    const uiComponentFail = entries.filter(e => !e.uiComponent).length;

    return {
        themeKey: theme.key,
        themeName: theme.name,
        entries,
        aaNormalPass,
        aaNormalFail,
        aaaNormalPass,
        aaaNormalFail,
        uiComponentPass,
        uiComponentFail,
    };
}

/** Audit all themes and return reports */
export function auditAllThemes(): Record<ThemeKey, ContrastReport> {
    const reports: Record<string, ContrastReport> = {};
    for (const t of ALL_THEMES) {
        reports[t.key] = auditThemeContrast(t);
    }
    return reports as Record<ThemeKey, ContrastReport>;
}

/** Pretty-print all audit results to console */
export function printAuditReport(): void {
    const reports = auditAllThemes();
    for (const [key, report] of Object.entries(reports)) {
        console.group(
            `%c${report.themeName} (${key})%c — AA: ${report.aaNormalFail === 0 ? '✅' : '❌'} UI: ${report.uiComponentFail === 0 ? '✅' : '❌'}`,
            'font-weight:bold',
            '',
        );
        for (const e of report.entries) {
            const pass = e.aaNormal || e.uiComponent;
            console.log(
                `%c${pass ? '✅' : '❌'} %c${e.ratio.toFixed(1)}:1 %c${e.foregroundVar} (${e.foregroundHex}) on ${e.backgroundVar} (${e.backgroundHex})`,
                '',
                `font-weight:bold;color:${pass ? 'green' : 'red'}`,
                '',
            );
        }
        console.groupEnd();
    }
}
