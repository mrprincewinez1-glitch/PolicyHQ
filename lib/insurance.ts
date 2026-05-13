import type { InsuranceCategory, PolicyType } from "@/lib/types";

export type InsuranceCompany = {
  name: string;
  category: InsuranceCategory;
};

export const lifeInsuranceCompanies = [
  "Aster Life Ghana Limited",
  "Beige Assure Company",
  "Enterprise Life Assurance LTD",
  "Esich Life Assurance Company Ltd.",
  "Exceed Life Assurance Company Limited",
  "First Insurance Company Limited",
  "Ghana Life Insurance Company",
  "GLICO Life Insurance LTD",
  "Hollard Life Assurance Ghana LTD",
  "Impact Life Insurance Limited Company",
  "Emple Life Insurance Ghana LTD",
  "miLife Insurance Company Limited",
  "Old Mutual Life Assurance Company (Ghana) Limited",
  "Pinnacle Life Insurance Company Limited",
  "Prudential Life Insurance Ghana Limited",
  "Quality Life Assurance Company Limited",
  "Sanlam Allianz Life Insurance Ghana LTD",
  "SIC Life Company LTD",
  "StarLife Assurance Limited Company",
  "Vanguard Life Assurance Company Limited"
];

export const nonLifeInsuranceCompanies = [
  "Activa International Insurance Company Limited",
  "Bedrock Insurance Company Limited",
  "Best Assurance Company Limited",
  "Coronation Insurance (Ghana) LTD",
  "Donewell Insurance LTD",
  "Enterprise Insurance LTD",
  "Ghana Union Assurance LTD",
  "Glico General Insurance LTD",
  "Heritage Energy Insurance Company Limited",
  "Hollard Insurance Ghana LTD",
  "Imperial General Assurance Company Limited",
  "Loyalty Insurance Company Limited",
  "Millennium Insurance Company Limited",
  "NSIA Insurance Company Limited",
  "Phoenix Insurance Company Limited",
  "Prime Insurance Company Limited",
  "Priority Insurance LTD",
  "Provident Insurance Company Limited",
  "Quality Insurance Company Limited",
  "Regency Nem Insurance Ghana Limited",
  "Sanlam Allianz General Insurance Ghana LTD",
  "Serene Insurance Company Limited",
  "SIC Insurance PLC",
  "Star Assurance Limited Company",
  "SUNU Assurances Ghana LTD",
  "Unique Insurance Company Limited",
  "Vanguard Assurance Company Limited"
];

export const healthInsuranceCompanies = [
  "Acacia Health Insurance Limited",
  "Ace Medical Insurance Limited",
  "Apex Health Insurance Limited",
  "Cosmopolitan Health Insurance Limited",
  "Dosh Health Insurance Company Limited",
  "Equity Health Insurance Limited",
  "GAB Health Insurance Company LTD",
  "GLICO Healthcare Limited",
  "Kaiser Global Health Limited",
  "Liberty Medical Health Scheme Limited",
  "Metropolitan Health Insurance Ghana Limited",
  "NMH Nationwide Medical Health Insurance Scheme Limited",
  "Octaplus Health Limited",
  "Orange Health Insurance Limited",
  "Phoenix Health Insurance",
  "Premier Health Insurance Company Limited",
  "Rx Health Insurance",
  "Spectra Health Mutual Insurance",
  "StarHealth Insurance Company Limited",
  "Takaful Ghana Health Insurance",
  "Universal Health Insurance Limited",
  "Vitality Health Systems Limited"
];

export const insuranceCompanies: InsuranceCompany[] = [
  ...lifeInsuranceCompanies.map((name) => ({ name, category: "Life" as const })),
  ...nonLifeInsuranceCompanies.map((name) => ({ name, category: "Non-Life" as const })),
  ...healthInsuranceCompanies.map((name) => ({ name, category: "Health" as const }))
];

export function insuranceCategoryForPolicyType(policyType: PolicyType): InsuranceCategory {
  if (policyType === "Life") return "Life";
  if (policyType === "Health") return "Health";
  return "Non-Life";
}

export function findInsuranceCompanyCategory(name: string): InsuranceCategory | null {
  return findInsuranceCompany(name)?.category ?? null;
}

export function findInsuranceCompany(name: string): InsuranceCompany | null {
  const normalized = normalizeInsuranceCompanyName(name);
  return insuranceCompanies.find((company) => normalizeInsuranceCompanyName(company.name) === normalized) ?? null;
}

function normalizeInsuranceCompanyName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
