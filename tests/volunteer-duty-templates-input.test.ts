import test from "node:test";
import assert from "node:assert/strict";
import { dutyTemplateFields } from "../lib/platform/volunteer-duty-template-input";
import { PortalError } from "../lib/platform/portal-policy";
const fields = {
  title: "Welcome team",
  duties: "Welcome visitors.",
  requirements: "",
  commitment: ""
};
const denied = (value: unknown) =>
  assert.throws(
    () => dutyTemplateFields(value),
    (error) => error instanceof PortalError && error.status === 400
  );

test("four text fields normalize textarea newlines and preserve literal text", () => {
  assert.deepEqual(
    dutyTemplateFields({
      title: "  Welcome team  ",
      duties: " First line\r\nSecond\tline ",
      requirements: " <literal text> ",
      commitment: " \r\n "
    }),
    {
      title: "Welcome team",
      duties: "First line\nSecond\tline",
      requirements: "<literal text>",
      commitment: ""
    }
  );
  assert.deepEqual(dutyTemplateFields(fields), fields);
});
test("field limits are exact UTF-16 bounds with no silent truncation", () => {
  for (const [key, max] of [
    ["title", 100],
    ["duties", 2000],
    ["requirements", 1000],
    ["commitment", 300]
  ] as const) {
    assert.equal(
      dutyTemplateFields({ ...fields, [key]: "x".repeat(max) })[key].length,
      max
    );
    denied({ ...fields, [key]: "x".repeat(max + 1) });
    assert.equal(
      dutyTemplateFields({ ...fields, [key]: "😀".repeat(max / 2) })[key]
        .length,
      max
    );
    denied({ ...fields, [key]: "😀".repeat(max / 2) + "x" });
  }
  denied({ ...fields, title: "x" });
  denied({ ...fields, duties: "xx" });
  assert.equal(
    dutyTemplateFields({ ...fields, title: "xx", duties: "xxx" }).title,
    "xx"
  );
});
test("malformed strings and non-text values cannot enter duty templates", () => {
  for (const key of Object.keys(fields))
    for (const value of [
      null,
      1,
      true,
      [],
      {},
      "bad\u0000text",
      "bad\u0008text",
      "bad\u001btext",
      "bad\u007ftext",
      "bad\ud800text",
      "bad\udc00text"
    ])
      denied({ ...fields, [key]: value });
});
test("the reusable contract accepts only its four named fields", () => {
  for (const value of [null, [], "text", 7]) denied(value);
  for (const key of [
    "id",
    "churchId",
    "capacity",
    "contact",
    "independentTime",
    "shiftStartLocal",
    "coordinatorId",
    "screening",
    "unknown"
  ])
    denied({ ...fields, [key]: "injected" });
  for (const key of Object.keys(fields)) {
    const missing: Record<string, unknown> = { ...fields };
    delete missing[key];
    denied(missing);
  }
});
