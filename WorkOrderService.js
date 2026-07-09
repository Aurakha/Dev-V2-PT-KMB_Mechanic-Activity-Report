/**
 * ============================================================================
 * WorkOrderService.gs - Work Order Lifecycle Management
 * ============================================================================
 * 
 * Production-grade WO service managing complete lifecycle.
 * 
 * ============================================================================
 * LIFECYCLE STATES — Workflow B (active May 2026):
 *   pending_mechanic_work → in_progress → pending_supervisor → 
 *   pending_superintendent → approved / rejected
 * 
 * Legacy Workflow A (still supported via separate functions):
 *   created → in_progress → wait_mtbf → pending_supervisor → 
 *   pending_superintendent → approved / rejected
 * ============================================================================
 * 
 * Features:
 * - WO creation with validation (Workflow B)
 * - Team management (add/remove/update distribution)
 * - Status transitions with state machine validation
 * - MTBF wait period enforcement (legacy)
 * - Safety incident handling
 * - Complete audit trail integration
 * 
 * Dependencies: All foundation + MtbfService, ScoringService, AuditService
 * ============================================================================
 */

// ============================================================================
// WORK ORDER CREATION (Workflow B)
// ============================================================================

/**
 * Create new work order — Workflow B
 * 
 * Workflow B status flow:
 *   pending_mechanic_work → in_progress → pending_supervisor → 
 *   pending_superintendent → approved
 * 
 * Supervisor creates WO with work_condition. Mechanic later inputs
 * start_time / end_time to begin work and submit for approval.
 * 
 * @param {String} componentId   - Component ID (COM-XXX)
 * @param {String} unitId        - Unit ID (UNIT-XXX)
 * @param {String} workCondition - 'normal' | 'difficult' | 'extreme'
 * @param {Array}  teamMembers   - Array of {mechanic_id, percentage}
 * @param {String} createdBy     - Email of creator (supervisor/superintendent)
 * @return {Object} Direct response {wo_id, wo_number, status, work_condition, created_at}
 */

/**
 * Create new work order — Workflow B (with Others Job support)
 * 
 * @param {String} componentId    - Component ID (COM-XXX or COM-OTHERS)
 * @param {String} unitId         - Unit ID (UNIT-XXX) or null for Others
 * @param {String} workCondition  - 'normal' | 'difficult' | 'extreme'
 * @param {Array}  teamMembers    - Array of {mechanic_id, percentage}
 * @param {String} createdBy      - Email of creator
 * @param {Object} othersData     - Optional, only for COM-OTHERS:
 *                                   {description, base_points, target_hours, unit_factor}
 * @return {Object} Direct response {wo_id, wo_number, status, work_condition, created_at}
 */
function createWorkOrder(componentId, unitId, workCondition, teamMembers, createdBy, othersData, location, woNumberOverride, sectionData) {
  var timer = Log.startTimer('createWorkOrder');
  
  try {
    // ─── SECTION (Fase 1): tyreman | field | workshop ────────────────────
    var sd = sectionData || {};
    var section = String(sd.section || SECTIONS.TYREMAN).toLowerCase();
    if (VALID_SECTIONS.indexOf(section) === -1) {
      throw new Error('Section tidak valid: ' + section);
    }
    // FASE 1.5: pembuat WO harus punya scope cluster ybs (HO kosong = semua)
    if (!userScopeAllows(getUserSectionScope(createdBy), section)) {
      throw new Error('Anda tidak punya akses membuat WO untuk cluster ' + section);
    }
    // FASE 1.5: pembuat WO harus punya scope cluster ybs (HO kosong = semua)
    if (!userScopeAllows(getUserSectionScope(createdBy), section)) {
      throw new Error('Anda tidak punya akses membuat WO untuk cluster ' + section);
    }
    var isOthers = (componentId === 'COM-OTHERS');
    var jobId = (!isOthers && sd.job_id) ? String(sd.job_id) : null;
    var isJobBased = !!jobId;
    
    // ─── VALIDATION: required fields ─────────────────────────────────────
    if (!isJobBased && !componentId) {
      throw new Error('component_id is required');
    }
    
    if (!workCondition) {
      throw new Error('work_condition is required');
    }
    
    if (section === SECTIONS.TYREMAN && isJobBased) {
      throw new Error('Section tyreman memakai component, bukan job katalog');
    }
    if ((section === SECTIONS.FIELD || section === SECTIONS.WORKSHOP) && !isJobBased && !isOthers) {
      throw new Error('Section ' + section + ' wajib memilih job dari katalog (atau Others)');
    }
    
    // Job-based (field/workshop): validasi job ↔ unit ↔ section satu pintu
    if (isJobBased) {
      var jobCheck = validateJobForSection(jobId, unitId, section);
      if (!jobCheck.valid) {
        throw new Error(jobCheck.error);
      }
    }
    
    // Tyreman non-Others: unit_id wajib
    if (!isJobBased && !isOthers && !unitId) {
      throw new Error('unit_id is required');
    }
    
    // For Others, othersData is required & must have all fields
    if (isOthers) {
      if (!othersData) {
        throw new Error('othersData required for COM-OTHERS');
      }
      if (!othersData.description || othersData.description.trim().length === 0) {
        throw new Error('Job description required for Others');
      }
      if (!othersData.base_points || othersData.base_points <= 0) {
        throw new Error('Base Points must be > 0 for Others');
      }
      if (!othersData.target_hours || othersData.target_hours <= 0) {
        throw new Error('Target Hours must be > 0 for Others');
      }
      if (!othersData.unit_factor || othersData.unit_factor <= 0) {
        throw new Error('Unit Factor must be > 0 for Others');
      }
    }
    
    // ─── VALIDATION: work_condition must be valid key ────────────────────
    var validConditions = [
      WORK_CONDITION_KEYS.NORMAL,
      WORK_CONDITION_KEYS.DIFFICULT,
      WORK_CONDITION_KEYS.EXTREME
    ];
    
    if (validConditions.indexOf(workCondition) === -1) {
      throw new Error('Invalid work_condition: "' + workCondition + 
                      '". Must be one of: ' + validConditions.join(', '));
    }
    
    createdBy = createdBy || getCurrentUser();
    
    // ─── VALIDATION: FULL-POINT — tiap anggota tim wajib percentage 100 ──
    if (teamMembers && teamMembers.length > 0) {
      for (var i = 0; i < teamMembers.length; i++) {
        if (Math.abs(teamMembers[i].percentage - 100) > 0.01) {
          throw new Error('Full-point model: setiap mekanik harus 100 (dapat ' + 
                          teamMembers[i].percentage + ' untuk ' + teamMembers[i].mechanic_id + ')');
        }
      }
    }
    
    // ─── VALIDATION: component exists (jalur component saja) ─────────────
    if (!isJobBased) {
      var component = getComponentById(componentId);
      if (!component) {
        throw new Error('Component not found: ' + componentId);
      }
    }
    
    // ─── VALIDATION: unit exists (tyreman non-Others; field sudah lewat jobCheck) ──
    if (!isJobBased && !isOthers) {
      if (!unitExists(unitId)) {
        throw new Error('Unit not found: ' + unitId);
      }
    }
    
    // ─── BUILD WO RECORD ─────────────────────────────────────────────────
    var woId = generateId(ID_PREFIXES.WORK_ORDER);
    var woNumber = woNumberOverride || generateWoNumber();
    var timestamp = new Date();
    
    var wo = {
      id: woId,
      wo_number: woNumber,
      component_id: isJobBased ? '' : componentId,
      unit_id: isOthers ? 'OTHERS' : ((isJobBased && section === SECTIONS.WORKSHOP) ? 'WORKSHOP' : unitId),
      status: WO_STATUS.PENDING_MECHANIC_WORK,
      created_by: createdBy,
      created_at: timestamp,
      work_condition: workCondition,
      location: location || 'workshop',
      section: section,
      job_id: jobId || '',
      keterangan: String(sd.keterangan || '')
    };
    
    // Add Others-specific fields
    if (isOthers) {
      wo.others_description = othersData.description.trim();
      wo.manual_unit_factor = othersData.unit_factor;
      // Override base_points & target_hours stored as supervisor override
      // sehingga consistent dengan override mechanism yang sudah ada
      wo.override_base_points_supervisor = othersData.base_points;
      wo.override_target_hours_supervisor = othersData.target_hours;
      wo.override_by_supervisor = createdBy;
      wo.override_at_supervisor = timestamp;
    }
    
    // ─── INSERT WO ───────────────────────────────────────────────────────
    var rowNum = appendRow(SHEETS.WORK_ORDERS, wo);
    if (!rowNum) {
      throw new Error('Failed to write to WorkOrders sheet');
    }
    
    Log.info('createWorkOrder', 'WO row inserted', {
      row: rowNum,
      woId: woId,
      status: WO_STATUS.PENDING_MECHANIC_WORK,
      workCondition: workCondition,
      isOthers: isOthers
    });
    
    // ─── INSERT TEAM ENTRIES ─────────────────────────────────────────────
    if (teamMembers && teamMembers.length > 0) {
      var teamEntries = [];
      
      for (var j = 0; j < teamMembers.length; j++) {
        var teamId = generateId(ID_PREFIXES.WORK_ORDER_TEAM);
        
        teamEntries.push({
          id: teamId,
          wo_id: woId,
          mechanic_id: teamMembers[j].mechanic_id,
          percentage: teamMembers[j].percentage,
          is_lead: false
        });
      }
      
      var inserted = bulkAppendRows(SHEETS.WORK_ORDER_TEAM, teamEntries);
      
      if (inserted) {
        Log.info('createWorkOrder', 'Team created', {teamSize: teamEntries.length});
      } else {
        Log.warn('createWorkOrder', 'Team creation failed');
      }
    }
    
    // ─── AUDIT LOG ───────────────────────────────────────────────────────
    logWoCreated(woId, createdBy, wo);
    
    timer.end('WO created', {
      woId: woId,
      woNumber: woNumber,
      status: WO_STATUS.PENDING_MECHANIC_WORK,
      isOthers: isOthers
    });
    
    return {
      wo_id: woId,
      wo_number: woNumber,
      status: WO_STATUS.PENDING_MECHANIC_WORK,
      work_condition: workCondition,
      created_at: timestamp,
      is_others: isOthers
    };
    
  } catch (e) {
    Log.exception('createWorkOrder', e);
    timer.end('Failed');
    throw e;
  }
}

// ============================================================================
// WORK ORDER RETRIEVAL
// ============================================================================

/**
 * Get work order by ID
 */
function getWorkOrderById(woId) {
  var timer = Log.startTimer('getWorkOrderById');
  
  try {
    if (!woId) {
      return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'woId required');
    }
    
    var wo = getRowById(SHEETS.WORK_ORDERS, woId, 'id');
    
    if (!wo) {
      timer.end('Not found');
      return notFoundResponse('WorkOrder', woId);
    }
    
    timer.end('Found');
    return successResponse(wo);
    
  } catch (e) {
    Log.exception('getWorkOrderById', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Get work orders by status
 */
function getWorkOrdersByStatus(status, limit) {
  var timer = Log.startTimer('getWorkOrdersByStatus');
  
  try {
    limit = limit || 100;
    
    var wos = queryRows(SHEETS.WORK_ORDERS, function(wo) {
      return wo.status === status;
    });
    
    if (wos.length > limit) {
      wos = wos.slice(0, limit);
    }
    
    timer.end('Query complete', {status: status, found: wos.length});
    
    return successResponse(wos, {count: wos.length});
    
  } catch (e) {
    Log.exception('getWorkOrdersByStatus', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Get work orders by mechanic
 */
function getWorkOrdersByMechanic(mechanicId, status) {
  var timer = Log.startTimer('getWorkOrdersByMechanic');
  
  try {
    if (!mechanicId) {
      return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'mechanicId required');
    }
    
    var teamEntries = queryRows(SHEETS.WORK_ORDER_TEAM, function(team) {
      return team.mechanic_id === mechanicId;
    });
    
    var woIds = [];
    for (var i = 0; i < teamEntries.length; i++) {
      woIds.push(teamEntries[i].wo_id);
    }
    
    var wos = [];
    for (var j = 0; j < woIds.length; j++) {
      var woResult = getWorkOrderById(woIds[j]);
      if (isSuccess(woResult)) {
        var wo = woResult.data;
        
        if (!status || wo.status === status) {
          wos.push(wo);
        }
      }
    }
    
    timer.end('Query complete', {mechanicId: mechanicId, found: wos.length});
    
    return successResponse(wos, {count: wos.length});
    
  } catch (e) {
    Log.exception('getWorkOrdersByMechanic', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Get active work orders (not approved/rejected)
 */
function getActiveWorkOrders() {
  var timer = Log.startTimer('getActiveWorkOrders');
  
  try {
    var wos = queryRows(SHEETS.WORK_ORDERS, function(wo) {
      return wo.status !== WO_STATUS.APPROVED && wo.status !== WO_STATUS.REJECTED;
    });
    
    timer.end('Query complete', {found: wos.length});
    
    return successResponse(wos, {count: wos.length});
    
  } catch (e) {
    Log.exception('getActiveWorkOrders', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// STATUS TRANSITIONS
// ============================================================================

/**
 * Start work order (legacy: created → in_progress)
 * 
 * NOTE: In Workflow B, mechanic starts work by submitting start_time
 * via a separate MechanicService function. This function kept for
 * backward compat.
 */
function startWorkOrder(woId, startedBy) {
  var timer = Log.startTimer('startWorkOrder');
  
  try {
    startedBy = startedBy || getCurrentUser();
    
    var woResult = getWorkOrderById(woId);
    if (isError(woResult)) return woResult;
    
    var wo = woResult.data;
    
    if (!canTransitionTo(wo.status, WO_STATUS.IN_PROGRESS)) {
      return errorResponse(
        ERROR_CODES.WO_INVALID_STATUS_TRANSITION,
        'Cannot transition from ' + wo.status + ' to in_progress'
      );
    }
    
    var updated = updateRow(SHEETS.WORK_ORDERS, woId, {
      status: WO_STATUS.IN_PROGRESS,
      started_at: new Date()
    }, 'id');
    
    if (!updated) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to start work order');
    }
    
    logWoStarted(woId, startedBy);
    logWoStatusChange(woId, wo.status, WO_STATUS.IN_PROGRESS, startedBy);
    
    timer.end('WO started', {woId: woId});
    
    return successResponse({woId: woId, status: WO_STATUS.IN_PROGRESS});
    
  } catch (e) {
    Log.exception('startWorkOrder', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Finish work order — LEGACY Workflow A (in_progress → wait_mtbf)
 * 
 * @deprecated In Workflow B, mechanic uses submitMechanicWork() which
 *             transitions in_progress → pending_supervisor directly.
 *             This function kept for backward compat with legacy WOs.
 */
function finishWorkOrder(woId, actualHours, workCondition, hasSafetyIncident, finishedBy) {
  var timer = Log.startTimer('finishWorkOrder');
  
  try {
    finishedBy = finishedBy || getCurrentUser();
    
    var validationError = requireField(actualHours, 'actualHours');
    if (validationError) return validationError;
    
    validationError = requireRange(actualHours, 'actualHours', 0, VALIDATION.MAX_TARGET_HOURS);
    if (validationError) return validationError;
    
    validationError = requireOneOf(workCondition, 'workCondition', 
      [WORK_CONDITION_KEYS.NORMAL, WORK_CONDITION_KEYS.DIFFICULT, WORK_CONDITION_KEYS.EXTREME]);
    if (validationError) return validationError;
    
    var woResult = getWorkOrderById(woId);
    if (isError(woResult)) return woResult;
    
    var wo = woResult.data;
    
    if (!canTransitionTo(wo.status, WO_STATUS.WAIT_MTBF)) {
      return errorResponse(
        ERROR_CODES.WO_INVALID_STATUS_TRANSITION,
        'Cannot transition from ' + wo.status + ' to wait_mtbf'
      );
    }
    
    var mtbfResult = calculateMtbf(wo.component_id, wo.unit_id);
    var cumulativeHours = isSuccess(mtbfResult) ? mtbfResult.data.cumulativeHours : 0;
    
    var redoCheck = isRedoJob(cumulativeHours);
    
    var finishedAt = new Date();
    var mtbfTrackingResult = createMtbfTracking(woId, finishedAt);
    var mtbfExpiryDate = isSuccess(mtbfTrackingResult) ? mtbfTrackingResult.data.expiryDate : null;
    
    var updated = updateRow(SHEETS.WORK_ORDERS, woId, {
      status: WO_STATUS.WAIT_MTBF,
      finished_at: finishedAt,
      actual_hours: actualHours,
      work_condition: workCondition,
      safety_incident: hasSafetyIncident || false,
      mtbf_redo_status: redoCheck.status,
      mtbf_expiry_date: mtbfExpiryDate
    }, 'id');
    
    if (!updated) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to finish work order');
    }
    
    logWoFinished(woId, finishedBy, actualHours, workCondition, hasSafetyIncident);
    logWoStatusChange(woId, wo.status, WO_STATUS.WAIT_MTBF, finishedBy);
    
    if (hasSafetyIncident) {
      logSafetyIncident(woId, 'Safety incident during work', finishedBy);
    }
    
    timer.end('WO finished', {
      woId: woId,
      actualHours: actualHours,
      mtbfStatus: redoCheck.status,
      safetyIncident: hasSafetyIncident
    });
    
    return successResponse({
      woId: woId,
      status: WO_STATUS.WAIT_MTBF,
      mtbfExpiryDate: mtbfExpiryDate,
      mtbfStatus: redoCheck.status
    });
    
  } catch (e) {
    Log.exception('finishWorkOrder', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Submit for approval (legacy: wait_mtbf → pending_supervisor)
 * 
 * @deprecated In Workflow B, transition happens automatically inside
 *             submitMechanicWork() after time validation.
 */
function submitForApproval(woId, submittedBy) {
  var timer = Log.startTimer('submitForApproval');
  
  try {
    submittedBy = submittedBy || getCurrentUser();
    
    var woResult = getWorkOrderById(woId);
    if (isError(woResult)) return woResult;
    
    var wo = woResult.data;
    
    if (!canTransitionTo(wo.status, WO_STATUS.PENDING_SUPERVISOR)) {
      return errorResponse(
        ERROR_CODES.WO_INVALID_STATUS_TRANSITION,
        'Cannot transition from ' + wo.status + ' to pending_supervisor'
      );
    }
    
    if (wo.mtbf_expiry_date) {
      var expiryDate = parseDate(wo.mtbf_expiry_date);
      if (expiryDate && new Date() < expiryDate) {
        var remaining = getMtbfTimeRemaining(expiryDate);
        return errorResponse(
          ERROR_CODES.WO_MTBF_NOT_EXPIRED,
          'MTBF wait period not yet expired. Time remaining: ' + formatMtbfCountdown(expiryDate),
          {timeRemaining: remaining}
        );
      }
    }
    
    var updated = updateRow(SHEETS.WORK_ORDERS, woId, {
      status: WO_STATUS.PENDING_SUPERVISOR
    }, 'id');
    
    if (!updated) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to submit for approval');
    }
    
    logWoStatusChange(woId, wo.status, WO_STATUS.PENDING_SUPERVISOR, submittedBy);
    
    timer.end('Submitted for approval', {woId: woId});
    
    return successResponse({woId: woId, status: WO_STATUS.PENDING_SUPERVISOR});
    
  } catch (e) {
    Log.exception('submitForApproval', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Update WO status (generic)
 */
function updateWoStatus(woId, newStatus, updatedBy) {
  var timer = Log.startTimer('updateWoStatus');
  
  try {
    updatedBy = updatedBy || getCurrentUser();
    
    var woResult = getWorkOrderById(woId);
    if (isError(woResult)) return woResult;
    
    var wo = woResult.data;
    
    if (!canTransitionTo(wo.status, newStatus)) {
      return errorResponse(
        ERROR_CODES.WO_INVALID_STATUS_TRANSITION,
        'Invalid transition from ' + wo.status + ' to ' + newStatus
      );
    }
    
    var updated = updateRow(SHEETS.WORK_ORDERS, woId, {status: newStatus}, 'id');
    
    if (!updated) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to update status');
    }
    
    logWoStatusChange(woId, wo.status, newStatus, updatedBy);
    
    timer.end('Status updated', {woId: woId, newStatus: newStatus});
    
    return successResponse({woId: woId, oldStatus: wo.status, newStatus: newStatus});
    
  } catch (e) {
    Log.exception('updateWoStatus', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// TEAM MANAGEMENT
// ============================================================================

/**
 * Get team members for a WO
 */
function getTeamMembers(woId) {
  var timer = Log.startTimer('getTeamMembers');
  
  try {
    if (!woId) {
      return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'woId required');
    }
    
    var team = queryRows(SHEETS.WORK_ORDER_TEAM, function(t) {
      return t.wo_id === woId;
    });
    
    timer.end('Team retrieved', {woId: woId, teamSize: team.length});
    
    return successResponse(team, {count: team.length});
    
  } catch (e) {
    Log.exception('getTeamMembers', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Update team distribution
 */
function updateTeamDistribution(woId, newDistribution, updatedBy) {
  var timer = Log.startTimer('updateTeamDistribution');
  
  try {
    var authCheck = checkAuthorization(APPROVER_ROLES);
    if (isError(authCheck)) return authCheck;
    
    updatedBy = updatedBy || getCurrentUser();
    
    // FULL-POINT: validasi lewat satu sumber kebenaran (Utils.validateTeamDistribution)
    var distValidation = validateTeamDistribution(newDistribution);
    if (!distValidation.valid) {
      return errorResponse(ERROR_CODES.VALIDATION_PERCENTAGE_SUM_INVALID, distValidation.error);
    }
    
    var currentTeamResult = getTeamMembers(woId);
    if (isError(currentTeamResult)) return currentTeamResult;
    
    var currentTeam = currentTeamResult.data;
    var oldDistribution = {};
    
    for (var i = 0; i < currentTeam.length; i++) {
      oldDistribution[currentTeam[i].mechanic_id] = currentTeam[i].percentage;
    }
    
    for (var mId in newDistribution) {
      if (newDistribution.hasOwnProperty(mId)) {
        var newPercentage = newDistribution[mId];
        
        for (var j = 0; j < currentTeam.length; j++) {
          if (currentTeam[j].mechanic_id === mId) {
            updateRow(SHEETS.WORK_ORDER_TEAM, currentTeam[j].id, {
              percentage: newPercentage
            }, 'id');
            break;
          }
        }
      }
    }
    
    logTeamDistributionChange(woId, oldDistribution, newDistribution, updatedBy);
    
    timer.end('Team distribution updated', {woId: woId});
    
    return successResponse({
      woId: woId,
      oldDistribution: oldDistribution,
      newDistribution: newDistribution
    });
    
  } catch (e) {
    Log.exception('updateTeamDistribution', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// SAFETY INCIDENT HANDLING
// ============================================================================

/**
 * Add safety incident to WO
 */
function addSafetyIncident(woId, incidentDetails, reportedBy) {
  var timer = Log.startTimer('addSafetyIncident');
  
  try {
    reportedBy = reportedBy || getCurrentUser();
    
    var woResult = getWorkOrderById(woId);
    if (isError(woResult)) return woResult;
    
    var updated = updateRow(SHEETS.WORK_ORDERS, woId, {
      safety_incident: true
    }, 'id');
    
    if (!updated) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to add safety incident');
    }
    
    logSafetyIncident(woId, incidentDetails, reportedBy);
    
    timer.end('Safety incident added', {woId: woId});
    
    return successResponse({woId: woId, safety_incident: true});
    
  } catch (e) {
    Log.exception('addSafetyIncident', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// BUSINESS RULE HELPERS
// ============================================================================

/**
 * Check if transition is valid
 */
function canTransitionTo(currentStatus, newStatus) {
  return isValidStatusTransition(currentStatus, newStatus);
}

/**
 * Validate status transition
 */
function validateStatusTransition(woId, newStatus) {
  var woResult = getWorkOrderById(woId);
  if (isError(woResult)) return woResult;
  
  var wo = woResult.data;
  
  if (!canTransitionTo(wo.status, newStatus)) {
    return errorResponse(
      ERROR_CODES.WO_INVALID_STATUS_TRANSITION,
      'Cannot transition from ' + wo.status + ' to ' + newStatus
    );
  }
  
  return successResponse({valid: true});
}

/**
 * Check if MTBF wait is required (legacy)
 */
function checkMtbfRequired(woId) {
  var woResult = getWorkOrderById(woId);
  if (isError(woResult)) return woResult;
  
  var wo = woResult.data;
  
  if (wo.status !== WO_STATUS.WAIT_MTBF) {
    return successResponse({required: false, reason: 'Not in wait_mtbf status'});
  }
  
  if (!wo.mtbf_expiry_date) {
    return successResponse({required: false, reason: 'No MTBF expiry date set'});
  }
  
  var expiryDate = parseDate(wo.mtbf_expiry_date);
  if (!expiryDate) {
    return successResponse({required: false, reason: 'Invalid expiry date'});
  }
  
  var now = new Date();
  var expired = now >= expiryDate;
  
  return successResponse({
    required: !expired,
    expiryDate: expiryDate,
    timeRemaining: getMtbfTimeRemaining(expiryDate)
  });
}


// ============================================================================
// WORK ORDER CREATION — BATCH (Workflow B, Feature #7)
// ============================================================================
// 1 submit = N work order. Tiap blok jadi WO sendiri via createWorkOrder yang
// sudah ada (validasi/tim/audit/scoring tetap pakai jalur teruji). Fungsi ini
// hanya orkestrasi + penomoran anti-tabrakan.
//   - 1 blok  : nomor polos, format tak berubah → WO-YYYYMMDD-XXX
//   - >1 blok : base sama + huruf → WO-YYYYMMDD-XXX-A, -B, -C ...
// ============================================================================

function createWorkOrdersBatch(blocks, createdBy) {
  var timer = Log.startTimer('createWorkOrdersBatch');
  try {
    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      throw new Error('blocks array is required and must not be empty');
    }
    createdBy = createdBy || getCurrentUser();

    // Baca SEMUA wo_number sekali (guard anti-tabrakan untuk seluruh batch)
    var existing = {};
    var allWos = readSheetAsObjects(SHEETS.WORK_ORDERS);
    for (var x = 0; x < allWos.length; x++) {
      if (allWos[x] && allWos[x].wo_number) existing[allWos[x].wo_number] = true;
    }

    var isBatch = blocks.length > 1;
    var base = pickCleanWoBase(existing, isBatch);

    var created = [];
    var failed = [];
    var usedThisBatch = {};

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var woNumber = isBatch ? (base + '-' + batchSuffix(i)) : base;

      var guard = 0;
      while ((existing[woNumber] || usedThisBatch[woNumber]) && guard < 50) {
        Utilities.sleep(2);
        base = pickCleanWoBase(existing, isBatch);
        woNumber = isBatch ? (base + '-' + batchSuffix(i)) : base;
        guard++;
      }
      usedThisBatch[woNumber] = true;

      try {
        var result = createSingleBlock(block, createdBy, woNumber);
        created.push(result);
        Log.info('createWorkOrdersBatch', 'Block created', {index: i, wo_number: result.wo_number});
      } catch (be) {
        Log.exception('createWorkOrdersBatch.block', be, {index: i});
        failed.push({index: i, component_id: block ? block.component_id : null, error: be.message});
      }
    }

    timer.end('Batch complete', {requested: blocks.length, created: created.length, failed: failed.length});
    return {
      success: (failed.length === 0),
      total: blocks.length,
      created_count: created.length,
      failed_count: failed.length,
      created: created,
      failed: failed
    };
  } catch (e) {
    Log.exception('createWorkOrdersBatch', e);
    timer.end('Failed');
    throw e;
  }
}

function createSingleBlock(block, createdBy, woNumber) {
  if (!block) throw new Error('block is required');
  var hasJob = !!block.job_id && block.component_id !== 'COM-OTHERS';
  if (!hasJob && !block.component_id) throw new Error('component_id is required');
  if (!block.work_condition) throw new Error('work_condition is required');

  var isOthers = (block.component_id === 'COM-OTHERS');
  if (!hasJob && !isOthers && !block.unit_id) throw new Error('unit_id is required');

  var othersData = null;
  if (isOthers) {
    othersData = {
      description: block.others_description,
      base_points: parseFloat(block.manual_base_points),
      target_hours: parseFloat(block.manual_target_hours),
      unit_factor: parseFloat(block.manual_unit_factor)
    };
  }

  var teamMembers = [];
  if (block.team_distribution) {
    for (var mId in block.team_distribution) {
      if (block.team_distribution.hasOwnProperty(mId)) {
        teamMembers.push({mechanic_id: mId, percentage: parseFloat(block.team_distribution[mId])});
      }
    }
  }
  if (teamMembers.length > 0) {
    // FULL-POINT: tiap anggota wajib 100, tidak ada porsi
    for (var t = 0; t < teamMembers.length; t++) {
      if (Math.abs(teamMembers[t].percentage - 100) > 0.01) {
        throw new Error('Full-point model: setiap mekanik harus 100 (dapat ' + 
                        teamMembers[t].percentage + ' untuk ' + teamMembers[t].mechanic_id + ')');
      }
    }
  }

  var location = block.location || 'workshop';

  // Reuse createWorkOrder; satu-satunya beda = nomor WO eksplisit anti-tabrakan.
  return createWorkOrder(
    block.component_id, block.unit_id, block.work_condition,
    teamMembers, createdBy, othersData, location, woNumber,
    {section: block.section, job_id: block.job_id, keterangan: block.keterangan}
  );
}

function pickCleanWoBase(existing, isBatch) {
  var attempts = 0;
  while (attempts < 100) {
    var base = generateWoNumber();
    var conflict = false;
    if (isBatch) {
      var prefix = base + '-';
      for (var k in existing) {
        if (existing.hasOwnProperty(k) && k.indexOf(prefix) === 0) { conflict = true; break; }
      }
      if (existing[base]) conflict = true;
    } else {
      if (existing[base]) conflict = true;
    }
    if (!conflict) return base;
    Utilities.sleep(2);
    attempts++;
  }
  return generateWoNumber() + '-' + padZero3(Math.floor(Math.random() * 1000));
}

function batchSuffix(index) {
  var n = index + 1;
  var s = '';
  while (n > 0) {
    var rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}