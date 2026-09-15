export const PERMISSION_KEYS = {

  // organization
  ORGANIZATION_CREATE: 'organization:create',
  ORGANIZATION_EDIT: 'organization:edit',

  // staff
  STAFF_INVITE: 'staff:invite',
  STAFF_INVITE_REVOKE: 'staff:invite_revoke',
  STAFF_ASSIGN_ROLE: 'staff:assign_role',
  STAFF_REMOVE: 'staff:remove',
  STAFF_VIEW: 'staff:view',

  ROLE_CREATE_CUSTOM: 'role:create_custom',
  ROLE_EDIT_CUSTOM: 'role:edit_custom',
  ROLE_DEACTIVATE_CUSTOM: 'role:deactivate_custom',

  // facility
  FACILITY_CREATE: 'facility:create',
  FACILITY_EDIT_DETAILS: 'facility:edit_details',
  FACILITY_EDIT_PRICING: 'facility:edit_pricing',
  FACILITY_EDIT_HOURS: 'facility:edit_hours',
  FACILITY_DEACTIVATE: 'facility:deactivate',
  FACILITY_VIEW_ANALYTICS: 'facility:view_analytics',

  // resource
  RESOURCE_CREATE: 'resource:create',
  RESOURCE_EDIT: 'resource:edit',
  RESOURCE_BLOCK_SLOT: 'resource:block_slot',

  // booking
  BOOKING_CREATE: 'booking:create',
  BOOKING_VIEW_OWN: 'booking:view_own',
  BOOKING_VIEW_FACILITY: 'booking:view_facility',
  BOOKING_CANCEL_OWN: 'booking:cancel_own',
  BOOKING_CANCEL_ANY: 'booking:cancel_any',
  BOOKING_MARK_NOSHOW: 'booking:mark_noshow',
  BOOKING_RESCHEDULE: 'booking:reschedule',

  // payment
  PAYMENT_MAKE: 'payment:make',
  PAYMENT_VIEW_OWN: 'payment:refund_view_own',
  PAYMENT_VIEW_FACILITY: 'payment:view_facility',
  PAYMENT_REFUND_ISSUE: 'payment:refund_issue',

  // payout
  PAYOUT_VIEW: 'payout:view',
  PAYOUT_RELEASE: 'payout:release',

  // review
  REVIEW_CREATE: 'review:create',
  REVIEW_MODERATE: 'review:moderate',

  //platform
  PLATFORM_APPROVE_FACILITY: 'platform:approve_facility',
  PLATFORM_SUSPEND_FACILITY: 'platform:suspend_facility',
  PLATFORM_SUSPEND_USER: 'platform:suspend_user',
  PLATFORM_MANAGE_PERMISSIONS: 'platform:manage_permissions',
  PLATFORM_VIEW_ALL_BOOKINGS: 'platform:view_all_bookings',
  PLATFORM_VIEW_AUDIT_LOG: 'platform:view_audit_log',
  PLATFORM_ISSUE_REFUND_OVERRIDE: 'platform:issue_refund_override',
} as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];
