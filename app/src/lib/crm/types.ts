// Shared CRM types and constants. Safe to import from islands (no DB imports).

export type CrmRole = 'admin' | 'member';

/** Who is looking. Every service function takes one and filters by it. */
export type Viewer = {
  employeeId: string;
  role: CrmRole;
  /** Display name, for "created by" and defaults. */
  name: string;
};

export const STAGES = ['new', 'acquaintance', 'regular', 'member', 'donor', 'inactive'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  new: 'חדש',
  acquaintance: 'מכר',
  regular: 'קבוע',
  member: 'חבר קהילה',
  donor: 'תורם',
  inactive: 'לא פעיל',
};
/** Tailwind classes for the stage pill (bg + text). */
export const STAGE_STYLES: Record<Stage, string> = {
  new: 'bg-sky-100 text-sky-700',
  acquaintance: 'bg-stone-100 text-stone-700',
  regular: 'bg-emerald-100 text-emerald-800',
  member: 'bg-accent-soft text-accent-ink',
  donor: 'bg-amber-100 text-amber-800',
  inactive: 'bg-stone-100 text-stone-500',
};

export const VISIBILITIES = ['public', 'restricted'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

export const HOUSEHOLD_ROLES = ['head', 'spouse', 'child', 'other'] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];
export const HOUSEHOLD_ROLE_LABELS: Record<HouseholdRole, string> = {
  head: 'ראש משק בית',
  spouse: 'בן/בת זוג',
  child: 'ילד/ה',
  other: 'אחר',
};

export const LINK_TYPES = [
  'spouse', 'parent', 'child', 'sibling', 'employer', 'employee', 'referred_by', 'referred', 'friend', 'other',
] as const;
export type LinkType = (typeof LINK_TYPES)[number];
/** Label as seen from the `from` side: "X is the <label> of Y". */
export const LINK_LABELS: Record<LinkType, string> = {
  spouse: 'בן/בת זוג',
  parent: 'הורה',
  child: 'ילד/ה',
  sibling: 'אח/אחות',
  employer: 'מעסיק',
  employee: 'עובד/ת',
  referred_by: 'הופנה על ידי',
  referred: 'הפנה את',
  friend: 'חבר/ה',
  other: 'קשר אחר',
};
/** The type seen from the other end of a link. */
export const LINK_INVERSE: Record<LinkType, LinkType> = {
  spouse: 'spouse',
  parent: 'child',
  child: 'parent',
  sibling: 'sibling',
  employer: 'employee',
  employee: 'employer',
  referred_by: 'referred',
  referred: 'referred_by',
  friend: 'friend',
  other: 'other',
};

export const ACTIVITY_KINDS = ['note', 'call', 'visit', 'message', 'meeting', 'system'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  note: 'הערה',
  call: 'שיחה',
  visit: 'ביקור',
  message: 'הודעה',
  meeting: 'פגישה',
  system: 'מערכת',
};

export const GIFT_METHODS = ['cash', 'check', 'card', 'transfer', 'standing_order', 'other'] as const;
export type GiftMethod = (typeof GIFT_METHODS)[number];
export const GIFT_METHOD_LABELS: Record<GiftMethod, string> = {
  cash: 'מזומן',
  check: 'צ׳ק',
  card: 'כרטיס אשראי',
  transfer: 'העברה בנקאית',
  standing_order: 'הוראת קבע',
  other: 'אחר',
};

export const DATE_KINDS = ['birthday', 'anniversary', 'yahrzeit', 'bar_mitzvah', 'other'] as const;
export type DateKind = (typeof DATE_KINDS)[number];

// ---------------------------------------------------------------------------
// Row shapes returned by the service layer (src/lib/crm/*.ts)
// ---------------------------------------------------------------------------

export type EmployeeRef = { id: string; full_name: string; email: string | null };

/** One row of the contacts index / search results. */
export type ContactSummary = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;          // E.164
  phone_display: string | null;
  stage: Stage;
  visibility: Visibility;
  owner: EmployeeRef | null;
  household: { id: string; name: string } | null;
  tags: { id: string; name: string; color: string }[];
  last_activity_at: string | null;
  updated_at: string;
  created_at: string;
};

/** Full record for the contact page and GET /api/v1/crm/contacts/:id. */
export type ContactDetail = ContactSummary & {
  gender: Gender | null;
  birthdate: string | null;      // YYYY-MM-DD
  household_role: HouseholdRole | null;
  source: string | null;
  notes: string | null;
  is_archived: boolean;
  created_by: EmployeeRef | null;
  /** Share list (restricted contacts). Empty for public. */
  shares: EmployeeRef[];
  /** Other members of the household the viewer may see. */
  household_members: { id: string; first_name: string; last_name: string; household_role: HouseholdRole | null }[];
  /** Links, already flipped so `type` is as seen from this contact. */
  links: { id: string; type: LinkType; note: string | null; contact: { id: string; first_name: string; last_name: string } }[];
  open_tasks: number;
  gift_total: number;            // sum of amounts, ILS
  gift_count: number;
};

/** Fields accepted when creating or updating a contact. All optional on update. */
export type ContactInput = {
  first_name?: string;
  last_name?: string;
  gender?: Gender | null;
  birthdate?: string | null;
  email?: string | null;
  phone?: string | null;         // any human format; the service normalises
  household_id?: string | null;
  household_role?: HouseholdRole | null;
  stage?: Stage;
  owner_employee_id?: string | null;
  visibility?: Visibility;
  source?: string | null;
  notes?: string | null;
};

export type ContactFilter = {
  q?: string;                    // fuzzy: name, phone, email
  stage?: Stage | Stage[];
  tag?: string;                  // tag id or name
  owner?: string;                // employee id
  household?: string;            // household id
  visibility?: Visibility;
  updated_since?: string;        // ISO timestamp
  archived?: boolean;            // default false
};

export type ContactSort = 'name' | 'updated' | 'created' | 'last_activity' | 'stage';

export type Page<T> = {
  items: T[];
  /** Pass back as `after` to get the next page; null when done. */
  next: string | null;
  /** Total matching rows (for the header count). */
  total: number;
};

// ---------------------------------------------------------------------------
// Phase 2: families, tags, import
// ---------------------------------------------------------------------------

export const TAG_COLORS = ['stone', 'brand', 'flame', 'emerald', 'amber', 'rose', 'sky', 'teal'] as const;
export type TagColor = (typeof TAG_COLORS)[number];
/** Pill classes per tag colour. */
export const TAG_STYLES: Record<TagColor, string> = {
  stone: 'bg-stone-100 text-stone-700',
  brand: 'bg-brand-soft text-brand-ink',
  flame: 'bg-flame-soft text-flame-ink',
  emerald: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  rose: 'bg-rose-100 text-rose-800',
  sky: 'bg-sky-100 text-sky-700',
  teal: 'bg-teal-100 text-teal-800',
};
export type Tag = { id: string; name: string; color: TagColor; contact_count: number };

export type HouseholdSummary = {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  member_count: number;
  /** "first last" of the head and spouse, for list rows. */
  heads: string[];
  updated_at: string;
};
export type HouseholdMember = ContactSummary & { household_role: HouseholdRole | null; birthdate: string | null };
export type HouseholdDetail = HouseholdSummary & {
  notes: string | null;
  owner: EmployeeRef | null;
  members: HouseholdMember[];
  gift_total: number;
  gift_count: number;
};
export type HouseholdInput = {
  name?: string;
  street?: string | null;
  city?: string | null;
  postal_code?: string | null;
  notes?: string | null;
  owner_employee_id?: string | null;
};

export const IMPORT_COLUMNS = [
  'first_name', 'last_name', 'phone', 'email', 'gender', 'birthdate', 'stage',
  'street', 'city', 'postal_code', 'family', 'tags', 'notes', 'source', 'skip',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export const IMPORT_COLUMN_LABELS: Record<ImportColumn, string> = {
  first_name: 'שם פרטי', last_name: 'שם משפחה', phone: 'טלפון', email: 'אימייל', gender: 'מגדר',
  birthdate: 'תאריך לידה', stage: 'שלב', street: 'רחוב', city: 'עיר', postal_code: 'מיקוד',
  family: 'משפחה', tags: 'תגיות', notes: 'הערות', source: 'מקור', skip: '— לא לייבא —',
};
export type ImportPreview = { headers: string[]; sample: string[][]; suggested: ImportColumn[]; row_count: number };
export type ImportResult = { created: number; duplicates: number; families: number; errors: { row: number; message: string }[] };
