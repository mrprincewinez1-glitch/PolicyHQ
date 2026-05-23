export type PolicyType = "Life" | "Health" | "Motor" | "Property" | "Fire" | "Marine" | "Travel" | "Accident";
export type InsuranceCategory = "Life" | "Non-Life" | "Health";
export type PolicyStatus = "Active" | "Expired" | "Cancelled";
export type RenewalStatus = "Upcoming" | "Contacted" | "Quote Requested" | "Payment Pending" | "Renewed" | "Lost";
export type PaymentStatus = "Paid" | "Pending";
export type UserRole = "admin" | "agent";
export type ProspectStatus = "New" | "Interested" | "Not Interested" | "Call Back" | "Converted";

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  company_name: string | null;
  avatar_url: string | null;
  whatsapp_enabled: boolean;
  email_notifications_enabled: boolean;
  birthday_messages_enabled: boolean;
  agent_whatsapp_summary_enabled: boolean;
  reminder_30_enabled: boolean;
  reminder_14_enabled: boolean;
  reminder_7_enabled: boolean;
};

export type Client = {
  id: string;
  agent_id: string;
  full_name: string;
  phone_number: string;
  email: string | null;
  date_of_birth: string | null;
  address: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type Policy = {
  id: string;
  agent_id: string;
  client_id: string;
  policy_number: string;
  policy_type: PolicyType;
  insurance_category: InsuranceCategory;
  vehicle_number: string | null;
  property_location: string | null;
  insurer_name: string;
  start_date: string;
  expiry_date: string;
  premium_amount: number;
  currency: string;
  status: PolicyStatus;
  renewal_status: RenewalStatus;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

export type Commission = {
  id: string;
  policy_id: string;
  agent_id: string;
  commission_rate: number;
  commission_amount: number;
  payment_status: PaymentStatus;
  payment_date: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  agent_id: string;
  policy_id: string | null;
  client_id: string | null;
  message: string;
  type: "renewal_30" | "renewal_14" | "renewal_7" | "birthday" | "general";
  is_read: boolean;
  created_at: string;
};

export type Prospect = {
  id: string;
  agent_id: string;
  full_name: string;
  phone_number: string;
  status: ProspectStatus;
  follow_up_date: string | null;
  notes: string | null;
  created_at: string;
};

export type ActivityNote = {
  id: string;
  agent_id: string;
  client_id: string | null;
  policy_id: string | null;
  note_text: string;
  created_by: string | null;
  created_at: string;
  author_name?: string | null;
};

export type PolicyWithClient = Policy & {
  client: Client;
  commission?: Commission;
  activity_notes?: ActivityNote[];
};

export type AppData = {
  profile: Profile;
  clients: Client[];
  policies: PolicyWithClient[];
  commissions: Commission[];
  prospects: Prospect[];
  notifications: Notification[];
  activity_notes: ActivityNote[];
};
