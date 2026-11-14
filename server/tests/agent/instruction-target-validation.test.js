import test from "node:test";
import assert from "node:assert/strict";
import {
  extractRequestedTarget,
  classifyEntityCategory,
  validateTargetFieldAgainstInstruction,
} from "../../dist/modules/form-intelligence/target-field-validator.js";
import { matchFieldByTarget } from "../../dist/modules/form-intelligence/form-action-router.js";
import { isFieldTypeCompatible } from "../../dist/modules/form-intelligence/field-type-validator.service.js";

test("Instruction-to-Target Field Validation Test Suite", async (t) => {
  // Test A: Personal Name vs Organization Name
  await t.test("Test A: Personal Name vs Organization Name (Customer Name vs University Name / Company Name)", () => {
    const universityField = {
      id: "f-univ",
      fieldIdentifier: "university_name",
      label: "University Name",
      inputType: "text",
    };
    const companyField = {
      id: "f-comp",
      fieldIdentifier: "company_name",
      label: "Company Name",
      inputType: "text",
    };
    const customerField = {
      id: "f-cust",
      fieldIdentifier: "custname",
      label: "Customer Name",
      inputType: "text",
    };

    // User says "Add Adarsh Jha as customer name"
    const instruction = "Add Adarsh Jha as customer name";

    // Validates against customer name
    const validRes = validateTargetFieldAgainstInstruction({
      originalInstruction: instruction,
      candidateField: customerField,
      value: "Adarsh Jha",
    });
    assert.equal(validRes.valid, true);

    // Rejects against university name
    const univRes = validateTargetFieldAgainstInstruction({
      originalInstruction: instruction,
      candidateField: universityField,
      value: "Adarsh Jha",
    });
    assert.equal(univRes.valid, false);
    assert.equal(univRes.errorCode, "TARGET_FIELD_MISMATCH");

    // Rejects against company name
    const compRes = validateTargetFieldAgainstInstruction({
      originalInstruction: instruction,
      candidateField: companyField,
      value: "Adarsh Jha",
    });
    assert.equal(compRes.valid, false);
    assert.equal(compRes.errorCode, "TARGET_FIELD_MISMATCH");

    // Router matching score must be 0 for mismatched entities
    assert.equal(matchFieldByTarget("customer name", universityField, "Adarsh Jha"), 0);
    assert.equal(matchFieldByTarget("customer name", companyField, "Adarsh Jha"), 0);
  });

  // Test B: Personal Name vs File Input
  await t.test("Test B: Personal Name vs File Input (Customer Name vs Attach Files / File Name)", () => {
    const fileField = {
      id: "f-file",
      fieldIdentifier: "_r_km_",
      label: "Attach files",
      inputType: "file",
    };

    const instruction = "customer name ko Adarsh Jha likho";

    const res = validateTargetFieldAgainstInstruction({
      originalInstruction: instruction,
      candidateField: fileField,
      value: "Adarsh Jha",
    });

    assert.equal(res.valid, false);
    // Either INCOMPATIBLE_FIELD_TYPE or TARGET_FIELD_MISMATCH is acceptable
    assert.ok(res.errorCode === "INCOMPATIBLE_FIELD_TYPE" || res.errorCode === "TARGET_FIELD_MISMATCH");

    // Compatibility check must be incompatible
    assert.equal(isFieldTypeCompatible(fileField, "Adarsh Jha").compatible, false);
  });

  // Test C: Address vs Email Address
  await t.test("Test C: Address vs Email Address ('123 MG Road' vs Email field)", () => {
    const emailField = {
      id: "f-email",
      fieldIdentifier: "custemail",
      label: "E-mail address",
      inputType: "email",
    };

    const instruction = "Put 123 MG Road as my address";

    const res = validateTargetFieldAgainstInstruction({
      originalInstruction: instruction,
      candidateField: emailField,
      value: "123 MG Road",
    });

    assert.equal(res.valid, false);
    assert.ok(res.errorCode === "INCOMPATIBLE_FIELD_TYPE" || res.errorCode === "TARGET_FIELD_MISMATCH");
    assert.equal(matchFieldByTarget("address", emailField, "123 MG Road"), 0);
  });

  // Test D: Phone Number vs PIN Code
  await t.test("Test D: Phone Number vs PIN Code ('9876543210' vs PIN Code field)", () => {
    const pinField = {
      id: "f-pin",
      fieldIdentifier: "pincode",
      label: "PIN Code",
      inputType: "text",
    };

    const instruction = "Set phone number to 9876543210";

    const res = validateTargetFieldAgainstInstruction({
      originalInstruction: instruction,
      candidateField: pinField,
      value: "9876543210",
    });

    assert.equal(res.valid, false);
    assert.equal(res.errorCode, "TARGET_FIELD_MISMATCH");
    assert.equal(matchFieldByTarget("phone number", pinField, "9876543210"), 0);
  });

  // Test E: Target Specificity
  await t.test("Test E: Target Specificity (Customer Name vs Emergency Contact Name)", () => {
    const emergencyField = {
      id: "f-emerg",
      fieldIdentifier: "emergency_contact_name",
      label: "Emergency Contact Name",
      inputType: "text",
    };
    const customerField = {
      id: "f-cust",
      fieldIdentifier: "custname",
      label: "Customer Name",
      inputType: "text",
    };

    const instruction = "Add Adarsh Jha as customer name";

    // Rejects Emergency Contact
    const emergRes = validateTargetFieldAgainstInstruction({
      originalInstruction: instruction,
      candidateField: emergencyField,
      value: "Adarsh Jha",
    });
    assert.equal(emergRes.valid, false);
    assert.equal(emergRes.errorCode, "TARGET_FIELD_MISMATCH");

    // Accepts Customer Name
    const custRes = validateTargetFieldAgainstInstruction({
      originalInstruction: instruction,
      candidateField: customerField,
      value: "Adarsh Jha",
    });
    assert.equal(custRes.valid, true);
  });

  // Test F: Ambiguous Target
  await t.test("Test F: Ambiguous Target ('Add my name' when Customer Name + Emergency Contact Name exist)", () => {
    const pool = [
      { id: "f-1", fieldIdentifier: "custname", label: "Customer Name", inputType: "text" },
      { id: "f-2", fieldIdentifier: "emergency_name", label: "Emergency Contact Name", inputType: "text" },
    ];

    const instruction = "Add my name as Adarsh";

    const res = validateTargetFieldAgainstInstruction({
      originalInstruction: instruction,
      candidateField: pool[0],
      candidatePool: pool,
      value: "Adarsh",
    });

    assert.equal(res.valid, false);
    assert.equal(res.errorCode, "TARGET_FIELD_AMBIGUOUS");
    assert.equal(res.clarificationNeeded, true);
  });

  // Test G: Date of Birth vs Application Date
  await t.test("Test G: Date of Birth vs Application Date ('15 August 1995')", () => {
    const appDateField = {
      id: "f-app-date",
      fieldIdentifier: "application_date",
      label: "Application Date",
      inputType: "date",
    };
    const dobField = {
      id: "f-dob",
      fieldIdentifier: "date_of_birth",
      label: "Date of Birth",
      inputType: "date",
    };

    const instruction = "My date of birth is 15 August 1995";

    const invalidRes = validateTargetFieldAgainstInstruction({
      originalInstruction: instruction,
      candidateField: appDateField,
      value: "1995-08-15",
    });
    assert.equal(invalidRes.valid, false);
    assert.equal(invalidRes.errorCode, "TARGET_FIELD_MISMATCH");

    const validRes = validateTargetFieldAgainstInstruction({
      originalInstruction: instruction,
      candidateField: dobField,
      value: "1995-08-15",
    });
    assert.equal(validRes.valid, true);
  });

  // Test H: Contextual Consistency
  await t.test("Test H: Contextual Consistency (Wrong FormTaskId or ConversationId)", () => {
    const field = {
      id: "f-1",
      fieldIdentifier: "custname",
      label: "Customer Name",
      inputType: "text",
    };

    const taskMismatchRes = validateTargetFieldAgainstInstruction({
      originalInstruction: "customer name is Adarsh",
      candidateField: field,
      formTaskId: "task-wrong",
      expectedTaskId: "task-expected",
    });
    assert.equal(taskMismatchRes.valid, false);
    assert.equal(taskMismatchRes.errorCode, "CONTEXT_MISMATCH");

    const convMismatchRes = validateTargetFieldAgainstInstruction({
      originalInstruction: "customer name is Adarsh",
      candidateField: field,
      conversationId: "conv-wrong",
      expectedConversationId: "conv-expected",
    });
    assert.equal(convMismatchRes.valid, false);
    assert.equal(convMismatchRes.errorCode, "CONTEXT_MISMATCH");
  });

  // Test I: Multilingual Matching
  await t.test("Test I: Multilingual Matching (Hindi/Hinglish 'नाम', 'ग्राहक का नाम', 'फोन नंबर')", () => {
    const custField = {
      id: "f-1",
      fieldIdentifier: "custname",
      label: "Customer name:",
      inputType: "text",
    };
    const phoneField = {
      id: "f-2",
      fieldIdentifier: "custtel",
      label: "Telephone:",
      inputType: "tel",
    };

    const hindiName = validateTargetFieldAgainstInstruction({
      originalInstruction: "ग्राहक का नाम आदर्श झा लिखें",
      candidateField: custField,
      value: "आदर्श झा",
    });
    assert.equal(hindiName.valid, true);

    const hinglishName = validateTargetFieldAgainstInstruction({
      originalInstruction: "customer name ko english mein likho",
      candidateField: custField,
      value: "Adarsh",
    });
    assert.equal(hinglishName.valid, true);

    const hindiPhone = validateTargetFieldAgainstInstruction({
      originalInstruction: "फोन नंबर 9004234499 डाल दो",
      candidateField: phoneField,
      value: "9004234499",
    });
    assert.equal(hindiPhone.valid, true);
  });

  // Test J: Target Extraction
  await t.test("Test J: extractRequestedTarget parsing precision", () => {
    const r1 = extractRequestedTarget("Add Adarsh Jha as customer name");
    assert.equal(r1.requestedTarget, "customer name");
    assert.equal(r1.requestedValue, "Adarsh Jha");

    const r2 = extractRequestedTarget("Set phone number to 9876543210");
    assert.equal(r2.requestedTarget, "phone number");
    assert.equal(r2.requestedValue, "9876543210");

    const r3 = extractRequestedTarget("customer name mein Adarsh likho");
    assert.equal(r3.requestedTarget, "customer name");
    assert.equal(r3.requestedValue, "Adarsh");
  });

  // Test K: Entity Category Classifier
  await t.test("Test K: Entity Category Classifier", () => {
    assert.equal(classifyEntityCategory("Customer Name"), "PERSON_NAME");
    assert.equal(classifyEntityCategory("University of Mumbai"), "ORGANIZATION_NAME");
    assert.equal(classifyEntityCategory("Attach files"), "FILE_ATTACHMENT");
    assert.equal(classifyEntityCategory("Telephone"), "PHONE_NUMBER");
    assert.equal(classifyEntityCategory("PIN Code"), "POSTAL_CODE");
    assert.equal(classifyEntityCategory("E-mail address"), "EMAIL_ADDRESS");
    assert.equal(classifyEntityCategory("Delivery instructions"), "UNKNOWN");
  });
});

