import { normalizePolicyNumber } from "@/lib/policy-number";

export type LapseShieldStatementRow = {
  rowNumber: number;
  policy_number: string;
  client_name: string;
};

export function extractStatementPolicyNumbersFromText(text: string): LapseShieldStatementRow[] {
  const matches = text.match(/[A-Z0-9][A-Z0-9./-]{2,39}/gi) ?? [];
  const seen = new Set<string>();
  const rows: LapseShieldStatementRow[] = [];

  for (const match of matches) {
    const policyNumber = normalizePolicyNumber(match);
    const digits = policyNumber.replace(/\D/g, "");
    const hasLetter = /[A-Z]/.test(policyNumber);
    const hasDigit = /\d/.test(policyNumber);
    const hasPolicySeparator = /[./-]/.test(policyNumber);
    const looksLikePolicyNumber = hasDigit && (hasPolicySeparator || (hasLetter && policyNumber.length >= 5) || digits.length >= 7);

    if (!looksLikePolicyNumber || seen.has(policyNumber)) continue;
    seen.add(policyNumber);
    rows.push({
      rowNumber: rows.length + 1,
      policy_number: policyNumber,
      client_name: ""
    });
  }

  return rows;
}
