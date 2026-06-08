# Durkkas EMS Fresh Supabase Run Order

This folder is the complete clean SQL set for a fresh Supabase project.

Run these files in exact order. Do not skip numbers.

| Order | File | Purpose |
|---:|---|---|
| 00 | `00_init.sql` | Extensions, schemas, base database setup |
| 01 | `01_core_schema.sql` | Core tenant/company/branch/employee foundation |
| 02 | `02_auth_schema.sql` | Users, roles, permissions, menu registry, audit |
| 03 | `03_ems_schema_v2.sql` | Main EMS academic tables |
| 04 | `04_subscription_system.sql` | Subscription base tables |
| 05 | `05_platform_branding_schema.sql` | Platform branding and UI configuration |
| 06 | `06_subscription_access_control.sql` | Plan limits, module access, subscription checks |
| 07 | `07_custom_subscription_plans.sql` | Custom plans and menu subscription setup |
| 08 | `08_platform_admin_layer.sql` | Layer 1: Platform Admin control plane |
| 09 | `09_tenant_admin_layer.sql` | Layer 2: Tenant Admin control tables |
| 10 | `10_dynamic_role_layer.sql` | Layer 3: Dynamic role and menu-scope tables |
| 11 | `11_tutor_layer.sql` | Layer 4: Tutor assigned-scope tables |
| 12 | `12_student_layer.sql` | Layer 5: Student progress, notifications, practice lab |
| 13 | `13_ems_rbac_approval_hardening.sql` | EMS roles, CRUD permissions, approvals, delete guard, menu mapping |
| 14 | `14_seed_ems_admin_user.sql` | First EMS admin login seed |
| 15 | `15_ems_complete_dummy_data.sql` | Demo data only; run if you need sample records |
| 16 | `16_seed_all_portal_users.sql` | Separate login users for every portal/layer |

## Important Rules

- `00` to `14` are needed for a working fresh setup.
- `15` is optional demo data.
- `16` is recommended for testing every portal login separately.
- All tenant-owned data must have `company_id`.
- Hard delete is blocked for EMS operational tables. Use `ems.secure_soft_delete(...)`.
- Approval-managed content uses `approval_status` and `ems.approval_requests`.
- Roles are menu-driven and permission-driven:
  - `PLATFORM_ADMIN`: all tenants and platform control.
  - `TENANT_ADMIN`: one institution, full tenant control including delete.
  - `ACADEMIC_MANAGER`: academic approvals and operations, no delete.
  - `TUTOR`: assigned teaching operations.
  - `STUDENT`: own learning data only.

## Login Seed

After running `14_seed_ems_admin_user.sql`, the default login is:

- Email: `ems.admin@dipl.edu`
- Password: `admin@123`

Change this password immediately after first login.

After running `16_seed_all_portal_users.sql`, all seeded users use password `admin@123`.
