import type { BrowserActionType, BrowserPageContext } from "./browser.protocol";

export interface BrowserFillAction {
  fieldId: string;
  actionId: string;
  action: BrowserActionType;
  value: string | number | boolean | Array<string | number | boolean>;
  expectedFieldType: string;
  expectedFieldFingerprint?: string;
}

export interface BrowserFillInstruction {
  protocolVersion: "bhasha.browser.v1";
  type: "FORM_FILL";
  actionId: string;
  idempotencyKey: string;
  taskId: string;
  approvalId: string;
  taskVersion: number;
  pageContext: BrowserPageContext;
  issuedAt: string;
  expiresAt: string;
  actions: BrowserFillAction[];
}
