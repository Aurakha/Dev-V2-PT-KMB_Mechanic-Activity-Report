/**
 * ============================================================================
 * PATCH FOR Constants.gs — FASE 3 PREPARATION
 * ============================================================================
 * 
 * Goal: Allow 1-step transition pending_mechanic_work → pending_supervisor
 *       (Mechanic submit langsung jadi pending_supervisor, skip in_progress)
 * 
 * Cara apply (MANUAL — patch kecil):
 * 
 * 1. Buka Constants.gs di Apps Script Editor
 * 2. Cari blok ini (sekitar line ~85):
 * 
 *      // ─── WORKFLOW B (active) ────────────────────────────────────────────────
 *      'pending_mechanic_work':    ['in_progress', 'rejected'],
 * 
 * 3. Ganti baris tersebut menjadi:
 * 
 *      // ─── WORKFLOW B (active) ────────────────────────────────────────────────
 *      'pending_mechanic_work':    ['in_progress', 'pending_supervisor', 'rejected'],
 * 
 * 4. Save (Ctrl+S)
 * 
 * ============================================================================
 * Yang berubah: TAMBAH 'pending_supervisor' ke array transitions.
 * Tidak menghapus 'in_progress' — kalau nanti pakai 2-step flow masih bisa.
 * ============================================================================
 */

// VERIFY function — run setelah patch untuk konfirmasi
function verifyMechanicWorkTransition() {
  console.log('');
  console.log('━━━ VERIFY pending_mechanic_work transitions ━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  var transitions = STATUS_TRANSITIONS['pending_mechanic_work'];
  console.log('  Allowed transitions FROM pending_mechanic_work:');
  console.log('  ' + JSON.stringify(transitions));
  console.log('');
  
  var pass = 0;
  var fail = 0;
  
  function check(label, condition) {
    if (condition) {
      console.log('  ✅ ' + label);
      pass++;
    } else {
      console.log('  ❌ ' + label);
      fail++;
    }
  }
  
  check('Allow → in_progress (legacy 2-step)', 
        isValidStatusTransition('pending_mechanic_work', 'in_progress'));
  
  check('Allow → pending_supervisor (Workflow B 1-step)', 
        isValidStatusTransition('pending_mechanic_work', 'pending_supervisor'));
  
  check('Allow → rejected', 
        isValidStatusTransition('pending_mechanic_work', 'rejected'));
  
  check('BLOCK → approved (must go through workflow)', 
        !isValidStatusTransition('pending_mechanic_work', 'approved'));
  
  console.log('');
  if (fail === 0) {
    console.log('  🎉 Patch berhasil! ' + pass + ' transitions OK');
  } else {
    console.log('  ⚠️  ' + fail + ' check gagal. Periksa Constants.gs lagi.');
  }
  console.log('');
}