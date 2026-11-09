import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * The app icons, checked for the ways they break without telling you.
 *
 * These exist because of a real failure during authoring: `app/icon.svg` was written with the
 * text "--lab-forest" inside an XML comment. XML forbids a double hyphen there, so the whole
 * file failed to parse — and nothing anywhere reported it. Next.js still emitted the `<link>`
 * tag, the request still returned 200 with the bytes, and the browser simply rendered no icon.
 * It surfaced only by loading the file in a real browser and noticing zero images had decoded.
 *
 * Node has no XML parser in its standard library, so this does not attempt full validation. It
 * checks the specific traps that are both silent and cheap to detect.
 */

const APP = path.join(process.cwd(), "app");
const ICON = path.join(APP, "icon.svg");

test("the SVG icon exists and is an SVG", () => {
  assert.ok(fs.existsSync(ICON), "app/icon.svg is missing");
  const source = fs.readFileSync(ICON, "utf8");
  assert.match(source, /<svg[\s>]/, "app/icon.svg does not contain an <svg> element");
  assert.match(source, /viewBox="[^"]+"/, "app/icon.svg has no viewBox, so it cannot scale");
});

test("no XML comment in the SVG contains a double hyphen", () => {
  // The exact bug. `--` is not permitted inside an XML comment, and the whole document fails to
  // parse when it appears — which presents as a missing favicon rather than as an error.
  const source = fs.readFileSync(ICON, "utf8");
  for (const [, body] of source.matchAll(/<!--([\s\S]*?)-->/g)) {
    assert.ok(
      !body.includes("--"),
      `app/icon.svg has "--" inside a comment, which makes the file unparseable:\n  ...${
        body.slice(Math.max(0, body.indexOf("--") - 40), body.indexOf("--") + 40).trim()
      }...`,
    );
  }
});

test("the SVG icon draws something, and in a fixed colour", () => {
  // `currentColor` is right for the inline nav logo, which inherits the page's text colour, and
  // wrong here: a favicon is rendered by browser chrome with no colour to inherit, so it would
  // fall back to black on a black tab bar. This asserts the icon commits to its own colours.
  const source = fs.readFileSync(ICON, "utf8");
  // 40, not 100. The point is only that the icon draws real geometry rather than an empty or
  // truncated path; 100 happened to be one character below the authored Z's 101, so any tweak to
  // a coordinate would have failed a test that was never about length.
  assert.match(source, /<path[^>]*\sd="[^"]{40,}"/, "app/icon.svg has no substantial path");
  assert.ok(
    !/currentColor/.test(source),
    "app/icon.svg uses currentColor, which browser chrome cannot resolve",
  );
  assert.match(source, /fill="#[0-9a-fA-F]{3,8}"/, "app/icon.svg has no explicit fill");
});

test("the Apple touch icon is a PNG with no transparency", () => {
  // iOS composites this onto a home screen and does not honour alpha; a transparent corner comes
  // out black. The rounded corners are applied by the OS, so the artwork wants a full square.
  const file = path.join(APP, "apple-icon.png");
  assert.ok(fs.existsSync(file), "app/apple-icon.png is missing");

  const bytes = fs.readFileSync(file);
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "app/apple-icon.png is not a PNG",
  );

  // IHDR is always the first chunk: 8-byte signature, 4-byte length, 4-byte type, then width,
  // height, bit depth, and colour type. Type 6 is RGBA and 4 is grey+alpha — both carry an
  // alpha channel.
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colourType = bytes[25];
  assert.equal(width, 180, `apple-icon is ${width}px wide; iOS expects 180`);
  assert.equal(height, 180, `apple-icon is ${height}px tall; iOS expects 180`);
  assert.ok(
    colourType !== 6 && colourType !== 4,
    `apple-icon has an alpha channel (PNG colour type ${colourType})`,
  );
});

test("the logo component is one inline path, recoloured by CSS", () => {
  // The counterpart to the icon rule above. This one is inlined into the nav precisely so it can
  // inherit `color`, which is what lets a single file serve the mint header and the dark footer.
  // A hardcoded fill here would silently need a second file the moment it appeared on both.
  const source = fs.readFileSync(path.join(process.cwd(), "components", "site", "logo.tsx"), "utf8");
  assert.match(source, /fill="currentColor"/, "the logo does not use currentColor");
  assert.match(source, /\sd="[^"]{100,}"/, "the logo has no substantial path");
  assert.match(source, /aria-hidden="true"/, "the logo is not hidden from assistive tech");
});
