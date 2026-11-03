const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeField } = require("../../dist/modules/form-intelligence/field-normalizer.service");
const { conceptForField, matchApprovedMemories } = require("../../dist/modules/form-intelligence/field-matcher.service");
const { validateFieldValue } = require("../../dist/modules/form-intelligence/field-type-validator.service");

function field(label, inputType = "text", options = []) {
  return normalizeField({
    id: "00000000-0000-0000-0000-000000000001",
    fieldIdentifier: label.toLowerCase().replace(/\s+/g, "-"),
    label,
    inputType,
    isRequired: true,
    isDisabled: false,
    isReadOnly: false,
    options,
  });
}

test("semantic matching rejects family-name and college/university false positives", () => {
  assert.equal(conceptForField(field("Father's Name")), undefined);
  assert.equal(conceptForField(field("Permanent Address")), "permanent_address");
  assert.equal(conceptForField(field("University Name")), "university");
  assert.equal(conceptForField(field("College Name")), undefined);
});

test("approved-memory matching requires the field and source concepts to agree", () => {
  const university = field("University Name");
  const facts = [
    { id: "memory-1", category: "EDUCATION", key: "university", value: "Example University" },
    { id: "memory-2", category: "EDUCATION", key: "college", value: "Example College" },
  ];
  const matches = matchApprovedMemories(university, facts);
  assert.deepEqual(matches.map((match) => match.sourceReference.memoryId), ["memory-1"]);
});

test("field validation rejects invented or unsafe values", () => {
  assert.equal(validateFieldValue(field("Date of Birth", "date"), "01/02/2000").valid, false);
  assert.equal(validateFieldValue(field("Email", "email"), "not-an-email").valid, false);
  assert.equal(validateFieldValue(field("Password", "password"), "secret").valid, false);
  assert.equal(validateFieldValue(field("Year", "number"), "not-a-number").valid, false);
  assert.equal(validateFieldValue(field("Country", "select", [{ value: "India" }]), "Canada").valid, false);
});

test("choice validation normalizes exact options and rejects ambiguous selections", () => {
  const country = field("Country", "select", [{ value: "India" }, { value: "Indonesia" }]);
  assert.equal(validateFieldValue(country, " india ").value, "India");
  assert.equal(validateFieldValue(country, "Canada").valid, false);
  const group = field("Languages", "checkbox", [{ value: "Hindi" }, { value: "English" }]);
  group.groupName = "languages";
  assert.equal(validateFieldValue(group, ["Hindi", "English"]).valid, true);
  assert.equal(validateFieldValue(group, ["French"]).valid, false);
  assert.equal(validateFieldValue(field("Consent", "checkbox"), false).valid, true);
  assert.equal(validateFieldValue(field("Consent", "checkbox"), []).valid, false);
});
