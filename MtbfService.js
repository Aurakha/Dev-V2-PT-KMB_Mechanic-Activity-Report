/**
 * ============================================================================
 * MtbfService.gs - MTBF Tracking & Management
 * ============================================================================
 * 
 * Mean Time Between Failures (MTBF) tracking service:
 * - Calculate cumulative hours for component+unit pair
 * - Determine REDO vs FIRST_TIME status
 * - Track MTBF wait period (80 hours default)
 * - Allow Supervisor/Superintendent to override MTBF status
 * 
 * Business Rules:
 * - MTBF threshold default: 80 hours (configurable)
 * - If cumulative < threshold → REDO (factor 0.8x)
 * - If cumulative ≥ threshold → FIRST_TIME (factor 1.2x)
 * - After WO completion → MTBF wait period starts
 * - Supervisor/Superintendent can override MTBF status with reason
 * 
 * Dependencies: Constants, Logger, Sheets, ConfigService, AuditService, Utils
 * ============================================================================
 */

// ============================================================================
// MTBF CALCULATION
// ============================================================================

/**
 * Calculate MTBF (cumulative hours) for component+unit pair
 * Returns cumulative hours from all previous completed WOs for same component+unit
 * 
 * @param {string} componentId
 * @param {string} unitId
 * @param {Date} beforeDate - Calculate up to this date (optional, default: now)
 * @return {Object} Response {success, data: {cumulativeHours, lastWoDate, woCount}}
 */
function calculateMtbf(componentId, unitId, beforeDate) {
  var timer = Log.startTimer('calculateMtbf');
  
  try {
    // Validation
    var validationError = requireField(componentId, 'componentId');
    if (validationError) return validationError;
    
    validationError = requireField(unitId, 'unitId');
    if (validationError) return validationError;
    
    beforeDate = beforeDate || new Date();
    
    // Get all completed WOs for this component+unit
    var allWos = readSheetAsObjects(SHEETS.WORK_ORDERS);
    var relevantWos = [];
    
    for (var i = 0; i < allWos.length; i++) {
      var wo = allWos[i];
      
      // Must be same component+unit
      if (wo.component_id !== componentId || wo.unit_id !== unitId) {
        continue;
      }
      
      // Must be approved (completed successfully)
      if (wo.status !== WO_STATUS.APPROVED) {
        continue;
      }
      
      // Must have actual_hours recorded
      if (!wo.actual_hours || wo.actual_hours === 0) {
        continue;
      }
      
      // Must be before cutoff date
      var createdAt = parseDate(wo.created_at);
      if (createdAt && createdAt > beforeDate) {
        continue;
      }
      
      relevantWos.push(wo);
    }
    
    // Calculate cumulative hours
    var cumulativeHours = 0;
    var lastWoDate = null;
    
    for (var j = 0; j < relevantWos.length; j++) {
      var hours = parseFloat(relevantWos[j].actual_hours) || 0;
      cumulativeHours += hours;
      
      var woCreatedAt = parseDate(relevantWos[j].created_at);
      if (!lastWoDate || (woCreatedAt && woCreatedAt > lastWoDate)) {
        lastWoDate = woCreatedAt;
      }
    }
    
    var result = {
      cumulativeHours: roundTo(cumulativeHours, 2),
      lastWoDate: lastWoDate,
      woCount: relevantWos.length
    };
    
    timer.end('MTBF calculated', {
      componentId: componentId,
      unitId: unitId,
      cumulativeHours: result.cumulativeHours,
      woCount: result.woCount
    });
    
    return successResponse(result);
    
  } catch (e) {
    Log.exception('calculateMtbf', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Get MTBF history for component+unit pair
 * Returns list of WOs used for MTBF calculation
 */
function getMtbfHistory(componentId, unitId, limit) {
  var timer = Log.startTimer('getMtbfHistory');
  
  try {
    limit = limit || 50;
    
    var allWos = readSheetAsObjects(SHEETS.WORK_ORDERS);
    var history = [];
    
    for (var i = 0; i < allWos.length; i++) {
      var wo = allWos[i];
      
      if (wo.component_id === componentId && 
          wo.unit_id === unitId && 
          wo.status === WO_STATUS.APPROVED &&
          wo.actual_hours) {
        
        history.push({
          wo_id: wo.id,
          wo_number: wo.wo_number,
          actual_hours: parseFloat(wo.actual_hours) || 0,
          created_at: wo.created_at,
          status: wo.status
        });
      }
      
      if (history.length >= limit) break;
    }
    
    // Sort by created_at descending
    history.sort(function(a, b) {
      var dateA = parseDate(a.created_at);
      var dateB = parseDate(b.created_at);
      if (!dateA || !dateB) return 0;
      return dateB.getTime() - dateA.getTime();
    });
    
    timer.end('History retrieved', {count: history.length});
    
    return successResponse(history, {count: history.length});
    
  } catch (e) {
    Log.exception('getMtbfHistory', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Determine if job is REDO or FIRST_TIME based on MTBF
 * @param {number} mtbfHours - Cumulative MTBF hours
 * @param {number} thresholdHours - MTBF threshold (optional, uses config default)
 * @return {Object} {isRedo: boolean, status: 'redo'|'first_time', factor: number}
 */
function isRedoJob(mtbfHours, thresholdHours) {
  if (!thresholdHours) {
    thresholdHours = getMtbfThresholdHours();
  }
  
  if (typeof mtbfHours !== 'number' || isNaN(mtbfHours)) {
    mtbfHours = 0;
  }
  
  var isRedo = mtbfHours < thresholdHours;
  var status = isRedo ? MTBF_KEYS.REDO : MTBF_KEYS.FIRST_TIME;
  var factor = getMtbfFactorByStatus(isRedo);
  
  return {
    isRedo: isRedo,
    status: status,
    factor: factor,
    mtbfHours: mtbfHours,
    threshold: thresholdHours
  };
}

// ============================================================================
// MTBF TRACKING (Wait Period)
// ============================================================================

/**
 * Create MTBF tracking entry (start wait period)
 * Called when WO finishes - mechanic must wait before submitting for approval
 * 
 * @param {string} woId
 * @param {Date} mtbfStartDate - When wait period starts (usually WO finished_at)
 * @return {Object} Response {success, data: {mtbfTrackingId, expiryDate}}
 */
function createMtbfTracking(woId, mtbfStartDate) {
  var timer = Log.startTimer('createMtbfTracking');
  
  try {
    var validationError = requireField(woId, 'woId');
    if (validationError) return validationError;
    
    mtbfStartDate = parseDate(mtbfStartDate) || new Date();
    
    // Get MTBF threshold
    var thresholdHours = getMtbfThresholdHours();
    
    // Calculate expiry date
    var expiryDate = addHours(mtbfStartDate, thresholdHours);
    
    // Generate tracking ID
    var trackingId = generateId(ID_PREFIXES.MTBF_TRACKING);
    
    // Create tracking entry
    var tracking = {
      id: trackingId,
      wo_id: woId,
      mtbf_start_date: mtbfStartDate,
      mtbf_expiry_date: expiryDate,
      status: 'waiting'
    };
    
    var rowNum = appendRow(SHEETS.MTBF_TRACKING, tracking);
    
    if (!rowNum) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to create MTBF tracking');
    }
    
    timer.end('MTBF tracking created', {
      woId: woId,
      thresholdHours: thresholdHours,
      expiryDate: formatDate(expiryDate)
    });
    
    return successResponse({
      mtbfTrackingId: trackingId,
      expiryDate: expiryDate,
      thresholdHours: thresholdHours
    });
    
  } catch (e) {
    Log.exception('createMtbfTracking', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Get MTBF tracking by WO ID
 */
function getMtbfTrackingByWoId(woId) {
  var timer = Log.startTimer('getMtbfTrackingByWoId');
  
  try {
    if (!woId) {
      return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'woId required');
    }
    
    var allTracking = readSheetAsObjects(SHEETS.MTBF_TRACKING);
    
    for (var i = 0; i < allTracking.length; i++) {
      if (allTracking[i].wo_id === woId) {
        timer.end('Found');
        return successResponse(allTracking[i]);
      }
    }
    
    timer.end('Not found');
    return notFoundResponse('MtbfTracking', woId);
    
  } catch (e) {
    Log.exception('getMtbfTrackingByWoId', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Check if MTBF wait period has expired
 * @return {Object} Response {success, data: {expired: boolean, timeRemaining: {...}}}
 */
function checkMtbfExpired(mtbfTrackingId) {
  var timer = Log.startTimer('checkMtbfExpired');
  
  try {
    var tracking = getRowById(SHEETS.MTBF_TRACKING, mtbfTrackingId, 'id');
    
    if (!tracking) {
      return notFoundResponse('MtbfTracking', mtbfTrackingId);
    }
    
    var expiryDate = parseDate(tracking.mtbf_expiry_date);
    if (!expiryDate) {
      return errorResponse(ERROR_CODES.DATA_INVALID_STATE, 'Invalid expiry date');
    }
    
    var now = new Date();
    var expired = now >= expiryDate;
    var timeRemaining = getMtbfTimeRemaining(expiryDate);
    
    timer.end('Checked', {expired: expired});
    
    return successResponse({
      expired: expired,
      timeRemaining: timeRemaining,
      expiryDate: expiryDate
    });
    
  } catch (e) {
    Log.exception('checkMtbfExpired', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Update MTBF tracking status
 */
function updateMtbfStatus(mtbfTrackingId, newStatus) {
  var timer = Log.startTimer('updateMtbfStatus');
  
  try {
    var validStatuses = ['waiting', 'expired', 'skipped', 'overridden'];
    
    var validationError = requireOneOf(newStatus, 'status', validStatuses);
    if (validationError) return validationError;
    
    var updated = updateRow(SHEETS.MTBF_TRACKING, mtbfTrackingId, {status: newStatus}, 'id');
    
    if (!updated) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to update MTBF status');
    }
    
    timer.end('Status updated', {newStatus: newStatus});
    
    return successResponse({mtbfTrackingId: mtbfTrackingId, status: newStatus});
    
  } catch (e) {
    Log.exception('updateMtbfStatus', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// MTBF OVERRIDE (Supervisor/Superintendent)
// ============================================================================

/**
 * Override MTBF status (Supervisor/Superintendent only)
 * Allows approver to skip MTBF wait or change REDO → FIRST_TIME status
 * 
 * @param {string} woId
 * @param {string} newMtbfStatus - 'redo' or 'first_time'
 * @param {string} overrideReason
 * @param {string} approverEmail
 * @return {Object} Response
 */
function overrideMtbfStatus(woId, newMtbfStatus, overrideReason, approverEmail) {
  var timer = Log.startTimer('overrideMtbfStatus');
  
  try {
    // Authorization check
    var authCheck = checkAuthorization(APPROVER_ROLES);
    if (isError(authCheck)) return authCheck;
    
    approverEmail = approverEmail || getCurrentUser();
    
    // Validation
    var validationError = requireField(woId, 'woId');
    if (validationError) return validationError;
    
    validationError = requireOneOf(newMtbfStatus, 'newMtbfStatus', [MTBF_KEYS.REDO, MTBF_KEYS.FIRST_TIME]);
    if (validationError) return validationError;
    
    validationError = requireField(overrideReason, 'overrideReason');
    if (validationError) return validationError;
    
    // Get current WO
    var wo = getRowById(SHEETS.WORK_ORDERS, woId, 'id');
    if (!wo) {
      return notFoundResponse('WorkOrder', woId);
    }
    
    var oldMtbfStatus = wo.mtbf_redo_status || 'unknown';
    
    // Update WO with new MTBF status
    var updated = updateRow(SHEETS.WORK_ORDERS, woId, {
      mtbf_redo_status: newMtbfStatus
    }, 'id');
    
    if (!updated) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to override MTBF status');
    }
    
    // Update MTBF tracking if exists
    var trackingResult = getMtbfTrackingByWoId(woId);
    if (isSuccess(trackingResult)) {
      updateMtbfStatus(trackingResult.data.id, 'overridden');
    }
    
    // Audit log
    logMtbfOverride(woId, oldMtbfStatus, newMtbfStatus, approverEmail, overrideReason);
    
    timer.end('MTBF overridden', {woId: woId, oldStatus: oldMtbfStatus, newStatus: newMtbfStatus});
    
    return successResponse({
      woId: woId,
      oldMtbfStatus: oldMtbfStatus,
      newMtbfStatus: newMtbfStatus,
      overriddenBy: approverEmail
    });
    
  } catch (e) {
    Log.exception('overrideMtbfStatus', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Check if user can override MTBF
 * @return {boolean}
 */
function canOverrideMtbf(userEmail) {
  userEmail = userEmail || getCurrentUser();
  return isApprover(userEmail);
}

/**
 * Get override history for a WO
 * Returns all MTBF overrides from audit log
 */
function getMtbfOverrideHistory(woId) {
  var timer = Log.startTimer('getMtbfOverrideHistory');
  
  try {
    var auditResult = getAuditLogsByEntity('work_order', woId);
    
    if (isError(auditResult)) return auditResult;
    
    var allLogs = auditResult.data;
    var overrides = [];
    
    for (var i = 0; i < allLogs.length; i++) {
      if (allLogs[i].action === AUDIT_ACTIONS.OVERRIDE_MTBF) {
        overrides.push(allLogs[i]);
      }
    }
    
    timer.end('Found overrides', {count: overrides.length});
    
    return successResponse(overrides, {count: overrides.length});
    
  } catch (e) {
    Log.exception('getMtbfOverrideHistory', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate MTBF dates
 */
function validateMtbfDates(startDate, expiryDate) {
  var start = parseDate(startDate);
  var expiry = parseDate(expiryDate);
  
  if (!start) {
    return {valid: false, error: 'Invalid start date'};
  }
  
  if (!expiry) {
    return {valid: false, error: 'Invalid expiry date'};
  }
  
  if (expiry <= start) {
    return {valid: false, error: 'Expiry date must be after start date'};
  }
  
  return {valid: true};
}

// ============================================================================
// TESTING
// ============================================================================

/**
 * Test MtbfService functions
 */
function testMtbfService() {
  Log.separator('Testing MtbfService.gs');
  
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
  
  // Test MTBF calculation
  Log.section('MTBF Calculation');
  
  tryTest('calculateMtbf', function() {
    var result = calculateMtbf('COM-001', 'UNIT-001');
    assert(isSuccess(result) && typeof result.data.cumulativeHours === 'number', 'MTBF calculated');
  });
  
  tryTest('isRedoJob', function() {
    var redo = isRedoJob(50, 80); // 50 < 80 → REDO
    var firstTime = isRedoJob(100, 80); // 100 ≥ 80 → FIRST_TIME
    
    assert(redo.isRedo === true && redo.factor === 0.8, 'REDO detected (factor 0.8)');
    assert(firstTime.isRedo === false && firstTime.factor === 1.2, 'FIRST_TIME detected (factor 1.2)');
  });
  
  tryTest('getMtbfHistory', function() {
    var result = getMtbfHistory('COM-001', 'UNIT-001', 10);
    assert(isSuccess(result), 'MTBF history retrieved');
  });
  
  // Test MTBF tracking
  Log.section('MTBF Tracking');
  
  var testWoId = 'WO-TEST-MTBF-' + new Date().getTime();
  var trackingId;
  
  tryTest('createMtbfTracking', function() {
    var result = createMtbfTracking(testWoId, new Date());
    assert(isSuccess(result) && result.data.mtbfTrackingId, 'MTBF tracking created');
    trackingId = result.data.mtbfTrackingId;
  });
  
  tryTest('getMtbfTrackingByWoId', function() {
    var result = getMtbfTrackingByWoId(testWoId);
    assert(isSuccess(result) && result.data.wo_id === testWoId, 'MTBF tracking retrieved');
  });
  
  tryTest('checkMtbfExpired', function() {
    var result = checkMtbfExpired(trackingId);
    assert(isSuccess(result) && typeof result.data.expired === 'boolean', 'MTBF expiry checked');
  });
  
  tryTest('updateMtbfStatus', function() {
    var result = updateMtbfStatus(trackingId, 'expired');
    assert(isSuccess(result), 'MTBF status updated');
  });
  
  // Test validation
  Log.section('Validation');
  
  tryTest('validateMtbfDates', function() {
    var valid = validateMtbfDates(new Date(), addHours(new Date(), 80));
    var invalid = validateMtbfDates(new Date(), new Date()); // same date
    
    assert(valid.valid === true, 'Valid dates accepted');
    assert(invalid.valid === false, 'Invalid dates rejected');
  });
  
  // Cleanup
  Log.section('Cleanup');
  tryTest('cleanup', function() {
    var deleted = deleteRow(SHEETS.MTBF_TRACKING, trackingId, 'id');
    assert(deleted === true, 'Test MTBF tracking deleted');
  });
  
  // Summary
  Log.separator('Test Results');
  Log.info('test', '✅ Passed: ' + passed + ' | ❌ Failed: ' + failed);
  if (failed === 0) Log.info('test', '🎉 All tests passed!');
}