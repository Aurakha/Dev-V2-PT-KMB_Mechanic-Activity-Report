/**
 * ============================================================================
 * QuickFix.gs - Verify Auth + Fix Bug Inventory
 * ============================================================================
 * 
 * Tujuan:
 * 1. Verify getCurrentUserWithRole() — apakah mechanic_id & mechanic_name 
 *    sebenarnya return value benar (sebelumnya audit saya pakai property
 *    name yang salah: user.id padahal harusnya user.mechanic_id)
 * 
 * 2. Verify bug "Rp Rp 172.800" di formatCalculationBreakdown
 *    — bukan fix, hanya inspect biar tahu lokasi exact
 * 
 * Run: quickFixVerify()
 * 
 * SAFE: Read-only, tidak ubah data.
 * ============================================================================
 */

function quickFixVerify() {
  console.log('');
  console.log('━━━ AUTH RETURN VALUE CHECK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    var user = getCurrentUserWithRole();
    
    // Inspect SEMUA properties yang ada
    console.log('Full user object:');
    console.log(JSON.stringify(user, null, 2));
    console.log('');
    
    console.log('Property access test:');
    console.log('  user.email         = ' + user.email);
    console.log('  user.role          = ' + user.role);
    console.log('  user.mechanic_id   = ' + user.mechanic_id + '  ← INI yang benar');
    console.log('  user.mechanic_name = ' + user.mechanic_name + '  ← INI yang benar');
    console.log('  user.id            = ' + user.id + '  ← (kalau undefined, berarti memang tidak ada)');
    console.log('  user.name          = ' + user.name + '  ← (kalau undefined, berarti memang tidak ada)');
    console.log('  user.is_active     = ' + user.is_active);
    console.log('');
    
    if (user.mechanic_id && user.mechanic_name) {
      console.log('✅ Auth function bekerja BENAR.');
      console.log('   Audit saya sebelumnya pakai property name SALAH (user.id, user.name).');
      console.log('   Property yang benar: user.mechanic_id, user.mechanic_name');
      console.log('   → BUKAN bug, hanya kesalahan audit script saya. Sorry!');
    } else if (!user.mechanic_id) {
      console.log('⚠️  user.mechanic_id memang undefined/null.');
      console.log('   Cek getMechanicByEmail() — apakah baca kolom mechanic_id dengan benar.');
    }
    
  } catch (e) {
    console.log('❌ ERROR: ' + e.message);
    console.log('Stack: ' + e.stack);
  }
  
  console.log('');
  console.log('━━━ CHECK formatIdr FUNCTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    if (typeof formatIdr !== 'function') {
      console.log('❌ Function formatIdr tidak ditemukan');
      return;
    }
    
    var result = formatIdr(172800);
    console.log('formatIdr(172800) = "' + result + '"');
    console.log('');
    
    var hasRp = String(result).indexOf('Rp') >= 0;
    if (hasRp) {
      console.log('⚠️  formatIdr() ALREADY prepends "Rp" to result');
      console.log('   Sehingga di formatCalculationBreakdown(), line:');
      console.log('     lines.push(\'  IDR:    Rp \' + formatIdr(breakdown.final_idr));');
      console.log('   Menjadi "Rp Rp 172.800" (double).');
      console.log('');
      console.log('   FIX: Hapus "Rp " di formatCalculationBreakdown(),');
      console.log('        atau hapus prepend "Rp" di formatIdr().');
    } else {
      console.log('✅ formatIdr() return tanpa "Rp" prefix.');
      console.log('   Output normal: "' + result + '"');
    }
    
  } catch (e) {
    console.log('❌ ERROR checking formatIdr: ' + e.message);
  }
  
  console.log('');
  console.log('━━━ DONE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}