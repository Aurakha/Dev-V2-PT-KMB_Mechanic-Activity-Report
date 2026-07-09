/**
 * AUDIT: Verify all dependencies required by Override Approval feature
 * READ-ONLY — does not modify anything
 * Run from Apps Script editor: select function → Run ▶️
 */
function auditOverrideDependencies() {
  var results = {pass: [], fail: [], warn: []};
  
  function check(label, condition, isWarn) {
    if (condition) {
      results.pass.push(label);
    } else if (isWarn) {
      results.warn.push(label);
    } else {
      results.fail.push(label);
    }
  }
  
  function safeCheck(label, fn) {
    try { check(label, fn()); }
    catch (e) { results.fail.push(label + ' (threw: ' + e.message + ')'); }
  }
  
  Logger.log('═══════════════════════════════════════════════════');
  Logger.log('  OVERRIDE FEATURE — DEPENDENCY AUDIT');
  Logger.log('═══════════════════════════════════════════════════');
  
  // ─── 1. CONSTANTS ─────────────────────────────────────────
  safeCheck('Constants: ROLES.SUPERVISOR',       function() { return typeof ROLES !== 'undefined' && ROLES.SUPERVISOR; });
  safeCheck('Constants: ROLES.SUPERINTENDENT',   function() { return typeof ROLES !== 'undefined' && ROLES.SUPERINTENDENT; });
  safeCheck('Constants: ROLES.MECHANIC',         function() { return typeof ROLES !== 'undefined' && ROLES.MECHANIC; });
  safeCheck('Constants: SHEETS.WORK_ORDERS',     function() { return typeof SHEETS !== 'undefined' && SHEETS.WORK_ORDERS; });
  safeCheck('Constants: VALIDATION.MAX_BASE_POINTS',   function() { return typeof VALIDATION !== 'undefined' && VALIDATION.MAX_BASE_POINTS; });
  safeCheck('Constants: VALIDATION.MAX_TARGET_HOURS',  function() { return typeof VALIDATION !== 'undefined' && VALIDATION.MAX_TARGET_HOURS; });
  safeCheck('Constants: AUDIT_ACTIONS.OVERRIDE_FACTOR', function() { return typeof AUDIT_ACTIONS !== 'undefined' && AUDIT_ACTIONS.OVERRIDE_FACTOR; });
  
  // ERROR_CODES used by override code
  var requiredErrors = ['SYSTEM_INTERNAL_ERROR', 'AUTH_USER_NOT_FOUND', 'AUTH_PERMISSION_DENIED',
                        'VALIDATION_OUT_OF_RANGE', 'VALIDATION_REQUIRED', 'VALIDATION_PERCENTAGE_SUM_INVALID',
                        'DATA_NOT_FOUND', 'SYSTEM_SHEET_WRITE_FAILED'];
  for (var i = 0; i < requiredErrors.length; i++) {
    (function(code) {
      safeCheck('Constants: ERROR_CODES.' + code, function() {
        return typeof ERROR_CODES !== 'undefined' && ERROR_CODES[code];
      });
    })(requiredErrors[i]);
  }
  
  // ─── 2. FUNCTIONS (existence only — does NOT call them) ───
  var requiredFns = [
    'getComponentById', 'getUnitById', 'getMechanicById', 'getMechanicsByRole',
    'getCurrentUser', 'getCurrentUserWithRole', 'checkAuthorization',
    'getTeamMembers', 'getPendingApprovals', 'getWorkOrderById',
    'updateRow', 'logAuditAction',
    'isSuccess', 'isError', 'successResponse', 'errorResponse',
    'calculateScore'
  ];
  for (var j = 0; j < requiredFns.length; j++) {
    (function(name) {
      safeCheck('Function: ' + name + '()', function() {
        return typeof this[name] === 'function' || eval('typeof ' + name) === 'function';
      });
    })(requiredFns[j]);
  }
  
  // ─── 3. LOGGER HELPERS ─────────────────────────────────────
  safeCheck('Log.startTimer',  function() { return typeof Log !== 'undefined' && typeof Log.startTimer === 'function'; });
  safeCheck('Log.info',        function() { return typeof Log !== 'undefined' && typeof Log.info === 'function'; });
  safeCheck('Log.warn',        function() { return typeof Log !== 'undefined' && typeof Log.warn === 'function'; });
  safeCheck('Log.exception',   function() { return typeof Log !== 'undefined' && typeof Log.exception === 'function'; });
  
  // ─── 4. SHEET EXISTS ───────────────────────────────────────
  safeCheck('Sheet "WorkOrders" exists', function() {
    return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WorkOrders') !== null;
  });
  
  // ─── 5. MIGRATION STATE (informational) ────────────────────
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WorkOrders');
    if (sheet) {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var migrated = headers.indexOf('override_base_points_supervisor') !== -1;
      check('Migration: override columns already added', migrated, true);
    }
  } catch (e) {}
  
  // ─── REPORT ────────────────────────────────────────────────
  Logger.log('');
  Logger.log('─── PASS (' + results.pass.length + ') ───');
  for (var p = 0; p < results.pass.length; p++) Logger.log('  ✅ ' + results.pass[p]);
  
  if (results.warn.length > 0) {
    Logger.log('');
    Logger.log('─── INFO (' + results.warn.length + ') ───');
    for (var w = 0; w < results.warn.length; w++) Logger.log('  ℹ️  ' + results.warn[w]);
  }
  
  Logger.log('');
  Logger.log('─── FAIL (' + results.fail.length + ') ───');
  if (results.fail.length === 0) {
    Logger.log('  🎉 No missing dependencies — safe to proceed to Step 1 (migration)');
  } else {
    for (var f = 0; f < results.fail.length; f++) Logger.log('  ❌ ' + results.fail[f]);
    Logger.log('');
    Logger.log('  ⚠️  DO NOT apply override code until failures are resolved.');
  }
  
  Logger.log('═══════════════════════════════════════════════════');
}