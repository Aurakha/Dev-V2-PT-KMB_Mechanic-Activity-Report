/**
 * ============================================================================
 * AuditService.gs - Comprehensive Audit Trail
 * ============================================================================
 * 
 * Production-grade audit logging untuk track semua actions di sistem:
 * - WO creation, status changes, completion
 * - Approval decisions (approve/reject)
 * - Factor overrides (work condition, timeliness, MTBF)
 * - Team distribution changes
 * - Safety incidents
 * - Others job submissions
 * 
 * ALL write operations MUST log to audit trail.
 * Audit logs are IMMUTABLE - never edited or deleted.
 * 
 * Dependencies: Constants.gs, Logger.gs, Sheets.gs, Auth.gs, Utils.gs
 * ============================================================================
 */

// ============================================================================
// CORE AUDIT LOGGING
// ============================================================================

/**
 * Log any action to audit trail
 * Generic function - use specific helpers below for common actions
 * 
 * @param {string} action - Action type (from AUDIT_ACTIONS)
 * @param {string} entityType - Entity type ('work_order', 'approval', etc)
 * @param {string} entityId - Entity ID
 * @param {string} userEmail - User email (optional, uses current user)
 * @param {Object} details - Additional details (will be JSON stringified)
 * @return {Object} Response {success, data: {auditLogId}}
 */
function logAuditAction(action, entityType, entityId, userEmail, details) {
  var timer = Log.startTimer('logAuditAction');
  
  try {
    // Validation
    var validationError = requireField(action, 'action');
    if (validationError) return validationError;
    
    validationError = requireField(entityType, 'entityType');
    if (validationError) return validationError;
    
    // Get user email (current user if not provided)
    if (!userEmail) {
      userEmail = getCurrentUser();
    }
    
    if (!userEmail) {
      Log.warn('logAuditAction', 'No user email available', {action: action});
      userEmail = 'system';
    }
    
    // Generate audit log ID
    var auditLogId = generateId(ID_PREFIXES.AUDIT_LOG);
    
    // Prepare audit log entry
    var auditLog = {
      id: auditLogId,
      action: action,
      entity_type: entityType,
      entity_id: entityId || null,
      user_email: userEmail,
      details: details ? JSON.stringify(details) : null,
      timestamp: new Date()
    };
    
    // Write to AuditLogs sheet
    var rowNum = appendRow(SHEETS.AUDIT_LOGS, auditLog);
    
    if (!rowNum) {
      Log.error('logAuditAction', 'Failed to write audit log', {action: action});
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to write audit log');
    }
    
    timer.end('Audit logged', {action: action, entityType: entityType, entityId: entityId});
    
    return successResponse({auditLogId: auditLogId});
    
  } catch (e) {
    Log.exception('logAuditAction', e, {action: action});
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// WORK ORDER AUDIT LOGS
// ============================================================================

/**
 * Log WO creation
 */
function logWoCreated(woId, createdBy, woData) {
  return logAuditAction(
    AUDIT_ACTIONS.CREATE_WO,
    'work_order',
    woId,
    createdBy,
    {
      wo_number: woData.wo_number,
      component_id: woData.component_id,
      unit_id: woData.unit_id,
      team_size: woData.team_size || 1
    }
  );
}

/**
 * Log WO status change
 */
function logWoStatusChange(woId, fromStatus, toStatus, changedBy, reason) {
  return logAuditAction(
    'wo_status_change',
    'work_order',
    woId,
    changedBy,
    {
      from_status: fromStatus,
      to_status: toStatus,
      reason: reason || null
    }
  );
}

/**
 * Log WO started
 */
function logWoStarted(woId, startedBy) {
  return logAuditAction(
    AUDIT_ACTIONS.START_WO,
    'work_order',
    woId,
    startedBy,
    {started_at: new Date()}
  );
}

/**
 * Log WO finished
 */
function logWoFinished(woId, finishedBy, actualHours, workCondition, hasSafetyIncident) {
  return logAuditAction(
    AUDIT_ACTIONS.FINISH_WO,
    'work_order',
    woId,
    finishedBy,
    {
      actual_hours: actualHours,
      work_condition: workCondition,
      has_safety_incident: hasSafetyIncident,
      finished_at: new Date()
    }
  );
}

// ============================================================================
// APPROVAL AUDIT LOGS
// ============================================================================

/**
 * Log supervisor approval
 */
function logSupervisorApprove(woId, approverEmail, notes) {
  return logAuditAction(
    AUDIT_ACTIONS.SUPERVISOR_APPROVE,
    'work_order',
    woId,
    approverEmail,
    {
      stage: APPROVAL_STAGES.SUPERVISOR,
      decision: APPROVAL_DECISIONS.APPROVE,
      notes: notes || null,
      approved_at: new Date()
    }
  );
}

/**
 * Log supervisor rejection
 */
function logSupervisorReject(woId, approverEmail, rejectionReason) {
  return logAuditAction(
    AUDIT_ACTIONS.SUPERVISOR_REJECT,
    'work_order',
    woId,
    approverEmail,
    {
      stage: APPROVAL_STAGES.SUPERVISOR,
      decision: APPROVAL_DECISIONS.REJECT,
      reason: rejectionReason,
      rejected_at: new Date()
    }
  );
}

/**
 * Log superintendent approval
 */
function logSuperintendentApprove(woId, approverEmail, notes) {
  return logAuditAction(
    AUDIT_ACTIONS.SUPERINTENDENT_APPROVE,
    'work_order',
    woId,
    approverEmail,
    {
      stage: APPROVAL_STAGES.SUPERINTENDENT,
      decision: APPROVAL_DECISIONS.APPROVE,
      notes: notes || null,
      approved_at: new Date()
    }
  );
}

/**
 * Log superintendent rejection
 */
function logSuperintendentReject(woId, approverEmail, rejectionReason) {
  return logAuditAction(
    AUDIT_ACTIONS.SUPERINTENDENT_REJECT,
    'work_order',
    woId,
    approverEmail,
    {
      stage: APPROVAL_STAGES.SUPERINTENDENT,
      decision: APPROVAL_DECISIONS.REJECT,
      reason: rejectionReason,
      rejected_at: new Date()
    }
  );
}

// ============================================================================
// OVERRIDE AUDIT LOGS
// ============================================================================

/**
 * Log factor override (work condition, timeliness, etc)
 */
function logFactorOverride(woId, factorType, oldValue, newValue, overrideBy, reason) {
  return logAuditAction(
    AUDIT_ACTIONS.OVERRIDE_FACTOR,
    'work_order',
    woId,
    overrideBy,
    {
      factor_type: factorType,
      old_value: oldValue,
      new_value: newValue,
      reason: reason,
      overridden_at: new Date()
    }
  );
}

/**
 * Log MTBF status override
 */
function logMtbfOverride(woId, oldStatus, newStatus, overrideBy, reason) {
  return logAuditAction(
    AUDIT_ACTIONS.OVERRIDE_MTBF,
    'work_order',
    woId,
    overrideBy,
    {
      old_mtbf_status: oldStatus,
      new_mtbf_status: newStatus,
      reason: reason,
      overridden_at: new Date()
    }
  );
}

/**
 * Log team distribution change
 */
function logTeamDistributionChange(woId, oldDistribution, newDistribution, changedBy) {
  return logAuditAction(
    AUDIT_ACTIONS.ADJUST_TEAM_DISTRIBUTION,
    'work_order',
    woId,
    changedBy,
    {
      old_distribution: oldDistribution,
      new_distribution: newDistribution,
      changed_at: new Date()
    }
  );
}

// ============================================================================
// SAFETY INCIDENT AUDIT
// ============================================================================

/**
 * Log safety incident
 */
function logSafetyIncident(woId, incidentDetails, reportedBy) {
  return logAuditAction(
    'safety_incident',
    'work_order',
    woId,
    reportedBy,
    {
      incident_description: incidentDetails,
      reported_at: new Date(),
      severity: 'critical'
    }
  );
}

// ============================================================================
// OTHERS JOB AUDIT LOGS
// ============================================================================

/**
 * Log others job submission
 */
function logOthersJobSubmit(othersJobId, requestedBy, jobDescription) {
  return logAuditAction(
    AUDIT_ACTIONS.OTHERS_JOB_SUBMIT,
    'others_job',
    othersJobId,
    requestedBy,
    {
      job_description: truncate(jobDescription, 200),
      submitted_at: new Date()
    }
  );
}

/**
 * Log others job approval
 */
function logOthersJobApprove(othersJobId, approverEmail) {
  return logAuditAction(
    AUDIT_ACTIONS.OTHERS_JOB_APPROVE,
    'others_job',
    othersJobId,
    approverEmail,
    {
      decision: APPROVAL_DECISIONS.APPROVE,
      approved_at: new Date()
    }
  );
}

/**
 * Log others job rejection
 */
function logOthersJobReject(othersJobId, approverEmail, rejectionReason) {
  return logAuditAction(
    AUDIT_ACTIONS.OTHERS_JOB_REJECT,
    'others_job',
    othersJobId,
    approverEmail,
    {
      decision: APPROVAL_DECISIONS.REJECT,
      reason: rejectionReason,
      rejected_at: new Date()
    }
  );
}

// ============================================================================
// AUDIT QUERIES
// ============================================================================

/**
 * Get audit logs by entity
 * @param {string} entityType
 * @param {string} entityId
 * @param {number} limit - Max results (default 100)
 * @return {Object} Response {success, data: auditLogs[]}
 */
function getAuditLogsByEntity(entityType, entityId, limit) {
  var timer = Log.startTimer('getAuditLogsByEntity');
  
  try {
    limit = limit || 100;
    
    var allLogs = readSheetAsObjects(SHEETS.AUDIT_LOGS);
    var filtered = [];
    
    for (var i = 0; i < allLogs.length; i++) {
      var log = allLogs[i];
      
      if (log.entity_type === entityType && log.entity_id === entityId) {
        // Parse details JSON
        if (log.details) {
          try {
            log.details_parsed = JSON.parse(log.details);
          } catch (e) {
            log.details_parsed = null;
          }
        }
        
        filtered.push(log);
      }
      
      if (filtered.length >= limit) break;
    }
    
    // Sort by timestamp descending (newest first)
    filtered.sort(function(a, b) {
      var timeA = parseDate(a.timestamp);
      var timeB = parseDate(b.timestamp);
      if (!timeA || !timeB) return 0;
      return timeB.getTime() - timeA.getTime();
    });
    
    timer.end('Query complete', {entityType: entityType, entityId: entityId, found: filtered.length});
    
    return successResponse(filtered, {count: filtered.length});
    
  } catch (e) {
    Log.exception('getAuditLogsByEntity', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Get audit logs by user
 */
function getAuditLogsByUser(userEmail, limit) {
  var timer = Log.startTimer('getAuditLogsByUser');
  
  try {
    limit = limit || 100;
    
    var allLogs = readSheetAsObjects(SHEETS.AUDIT_LOGS);
    var filtered = [];
    
    for (var i = 0; i < allLogs.length; i++) {
      var log = allLogs[i];
      
      if (log.user_email && log.user_email.toLowerCase() === userEmail.toLowerCase()) {
        if (log.details) {
          try {
            log.details_parsed = JSON.parse(log.details);
          } catch (e) {
            log.details_parsed = null;
          }
        }
        
        filtered.push(log);
      }
      
      if (filtered.length >= limit) break;
    }
    
    filtered.sort(function(a, b) {
      var timeA = parseDate(a.timestamp);
      var timeB = parseDate(b.timestamp);
      if (!timeA || !timeB) return 0;
      return timeB.getTime() - timeA.getTime();
    });
    
    timer.end('Query complete', {userEmail: userEmail, found: filtered.length});
    
    return successResponse(filtered, {count: filtered.length});
    
  } catch (e) {
    Log.exception('getAuditLogsByUser', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Get audit logs by action type
 */
function getAuditLogsByAction(action, limit) {
  var timer = Log.startTimer('getAuditLogsByAction');
  
  try {
    limit = limit || 100;
    
    var allLogs = readSheetAsObjects(SHEETS.AUDIT_LOGS);
    var filtered = [];
    
    for (var i = 0; i < allLogs.length; i++) {
      var log = allLogs[i];
      
      if (log.action === action) {
        if (log.details) {
          try {
            log.details_parsed = JSON.parse(log.details);
          } catch (e) {
            log.details_parsed = null;
          }
        }
        
        filtered.push(log);
      }
      
      if (filtered.length >= limit) break;
    }
    
    filtered.sort(function(a, b) {
      var timeA = parseDate(a.timestamp);
      var timeB = parseDate(b.timestamp);
      if (!timeA || !timeB) return 0;
      return timeB.getTime() - timeA.getTime();
    });
    
    timer.end('Query complete', {action: action, found: filtered.length});
    
    return successResponse(filtered, {count: filtered.length});
    
  } catch (e) {
    Log.exception('getAuditLogsByAction', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Get complete audit trail for a work order
 * Returns all audit logs for a specific WO, sorted chronologically
 */
function getWoAuditTrail(woId) {
  return getAuditLogsByEntity('work_order', woId, 500);
}

/**
 * Get override audit trail (all factor/MTBF overrides)
 */
function getOverrideAuditTrail(limit) {
  var timer = Log.startTimer('getOverrideAuditTrail');
  
  try {
    limit = limit || 100;
    
    var allLogs = readSheetAsObjects(SHEETS.AUDIT_LOGS);
    var filtered = [];
    
    var overrideActions = [
      AUDIT_ACTIONS.OVERRIDE_FACTOR,
      AUDIT_ACTIONS.OVERRIDE_MTBF,
      AUDIT_ACTIONS.ADJUST_TEAM_DISTRIBUTION
    ];
    
    for (var i = 0; i < allLogs.length; i++) {
      var log = allLogs[i];
      
      if (overrideActions.indexOf(log.action) !== -1) {
        if (log.details) {
          try {
            log.details_parsed = JSON.parse(log.details);
          } catch (e) {
            log.details_parsed = null;
          }
        }
        
        filtered.push(log);
      }
      
      if (filtered.length >= limit) break;
    }
    
    filtered.sort(function(a, b) {
      var timeA = parseDate(a.timestamp);
      var timeB = parseDate(b.timestamp);
      if (!timeA || !timeB) return 0;
      return timeB.getTime() - timeA.getTime();
    });
    
    timer.end('Query complete', {found: filtered.length});
    
    return successResponse(filtered, {count: filtered.length});
    
  } catch (e) {
    Log.exception('getOverrideAuditTrail', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Get safety incident audit log
 */
function getSafetyIncidentAuditLog(limit) {
  return getAuditLogsByAction('safety_incident', limit || 100);
}

// ============================================================================
// TESTING
// ============================================================================

/**
 * Test AuditService functions
 */
function testAuditService() {
  Log.separator('Testing AuditService.gs');
  
  var passed = 0;
  var failed = 0;
  
  function assert(condition, name) {
    if (condition) { Log.info('test', '✅ ' + name); passed++; }
    else { Log.error('test', '❌ ' + name); failed++; }
  }
  
  function tryTest(name, fn) {
    try { fn(); }
    catch (e) { Log.error('test', '❌ ' + name + ' ERROR: ' + e.message); failed++; }
  }
  
  // Test basic audit logging
  Log.section('Basic Audit Logging');
  
  tryTest('logAuditAction', function() {
    var result = logAuditAction('test_action', 'test_entity', 'TEST-123', 'test@company.com', {note: 'test'});
    assert(isSuccess(result) && result.data.auditLogId, 'Basic audit log created');
  });
  
  tryTest('logWoCreated', function() {
    var result = logWoCreated('WO-TEST-001', 'ahmad.fauzi@company.com', {
      wo_number: 'WO-TEST-001',
      component_id: 'COM-001',
      unit_id: 'UNIT-001'
    });
    assert(isSuccess(result), 'WO created audit logged');
  });
  
  tryTest('logWoStatusChange', function() {
    var result = logWoStatusChange('WO-TEST-001', 'created', 'in_progress', 'ahmad.fauzi@company.com');
    assert(isSuccess(result), 'Status change logged');
  });
  
  tryTest('logSupervisorApprove', function() {
    var result = logSupervisorApprove('WO-TEST-001', 'maman.suryadi@company.com', 'Looks good');
    assert(isSuccess(result), 'Supervisor approval logged');
  });
  
  tryTest('logFactorOverride', function() {
    var result = logFactorOverride('WO-TEST-001', 'work_condition', 1.0, 1.2, 'pandu.wijaksono@company.com', 'Extreme weather');
    assert(isSuccess(result), 'Factor override logged');
  });
  
  // Test audit queries
  Log.section('Audit Queries');
  
  tryTest('getAuditLogsByEntity', function() {
    var result = getAuditLogsByEntity('work_order', 'WO-TEST-001', 10);
    assert(isSuccess(result) && result.data.length >= 4, 'Found WO audit logs (4+ entries)');
  });
  
  tryTest('getWoAuditTrail', function() {
    var result = getWoAuditTrail('WO-TEST-001');
    assert(isSuccess(result) && result.data.length > 0, 'WO audit trail retrieved');
  });
  
  tryTest('getOverrideAuditTrail', function() {
    var result = getOverrideAuditTrail(10);
    assert(isSuccess(result), 'Override audit trail retrieved');
  });
  
  // Summary
  Log.separator('Test Results');
  Log.info('test', '✅ Passed: ' + passed + ' | ❌ Failed: ' + failed);
  if (failed === 0) Log.info('test', '🎉 All tests passed!');
}