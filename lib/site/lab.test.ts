import { test } from "node:test";
import assert from "node:assert/strict";

import { LAB, mailto } from "./lab.ts";

/**
 * The lab's identity, in one place.
 *
 * These are shape checks, not content checks: the values are the lab's own words from its current
 * site, and a test that restated them would only be a second copy to keep in sync.
 */

test("the contact email is a single well-formed address", () => {
  assert.match(LAB.email, /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i);
});

test("mailto builds a link to exactly the lab's address", () => {
  assert.equal(mailto(), `mailto:${LAB.email}`);
});

test("the address has building, street and city lines, none blank", () => {
  assert.equal(LAB.address.length, 3);
  for (const line of LAB.address) assert.ok(line.trim().length > 0, "an address line is blank");
});

test("the name, footer name and institution are all present", () => {
  for (const field of [LAB.name, LAB.legalName, LAB.institution]) {
    assert.ok(field.trim().length > 0);
  }
});
