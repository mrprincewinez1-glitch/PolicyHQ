const policyNumberPattern = /^[A-Z0-9./-]{3,40}$/;

export function normalizePolicyNumber(value: string) {
  return value.trim().toUpperCase();
}

export function isValidPolicyNumber(value: string) {
  return policyNumberPattern.test(normalizePolicyNumber(value));
}

export const policyNumberHelpText = "Use 3-40 characters: letters, numbers, /, -, or . No spaces.";
