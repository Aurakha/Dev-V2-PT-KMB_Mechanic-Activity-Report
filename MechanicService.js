/**
 * ============================================================================
 * MechanicService.gs - Mechanic Dashboard Backend (Workflow B)
 * ============================================================================
 * v1.5 — Archive-aware: tab Done baca dari WorkOrders + Archive
 *         Hapus tab All & In Progress (Workflow B tidak pakai in_progress)
 *         Status in_progress/wait_mtbf di-merge ke assigned
 * v1.4 — Map-lookup optimization
 * v1.3 — Filter out 'cancelled' WOs
 * v1.2 — Impersonate support via viewAsMechanicId
 * ============================================================================
 */

function getMyAssignedWOs(mechanicEmail, statusFilter, viewAsMechanicId) {
  var timer = Log.startTimer('getMyAssignedWOs');
  try {
    if (!mechanicEmail) return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'mechanicEmail required');
    statusFilter = statusFilter || 'assigned';  // ← v1.5: default ke assigned (bukan all)

    var caller = getMechanicByEmail(mechanicEmail);
    if (!caller) {
      Log.warn('getMyAssignedWOs', 'Caller not found', {email: mechanicEmail});
      return successResponse({wos: [], counts: _emptyCounts(), mechanic: null, activeFilter: statusFilter, viewing_as: null});
    }

    var targetMechanic = caller;
    var viewingAs = null;
    var callerIsApprover = isApproverRole(caller.role);

    if (viewAsMechanicId && viewAsMechanicId !== caller.mechanic_id) {
      if (!callerIsApprover) return errorResponse(ERROR_CODES.AUTH_PERMISSION_DENIED, 'Only supervisors/superintendents can view other mechanics');
      var resolved = getMechanicById(viewAsMechanicId);
      if (!resolved) return errorResponse(ERROR_CODES.DATA_NOT_FOUND, 'Mechanic not found: ' + viewAsMechanicId);
      // FASE 1.5: impersonate hanya dalam scope cluster approver
      if (!userScopeAllows(getUserSectionScope(mechanicEmail), resolved.section)) {
        return errorResponse(ERROR_CODES.AUTH_PERMISSION_DENIED, 'Mekanik ' + viewAsMechanicId + ' (cluster ' + (resolved.section || '?') + ') di luar scope Anda');
      }
      targetMechanic = resolved;
      viewingAs = {id: resolved.mechanic_id, name: resolved.mechanic_name, email: resolved.email, role: resolved.role};
    }

    var targetMechanicId = targetMechanic.mechanic_id;

    var teamEntries = queryRows(SHEETS.WORK_ORDER_TEAM, function(t) { return t.mechanic_id === targetMechanicId; });

    if (teamEntries.length === 0) {
      timer.end('No assigned WOs');
      return successResponse({
        wos: [], counts: _emptyCounts(),
        mechanic: {id: targetMechanicId, name: targetMechanic.mechanic_name, email: targetMechanic.email, role: targetMechanic.role},
        activeFilter: statusFilter, viewing_as: viewingAs
      });
    }

    var woIdSet = {};
    for (var i = 0; i < teamEntries.length; i++) woIdSet[teamEntries[i].wo_id] = true;
    var woIds = Object.keys(woIdSet);

    // ─── LOAD CONFIG ONCE ────────────────────────────────────────────────
    var compMap  = _buildIdMapMech(loadComponents(), 'component_no');
    var unitMap  = _buildIdMapMech(loadUnits(), 'unit_id');
    var allTeams = queryRows(SHEETS.WORK_ORDER_TEAM, function() { return true; });
    var teamMap  = {};
    for (var ti = 0; ti < allTeams.length; ti++) {
      var te = allTeams[ti];
      if (!teamMap[te.wo_id]) teamMap[te.wo_id] = [];
      teamMap[te.wo_id].push(te);
    }

    // ─── v1.5: LOAD WOs ARCHIVE-AWARE ───────────────────────────────────
    var wos = [];
    for (var j = 0; j < woIds.length; j++) {
      // getWorkOrderByIdAnySheet cek WorkOrders dulu, lalu Archive
      var found = getWorkOrderByIdAnySheet(woIds[j]);
      if (!found) continue;
      var wo = found.wo;
      if (wo.status === 'cancelled' || wo.status === WO_STATUS.REJECTED) continue;
      wo = _enrichWoForMechanicView(wo, targetMechanicId, compMap, unitMap, teamMap);
      wos.push(wo);
    }

    var counts = _computeCountsByGroup(wos);
    var filteredWos = _filterWosByGroup(wos, statusFilter);

    filteredWos.sort(function(a, b) {
      var dateA = parseDate(a.created_at); var dateB = parseDate(b.created_at);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1; if (!dateB) return -1;
      return dateB.getTime() - dateA.getTime();
    });

    timer.end('Query complete', {mechanicId: targetMechanicId, totalWos: wos.length, filteredCount: filteredWos.length});

    return successResponse({
      wos: filteredWos, counts: counts,
      mechanic: {id: targetMechanicId, name: targetMechanic.mechanic_name, email: targetMechanic.email, role: targetMechanic.role},
      activeFilter: statusFilter, viewing_as: viewingAs
    });

  } catch (e) {
    Log.exception('getMyAssignedWOs', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// GET WO DETAIL FOR MECHANIC
// ============================================================================

function getWoDetailForMechanic(woId, mechanicEmail, viewAsMechanicId) {
  var timer = Log.startTimer('getWoDetailForMechanic');
  try {
    if (!woId) return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'woId required');
    if (!mechanicEmail) return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'mechanicEmail required');

    var caller = getMechanicByEmail(mechanicEmail);
    if (!caller) return errorResponse(ERROR_CODES.AUTH_USER_NOT_FOUND, 'User not found: ' + mechanicEmail);

    var targetMechanic = caller;
    var viewingAs = null;
    var callerIsApprover = isApproverRole(caller.role);

    if (viewAsMechanicId && viewAsMechanicId !== caller.mechanic_id) {
      if (!callerIsApprover) return errorResponse(ERROR_CODES.AUTH_PERMISSION_DENIED, 'Only supervisors/superintendents can view other mechanics');
      var resolved = getMechanicById(viewAsMechanicId);
      if (!resolved) return errorResponse(ERROR_CODES.DATA_NOT_FOUND, 'Mechanic not found: ' + viewAsMechanicId);
      // FASE 1.5: impersonate hanya dalam scope cluster approver
      if (!userScopeAllows(getUserSectionScope(mechanicEmail), resolved.section)) {
        return errorResponse(ERROR_CODES.AUTH_PERMISSION_DENIED, 'Mekanik ' + viewAsMechanicId + ' (cluster ' + (resolved.section || '?') + ') di luar scope Anda');
      }
      targetMechanic = resolved;
      viewingAs = {id: resolved.mechanic_id, name: resolved.mechanic_name, email: resolved.email};
    }

    // ── v1.5: archive-aware lookup ──
    var found = getWorkOrderByIdAnySheet(woId);
    if (!found) return errorResponse(ERROR_CODES.WO_NOT_FOUND, 'Work order not found: ' + woId);
    var wo = found.wo;

    var teamRaw = queryRows(SHEETS.WORK_ORDER_TEAM, function(t) { return t.wo_id === woId; });
    var team = [];
    var myPercentage = null;
    var isInTeam = false;

    for (var i = 0; i < teamRaw.length; i++) {
      var member = teamRaw[i];
      var memberInfo = getMechanicById(member.mechanic_id);
      var enrichedMember = {
        mechanic_id: member.mechanic_id,
        mechanic_name: memberInfo ? memberInfo.mechanic_name : member.mechanic_id,
        percentage: parseFloat(member.percentage) || 0,
        is_lead: member.is_lead === true || member.is_lead === 'TRUE',
        is_me: member.mechanic_id === targetMechanic.mechanic_id
      };
      team.push(enrichedMember);
      if (enrichedMember.is_me) { isInTeam = true; myPercentage = enrichedMember.percentage; }
    }

    var component = getComponentById(wo.component_id);
    if (wo.job_id && !component) {
      var jd = getJobById(wo.job_id);
      if (jd) component = { component_no: wo.job_id, component_name: jd.job_description + ' \u2014 ' + jd.sub_component, target_hours: jd.plan_hours, base_points: jd.base_point };
    }
    var unit = getUnitById(wo.unit_id);
    var targetHours = component ? (parseFloat(component.target_hours) || 0) : 0;

    team.sort(function(a, b) {
      if (a.is_me && !b.is_me) return -1; if (!a.is_me && b.is_me) return 1;
      return 0;
    });

    timer.end('Detail loaded');
    return successResponse({wo: wo, team: team, component: component, unit: unit, target_hours: targetHours, is_in_team: isInTeam, my_percentage: myPercentage, status_label: getStatusLabel(wo.status), viewing_as: viewingAs});
  } catch (e) {
    Log.exception('getWoDetailForMechanic', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// SUBMIT MECHANIC WORK
// ============================================================================

function submitMechanicWork(woId, startTime, endTime, mechanicEmail, hourMeter, kilometers, partCategory) {
  var timer = Log.startTimer('submitMechanicWork');
  try {
    if (!woId) return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'woId required');
    if (!startTime) return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'start_time required');
    if (!endTime) return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'end_time required');

    mechanicEmail = mechanicEmail || getCurrentUser();
    var startDate = _parseTimeInput(startTime);
    var endDate   = _parseTimeInput(endTime);
    if (!startDate) return errorResponse(ERROR_CODES.VALIDATION_INVALID_DATE, 'Invalid start_time format');
    if (!endDate)   return errorResponse(ERROR_CODES.VALIDATION_INVALID_DATE, 'Invalid end_time format');
    if (startDate.getTime() >= endDate.getTime()) return errorResponse(ERROR_CODES.WO_INVALID_TIME_RANGE, 'End time must be after start time');

    var actualMs = endDate.getTime() - startDate.getTime();
    var actualHours = roundTo(actualMs / 3600000, 2);
    if (actualHours > VALIDATION.MAX_TARGET_HOURS) return errorResponse(ERROR_CODES.VALIDATION_OUT_OF_RANGE, 'Duration exceeds maximum: ' + actualHours);
    if (actualHours <= 0) return errorResponse(ERROR_CODES.WO_INVALID_TIME_RANGE, 'Duration must be positive');

    var hmVal = parseFloat(hourMeter);
    var kmVal = parseFloat(kilometers);
    if (isNaN(hmVal) || hmVal <= 0) return errorResponse(ERROR_CODES.VALIDATION_OUT_OF_RANGE, 'Hour meter wajib diisi dan harus lebih dari 0');
    if (isNaN(kmVal) || kmVal <= 0) return errorResponse(ERROR_CODES.VALIDATION_OUT_OF_RANGE, 'Kilometer (KM) wajib diisi dan harus lebih dari 0');

    var wo = getRowById(SHEETS.WORK_ORDERS, woId, 'id');
    if (!wo) return errorResponse(ERROR_CODES.WO_NOT_FOUND, 'Work order not found: ' + woId);

    var mechanic = getMechanicByEmail(mechanicEmail);
    if (mechanic && !isApproverRole(mechanic.role)) {
      var teamCheck = queryRows(SHEETS.WORK_ORDER_TEAM, function(t) { return t.wo_id === woId && t.mechanic_id === mechanic.mechanic_id; });
      if (teamCheck.length === 0) return errorResponse(ERROR_CODES.AUTH_PERMISSION_DENIED, 'You are not assigned to this work order');
    }

    if (!canTransitionTo(wo.status, WO_STATUS.PENDING_SUPERVISOR)) {
      return errorResponse(ERROR_CODES.WO_INVALID_STATUS_TRANSITION, 'Cannot submit from current status: ' + wo.status);
    }

    var targetHours = 0;
    if (wo.job_id) {
      var jobRow = getJobById(wo.job_id);
      targetHours = jobRow ? (parseFloat(jobRow.plan_hours) || 0) : 0;
    } else {
      var component = getComponentById(wo.component_id);
    if (wo.job_id && !component) {
      var jd = getJobById(wo.job_id);
      if (jd) component = { component_no: wo.job_id, component_name: jd.job_description + ' \u2014 ' + jd.sub_component, target_hours: jd.plan_hours, base_points: jd.base_point };
    }
      targetHours = component ? (parseFloat(component.target_hours) || 0) : 0;
    }
    var timelinessInfo = null;
    if (targetHours > 0) {
      timelinessInfo = getTimelinessFactor(actualHours, targetHours);
    }

    // FASE 2: spare part — 1 pilihan per WO, opsional (kosong = tanpa part)
    var pc = String(partCategory || '').toLowerCase().trim();
    if (pc && pc !== 'baru' && pc !== 'repair' && pc !== 'kanibal') {
      return errorResponse(ERROR_CODES.VALIDATION_INVALID_FORMAT, 'part_category tidak valid: ' + pc);
    }
    
    var submittedAt = new Date();
    var oldStatus = wo.status;
    var updated = updateRow(SHEETS.WORK_ORDERS, woId, {
      status: WO_STATUS.PENDING_SUPERVISOR, start_time: startDate,
      end_time: endDate, actual_hours: actualHours, submitted_at: submittedAt,
      hour_meter: hmVal, kilometers: kmVal, part_category: pc
    }, 'id');
    if (!updated) return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to update work order');

    try {
      logAuditAction(AUDIT_ACTIONS.MECHANIC_SUBMIT_WORK, 'work_order', woId, mechanicEmail, {
        old_status: oldStatus, new_status: WO_STATUS.PENDING_SUPERVISOR,
        start_time: startDate.toISOString(), end_time: endDate.toISOString(),
        actual_hours: actualHours, target_hours: targetHours,
        timeliness: timelinessInfo ? timelinessInfo.status : null
      });
    } catch (auditErr) { Log.warn('submitMechanicWork', 'Audit log failed'); }

    timer.end('Work submitted', {woId: woId, actualHours: actualHours});
    return successResponse({
      wo_id: woId, old_status: oldStatus, new_status: WO_STATUS.PENDING_SUPERVISOR,
      start_time: startDate.toISOString(), end_time: endDate.toISOString(),
      actual_hours: actualHours, target_hours: targetHours, hour_meter: hmVal, kilometers: kmVal,
      timeliness: timelinessInfo, submitted_at: submittedAt.toISOString()
    });
  } catch (e) {
    Log.exception('submitMechanicWork', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function _buildIdMapMech(arr, keyField) {
  var map = {};
  if (!arr) return map;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i][keyField]) map[arr[i][keyField]] = arr[i];
  }
  return map;
}

function _enrichWoForMechanicView(wo, mechanicId, compMap, unitMap, teamMap) {
  wo.status_group = _statusToGroup(wo.status);
  wo.status_label = getStatusLabel(wo.status);

  var teamEntries = (teamMap && teamMap[wo.id]) ? teamMap[wo.id]
    : queryRows(SHEETS.WORK_ORDER_TEAM, function(t) { return t.wo_id === wo.id; });

  wo.team_count = teamEntries.length;
  wo.my_percentage = null;
  for (var i = 0; i < teamEntries.length; i++) {
    if (teamEntries[i].mechanic_id === mechanicId) {
      wo.my_percentage = parseFloat(teamEntries[i].percentage) || 0;
      break;
    }
  }

  var isOthers = (wo.component_id === 'COM-OTHERS');
  wo.is_others = isOthers;

  // FASE 1: WO berbasis job katalog (field/workshop)
  if (wo.job_id) {
    var jobCat = getJobById(wo.job_id);
    if (jobCat) {
      wo.component_name = jobCat.job_description + ' \u2014 ' + jobCat.sub_component;
      wo.target_hours   = parseFloat(jobCat.plan_hours) || 0;
      wo.base_points    = parseFloat(jobCat.base_point) || 0;
    } else {
      wo.component_name = 'Job katalog (' + wo.job_id + ')';
    }
    if (String(wo.unit_id) === 'WORKSHOP') {
      wo.unit_name = 'Workshop';
      wo.unit_type = 'WS';
    } else {
      var jUnit = (unitMap && unitMap[wo.unit_id]) ? unitMap[wo.unit_id] : getUnitById(wo.unit_id);
      if (jUnit) { wo.unit_name = jUnit.unit_name; wo.unit_type = jUnit.unit_type; }
    }
    wo.location = wo.location || 'workshop';
    return wo;
  }

  if (isOthers) {
    wo.component_name = 'Others - Custom Job';
    wo.target_hours   = parseFloat(wo.override_target_hours_supervisor) || 0;
    wo.base_points    = parseFloat(wo.override_base_points_supervisor) || 0;
    wo.unit_name      = wo.others_description || 'Custom Job';
    wo.unit_type      = 'OTHERS';
  } else {
    var component = (compMap && compMap[wo.component_id]) ? compMap[wo.component_id] : getComponentById(wo.component_id);
    if (component) {
      wo.component_name = component.component_name;
      wo.target_hours   = parseFloat(component.target_hours) || 0;
      wo.base_points    = parseFloat(component.base_points) || 0;
    }
    var unit = (unitMap && unitMap[wo.unit_id]) ? unitMap[wo.unit_id] : getUnitById(wo.unit_id);
    if (unit) {
      wo.unit_name = unit.unit_name;
      wo.unit_type = unit.unit_type;
    }
  }

  wo.location = wo.location || 'workshop';
  return wo;
}

/**
 * v1.5: in_progress/wait_mtbf → 'assigned' (Workflow B tidak pakai, tapi kalau ada tetap muncul)
 */
function _statusToGroup(status) {
  switch(status) {
    case WO_STATUS.PENDING_MECHANIC_WORK:  return 'assigned';
    case WO_STATUS.CREATED:                return 'assigned';
    case WO_STATUS.IN_PROGRESS:            return 'assigned';
    case WO_STATUS.WAIT_MTBF:              return 'assigned';
    case WO_STATUS.PENDING_SUPERVISOR:     return 'pending_approval';
    case WO_STATUS.PENDING_SUPERINTENDENT: return 'pending_approval';
    case WO_STATUS.APPROVED:               return 'done';
    case WO_STATUS.REJECTED:               return 'done';
    case 'cancelled':                      return null;
    default:                               return 'assigned';
  }
}

function _computeCountsByGroup(wos) {
  var counts = _emptyCounts();
  for (var i = 0; i < wos.length; i++) {
    var group = wos[i].status_group;
    if (!group) continue;
    if (counts.hasOwnProperty(group)) counts[group]++;
  }
  return counts;
}

function _emptyCounts() {
  return {assigned: 0, pending_approval: 0, done: 0};
}

function _filterWosByGroup(wos, filter) {
  var filtered = [];
  for (var i = 0; i < wos.length; i++) {
    if (!wos[i].status_group) continue;
    if (!filter || wos[i].status_group === filter) filtered.push(wos[i]);
  }
  return filtered;
}

function _parseTimeInput(input) {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input === 'number') { var d = new Date(input); return isNaN(d.getTime()) ? null : d; }
  if (typeof input === 'string') {
    var d = new Date(input);
    if (!isNaN(d.getTime())) return d;
    if (typeof parseDate === 'function') { d = parseDate(input); if (d && !isNaN(d.getTime())) return d; }
  }
  return null;
}