import 'dotenv/config';

/**
 * Supabase Client Configuration
 *
 * This module configures a Supabase client for the backend using the
 * service-role key (full access). The public anon key is used only on the
 * frontend.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { SCHEMAS } from '@/config/constants';

// ------------------------------------------------------------
// Environment validation
// ------------------------------------------------------------
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
}

// Debug: show a short prefix of the service key (never log the full key)
console.log('Supabase service key loaded, prefix:', process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 8));

// ------------------------------------------------------------
// Supabase client (backend – service role)
// ------------------------------------------------------------
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Alias for clarity
export const supabaseService = supabase;

/**
 * Workaround: supabase.schema() hangs in supabase-js v2.89.0.
 * Create one client per schema with db.schema set at construction.
 */
const schemaClients: Record<string, ReturnType<typeof createClient>> = {};

function getSchemaClient(schema: string) {
  if (!schemaClients[schema]) {
    schemaClients[schema] = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema },
      }
    );
  }
  return schemaClients[schema];
}

/**
 * Helper to query a specific schema and table.
 */
export function fromSchema(schema: string, table: string) {
  return getSchemaClient(schema).from(table);
}

// ------------------------------------------------------------
// Schema‑specific query groups
// ------------------------------------------------------------
export const core = {
  companies: () => fromSchema(SCHEMAS.CORE, 'companies'),
  branches: () => fromSchema(SCHEMAS.CORE, 'branches'),
  departments: () => fromSchema(SCHEMAS.CORE, 'departments'),
  designations: () => fromSchema(SCHEMAS.CORE, 'designations'),
  academicYears: () => fromSchema(SCHEMAS.CORE, 'academic_years'),
  countries: () => fromSchema(SCHEMAS.CORE, 'countries'),
  states: () => fromSchema(SCHEMAS.CORE, 'states'),
  cities: () => fromSchema(SCHEMAS.CORE, 'cities'),
  locations: () => fromSchema(SCHEMAS.CORE, 'locations'),
  globalSettings: () => fromSchema(SCHEMAS.CORE, 'global_settings'),
  employees: () => fromSchema(SCHEMAS.CORE, 'employees'),
  subscriptionPlans: () => fromSchema(SCHEMAS.CORE, 'subscription_plans'),
  subscriptionHistory: () => fromSchema(SCHEMAS.CORE, 'subscription_history'),
  platformBranding: () => fromSchema(SCHEMAS.CORE, 'platform_branding'),
  companyBranding: () => fromSchema(SCHEMAS.CORE, 'company_branding'),
  companySecurityWhitelists: () => fromSchema(SCHEMAS.CORE, 'company_security_whitelists'),
};

export const app_auth = {
  users: () => fromSchema(SCHEMAS.AUTH, 'users'),
  roles: () => fromSchema(SCHEMAS.AUTH, 'roles'),
  permissions: () => fromSchema(SCHEMAS.AUTH, 'permissions'),
  userRoles: () => fromSchema(SCHEMAS.AUTH, 'user_roles'),
  rolePermissions: () => fromSchema(SCHEMAS.AUTH, 'role_permissions'),
  menuRegistry: () => fromSchema(SCHEMAS.AUTH, 'menu_registry'),
  menuPermissions: () => fromSchema(SCHEMAS.AUTH, 'menu_permissions'),
  loginHistory: () => fromSchema(SCHEMAS.AUTH, 'login_history'),
  auditLogs: () => fromSchema(SCHEMAS.AUTH, 'audit_logs'),
  trustedDevices: () => fromSchema(SCHEMAS.AUTH, 'trusted_devices'),
  userPermissions: () => fromSchema(SCHEMAS.AUTH, 'user_permissions'),
  notifications: () => fromSchema(SCHEMAS.AUTH, 'notifications'),
};

export const ems = {
  students: () => fromSchema(SCHEMAS.EMS, 'students'),
  studentGuardians: () => fromSchema(SCHEMAS.EMS, 'student_guardians'),
  courses: () => fromSchema(SCHEMAS.EMS, 'courses'),
  courseModules: () => fromSchema(SCHEMAS.EMS, 'course_modules'),
  lessons: () => fromSchema(SCHEMAS.EMS, 'lessons'),
  courseMaterials: () => fromSchema(SCHEMAS.EMS, 'course_materials'),
  batches: () => fromSchema(SCHEMAS.EMS, 'batches'),
  enrollments: () => fromSchema(SCHEMAS.EMS, 'student_enrollments'),
  lessonProgress: () => fromSchema(SCHEMAS.EMS, 'lesson_progress'),
  quizzes: () => fromSchema(SCHEMAS.EMS, 'quizzes'),
  assignments: () => fromSchema(SCHEMAS.EMS, 'assignments'),
  attendanceSessions: () => fromSchema(SCHEMAS.EMS, 'attendance_sessions'),
  attendanceRecords: () => fromSchema(SCHEMAS.EMS, 'attendance_records'),
  liveClasses: () => fromSchema(SCHEMAS.EMS, 'live_classes'),
  quizAttempts: () => fromSchema(SCHEMAS.EMS, 'quiz_attempts'),
  quizQuestions: () => fromSchema(SCHEMAS.EMS, 'quiz_questions'),
  quizOptions: () => fromSchema(SCHEMAS.EMS, 'quiz_options'),
  assignmentSubmissions: () => fromSchema(SCHEMAS.EMS, 'assignment_submissions'),
  courseTutors: () => fromSchema(SCHEMAS.EMS, 'course_tutors'),
  quizAssignments: () => fromSchema(SCHEMAS.EMS, 'quiz_assignments'),
  faceVerifications: () => fromSchema(SCHEMAS.EMS, 'attendance_face_verifications'),
  faceProfiles: () => fromSchema(SCHEMAS.EMS, 'student_face_profiles'),
  institutionLocations: () => fromSchema(SCHEMAS.EMS, 'institution_locations'),
  dynamicRoles: () => fromSchema(SCHEMAS.EMS, 'dynamic_roles'),
  dynamicUserRoles: () => fromSchema(SCHEMAS.EMS, 'dynamic_user_roles'),
  feeStructure: () => fromSchema(SCHEMAS.EMS, 'fee_structure'),
  feePayments: () => fromSchema(SCHEMAS.EMS, 'fee_payments'),
  feeInstallments: () => fromSchema(SCHEMAS.EMS, 'fee_installments'),
  discounts: () => fromSchema(SCHEMAS.EMS, 'discounts'),
  expenses: () => fromSchema(SCHEMAS.EMS, 'expenses'),
  lateFeeConfig: () => fromSchema(SCHEMAS.EMS, 'late_fee_config'),
  dueReminders: () => fromSchema(SCHEMAS.EMS, 'due_reminders'),
  paymentLinks: () => fromSchema(SCHEMAS.EMS, 'payment_links'),
  supabase: supabase,
};
