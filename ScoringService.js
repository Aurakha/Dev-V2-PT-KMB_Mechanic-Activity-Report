/**
 * ============================================================================
 * ScoringService.gs - Scoring Formula Calculation
 * ============================================================================
 * 
 * Production-grade scoring calculation dengan formula:
 * 
 * FINAL_POINTS = BASE × UNIT × WORK_CONDITION × TIMELINESS × SAFETY × MTBF
 * 
 * Components:
 * - BASE: From component config (base_points)
 * - UNIT: Unit factor (dari Config_Units, e.g., 1.2 for CAT 320)
 * - WORK_CONDITION: 1.0 (normal), 1.1 (difficult), 1.2 (extreme)
 * - TIMELINESS: 1.0 (on time), 0.8 (late), 0.5 (way late)
 * - SAFETY: 1.0 (no incident), 0.0 (incident) → cancels all points
 * - MTBF: 0.8 (redo), 1.2 (first time)
 * 
 * Features:
 * - Team MTBF factor averaging (all team members)
 * - Supervisor/Superintendent can override factors
 * - Scoring snapshot for audit trail
 * - Points distribution to team members by percentage
 * - Points to IDR conversion
 * 
 * Dependencies: Constants, Logger, ResponseHelper, ConfigService, MtbfService, Utils
 * ============================================================================
 */

// ============================================================================
// MAIN SCORING CALCULATION
// ============================================================================

/**
 * Calculate final score dengan full formula
 * 
 * @param {Object} woData - Work order data {component_id, unit_id, actual_hours, target_hours, work_condition, safety_incident, mtbf_redo_status}
 * @param {Object} teamDistribution - {mechanic_id: percentage, ...}
 * @param {Object} overrides - Optional factor overrides {unit_factor, work_condition_factor, timeliness_factor, mtbf_factor}
 * @return {Object} Response {success, data: {breakdown, finalPoints}}
 */
function calculateScore(woData, teamDistribution, overrides) {
  var timer = Log.startTimer('calculateScore');
  
  try {
    // Validation
    var validationError = requireField(woData, 'woData');
    if (validationError) return validationError;
    
    // ─── SUMBER BASE POINTS (Fase 1): job katalog ATAU component ─────────
    // wo.job_id terisi (field/workshop) → Config_Jobs; kosong → Config_Components.
    var srcBasePoints = 0;
    var srcTargetHours = 0;
    
    if (woData.job_id) {
      var job = getJobById(woData.job_id);
      if (!job) {
        return notFoundResponse('Job', woData.job_id);
      }
      srcBasePoints = parseFloat(job.base_point) || 0;
      srcTargetHours = parseFloat(job.plan_hours) || 0;
    } else {
      validationError = requireField(woData.component_id, 'component_id');
      if (validationError) return validationError;
      
      var component = getComponentById(woData.component_id);
      if (!component) {
        return notFoundResponse('Component', woData.component_id);
      }
      srcBasePoints = parseFloat(component.base_points) || 0;
      srcTargetHours = parseFloat(component.target_hours) || 0;
    }
    
    // Apply override if present (override-aware scoring)
    var basePoints = (woData._override_base_points !== undefined && woData._override_base_points !== null)
      ? parseFloat(woData._override_base_points)
      : srcBasePoints;
    
    var targetHours = (woData._override_target_hours !== undefined && woData._override_target_hours !== null)
      ? parseFloat(woData._override_target_hours)
      : srcTargetHours;
    
    Log.info('calculateScore', 'Using values', {
      base_points: basePoints,
      target_hours: targetHours,
      base_points_from: woData._override_base_points !== undefined ? 'OVERRIDE' : 'component',
      target_hours_from: woData._override_target_hours !== undefined ? 'OVERRIDE' : 'component'
    });
    
    // Calculate each factor
    overrides = overrides || {};
    
    // 1. Unit Factor
    var unitFactor = overrides.unit_factor || calculateUnitFactor(woData.unit_id);
    
    // 2. Work Condition Factor
    var workConditionFactor = overrides.work_condition_factor || 
                              calculateWorkConditionFactor(woData.work_condition);
    
    // 3. Timeliness Factor
    var actualHours = parseFloat(woData.actual_hours) || 0;
    var timelinessResult = calculateTimelinessFactor(actualHours, targetHours);
    var timelinessFactor = overrides.timeliness_factor || timelinessResult.factor;
    
    // 4. Safety Factor
    var safetyFactor = calculateSafetyFactor(woData.safety_incident);
    

// 5. MTBF Factor — judgment (redo/first_time), lookup Config_Factors
    var mtbfFactor = 1.0;
    var mtbfStatusVal = woData.mtbf_redo_status || null;
    if (mtbfStatusVal) {
      var mtbfCfg = loadFactors();
      if (mtbfCfg.mtbf && mtbfCfg.mtbf[mtbfStatusVal] !== undefined) {
        mtbfFactor = parseFloat(mtbfCfg.mtbf[mtbfStatusVal]) || 1.0;
      }
    }
    
    // Calculate final points
    var finalPoints = basePoints * unitFactor * workConditionFactor * timelinessFactor * safetyFactor * mtbfFactor;
    finalPoints = roundTo(finalPoints, 2);
    
    // Breakdown for transparency
    var breakdown = {
      base_points: basePoints,
      unit_factor: unitFactor,
      work_condition_factor: workConditionFactor,
      timeliness_factor: timelinessFactor,
      timeliness_status: timelinessResult.status,
      timeliness_ratio: timelinessResult.ratio,
      safety_factor: safetyFactor,
      safety_incident: woData.safety_incident || false,
      mtbf_factor: mtbfFactor,
      mtbf_status: woData.mtbf_redo_status || 'unknown',
      final_points: finalPoints,
      overrides_applied: overrides
    };
    
    timer.end('Score calculated', {finalPoints: finalPoints});
    
    return successResponse({
      breakdown: breakdown,
      finalPoints: finalPoints
    });
    
  } catch (e) {
    Log.exception('calculateScore', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Calculate final points (shorthand - just returns number)
 */
function calculateFinalPoints(basePoints, allFactors) {
  if (typeof basePoints !== 'number' || isNaN(basePoints)) basePoints = 0;
  
  var unit = allFactors.unit || 1.0;
  var workCondition = allFactors.workCondition || 1.0;
  var timeliness = allFactors.timeliness || 1.0;
  var safety = allFactors.safety || 1.0;
  var mtbf = allFactors.mtbf || 1.0;
  
  return roundTo(basePoints * unit * workCondition * timeliness * safety * mtbf, 2);
}

// ============================================================================
// INDIVIDUAL FACTOR CALCULATIONS
// ============================================================================

/**
 * Calculate unit factor
 * @param {string} unitId
 * @return {number} Unit factor (default 1.0)
 */
function calculateUnitFactor(unitId) {
  if (!unitId) return DEFAULTS.UNIT_FACTOR;
  return getUnitFactor(unitId);
}

/**
 * Calculate work condition factor
 * @param {string} condition - 'normal', 'difficult', 'extreme'
 * @return {number} Work condition factor (default 1.0)
 */
function calculateWorkConditionFactor(condition) {
  if (!condition) return DEFAULTS.WORK_CONDITION_FACTOR;
  return getWorkConditionFactor(condition);
}

/**
 * Calculate timeliness factor
 * @param {number} actualHours
 * @param {number} targetHours
 * @return {Object} {factor, status, ratio}
 */
function calculateTimelinessFactor(actualHours, targetHours) {
  return getTimelinessFactor(actualHours, targetHours);
}

/**
 * Calculate safety factor
 * @param {boolean} hasSafetyIncident
 * @return {number} 1.0 or 0.0
 */
function calculateSafetyFactor(hasSafetyIncident) {
  return getSafetyFactor(hasSafetyIncident);
}

/**
 * Calculate MTBF factor for single mechanic
 * @param {string} mechanicId
 * @param {string} componentId
 * @param {string} unitId
 * @return {number} MTBF factor (0.8 or 1.2)
 */
function calculateMtbfFactor(mechanicId, componentId, unitId) {
  // Calculate cumulative MTBF for this mechanic+component+unit
  var mtbfResult = calculateMtbf(componentId, unitId);
  
  if (isError(mtbfResult)) {
    Log.warn('calculateMtbfFactor', 'MTBF calculation failed, using default', {mechanicId: mechanicId});
    return DEFAULTS.MTBF_FACTOR;
  }
  
  var cumulativeHours = mtbfResult.data.cumulativeHours;
  var thresholdHours = getMtbfThresholdHours();
  
  var redoCheck = isRedoJob(cumulativeHours, thresholdHours);
  return redoCheck.factor;
}

/**
 * Calculate team average MTBF factor
 * Averages MTBF factors dari semua team members
 * 
 * @param {Array<string>} mechanicIds
 * @param {string} componentId
 * @param {string} unitId
 * @return {number} Average MTBF factor
 */
function calculateTeamMtbfFactor(mechanicIds, componentId, unitId) {
  if (!mechanicIds || mechanicIds.length === 0) {
    return DEFAULTS.MTBF_FACTOR;
  }
  
  var factors = [];
  
  for (var i = 0; i < mechanicIds.length; i++) {
    var factor = calculateMtbfFactor(mechanicIds[i], componentId, unitId);
    factors.push(factor);
  }
  
  var avgFactor = averageArray(factors);
  return roundTo(avgFactor, 2);
}

// ============================================================================
// FACTOR OVERRIDES (Supervisor/Superintendent)
// ============================================================================

/**
 * Override work condition factor
 * Supervisor/Superintendent can adjust if actual condition was more/less difficult
 * 
 * @param {string} woId
 * @param {number} newFactor
 * @param {string} reason
 * @param {string} approverEmail
 * @return {Object} Response
 */
function overrideWorkConditionFactor(woId, newFactor, reason, approverEmail) {
  return overrideFactor(woId, 'work_condition', newFactor, reason, approverEmail);
}

/**
 * Override timeliness factor
 */
function overrideTimelinessFactor(woId, newFactor, reason, approverEmail) {
  return overrideFactor(woId, 'timeliness', newFactor, reason, approverEmail);
}

/**
 * Generic factor override
 * @private
 */
function overrideFactor(woId, factorType, newFactor, reason, approverEmail) {
  var timer = Log.startTimer('overrideFactor');
  
  try {
    // Authorization
    var authCheck = checkAuthorization(APPROVER_ROLES);
    if (isError(authCheck)) return authCheck;
    
    approverEmail = approverEmail || getCurrentUser();
    
    // Validation
    var validationError = requireField(woId, 'woId');
    if (validationError) return validationError;
    
    validationError = requireRange(newFactor, 'newFactor', VALIDATION.MIN_FACTOR, VALIDATION.MAX_FACTOR);
    if (validationError) return validationError;
    
    validationError = requireField(reason, 'reason');
    if (validationError) return validationError;
    
    // Get WO
    var wo = getRowById(SHEETS.WORK_ORDERS, woId, 'id');
    if (!wo) {
      return notFoundResponse('WorkOrder', woId);
    }
    
    var oldFactor = wo[factorType + '_factor_used'] || null;
    
    // Store override in WO
    var updateData = {};
    updateData[factorType + '_factor_used'] = newFactor;
    
    var updated = updateRow(SHEETS.WORK_ORDERS, woId, updateData, 'id');
    
    if (!updated) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to override factor');
    }
    
    // Audit log
    logFactorOverride(woId, factorType, oldFactor, newFactor, approverEmail, reason);
    
    timer.end('Factor overridden', {factorType: factorType, oldFactor: oldFactor, newFactor: newFactor});
    
    return successResponse({
      woId: woId,
      factorType: factorType,
      oldFactor: oldFactor,
      newFactor: newFactor,
      overriddenBy: approverEmail
    });
    
  } catch (e) {
    Log.exception('overrideFactor', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Check if user can override factors
 */
function canOverrideFactor(userEmail) {
  userEmail = userEmail || getCurrentUser();
  return isApprover(userEmail);
}

// ============================================================================
// SCORING SNAPSHOT (Immutable Record)
// ============================================================================

/**
 * Create scoring snapshot
 * Called when WO is approved - captures final scoring breakdown for audit
 * 
 * @param {string} woId
 * @param {Object} scoreBreakdown - dari calculateScore()
 * @return {Object} Response {success, data: {snapshotId}}
 */
function createScoringSnapshot(woId, scoreBreakdown) {
  var timer = Log.startTimer('createScoringSnapshot');
  
  try {
    var validationError = requireField(woId, 'woId');
    if (validationError) return validationError;
    
    validationError = requireField(scoreBreakdown, 'scoreBreakdown');
    if (validationError) return validationError;
    
    var snapshotId = generateId(ID_PREFIXES.SCORING_SNAPSHOT);
    
    var snapshot = {
      id: snapshotId,
      wo_id: woId,
      base_points: scoreBreakdown.base_points || 0,
      unit_factor: scoreBreakdown.unit_factor || 1.0,
      work_condition_factor: scoreBreakdown.work_condition_factor || 1.0,
      timeliness_factor: scoreBreakdown.timeliness_factor || 1.0,
      safety_factor: scoreBreakdown.safety_factor || 1.0,
      mtbf_factor: scoreBreakdown.mtbf_factor || 1.0,
      final_score: scoreBreakdown.final_points || 0,
      created_at: new Date()
    };
    
    var rowNum = appendRow(SHEETS.SCORING_SNAPSHOTS, snapshot);
    
    if (!rowNum) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to create scoring snapshot');
    }
    
    timer.end('Snapshot created', {snapshotId: snapshotId, finalScore: snapshot.final_score});
    
    return successResponse({snapshotId: snapshotId, snapshot: snapshot});
    
  } catch (e) {
    Log.exception('createScoringSnapshot', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Get scoring snapshot by WO ID
 */
function getScoringSnapshot(woId) {
  var timer = Log.startTimer('getScoringSnapshot');
  
  try {
    if (!woId) {
      return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'woId required');
    }
    
    var allSnapshots = readSheetAsObjects(SHEETS.SCORING_SNAPSHOTS);
    
    for (var i = 0; i < allSnapshots.length; i++) {
      if (allSnapshots[i].wo_id === woId) {
        timer.end('Found');
        return successResponse(allSnapshots[i]);
      }
    }
    
    timer.end('Not found');
    return notFoundResponse('ScoringSnapshot', woId);
    
  } catch (e) {
    Log.exception('getScoringSnapshot', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// POINTS DISTRIBUTION TO TEAM
// ============================================================================

/**
 * Distribute points to team members based on percentage
 * 
 * @param {number} totalPoints - Total points dari scoring calculation
 * @param {Object} teamDistribution - {mechanic_id: percentage, ...}
 * @return {Object} Response {success, data: {distributions: [{mechanic_id, points, percentage}]}}
 */
function distributePointsToTeam(totalPoints, teamDistribution) {
  var timer = Log.startTimer('distributePointsToTeam');
  
  try {
    // Validation
    var validationError = requireField(totalPoints, 'totalPoints');
    if (validationError) return validationError;
    
    validationError = requireField(teamDistribution, 'teamDistribution');
    if (validationError) return validationError;
    
    var distValidation = validateTeamDistribution(teamDistribution);
    if (!distValidation.valid) {
      return errorResponse(ERROR_CODES.VALIDATION_PERCENTAGE_SUM_INVALID, distValidation.error);
    }
    
    // Calculate points per mechanic
    var distributions = [];
    
    for (var mechanicId in teamDistribution) {
      if (teamDistribution.hasOwnProperty(mechanicId)) {
        var percentage = teamDistribution[mechanicId];
        var points = (totalPoints * percentage) / 100;
        points = roundTo(points, 2);
        
        distributions.push({
          mechanic_id: mechanicId,
          percentage: percentage,
          points: points
        });
      }
    }
    
    timer.end('Distributed', {totalPoints: totalPoints, teamSize: distributions.length});
    
    return successResponse({
      totalPoints: totalPoints,
      distributions: distributions
    });
    
  } catch (e) {
    Log.exception('distributePointsToTeam', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Award points to mechanics (write to MechanicPoints sheet)
 * Called after WO is approved and scoring is finalized
 * 
 * @param {string} woId
 * @param {Array<Object>} mechanicPoints - [{mechanic_id, points}, ...]
 * @return {Object} Response
 */
function awardPointsToMechanics(woId, mechanicPoints) {
  var timer = Log.startTimer('awardPointsToMechanics');
  
  try {
    var validationError = requireField(woId, 'woId');
    if (validationError) return validationError;
    
    validationError = requireField(mechanicPoints, 'mechanicPoints');
    if (validationError) return validationError;
    
    // IDEMPOTENCY GUARD (anti double-payment):
    // Paksa baca segar (bypass cache eksekusi), lalu cek apakah WO ini
    // SUDAH pernah di-award. Kalau sudah, JANGAN tulis lagi — return sukses
    // dengan awardedCount 0 supaya alur approval tidak error, cuma no-op.
    _invalidateSheetCache(SHEETS.MECHANIC_POINTS);
    var existingAwards = queryRows(SHEETS.MECHANIC_POINTS, function(row) {
      return String(row.wo_id) === String(woId);
    });
    if (existingAwards.length > 0) {
      Log.warn('awardPointsToMechanics', 'DUPLICATE AWARD BLOCKED - WO already has points', {
        woId: woId,
        existingRows: existingAwards.length
      });
      timer.end('Skipped - already awarded', {woId: woId});
      return successResponse({
        woId: woId,
        awardedCount: 0,
        awardedIds: [],
        alreadyAwarded: true
      });
    }
    
    // FASE 1: bawa identitas section WO ke jejak poin (audit per cluster)
    var woRowForSection = getRowById(SHEETS.WORK_ORDERS, woId, 'id');
    if (!woRowForSection) woRowForSection = getRowById('WorkOrders_Archive', woId, 'id');
    var woSection = (woRowForSection && woRowForSection.section) ? String(woRowForSection.section) : '';
    
    var awardedIds = [];
    
    for (var i = 0; i < mechanicPoints.length; i++) {
      var mp = mechanicPoints[i];
      
      var pointsId = generateId(ID_PREFIXES.MECHANIC_POINTS);
      var mechRate = getRateForMechanic(mp.mechanic_id);
      var idrValue = pointsToIdr(mp.points, mechRate);
      
      var pointsRecord = {
        id: pointsId,
        mechanic_id: mp.mechanic_id,
        wo_id: woId,
        points: mp.points,
        idr_value: idrValue,
        awarded_at: new Date(),
        section: woSection
      };
      
      var rowNum = appendRow(SHEETS.MECHANIC_POINTS, pointsRecord);
      
      if (!rowNum) {
        Log.error('awardPointsToMechanics', 'Failed to award points', {mechanic_id: mp.mechanic_id});
        continue;
      }
      
      awardedIds.push(pointsId);
    }
    
    timer.end('Points awarded', {woId: woId, count: awardedIds.length});
    
    return successResponse({
      woId: woId,
      awardedCount: awardedIds.length,
      awardedIds: awardedIds
    });
    
  } catch (e) {
    Log.exception('awardPointsToMechanics', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// POINTS CONVERSION
// ============================================================================

/**
 * Convert points to IDR
 * Uses multiplier from config (default 50000)
 * 
 * @param {number} points
 * @param {number} multiplier - Optional, uses config default
 * @return {number} IDR amount
 */
function convertPointsToIdr(points, multiplier) {
  return pointsToIdr(points, multiplier);
}

// ============================================================================
// TESTING
// ============================================================================

/**
 * Test ScoringService functions
 */
function testScoringService() {
  Log.separator('Testing ScoringService.gs');
  
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
  
  // Test individual factor calculations
  Log.section('Individual Factors');
  
  tryTest('calculateUnitFactor', function() {
    var factor = calculateUnitFactor('UNIT-001'); // CAT 320 = 1.2
    assert(factor === 1.2, 'Unit factor calculated (1.2)');
  });
  
  tryTest('calculateWorkConditionFactor', function() {
    var normal = calculateWorkConditionFactor('normal');
    var extreme = calculateWorkConditionFactor('extreme');
    assert(normal === 1.0 && extreme === 1.2, 'Work condition factors');
  });
  
  tryTest('calculateTimelinessFactor', function() {
    var onTime = calculateTimelinessFactor(5, 5); // 100%
    var late = calculateTimelinessFactor(6, 5);   // 120%
    assert(onTime.factor === 1.0 && late.factor === 0.8, 'Timeliness factors');
  });
  
  tryTest('calculateSafetyFactor', function() {
    var noIncident = calculateSafetyFactor(false);
    var incident = calculateSafetyFactor(true);
    assert(noIncident === 1.0 && incident === 0.0, 'Safety factors');
  });
  
  // Test full scoring calculation
  Log.section('Full Scoring');
  
  tryTest('calculateScore', function() {
    var woData = {
      component_id: 'COM-001', // Intercooler, base_points=3
      unit_id: 'UNIT-001',      // CAT 320, factor=1.2
      actual_hours: 5,
      work_condition: 'normal',  // factor=1.0
      safety_incident: false,    // factor=1.0
      mtbf_redo_status: 'first_time' // factor=1.2
    };
    
    var result = calculateScore(woData, null);
    
    // Expected: 3 × 1.2 × 1.0 × 1.0 × 1.0 × 1.2 = 4.32
    assert(isSuccess(result) && result.data.finalPoints > 4.0, 'Full score calculated');
  });
  
  // Test points distribution
  Log.section('Points Distribution');
  
  tryTest('distributePointsToTeam', function() {
    var dist = {
      'MECH-001': 50,
      'MECH-002': 30,
      'MECH-003': 20
    };
    
    var result = distributePointsToTeam(10, dist);
    assert(isSuccess(result) && result.data.distributions.length === 3, 'Points distributed to 3 mechanics');
    
    var mech1 = result.data.distributions[0];
    assert(mech1.points === 5, 'Mechanic 1 gets 5 points (50%)');
  });
  
  tryTest('convertPointsToIdr', function() {
    var idr = convertPointsToIdr(10, 50000);
    assert(idr === 500000, 'Points converted to IDR (10 × 50000 = 500000)');
  });
  
  // Test scoring snapshot
  Log.section('Scoring Snapshot');
  
  var testWoId = 'WO-TEST-SCORE-' + new Date().getTime();
  var snapshotId;
  
  tryTest('createScoringSnapshot', function() {
    var breakdown = {
      base_points: 3,
      unit_factor: 1.2,
      work_condition_factor: 1.0,
      timeliness_factor: 1.0,
      safety_factor: 1.0,
      mtbf_factor: 1.2,
      final_points: 4.32
    };
    
    var result = createScoringSnapshot(testWoId, breakdown);
    assert(isSuccess(result) && result.data.snapshotId, 'Scoring snapshot created');
    snapshotId = result.data.snapshotId;
  });
  
  tryTest('getScoringSnapshot', function() {
    var result = getScoringSnapshot(testWoId);
    assert(isSuccess(result) && result.data.final_score === 4.32, 'Snapshot retrieved');
  });
  
  // Cleanup
  Log.section('Cleanup');
  tryTest('cleanup', function() {
    var deleted = deleteRow(SHEETS.SCORING_SNAPSHOTS, snapshotId, 'id');
    assert(deleted === true, 'Test snapshot deleted');
  });
  
  // Summary
  Log.separator('Test Results');
  Log.info('test', '✅ Passed: ' + passed + ' | ❌ Failed: ' + failed);
  if (failed === 0) Log.info('test', '🎉 All tests passed!');
}