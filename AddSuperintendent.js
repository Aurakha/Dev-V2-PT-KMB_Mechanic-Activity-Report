/**
 * ============================================================================
 * AddSuperintendent.gs - One-time setup
 * ============================================================================
 * 
 * Tambahkan hrdptmulia@gmail.com sebagai superintendent ke Config_Mechanics.
 * Run sekali, lalu file ini bisa dihapus (atau dibiarkan).
 * 
 * Function bersifat IDEMPOTENT: bisa di-run berkali-kali tanpa duplikat.
 * ============================================================================
 */

function addCurrentUserAsSuperintendent() {
  console.log('');
  console.log('━━━ ADD SUPERINTENDENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    var email = 'hrdptmulia@gmail.com';
    var name = 'Gabriel (Super Admin)';
    var role = 'superintendent';
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config_Mechanics');
    if (!sheet) {
      console.log('❌ Sheet Config_Mechanics tidak ditemukan');
      return;
    }
    
    // Baca data existing
    var lastRow = sheet.getLastRow();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    console.log('Headers: ' + headers.join(', '));
    console.log('');
    
    var emailIdx = headers.indexOf('email');
    var idIdx = headers.indexOf('mechanic_id');
    var nameIdx = headers.indexOf('mechanic_name');
    var roleIdx = headers.indexOf('role');
    var activeIdx = headers.indexOf('is_active');
    
    if (emailIdx < 0) {
      console.log('❌ Kolom "email" tidak ditemukan');
      return;
    }
    
    // CHECK IDEMPOTENT: apakah user sudah ada?
    if (lastRow > 1) {
      var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
      
      for (var i = 0; i < data.length; i++) {
        var rowEmail = String(data[i][emailIdx]).toLowerCase().trim();
        if (rowEmail === email.toLowerCase()) {
          console.log('ℹ️  User sudah ada di baris ' + (i + 2) + ':');
          console.log('   ID:    ' + data[i][idIdx]);
          console.log('   Name:  ' + data[i][nameIdx]);
          console.log('   Role:  ' + data[i][roleIdx]);
          
          // Update role kalau bukan superintendent
          if (String(data[i][roleIdx]).toLowerCase() !== 'superintendent') {
            sheet.getRange(i + 2, roleIdx + 1).setValue('superintendent');
            console.log('');
            console.log('✅ Role di-update menjadi: superintendent');
          } else {
            console.log('');
            console.log('✅ Sudah superintendent, tidak ada perubahan');
          }
          
          _verifyAfterAdd(email);
          return;
        }
      }
    }
    
    // USER BELUM ADA: tambahkan
    // Generate ID berikutnya (cari yang SUPT-xxx tertinggi)
    var nextSuptNum = 1;
    if (lastRow > 1) {
      var allIds = sheet.getRange(2, idIdx + 1, lastRow - 1, 1).getValues();
      allIds.forEach(function(r) {
        var id = String(r[0]);
        var match = id.match(/^SUPT-(\d+)$/);
        if (match) {
          var num = parseInt(match[1], 10);
          if (num >= nextSuptNum) nextSuptNum = num + 1;
        }
      });
    }
    
    var newId = 'SUPT-' + ('00' + nextSuptNum).slice(-3);
    
    // Build row sesuai urutan header
    var newRow = [];
    for (var c = 0; c < headers.length; c++) {
      if (c === idIdx) newRow.push(newId);
      else if (c === nameIdx) newRow.push(name);
      else if (c === emailIdx) newRow.push(email);
      else if (c === roleIdx) newRow.push(role);
      else if (c === activeIdx) newRow.push(true);
      else newRow.push('');
    }
    
    sheet.appendRow(newRow);
    
    console.log('✅ User ditambahkan ke Config_Mechanics:');
    console.log('   ID:    ' + newId);
    console.log('   Name:  ' + name);
    console.log('   Email: ' + email);
    console.log('   Role:  ' + role);
    console.log('');
    
    _verifyAfterAdd(email);
    
  } catch (e) {
    console.log('❌ ERROR: ' + e.message);
    console.log('Stack: ' + e.stack);
  }
}

/**
 * Verify dengan memanggil getCurrentUserWithRole()
 */
function _verifyAfterAdd(email) {
  console.log('━━━ VERIFICATION ━━━');
  console.log('');
  
  try {
    if (typeof getCurrentUserWithRole !== 'function') {
      console.log('⚠️  getCurrentUserWithRole tidak tersedia, skip verification');
      return;
    }
    
    var user = getCurrentUserWithRole();
    console.log('getCurrentUserWithRole() returns:');
    console.log('  email: ' + user.email);
    console.log('  role:  ' + user.role);
    console.log('  id:    ' + user.id);
    console.log('  name:  ' + (user.name || '(none)'));
    
    if (String(user.role).toLowerCase() === 'superintendent') {
      console.log('');
      console.log('🎉 SUCCESS! Anda sekarang superintendent.');
    } else {
      console.log('');
      console.log('⚠️  Role belum terdeteksi sebagai superintendent.');
      console.log('   Cek apakah getCurrentUserWithRole() baca dari sheet yang benar.');
    }
    
  } catch (e) {
    console.log('⚠️  Verification error: ' + e.message);
  }
}