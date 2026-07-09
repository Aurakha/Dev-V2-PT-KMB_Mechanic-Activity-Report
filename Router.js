/**
 * ============================================================================
 * Router.gs - Web App Router & Request Handler
 * ============================================================================
 * 
 * Production-grade web app routing system:
 * - URL routing (dashboard, create WO, mechanic, approvals, reports)
 * - Authentication & authorization
 * - Session management
 * - API endpoints for frontend
 * - Error handling & logging
 * 
 * Routes:
 * - / (root) → Dashboard
 * - /create → Create Work Order (Workflow B)
 * - /mechanic → Mechanic Dashboard (Workflow B, FASE 3)
 * - /approvals → Approval interface
 * - /reports → Reports & analytics
 * - /api/* → JSON API endpoints
 * 
 * URL Parameters (Mechanic page):
 * - ?filter=assigned|in_progress|pending_approval|done
 * - ?as=MECH-001  (impersonate, supervisor/superintendent only)
 * 
 * Dependencies: All foundation + all Session 2 services + MechanicService
 * 
 * Changelog:
 * - v1.2: Add impersonate support via ?as=MECH-001 URL parameter
 * ============================================================================
 */

// ============================================================================
// WEB APP ENTRY POINTS
// ============================================================================

function doGet(e) {
  try {
    var page = 'dashboard';
    if (e && e.parameter && e.parameter.page) {
      page = e.parameter.page;
    }
    
    Log.info('doGet', 'Rendering page: ' + page);
    
    var user = getCurrentUserWithRole();
    
    var html;
    
    switch(page) {
      case 'dashboard':
        html = renderDashboard(user);
        break;
      case 'create':
        html = renderCreateWO(user);
        break;
      case 'mechanic':
        html = renderMechanicDashboard(user, e);
        break;
      case 'approvals':
        html = renderApprovals(user, e);
        break;
      case 'reports':
        html = renderReports(user);
        break;
      default:
        Log.warn('doGet', 'Unknown page, using dashboard', {page: page});
        html = renderDashboard(user);
    }
    
    return html;
    
  } catch (e) {
    Log.exception('doGet', e);
    return renderError('Failed to load page: ' + e.message);
  }
}

function doPost(e) {
  try {
    var action = e.parameter.action;
    var data = JSON.parse(e.parameter.data || '{}');
    
    var result;
    
    switch(action) {
      case 'createWO':                    result = handleCreateWO(data); break;
      case 'startWO':                     result = handleStartWO(data); break;
      case 'finishWO':                    result = handleFinishWO(data); break;
      case 'submitWO':                    result = handleSubmitWO(data); break;
      
      // Mechanic actions (Workflow B)
      case 'getMyWos':                    result = handleGetMyAssignedWOs(data); break;
      case 'getWoDetailForMechanic':      result = handleGetWoDetailForMechanic(data); break;
      case 'submitMechanicWork':          result = handleSubmitMechanicWork(data); break;
      
      case 'supervisorApprove':           result = handleSupervisorApprove(data); break;
      case 'supervisorReject':            result = handleSupervisorReject(data); break;
      case 'superintendentApprove':       result = handleSuperintendentApprove(data); break;
      case 'superintendentReject':        result = handleSuperintendentReject(data); break;
      
      case 'createOthersJob':             result = handleCreateOthersJob(data); break;
      case 'approveOthersJob':            result = handleApproveOthersJob(data); break;
      
      case 'getDashboardData':            result = handleGetDashboardData(data); break;
      case 'getWODetails':                result = handleGetWODetails(data); break;
      case 'getPendingApprovals':         result = handleGetPendingApprovals(data); break;
      case 'cancelWO':                    result = handleCancelWO(data); break;
      case 'generatePayrollReport': result = handleGeneratePayrollReport(data); break;
      
      default:
        result = errorResponse(ERROR_CODES.VALIDATION_INVALID, 'Unknown action: ' + action);
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
    
  } catch (e) {
    Log.exception('doPost', e);
    var errorResult = errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
    return ContentService.createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleGeneratePayrollReport(data) {
  try {
    return generatePayrollReport(
      data.filter_type, data.year, data.month,
      data.start_date, data.end_date
    );
  } catch(e) {
    Log.exception('handleGeneratePayrollReport', e);
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// PAGE RENDERERS
// ============================================================================

function renderDashboard(user) {
  // Mechanic → redirect to My Work page
 if (user.role === ROLES.MECHANIC) {
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><head>' +
      '<meta http-equiv="refresh" content="0;url=https://script.google.com/macros/s/AKfycbxVk6kf91AQlFo39XWSBugE0OxUvjhx9bsgBNLSPEkQlSh03fV2Ukl_YLcNhoNWUrqmbA/exec?page=mechanic">' +
      '</head><body>' +
      '<p>Redirecting to My Work...</p>' +
      '<script>window.location.replace("https://script.google.com/macros/s/AKfycbxVk6kf91AQlFo39XWSBugE0OxUvjhx9bsgBNLSPEkQlSh03fV2Ukl_YLcNhoNWUrqmbA/exec?page=mechanic");<\/script>' +
      '</body></html>'
    ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  var template = HtmlService.createTemplateFromFile('Main');
  template.user = user;
  template.dashboardData = getDashboardData(user);
  
  return template.evaluate()
    .setTitle('Mechanic Incentive System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function renderCreateWO(user) {
  var template = HtmlService.createTemplateFromFile('WorkOrder');
  template.user = user;
  template.userScope = getUserSectionScope(user.email);
  template.components = loadComponents();
  template.units = loadUnits();
  template.mechanics = getMechanicsByRole(ROLES.MECHANIC);
  template.workConditions = getWorkConditionOptionsForView();
  
  return template.evaluate()
    .setTitle('Create Work Order')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Render Mechanic Dashboard — Workflow B FASE 3 v1.2
 * 
 * Supports impersonate via URL param ?as=MECH-001
 */
function renderMechanicDashboard(user, e) {
  var filter = 'assigned';
  var viewAsMechanicId = null;
  
  if (e && e.parameter) {
    if (e.parameter.filter) {
      filter = e.parameter.filter;
    }
    // ← NEW v1.2: Parse ?as=MECH-001
    if (e.parameter.as) {
      viewAsMechanicId = e.parameter.as;
    }
  }
  
  // Call backend dengan viewAsMechanicId (param ke-3)
  var assignedResult = getMyAssignedWOs(user.email, filter, viewAsMechanicId);
  
  var initialData = isSuccess(assignedResult) ? assignedResult.data : {
    wos: [],
    counts: {all: 0, assigned: 0, in_progress: 0, pending_approval: 0, done: 0},
    mechanic: null,
    activeFilter: filter,
    viewing_as: null  // ← NEW v1.2
  };
  
  Log.info('renderMechanicDashboard', 'Loaded data', {
    user: user.email,
    filter: filter,
    viewAs: viewAsMechanicId,
    woCount: initialData.wos.length,
    impersonating: !!initialData.viewing_as
  });
  
  var template = HtmlService.createTemplateFromFile('MechanicDashboard');
  template.user = user;
  template.initialData = initialData;
  template.activeFilter = filter;
  template.viewAsMechanicId = viewAsMechanicId;  // ← NEW v1.2: pass to template
  // FASE 1.5: grid impersonate hanya mekanik dalam scope approver (HO kosong = semua)
  var selectorMechs = [];
  if (user.role !== ROLES.MECHANIC && !viewAsMechanicId) {
    selectorMechs = getMechanicsByRole(ROLES.MECHANIC);
    var selScope = getUserSectionScope(user.email);
    if (selScope) {
      var selFiltered = [];
      for (var sm = 0; sm < selectorMechs.length; sm++) {
        if (userScopeAllows(selScope, selectorMechs[sm].section)) selFiltered.push(selectorMechs[sm]);
      }
      selectorMechs = selFiltered;
    }
  }
  template.allMechanicsForSelector = selectorMechs;
  
  return template.evaluate()
    .setTitle('My Work Orders')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function renderApprovals(user, e) {
  var view = (e && e.parameter && e.parameter.view) ? e.parameter.view : 'pending';
  var template = HtmlService.createTemplateFromFile('Approval');
  template.user = user;
  template.currentView = view;

  // Hanya load data untuk view aktif → cepat
  template.pendingApprovals = [];
  template.allMechanics = [];
  template.activeWos = [];
  template.approvedWos = [];

  if (view === 'pending') {
    var pendingResult = getPendingApprovalsEnriched(user.email);
    template.pendingApprovals = isSuccess(pendingResult) ? pendingResult.data : [];
    var mechsResult = getAllMechanicsForOverride();
    template.allMechanics = isSuccess(mechsResult) ? mechsResult.data : [];
  } else if (view === 'active') {
    var activeWosResult = getAllActiveWosForManagement();
    template.activeWos = isSuccess(activeWosResult) ? activeWosResult.data : [];
  } else if (view === 'approved') {
    var approvedWosResult = getApprovedWosForManagement();
    template.approvedWos = isSuccess(approvedWosResult) ? approvedWosResult.data : [];
  }

  return template.evaluate()
    .setTitle('Approvals')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ============================================================================
// VIEW HELPERS
// ============================================================================

function getWorkConditionOptionsForView() {
  try {
    var allFactors = loadFactors();
    var conditions = (allFactors && allFactors.work_condition) || {};
    
    return [
      {
        key: WORK_CONDITION_KEYS.NORMAL,
        label: 'Shift 1',                    // ← was 'Normal'
        factor: (typeof conditions.normal === 'number') ? conditions.normal : 1.0
      },
      {
        key: WORK_CONDITION_KEYS.DIFFICULT,
        label: 'Shift 2',                    // ← was 'Difficult'
        factor: (typeof conditions.difficult === 'number') ? conditions.difficult : 1.1
      },
      {
        key: WORK_CONDITION_KEYS.EXTREME,
        label: 'Kondisi Ekstrim',                     // ← was 'Extreme'
        factor: (typeof conditions.extreme === 'number') ? conditions.extreme : 1.2
      }
    ];
  } catch (e) {
    Log.exception('getWorkConditionOptionsForView', e);
    return [
      {key: 'normal',    label: 'Shift 1',  factor: 1.0},   // ← was 'Normal'
      {key: 'difficult', label: 'Shift 2',  factor: 1.1},   // ← was 'Difficult'
      {key: 'extreme',   label: 'Kondisi Ekstrim',   factor: 1.2}    // ← was 'Extreme'
    ];
  }
}

// ============================================================================
// ACTION HANDLERS (Work Orders)
// ============================================================================

function handleStartWO(data) {
  return startWorkOrder(data.wo_id, getCurrentUser());
}

function handleFinishWO(data) {
  return finishWorkOrder(
    data.wo_id,
    data.actual_hours,
    data.work_condition,
    data.safety_incident || false,
    getCurrentUser()
  );
}

function handleSubmitWO(data) {
  return submitForApproval(data.wo_id, getCurrentUser());
}

// ============================================================================
// ACTION HANDLERS (Mechanic — Workflow B v1.2)
// ============================================================================

/**
 * Handler for mechanic WO list — v1.2 dengan impersonate support
 */
function handleGetMyAssignedWOs(data) {
  Log.info('handleGetMyAssignedWOs', 'Request received', {
    filter: data.filter,
    viewAs: data.view_as  // ← NEW v1.2
  });
  
  try {
    var user = getCurrentUserWithRole();
    var filter = data.filter || 'all';
    var viewAs = data.view_as || null;  // ← NEW v1.2
    
    // Pass viewAs sebagai param ke-3
    return getMyAssignedWOs(user.email, filter, viewAs);
  } catch (e) {
    Log.exception('handleGetMyAssignedWOs', e);
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Handler for WO detail — v1.2 dengan impersonate support
 */
function handleGetWoDetailForMechanic(data) {
  Log.info('handleGetWoDetailForMechanic', 'Request received', {
    wo_id: data.wo_id,
    viewAs: data.view_as  // ← NEW v1.2
  });
  
  try {
    if (!data.wo_id) {
      return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'wo_id required');
    }
    
    var user = getCurrentUserWithRole();
    var viewAs = data.view_as || null;  // ← NEW v1.2
    
    // Pass viewAs sebagai param ke-3
    return getWoDetailForMechanic(data.wo_id, user.email, viewAs);
  } catch (e) {
    Log.exception('handleGetWoDetailForMechanic', e);
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

function handleSubmitMechanicWork(data) {
  Log.separator('HANDLE SUBMIT MECHANIC WORK');
  
  try {
    Log.info('handleSubmitMechanicWork', 'Request received', {
      wo_id: data.wo_id,
      start_time: data.start_time,
      end_time: data.end_time
    });
    
    if (!data.wo_id)     return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'wo_id required');
    if (!data.start_time)return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'start_time required');
    if (!data.end_time)  return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'end_time required');
    
    var user = getCurrentUserWithRole();
    return submitMechanicWork(data.wo_id, data.start_time, data.end_time, user.email, data.hour_meter, data.kilometers, data.part_category);
    
  } catch (e) {
    Log.exception('handleSubmitMechanicWork', e);
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// ACTION HANDLERS (Approvals)
// ============================================================================

function handleSupervisorApprove(data) {
  return supervisorApprove(data.wo_id, getCurrentUser(), data.notes || '');
}

function handleSupervisorReject(data) {
  return supervisorReject(data.wo_id, getCurrentUser(), data.reason);
}

function handleSuperintendentApprove(data) {
  return superintendentApprove(data.wo_id, getCurrentUser(), data.notes || '');
}

function handleSuperintendentReject(data) {
  return superintendentReject(data.wo_id, getCurrentUser(), data.reason);
}

// ============================================================================
// ACTION HANDLERS (Others Job)
// ============================================================================

function handleCreateOthersJob(data) {
  return createOthersJobRequest(data.job_description, getCurrentUser());
}

function handleApproveOthersJob(data) {
  return supervisorApproveOthersJob(data.request_id, getCurrentUser(), data.notes || '');
}

// ============================================================================
// DATA QUERY HANDLERS
// ============================================================================

function handleGetDashboardData(data) {
  try {
    var user = getCurrentUserWithRole();
    return successResponse(getDashboardData(user));
  } catch (e) {
    Log.exception('handleGetDashboardData', e);
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

function handleGetWODetails(data) {
  try {
    var woResult = getWorkOrderById(data.wo_id);
    if (isError(woResult)) return woResult;
    
    var wo = woResult.data;
    
    var teamResult = getTeamMembers(data.wo_id);
    var team = isSuccess(teamResult) ? teamResult.data : [];
    
    var approvalsResult = getApprovalsByWoId(data.wo_id);
    var approvals = isSuccess(approvalsResult) ? approvalsResult.data : [];
    
    var snapshot = null;
    if (wo.status === WO_STATUS.APPROVED) {
      var snapshotResult = getScoringSnapshot(data.wo_id);
      snapshot = isSuccess(snapshotResult) ? snapshotResult.data : null;
    }
    
    return successResponse({
      wo: wo,
      team: team,
      approvals: approvals,
      snapshot: snapshot
    });
  } catch (e) {
    Log.exception('handleGetWODetails', e);
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

function handleGetPendingApprovals(data) {
  return getPendingApprovals(getCurrentUser());
}

// ============================================================================
// INCLUDE HTML FILES
// ============================================================================

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================================
// UTILITY - Get Script URL
// ============================================================================

function getScriptUrl() {
  var url = ScriptApp.getService().getUrl();
  return url;
}

function getWebAppUrl(page) {
  var baseUrl = getScriptUrl();
  if (page) {
    return baseUrl + '?page=' + page;
  }
  return baseUrl;
}

// ============================================================================
// DEBUG FUNCTIONS
// ============================================================================

function debugCreateWO() {
  Log.separator('DEBUG Create WO Page');
  
  try {
    var user = getCurrentUserWithRole();
    Log.info('debug', 'User: ' + user.email + ' | Role: ' + user.role);
    
    var components = loadComponents();
    Log.info('debug', 'Components loaded: ' + components.length);
    
    var units = loadUnits();
    Log.info('debug', 'Units loaded: ' + units.length);
    
    var mechanics = getMechanicsByRole(ROLES.MECHANIC);
    Log.info('debug', 'Mechanics loaded: ' + mechanics.length);
    
    var workConditions = getWorkConditionOptionsForView();
    Log.info('debug', 'Work conditions loaded: ' + workConditions.length);
    
    var template = HtmlService.createTemplateFromFile('WorkOrder');
    template.user = user;
    template.components = components;
    template.units = units;
    template.mechanics = mechanics;
    template.workConditions = workConditions;
    
    var html = template.evaluate();
    var content = html.getContent();
    Log.info('debug', 'HTML length: ' + content.length);
    
    return {success: content.length > 100, html_length: content.length};
  } catch (e) {
    Log.exception('debugCreateWO', e);
    return {success: false, error: e.message};
  }
}

/**
 * DEBUG: Test Mechanic Dashboard rendering
 */
function debugMechanicDashboard() {
  Log.separator('DEBUG Mechanic Dashboard');
  
  try {
    var user = getCurrentUserWithRole();
    Log.info('debug', '1. User: ' + user.email + ' / role: ' + user.role);
    
    var assignedResult = getMyAssignedWOs(user.email, 'all');
    if (isSuccess(assignedResult)) {
      var data = assignedResult.data;
      Log.info('debug', '2. WOs found: ' + data.wos.length);
      Log.info('debug', '3. Counts: ' + JSON.stringify(data.counts));
      Log.info('debug', '4. Mechanic info: ' + JSON.stringify(data.mechanic));
    } else {
      Log.error('debug', 'Failed to load WOs: ' + assignedResult.error.message);
    }
    
    Log.info('debug', '5. Creating template MechanicDashboard...');
    var template = HtmlService.createTemplateFromFile('MechanicDashboard');
    template.user = user;
    template.initialData = isSuccess(assignedResult) ? assignedResult.data : {
      wos: [],
      counts: {all: 0, assigned: 0, in_progress: 0, pending_approval: 0, done: 0},
      mechanic: null
    };
    template.activeFilter = 'all';
    
    var html = template.evaluate();
    var content = html.getContent();
    Log.info('debug', '6. HTML length: ' + content.length);
    
    if (content.length < 500) {
      Log.error('debug', '❌ HTML TOO SHORT: ' + content.substring(0, 500));
    } else {
      Log.info('debug', '✅ HTML rendered successfully');
    }
    
    Log.separator('DEBUG COMPLETE');
    
  } catch (e) {
    Log.error('debug', '❌ ERROR: ' + e.message);
    Log.error('debug', 'Stack: ' + e.stack);
  }
}

function debugDashboard() {
  Log.separator('DEBUG Dashboard Render');
  
  try {
    var user = getCurrentUserWithRole();
    Log.info('debug', '1. User: ' + JSON.stringify(user));
    
    var dashData = getDashboardData(user);
    Log.info('debug', '2. DashData keys: ' + Object.keys(dashData).join(', '));
    Log.info('debug', '3. DashData.user: ' + JSON.stringify(dashData.user));
    Log.info('debug', '4. DashData.stats: ' + JSON.stringify(dashData.stats));
    Log.info('debug', '5. DashData has charts: ' + (dashData.charts ? 'YES' : 'NO'));
    
    var template = HtmlService.createTemplateFromFile('Main');
    template.user = user;
    template.dashboardData = dashData;
    
    var html = template.evaluate();
    var content = html.getContent();
    Log.info('debug', '8. HTML length: ' + content.length);
    
    if (content.length < 500) {
      Log.error('debug', '❌ HTML TOO SHORT: ' + content);
    } else {
      Log.info('debug', '✅ HTML rendered successfully');
    }
    
    Log.separator('DEBUG COMPLETE');
    
  } catch (e) {
    Log.error('debug', '❌ ERROR: ' + e.message);
    Log.error('debug', 'Stack: ' + e.stack);
  }
}

function debugStyles() {
  try {
    var stylesContent = HtmlService.createHtmlOutputFromFile('Styles').getContent();
    Log.info('debug', 'Styles loaded! Length: ' + stylesContent.length);
    return {success: true, length: stylesContent.length};
  } catch (e) {
    Log.error('debug', 'Failed: ' + e.message);
    return {success: false, error: e.message};
  }
}

// ============================================================================
// CREATE WORK ORDER HANDLER (Workflow B)
// ============================================================================


function handleCreateWO(data) {
  Log.separator('HANDLE CREATE WO');
  
  try {
    var user = getCurrentUserWithRole();

    // ── NEW (Feature #7): multi-block batch create ──
    // WorkOrder.html baru selalu kirim { blocks: [...] }. Tiap blok jadi WO
    // sendiri lewat createWorkOrdersBatch → createWorkOrder (reuse).
    if (data && data.blocks && data.blocks.length) {
      Log.info('handleCreateWO', 'Batch create', {blockCount: data.blocks.length});
      var batchResult = createWorkOrdersBatch(data.blocks, user.email);
      Log.info('handleCreateWO', 'Batch result', {created: batchResult.created_count, failed: batchResult.failed_count});
      return {success: batchResult.success, data: batchResult};
    }

    // ── LEGACY: single-WO create (tak berubah, backward compatible) ──
    Log.info('handleCreateWO', 'Request received', {
      component_id: data.component_id,
      unit_id: data.unit_id,
      work_condition: data.work_condition,
      hasTeamData: !!data.team_distribution,
      isOthers: data.component_id === 'COM-OTHERS'
    });
    
    if (!data || !data.component_id) {
      return {success: false, error: {message: 'component_id is required'}};
    }
    
    if (!data.work_condition) {
      return {success: false, error: {message: 'Work condition is required (normal | difficult | extreme)'}};
    }
    
    var isOthers = (data.component_id === 'COM-OTHERS');
    
    // For non-Others, unit_id required
    if (!isOthers && !data.unit_id) {
      return {success: false, error: {message: 'unit_id is required'}};
    }
    
    // Build othersData if Others mode
    var othersData = null;
    if (isOthers) {
      othersData = {
        description: data.others_description,
        base_points: parseFloat(data.manual_base_points),
        target_hours: parseFloat(data.manual_target_hours),
        unit_factor: parseFloat(data.manual_unit_factor)
      };
    }
    
    var teamMembers = [];
    if (data.team_distribution) {
      for (var mechanicId in data.team_distribution) {
        if (data.team_distribution.hasOwnProperty(mechanicId)) {
          teamMembers.push({
            mechanic_id: mechanicId,
            percentage: parseFloat(data.team_distribution[mechanicId])
          });
        }
      }
    }
    
    // FULL-POINT: tiap anggota wajib 100 — payload porsi lama ditolak keras
    if (teamMembers.length > 0) {
      for (var i = 0; i < teamMembers.length; i++) {
        if (Math.abs(teamMembers[i].percentage - 100) > 0.01) {
          return {success: false, error: {message: 'Full-point model: setiap mekanik harus 100 (dapat ' + teamMembers[i].percentage + ' untuk ' + teamMembers[i].mechanic_id + ')'}};
        }
      }
    }

    var location = data.location || 'workshop';
    Log.info('handleCreateWO', 'Creating work order...', {isOthers: isOthers});
    
    var result = createWorkOrder(
      data.component_id,
      data.unit_id,
      data.work_condition,
      teamMembers,
      user.email,
      othersData,
      location,
      null,
      {section: data.section, job_id: data.job_id, keterangan: data.keterangan}
    );
    
    var response = {
      success: true,
      data: {
        wo_id: result.wo_id,
        wo_number: result.wo_number,
        status: result.status,
        work_condition: result.work_condition,
        created_at: result.created_at,
        is_others: result.is_others
      }
    };
    
    Log.info('handleCreateWO', 'Work order created successfully', response.data);
    return response;
    
  } catch (e) {
    Log.exception('handleCreateWO', e);
    return {
      success: false,
      error: {message: e.message || 'Failed to create work order', stack: e.stack}
    };
  }
}



function renderReports(user) {
  var template = HtmlService.createTemplateFromFile('Reports');
  template.user = user;
  
  return template.evaluate()
    .setTitle('Reports')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function renderError(message) {
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>body{font-family:Arial,sans-serif;display:flex;align-items:center;' +
    'justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;}' +
    '.error-box{background:white;padding:40px;border-radius:12px;text-align:center;' +
    'box-shadow:0 2px 8px rgba(0,0,0,0.1);max-width:500px;}' +
    'h2{color:#ef4444;margin-bottom:16px;}p{color:#6b7280;margin-bottom:24px;}' +
    'a{background:#3b82f6;color:white;padding:10px 20px;border-radius:8px;' +
    'text-decoration:none;font-weight:600;}</style></head><body>' +
    '<div class="error-box"><h2>⚠️ Error</h2>' +
    '<p>' + (message || 'An unexpected error occurred') + '</p>' +
    '<a href="' + ScriptApp.getService().getUrl() + '" target="_top">← Back to Dashboard</a>' +
    '</div></body></html>';
  
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function handleCancelWO(data) {
  try {
    if (!data.wo_id) return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'wo_id required');
    if (!data.reason) return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'reason required');
    return cancelWorkOrder(data.wo_id, getCurrentUser(), data.reason);
  } catch (e) {
    Log.exception('handleCancelWO', e);
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}