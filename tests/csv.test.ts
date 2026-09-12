import test from "node:test";
import assert from "node:assert/strict";
import { escapeCsvCell } from "../lib/csv";
test("formula neutralization keeps commas, quotes and line breaks inside one CSV cell", () => {
  assert.equal(escapeCsvCell("plain"), "plain");
  assert.equal(escapeCsvCell("=SUM(1,2)"), '"\'=SUM(1,2)"');
  assert.equal(escapeCsvCell("=safe,=1+1"), '"\'=safe,=1+1"');
  assert.equal(escapeCsvCell("-first\nsecond"), '"\'-first\nsecond"');
  assert.equal(escapeCsvCell('@"quoted"\rnext'), '"\'@""quoted""\rnext"');
  assert.equal(escapeCsvCell("\t=1+1"), "'\t=1+1");
});
