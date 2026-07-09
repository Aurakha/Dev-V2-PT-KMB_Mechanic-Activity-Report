/**
 * ============================================================================
 * Migration_CleanupForProduction.gs
 * ============================================================================
 * 
 * JALANKAN SEKALI SAJA — membersihkan semua data test dan isi data production:
 * 
 * 1. Config_Units → ganti dengan 45 unit aktual (SUM xxx)
 * 2. Config_Mechanics → sisakan 3 akun saja
 * 3. Transaction sheets → bersihkan semua (header tetap)
 * 
 * AMAN: idempotent, bisa dijalankan berulang.
 * BACKUP sudah otomatis jalan 2x/hari, jadi data test masih tersimpan di backup.
 * ============================================================================
 */

function migrationCleanupForProduction() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  Logger.log('═══════════════════════════════════════════════════');
  Logger.log('  MIGRATION: Cleanup for Production');
  Logger.log('═══════════════════════════════════════════════════');
  
  // ════════════════════════════════════════════════════════════
  // STEP 1: REPLACE Config_Units with real data
  // ════════════════════════════════════════════════════════════
  Logger.log('');
  Logger.log('─── STEP 1: Config_Units ───');
  
  var unitSheet = ss.getSheetByName('Config_Units');
  if (!unitSheet) { Logger.log('❌ Config_Units not found!'); return; }
  
  // Clear all data except header
  var unitLastRow = unitSheet.getLastRow();
  if (unitLastRow > 1) {
    unitSheet.getRange(2, 1, unitLastRow - 1, unitSheet.getLastColumn()).clearContent();
  }
  
  var units = [
    // AXOR4843 (13 units)
    ['UNIT-001', 'SUM 011', 'AXOR4843', 1.0, true, new Date()],
    ['UNIT-002', 'SUM 025', 'AXOR4843', 1.0, true, new Date()],
    ['UNIT-003', 'SUM 027', 'AXOR4843', 1.0, true, new Date()],
    ['UNIT-004', 'SUM 029', 'AXOR4843', 1.0, true, new Date()],
    ['UNIT-005', 'SUM 034', 'AXOR4843', 1.0, true, new Date()],
    ['UNIT-006', 'SUM 037', 'AXOR4843', 1.0, true, new Date()],
    ['UNIT-007', 'SUM 042', 'AXOR4843', 1.0, true, new Date()],
    ['UNIT-008', 'SUM 350', 'AXOR4843', 1.0, true, new Date()],
    ['UNIT-009', 'SUM 351', 'AXOR4843', 1.0, true, new Date()],
    ['UNIT-010', 'SUM 328', 'AXOR4843', 1.0, true, new Date()],
    ['UNIT-011', 'SUM 367', 'AXOR4843', 1.0, true, new Date()],
    ['UNIT-012', 'SUM 368', 'AXOR4843', 1.0, true, new Date()],
    ['UNIT-013', 'SUM 370', 'AXOR4843', 1.0, true, new Date()],
    // VOLVOFMX440 (7 units)
    ['UNIT-014', 'SUM 372', 'VOLVOFMX440', 1.0, true, new Date()],
    ['UNIT-015', 'SUM 374', 'VOLVOFMX440', 1.0, true, new Date()],
    ['UNIT-016', 'SUM 375', 'VOLVOFMX440', 1.0, true, new Date()],
    ['UNIT-017', 'SUM 376', 'VOLVOFMX440', 1.0, true, new Date()],
    ['UNIT-018', 'SUM 378', 'VOLVOFMX440', 1.0, true, new Date()],
    ['UNIT-019', 'SUM 379', 'VOLVOFMX440', 1.0, true, new Date()],
    ['UNIT-020', 'SUM 380', 'VOLVOFMX440', 1.0, true, new Date()],
    // VOLVOFMX460 (18 units)
    ['UNIT-021', 'SUM 377', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-022', 'SUM 381', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-023', 'SUM 382', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-024', 'SUM 383', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-025', 'SUM 384', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-026', 'SUM 385', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-027', 'SUM 386', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-028', 'SUM 387', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-029', 'SUM 388', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-030', 'SUM 389', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-031', 'SUM 390', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-032', 'SUM 391', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-033', 'SUM 392', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-034', 'SUM 393', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-035', 'SUM 394', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-036', 'SUM 395', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-037', 'SUM 396', 'VOLVOFMX460', 1.0, true, new Date()],
    ['UNIT-038', 'SUM 397', 'VOLVOFMX460', 1.0, true, new Date()],
    // BEIBEN3150 (7 units)
    ['UNIT-039', 'SUM 398', 'BEIBEN3150', 1.0, true, new Date()],
    ['UNIT-040', 'SUM 399', 'BEIBEN3150', 1.0, true, new Date()],
    ['UNIT-041', 'SUM 400', 'BEIBEN3150', 1.0, true, new Date()],
    ['UNIT-042', 'SUM 401', 'BEIBEN3150', 1.0, true, new Date()],
    ['UNIT-043', 'SUM 402', 'BEIBEN3150', 1.0, true, new Date()],
    ['UNIT-044', 'SUM 403', 'BEIBEN3150', 1.0, true, new Date()],
    ['UNIT-045', 'SUM 404', 'BEIBEN3150', 1.0, true, new Date()]
  ];
  
  // Check header structure
  var unitHeaders = unitSheet.getRange(1, 1, 1, unitSheet.getLastColumn()).getValues()[0];
  Logger.log('Config_Units headers: ' + unitHeaders.join(', '));
  
  // Write data — map to header order
  for (var u = 0; u < units.length; u++) {
    var row = [];
    for (var h = 0; h < unitHeaders.length; h++) {
      var header = String(unitHeaders[h]).trim().toLowerCase();
      if (header === 'unit_id')     row.push(units[u][0]);
      else if (header === 'unit_name')   row.push(units[u][1]);
      else if (header === 'unit_type')   row.push(units[u][2]);
      else if (header === 'unit_factor') row.push(units[u][3]);
      else if (header === 'is_active')   row.push(units[u][4]);
      else if (header === 'created_at' || header === 'updated_at') row.push(units[u][5]);
      else row.push('');
    }
    unitSheet.getRange(2 + u, 1, 1, row.length).setValues([row]);
  }
  
  Logger.log('✅ Config_Units: ' + units.length + ' unit ditambahkan');
  Logger.log('   AXOR4843: 13 | VOLVOFMX440: 7 | VOLVOFMX460: 18 | BEIBEN3150: 7');
  
  // ════════════════════════════════════════════════════════════
  // STEP 2: CLEAN Config_Mechanics (keep 3 accounts only)
  // ════════════════════════════════════════════════════════════
  Logger.log('');
  Logger.log('─── STEP 2: Config_Mechanics ───');
  
  var mechSheet = ss.getSheetByName('Config_Mechanics');
  if (!mechSheet) { Logger.log('❌ Config_Mechanics not found!'); return; }
  
  var mechData = mechSheet.getDataRange().getValues();
  var mechHeaders = mechData[0];
  var emailIdx = -1;
  for (var mi = 0; mi < mechHeaders.length; mi++) {
    if (String(mechHeaders[mi]).trim().toLowerCase() === 'email') { emailIdx = mi; break; }
  }
  
  if (emailIdx === -1) { Logger.log('❌ email column not found in Config_Mechanics!'); return; }
  
  // Emails to KEEP
  var keepEmails = [
    'gabrielrudra6@gmail.com',   // Gabriel Mechanic
    'gabrielrudra9@gmail.com',   // Supervisor test
    'hrdptmulia@gmail.com'       // Gabriel Super Admin (superintendent)
  ];
  
  var rowsToDelete = [];
  for (var r = mechData.length - 1; r >= 1; r--) { // reverse to avoid index shift
    var email = String(mechData[r][emailIdx]).trim().toLowerCase();
    var keep = false;
    for (var ke = 0; ke < keepEmails.length; ke++) {
      if (email === keepEmails[ke].toLowerCase()) { keep = true; break; }
    }
    if (!keep) rowsToDelete.push(r + 1); // sheet rows are 1-indexed
  }
  
  // Delete from bottom up
  for (var d = 0; d < rowsToDelete.length; d++) {
    mechSheet.deleteRow(rowsToDelete[d]);
  }
  
  Logger.log('✅ Config_Mechanics: ' + rowsToDelete.length + ' akun test dihapus, ' + keepEmails.length + ' akun dipertahankan');
  Logger.log('   Kept: ' + keepEmails.join(', '));
  
  // ════════════════════════════════════════════════════════════
  // STEP 3: CLEAR all transaction sheets (keep headers)
  // ════════════════════════════════════════════════════════════
  Logger.log('');
  Logger.log('─── STEP 3: Clear Transaction Sheets ───');
  
  var transactionSheets = [
    'WorkOrders',
    'WorkOrderTeam',
    'Approvals',
    'MechanicPoints',
    'AuditLogs',
    'ScoringSnapshots',
    'OthersJobRequests',
    'MtbfTracking'
  ];
  
  for (var ts = 0; ts < transactionSheets.length; ts++) {
    var sheetName = transactionSheets[ts];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log('⏭️  ' + sheetName + ' — tidak ditemukan, skip');
      continue;
    }
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContent();
      Logger.log('✅ ' + sheetName + ' — ' + (lastRow - 1) + ' baris data dihapus (header tetap)');
    } else {
      Logger.log('⏭️  ' + sheetName + ' — sudah kosong');
    }
  }
  
  // ════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════
  SpreadsheetApp.flush();
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════════════════');
  Logger.log('  ✅ MIGRATION COMPLETE — PRODUCTION READY');
  Logger.log('═══════════════════════════════════════════════════');
  Logger.log('  Config_Units:     45 unit aktual');
  Logger.log('  Config_Mechanics: 3 akun (Gabriel, SPV, SUPT)');
  Logger.log('  Transaksi:        Semua bersih (0 WO)');
  Logger.log('  Config_Components: Tidak diubah (95 komponen)');
  Logger.log('  Config_Factors:    Tidak diubah');
  Logger.log('  Config_BaseSettings: Tidak diubah (IDR rate tetap)');
  Logger.log('═══════════════════════════════════════════════════');
  Logger.log('');
  Logger.log('⚠️  NEXT: Tambahkan mechanic baru di Config_Mechanics');
  Logger.log('    sesuai data karyawan PT KMB yang sebenarnya.');
}


/**
 * RESET TRANSAKSI SAJA — tidak mengubah Config apapun.
 * Aman dijalankan kapanpun tanpa kehilangan data mechanic/unit/component.
 */
function resetTransaksiSaja() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ['WorkOrders','WorkOrderTeam','Approvals','MechanicPoints',
                'AuditLogs','ScoringSnapshots','OthersJobRequests','MtbfTracking'];
  
  Logger.log('=== RESET TRANSAKSI ===');
  for (var i = 0; i < sheets.length; i++) {
    var sheet = ss.getSheetByName(sheets[i]);
    if (!sheet) continue;
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContent();
      Logger.log('✅ ' + sheets[i] + ' — ' + (lastRow - 1) + ' baris dihapus');
    }
  }
  Logger.log('=== SELESAI — Transaksi bersih, Config tidak diubah ===');
}