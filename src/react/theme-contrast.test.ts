import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const libraryCss = readFileSync(resolve("src/react/styles.css"), "utf8");
const exampleCss = readFileSync(resolve("examples/theme.css"), "utf8");

function declarations(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1];
  if (!block) throw new Error(`Missing CSS block for ${selector}`);
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

function resolveColor(theme: Record<string, string>, name: string): string {
  const value = theme[name];
  if (!value) throw new Error(`Missing theme color ${name}`);
  const reference = value.match(/^var\((--[\w-]+)\)$/)?.[1];
  return reference ? resolveColor(theme, reference) : value;
}

function luminance(hex: string): number {
  const channels = hex.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)?.slice(1).map((value) => Number.parseInt(value, 16) / 255);
  if (!channels) throw new Error(`Expected a six-digit hex color, received ${hex}`);
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrast(theme: Record<string, string>, foreground: string, background: string): number {
  const values = [luminance(resolveColor(theme, foreground)), luminance(resolveColor(theme, background))].sort((left, right) => right - left);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

function expectTextContrast(theme: Record<string, string>) {
  expect(contrast(theme, "--mck-color-accent", "--mck-color-surface")).toBeGreaterThanOrEqual(4.5);
  expect(contrast(theme, "--mck-color-on-accent", "--mck-color-accent-solid")).toBeGreaterThanOrEqual(4.5);
  expect(contrast(theme, "--mck-color-muted", "--mck-color-surface")).toBeGreaterThanOrEqual(4.5);
  expect(contrast(theme, "--mck-color-muted", "--mck-color-soft")).toBeGreaterThanOrEqual(4.5);
}

describe("theme contrast", () => {
  const defaults = declarations(libraryCss, ":root");

  it("meets WCAG AA text contrast in the default theme", () => {
    expectTextContrast(defaults);
  });

  it("meets WCAG AA text contrast in both example themes", () => {
    const exampleLight = { ...defaults, ...declarations(exampleCss, ":root") };
    const exampleDark = { ...exampleLight, ...declarations(exampleCss, 'body[data-mck-theme="dark"]') };
    expectTextContrast(exampleLight);
    expectTextContrast(exampleDark);
  });

  it("uses the solid accent token for primary button backgrounds", () => {
    expect(libraryCss).toContain("background: var(--mck-color-accent-solid)");
  });
});
