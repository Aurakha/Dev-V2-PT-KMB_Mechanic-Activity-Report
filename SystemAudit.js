/**
 * ============================================================================
 * SystemAudit.gs - Snapshot Kondisi Sistem
 * ============================================================================
 * 
 * Run function `auditSystemStatus()` untuk dapat snapshot lengkap sistem.
 * Output di Executions log — copy semua hasil dan kirim ke Claude.
 * 
 * Function ini READ-ONLY, tidak mengubah data apapun.
 * ============================================================================
 */

function auditSystemStatus() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  SYSTEM AUDIT - MECHANIC INCENTIVE SYSTEM                      ║');
  console.log('║  ' + new Date().toString().substring(0, 33) + '                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  try {
    _auditDeployment();
    _auditSheets();
    _auditConfigData();
    _auditWorkOrders();
    _auditApprovals();
    _auditScoringAndPoints();
    _auditFunctionExistence();
    _auditIntegration();
    
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  AUDIT COMPLETE - Copy semua log di atas dan kirim ke Claude   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    
  } catch (e) {
    console.log('');
    console.log('❌ AUDIT ERROR: ' + e.message);
    console.log('Stack: ' + e.stack);
  }
}

// ============================================================================
// SECTION 1: DEPLOYMENT INFO
// ============================================================================

function _auditDeployment() {
  console.log('');
  console.log('━━━ 1. DEPLOYMENT INFO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    var url = ScriptApp.getService().getUrl();
    console.log('Web App URL: ' + (url || '(belum di-deploy)'));
  } catch (e) {
    console.log('Web App URL: ERROR - ' + e.message);
  }
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    console.log('Spreadsheet: ' + ss.getName());
    console.log('Spreadsheet ID: ' + ss.getId());
    console.log('Spreadsheet URL: ' + ss.getUrl());
  } catch (e) {
    console.log('Spreadsheet: ERROR - ' + e.message);
  }
  
  try {
    console.log('Current user: ' + Session.getActiveUser().getEmail());
    console.log('Timezone: ' + Session.getScriptTimeZone());
  } catch (e) {
    console.log('User info: ERROR - ' + e.message);
  }
}

// ============================================================================
// SECTION 2: SHEETS INVENTORY
// ============================================================================

function _auditSheets() {
  console.log('');
  console.log('━━━ 2. SHEETS INVENTORY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();
    
    console.log('Total sheets: ' + sheets.length);
    console.log('');
    console.log('Sheet Name                          | Rows  | Cols | Header Row');
    console.log('────────────────────────────────────┼───────┼──────┼─────────────────────');
    
    sheets.forEach(function(sheet) {
      var name = sheet.getName();
      var rows = sheet.getLastRow();
      var cols = sheet.getLastColumn();
      var header = '';
      
      try {
        if (rows >= 1 && cols >= 1) {
          var headerRow = sheet.getRange(1, 1, 1, Math.min(cols, 6)).getValues()[0];
          header = headerRow.join(', ');
          if (cols > 6) header += ', ...';
        }
      } catch (e) {
        header = '(error reading)';
      }
      
      console.log(
        _padRight(name, 35) + ' | ' +
        _padLeft(String(rows), 5) + ' | ' +
        _padLeft(String(cols), 4) + ' | ' +
        header.substring(0, 60)
      );
    });
  } catch (e) {
    console.log('ERROR reading sheets: ' + e.message);
  }
}

// ============================================================================
// SECTION 3: CONFIG DATA SUMMARY
// ============================================================================

function _auditConfigData() {
  console.log('');
  console.log('━━━ 3. CONFIG DATA SUMMARY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  // Components
  _trySection('Config_Components', function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config_Components');
    if (!sheet) { console.log('  (sheet not found)'); return; }
    var rows = sheet.getLastRow() - 1;
    console.log('  Components: ' + rows + ' rows');
    if (rows > 0) {
      var sample = sheet.getRange(2, 1, Math.min(3, rows), Math.min(6, sheet.getLastColumn())).getValues();
      console.log('  Sample (first 3):');
      sample.forEach(function(r) { console.log('    ' + r.join(' | ')); });
    }
  });
  
  // Units
  _trySection('Config_Units', function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config_Units');
    if (!sheet) { console.log('  (sheet not found)'); return; }
    var rows = sheet.getLastRow() - 1;
    console.log('  Units: ' + rows + ' rows');
    if (rows > 0) {
      var data = sheet.getRange(2, 1, rows, Math.min(6, sheet.getLastColumn())).getValues();
      data.forEach(function(r) { console.log('    ' + r.join(' | ')); });
    }
  });
  
  // Mechanics
  _trySection('Config_Mechanics', function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config_Mechanics');
    if (!sheet) { console.log('  (sheet not found)'); return; }
    var rows = sheet.getLastRow() - 1;
    console.log('  Mechanics: ' + rows + ' rows');
    if (rows > 0) {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var data = sheet.getRange(2, 1, rows, sheet.getLastColumn()).getValues();
      
      // Count by role
      var roleIdx = headers.indexOf('role');
      if (roleIdx >= 0) {
        var roleCount = {};
        data.forEach(function(r) {
          var role = r[roleIdx] || '(none)';
          roleCount[role] = (roleCount[role] || 0) + 1;
        });
        console.log('  By role: ' + JSON.stringify(roleCount));
      }
      
      console.log('  Sample (first 3):');
      data.slice(0, 3).forEach(function(r) { console.log('    ' + r.slice(0, 5).join(' | ')); });
    }
  });
  
  // Factors
  _trySection('Config_Factors', function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config_Factors');
    if (!sheet) { console.log('  (sheet not found)'); return; }
    var rows = sheet.getLastRow() - 1;
    console.log('  Factors: ' + rows + ' rows');
    if (rows > 0) {
      var data = sheet.getRange(2, 1, rows, Math.min(4, sheet.getLastColumn())).getValues();
      data.forEach(function(r) { console.log('    ' + r.join(' | ')); });
    }
  });
  
  // Base Settings
  _trySection('Config_BaseSettings', function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config_BaseSettings');
    if (!sheet) { console.log('  (sheet not found)'); return; }
    var rows = sheet.getLastRow() - 1;
    console.log('  Settings: ' + rows + ' rows');
    if (rows > 0) {
      var data = sheet.getRange(2, 1, rows, Math.min(3, sheet.getLastColumn())).getValues();
      data.forEach(function(r) { console.log('    ' + r.join(' | ')); });
    }
  });
}

// ============================================================================
// SECTION 4: WORK ORDERS
// ============================================================================

function _auditWorkOrders() {
  console.log('');
  console.log('━━━ 4. WORK ORDERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  _trySection('WorkOrders', function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WorkOrders');
    if (!sheet) { console.log('  (sheet not found)'); return; }
    
    var rows = sheet.getLastRow() - 1;
    console.log('  Total Work Orders: ' + rows);
    
    if (rows === 0) {
      console.log('  (no work orders yet)');
      return;
    }
    
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var data = sheet.getRange(2, 1, rows, sheet.getLastColumn()).getValues();
    
    console.log('  Headers: ' + headers.join(', '));
    console.log('');
    
    // Status breakdown
    var statusIdx = headers.indexOf('status');
    if (statusIdx >= 0) {
      var statusCount = {};
      data.forEach(function(r) {
        var s = r[statusIdx] || '(none)';
        statusCount[s] = (statusCount[s] || 0) + 1;
      });
      console.log('  By status: ' + JSON.stringify(statusCount));
      console.log('');
    }
    
    // All WOs (compact)
    var woIdx = headers.indexOf('wo_number');
    var compIdx = headers.indexOf('component_id');
    var unitIdx = headers.indexOf('unit_id');
    var creatorIdx = headers.indexOf('created_by');
    var createdAtIdx = headers.indexOf('created_at');
    
    console.log('  All WOs:');
    data.forEach(function(r, i) {
      var line = '  [' + (i + 1) + '] ' +
        (woIdx >= 0 ? r[woIdx] : '?') + ' | ' +
        'status=' + (statusIdx >= 0 ? r[statusIdx] : '?') + ' | ' +
        'comp=' + (compIdx >= 0 ? r[compIdx] : '?') + ' | ' +
        'unit=' + (unitIdx >= 0 ? r[unitIdx] : '?') + ' | ' +
        'by=' + (creatorIdx >= 0 ? r[creatorIdx] : '?');
      console.log(line);
    });
  });
  
  // Work Order Team
  _trySection('WorkOrderTeam', function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WorkOrderTeam');
    if (!sheet) { console.log('  (sheet not found)'); return; }
    var rows = sheet.getLastRow() - 1;
    console.log('  Team assignments: ' + rows + ' rows');
    if (rows > 0 && rows <= 20) {
      var data = sheet.getRange(2, 1, rows, Math.min(5, sheet.getLastColumn())).getValues();
      data.forEach(function(r) { console.log('    ' + r.join(' | ')); });
    } else if (rows > 20) {
      console.log('  (showing first 5)');
      var data = sheet.getRange(2, 1, 5, Math.min(5, sheet.getLastColumn())).getValues();
      data.forEach(function(r) { console.log('    ' + r.join(' | ')); });
    }
  });
}

// ============================================================================
// SECTION 5: APPROVALS
// ============================================================================

function _auditApprovals() {
  console.log('');
  console.log('━━━ 5. APPROVALS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  _trySection('Approvals', function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Approvals');
    if (!sheet) { console.log('  (sheet not found)'); return; }
    var rows = sheet.getLastRow() - 1;
    console.log('  Total Approvals: ' + rows);
    
    if (rows === 0) {
      console.log('  (no approvals yet — approval workflow belum pernah jalan)');
      return;
    }
    
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    console.log('  Headers: ' + headers.join(', '));
    
    var data = sheet.getRange(2, 1, Math.min(rows, 10), sheet.getLastColumn()).getValues();
    data.forEach(function(r, i) {
      console.log('  [' + (i + 1) + '] ' + r.slice(0, 6).join(' | '));
    });
  });
}

// ============================================================================
// SECTION 6: SCORING & POINTS
// ============================================================================

function _auditScoringAndPoints() {
  console.log('');
  console.log('━━━ 6. SCORING & POINTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  _trySection('ScoringSnapshots', function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ScoringSnapshots');
    if (!sheet) { console.log('  (sheet not found)'); return; }
    var rows = sheet.getLastRow() - 1;
    console.log('  ScoringSnapshots: ' + rows + ' rows ' + (rows === 0 ? '(belum ada scoring)' : ''));
  });
  
  _trySection('MechanicPoints', function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MechanicPoints');
    if (!sheet) { console.log('  (sheet not found)'); return; }
    var rows = sheet.getLastRow() - 1;
    console.log('  MechanicPoints: ' + rows + ' rows ' + (rows === 0 ? '(belum ada poin masuk)' : ''));
    if (rows > 0 && rows <= 10) {
      var data = sheet.getRange(2, 1, rows, Math.min(5, sheet.getLastColumn())).getValues();
      data.forEach(function(r) { console.log('    ' + r.join(' | ')); });
    }
  });
  
  _trySection('MtbfTracking', function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MtbfTracking');
    if (!sheet) { console.log('  (sheet not found)'); return; }
    var rows = sheet.getLastRow() - 1;
    console.log('  MtbfTracking: ' + rows + ' rows');
  });
  
  _trySection('OthersJobRequests', function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('OthersJobRequests');
    if (!sheet) { console.log('  (sheet not found)'); return; }
    var rows = sheet.getLastRow() - 1;
    console.log('  OthersJobRequests: ' + rows + ' rows');
  });
  
  _trySection('AuditLogs', function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('AuditLogs');
    if (!sheet) { console.log('  (sheet not found)'); return; }
    var rows = sheet.getLastRow() - 1;
    console.log('  AuditLogs: ' + rows + ' rows');
    if (rows > 0) {
      console.log('  Last 5 actions:');
      var startRow = Math.max(2, rows - 3);
      var count = Math.min(5, rows);
      var data = sheet.getRange(Math.max(2, rows + 2 - count), 1, count, Math.min(5, sheet.getLastColumn())).getValues();
      data.forEach(function(r) { console.log('    ' + r.join(' | ')); });
    }
  });
}

// ============================================================================
// SECTION 7: FUNCTION EXISTENCE CHECK
// ============================================================================

function _auditFunctionExistence() {
  console.log('');
  console.log('━━━ 7. KEY FUNCTIONS CHECK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  var criticalFunctions = [
    // Backend services
    'getCurrentUserWithRole',
    'createWorkOrder',
    'handleCreateWO',
    'approveBySupervisor',
    'approveBySuperintendent',
    'rejectByApprover',
    
    // Scoring (lama)
    'calculateScore',
    'saveScoringSnapshot',
    'distributePoints',
    
    // Points Calculation (baru)
    'calculateFinalPoints',
    'calculateTimelinessFactorAuto',
    'calculateWithTimelinessOverride',
    'previewCalculation',
    'distributePointsToTeam',
    
    // Config / data
    'getComponentById',
    'getUnitById',
    'loadFactors',
    'getSetting',
    
    // Router
    'doGet',
    'doPost',
    
    // Dashboard
    'getDashboardData',
    'getLeaderboard',
    'getQuickStats',
    
    // Helpers
    'getRowById',
    'successResponse',
    'errorResponse',
    'isSuccess'
  ];
  
  console.log('  Function                              | Exists?');
  console.log('  ──────────────────────────────────────┼─────────');
  criticalFunctions.forEach(function(fn) {
    var exists = false;
    try {
      exists = (typeof this[fn] === 'function') || (typeof eval(fn) === 'function');
    } catch (e) {
      exists = false;
    }
    console.log('  ' + _padRight(fn, 38) + ' | ' + (exists ? '✅ YES' : '❌ NO'));
  });
}

// ============================================================================
// SECTION 8: INTEGRATION CHECK
// ============================================================================

function _auditIntegration() {
  console.log('');
  console.log('━━━ 8. INTEGRATION CHECK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  // Test 1: Is PointsCalculation hooked into approval flow?
  console.log('  Q: Apakah approveBySuperintendent (atau approveBySupervisor) memanggil calculateFinalPoints?');
  try {
    var fnSource = '';
    if (typeof approveBySuperintendent === 'function') {
      fnSource += approveBySuperintendent.toString();
    }
    if (typeof approveBySupervisor === 'function') {
      fnSource += approveBySupervisor.toString();
    }
    
    if (fnSource === '') {
      console.log('  A: ❌ Function approval tidak ditemukan');
    } else {
      var callsNew = fnSource.indexOf('calculateFinalPoints') >= 0;
      var callsOld = fnSource.indexOf('calculateScore') >= 0;
      console.log('  A: calculateFinalPoints (baru) = ' + (callsNew ? '✅ DIPANGGIL' : '❌ TIDAK'));
      console.log('     calculateScore (lama)        = ' + (callsOld ? '✅ DIPANGGIL' : '❌ TIDAK'));
    }
  } catch (e) {
    console.log('  A: ERROR - ' + e.message);
  }
  
  console.log('');
  
  // Test 2: Is current user resolvable?
  console.log('  Q: Apakah getCurrentUserWithRole() bekerja?');
  try {
    if (typeof getCurrentUserWithRole === 'function') {
      var user = getCurrentUserWithRole();
      console.log('  A: ✅ User: ' + (user.email || '?') + ' | role: ' + (user.role || '?') + ' | id: ' + (user.id || '?'));
    } else {
      console.log('  A: ❌ Function tidak ada');
    }
  } catch (e) {
    console.log('  A: ❌ ERROR - ' + e.message);
  }
  
  console.log('');
  
  // Test 3: Can we list pending approvals?
  console.log('  Q: Berapa WO pending approval saat ini?');
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WorkOrders');
    if (sheet && sheet.getLastRow() > 1) {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
      var statusIdx = headers.indexOf('status');
      if (statusIdx >= 0) {
        var pendingSpv = 0, pendingSpt = 0, approved = 0, rejected = 0, other = 0;
        data.forEach(function(r) {
          var s = String(r[statusIdx] || '');
          if (s.indexOf('supervisor') >= 0) pendingSpv++;
          else if (s.indexOf('superintendent') >= 0) pendingSpt++;
          else if (s.indexOf('approved') >= 0 || s === 'completed') approved++;
          else if (s.indexOf('reject') >= 0) rejected++;
          else other++;
        });
        console.log('  A: pending_supervisor=' + pendingSpv + ', pending_superintendent=' + pendingSpt + 
                    ', approved/completed=' + approved + ', rejected=' + rejected + ', other=' + other);
      } else {
        console.log('  A: kolom status tidak ditemukan');
      }
    } else {
      console.log('  A: belum ada WO');
    }
  } catch (e) {
    console.log('  A: ERROR - ' + e.message);
  }
  
  console.log('');
  
  // Test 4: Production URL hardcoded in HTML?
  console.log('  Q: Production URL info (manual check di HTML files)');
  try {
    var url = ScriptApp.getService().getUrl();
    console.log('  A: Current deployment URL: ' + url);
    console.log('     ↑ URL ini yang harusnya hardcoded di Main/WorkOrder/Reports/Approval.html');
  } catch (e) {
    console.log('  A: ERROR getting URL - ' + e.message);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function _trySection(label, fn) {
  console.log('  ▸ ' + label);
  try {
    fn();
  } catch (e) {
    console.log('    ❌ ERROR: ' + e.message);
  }
  console.log('');
}

function _padRight(str, len) {
  str = String(str);
  while (str.length < len) str += ' ';
  return str.substring(0, len);
}

function _padLeft(str, len) {
  str = String(str);
  while (str.length < len) str = ' ' + str;
  return str.substring(0, len);
}