const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  isFieldTypeCompatible,
  isSensitiveField,
} = require("../../dist/modules/form-intelligence/field-type-validator.service");

const {
  conceptForField,
  conceptForText,
} = require("../../dist/modules/form-intelligence/field-matcher.service");

const {
  routeFormAction,
  matchFieldByTarget,
} = require("../../dist/modules/form-intelligence/form-action-router");

describe("Phase 10 — Field-Type Compatibility & Safe Autofill", () => {
  describe("1. Centralized Field Compatibility Policy (isFieldTypeCompatible)", () => {
    it("strictly rejects FILE inputs for any string value", () => {
      const field = { id: "f1", inputType: "file", label: "Attach files" };
      const res = isFieldTypeCompatible(field, "Adarsh Jha");
      assert.equal(res.compatible, false);
      assert.equal(res.errorCode, "INCOMPATIBLE_FIELD_TYPE");
    });

    it("strictly rejects FILE inputs even if inputType is uppercase FILE", () => {
      const field = { id: "f1", inputType: "FILE", label: "Upload Document" };
      const res = isFieldTypeCompatible(field, "test.pdf");
      assert.equal(res.compatible, false);
      assert.equal(res.errorCode, "INCOMPATIBLE_FIELD_TYPE");
    });

    it("accepts valid text value for TEXT input", () => {
      const field = { id: "f2", inputType: "text", label: "Customer name" };
      const res = isFieldTypeCompatible(field, "Adarsh Jha");
      assert.equal(res.compatible, true);
    });

    it("validates EMAIL input formats", () => {
      const field = { id: "f3", inputType: "email", label: "Email address" };
      assert.equal(isFieldTypeCompatible(field, "valid@test.com").compatible, true);
      assert.equal(isFieldTypeCompatible(field, "not-an-email").compatible, false);
      assert.equal(isFieldTypeCompatible(field, "not-an-email").errorCode, "INVALID_VALUE");
    });

    it("validates TEL input formats", () => {
      const field = { id: "f4", inputType: "tel", label: "Phone" };
      assert.equal(isFieldTypeCompatible(field, "9876543210").compatible, true);
      assert.equal(isFieldTypeCompatible(field, "invalid-letters").compatible, false);
    });

    it("validates CHECKBOX inputs accept boolean or check/uncheck", () => {
      const field = { id: "f5", inputType: "checkbox", label: "Subscribe" };
      assert.equal(isFieldTypeCompatible(field, true, "CHECK").compatible, true);
      assert.equal(isFieldTypeCompatible(field, false, "UNCHECK").compatible, true);
      assert.equal(isFieldTypeCompatible(field, "arbitrary-long-text", "SET_VALUE").compatible, false);
    });

    it("validates SELECT inputs reject options not present in declared options", () => {
      const field = {
        id: "f6",
        inputType: "select",
        label: "Size",
        options: [{ value: "small" }, { value: "medium" }, { value: "large" }],
      };
      assert.equal(isFieldTypeCompatible(field, "medium", "SELECT_OPTION").compatible, true);
      assert.equal(isFieldTypeCompatible(field, "extra-large", "SELECT_OPTION").compatible, false);
    });
  });

  describe("2. Field Matcher Disambiguation (Person Name vs Non-Person Entity)", () => {
    it("never matches FILE input to profile full_name concept", () => {
      const fileField = {
        id: "f_file",
        fieldIdentifier: "_r_km_",
        label: "Attach files",
        searchableText: "Attach files _r_km_",
        inputType: "file",
        options: [],
        required: false,
        disabled: false,
        readOnly: false,
      };
      const concept = conceptForField(fileField);
      assert.notEqual(concept, "full_name");
      assert.notEqual(concept, "first_name");
      assert.notEqual(concept, "last_name");
    });

    it("never matches University Name to full_name concept", () => {
      const uniField = {
        id: "f_uni",
        fieldIdentifier: "university_name",
        label: "University Name",
        searchableText: "University Name university_name",
        inputType: "text",
        options: [],
        required: false,
        disabled: false,
        readOnly: false,
      };
      const concept = conceptForField(uniField);
      assert.notEqual(concept, "full_name");
      assert.notEqual(concept, "first_name");
    });

    it("never matches Company Name to full_name concept", () => {
      const compField = {
        id: "f_comp",
        fieldIdentifier: "company_name",
        label: "Company Name",
        searchableText: "Company Name company_name",
        inputType: "text",
        options: [],
        required: false,
        disabled: false,
        readOnly: false,
      };
      const concept = conceptForField(compField);
      assert.notEqual(concept, "full_name");
    });

    it("correctly matches Customer name to full_name concept", () => {
      const nameField = {
        id: "f_cust",
        fieldIdentifier: "custname",
        label: "Customer name:",
        searchableText: "Customer name: custname",
        inputType: "text",
        options: [],
        required: false,
        disabled: false,
        readOnly: false,
      };
      const concept = conceptForField(nameField);
      assert.equal(concept, "full_name");
    });
  });

  describe("3. Form Action Router Target Matching & File Exclusion", () => {
    it("scores 0 for FILE inputs when target requests customer name", () => {
      const fileField = {
        id: "f_file",
        fieldIdentifier: "_r_km_",
        label: "Attach files",
        inputType: "file",
      };
      const score = matchFieldByTarget("Customer name", fileField, "Adarsh Jha");
      assert.equal(score, 0);
    });

    it("scores 0 for University Name when target requests person customer name", () => {
      const uniField = {
        id: "f_uni",
        fieldIdentifier: "university_name",
        label: "University Name",
        inputType: "text",
      };
      const score = matchFieldByTarget("Customer name", uniField, "Adarsh Jha");
      assert.equal(score, 0);
    });

    it("scores >= 0.8 for Customer name input when target requests customer name", () => {
      const nameField = {
        id: "f_name",
        fieldIdentifier: "custname",
        label: "Customer name:",
        inputType: "text",
      };
      const score = matchFieldByTarget("Customer name", nameField, "Adarsh Jha");
      assert.ok(score >= 0.8, `Score ${score} should be >= 0.8`);
    });

    it("never selects Attach files field when given 'Add Adarsh Jha as customer name'", () => {
      const fields = [
        { id: "f1", fieldIdentifier: "_r_km_", label: "Attach files", inputType: "FILE" },
        { id: "f2", fieldIdentifier: "custname", label: "Customer name:", inputType: "TEXT" },
        { id: "f3", fieldIdentifier: "telephone", label: "Telephone:", inputType: "TEL" },
      ];

      const res = routeFormAction({
        content: "Add Adarsh Jha as customer name.",
        detectedFields: fields,
        detectedLang: "en",
        conversationId: "c_test",
        requestId: "r_test",
      });

      assert.equal(res.type, "FORM_UPDATE");
      assert.equal(res.status, "RESOLVED");
      assert.equal(res.field.fieldIdentifier, "custname");
      assert.equal(res.value, "Adarsh Jha");
      assert.notEqual(res.field.fieldIdentifier, "_r_km_");
    });

    it("provides polite safety guidance when user asks to attach/upload file", () => {
      const fields = [
        { id: "f1", fieldIdentifier: "_r_km_", label: "Attach files", inputType: "FILE" },
        { id: "f2", fieldIdentifier: "custname", label: "Customer name:", inputType: "TEXT" },
      ];

      const res = routeFormAction({
        content: "Attach file for my resume",
        detectedFields: fields,
        detectedLang: "en",
        conversationId: "c_test",
        requestId: "r_test",
      });

      assert.equal(res.type, "CONVERSATIONAL_RESPONSE");
      assert.equal(res.intent, "INFORM_FILE_SECURITY");
      assert.match(res.response, /security|privacy|browser/i);
    });
  });
});
