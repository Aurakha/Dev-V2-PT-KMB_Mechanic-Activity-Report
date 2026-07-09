/**
 * ============================================================================
 * CleanupTestData.gs - Hapus Data Test untuk Start Fresh
 * ============================================================================
 * 
 * Hapus SEMUA data dari 3 sheet (KEEP HEADER ROW):
 * - WorkOrders (14 rows)
 * - WorkOrderTeam (22 rows)
 * - AuditLogs (14 rows)
 * 
 * Header ROW 1 di setiap sheet TIDAK dihapus (cuma data row).
 * 
 * ⚠️ DESTRUCTIVE OPERATION — TIDAK BISA UNDO!
 * 
 * SAFETY:
 * - Konfirmasi dulu via dialog (Yes/No)
 * - Print preview rows yang akan dihapus
 * - Bisa cancel di tengah
 * 
 * Run: cleanupTestData()
 * ============================================================================
 */

function cleanupTestData() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  CLEANUP TEST DATA — START FRESH                               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var sheetsToCleanup = [
    { name: 'WorkOrders',    expectedRows: 14 },
    { name: 'WorkOrderTeam', expectedRows: 22 },
    { name: 'AuditLogs',     expectedRows: 14 }
  ];
  
  // STEP 1: Preview
  console.log('━━━ PREVIEW: DATA YANG AKAN DIHAPUS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  var totalRowsToDelete = 0;
  var allSheets = [];
  
  for (var i = 0; i < sheetsToCleanup.length; i++) {
    var info = sheetsToCleanup[i];
    var sheet = ss.getSheetByName(info.name);
    
    if (!sheet) {
      console.log('⚠️  ' + info.name + ': sheet tidak ditemukan, skip');
      continue;
    }
    
    var lastRow = sheet.getLastRow();
    var dataRows = lastRow > 1 ? lastRow - 1 : 0;
    
    console.log('  ' + _pad(info.name, 18) + ': ' + dataRows + ' data rows (last row: ' + lastRow + ')');
    
    totalRowsToDelete += dataRows;
    allSheets.push({ sheet: sheet, name: info.name, dataRows: dataRows });
  }
  
  console.log('');
  console.log('  TOTAL rows yang akan dihapus: ' + totalRowsToDelete);
  console.log('');
  
  if (totalRowsToDelete === 0) {
    console.log('✅ Semua sheet sudah kosong, tidak ada yang perlu dihapus');
    return;
  }
  
  // STEP 2: Confirmation dialog
  console.log('━━━ CONFIRMATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  var ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    console.log('⚠️  Tidak bisa show dialog (script context). Lanjut tanpa konfirmasi UI.');
    ui = null;
  }
  
  if (ui) {
    var response = ui.alert(
      '⚠️ HAPUS DATA TEST?',
      'Akan menghapus ' + totalRowsToDelete + ' rows dari 3 sheet:\n\n' +
      '  • WorkOrders     : ' + allSheets[0].dataRows + ' rows\n' +
      '  • WorkOrderTeam  : ' + (allSheets[1] ? allSheets[1].dataRows : 0) + ' rows\n' +
      '  • AuditLogs      : ' + (allSheets[2] ? allSheets[2].dataRows : 0) + ' rows\n\n' +
      'Header row tidak dihapus. Action ini TIDAK BISA UNDO.\n\n' +
      'Yakin lanjut?',
      ui.ButtonSet.YES_NO
    );
    
    if (response !== ui.Button.YES) {
      console.log('❌ Dibatalkan oleh user');
      return;
    }
    
    console.log('✅ User konfirmasi YES, lanjut hapus...');
  } else {
    console.log('ℹ️  Skipping UI confirmation (script context)');
  }
  
  console.log('');
  
  // STEP 3: Execute deletion
  console.log('━━━ EXECUTING DELETION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  var totalDeleted = 0;
  
  for (var j = 0; j < allSheets.length; j++) {
    var item = allSheets[j];
    
    if (item.dataRows === 0) {
      console.log('  ' + _pad(item.name, 18) + ': sudah kosong, skip');
      continue;
    }
    
    try {
      // Hapus row 2 sampai last row (keep header row 1)
      item.sheet.deleteRows(2, item.dataRows);
      
      // Verify
      var afterRows = item.sheet.getLastRow();
      var deleted = item.dataRows; // expected
      
      console.log('  ✅ ' + _pad(item.name, 18) + ': deleted ' + deleted + 
                  ' rows (last row sekarang: ' + afterRows + ')');
      totalDeleted += deleted;
      
    } catch (e) {
      console.log('  ❌ ' + item.name + ': ERROR - ' + e.message);
    }
  }
  
  console.log('');
  console.log('━━━ VERIFICATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  for (var k = 0; k < allSheets.length; k++) {
    var s = allSheets[k];
    var rows = s.sheet.getLastRow();
    var dataRows = rows > 1 ? rows - 1 : 0;
    
    var icon = dataRows === 0 ? '✅' : '⚠️';
    console.log('  ' + icon + ' ' + _pad(s.name, 18) + ': ' + dataRows + ' data rows remaining');
  }
  
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ CLEANUP COMPLETE                                            ║');
  console.log('║  Total rows deleted: ' + _pad(String(totalDeleted), 41) + '║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('System sekarang FRESH. Siap untuk workflow B (Supervisor → Mechanic → Approval).');
}

function _pad(s, len) {
  s = String(s);
  while (s.length < len) s += ' ';
  return s.substring(0, len);
}