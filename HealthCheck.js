/**
 * ============================================================================
 * HealthCheck.gs - System Health Verification
 * ============================================================================
 * 
 * Comprehensive health check untuk verify system readiness:
 * - All 13 sheets exist
 * - Schema integrity (required columns present)
 * - Config data not empty (components, units, mechanics, factors, settings)
 * - Auth working (can detect current user)
 * - Lock service available
 * - Read/write permissions OK
 * 
 * Usage:
 *   var health = runHealthCheck();
 *   if (!health.healthy) { ... handle issues ... }
 * 
 * Dependencies: All other foundation files (Constants, Logger, Sheets, ConfigService, Auth)
 * ============================================================================
 */

// ============================================================================
// EXPECTED SCHEMAS (untuk validation)
// ============================================================================

var EXPECTED_SCHEMAS = {
  'Config_Components': ['component_no', 'component_name', 'category', 'base_points', 'target_hours', 'default_team_size', 'notes'],
  'Config_Units': ['unit_id', 'unit_name', 'unit_type', 'unit_factor', 'is_active'],
  'Config_Mechanics': ['mechanic_id', 'mechanic_name', 'email', 'role', 'is_active'],
  'Config_Factors': ['factor_type', 'factor_key', 'factor_value', 'description'],
  'Config_BaseSettings': ['setting_key', 'setting_value', 'description'],
  'Config_Jobs_Field': ['job_id', 'unit_model', 'component', 'sub_component', 'job_description', 'plan_hours', 'base_point', 'job_type', 'is_active'],
  'Config_Jobs_Workshop': ['job_id', 'unit_model', 'component', 'sub_component', 'job_description', 'plan_hours', 'base_point', 'job_type', 'is_active'],
  
  'WorkOrders': ['id', 'wo_number', 'component_id', 'unit_id', 'status', 'created_by', 'created_at'],
  'WorkOrderTeam': ['id', 'wo_id', 'mechanic_id', 'percentage', 'is_lead'],
  'Approvals': ['id', 'wo_id', 'stage', 'decision', 'approver_email', 'approved_at'],
  'ScoringSnapshots': ['id', 'wo_id', 'base_points', 'unit_factor', 'work_condition_factor', 'timeliness_factor', 'safety_factor', 'mtbf_factor', 'final_score', 'created_at'],
  'MechanicPoints': ['id', 'mechanic_id', 'wo_id', 'points', 'idr_value', 'awarded_at'],
  'OthersJobRequests': ['id', 'job_description', 'requested_by', 'status', 'created_at'],
  'AuditLogs': ['id', 'action', 'entity_type', 'entity_id', 'user_email', 'details', 'timestamp'],
  'MtbfTracking': ['id', 'wo_id', 'mtbf_start_date', 'mtbf_expiry_date', 'status']
};

// ============================================================================
// MAIN HEALTH CHECK
// ============================================================================

/**
 * Run comprehensive health check
 * @return {Object} {
 *   healthy: boolean,
 *   checks: Array<Object>,
 *   summary: {total, passed, failed, warnings},
 *   timestamp: string,
 *   recommendation: string
 * }
 */
function runHealthCheck() {
  var timer = Log.startTimer('runHealthCheck');
  
  Log.separator('🏥 SYSTEM HEALTH CHECK');
  
  var checks = [];
  
  // Run all checks
  checks.push(checkSpreadsheetAccess());
  checks.push(checkAllSheetsExist());
  checks.push(checkSheetSchemas());
  checks.push(checkConfigDataPresent());
  checks.push(checkConfigCounts());
  checks.push(checkFactorsValid());
  checks.push(checkSettingsValid());
  checks.push(checkAuthService());
  checks.push(checkLockService());
  checks.push(checkReadPermissions());
  checks.push(checkWritePermissions());
  
  // Calculate summary
  var summary = {
    total: checks.length,
    passed: 0,
    failed: 0,
    warnings: 0
  };
  
  for (var i = 0; i < checks.length; i++) {
    if (checks[i].status === 'PASS') summary.passed++;
    else if (checks[i].status === 'FAIL') summary.failed++;
    else if (checks[i].status === 'WARN') summary.warnings++;
  }
  
  var healthy = summary.failed === 0;
  
  var recommendation;
  if (healthy && summary.warnings === 0) {
    recommendation = '✅ System fully operational. Ready for production use.';
  } else if (healthy && summary.warnings > 0) {
    recommendation = '⚠️ System operational with warnings. Review warnings before production.';
  } else {
    recommendation = '❌ System has critical failures. Fix failed checks before proceeding.';
  }
  
  // Print report
  printHealthReport(checks, summary, healthy, recommendation);
  
  timer.end('Health check complete', summary);
  
  return {
    healthy: healthy,
    checks: checks,
    summary: summary,
    timestamp: nowISO(),
    recommendation: recommendation
  };
}

// ============================================================================
// INDIVIDUAL CHECKS
// ============================================================================

function checkSpreadsheetAccess() {
  try {
    var ss = getSpreadsheet();
    if (!ss) {
      return createCheck('Spreadsheet Access', 'FAIL', 'Cannot access spreadsheet');
    }
    
    var name = ss.getName();
    return createCheck('Spreadsheet Access', 'PASS', 'Spreadsheet: ' + name, {name: name});
  } catch (e) {
    return createCheck('Spreadsheet Access', 'FAIL', e.message);
  }
}

function checkAllSheetsExist() {
  try {
    var missing = [];
    
    for (var i = 0; i < ALL_SHEETS.length; i++) {
      if (!sheetExists(ALL_SHEETS[i])) {
        missing.push(ALL_SHEETS[i]);
      }
    }
    
    if (missing.length > 0) {
      return createCheck(
        'All Sheets Exist',
        'FAIL',
        'Missing sheets: ' + missing.join(', '),
        {missing: missing, expected: ALL_SHEETS.length}
      );
    }
    
    return createCheck(
      'All Sheets Exist',
      'PASS',
      'All ' + ALL_SHEETS.length + ' sheets present',
      {count: ALL_SHEETS.length}
    );
  } catch (e) {
    return createCheck('All Sheets Exist', 'FAIL', e.message);
  }
}

function checkSheetSchemas() {
  try {
    var issues = [];
    
    for (var sheetName in EXPECTED_SCHEMAS) {
      if (!EXPECTED_SCHEMAS.hasOwnProperty(sheetName)) continue;
      
      var expectedHeaders = EXPECTED_SCHEMAS[sheetName];
      var validation = validateSheetSchema(sheetName, expectedHeaders);
      
      if (!validation.valid) {
        issues.push({
          sheet: sheetName,
          issue: validation.error,
          missing: validation.missing
        });
      }
    }
    
    if (issues.length > 0) {
      return createCheck(
        'Schema Integrity',
        'FAIL',
        issues.length + ' sheet(s) have schema issues',
        {issues: issues}
      );
    }
    
    return createCheck(
      'Schema Integrity',
      'PASS',
      'All sheet schemas valid',
      {sheetsChecked: Object.keys(EXPECTED_SCHEMAS).length}
    );
  } catch (e) {
    return createCheck('Schema Integrity', 'FAIL', e.message);
  }
}

function checkConfigDataPresent() {
  try {
    var components = loadComponents();
    var units = loadUnits();
    var mechanics = loadMechanics();
    var factors = loadFactors();
    var settings = loadSettings();
    
    var issues = [];
    
    if (components.length === 0) issues.push('No components');
    if (units.length === 0) issues.push('No units');
    if (mechanics.length === 0) issues.push('No mechanics');
    if (Object.keys(factors.work_condition).length === 0) issues.push('No factors');
    if (Object.keys(settings).length === 0) issues.push('No settings');
    
    if (issues.length > 0) {
      return createCheck(
        'Config Data Present',
        'FAIL',
        'Empty config: ' + issues.join(', '),
        {issues: issues}
      );
    }
    
    return createCheck('Config Data Present', 'PASS', 'All config tables populated');
  } catch (e) {
    return createCheck('Config Data Present', 'FAIL', e.message);
  }
}

function checkConfigCounts() {
  try {
    var components = loadComponents();
    var units = loadUnits();
    var mechanics = loadMechanics();
    
    var details = {
      components: components.length,
      units: units.length,
      mechanics: mechanics.length,
      mechanicsByRole: {
        mechanic: getMechanicsByRole(ROLES.MECHANIC).length,
        supervisor: getMechanicsByRole(ROLES.SUPERVISOR).length,
        superintendent: getMechanicsByRole(ROLES.SUPERINTENDENT).length
      }
    };
    
    // Check expected counts (seeded data)
    var warnings = [];
    if (components.length !== 94) warnings.push('Components: ' + components.length + ' (expected 94)');
    if (units.length !== 4) warnings.push('Units: ' + units.length + ' (expected 4)');
    if (mechanics.length !== 17) warnings.push('Mechanics: ' + mechanics.length + ' (expected 17)');
    
    if (warnings.length > 0) {
      return createCheck(
        'Config Counts',
        'WARN',
        'Counts differ from expected: ' + warnings.join('; '),
        details
      );
    }
    
    return createCheck('Config Counts', 'PASS', 'All counts match expected', details);
  } catch (e) {
    return createCheck('Config Counts', 'FAIL', e.message);
  }
}

function checkFactorsValid() {
  try {
    var factors = loadFactors();
    
    var requiredFactors = {
      work_condition: ['normal', 'difficult', 'extreme'],
      timeliness: ['on_time', 'late', 'way_late'],
      safety: ['no_incident', 'incident'],
      mtbf: ['redo', 'first_time']
    };
    
    var missing = [];
    
    for (var type in requiredFactors) {
      if (!factors[type]) {
        missing.push(type + ' (entire type)');
        continue;
      }
      
      var keys = requiredFactors[type];
      for (var i = 0; i < keys.length; i++) {
        if (factors[type][keys[i]] === undefined) {
          missing.push(type + '.' + keys[i]);
        }
      }
    }
    
    if (missing.length > 0) {
      return createCheck(
        'Factors Valid',
        'FAIL',
        'Missing factors: ' + missing.join(', '),
        {missing: missing}
      );
    }
    
    // Sanity check values
    var warnings = [];
    if (factors.safety.incident !== 0) warnings.push('safety.incident should be 0');
    if (factors.work_condition.normal !== 1.0) warnings.push('work_condition.normal should be 1.0');
    
    if (warnings.length > 0) {
      return createCheck(
        'Factors Valid',
        'WARN',
        'Unusual values: ' + warnings.join('; '),
        {factors: factors, warnings: warnings}
      );
    }
    
    return createCheck('Factors Valid', 'PASS', 'All factors present with sensible values', {factors: factors});
  } catch (e) {
    return createCheck('Factors Valid', 'FAIL', e.message);
  }
}

function checkSettingsValid() {
  try {
    var settings = loadSettings();
    
    var requiredSettings = ['mtbf_threshold_hours', 'idr_rate', 'points_to_idr_multiplier'];
    var missing = [];
    
    for (var i = 0; i < requiredSettings.length; i++) {
      if (settings[requiredSettings[i]] === undefined || settings[requiredSettings[i]] === null) {
        missing.push(requiredSettings[i]);
      }
    }
    
    if (missing.length > 0) {
      return createCheck(
        'Settings Valid',
        'FAIL',
        'Missing settings: ' + missing.join(', '),
        {missing: missing}
      );
    }
    
    // Sanity check values
    var warnings = [];
    if (settings.mtbf_threshold_hours <= 0) warnings.push('mtbf_threshold_hours invalid');
    if (settings.idr_rate <= 0) warnings.push('idr_rate invalid');
    
    if (warnings.length > 0) {
      return createCheck('Settings Valid', 'WARN', warnings.join('; '), {settings: settings});
    }
    
    return createCheck('Settings Valid', 'PASS', 'All settings present', {settings: settings});
  } catch (e) {
    return createCheck('Settings Valid', 'FAIL', e.message);
  }
}

function checkAuthService() {
  try {
    var email = getCurrentUser();
    
    if (!email) {
      return createCheck(
        'Auth Service',
        'WARN',
        'No active user session (this is normal in trigger context)',
        {note: 'Session.getActiveUser() returned no email'}
      );
    }
    
    var user = getCurrentUserWithRole();
    
    if (!user.registered) {
      return createCheck(
        'Auth Service',
        'WARN',
        'Current user not registered in Config_Mechanics',
        {email: email, registered: false}
      );
    }
    
    return createCheck(
      'Auth Service',
      'PASS',
      'Auth working. Current user: ' + email + ' (' + user.role + ')',
      {email: email, role: user.role, mechanic_id: user.mechanic_id}
    );
  } catch (e) {
    return createCheck('Auth Service', 'FAIL', e.message);
  }
}

function checkLockService() {
  try {
    var lock = LockService.getScriptLock();
    
    if (!lock) {
      return createCheck('Lock Service', 'FAIL', 'Cannot get script lock');
    }
    
    // Try acquire and release
    var acquired = lock.tryLock(1000);
    
    if (!acquired) {
      return createCheck(
        'Lock Service',
        'WARN',
        'Could not acquire lock within 1s (may be in use by another execution)',
        {timeoutMs: 1000}
      );
    }
    
    lock.releaseLock();
    
    return createCheck('Lock Service', 'PASS', 'LockService available and functional');
  } catch (e) {
    return createCheck('Lock Service', 'FAIL', e.message);
  }
}

function checkReadPermissions() {
  try {
    var data = readSheet(SHEETS.CONFIG_COMPONENTS);
    
    if (data.length === 0) {
      return createCheck('Read Permissions', 'WARN', 'Read returned empty (config may be empty)');
    }
    
    return createCheck('Read Permissions', 'PASS', 'Can read from spreadsheet', {sampleRowCount: data.length});
  } catch (e) {
    return createCheck('Read Permissions', 'FAIL', 'Cannot read: ' + e.message);
  }
}

function checkWritePermissions() {
  try {
    // Test by trying to append + delete a test row to AuditLogs
    var testId = 'HEALTH-CHECK-' + new Date().getTime();
    var testRow = {
      id: testId,
      action: 'health_check',
      entity_type: 'system',
      entity_id: 'self',
      user_email: 'system',
      details: 'Health check test write',
      timestamp: new Date()
    };
    
    var rowNum = appendRow(SHEETS.AUDIT_LOGS, testRow);
    
    if (!rowNum) {
      return createCheck('Write Permissions', 'FAIL', 'Cannot write to AuditLogs');
    }
    
    // Clean up test row
    var deleted = deleteRow(SHEETS.AUDIT_LOGS, testId, 'id');
    
    if (!deleted) {
      return createCheck(
        'Write Permissions',
        'WARN',
        'Write OK but cleanup failed (test row may remain in AuditLogs)',
        {testId: testId}
      );
    }
    
    return createCheck('Write Permissions', 'PASS', 'Can write and delete (test row cleaned up)');
  } catch (e) {
    return createCheck('Write Permissions', 'FAIL', e.message);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function createCheck(name, status, message, details) {
  return {
    name: name,
    status: status,
    message: message,
    details: details || null,
    timestamp: nowISO()
  };
}

function printHealthReport(checks, summary, healthy, recommendation) {
  Log.separator('🏥 HEALTH CHECK REPORT');
  
  Log.section('Individual Checks');
  for (var i = 0; i < checks.length; i++) {
    var check = checks[i];
    var emoji = check.status === 'PASS' ? '✅' : check.status === 'WARN' ? '⚠️' : '❌';
    Log.info('health', emoji + ' [' + check.status + '] ' + check.name + ': ' + check.message);
  }
  
  Log.section('Summary');
  Log.info('health', 'Total: ' + summary.total);
  Log.info('health', '  ✅ Passed: ' + summary.passed);
  Log.info('health', '  ⚠️  Warnings: ' + summary.warnings);
  Log.info('health', '  ❌ Failed: ' + summary.failed);
  Log.info('health', '');
  Log.info('health', 'Overall: ' + (healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'));
  Log.info('health', recommendation);
  
  Log.separator();
}

// ============================================================================
// QUICK HEALTH CHECK (faster, less comprehensive)
// ============================================================================

/**
 * Quick health check (untuk frequent calls)
 * Only checks critical items
 * @return {Object}
 */
function quickHealthCheck() {
  try {
    var checks = [
      checkSpreadsheetAccess(),
      checkAllSheetsExist(),
      checkConfigDataPresent()
    ];
    
    var failed = 0;
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].status === 'FAIL') failed++;
    }
    
    return {
      healthy: failed === 0,
      checks: checks
    };
  } catch (e) {
    return {
      healthy: false,
      error: e.message
    };
  }
}

// ============================================================================
// SYSTEM INFO (untuk debugging)
// ============================================================================

/**
 * Get comprehensive system info
 * @return {Object}
 */
function getSystemInfo() {
  try {
    var info = {
      timestamp: nowISO(),
      spreadsheet: null,
      sheets: {},
      config: null,
      currentUser: null
    };
    
    // Spreadsheet info
    var ss = getSpreadsheet();
    if (ss) {
      info.spreadsheet = {
        name: ss.getName(),
        id: ss.getId(),
        url: ss.getUrl()
      };
    }
    
    // Sheet row counts
    for (var i = 0; i < ALL_SHEETS.length; i++) {
      var sheetName = ALL_SHEETS[i];
      info.sheets[sheetName] = {
        exists: sheetExists(sheetName),
        rows: getRowCount(sheetName)
      };
    }
    
    // Config summary
    info.config = getConfigSummary();
    
    // Current user
    info.currentUser = getCurrentUserWithRole();
    
    return info;
  } catch (e) {
    Log.exception('getSystemInfo', e);
    return {error: e.message};
  }
}

/**
 * Print system info to logs (for easy debugging)
 */
function printSystemInfo() {
  var info = getSystemInfo();
  
  Log.separator('📊 SYSTEM INFO');
  
  if (info.spreadsheet) {
    Log.section('Spreadsheet');
    Log.info('info', 'Name: ' + info.spreadsheet.name);
    Log.info('info', 'ID: ' + info.spreadsheet.id);
    Log.info('info', 'URL: ' + info.spreadsheet.url);
  }
  
  Log.section('Sheets');
  for (var sheetName in info.sheets) {
    var s = info.sheets[sheetName];
    Log.info('info', '  ' + sheetName + ': ' + (s.exists ? '✅' : '❌') + ' (' + s.rows + ' rows)');
  }
  
  if (info.config) {
    Log.section('Config Summary');
    Log.info('info', 'Components: ' + info.config.components_count);
    Log.info('info', 'Units: ' + info.config.units_count);
    Log.info('info', 'Mechanics: ' + info.config.mechanics_count);
    Log.info('info', '  - Mechanics: ' + info.config.mechanics_by_role.mechanic);
    Log.info('info', '  - Supervisors: ' + info.config.mechanics_by_role.supervisor);
    Log.info('info', '  - Superintendents: ' + info.config.mechanics_by_role.superintendent);
  }
  
  if (info.currentUser) {
    Log.section('Current User');
    Log.info('info', 'Email: ' + info.currentUser.email);
    Log.info('info', 'Role: ' + info.currentUser.role);
    Log.info('info', 'Mechanic ID: ' + info.currentUser.mechanic_id);
  }
  
  Log.separator();
}

// ============================================================================
// TESTING
// ============================================================================

/**
 * Test HealthCheck (runs main health check)
 */
function testHealthCheck() {
  var result = runHealthCheck();
  
  if (result.healthy) {
    Log.info('test', '🎉 System is healthy!');
  } else {
    Log.error('test', '⚠️ System has issues. See report above.');
  }
  
  return result;
}