import { addDays, formatISO, startOfMonth, startOfWeek, subDays } from "date-fns";
import { insuranceCategoryForPolicyType } from "@/lib/insurance";
import type { AppData, Client, Commission, PolicyWithClient, Profile } from "@/lib/types";

const today = new Date();
const date = (offset: number) => formatISO(addDays(today, offset), { representation: "date" });
const monday = startOfWeek(today, { weekStartsOn: 1 });
const nextMonday = addDays(monday, 7);
const monthStart = startOfMonth(today);
const demoExpiryDates = [
  addDays(monday, 4),
  addDays(monday, 5),
  addDays(monday, 6),
  addDays(nextMonday, 0),
  addDays(nextMonday, 2),
  addDays(nextMonday, 5),
  addDays(monthStart, 18),
  addDays(monthStart, 21),
  addDays(monthStart, 25),
  addDays(monthStart, 28),
  addDays(monthStart, 35),
  addDays(monthStart, 48),
  addDays(monthStart, 62),
  addDays(monthStart, 85),
  addDays(monthStart, 110)
].map((item) => formatISO(item, { representation: "date" }));

export const demoProfile: Profile = {
  id: "demo-agent",
  full_name: "Agent",
  email: "agent@policyhq.demo",
  phone_number: "+233 24 000 0000",
  company_name: "Accra Shield Brokers",
  avatar_url: null,
  whatsapp_enabled: true,
  email_notifications_enabled: true,
  birthday_messages_enabled: true,
  agent_whatsapp_summary_enabled: true,
  reminder_30_enabled: true,
  reminder_14_enabled: true,
  reminder_7_enabled: true
};

export const demoClients: Client[] = [
  ["c1", "Kwame Mensah", "+233 24 415 9082", "kwame.mensah@example.com", "No. 12 Ringway Crescent, Osu, Accra"],
  ["c2", "Abena Asante", "+233 20 338 4471", "abena.asante@example.com", "Plot 44 Lake Road, Kumasi"],
  ["c3", "Kofi Boateng", "+233 27 601 2293", "kofi.boateng@example.com", "Community 18, Spintex Road, Accra"],
  ["c4", "Akosua Darko", "+233 55 880 7421", "akosua.darko@example.com", "Anaji Estate, Takoradi"],
  ["c5", "Yaw Amponsah", "+233 26 714 0098", "yaw.amponsah@example.com", "East Legon Hills, Accra"],
  ["c6", "Efua Antwi", "+233 50 921 7360", "efua.antwi@example.com", "Airport Ridge, Tamale"],
  ["c7", "Kweku Sarpong", "+233 24 887 6154", "kweku.sarpong@example.com", "Atonsu Road, Kumasi"],
  ["c8", "Adwoa Owusu", "+233 59 304 1188", "adwoa.owusu@example.com", "Cantonments, Accra"],
  ["c9", "Nana Agyeman", "+233 20 772 3395", "nana.agyeman@example.com", "Market Circle, Takoradi"],
  ["c10", "Akua Frimpong", "+233 54 612 8450", "akua.frimpong@example.com", "Roman Ridge, Accra"]
].map(([id, full_name, phone_number, email, address], index) => ({
  id,
  agent_id: "demo-agent",
  full_name,
  phone_number,
  email,
  date_of_birth: [
    "1984-05-08",
    "1990-02-14",
    "1978-09-21",
    "1993-12-03",
    "1988-07-17",
    "1986-04-11",
    "1991-10-29",
    "1982-06-06",
    "1975-03-19",
    "1995-11-24"
  ][index],
  address,
  created_at: subDays(today, 70 - index * 4).toISOString(),
  updated_at: null
}));

const policyRows: Array<[string, string, string, PolicyWithClient["policy_type"], string, string, number, PolicyWithClient["renewal_status"], number, Commission["payment_status"]]> = [
  ["p1", "c1", "POL-GH-MOT-1001", "Motor", "Enterprise Insurance LTD", demoExpiryDates[0], 1800, "Reminder Sent", 10, "Pending"],
  ["p2", "c2", "POL-GH-LIF-1002", "Life", "GLICO Life Insurance LTD", demoExpiryDates[1], 12000, "Under Renewal", 12, "Paid"],
  ["p3", "c3", "POL-GH-HEA-1003", "Health", "GLICO Healthcare Limited", demoExpiryDates[2], 4200, "Not Started", 8, "Pending"],
  ["p4", "c4", "POL-GH-FIR-1004", "Fire", "SIC Insurance PLC", demoExpiryDates[3], 7600, "Reminder Sent", 15, "Paid"],
  ["p5", "c5", "POL-GH-PRO-1005", "Property", "Star Assurance Limited Company", demoExpiryDates[4], 9800, "Under Renewal", 11, "Pending"],
  ["p6", "c6", "POL-GH-MOT-1006", "Motor", "SIC Insurance PLC", demoExpiryDates[5], 2400, "Not Started", 7, "Pending"],
  ["p7", "c7", "POL-GH-HEA-1007", "Health", "Acacia Health Insurance Limited", demoExpiryDates[6], 5100, "Reminder Sent", 9, "Paid"],
  ["p8", "c8", "POL-GH-LIF-1008", "Life", "Enterprise Life Assurance LTD", demoExpiryDates[7], 9000, "Not Started", 10, "Pending"],
  ["p9", "c9", "POL-GH-FIR-1009", "Fire", "Sanlam Allianz General Insurance Ghana LTD", demoExpiryDates[8], 6900, "Reminder Sent", 13, "Paid"],
  ["p10", "c10", "POL-GH-PRO-1010", "Property", "Star Assurance Limited Company", demoExpiryDates[9], 11100, "Under Renewal", 14, "Pending"],
  ["p11", "c1", "POL-GH-HEA-1011", "Health", "Kaiser Global Health Limited", demoExpiryDates[10], 3200, "Not Started", 6, "Paid"],
  ["p12", "c2", "POL-GH-MOT-1012", "Motor", "Enterprise Insurance LTD", demoExpiryDates[11], 1500, "Not Started", 5, "Pending"],
  ["p13", "c3", "POL-GH-LIF-1013", "Life", "GLICO Life Insurance LTD", demoExpiryDates[12], 11800, "Not Started", 12, "Paid"],
  ["p14", "c4", "POL-GH-FIR-1014", "Fire", "Star Assurance Limited Company", demoExpiryDates[13], 8600, "Not Started", 9, "Pending"],
  ["p15", "c5", "POL-GH-PRO-1015", "Property", "Sanlam Allianz General Insurance Ghana LTD", demoExpiryDates[14], 10400, "Not Started", 15, "Paid"]
];

export const demoPolicies: PolicyWithClient[] = policyRows.map(([id, clientId, policy_number, policy_type, insurer_name, expiryDate, premium_amount, renewal_status], index) => {
  const client = demoClients.find((item) => item.id === clientId)!;
  return {
    id,
    agent_id: "demo-agent",
    client_id: clientId,
    client,
    policy_number,
    policy_type,
    insurance_category: insuranceCategoryForPolicyType(policy_type),
    vehicle_number: policy_type === "Motor" ? ["GR-4421-26", "AS-2190-24", "GT-8894-25"][index % 3] : null,
    property_location: policy_type === "Property" ? ["East Legon Hills, Accra", "Cantonments, Accra", "Lake Road, Kumasi"][index % 3] : null,
    insurer_name,
    start_date: formatISO(addDays(new Date(`${expiryDate}T00:00:00Z`), -365), { representation: "date" }),
    expiry_date: expiryDate,
    premium_amount,
    currency: "GHS",
    status: "Active",
    renewal_status,
    notes: "Demo policy record for live product walkthrough.",
    created_at: subDays(today, 30 - index).toISOString(),
    updated_at: null
  };
});

export const demoCommissions: Commission[] = policyRows.map(([policyId, , , , , , premium, , commission_rate, payment_status], index) => ({
  id: `cm${index + 1}`,
  policy_id: policyId,
  agent_id: "demo-agent",
  commission_rate,
  commission_amount: Number((premium * commission_rate / 100).toFixed(2)),
  payment_status,
  payment_date: payment_status === "Paid" ? date(-index - 2) : null,
  created_at: subDays(today, 20 - index).toISOString()
}));

export const demoData: AppData = {
  profile: demoProfile,
  clients: demoClients,
  policies: demoPolicies.map((policy) => ({
    ...policy,
    commission: demoCommissions.find((commission) => commission.policy_id === policy.id)
  })),
  commissions: demoCommissions,
  notifications: [
    {
      id: "n1",
      agent_id: "demo-agent",
      policy_id: "p1",
      client_id: "c1",
      message: "7-day renewal reminder sent for Kwame Mensah (POL-GH-MOT-1001).",
      type: "renewal_7",
      is_read: false,
      created_at: new Date().toISOString()
    },
    {
      id: "n2",
      agent_id: "demo-agent",
      policy_id: "p4",
      client_id: "c4",
      message: "14-day renewal reminder sent for Akosua Darko (POL-GH-FIR-1004).",
      type: "renewal_14",
      is_read: false,
      created_at: subDays(today, 1).toISOString()
    }
  ]
};
