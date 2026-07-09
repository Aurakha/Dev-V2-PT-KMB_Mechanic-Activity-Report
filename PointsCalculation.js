/**
 * ============================================================================
 * PointsCalculation.gs - Points Calculation Engine
 * ============================================================================
 * 
 * Production-grade scoring calculation dengan formula:
 * 
 * FINAL_POINTS = BASE × UNIT × WORK_CONDITION × TIMELINESS × SAFETY × MTBF
 * FINAL_IDR = FINAL_POINTS × IDR_RATE
 * 
 * ALL VALUES AUTO-LOOKUP FROM SPREADSHEET (NO HARDCODED VALUES!)
 * 
 * Dependencies: ConfigService.gs, Utils.gs, Logger.gs
 * ============================================================================
 */

// ============================================================================
// MAIN CALCULATION FUNCTION
// ============================================================================

/**
 * Calculate final points for a work order
 * 
 * @param {Object} woData - Work order data
 *   {
 *     component_id: 'COM-001',
 *     unit_id: 'UNIT-001',
 *     work_condition: 'extreme',
 *     actual_hours: 7,
 *     has_safety_incident: false
 *   }
 * @return {Object} Response with calculation breakdown
 */
function calculateFinalPointsDetailed(woData) {
  var timer = Log.startTimer('calculateFinalPoints');
  
  try {
    // Validation
    if (!woData) {
      return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'woData is required');
    }
    
    if (!woData.component_id) {
      return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'component_id is required');
    }
    
    // ========================================================================
    // STEP 1: GET BASE_POINTS (from Config_Components)
    // ========================================================================
    var component = getComponentById(woData.component_id);
    if (!component) {
      return errorResponse(ERROR_CODES.DATA_NOT_FOUND, 'Component not found: ' + woData.component_id);
    }
    
    var basePoints = parseFloat(component.base_points) || 0;
    var targetHours = parseFloat(component.target_hours) || 0;
    
    Log.info('calculateFinalPoints', 'Base points: ' + basePoints + ' (component: ' + component.component_name + ')');
    
    // ========================================================================
    // STEP 2: GET UNIT_FACTOR (from Config_Units)
    // ========================================================================
    var unitFactor = 1.0; // Default
    
    if (woData.unit_id) {
      var unit = getUnitById(woData.unit_id);
      if (unit) {
        unitFactor = parseFloat(unit.unit_factor) || 1.0;
        Log.info('calculateFinalPoints', 'Unit factor: ' + unitFactor + ' (unit: ' + unit.unit_name + ')');
      }
    }
    
    // ========================================================================
    // STEP 3: GET WORK_CONDITION_FACTOR (from Config_Factors)
    // ========================================================================
    var workConditionFactor = 1.0; // Default
    
    if (woData.work_condition) {
      var factors = loadFactors();
      if (factors.work_condition && factors.work_condition[woData.work_condition] !== undefined) {
        workConditionFactor = parseFloat(factors.work_condition[woData.work_condition]) || 1.0;
        Log.info('calculateFinalPoints', 'Work condition factor: ' + workConditionFactor + ' (' + woData.work_condition + ')');
      }
    }
    
    // ========================================================================
    // STEP 4: GET TIMELINESS_FACTOR (auto-calculate from actual vs target)
    // ========================================================================
    var timelinessResult = calculateTimelinessFactorAuto(woData.actual_hours, targetHours);
    var timelinessFactor = timelinessResult.factor;
    
    Log.info('calculateFinalPoints', 'Timeliness: ' + timelinessResult.status + 
             ' (ratio: ' + timelinessResult.ratio.toFixed(1) + '%) → factor: ' + timelinessFactor);
    
    // ========================================================================
    // STEP 5: GET SAFETY_FACTOR (from Config_Factors)
    // ========================================================================
    var safetyFactor = 1.0; // Default
    
    var safetyKey = woData.has_safety_incident ? 'incident' : 'no_incident';
    var factors = loadFactors();
    if (factors.safety && factors.safety[safetyKey] !== undefined) {
      safetyFactor = parseFloat(factors.safety[safetyKey]) || 1.0;
      Log.info('calculateFinalPoints', 'Safety factor: ' + safetyFactor + ' (' + safetyKey + ')');
    }
    
    // ========================================================================
    // STEP 6: GET MTBF_FACTOR (not implemented - default 1.0)
    // ========================================================================
    var mtbfFactor = 1.0; // TODO: Implement MTBF calculation later
    
    // ========================================================================
    // STEP 7: CALCULATE FINAL POINTS
    // ========================================================================
    var finalPoints = basePoints * unitFactor * workConditionFactor * timelinessFactor * safetyFactor * mtbfFactor;
    finalPoints = roundTo(finalPoints, 2); // 3 decimal places
    
    // ========================================================================
    // STEP 8: CONVERT TO IDR
    // ========================================================================
    var idrRate = parseFloat(getSetting('idr_rate')) || 50000;
    var finalIdr = finalPoints * idrRate;
    finalIdr = Math.round(finalIdr); // Round to nearest rupiah
    
    // ========================================================================
    // CALCULATION BREAKDOWN (for transparency)
    // ========================================================================
    var breakdown = {
      component_name: component.component_name,
      component_id: woData.component_id,
      unit_name: woData.unit_id ? (getUnitById(woData.unit_id) || {}).unit_name : null,
      unit_id: woData.unit_id,
      
      // Individual factors
      base_points: basePoints,
      unit_factor: unitFactor,
      work_condition: woData.work_condition,
      work_condition_factor: workConditionFactor,
      
      // Timeliness details
      target_hours: targetHours,
      actual_hours: woData.actual_hours,
      timeliness_ratio: timelinessResult.ratio,
      timeliness_status: timelinessResult.status,
      timeliness_factor: timelinessFactor,
      
      // Safety
      has_safety_incident: woData.has_safety_incident || false,
      safety_factor: safetyFactor,
      
      // MTBF
      mtbf_factor: mtbfFactor,
      mtbf_note: 'Not implemented yet (default 1.0)',
      
      // Final results
      final_points: finalPoints,
      idr_rate: idrRate,
      final_idr: finalIdr,
      
      // Calculation formula (for audit)
      formula: basePoints + ' × ' + unitFactor + ' × ' + workConditionFactor + 
               ' × ' + timelinessFactor + ' × ' + safetyFactor + ' × ' + mtbfFactor + 
               ' = ' + finalPoints + ' points'
    };
    
    timer.end('Calculation complete', {finalPoints: finalPoints, finalIdr: finalIdr});
    
    return successResponse(breakdown);
    
  } catch (e) {
    Log.exception('calculateFinalPoints', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// TIMELINESS CALCULATION (AUTO)
// ============================================================================

/**
 * Calculate timeliness factor based on actual vs target hours
 * 
 * LOGIC:
 * - ratio <= 100%: on_time (factor from Config_Factors)
 * - ratio > 100% and <= 150%: late (factor from Config_Factors)
 * - ratio > 150%: way_late (factor from Config_Factors)
 * 
 * @param {number} actualHours - Actual hours worked
 * @param {number} targetHours - Target hours (from component)
 * @return {Object} {ratio, status, factor}
 */
function calculateTimelinessFactorAuto(actualHours, targetHours) {
  // Default values
  actualHours = parseFloat(actualHours) || 0;
  targetHours = parseFloat(targetHours) || 0;
  
  // Handle edge case: no target hours
  if (targetHours === 0) {
    Log.warn('calculateTimelinessFactorAuto', 'Target hours is 0, defaulting to on_time');
    return {
      ratio: 0,
      status: 'on_time',
      factor: 1.0
    };
  }
  
  // Calculate ratio as percentage
  var ratio = (actualHours / targetHours) * 100;
  
  // Determine status based on ratio
  var status;
  if (ratio <= 100) {
    status = 'on_time';
  } else if (ratio <= 150) {
    status = 'late';
  } else {
    status = 'way_late';
  }
  
  // Lookup factor from Config_Factors
  var factors = loadFactors();
  var factor = 1.0; // Default
  
  if (factors.timeliness && factors.timeliness[status] !== undefined) {
    factor = parseFloat(factors.timeliness[status]) || 1.0;
  }
  
  return {
    ratio: roundTo(ratio, 1),
    status: status,
    factor: factor
  };
}

// ============================================================================
// OVERRIDE FUNCTIONS (for Supervisor)
// ============================================================================

/**
 * Calculate with manual timeliness override
 * SPV can override auto-calculated timeliness if needed
 * 
 * @param {Object} woData - Work order data
 * @param {string} manualTimelinessStatus - 'on_time', 'late', or 'way_late'
 * @return {Object} Response with calculation breakdown
 */
function calculateWithTimelinessOverride(woData, manualTimelinessStatus) {
  var timer = Log.startTimer('calculateWithTimelinessOverride');
  
  try {
    // Get factors
    var factors = loadFactors();
    
    // Validate manual status
    if (!factors.timeliness || factors.timeliness[manualTimelinessStatus] === undefined) {
      return errorResponse(ERROR_CODES.VALIDATION_INVALID, 
                          'Invalid timeliness status: ' + manualTimelinessStatus);
    }
    
    // Get manual factor
    var manualFactor = parseFloat(factors.timeliness[manualTimelinessStatus]) || 1.0;
    
    // Calculate normally first
    var normalResult = calculateFinalPointsDetailed(woData);
    if (!isSuccess(normalResult)) {
      return normalResult;
    }
    
    var breakdown = normalResult.data;
    
    // Store original auto-calculated values
    breakdown.timeliness_auto_status = breakdown.timeliness_status;
    breakdown.timeliness_auto_factor = breakdown.timeliness_factor;
    breakdown.override_applied = true;
    breakdown.override_by = 'supervisor';
    
    // Apply manual override
    breakdown.timeliness_status = manualTimelinessStatus;
    breakdown.timeliness_factor = manualFactor;
    
    // Recalculate final points with override
    var finalPoints = breakdown.base_points * 
                     breakdown.unit_factor * 
                     breakdown.work_condition_factor * 
                     manualFactor * // Use manual factor
                     breakdown.safety_factor * 
                     breakdown.mtbf_factor;
    
    finalPoints = roundTo(finalPoints, 2);
    
    var finalIdr = finalPoints * breakdown.idr_rate;
    finalIdr = Math.round(finalIdr);
    
    breakdown.final_points = finalPoints;
    breakdown.final_idr = finalIdr;
    
    Log.info('calculateWithTimelinessOverride', 'Override applied: ' + 
             breakdown.timeliness_auto_status + ' → ' + manualTimelinessStatus);
    
    timer.end('Calculation with override complete');
    
    return successResponse(breakdown);
    
  } catch (e) {
    Log.exception('calculateWithTimelinessOverride', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// PREVIEW CALCULATION (before approval)
// ============================================================================

/**
 * Preview calculation without saving
 * Used in approval page to show SPV what the final score will be
 * 
 * @param {string} woId - Work Order ID
 * @return {Object} Response with calculation preview
 */
function previewCalculation(woId) {
  var timer = Log.startTimer('previewCalculation');
  
  try {
    // Get WO data
    var wo = getRowById(SHEETS.WORK_ORDERS, woId, 'id');
    if (!wo) {
      return errorResponse(ERROR_CODES.DATA_NOT_FOUND, 'Work order not found: ' + woId);
    }
    
    // Prepare calculation input
    var woData = {
      component_id: wo.component_id,
      unit_id: wo.unit_id,
      work_condition: wo.work_condition,
      actual_hours: parseFloat(wo.actual_hours) || 0,
      has_safety_incident: wo.has_safety_incident || false
    };
    
    // Calculate
    var result = calculateFinalPointsDetailed(woData);
    
    if (!isSuccess(result)) {
      return result;
    }
    
    // Add WO info to breakdown
    result.data.wo_id = woId;
    result.data.wo_number = wo.wo_number;
    result.data.wo_status = wo.status;
    
    timer.end('Preview complete');
    
    return result;
    
  } catch (e) {
    Log.exception('previewCalculation', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// DISTRIBUTE POINTS TO TEAM
// ============================================================================

/**
 * Distribute final points to team members based on percentage
 * 
 * @param {number} totalPoints - Total points to distribute
 * @param {Object} teamDistribution - {mechanic_id: percentage, ...}
 * @return {Object} Response with distribution breakdown
 */


// ============================================================================
// FORMAT HELPERS
// ============================================================================

/**
 * Format calculation breakdown for display
 * 
 * @param {Object} breakdown - Calculation breakdown
 * @return {string} Formatted text
 */
function formatCalculationBreakdown(breakdown) {
  var lines = [];
  
  lines.push('CALCULATION BREAKDOWN');
  lines.push('='.repeat(50));
  lines.push('');
  lines.push('Component: ' + breakdown.component_name);
  if (breakdown.unit_name) {
    lines.push('Unit: ' + breakdown.unit_name);
  }
  lines.push('');
  
  lines.push('FACTORS:');
  lines.push('  Base Points:       ' + breakdown.base_points);
  lines.push('  Unit Factor:       ' + breakdown.unit_factor + 'x');
  lines.push('  Work Condition:    ' + breakdown.work_condition + ' (' + breakdown.work_condition_factor + 'x)');
  lines.push('  Timeliness:        ' + breakdown.timeliness_status + ' (' + breakdown.timeliness_factor + 'x)');
  lines.push('    - Target:        ' + breakdown.target_hours + ' hours');
  lines.push('    - Actual:        ' + breakdown.actual_hours + ' hours');
  lines.push('    - Ratio:         ' + breakdown.timeliness_ratio + '%');
  lines.push('  Safety:            ' + (breakdown.has_safety_incident ? 'INCIDENT' : 'No incident') + ' (' + breakdown.safety_factor + 'x)');
  lines.push('  MTBF:              ' + breakdown.mtbf_factor + 'x (not implemented)');
  lines.push('');
  
  lines.push('CALCULATION:');
  lines.push('  ' + breakdown.formula);
  lines.push('');
  
  lines.push('FINAL RESULT:');
  lines.push('  Points: ' + breakdown.final_points);
  lines.push('  IDR:    Rp ' + formatIdr(breakdown.final_idr));
  
  return lines.join('\n');
}

// ============================================================================
// TESTING
// ============================================================================

/**
 * Test calculation engine
 */
function testPointsCalculation() {
  Log.separator('Testing PointsCalculation.gs');
  
  console.log('');
  console.log('TEST CASE: Intercooler + CAT 320 + extreme + late (7 hours)');
  console.log('='.repeat(80));
  
  var woData = {
    component_id: 'COM-001',  // Intercooler
    unit_id: 'UNIT-001',      // CAT 320
    work_condition: 'extreme',
    actual_hours: 7,
    has_safety_incident: false
  };
  
  var result = calculateFinalPointsDetailed(woData);
  
  if (isSuccess(result)) {
    console.log('');
    console.log('✅ CALCULATION SUCCESS!');
    console.log('');
    console.log(formatCalculationBreakdown(result.data));
    console.log('');
    console.log('Expected: 3.456 points = Rp 172,800');
    console.log('Actual:   ' + result.data.final_points + ' points = Rp ' + formatIdr(result.data.final_idr));
    console.log('');
    
    if (result.data.final_points === 3.456 && result.data.final_idr === 172800) {
      console.log('🎉 TEST PASSED!');
    } else {
      console.log('❌ TEST FAILED - Numbers do not match!');
    }
  } else {
    console.log('❌ ERROR: ' + result.message);
  }
  
  Log.separator('Test complete');
}