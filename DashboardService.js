/**
 * ============================================================================
 * DashboardService.gs - Dashboard Data & Analytics
 * ============================================================================
 * 
 * v2.2 — IDR fixes:
 *   - getLeaderboard: pakai record.idr_value (sudah tersimpan saat award, rate-aware)
 *   - getMechanicTotalPoints: sum idr_value dari sheet
 *   - TIDAK redefine getIdrRate() — sudah ada di ConfigService.gs
 * v2.1 — Real data: avgCompletion, chart 6 bulan, component_name di recent WOs
 * ============================================================================
 */

// ============================================================================
// INTERNAL MAP HELPER (local, tidak konflik dengan ConfigService)
// ============================================================================

function _buildDashMap(arr, keyField) {
  var map = {};
  if (!arr) return map;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i][keyField]) map[arr[i][keyField]] = arr[i];
  }
  return map;
}

// ============================================================================
// MAIN DASHBOARD DATA
// ============================================================================

function getDashboardData(user) {
  var timer = Log.startTimer('getDashboardData');
  try {
    var data = {
      user: user,
      stats: getQuickStats(user),
      recentWOs: getRecentWOs(10),
      recentActivity: getRecentActivity(user, 10),
      pendingItems: getPendingItems(user),
      leaderboard: getLeaderboard(10),
      charts: getChartData(user),
      timestamp: new Date()
    };
    timer.end('Dashboard data loaded', {role: user.role});
    return data;
  } catch (e) {
    Log.exception('getDashboardData', e);
    return {
      user: user,
      stats: _emptyStats(),
      recentWOs: [], recentActivity: [], pendingItems: [], leaderboard: [],
      charts: {pointsTrend: {labels: [], data: []}},
      error: true, message: e.message
    };
  }
}

// ============================================================================
// QUICK STATS
// ============================================================================

function getQuickStats(user) {
  try {
    if (user.role === ROLES.MECHANIC) return getMechanicStats(user.mechanic_id);
    if (user.role === ROLES.SUPERVISOR) return getSupervisorStats();
    if (user.role === ROLES.SUPERINTENDENT) return getSuperintendentStats();
    return _emptyStats();
  } catch (e) {
    Log.exception('getQuickStats', e);
    return _emptyStats();
  }
}

function _emptyStats() {
  return {totalWOs: 0, approved: 0, pending: 0, totalPoints: 0, activeMechanics: 0, thisMonth: 0, avgCompletion: 0};
}

function getMechanicStats(mechanicId) {
  try {
    if (!mechanicId) return _emptyStats();
    var allPoints = readSheetAsObjects(SHEETS.MECHANIC_POINTS);
    var allWOs    = readAllWorkOrdersBothSheets();
    var allTeam   = readSheetAsObjects(SHEETS.WORK_ORDER_TEAM);

    // Total points (filter points > 0, exclude cancelled)
    var totalPoints = 0;
    for (var p = 0; p < allPoints.length; p++) {
      if (allPoints[p].mechanic_id === mechanicId) {
        var pts = parseFloat(allPoints[p].points) || 0;
        if (pts > 0) totalPoints += pts;
      }
    }

    var myWoIds = {};
    for (var t = 0; t < allTeam.length; t++) {
      if (allTeam[t].mechanic_id === mechanicId) myWoIds[allTeam[t].wo_id] = true;
    }

    var totalWOs = 0, approved = 0, pending = 0, thisMonth = 0;
    var totalActualHours = 0, approvedWithHours = 0;
    var now = new Date();
    var thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    for (var i = 0; i < allWOs.length; i++) {
      var wo = allWOs[i];
      if (!myWoIds[wo.id] || wo.status === 'cancelled') continue;
      totalWOs++;
      if (wo.status === WO_STATUS.APPROVED) {
        approved++;
        var ah = parseFloat(wo.actual_hours) || 0;
        if (ah > 0) { totalActualHours += ah; approvedWithHours++; }
      }
      if (wo.status === WO_STATUS.PENDING_SUPERVISOR || wo.status === WO_STATUS.PENDING_SUPERINTENDENT || wo.status === WO_STATUS.PENDING_MECHANIC_WORK) pending++;
      var createdAt = parseDate(wo.created_at);
      if (createdAt && createdAt >= thisMonthStart) thisMonth++;
    }

    return {
      totalWOs: totalWOs, approved: approved, pending: pending,
      totalPoints: roundTo(totalPoints, 2), activeMechanics: 0,
      thisMonth: thisMonth,
      avgCompletion: approvedWithHours > 0 ? roundTo(totalActualHours / approvedWithHours, 1) : 0
    };
  } catch (e) {
    Log.exception('getMechanicStats', e);
    return _emptyStats();
  }
}

function getSupervisorStats() {
  try {
    var allWOs = readAllWorkOrdersBothSheets();
    var totalWOs = 0, approved = 0, pending = 0, totalPoints = 0, thisMonth = 0;
    var totalActualHours = 0, approvedWithHours = 0;
    var now = new Date();
    var thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    for (var i = 0; i < allWOs.length; i++) {
      var wo = allWOs[i];
      if (wo.status === 'cancelled') continue;
      totalWOs++;
      if (wo.status === WO_STATUS.APPROVED) {
        approved++;
        totalPoints += parseFloat(wo.final_points) || 0;
        var ah = parseFloat(wo.actual_hours) || 0;
        if (ah > 0) { totalActualHours += ah; approvedWithHours++; }
      }
      if (wo.status === WO_STATUS.PENDING_SUPERVISOR || wo.status === WO_STATUS.PENDING_SUPERINTENDENT || wo.status === WO_STATUS.PENDING_MECHANIC_WORK) pending++;
      var createdAt = parseDate(wo.created_at);
      if (createdAt && createdAt >= thisMonthStart) thisMonth++;
    }

    return {
      totalWOs: totalWOs, approved: approved, pending: pending,
      totalPoints: roundTo(totalPoints, 2), activeMechanics: _countActiveMechanics(),
      thisMonth: thisMonth,
      avgCompletion: approvedWithHours > 0 ? roundTo(totalActualHours / approvedWithHours, 1) : 0
    };
  } catch (e) {
    Log.exception('getSupervisorStats', e);
    return _emptyStats();
  }
}

function getSuperintendentStats() { return getSupervisorStats(); }

function _countActiveMechanics() {
  try {
    var all = typeof loadMechanics === 'function' ? loadMechanics() : [];
    var count = 0;
    for (var i = 0; i < all.length; i++) {
      var isActive = all[i].is_active === true || String(all[i].is_active).toUpperCase() === 'TRUE';
      if (isActive && all[i].role === ROLES.MECHANIC) count++;
    }
    return count;
  } catch (e) { return 0; }
}

// ============================================================================
// RECENT WOs — enriched with component_name
// ============================================================================

function getRecentWOs(limit) {
  try {
    limit = limit || 10;
    var allWOs = readAllWorkOrdersBothSheets();
    allWOs.sort(function(a, b) {
      var dateA = parseDate(a.created_at); var dateB = parseDate(b.created_at);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1; if (!dateB) return -1;
      return dateB.getTime() - dateA.getTime();
    });
    var recent = allWOs.slice(0, limit);
    var compMap = _buildDashMap(loadComponents(), 'component_no');
    for (var i = 0; i < recent.length; i++) {
      var wo = recent[i];
      if (wo.component_id === 'COM-OTHERS') {
        recent[i].component_name = 'Others — ' + (wo.others_description || 'Custom Job');
      } else {
        var comp = compMap[wo.component_id];
        recent[i].component_name = comp ? comp.component_name : (wo.component_id || 'N/A');
      }
    }
    return recent;
  } catch (e) {
    Log.exception('getRecentWOs', e);
    return [];
  }
}

// ============================================================================
// RECENT ACTIVITY
// ============================================================================

function getRecentActivity(user, limit) {
  try {
    limit = limit || 10;
    var logs;
    if (user.role === ROLES.MECHANIC && user.mechanic_id) {
      logs = getAuditLogsByUser(user.email, limit);
    } else {
      var allLogs = readSheetAsObjects(SHEETS.AUDIT_LOGS);
      allLogs.sort(function(a, b) {
        var timeA = parseDate(a.timestamp); var timeB = parseDate(b.timestamp);
        if (!timeA || !timeB) return 0;
        return timeB.getTime() - timeA.getTime();
      });
      logs = successResponse(allLogs.slice(0, limit));
    }
    if (isError(logs)) return [];
    var activity = [];
    var logData = logs.data;
    for (var i = 0; i < logData.length && i < limit; i++) {
      var log = logData[i];
      activity.push({action: log.action, entity_type: log.entity_type, entity_id: log.entity_id, user_email: log.user_email, timestamp: log.timestamp, description: formatActivityDescription(log)});
    }
    return activity;
  } catch (e) {
    Log.exception('getRecentActivity', e);
    return [];
  }
}

function formatActivityDescription(log) {
  var details = {};
  if (log.details) { try { details = JSON.parse(log.details); } catch (e) {} }
  switch (log.action) {
    case AUDIT_ACTIONS.CREATE_WO: return 'Created WO ' + (details.wo_number || log.entity_id);
    case AUDIT_ACTIONS.START_WO: return 'Started work on ' + log.entity_id;
    case AUDIT_ACTIONS.FINISH_WO: return 'Finished work (' + (details.actual_hours || '?') + ' hours)';
    case AUDIT_ACTIONS.SUPERVISOR_APPROVE: return 'Supervisor approved ' + log.entity_id;
    case AUDIT_ACTIONS.SUPERINTENDENT_APPROVE: return 'Superintendent approved ' + log.entity_id;
    default: return log.action.replace(/_/g, ' ');
  }
}

// ============================================================================
// PENDING ITEMS
// ============================================================================

function getPendingItems(user) {
  try {
    if (user.role === ROLES.MECHANIC && user.mechanic_id) {
      var wosResult = getWorkOrdersByMechanic(user.mechanic_id);
      if (isError(wosResult)) return [];
      var pending = [];
      for (var i = 0; i < wosResult.data.length; i++) {
        var wo = wosResult.data[i];
        if (wo.status === WO_STATUS.WAIT_MTBF || wo.status === WO_STATUS.PENDING_SUPERVISOR || wo.status === WO_STATUS.PENDING_SUPERINTENDENT) pending.push(wo);
      }
      return pending;
    } else if (user.role === ROLES.SUPERVISOR || user.role === ROLES.SUPERINTENDENT) {
      var approvalsResult = getPendingApprovals(user.email);
      return isSuccess(approvalsResult) ? approvalsResult.data : [];
    }
    return [];
  } catch (e) {
    Log.exception('getPendingItems', e);
    return [];
  }
}

// ============================================================================
// LEADERBOARD — v2.2: pakai record.idr_value (tersimpan saat award, sudah rate-aware)
// ============================================================================

function getLeaderboard(limit) {
  try {
    limit = limit || 10;
    var allPoints = readSheetAsObjects(SHEETS.MECHANIC_POINTS);
    var mechanicTotals = {};

    for (var i = 0; i < allPoints.length; i++) {
      var record = allPoints[i];
      var points = parseFloat(record.points) || 0;
      if (points <= 0) continue; // skip zeroed (cancelled WOs)

      var mechanicId = record.mechanic_id;
      if (!mechanicTotals[mechanicId]) {
        mechanicTotals[mechanicId] = {mechanic_id: mechanicId, total_points: 0, total_idr: 0, wo_count: 0};
      }
      mechanicTotals[mechanicId].total_points += points;
      // Pakai idr_value yang sudah tersimpan — akurat sesuai rate saat WO diapprove
      mechanicTotals[mechanicId].total_idr += parseFloat(record.idr_value) || 0;
      mechanicTotals[mechanicId].wo_count++;
    }

    var mechMap = _buildDashMap(getMechanicsByRole(ROLES.MECHANIC), 'mechanic_id');
    var leaderboard = [];
    for (var mechId in mechanicTotals) {
      if (!mechanicTotals.hasOwnProperty(mechId)) continue;
      var entry = mechanicTotals[mechId];
      var mech = mechMap[mechId];
      entry.mechanic_name = mech ? mech.mechanic_name : mechId;
      entry.total_points  = roundTo(entry.total_points, 2);
      entry.total_idr     = Math.round(entry.total_idr);
      leaderboard.push(entry);
    }

    leaderboard.sort(function(a, b) { return b.total_points - a.total_points; });
    for (var j = 0; j < leaderboard.length; j++) leaderboard[j].rank = j + 1;
    return leaderboard.slice(0, limit);
  } catch (e) {
    Log.exception('getLeaderboard', e);
    return [];
  }
}

// ============================================================================
// CHART DATA — 6 bulan terakhir
// ============================================================================

function getChartData(user) {
  try {
    return {pointsTrend: getPointsTrendData(), statusDistribution: getStatusDistributionData()};
  } catch (e) {
    Log.exception('getChartData', e);
    return {pointsTrend: {labels: [], data: []}};
  }
}

function getPointsTrendData() {
  try {
    var now = new Date();
    var monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
    var buckets = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({year: d.getFullYear(), month: d.getMonth(), label: monthNames[d.getMonth()] + ' ' + d.getFullYear(), total: 0});
    }

    var allPoints = readSheetAsObjects(SHEETS.MECHANIC_POINTS);
    for (var p = 0; p < allPoints.length; p++) {
      var record = allPoints[p];
      var pts = parseFloat(record.points) || 0;
      if (pts <= 0) continue;
      var awardedDate = parseDate(record.awarded_at || record.created_at);
      if (!awardedDate) continue;
      for (var b = 0; b < buckets.length; b++) {
        if (awardedDate.getFullYear() === buckets[b].year && awardedDate.getMonth() === buckets[b].month) {
          buckets[b].total += pts;
          break;
        }
      }
    }

    return {
      labels: buckets.map(function(b) { return b.label; }),
      data:   buckets.map(function(b) { return roundTo(b.total, 2); })
    };
  } catch (e) {
    Log.exception('getPointsTrendData', e);
    return {labels: [], data: []};
  }
}

function getStatusDistributionData() {
  try {
    var allWOs = readAllWorkOrdersBothSheets();
    var distribution = {};
    for (var i = 0; i < allWOs.length; i++) {
      var status = allWOs[i].status;
      if (!distribution[status]) distribution[status] = 0;
      distribution[status]++;
    }
    return distribution;
  } catch (e) { return {}; }
}

// ============================================================================
// MECHANIC SPECIFIC — v2.2: sum idr_value dari sheet
// ============================================================================

function getMechanicTotalPoints(mechanicId) {
  try {
    var allPoints = readSheetAsObjects(SHEETS.MECHANIC_POINTS);
    var totalPoints = 0, totalIdr = 0, woCount = 0;
    for (var i = 0; i < allPoints.length; i++) {
      var record = allPoints[i];
      if (record.mechanic_id !== mechanicId) continue;
      var pts = parseFloat(record.points) || 0;
      if (pts <= 0) continue;
      totalPoints += pts;
      totalIdr    += parseFloat(record.idr_value) || 0; // pakai nilai tersimpan
      woCount++;
    }
    return successResponse({
      mechanicId: mechanicId,
      totalPoints: roundTo(totalPoints, 2),
      totalIdr: Math.round(totalIdr),
      woCount: woCount
    });
  } catch (e) {
    Log.exception('getMechanicTotalPoints', e);
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

function getMechanicRanking(mechanicId) {
  try {
    var leaderboard = getLeaderboard(100);
    for (var i = 0; i < leaderboard.length; i++) {
      if (leaderboard[i].mechanic_id === mechanicId) {
        return successResponse({rank: leaderboard[i].rank, total: leaderboard.length, percentile: roundTo((1 - (i / leaderboard.length)) * 100, 1)});
      }
    }
    return successResponse({rank: null, total: leaderboard.length, percentile: 0});
  } catch (e) {
    Log.exception('getMechanicRanking', e);
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}