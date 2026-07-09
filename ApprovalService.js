/**
 * ============================================================================
 * ApprovalService.gs - 3-Layer Approval Workflow
 * ============================================================================
 * v2.8 — Archive approved WOs (ArchiveService.gs): superintendentApprove memindah ke arsip;
 *         getApprovedWosForManagement + cancelWorkOrder kini archive-aware (baca/tulis 2 sheet)
 * v2.5 — Override badge fix: has_spv/supt_override_* flags for independent display
 * v2.4 — Map-lookup optimization
 * v2.3 — cancelWorkOrder: zero out MechanicPoints + final_points
 * v2.2 — getApprovedWosForManagement + getAllActiveWosForManagement
 * ============================================================================
 */

function _buildIdMap(arr, keyField) {
  var map = {};
  if (!arr) return map;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i][keyField]) map[arr[i][keyField]] = arr[i];
  }
  return map;
}

function _buildTeamMap() {
  var allTeams = queryRows(SHEETS.WORK_ORDER_TEAM, function() { return true; });
  var map = {};
  for (var i = 0; i < allTeams.length; i++) {
    var te = allTeams[i];
    if (!map[te.wo_id]) map[te.wo_id] = [];
    map[te.wo_id].push(te);
  }
  return map;
}

function submitToSupervisor(woId, submittedBy) { return submitForApproval(woId, submittedBy); }

function submitToSuperintendent(woId, submittedBy) {
  var timer = Log.startTimer('submitToSuperintendent');
  try {
    submittedBy = submittedBy || getCurrentUser();
    var woResult = getWorkOrderById(woId);
    if (isError(woResult)) return woResult;
    var wo = woResult.data;
    if (wo.status !== WO_STATUS.PENDING_SUPERVISOR) return errorResponse(ERROR_CODES.WO_INVALID_STATUS_TRANSITION, 'WO must be in pending_supervisor status');
    var updated = updateRow(SHEETS.WORK_ORDERS, woId, {status: WO_STATUS.PENDING_SUPERINTENDENT}, 'id');
    if (!updated) return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to submit to superintendent');
    logWoStatusChange(woId, wo.status, WO_STATUS.PENDING_SUPERINTENDENT, submittedBy);
    timer.end('Submitted to superintendent', {woId: woId});
    return successResponse({woId: woId, status: WO_STATUS.PENDING_SUPERINTENDENT});
  } catch (e) { Log.exception('submitToSuperintendent', e); timer.end('Failed'); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function supervisorApprove(woId, approverEmail, notes, safetyIncident, mtbfStatus) {
  var timer = Log.startTimer('supervisorApprove');
  try {
    var authCheck = checkAuthorization([ROLES.SUPERVISOR, ROLES.SUPERINTENDENT]);
    if (isError(authCheck)) return authCheck;
    approverEmail = approverEmail || getCurrentUser();
    var woResult = getWorkOrderById(woId);
    if (isError(woResult)) return woResult;
    var wo = woResult.data;
    // FASE 1.5: scope cluster
    if (!userScopeAllows(getUserSectionScope(approverEmail), wo.section)) {
      return errorResponse(ERROR_CODES.AUTH_PERMISSION_DENIED, 'WO cluster ' + (wo.section || '(lama)') + ' di luar scope Anda');
    }
    if (wo.status !== WO_STATUS.PENDING_SUPERVISOR) return errorResponse(ERROR_CODES.APPROVAL_INVALID_STAGE, 'WO must be in pending_supervisor status');
    // ── #5 Layer 1: Record safety incident + MTBF judgment (info only → no point impact yet) + approved_by ──
    updateRow(SHEETS.WORK_ORDERS, woId, {
      safety_incident: safetyIncident ? true : false,
      approved_by_supervisor: approverEmail,
      mtbf_redo_status: mtbfStatus || 'first_time'
    }, 'id');
    var approvalId = generateId(ID_PREFIXES.APPROVAL);
    var rowNum = appendRow(SHEETS.APPROVALS, {id: approvalId, wo_id: woId, stage: APPROVAL_STAGES.SUPERVISOR, decision: APPROVAL_DECISIONS.APPROVE, approver_email: approverEmail, approved_at: new Date()});
    if (!rowNum) return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to create approval record');
    var submitResult = submitToSuperintendent(woId, approverEmail);
    if (isError(submitResult)) return submitResult;
    logSupervisorApprove(woId, approverEmail, notes);
    timer.end('Supervisor approved', {woId: woId, safetyIncident: !!safetyIncident});
    return successResponse({woId: woId, approvalId: approvalId, status: WO_STATUS.PENDING_SUPERINTENDENT});
  } catch (e) { Log.exception('supervisorApprove', e); timer.end('Failed'); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function supervisorReject(woId, approverEmail, rejectionReason) {
  var timer = Log.startTimer('supervisorReject');
  try {
    var authCheck = checkAuthorization([ROLES.SUPERVISOR, ROLES.SUPERINTENDENT]);
    if (isError(authCheck)) return authCheck;
    approverEmail = approverEmail || getCurrentUser();
    var validationError = requireField(rejectionReason, 'rejectionReason');
    if (validationError) return validationError;
    var woResult = getWorkOrderById(woId);
    if (isError(woResult)) return woResult;
    var wo = woResult.data;
    if (wo.status !== WO_STATUS.PENDING_SUPERVISOR) return errorResponse(ERROR_CODES.APPROVAL_INVALID_STAGE, 'WO must be in pending_supervisor status');
    var approvalId = generateId(ID_PREFIXES.APPROVAL);
    appendRow(SHEETS.APPROVALS, {id: approvalId, wo_id: woId, stage: APPROVAL_STAGES.SUPERVISOR, decision: APPROVAL_DECISIONS.REJECT, approver_email: approverEmail, approved_at: new Date()});
    updateRow(SHEETS.WORK_ORDERS, woId, {status: WO_STATUS.REJECTED}, 'id');
    logSupervisorReject(woId, approverEmail, rejectionReason);
    timer.end('Supervisor rejected', {woId: woId});
    return successResponse({woId: woId, approvalId: approvalId, status: WO_STATUS.REJECTED, reason: rejectionReason});
  } catch (e) { Log.exception('supervisorReject', e); timer.end('Failed'); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function superintendentApprove(woId, approverEmail, notes, safetyIncident, mtbfStatus) {
  var timer = Log.startTimer('superintendentApprove');
  try {
    var authCheck = checkAuthorization([ROLES.SUPERINTENDENT]);
    if (isError(authCheck)) return authCheck;
    approverEmail = approverEmail || getCurrentUser();
    var woResult = getWorkOrderById(woId);
    if (isError(woResult)) return woResult;
    var wo = woResult.data;
    // FASE 1.5: scope cluster
    if (!userScopeAllows(getUserSectionScope(approverEmail), wo.section)) {
      return errorResponse(ERROR_CODES.AUTH_PERMISSION_DENIED, 'WO cluster ' + (wo.section || '(lama)') + ' di luar scope Anda');
    }
    if (wo.status !== WO_STATUS.PENDING_SUPERINTENDENT) return errorResponse(ERROR_CODES.APPROVAL_INVALID_STAGE, 'WO must be in pending_superintendent status');
    // ── #5 Layer 2: Record final safety decision + final MTBF judgment to sheet ──
    var isSafetyIncident = safetyIncident ? true : false;
    var finalMtbfStatus = mtbfStatus || wo.mtbf_redo_status || 'first_time';
    updateRow(SHEETS.WORK_ORDERS, woId, {safety_incident: isSafetyIncident, mtbf_redo_status: finalMtbfStatus}, 'id');
    var approvalId = generateId(ID_PREFIXES.APPROVAL);
    appendRow(SHEETS.APPROVALS, {id: approvalId, wo_id: woId, stage: APPROVAL_STAGES.SUPERINTENDENT, decision: APPROVAL_DECISIONS.APPROVE, approver_email: approverEmail, approved_at: new Date()});
    var teamDistribution = {};
    var overrideTeamJson = wo.override_team_superintendent || wo.override_team_supervisor || null;
    if (overrideTeamJson && overrideTeamJson !== '') {
      try { var overrideTeam = JSON.parse(overrideTeamJson); for (var ot = 0; ot < overrideTeam.length; ot++) teamDistribution[overrideTeam[ot].mechanic_id] = roundTo(parseFloat(overrideTeam[ot].percentage), 1); }
      catch (e) { Log.warn('superintendentApprove', 'Failed to parse override team', {error: e.message}); overrideTeamJson = null; }
    }
    if (!overrideTeamJson || overrideTeamJson === '') {
      var teamResult = getTeamMembers(woId);
      if (isSuccess(teamResult)) { var team = teamResult.data; for (var i = 0; i < team.length; i++) teamDistribution[team[i].mechanic_id] = roundTo(parseFloat(team[i].percentage) || 0, 1); }
    }
    var effectiveWo = {};
    for (var k in wo) { if (wo.hasOwnProperty(k)) effectiveWo[k] = wo[k]; }
    // ── #5 Layer 2: Set safety_incident on effectiveWo → scoring picks it up ──
    effectiveWo.safety_incident = isSafetyIncident;
    // ── MTBF: Set final MTBF status on effectiveWo → scoring applies redo/first_time factor ──
    effectiveWo.mtbf_redo_status = finalMtbfStatus;
    var overrideBP = (wo.override_base_points_superintendent !== null && wo.override_base_points_superintendent !== undefined && wo.override_base_points_superintendent !== '')
      ? wo.override_base_points_superintendent
      : ((wo.override_base_points_supervisor !== null && wo.override_base_points_supervisor !== undefined && wo.override_base_points_supervisor !== '') ? wo.override_base_points_supervisor : null);
    if (overrideBP !== null) effectiveWo._override_base_points = parseFloat(overrideBP);
    var overrideTH = (wo.override_target_hours_superintendent !== null && wo.override_target_hours_superintendent !== undefined && wo.override_target_hours_superintendent !== '')
      ? wo.override_target_hours_superintendent
      : ((wo.override_target_hours_supervisor !== null && wo.override_target_hours_supervisor !== undefined && wo.override_target_hours_supervisor !== '') ? wo.override_target_hours_supervisor : null);
    if (overrideTH !== null) effectiveWo._override_target_hours = parseFloat(overrideTH);
    var scoreResult = calculateScore(effectiveWo, teamDistribution);
    if (isError(scoreResult)) { Log.error('superintendentApprove', 'Scoring failed', {woId: woId}); return scoreResult; }
    var scoreBreakdown = scoreResult.data.breakdown;
    var finalPoints = scoreResult.data.finalPoints;
    createScoringSnapshot(woId, scoreBreakdown);
    var distResult = distributePointsToTeam(finalPoints, teamDistribution);
    if (isSuccess(distResult)) awardPointsToMechanics(woId, distResult.data.distributions);
    updateRow(SHEETS.WORK_ORDERS, woId, {status: WO_STATUS.APPROVED, final_points: roundTo(finalPoints, 2)}, 'id');
    logSuperintendentApprove(woId, approverEmail, notes);
    // ── v2.8: Pindahkan WO ke arsip (best-effort). Kalau gagal, WO tetap di WorkOrders
    //          dan queryApprovedWorkOrders tetap menemukannya. Tidak memutus approval. ──
    try { archiveWorkOrder(woId); } catch (archErr) { Log.warn('superintendentApprove', 'Archive gagal (WO tetap di WorkOrders)', {woId: woId, error: archErr.message}); }
    timer.end('Superintendent approved', {woId: woId, finalPoints: finalPoints, safetyIncident: isSafetyIncident});
    return successResponse({woId: woId, approvalId: approvalId, status: WO_STATUS.APPROVED, finalPoints: finalPoints, scoreBreakdown: scoreBreakdown});
  } catch (e) { Log.exception('superintendentApprove', e); timer.end('Failed'); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function superintendentReject(woId, approverEmail, rejectionReason) {
  var timer = Log.startTimer('superintendentReject');
  try {
    var authCheck = checkAuthorization([ROLES.SUPERINTENDENT]);
    if (isError(authCheck)) return authCheck;
    approverEmail = approverEmail || getCurrentUser();
    var validationError = requireField(rejectionReason, 'rejectionReason');
    if (validationError) return validationError;
    var woResult = getWorkOrderById(woId);
    if (isError(woResult)) return woResult;
    var wo = woResult.data;
    // FASE 1.5: scope cluster
    if (!userScopeAllows(getUserSectionScope(approverEmail), wo.section)) {
      return errorResponse(ERROR_CODES.AUTH_PERMISSION_DENIED, 'WO cluster ' + (wo.section || '(lama)') + ' di luar scope Anda');
    }
    if (wo.status !== WO_STATUS.PENDING_SUPERINTENDENT) return errorResponse(ERROR_CODES.APPROVAL_INVALID_STAGE, 'WO must be in pending_superintendent status');
    var approvalId = generateId(ID_PREFIXES.APPROVAL);
    appendRow(SHEETS.APPROVALS, {id: approvalId, wo_id: woId, stage: APPROVAL_STAGES.SUPERINTENDENT, decision: APPROVAL_DECISIONS.REJECT, approver_email: approverEmail, approved_at: new Date()});
    updateRow(SHEETS.WORK_ORDERS, woId, {status: WO_STATUS.REJECTED}, 'id');
    logSuperintendentReject(woId, approverEmail, rejectionReason);
    timer.end('Superintendent rejected', {woId: woId});
    return successResponse({woId: woId, approvalId: approvalId, status: WO_STATUS.REJECTED, reason: rejectionReason});
  } catch (e) { Log.exception('superintendentReject', e); timer.end('Failed'); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function superintendentSendBackToSupervisor(woId, approverEmail, reason) {
  var timer = Log.startTimer('superintendentSendBackToSupervisor');
  try {
    var authCheck = checkAuthorization([ROLES.SUPERINTENDENT]);
    if (isError(authCheck)) return authCheck;
    approverEmail = approverEmail || getCurrentUser();
    var woResult = getWorkOrderById(woId);
    if (isError(woResult)) return woResult;
    var wo = woResult.data;
    // FASE 1.5: scope cluster
    if (!userScopeAllows(getUserSectionScope(approverEmail), wo.section)) {
      return errorResponse(ERROR_CODES.AUTH_PERMISSION_DENIED, 'WO cluster ' + (wo.section || '(lama)') + ' di luar scope Anda');
    }
    if (wo.status !== WO_STATUS.PENDING_SUPERINTENDENT) return errorResponse(ERROR_CODES.APPROVAL_INVALID_STAGE, 'WO must be in pending_superintendent status');
    updateRow(SHEETS.WORK_ORDERS, woId, {status: WO_STATUS.PENDING_SUPERVISOR}, 'id');
    logWoStatusChange(woId, WO_STATUS.PENDING_SUPERINTENDENT, WO_STATUS.PENDING_SUPERVISOR, approverEmail, reason);
    timer.end('Sent back to supervisor', {woId: woId});
    return successResponse({woId: woId, status: WO_STATUS.PENDING_SUPERVISOR, reason: reason});
  } catch (e) { Log.exception('superintendentSendBackToSupervisor', e); timer.end('Failed'); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function superintendentOverrideAll(woId, overrides, reason, approverEmail) {
  var timer = Log.startTimer('superintendentOverrideAll');
  try {
    var authCheck = checkAuthorization([ROLES.SUPERINTENDENT]);
    if (isError(authCheck)) return authCheck;
    approverEmail = approverEmail || getCurrentUser();
    var validationError = requireField(reason, 'reason');
    if (validationError) return validationError;
    var woResult = getWorkOrderById(woId);
    if (isError(woResult)) return woResult;
    if (overrides.work_condition_factor) overrideWorkConditionFactor(woId, overrides.work_condition_factor, reason, approverEmail);
    if (overrides.timeliness_factor) overrideTimelinessFactor(woId, overrides.timeliness_factor, reason, approverEmail);
    if (overrides.mtbf_status) overrideMtbfStatus(woId, overrides.mtbf_status, reason, approverEmail);
    if (overrides.team_distribution) updateTeamDistribution(woId, overrides.team_distribution, approverEmail);
    var wo = getWorkOrderById(woId).data;
    if (wo.status !== WO_STATUS.PENDING_SUPERINTENDENT) updateRow(SHEETS.WORK_ORDERS, woId, {status: WO_STATUS.PENDING_SUPERINTENDENT}, 'id');
    var approveResult = superintendentApprove(woId, approverEmail, 'Overridden and approved: ' + reason);
    timer.end('Superintendent override complete', {woId: woId});
    return approveResult;
  } catch (e) { Log.exception('superintendentOverrideAll', e); timer.end('Failed'); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function getApprovalsByWoId(woId) {
  var timer = Log.startTimer('getApprovalsByWoId');
  try {
    if (!woId) return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'woId required');
    var approvals = queryRows(SHEETS.APPROVALS, function(a) { return a.wo_id === woId; });
    approvals.sort(function(a, b) { var timeA = parseDate(a.approved_at); var timeB = parseDate(b.approved_at); if (!timeA || !timeB) return 0; return timeA.getTime() - timeB.getTime(); });
    timer.end('Approvals retrieved', {woId: woId, count: approvals.length});
    return successResponse(approvals, {count: approvals.length});
  } catch (e) { Log.exception('getApprovalsByWoId', e); timer.end('Failed'); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function getPendingApprovals(approverEmail) {
  var timer = Log.startTimer('getPendingApprovals');
  try {
    approverEmail = approverEmail || getCurrentUser();
    var user = getCurrentUserWithRole();
    if (!user || !user.email || !user.role) return errorResponse(ERROR_CODES.AUTH_USER_NOT_FOUND, 'User not found or invalid');
    var role = user.role;
    var wos;
    if (role === ROLES.SUPERINTENDENT) { wos = queryRows(SHEETS.WORK_ORDERS, function(wo) { return wo.status === WO_STATUS.PENDING_SUPERVISOR || wo.status === WO_STATUS.PENDING_SUPERINTENDENT; }); }
    else if (role === ROLES.SUPERVISOR) { wos = queryRows(SHEETS.WORK_ORDERS, function(wo) { return wo.status === WO_STATUS.PENDING_SUPERVISOR; }); }
    else { return successResponse([], {count: 0}); }
    // FASE 1.5: batasi daftar sesuai scope cluster approver (kosong = HO lihat semua)
    var listScope = getUserSectionScope(user.email);
    if (listScope) {
      var scoped = [];
      for (var si = 0; si < wos.length; si++) { if (userScopeAllows(listScope, wos[si].section)) scoped.push(wos[si]); }
      wos = scoped;
    }
    timer.end('Pending approvals retrieved', {count: wos.length});
    return successResponse(wos, {count: wos.length});
  } catch (e) { Log.exception('getPendingApprovals', e); timer.end('Failed'); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function getApprovalHistory(woId) { return getApprovalsByWoId(woId); }
function getCurrentApprovalStage(woId) {
  var woResult = getWorkOrderById(woId); if (isError(woResult)) return woResult;
  var wo = woResult.data; var stage = null;
  if (wo.status === WO_STATUS.PENDING_SUPERVISOR) stage = APPROVAL_STAGES.SUPERVISOR;
  else if (wo.status === WO_STATUS.PENDING_SUPERINTENDENT) stage = APPROVAL_STAGES.SUPERINTENDENT;
  return successResponse({woId: woId, currentStage: stage, status: wo.status});
}

// ============================================================================
// ENRICH PENDING APPROVALS — v2.7 (#1 hour_meter/km + #5 safety_incident + approved card incident flag)
// ============================================================================

function _hasValue(val) {
  return val !== null && val !== undefined && val !== '';
}

function getPendingApprovalsEnriched(approverEmail) {
  var timer = Log.startTimer('getPendingApprovalsEnriched');
  try {
    var basicResult = getPendingApprovals(approverEmail);
    if (isError(basicResult)) return basicResult;
    var wos = basicResult.data;
    if (wos.length === 0) { timer.end('No pending approvals'); return successResponse([], {count: 0}); }

    var compMap = _buildIdMap(loadComponents(), 'component_no');
    var unitMap = _buildIdMap(loadUnits(), 'unit_id');
    var mechMap = _buildIdMap(getMechanicsByRole(ROLES.MECHANIC), 'mechanic_id');
    var teamMap = _buildTeamMap();

    var enriched = [];
    for (var i = 0; i < wos.length; i++) {
      var wo = wos[i];
      var isOthers = (wo.component_id === 'COM-OTHERS');

      var componentInfo;
      if (isOthers) {
        componentInfo = {component_no: 'COM-OTHERS', component_name: 'Others - Custom Job', category: 'OTHERS', base_points: parseFloat(wo.override_base_points_supervisor) || 0, target_hours: parseFloat(wo.override_target_hours_supervisor) || 0};
      } else {
        var comp = compMap[wo.component_id];
        componentInfo = comp ? {component_no: comp.component_no, component_name: comp.component_name, category: comp.category, base_points: parseFloat(comp.base_points) || 0, target_hours: parseFloat(comp.target_hours) || 0}
          : {component_no: wo.component_id, component_name: 'Unknown', category: 'N/A', base_points: 0, target_hours: 0};
      }

      var unitInfo;
      if (isOthers) {
        unitInfo = {unit_id: 'OTHERS', unit_name: wo.others_description || 'Custom Job', unit_type: 'OTHERS', unit_factor: parseFloat(wo.manual_unit_factor) || 1.0};
      } else {
        var unit = unitMap[wo.unit_id];
        unitInfo = unit ? {unit_id: unit.unit_id, unit_name: unit.unit_name, unit_type: unit.unit_type || '', unit_factor: parseFloat(unit.unit_factor) || 1.0}
          : {unit_id: wo.unit_id, unit_name: 'Unknown', unit_type: '', unit_factor: 1.0};
      }

      var teamRaw = teamMap[wo.id] || [];
      var teamEnriched = [];
      for (var t = 0; t < teamRaw.length; t++) {
        var member = teamRaw[t]; var mech = mechMap[member.mechanic_id];
        teamEnriched.push({mechanic_id: member.mechanic_id, mechanic_name: mech ? mech.mechanic_name : member.mechanic_id, email: mech ? mech.email : '', percentage: parseFloat(member.percentage) || 0});
      }

      var effectiveBasePoints  = getEffectiveBasePoints(wo, componentInfo.base_points, isOthers);
      var effectiveTargetHours = getEffectiveTargetHours(wo, componentInfo.target_hours, isOthers);
      var effectiveTeam        = getEffectiveTeam(wo, teamEnriched);

      var timelinessInfo = null;
      var actualHrs = parseFloat(wo.actual_hours) || 0;
      var targetHrs = effectiveTargetHours.value;
      if (actualHrs > 0 && targetHrs > 0) {
        var ratio = actualHrs / targetHrs; var tStatus, tLabel, tFactor;
        if (ratio <= 1.0) { tStatus = 'on_time'; tLabel = 'ON TIME'; tFactor = 1.0; }
        else if (ratio <= 1.5) { tStatus = 'late'; tLabel = 'LATE'; tFactor = 0.8; }
        else { tStatus = 'way_late'; tLabel = 'WAY LATE'; tFactor = 0.5; }
        timelinessInfo = {status: tStatus, label: tLabel, factor: tFactor, ratio_percent: Math.round(ratio * 100), actual_hours: actualHrs, target_hours: targetHrs};
      }

      enriched.push({
        id: wo.id, wo_number: wo.wo_number, status: wo.status, work_condition: wo.work_condition,
        actual_hours: wo.actual_hours, created_by: wo.created_by, created_at: wo.created_at,
        approved_by_supervisor: wo.approved_by_supervisor, is_others: isOthers,
        others_description: wo.others_description || null, location: wo.location || 'workshop',
        // ── #1: Hour meter & kilometers ──
        hour_meter: wo.hour_meter || null,
        kilometers: wo.kilometers || null,
        // ── #5: Safety incident flag (for auto-pre-check in approve modal) ──
        safety_incident: wo.safety_incident === true || wo.safety_incident === 'true' || wo.safety_incident === 'TRUE',
        // ── MTBF: redo status (for pre-fill in approve modal) ──
        mtbf_redo_status: wo.mtbf_redo_status || 'first_time',
        timeliness: timelinessInfo, component: componentInfo, unit: unitInfo, team: teamEnriched,
        effective_base_points: effectiveBasePoints.value, effective_base_points_source: effectiveBasePoints.source,
        effective_target_hours: effectiveTargetHours.value, effective_target_hours_source: effectiveTargetHours.source,
        effective_team: effectiveTeam.team, effective_team_source: effectiveTeam.source,
        override_base_points_supervisor: wo.override_base_points_supervisor || null,
        override_base_points_superintendent: wo.override_base_points_superintendent || null,
        override_target_hours_supervisor: wo.override_target_hours_supervisor || null,
        override_target_hours_superintendent: wo.override_target_hours_superintendent || null,
        override_team_supervisor: wo.override_team_supervisor || null,
        override_team_superintendent: wo.override_team_superintendent || null,
        override_by_supervisor: wo.override_by_supervisor || null,
        override_by_superintendent: wo.override_by_superintendent || null,
        has_spv_override_bp:    isOthers ? _hasValue(wo.override_at_supervisor) : _hasValue(wo.override_base_points_supervisor),
        has_supt_override_bp:   _hasValue(wo.override_base_points_superintendent),
        has_spv_override_th:    isOthers ? _hasValue(wo.override_at_supervisor) : _hasValue(wo.override_target_hours_supervisor),
        has_supt_override_th:   _hasValue(wo.override_target_hours_superintendent),
        has_spv_override_team:  !isOthers && _hasValue(wo.override_team_supervisor),
        has_supt_override_team: _hasValue(wo.override_team_superintendent)
      });
    }

    timer.end('Enriched pending approvals', {count: enriched.length});
    return successResponse(enriched, {count: enriched.length});
  } catch (e) { Log.exception('getPendingApprovalsEnriched', e); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function getEffectiveBasePoints(wo, originalBasePoints, isOthers) {
  if (_hasValue(wo.override_base_points_superintendent)) return {value: parseFloat(wo.override_base_points_superintendent), source: 'superintendent'};
  if (!isOthers && _hasValue(wo.override_base_points_supervisor)) return {value: parseFloat(wo.override_base_points_supervisor), source: 'supervisor'};
  return {value: originalBasePoints, source: 'original'};
}

function getEffectiveTargetHours(wo, originalTargetHours, isOthers) {
  if (_hasValue(wo.override_target_hours_superintendent)) return {value: parseFloat(wo.override_target_hours_superintendent), source: 'superintendent'};
  if (!isOthers && _hasValue(wo.override_target_hours_supervisor)) return {value: parseFloat(wo.override_target_hours_supervisor), source: 'supervisor'};
  return {value: originalTargetHours, source: 'original'};
}

function getEffectiveTeam(wo, originalTeam) {
  if (wo.override_team_superintendent && wo.override_team_superintendent !== '') {
    try { return {team: enrichTeamData(JSON.parse(wo.override_team_superintendent)), source: 'superintendent'}; } catch (e) { Log.warn('getEffectiveTeam', 'Failed to parse SUPT team override'); }
  }
  if (wo.override_team_supervisor && wo.override_team_supervisor !== '') {
    try { return {team: enrichTeamData(JSON.parse(wo.override_team_supervisor)), source: 'supervisor'}; } catch (e) { Log.warn('getEffectiveTeam', 'Failed to parse SPV team override'); }
  }
  return {team: originalTeam, source: 'original'};
}

function enrichTeamData(teamArray) {
  var enriched = [];
  for (var i = 0; i < teamArray.length; i++) {
    var member = teamArray[i]; var mech = getMechanicById(member.mechanic_id);
    enriched.push({mechanic_id: member.mechanic_id, mechanic_name: mech ? mech.mechanic_name : member.mechanic_id, email: mech ? mech.email : '', percentage: parseFloat(member.percentage) || 0});
  }
  return enriched;
}

function saveOverride(woId, overrideData, userEmail) {
  var timer = Log.startTimer('saveOverride');
  try {
    var authCheck = checkAuthorization([ROLES.SUPERVISOR, ROLES.SUPERINTENDENT]);
    if (isError(authCheck)) return authCheck;
    userEmail = userEmail || getCurrentUser();
    var user = getCurrentUserWithRole();
    if (!user || !user.role) return errorResponse(ERROR_CODES.AUTH_USER_NOT_FOUND, 'User not found');
    var role = user.role.toLowerCase();
    var suffix;
    if (role === ROLES.SUPERINTENDENT) suffix = '_superintendent';
    else if (role === ROLES.SUPERVISOR) suffix = '_supervisor';
    else return errorResponse(ERROR_CODES.AUTH_PERMISSION_DENIED, 'Only supervisor or superintendent can override');
    var woResult = getWorkOrderById(woId);
    if (isError(woResult)) return woResult;
    // FASE 1.5: scope cluster
    if (!userScopeAllows(getUserSectionScope(userEmail), woResult.data.section)) {
      return errorResponse(ERROR_CODES.AUTH_PERMISSION_DENIED, 'WO cluster ' + (woResult.data.section || '(lama)') + ' di luar scope Anda');
    }
    if (overrideData.base_points !== undefined && overrideData.base_points !== null && overrideData.base_points !== '') {
      var bp = parseFloat(overrideData.base_points);
      if (isNaN(bp) || bp < 0 || bp > VALIDATION.MAX_BASE_POINTS) return errorResponse(ERROR_CODES.VALIDATION_OUT_OF_RANGE, 'Base points must be 0-' + VALIDATION.MAX_BASE_POINTS);
    }
    if (overrideData.target_hours !== undefined && overrideData.target_hours !== null && overrideData.target_hours !== '') {
      var th = parseFloat(overrideData.target_hours);
      if (isNaN(th) || th < 0 || th > VALIDATION.MAX_TARGET_HOURS) return errorResponse(ERROR_CODES.VALIDATION_OUT_OF_RANGE, 'Target hours must be 0-' + VALIDATION.MAX_TARGET_HOURS);
    }
    if (overrideData.team && overrideData.team.length > 0) {
      // FULL-POINT: tiap anggota wajib 100
      for (var i = 0; i < overrideData.team.length; i++) {
        var m = overrideData.team[i];
        if (!m.mechanic_id) return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'mechanic_id required');
        if (!getMechanicById(m.mechanic_id)) return errorResponse(ERROR_CODES.DATA_NOT_FOUND, 'Mechanic not found: ' + m.mechanic_id);
        var pctVal = parseFloat(m.percentage) || 0;
        if (Math.abs(pctVal - 100) > 0.01) return errorResponse(ERROR_CODES.VALIDATION_PERCENTAGE_SUM_INVALID, 'Full-point model: setiap mekanik harus 100 (dapat ' + pctVal + ' untuk ' + m.mechanic_id + ')');
      }
    }
    var updates = {};
    if (overrideData.base_points !== undefined && overrideData.base_points !== null && overrideData.base_points !== '') updates['override_base_points' + suffix] = roundTo(parseFloat(overrideData.base_points), 2);
    if (overrideData.target_hours !== undefined && overrideData.target_hours !== null && overrideData.target_hours !== '') updates['override_target_hours' + suffix] = roundTo(parseFloat(overrideData.target_hours), 2);
    if (overrideData.team && overrideData.team.length > 0) updates['override_team' + suffix] = JSON.stringify(overrideData.team.map(function(m) { return {mechanic_id: m.mechanic_id, percentage: roundTo(parseFloat(m.percentage) || 0, 1)}; }));
    updates['override_by' + suffix] = userEmail;
    updates['override_at' + suffix] = new Date();
    var updated = updateRow(SHEETS.WORK_ORDERS, woId, updates, 'id');
    if (!updated) return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to save override');
    try { logAuditAction(AUDIT_ACTIONS.OVERRIDE_FACTOR, 'WorkOrder', woId, userEmail, {role: role, override_data: overrideData}); } catch (e) { Log.warn('saveOverride', 'Audit log failed'); }
    timer.end('Override saved', {woId: woId, role: role});
    return successResponse({woId: woId, role: role, updates_applied: Object.keys(updates).length});
  } catch (e) { Log.exception('saveOverride', e); timer.end('Failed'); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function getAllMechanicsForOverride() {
  try {
    var mechs = getMechanicsByRole(ROLES.MECHANIC); var list = [];
    for (var i = 0; i < mechs.length; i++) list.push({mechanic_id: mechs[i].mechanic_id, mechanic_name: mechs[i].mechanic_name, email: mechs[i].email});
    return successResponse(list);
  } catch (e) { Log.exception('getAllMechanicsForOverride', e); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function canApproveSupervisor(email) { email = email || getCurrentUser(); return isSupervisor(email) || isSuperintendent(email); }
function canApproveSuperintendent(email) { email = email || getCurrentUser(); return isSuperintendent(email); }
function validateApprover(woId, approverEmail, stage) {
  if (stage === APPROVAL_STAGES.SUPERVISOR) { if (!canApproveSupervisor(approverEmail)) return errorResponse(ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS, 'Supervisor or Superintendent role required'); }
  else if (stage === APPROVAL_STAGES.SUPERINTENDENT) { if (!canApproveSuperintendent(approverEmail)) return errorResponse(ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS, 'Superintendent role required'); }
  return successResponse({valid: true});
}
function getNextApprovalStage(currentStatus) { if (currentStatus === WO_STATUS.WAIT_MTBF) return APPROVAL_STAGES.SUPERVISOR; if (currentStatus === WO_STATUS.PENDING_SUPERVISOR) return APPROVAL_STAGES.SUPERINTENDENT; return null; }
function isFullyApproved(woId) { var woResult = getWorkOrderById(woId); if (isError(woResult)) return woResult; return successResponse({approved: woResult.data.status === WO_STATUS.APPROVED}); }
function hasBeenRejected(woId) { var woResult = getWorkOrderById(woId); if (isError(woResult)) return woResult; return successResponse({rejected: woResult.data.status === WO_STATUS.REJECTED}); }

function cancelWorkOrder(woId, cancelledBy, reason) {
  var timer = Log.startTimer('cancelWorkOrder');
  try {
    var authCheck = checkAuthorization([ROLES.SUPERVISOR, ROLES.SUPERINTENDENT]);
    if (isError(authCheck)) return authCheck;
    cancelledBy = cancelledBy || getCurrentUser();
    if (!reason || reason.trim().length === 0) return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'Alasan pembatalan wajib diisi');
    // ── v2.8: cari WO di WorkOrders ATAU Archive (approved WO mungkin sudah diarsip) ──
    var found = getWorkOrderByIdAnySheet(woId);
    if (!found) return errorResponse(ERROR_CODES.DATA_NOT_FOUND, 'WO tidak ditemukan');
    var wo = found.wo;
    var targetSheet = found.sheet;  // WorkOrders atau WorkOrders_Archive
    if (wo.status === 'cancelled') return errorResponse(ERROR_CODES.WO_INVALID_STATUS_TRANSITION, 'WO ini sudah di-cancel sebelumnya');
    if (wo.status === WO_STATUS.REJECTED) return errorResponse(ERROR_CODES.WO_INVALID_STATUS_TRANSITION, 'WO yang sudah rejected tidak bisa di-cancel');
    var wasApproved = (wo.status === WO_STATUS.APPROVED);
    var updated = updateRow(targetSheet, woId, {status: 'cancelled'}, 'id');
    if (!updated) return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Gagal membatalkan work order');
    if (wasApproved) {
      updateRow(targetSheet, woId, {final_points: 0}, 'id');
      try { var mpRows = queryRows(SHEETS.MECHANIC_POINTS, function(mp) { return mp.wo_id === woId; }); for (var mp = 0; mp < mpRows.length; mp++) updateRow(SHEETS.MECHANIC_POINTS, mpRows[mp].id, {points: 0}, 'id'); Log.info('cancelWorkOrder', 'Points zeroed out', {woId: woId, rows: mpRows.length}); }
      catch (mpErr) { Log.warn('cancelWorkOrder', 'Failed to zero MechanicPoints', {error: mpErr.message}); }
    }
    try { logAuditAction('WO_CANCELLED', 'WorkOrder', woId, cancelledBy, {reason: reason.trim(), previous_status: wo.status, was_approved: wasApproved, sheet: targetSheet, note: wasApproved ? 'APPROVED WO CANCELLED — final_points & MechanicPoints di-zero' : ''}); }
    catch (auditErr) { Log.warn('cancelWorkOrder', 'Audit log failed'); }
    timer.end('WO cancelled', {woId: woId, previousStatus: wo.status, wasApproved: wasApproved, sheet: targetSheet});
    return successResponse({woId: woId, wo_number: wo.wo_number, status: 'cancelled', was_approved: wasApproved, warning: wasApproved ? '✅ WO cancelled. Final points dan MechanicPoints sudah di-nol-kan oleh sistem.' : null});
  } catch (e) { Log.exception('cancelWorkOrder', e); timer.end('Failed'); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function getAllActiveWosForManagement() {
  var timer = Log.startTimer('getAllActiveWosForManagement');
  try {
    var authCheck = checkAuthorization([ROLES.SUPERVISOR, ROLES.SUPERINTENDENT]);
    if (isError(authCheck)) return authCheck;
    var wos = queryRows(SHEETS.WORK_ORDERS, function(wo) { return wo.status === WO_STATUS.PENDING_MECHANIC_WORK || wo.status === WO_STATUS.IN_PROGRESS; });
    if (wos.length === 0) { timer.end('No active WOs'); return successResponse([], {count: 0}); }
    var compMap = _buildIdMap(loadComponents(), 'component_no');
    var mechMap = _buildIdMap(getMechanicsByRole(ROLES.MECHANIC), 'mechanic_id');
    var teamMap = _buildTeamMap();
    var enriched = [];
    for (var i = 0; i < wos.length; i++) {
      var wo = wos[i]; var isOthers = (wo.component_id === 'COM-OTHERS');
      var componentName = isOthers ? ('Others — ' + (wo.others_description || 'Custom Job')) : (compMap[wo.component_id] ? compMap[wo.component_id].component_name : wo.component_id);
      var teamRaw = teamMap[wo.id] || []; var teamNames = [];
      for (var t = 0; t < teamRaw.length; t++) { var mech = mechMap[teamRaw[t].mechanic_id]; teamNames.push(mech ? mech.mechanic_name : teamRaw[t].mechanic_id); }
      enriched.push({id: wo.id, wo_number: wo.wo_number, status: wo.status, component_name: componentName, work_condition: wo.work_condition, location: wo.location || 'workshop', created_by: wo.created_by, created_at: wo.created_at, team_names: teamNames, is_others: isOthers});
    }
    timer.end('Active WOs loaded', {count: enriched.length});
    return successResponse(enriched, {count: enriched.length});
  } catch (e) { Log.exception('getAllActiveWosForManagement', e); timer.end('Failed'); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}

function getApprovedWosForManagement() {
  var timer = Log.startTimer('getApprovedWosForManagement');
  try {
    var authCheck = checkAuthorization([ROLES.SUPERVISOR, ROLES.SUPERINTENDENT]);
    if (isError(authCheck)) return authCheck;
    var wos = queryApprovedWorkOrders();  // ← v2.8: baca dari WorkOrders + Archive (union, dedup)
    wos.sort(function(a, b) { var dateA = a.created_at ? new Date(a.created_at).getTime() : 0; var dateB = b.created_at ? new Date(b.created_at).getTime() : 0; return dateB - dateA; });
    if (wos.length === 0) { timer.end('No approved WOs'); return successResponse([], {count: 0}); }
    var compMap = _buildIdMap(loadComponents(), 'component_no');
    var mechMap = _buildIdMap(getMechanicsByRole(ROLES.MECHANIC), 'mechanic_id');
    var teamMap = _buildTeamMap();
    var enriched = [];
    for (var i = 0; i < wos.length; i++) {
      var wo = wos[i]; var isOthers = (wo.component_id === 'COM-OTHERS');
      var componentName = isOthers ? ('Others — ' + (wo.others_description || 'Custom Job')) : (compMap[wo.component_id] ? compMap[wo.component_id].component_name : wo.component_id);
      var teamRaw = teamMap[wo.id] || []; var teamNames = [];
      for (var t = 0; t < teamRaw.length; t++) { var mech = mechMap[teamRaw[t].mechanic_id]; teamNames.push(mech ? mech.mechanic_name : teamRaw[t].mechanic_id); }
      var createdAtStr = '';
      try { if (wo.created_at) createdAtStr = new Date(wo.created_at).toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'}); } catch(e) { createdAtStr = String(wo.created_at || ''); }
      enriched.push({id: wo.id, wo_number: wo.wo_number, status: 'approved', component_name: componentName, work_condition: wo.work_condition, location: wo.location || 'workshop', created_by: wo.created_by, created_at_str: createdAtStr, final_idr: ((parseFloat(wo.final_points) || 0) * getIdrRate()), final_points: parseFloat(wo.final_points) || 0, actual_hours: parseFloat(wo.actual_hours) || 0, team_names: teamNames, is_others: isOthers, hour_meter: wo.hour_meter || null, kilometers: wo.kilometers || null, safety_incident: wo.safety_incident === true || wo.safety_incident === 'true' || wo.safety_incident === 'TRUE'});
    }
    timer.end('Approved WOs loaded', {count: enriched.length});
    return successResponse(enriched, {count: enriched.length});
  } catch (e) { Log.exception('getApprovedWosForManagement', e); timer.end('Failed'); return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message); }
}