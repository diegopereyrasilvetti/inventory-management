import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveTheme } from "./theme.js";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

function block(selector) {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, "missing block " + selector);
  return css.slice(start, css.indexOf("}", start));
}

function tokens(selector) {
  return Object.fromEntries([...block(selector).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = tokens(":root {");
const dark = { ...light, ...tokens(':root[data-theme="dark"]') };

// [foreground, background] pairs actually used by the interface (WCAG AA, normal text = 4.5)
const PAIRS = [
  ["texto", "fondo"], ["texto", "superficie"], ["texto-suave", "fondo"], ["texto-suave", "superficie"],
  ["acento-hover", "fondo"], ["acento-hover", "superficie"], ["acento", "fondo"], ["acento", "superficie"],
  ["stock-ok", "superficie"], ["stock-bajo", "superficie"], ["stock-agotado", "superficie"], ["stock-agotado", "fondo"],
  ["pie-texto", "pie"],
  ["viz-verde-texto", "viz-verde-fondo"], ["viz-naranja-texto", "viz-naranja-fondo"], ["viz-gris-texto", "viz-gris-fondo"],
];
const WHITE_ON = ["boton", "boton-hover", "alerta-fondo"];

test("dark theme overrides every themed token that light defines", () => {
  const overridden = tokens(':root[data-theme="dark"]');
  for (const key of Object.keys(light)) {
    assert.ok(key in overridden, "dark theme does not override --" + key);
  }
});

test("dark theme text pairs meet WCAG AA", () => {
  for (const [fg, bg] of PAIRS) {
    const ratio = contrast(dark[fg], dark[bg]);
    assert.ok(ratio >= 4.5, `--${fg} on --${bg} is ${ratio.toFixed(2)}`);
  }
  for (const bg of WHITE_ON) {
    const ratio = contrast("#ffffff", dark[bg]);
    assert.ok(ratio >= 4.5, `white on --${bg} is ${ratio.toFixed(2)}`);
  }
});

test("new button and alert tokens meet AA in the light theme", () => {
  for (const bg of WHITE_ON) {
    const ratio = contrast("#ffffff", light[bg]);
    assert.ok(ratio >= 4.5, `white on --${bg} is ${ratio.toFixed(2)}`);
  }
});

test("resolveTheme prefers the stored choice over the system", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme(null, true), "dark");
  assert.equal(resolveTheme(null, false), "light");
  assert.equal(resolveTheme("other", true), "dark");
});
