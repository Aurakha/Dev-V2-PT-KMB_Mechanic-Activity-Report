/**
 * ============================================================================
 * Constants.gs - Centralized Constants & Enums
 * ============================================================================
 * 
 * Single source of truth untuk:
 * - Sheet names
 * - Status enums
 * - Role definitions
 * - Error codes
 * - System configuration
 * - Default values
 * 
 * Naming convention:
 * - CONST_SECTION = top-level object (e.g., SHEETS, STATUS)
 * - Properties: UPPER_SNAKE_CASE
 * 
 * Dependencies: None (foundation - other files depend on this)
 * 
 * ============================================================================
 * WORKFLOW B (current — updated May 2026):
 *   pending_mechanic_work → in_progress → pending_supervisor → 
 *   pending_superintendent → approved/rejected
 * 
 * Status `created` & `wait_mtbf` kept for backward compatibility but 
 * deprecated in active workflow. MTBF is now a multiplier factor only,
 * not a workflow-blocking wait state.
 * ============================================================================
 */

// ============================================================================
// SHEET NAMES
// ============================================================================

var SHEETS = {
  // Config sheets
  CONFIG_COMPONENTS: 'Config_Components',
  CONFIG_UNITS: 'Config_Units',
  CONFIG_MECHANICS: 'Config_Mechanics',
  CONFIG_FACTORS: 'Config_Factors',
  CONFIG_BASE_SETTINGS: 'Config_BaseSettings',
  CONFIG_JOBS_FIELD: 'Config_Jobs_Field',
  CONFIG_JOBS_WORKSHOP: 'Config_Jobs_Workshop',
  
  // Transaction sheets
  WORK_ORDERS: 'WorkOrders',
  WORK_ORDER_TEAM: 'WorkOrderTeam',
  APPROVALS: 'Approvals',
  SCORING_SNAPSHOTS: 'ScoringSnapshots',
  MECHANIC_POINTS: 'MechanicPoints',
  OTHERS_JOB_REQUESTS: 'OthersJobRequests',
  AUDIT_LOGS: 'AuditLogs',
  MTBF_TRACKING: 'MtbfTracking'
};

// ─── 3 SECTION (Fase 1) ─────────────────────────────────────────────────────
var SECTIONS = {
  TYREMAN: 'tyreman',
  FIELD: 'field',
  WORKSHOP: 'workshop'
};
var VALID_SECTIONS = [SECTIONS.TYREMAN, SECTIONS.FIELD, SECTIONS.WORKSHOP];

// All config sheet names (for iteration)
var CONFIG_SHEETS = [
  SHEETS.CONFIG_COMPONENTS,
  SHEETS.CONFIG_UNITS,
  SHEETS.CONFIG_MECHANICS,
  SHEETS.CONFIG_FACTORS,
  SHEETS.CONFIG_BASE_SETTINGS
];

// All transaction sheet names (for iteration)
var TRANSACTION_SHEETS = [
  SHEETS.WORK_ORDERS,
  SHEETS.WORK_ORDER_TEAM,
  SHEETS.APPROVALS,
  SHEETS.SCORING_SNAPSHOTS,
  SHEETS.MECHANIC_POINTS,
  SHEETS.OTHERS_JOB_REQUESTS,
  SHEETS.AUDIT_LOGS,
  SHEETS.MTBF_TRACKING
];

// All sheet names
var ALL_SHEETS = CONFIG_SHEETS.concat(TRANSACTION_SHEETS);

// ============================================================================
// WORK ORDER STATUS ENUM
// ============================================================================

var WO_STATUS = {
  // ─── ACTIVE STATES (Workflow B) ─────────────────────────────────────────
  PENDING_MECHANIC_WORK: 'pending_mechanic_work',  // After supervisor creates WO
  IN_PROGRESS: 'in_progress',                       // Mechanic started work
  PENDING_SUPERVISOR: 'pending_supervisor',         // Awaiting supervisor approval
  PENDING_SUPERINTENDENT: 'pending_superintendent', // Awaiting superintendent approval
  APPROVED: 'approved',                             // Terminal: fully approved
  REJECTED: 'rejected',                             // Terminal: rejected
  
  // ─── LEGACY / DEPRECATED (kept for backward compat) ─────────────────────
  CREATED: 'created',                  // DEPRECATED: replaced by PENDING_MECHANIC_WORK
  WAIT_MTBF: 'wait_mtbf',              // DEPRECATED: MTBF is now multiplier only
  
  // ─── OTHERS FLOW (separate workflow) ────────────────────────────────────
  OTHERS_PENDING_SUPERVISOR: 'others_pending_supervisor'
};

// Valid status transitions (state machine)
// Each key = current status, value = array of statuses that can come next
var STATUS_TRANSITIONS = {
  // ─── WORKFLOW B (active) ────────────────────────────────────────────────
  'pending_mechanic_work':    ['in_progress', 'pending_supervisor', 'rejected'],
  'in_progress':              ['pending_supervisor'],
  'pending_supervisor':       ['pending_superintendent', 'rejected'],
  'pending_superintendent':   ['approved', 'pending_supervisor', 'rejected'],
  
  // ─── LEGACY (kept so old code paths don't break) ────────────────────────
  'created':                  ['in_progress', 'pending_mechanic_work'],
  'wait_mtbf':                ['pending_supervisor'],
  
  // ─── OTHERS FLOW ────────────────────────────────────────────────────────
  'others_pending_supervisor': ['created', 'rejected'],
  
  // ─── TERMINAL STATES ────────────────────────────────────────────────────
  'approved': [],
  'rejected': []
};

// Status display labels (untuk UI)
var STATUS_LABELS = {
  // Active workflow B labels
  'pending_mechanic_work':     'Pending Mechanic Work',
  'in_progress':               'In Progress',
  'pending_supervisor':        'Menunggu Planner',
  'pending_superintendent':    'Menunggu Supervisor',
  'approved':                  'Approved',
  'rejected':                  'Rejected',
  
  // Legacy labels
  'created':                   'Created (legacy)',
  'wait_mtbf':                 'Waiting MTBF (legacy)',
  
  // Others flow
  'others_pending_supervisor': 'Others - Pending Supervisor'
};

// ─── ACTIVE STATUSES ARRAY (untuk filter list / dashboard) ────────────────
// Workflow B active statuses, in workflow order
var ACTIVE_WO_STATUSES = [
  WO_STATUS.PENDING_MECHANIC_WORK,
  WO_STATUS.IN_PROGRESS,
  WO_STATUS.PENDING_SUPERVISOR,
  WO_STATUS.PENDING_SUPERINTENDENT
];

// Terminal statuses (WO done — approved or rejected)
var TERMINAL_WO_STATUSES = [
  WO_STATUS.APPROVED,
  WO_STATUS.REJECTED
];

// ============================================================================
// USER ROLES
// ============================================================================

var ROLES = {
  MECHANIC: 'mechanic',
  SUPERVISOR: 'supervisor',
  SUPERINTENDENT: 'superintendent'
};

var ALL_ROLES = [ROLES.MECHANIC, ROLES.SUPERVISOR, ROLES.SUPERINTENDENT];

// Roles yang bisa approve
var APPROVER_ROLES = [ROLES.SUPERVISOR, ROLES.SUPERINTENDENT];

// Roles yang bisa CREATE WO (Workflow B: supervisor & superintendent only)
var WO_CREATOR_ROLES = [ROLES.SUPERVISOR, ROLES.SUPERINTENDENT];

// ============================================================================
// FACTOR TYPES & KEYS
// ============================================================================

var FACTOR_TYPES = {
  WORK_CONDITION: 'work_condition',
  TIMELINESS: 'timeliness',
  SAFETY: 'safety',
  MTBF: 'mtbf'
};

var WORK_CONDITION_KEYS = {
  NORMAL: 'normal',
  DIFFICULT: 'difficult',
  EXTREME: 'extreme'
};

var TIMELINESS_KEYS = {
  ON_TIME: 'on_time',
  LATE: 'late',
  WAY_LATE: 'way_late'
};

var SAFETY_KEYS = {
  NO_INCIDENT: 'no_incident',
  INCIDENT: 'incident'
};

var MTBF_KEYS = {
  REDO: 'redo',
  FIRST_TIME: 'first_time'
};

// ============================================================================
// TIMELINESS THRESHOLDS (untuk calculate factor)
// ============================================================================

var TIMELINESS_THRESHOLDS = {
  ON_TIME_MAX: 100,  // <= 100% of target → on_time
  LATE_MAX: 150      // 101-150% → late, > 150% → way_late
};

// ============================================================================
// DEFAULT VALUES (fallback jika config missing)
// ============================================================================

var DEFAULTS = {
  MTBF_THRESHOLD_HOURS: 80,
  IDR_RATE: 50000,
  POINTS_TO_IDR_MULTIPLIER: 50000,
  BASE_POINTS_MULTIPLIER: 10,
  ON_TIME_DAYS_BUFFER: 0,
  SAFETY_INCIDENT_PENALTY: 0,
  
  // Factor defaults
  UNIT_FACTOR: 1.0,
  WORK_CONDITION_FACTOR: 1.0,
  TIMELINESS_FACTOR: 1.0,
  SAFETY_FACTOR: 1.0,
  MTBF_FACTOR: 1.0,
  
  // Team defaults
  TEAM_SIZE: 1,
  EQUAL_PERCENTAGE: 100  // Will be divided by team size
};

// ============================================================================
// ERROR CODES
// ============================================================================

var ERROR_CODES = {
  // Authentication errors (1xxx)
  AUTH_NOT_LOGGED_IN: 'AUTH_001',
  AUTH_USER_NOT_FOUND: 'AUTH_002',
  AUTH_USER_INACTIVE: 'AUTH_003',
  AUTH_ROLE_NOT_FOUND: 'AUTH_004',
  AUTH_PERMISSION_DENIED: 'AUTH_005',
  
  // Validation errors (2xxx)
  VALIDATION_REQUIRED: 'VAL_001',
  VALIDATION_INVALID_TYPE: 'VAL_002',
  VALIDATION_OUT_OF_RANGE: 'VAL_003',
  VALIDATION_INVALID_FORMAT: 'VAL_004',
  VALIDATION_INVALID_EMAIL: 'VAL_005',
  VALIDATION_INVALID_DATE: 'VAL_006',
  VALIDATION_INVALID_PERCENTAGE: 'VAL_007',
  VALIDATION_PERCENTAGE_SUM_INVALID: 'VAL_008',
  VALIDATION_INVALID: 'VAL_009',
  
  // Data errors (3xxx)
  DATA_NOT_FOUND: 'DATA_001',
  DATA_DUPLICATE: 'DATA_002',
  DATA_CONSTRAINT_VIOLATION: 'DATA_003',
  DATA_SHEET_NOT_FOUND: 'DATA_004',
  DATA_COLUMN_NOT_FOUND: 'DATA_005',
  DATA_INVALID_STATE: 'DATA_006',
  
  // Business logic errors (4xxx)
  WO_INVALID_STATUS_TRANSITION: 'WO_001',
  WO_MTBF_NOT_EXPIRED: 'WO_002',
  WO_ALREADY_APPROVED: 'WO_003',
  WO_NOT_FOUND: 'WO_004',
  WO_INVALID_TEAM: 'WO_005',
  WO_COMPONENT_NOT_FOUND: 'WO_006',
  WO_UNIT_NOT_FOUND: 'WO_007',
  WO_INVALID_TIME_RANGE: 'WO_008',  // start_time > end_time
  
  // System errors (5xxx)
  SYSTEM_LOCK_FAILED: 'SYS_001',
  SYSTEM_SHEET_WRITE_FAILED: 'SYS_002',
  SYSTEM_INTERNAL_ERROR: 'SYS_003',
  SYSTEM_TIMEOUT: 'SYS_004',
  SYSTEM_CONFIG_MISSING: 'SYS_005'
};

// Error messages (user-friendly)
var ERROR_MESSAGES = {
  'AUTH_001': 'Authentication required. Please log in.',
  'AUTH_002': 'User not found in system. Please contact admin.',
  'AUTH_003': 'User account is inactive. Please contact admin.',
  'AUTH_004': 'User role not defined. Please contact admin.',
  'AUTH_005': 'Permission denied. Insufficient privileges.',
  
  'VAL_001': 'Required field is missing.',
  'VAL_002': 'Invalid data type.',
  'VAL_003': 'Value out of allowed range.',
  'VAL_004': 'Invalid format.',
  'VAL_005': 'Invalid email format.',
  'VAL_006': 'Invalid date format.',
  'VAL_007': 'Invalid percentage (must be 0-100).',
  'VAL_008': 'Team percentages must sum to 100%.',
  'VAL_009': 'Invalid value.',
  
  'DATA_001': 'Data not found.',
  'DATA_002': 'Duplicate entry.',
  'DATA_003': 'Data constraint violation.',
  'DATA_004': 'Sheet not found.',
  'DATA_005': 'Column not found.',
  'DATA_006': 'Invalid data state.',
  
  'WO_001': 'Invalid status transition.',
  'WO_002': 'MTBF wait period not yet expired.',
  'WO_003': 'Work order already approved.',
  'WO_004': 'Work order not found.',
  'WO_005': 'Invalid team configuration.',
  'WO_006': 'Component not found.',
  'WO_007': 'Unit not found.',
  'WO_008': 'Invalid time range (end_time must be after start_time).',
  
  'SYS_001': 'Failed to acquire system lock. Please try again.',
  'SYS_002': 'Failed to write to sheet.',
  'SYS_003': 'Internal system error.',
  'SYS_004': 'Operation timed out.',
  'SYS_005': 'System configuration missing.'
};

// ============================================================================
// LOG LEVELS
// ============================================================================

var LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};

// Log level priority (untuk filtering)
var LOG_LEVEL_PRIORITY = {
  'DEBUG': 0,
  'INFO': 1,
  'WARN': 2,
  'ERROR': 3,
  'CRITICAL': 4
};

// Current log level (only logs at or above this level akan ditampilkan)
var CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;

// ============================================================================
// LOCK CONFIGURATION
// ============================================================================

var LOCK_CONFIG = {
  DEFAULT_TIMEOUT_MS: 10000,    // 10 seconds
  CRITICAL_TIMEOUT_MS: 30000,   // 30 seconds for critical operations
  MAX_RETRIES: 3,                // Retry 3 times jika fail
  RETRY_DELAY_MS: 500            // Wait 500ms between retries
};

// ============================================================================
// PERFORMANCE LIMITS
// ============================================================================

var PERFORMANCE = {
  MAX_EXECUTION_TIME_MS: 5 * 60 * 1000,  // 5 minutes (Apps Script limit is 6)
  BATCH_SIZE: 100,                        // Process in batches of 100
  WARN_SLOW_OPERATION_MS: 5000,           // Warn jika operation > 5 sec
  MAX_RETRIES: 3
};

// ============================================================================
// DATE FORMATS
// ============================================================================

var DATE_FORMATS = {
  DATE_ONLY: 'YYYY-MM-DD',
  DATE_TIME: 'YYYY-MM-DD HH:mm:ss',
  DATE_TIME_SHORT: 'YYYY-MM-DD HH:mm',
  DISPLAY: 'DD/MM/YYYY HH:mm',
  WO_NUMBER: 'YYYYMMDD'
};

// ============================================================================
// ID PREFIXES
// ============================================================================

var ID_PREFIXES = {
  WORK_ORDER: 'WO',
  WORK_ORDER_TEAM: 'WOT',
  APPROVAL: 'APPR',
  SCORING_SNAPSHOT: 'SS',
  MECHANIC_POINTS: 'MP',
  OTHERS_JOB: 'OTH',
  AUDIT_LOG: 'AL',
  MTBF_TRACKING: 'MT'
};

// ============================================================================
// VALIDATION CONSTANTS
// ============================================================================

var VALIDATION = {
  MIN_TEAM_SIZE: 1,
  MAX_TEAM_SIZE: 10,
  MIN_BASE_POINTS: 0,
  MAX_BASE_POINTS: 10000,
  MIN_TARGET_HOURS: 0,
  MAX_TARGET_HOURS: 1000,
  MIN_PERCENTAGE: 0,
  MAX_PERCENTAGE: 100,
  PERCENTAGE_TOLERANCE: 0.01,  // For floating point comparison
  MIN_FACTOR: 0,
  MAX_FACTOR: 5,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
};

// ============================================================================
// AUDIT ACTION TYPES
// ============================================================================

var AUDIT_ACTIONS = {
  CREATE_WO: 'create_wo',
  START_WO: 'start_wo',
  FINISH_WO: 'finish_wo',
  MECHANIC_SUBMIT_WORK: 'mechanic_submit_work',  // NEW: Workflow B
  OVERRIDE_MTBF: 'override_mtbf',
  OVERRIDE_TIMELINESS: 'override_timeliness',     // NEW: Workflow B
  SUPERVISOR_APPROVE: 'supervisor_approve',
  SUPERVISOR_REJECT: 'supervisor_reject',
  SUPERINTENDENT_APPROVE: 'superintendent_approve',
  SUPERINTENDENT_REJECT: 'superintendent_reject',
  OVERRIDE_FACTOR: 'override_factor',
  ADJUST_TEAM_DISTRIBUTION: 'adjust_team_distribution',
  OTHERS_JOB_SUBMIT: 'others_job_submit',
  OTHERS_JOB_APPROVE: 'others_job_approve',
  OTHERS_JOB_REJECT: 'others_job_reject',
  EDIT_CONFIG: 'edit_config'
};

// ============================================================================
// APPROVAL DECISIONS
// ============================================================================

var APPROVAL_DECISIONS = {
  APPROVE: 'approve',
  REJECT: 'reject'
};

var APPROVAL_STAGES = {
  SUPERVISOR: 'supervisor',
  SUPERINTENDENT: 'superintendent'
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get error message by error code
 * @param {string} errorCode
 * @return {string}
 */
function getErrorMessage(errorCode) {
  return ERROR_MESSAGES[errorCode] || 'Unknown error occurred';
}

/**
 * Check if status transition is valid
 * @param {string} fromStatus
 * @param {string} toStatus
 * @return {boolean}
 */
function isValidStatusTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return false;
  
  var allowed = STATUS_TRANSITIONS[fromStatus];
  if (!allowed) return false;
  
  return allowed.indexOf(toStatus) !== -1;
}

/**
 * Check if role is valid
 * @param {string} role
 * @return {boolean}
 */
function isValidRole(role) {
  if (!role) return false;
  return ALL_ROLES.indexOf(role.toLowerCase()) !== -1;
}

/**
 * Check if role is approver (supervisor or superintendent)
 * @param {string} role
 * @return {boolean}
 */
function isApproverRole(role) {
  if (!role) return false;
  return APPROVER_ROLES.indexOf(role.toLowerCase()) !== -1;
}

/**
 * Check if role can CREATE work orders (Workflow B: supv/supt only)
 * @param {string} role
 * @return {boolean}
 */
function isWoCreatorRole(role) {
  if (!role) return false;
  return WO_CREATOR_ROLES.indexOf(role.toLowerCase()) !== -1;
}

/**
 * Check if status is terminal (approved or rejected)
 * @param {string} status
 * @return {boolean}
 */
function isTerminalStatus(status) {
  if (!status) return false;
  return TERMINAL_WO_STATUSES.indexOf(status) !== -1;
}

/**
 * Check if status is active workflow B state
 * @param {string} status
 * @return {boolean}
 */
function isActiveWoStatus(status) {
  if (!status) return false;
  return ACTIVE_WO_STATUSES.indexOf(status) !== -1;
}

/**
 * Get human-readable label for status
 * @param {string} status
 * @return {string}
 */
function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function checkOverrideFunctionsAlreadyApplied() {
  var fns = [
    'getPendingApprovalsEnriched',
    'getEffectiveBasePoints',
    'getEffectiveTargetHours',
    'getEffectiveTeam',
    'enrichTeamData',
    'saveOverride',
    'getAllMechanicsForOverride'
  ];
  
  Logger.log('─── Step 2 functions status ───');
  var existing = 0;
  for (var i = 0; i < fns.length; i++) {
    var exists = false;
    try { 
      exists = (eval('typeof ' + fns[i])) === 'function'; 
    } catch(e) {}
    Logger.log((exists ? '✅ EXISTS:    ' : '⬜ MISSING:   ') + fns[i]);
    if (exists) existing++;
  }
  Logger.log('');
  Logger.log('Result: ' + existing + '/' + fns.length + ' functions already in codebase');
  
  Logger.log('');
  Logger.log('─── Router check ───');
  try {
    var src = renderApprovals.toString();
    var usesEnriched = src.indexOf('getPendingApprovalsEnriched') !== -1;
    var passesMechanics = src.indexOf('allMechanics') !== -1;
    Logger.log((usesEnriched ? '✅' : '⬜') + ' renderApprovals uses getPendingApprovalsEnriched');
    Logger.log((passesMechanics ? '✅' : '⬜') + ' renderApprovals passes allMechanics to template');
  } catch (e) {
    Logger.log('⚠️  Cannot inspect renderApprovals: ' + e.message);
  }
  
  Logger.log('');
  Logger.log('─── ScoringService check ───');
  try {
    var scoreSrc = calculateScore.toString();
    var hasOverride = scoreSrc.indexOf('_override_base_points') !== -1;
    Logger.log((hasOverride ? '✅' : '⬜') + ' calculateScore uses _override_base_points');
  } catch (e) {
    Logger.log('⚠️  Cannot inspect calculateScore: ' + e.message);
  }
}

/**
 * MIGRATION v2: Add override columns to WorkOrders sheet
 * - Defensive against trailing empty columns (getLastColumn() lies)
 * - Verifies write by reading back
 * - Safe to run multiple times (idempotent)
 */
function migrationAddOverrideColumns_v2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('WorkOrders');
  
  if (!sheet) {
    Logger.log('❌ ABORT: WorkOrders sheet not found');
    return;
  }
  
  Logger.log('═══════════════════════════════════════════════════');
  Logger.log('  MIGRATION: Add Override Columns to WorkOrders');
  Logger.log('═══════════════════════════════════════════════════');
  
  // Step 1: Read ACTUAL headers (filter out empty cells)
  var maxCol = sheet.getMaxColumns();
  var allHeaderCells = sheet.getRange(1, 1, 1, maxCol).getValues()[0];
  
  var headers = [];
  var lastRealCol = 0;
  for (var i = 0; i < allHeaderCells.length; i++) {
    var val = String(allHeaderCells[i] || '').trim();
    if (val !== '') {
      headers.push(val);
      lastRealCol = i + 1; // 1-indexed
    }
  }
  
  Logger.log('Detected ' + headers.length + ' real headers (last at col ' + lastRealCol + ')');
  Logger.log('Headers: ' + headers.join(', '));
  Logger.log('');
  
  // Step 2: Define new columns
  var newColumns = [
    'override_base_points_supervisor',
    'override_base_points_superintendent',
    'override_target_hours_supervisor',
    'override_target_hours_superintendent',
    'override_team_supervisor',
    'override_team_superintendent',
    'override_by_supervisor',
    'override_by_superintendent',
    'override_at_supervisor',
    'override_at_superintendent'
  ];
  
  // Step 3: Add missing columns
  var nextCol = lastRealCol + 1;
  var addedCount = 0;
  var skippedCount = 0;
  
  for (var j = 0; j < newColumns.length; j++) {
    var colName = newColumns[j];
    
    if (headers.indexOf(colName) !== -1) {
      Logger.log('⏭️  SKIP (already exists): ' + colName);
      skippedCount++;
    } else {
      sheet.getRange(1, nextCol).setValue(colName);
      Logger.log('✅ ADD at col ' + nextCol + ': ' + colName);
      headers.push(colName);
      nextCol++;
      addedCount++;
    }
  }
  
  // Step 4: Flush pending writes
  SpreadsheetApp.flush();
  
  Logger.log('');
  Logger.log('─── Summary ───');
  Logger.log('Added: ' + addedCount);
  Logger.log('Skipped (already there): ' + skippedCount);
  
  // Step 5: VERIFY by re-reading (this is the trustworthy check)
  Logger.log('');
  Logger.log('─── Verification (re-read after write) ───');
  
  var verifyCells = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
  var verifyHeaders = [];
  for (var v = 0; v < verifyCells.length; v++) {
    var vh = String(verifyCells[v] || '').trim();
    if (vh !== '') verifyHeaders.push(vh);
  }
  
  var allPresent = true;
  for (var k = 0; k < newColumns.length; k++) {
    var present = verifyHeaders.indexOf(newColumns[k]) !== -1;
    Logger.log((present ? '✅' : '❌') + ' ' + newColumns[k]);
    if (!present) allPresent = false;
  }
  
  Logger.log('');
  if (allPresent) {
    Logger.log('🎉 SUCCESS: All 10 override columns confirmed in sheet');
    Logger.log('Total real headers now: ' + verifyHeaders.length);
  } else {
    Logger.log('⚠️  WARNING: Some columns not verified — check sheet manually');
  }
  Logger.log('═══════════════════════════════════════════════════');
}




function debugUpdateRow() {
  var woId = 'WO-1779787023242-022';
  
  Logger.log('=== DEBUG UPDATE ROW ===');
  
  // Step 1: Cek apakah WO bisa ditemukan
  var wo = getRowById(SHEETS.WORK_ORDERS, woId, 'id');
  Logger.log('1. getRowById result: ' + (wo ? 'FOUND' : 'NOT FOUND'));
  if (wo) {
    Logger.log('   - id: ' + wo.id);
    Logger.log('   - status: ' + wo.status);
    Logger.log('   - wo_number: ' + wo.wo_number);
  }
  
  // Step 2: Cek canTransitionTo
  var canTransition = canTransitionTo(wo ? wo.status : null, WO_STATUS.PENDING_SUPERVISOR);
  Logger.log('2. canTransitionTo: ' + canTransition);
  
  // Step 3: Test updateRow dengan nilai dummy dulu
  var testUpdate = {
    actual_hours: 999.99
  };
  Logger.log('3. Attempting updateRow with test value actual_hours=999.99...');
  var result = updateRow(SHEETS.WORK_ORDERS, woId, testUpdate, 'id');
  Logger.log('4. updateRow returned: ' + result);
  
  // Step 4: Re-read untuk verify
  var woAfter = getRowById(SHEETS.WORK_ORDERS, woId, 'id');
  Logger.log('5. actual_hours after update: ' + (woAfter ? woAfter.actual_hours : 'NOT FOUND'));
  
  if (woAfter && String(woAfter.actual_hours) === '999.99') {
    Logger.log('✅ updateRow WORKS - bug is elsewhere');
    
    // Rollback test value
    updateRow(SHEETS.WORK_ORDERS, woId, {actual_hours: ''}, 'id');
    Logger.log('   Test value rolled back');
  } else {
    Logger.log('❌ updateRow BROKEN - cannot write to this row');
    Logger.log('   Returned: ' + result + ' but value not persisted');
  }
  
  Logger.log('=== END DEBUG ===');
}


/**
 * Migration: Add WO Others support
 * - Add COM-OTHERS row in Config_Components
 * - Add others_description & manual_unit_factor columns in WorkOrders
 * Idempotent - safe to run multiple times
 */
function migrationAddOthersJob_v1() {
  Log.separator('MIGRATION: Add WO Others Support');
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // ============ Part 1: Add COM-OTHERS to Config_Components ============
  var compSheet = ss.getSheetByName(SHEETS.CONFIG_COMPONENTS);
  if (!compSheet) {
    Log.error('migration', 'Config_Components sheet not found');
    return;
  }
  
  var compData = compSheet.getDataRange().getValues();
  var compHeaders = compData[0];
  var noIdx = compHeaders.indexOf('component_no');
  
  // Check if COM-OTHERS already exists
  var othersExists = false;
  for (var i = 1; i < compData.length; i++) {
    if (compData[i][noIdx] === 'COM-OTHERS') {
      othersExists = true;
      break;
    }
  }
  
  if (othersExists) {
    Log.info('migration', '✓ COM-OTHERS already exists in Config_Components');
  } else {
    // Build new row matching header order
    var newRow = [];
    for (var c = 0; c < compHeaders.length; c++) {
      var header = compHeaders[c];
      switch (header) {
        case 'component_no':    newRow.push('COM-OTHERS'); break;
        case 'component_name':  newRow.push('Others - Custom Job'); break;
        case 'category':        newRow.push('OTHERS'); break;
        case 'base_points':     newRow.push(0); break;
        case 'target_hours':    newRow.push(0); break;
        case 'is_active':       newRow.push(true); break;
        case 'created_at':      newRow.push(new Date()); break;
        case 'updated_at':      newRow.push(new Date()); break;
        default:                newRow.push(''); break;
      }
    }
    compSheet.appendRow(newRow);
    Log.info('migration', '✓ Added COM-OTHERS to Config_Components');
  }
  
  // ============ Part 2: Add columns to WorkOrders ============
  var woSheet = ss.getSheetByName(SHEETS.WORK_ORDERS);
  if (!woSheet) {
    Log.error('migration', 'WorkOrders sheet not found');
    return;
  }
  
  var woHeaders = woSheet.getRange(1, 1, 1, woSheet.getLastColumn()).getValues()[0];
  var newColumns = ['others_description', 'manual_unit_factor'];
  var lastCol = woSheet.getLastColumn();
  var addedCount = 0;
  
  for (var n = 0; n < newColumns.length; n++) {
    var colName = newColumns[n];
    if (woHeaders.indexOf(colName) === -1) {
      lastCol++;
      woSheet.getRange(1, lastCol).setValue(colName);
      Log.info('migration', '✓ Added column: ' + colName);
      addedCount++;
    } else {
      Log.info('migration', '✓ Column already exists: ' + colName);
    }
  }
  
  Log.info('migration', '=== MIGRATION COMPLETE ===');
  Log.info('migration', 'Components: ' + (othersExists ? 'unchanged' : 'added COM-OTHERS'));
  Log.info('migration', 'Columns added: ' + addedCount);
}