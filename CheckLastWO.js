/**
 * ============================================================================
 * CheckLastWO.gs - Verifikasi WO Terakhir + Team Distribution
 * ============================================================================
 * 
 * Run: checkLastWO()
 * 
 * Read-only. Tampilkan WO terakhir + semua team member-nya.
 * ============================================================================
 */

function checkLastWO() {
  console.log('');
  console.log('━━━ CHECK LAST WO + TEAM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var woSheet = ss.getSheetByName('WorkOrders');
    var teamSheet = ss.getSheetByName('WorkOrderTeam');
    
    // ─── Get last WO ───────────────────────────────────────────────────────
    var lastRow = woSheet.getLastRow();
    if (lastRow < 2) {
      console.log('❌ Belum ada WO di sheet');
      return;
    }
    
    var woHeaders = woSheet.getRange(1, 1, 1, woSheet.getLastColumn()).getValues()[0];
    var woData = woSheet.getRange(lastRow, 1, 1, woSheet.getLastColumn()).getValues()[0];
    
    // Build WO object
    var lastWo = {};
    for (var i = 0; i < woHeaders.length; i++) {
      lastWo[woHeaders[i]] = woData[i];
    }
    
    console.log('📋 LAST WORK ORDER:');
    console.log('  ID:             ' + lastWo.id);
    console.log('  WO Number:      ' + lastWo.wo_number);
    console.log('  Component:      ' + lastWo.component_id);
    console.log('  Unit:           ' + lastWo.unit_id);
    console.log('  Status:         ' + lastWo.status);
    console.log('  Work Condition: ' + lastWo.work_condition);
    console.log('  Created by:     ' + lastWo.created_by);
    console.log('  Created at:     ' + lastWo.created_at);
    console.log('');
    
    // ─── Get team members for this WO ──────────────────────────────────────
    var teamLastRow = teamSheet.getLastRow();
    
    if (teamLastRow < 2) {
      console.log('⚠️  Sheet WorkOrderTeam kosong');
      return;
    }
    
    var teamHeaders = teamSheet.getRange(1, 1, 1, teamSheet.getLastColumn()).getValues()[0];
    var teamData = teamSheet.getRange(2, 1, teamLastRow - 1, teamSheet.getLastColumn()).getValues();
    
    var wo_idIdx = teamHeaders.indexOf('wo_id');
    
    // Filter team yang punya wo_id sama dengan WO terakhir
    var thisWoTeam = [];
    for (var j = 0; j < teamData.length; j++) {
      if (teamData[j][wo_idIdx] === lastWo.id) {
        var row = {};
        for (var k = 0; k < teamHeaders.length; k++) {
          row[teamHeaders[k]] = teamData[j][k];
        }
        thisWoTeam.push(row);
      }
    }
    
    console.log('👥 TEAM MEMBERS untuk WO ini (' + thisWoTeam.length + ' orang):');
    console.log('');
    
    if (thisWoTeam.length === 0) {
      console.log('  ⚠️  Tidak ada team member ditemukan');
      console.log('  Mungkin team save gagal saat create WO');
    } else {
      var totalPercent = 0;
      for (var m = 0; m < thisWoTeam.length; m++) {
        var member = thisWoTeam[m];
        console.log('  [' + (m + 1) + '] ID: ' + member.id);
        console.log('      Mechanic: ' + member.mechanic_id);
        console.log('      Percentage: ' + member.percentage + '%');
        console.log('      Is Lead: ' + member.is_lead);
        console.log('');
        totalPercent += parseFloat(member.percentage) || 0;
      }
      
      console.log('  ─────────────────────────────────────');
      console.log('  TOTAL: ' + totalPercent + '%');
      
      if (Math.abs(totalPercent - 100) < 0.1) {
        console.log('  ✅ Distribution = 100% (BENAR)');
      } else {
        console.log('  ⚠️  Distribution ≠ 100% (ada yang salah?)');
      }
    }
    
    console.log('');
    console.log('━━━ DONE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (e) {
    console.log('❌ ERROR: ' + e.message);
    console.log('Stack: ' + e.stack);
  }
}