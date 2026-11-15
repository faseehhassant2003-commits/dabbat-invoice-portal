export function automaticInvoicesEnabled(saved: boolean | undefined, legacyValue?: string): boolean {
  return saved ?? legacyValue === "true";
}

export function automaticInvoiceReadiness(input: { shopifyConnected: boolean; customerDataApproved: boolean; gmailConnected: boolean; gmailTestPassed: boolean }): string | null {
  if (!input.shopifyConnected) return "Connect Shopify before enabling automatic invoices.";
  if (!input.customerDataApproved) return "Confirm Shopify customer data access before enabling automatic invoices.";
  if (!input.gmailConnected || !input.gmailTestPassed) return "Connect Gmail and pass the internal email test before enabling automatic invoices.";
  return null;
}
