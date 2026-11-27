#!/usr/bin/env node
// Prerender the home page for crawlers that don't run JavaScript.
//
// Usage: node .github/scripts/prerender.mjs <site-folder>
//
// Runs the page's own render() (the "site renderer" script in index.html) against the
// embedded #site-content JSON in a DOM without executing any page scripts, then writes the
// filled-in HTML back to <site-folder>/index.html. In the browser, render() runs again on
// load and overwrites every container with the same content, so visitors see no change.
// The cinematic engine (intro, reveals, count-ups) is not run here; it runs in the browser.
//
// This only touches the deployed copy. The source index.html in the repo stays as the
// /admin/ editor expects it (SEO markers + site-content JSON).
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const dir = process.argv[2];
if (!dir) { console.error("usage: prerender.mjs <site-folder>"); process.exit(2); }
const file = path.join(dir, "index.html");
const html = fs.readFileSync(file, "utf8");

const dom = new JSDOM(html, { url: "https://anavilhete.com/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
// render() doesn't need these, but the renderer's top-level constants read matchMedia.
window.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });

const scripts = [...window.document.querySelectorAll("script:not([type]), script[type='text/javascript']")];
const renderer = scripts.find(s => s.textContent.includes("site renderer"));
if (!renderer) throw new Error("renderer script not found in index.html");
const src = renderer.textContent;
const cut = src.indexOf("/* ---------------- boot");
if (cut < 0) throw new Error("boot marker not found in renderer script");

// Definitions only (helpers, render, initUI, initEngine), then a single render() pass.
window.eval(src.slice(0, cut) + `
;render(JSON.parse(document.getElementById("site-content").textContent));`);

const doc = window.document;
// The editor-preview pill must stay empty and hidden in the published page.
const pill = doc.getElementById("pvPill");
if (pill) { pill.textContent = ""; pill.hidden = true; }

const out = dom.serialize();
// Sanity checks: the embedded content and the editor markers survive unchanged.
const grab = (s, re) => (s.match(re) || [])[1];
const reData = /<script type="application\/json" id="site-content">([\s\S]*?)<\/script>/;
if (grab(out, reData) !== grab(html, reData)) throw new Error("site-content JSON changed during prerender");
if (!out.includes("<!--SEO:START-->") || !out.includes("<!--SEO:END-->")) throw new Error("SEO markers lost");

fs.writeFileSync(file, out);
const text = doc.body.textContent.replace(/\s+/g, " ").trim();
console.log(`prerendered ${file}: ${text.split(" ").length} words of text in the static HTML`);
