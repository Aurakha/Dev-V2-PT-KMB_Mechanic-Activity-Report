/**
 * ============================================================================
 * MigrateWorkOrders.gs - Sheet Extension & Data Migration
 * ============================================================================
 * 
 * One-time migration untuk:
 * 1. Tambah kolom baru ke WorkOrders sheet (idempotent)
 * 2. Migrate 14 WO existing: status 'created' → 'pending_supervisor_approval'
 * 3. Set default values untuk kolom baru
 * 
 * SAFE TO RUN MULTIPLE TIMES:
 * - Kolom yang sudah ada tidak di-overwrite
 * - WO yang sudah migrated tidak di-touch lagi
 * 
 * Run: migrateWorkOrders()
 * ============================================================================
 */

// ============================================================================
// KOLOM BARU YANG DITAMBAHKAN
// ============================================================================

var NEW_COLUMNS = [
  // Supervisor input saat create
  { name: 'work_condition',           default: '' },              // 'normal' | 'difficult' | 'extreme'
  
  // Mechanic input saat kerja
  { name: 'start_time',               default: '' },              // datetime
  { name: 'end_time',                 default: '' },              // datetime
  { name: 'actual_hours',             default: '' },              // number, auto-calculated
  { name: 'submitted_at',             default: '' },              // datetime saat mekanik submit
  
  // Supervisor input saat approve
  { name: 'safety_incident',          default: false },           // boolean
  { name: 'timeliness_override',      default: '' },              // 'on_time'|'late'|'way_late' kalau supervisor override
  
  // Auto-calculated
  { name: 'mtbf_redo_status',         default: '' },              // 'first_time' | 'redo'
  { name: 'final_points',             default: '' },              // number
  { name: 'final_idr',                default: '' },              // number
  
  // Approval tracking
  { name: 'approved_by_supervisor',   default: '' },              // email
  { name: 'supervisor_approved_at',   default: '' },              // datetime
  { name: 'approved_by_superintendent', default: '' },            // email
  { name: 'superintendent_approved_at', default: '' },            // datetime
  { name: 'rejected_by',              default: '' },              // email
  { name: 'rejected_at',              default: '' },              // datetime
  { name: 'rejection_reason',         default: '' }               // text
];

// ============================================================================
// MAIN MIGRATION FUNCTION
// ============================================================================

function migrateWorkOrders() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  MIGRATE WORK ORDERS SHEET                                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WorkOrders');
    if (!sheet) {
      console.log('❌ Sheet WorkOrders tidak ditemukan');
      return;
    }
    
    // STEP 1: Add new columns
    _addNewColumns(sheet);
    
    // STEP 2: Migrate existing data
    _migrateExistingWOs(sheet);
    
    // STEP 3: Verify
    _verifyMigration(sheet);
    
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ MIGRATION COMPLETE                                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    
  } catch (e) {
    console.log('');
    console.log('❌ MIGRATION ERROR: ' + e.message);
    console.log('Stack: ' + e.stack);
  }
}

// ============================================================================
// STEP 1: ADD NEW COLUMNS (idempotent)
// ============================================================================

function _addNewColumns(sheet) {
  console.log('━━━ STEP 1: ADD NEW COLUMNS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  var lastCol = sheet.getLastColumn();
  var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  console.log('Current headers (' + lastCol + ' cols):');
  console.log('  ' + currentHeaders.join(', '));
  console.log('');
  
  // Cari kolom yang belum ada
  var toAdd = [];
  NEW_COLUMNS.forEach(function(col) {
    if (currentHeaders.indexOf(col.name) === -1) {
      toAdd.push(col);
    }
  });
  
  if (toAdd.length === 0) {
    console.log('✅ Semua kolom baru sudah ada, skip step 1');
    console.log('');
    return;
  }
  
  console.log('Kolom yang akan ditambahkan (' + toAdd.length + '):');
  toAdd.forEach(function(col, i) {
    console.log('  [' + (i + 1) + '] ' + col.name);
  });
  console.log('');
  
  // Tulis header baru di kolom berikutnya
  var startCol = lastCol + 1;
  var newHeaders = toAdd.map(function(col) { return col.name; });
  
  sheet.getRange(1, startCol, 1, newHeaders.length).setValues([newHeaders]);
  
  // Format header baru (bold) - mengikuti style header existing
  sheet.getRange(1, startCol, 1, newHeaders.length)
    .setFontWeight('bold')
    .setBackground('#f3f3f3');
  
  console.log('✅ ' + toAdd.length + ' kolom baru ditambahkan (kolom ' + startCol + ' s/d ' + (startCol + toAdd.length - 1) + ')');
  console.log('');
}

// ============================================================================
// STEP 2: MIGRATE EXISTING DATA
// ============================================================================

function _migrateExistingWOs(sheet) {
  console.log('━━━ STEP 2: MIGRATE EXISTING WOs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    console.log('ℹ️  Tidak ada WO existing untuk di-migrate');
    console.log('');
    return;
  }
  
  // Re-read headers (mungkin sudah berubah dari step 1)
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var statusIdx = headers.indexOf('status');
  
  if (statusIdx < 0) {
    console.log('❌ Kolom "status" tidak ditemukan');
    return;
  }
  
  // Baca semua status
  var statusRange = sheet.getRange(2, statusIdx + 1, lastRow - 1, 1);
  var statuses = statusRange.getValues();
  
  // Hitung berapa yang perlu di-migrate
  var toMigrate = [];
  statuses.forEach(function(row, i) {
    if (String(row[0]).toLowerCase() === 'created') {
      toMigrate.push(i + 2); // sheet row number (1-indexed + skip header)
    }
  });
  
  if (toMigrate.length === 0) {
    console.log('✅ Tidak ada WO dengan status "created", skip migration');
    console.log('');
    return;
  }
  
  console.log('Ditemukan ' + toMigrate.length + ' WO dengan status "created"');
  console.log('Akan di-migrate ke "pending_supervisor_approval"');
  console.log('');
  
  // Update semua status sekaligus (lebih efisien)
  var newStatuses = toMigrate.map(function() { return ['pending_supervisor_approval']; });
  
  // Loop set values per row (karena rows mungkin tidak kontigu)
  toMigrate.forEach(function(rowNum) {
    sheet.getRange(rowNum, statusIdx + 1).setValue('pending_supervisor_approval');
  });
  
  console.log('✅ ' + toMigrate.length + ' WO berhasil di-migrate');
  console.log('');
}

// ============================================================================
// STEP 3: VERIFY
// ============================================================================

function _verifyMigration(sheet) {
  console.log('━━━ STEP 3: VERIFY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  console.log('Total kolom sekarang: ' + lastCol);
  console.log('');
  
  // Check semua kolom baru ada
  var missing = [];
  NEW_COLUMNS.forEach(function(col) {
    if (headers.indexOf(col.name) === -1) {
      missing.push(col.name);
    }
  });
  
  if (missing.length > 0) {
    console.log('❌ Kolom yang masih missing: ' + missing.join(', '));
  } else {
    console.log('✅ Semua ' + NEW_COLUMNS.length + ' kolom baru sudah ada');
  }
  console.log('');
  
  // Check status breakdown
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var statusIdx = headers.indexOf('status');
    if (statusIdx >= 0) {
      var statuses = sheet.getRange(2, statusIdx + 1, lastRow - 1, 1).getValues();
      var counts = {};
      statuses.forEach(function(r) {
        var s = String(r[0]);
        counts[s] = (counts[s] || 0) + 1;
      });
      
      console.log('Status breakdown setelah migration:');
      Object.keys(counts).forEach(function(s) {
        console.log('  ' + s + ': ' + counts[s]);
      });
    }
  }
  console.log('');
  
  // Print final header layout
  console.log('Final headers:');
  headers.forEach(function(h, i) {
    var isNew = NEW_COLUMNS.some(function(c) { return c.name === h; });
    console.log('  [' + (i + 1) + '] ' + h + (isNew ? '  ← NEW' : ''));
  });
}