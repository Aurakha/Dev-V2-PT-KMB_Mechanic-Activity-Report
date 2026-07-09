/**
 * SeedDummy3Cluster (hapus).gs — data dummy 3 cluster. HAPUS SEBELUM GO-LIVE.
 * 
 * runSeedDummy3Cluster() : buat mekanik dummy field/WS + 10 WO dummy
 *   - tyreman : 3 WO (2 fresh, 1 sudah submit waktu)
 *   - field   : 4 WO (2 fresh, 2 submit; salah satunya TIM 2 orang → uji full-point)
 *   - workshop: 3 WO (2 fresh, 1 submit)
 *   Semua wo_number berprefix WO-DUMMY- agar mudah dikenali & dihapus.
 * 
 * runWipeDummyData() : hapus SEMUA jejak dummy (WO aktif+arsip, team, points,
 *   snapshots, approvals, mekanik MECH-D*). AuditLogs dibiarkan (jejak historis).
 */

var DUMMY_MECHS = [
  {mechanic_id: 'MECH-D01', mechanic_name: 'Dummy Field Satu',    email: 'dummy.field1@test.local',    role: 'mechanic', position: 'tyreman',        section: 'field'},
  {mechanic_id: 'MECH-D02', mechanic_name: 'Dummy Field Senior',  email: 'dummy.field2@test.local',    role: 'mechanic', position: 'tyreman_senior', section: 'field'},
  {mechanic_id: 'MECH-D03', mechanic_name: 'Dummy Workshop Satu', email: 'dummy.ws1@test.local',       role: 'mechanic', position: 'tyreman',        section: 'workshop'}
];

function runSeedDummy3Cluster() {
  var report = [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── prasyarat ──
  if (!ss.getSheetByName('Config_Jobs_Field') || !ss.getSheetByName('Config_Jobs_Workshop')) {
    Logger.log('❌ ABORT: jalankan runSplitJobsPrep dulu (Config_Jobs_Field/Workshop belum ada).');
    return 'ABORT: split belum jalan';
  }

  // ── mekanik dummy (idempotent) ──
  for (var d = 0; d < DUMMY_MECHS.length; d++) {
    var dm = DUMMY_MECHS[d];
    if (!getMechanicById(dm.mechanic_id)) {
      appendRow(SHEETS.CONFIG_MECHANICS, {
        mechanic_id: dm.mechanic_id, mechanic_name: dm.mechanic_name, email: dm.email,
        role: dm.role, is_active: true, position: dm.position, section: dm.section
      });
      report.push('➕ mekanik ' + dm.mechanic_id + ' (' + dm.section + ')');
    } else {
      report.push('✓ mekanik ' + dm.mechanic_id + ' sudah ada');
    }
  }
  _invalidateSheetCache(SHEETS.CONFIG_MECHANICS);

  // ── ambil referensi nyata ──
  var comps = loadComponents().filter(function(c){ return c.component_no !== 'COM-OTHERS'; });
  var units = loadUnits();
  var unitByModel = {};
  for (var u = 0; u < units.length; u++) {
    var mdl = String(units[u].unit_model || '').toLowerCase().trim();
    if (mdl && !unitByModel[mdl]) unitByModel[mdl] = units[u];
  }
  var anyUnit = units.length ? units[units.length > 1 ? 1 : 0] : null; // hindari UNIT-000 PREPARATION bila ada

  function pickJobs(sheetName, n) {
    var all = readSheetAsObjects(sheetName);
    var out = [];
    for (var i = 0; i < all.length && out.length < n; i++) {
      var j = all[i];
      if (!j.job_id) continue;
      if (String(j.is_active).toLowerCase() === 'false') continue;
      if (sheetName === SHEETS.CONFIG_JOBS_FIELD) {
        var m = String(j.unit_model || '').toLowerCase().trim();
        if (!unitByModel[m]) continue; // job field wajib punya unit ber-model sama
        j._unit = unitByModel[m];
      }
      out.push(j);
    }
    return out;
  }
  var fieldJobs = pickJobs(SHEETS.CONFIG_JOBS_FIELD, 4);
  var wsJobs = pickJobs(SHEETS.CONFIG_JOBS_WORKSHOP, 3);
  if (fieldJobs.length < 4 || wsJobs.length < 3 || comps.length === 0 || !anyUnit) {
    Logger.log('❌ ABORT: referensi kurang (fieldJobs=' + fieldJobs.length + ', wsJobs=' + wsJobs.length +
               ', comps=' + comps.length + ', unit=' + (anyUnit ? 'ok' : 'nihil') + ')');
    return 'ABORT: referensi kurang';
  }

  var SEED_BY = 'seed.dummy@test.local';
  var made = [];

  function mkWO(label, componentId, unitId, team, sectionData) {
    try {
      var woNum = 'WO-DUMMY-' + label;
      var res = createWorkOrder(componentId, unitId, 'normal', team, SEED_BY, null, 'workshop', woNum, sectionData);
      var id = null;
      if (res && res.success && res.data) {
        id = res.data.id || res.data.wo_id || (res.data.wo && res.data.wo.id) || null;
      }
      if (id) { made.push({id: id, num: woNum}); report.push('➕ ' + woNum + ' (' + (sectionData ? sectionData.section : 'tyreman') + ') → ' + id); }
      else { report.push('❌ ' + woNum + ' gagal: ' + JSON.stringify(res && res.error ? res.error : res).slice(0, 140)); }
      return id;
    } catch (e) { report.push('❌ ' + label + ' exception: ' + e.message); return null; }
  }
  function team(ids) {
    var t = [];
    for (var i = 0; i < ids.length; i++) t.push({mechanic_id: ids[i], percentage: 100, is_lead: i === 0});
    return t;
  }
  function submitAs(woId, mechId, hoursAgoStart, durasiJam) {
    if (!woId) return;
    var mech = getMechanicById(mechId);
    if (!mech || !mech.email) { report.push('❌ submit ' + woId + ': email ' + mechId + ' tidak ada'); return; }
    var end = new Date(Date.now() - 10 * 60 * 1000);
    var start = new Date(end.getTime() - durasiJam * 3600 * 1000);
    var r = submitMechanicWork(woId, start.toISOString(), end.toISOString(), mech.email,
                               1200 + Math.floor(Math.random() * 300), 4500 + Math.floor(Math.random() * 800));
    report.push((r && r.success ? '➕ submit ' : '❌ submit gagal ') + woId + (r && r.error ? ': ' + (r.error.message || '') : ''));
  }

  // mekanik tyreman existing (ambil 1 dari sheet, role mechanic ber-section tyreman)
  var tyreMechs = getMechanicsByRole('mechanic').filter(function(m){ return String(m.section || '').toLowerCase() === 'tyreman'; });
  var tyreId = tyreMechs.length ? tyreMechs[0].mechanic_id : 'MECH-001';

  // ── TYREMAN: 3 WO ──
  var t1 = mkWO('TYR-1', comps[0].component_no, anyUnit.unit_id, team([tyreId]), null);
  var t2 = mkWO('TYR-2', comps[Math.min(1, comps.length-1)].component_no, anyUnit.unit_id, team([tyreId]), null);
  var t3 = mkWO('TYR-3', comps[Math.min(2, comps.length-1)].component_no, anyUnit.unit_id, team([tyreId]), null);
  submitAs(t3, tyreId, 4, 2.5);

  // ── FIELD: 4 WO (F-3 tim 2 orang → uji full-point saat kamu approve) ──
  var f1 = mkWO('FLD-1', null, fieldJobs[0]._unit.unit_id, team(['MECH-D01']), {section: 'field', job_id: fieldJobs[0].job_id});
  var f2 = mkWO('FLD-2', null, fieldJobs[1]._unit.unit_id, team(['MECH-D02']), {section: 'field', job_id: fieldJobs[1].job_id});
  var f3 = mkWO('FLD-3', null, fieldJobs[2]._unit.unit_id, team(['MECH-D01', 'MECH-D02']), {section: 'field', job_id: fieldJobs[2].job_id});
  var f4 = mkWO('FLD-4', null, fieldJobs[3]._unit.unit_id, team(['MECH-D01']), {section: 'field', job_id: fieldJobs[3].job_id});
  submitAs(f3, 'MECH-D01', 6, parseFloat(fieldJobs[2].plan_hours) || 3);
  submitAs(f4, 'MECH-D01', 8, (parseFloat(fieldJobs[3].plan_hours) || 3) * 1.4); // sengaja telat → uji timeliness

  // ── WORKSHOP: 3 WO ──
  var w1 = mkWO('WS-1', null, null, team(['MECH-D03']), {section: 'workshop', job_id: wsJobs[0].job_id});
  var w2 = mkWO('WS-2', null, null, team(['MECH-D03']), {section: 'workshop', job_id: wsJobs[1].job_id});
  var w3 = mkWO('WS-3', null, null, team(['MECH-D03']), {section: 'workshop', job_id: wsJobs[2].job_id});
  submitAs(w3, 'MECH-D03', 5, parseFloat(wsJobs[2].plan_hours) || 2);

  var out = report.join('\n');
  Logger.log('=== HASIL SEED DUMMY ===\n' + out + '\nTotal WO dibuat: ' + made.length + '/10');
  return out;
}

function runWipeDummyData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];

  // kumpulkan id WO dummy dari aktif + arsip
  var dummyIds = {};
  ['WorkOrders', 'WorkOrders_Archive'].forEach(function(nm) {
    var sh = ss.getSheetByName(nm); if (!sh || sh.getLastRow() < 2) return;
    var d = sh.getDataRange().getValues(); var hd = d[0];
    var idI = hd.indexOf('id'), numI = hd.indexOf('wo_number');
    for (var r = d.length - 1; r >= 1; r--) {
      if (String(d[r][numI] || '').indexOf('WO-DUMMY-') === 0) {
        dummyIds[String(d[r][idI])] = true;
        sh.deleteRow(r + 1);
      }
    }
    report.push('🧹 ' + nm + ' dibersihkan');
  });

  // sheet anak: hapus baris ber-wo_id dummy
  [['WorkOrderTeam', 'wo_id'], ['MechanicPoints', 'wo_id'], ['ScoringSnapshots', 'wo_id'], ['Approvals', 'wo_id']].forEach(function(pair) {
    var sh = ss.getSheetByName(pair[0]); if (!sh || sh.getLastRow() < 2) return;
    var d = sh.getDataRange().getValues(); var hd = d[0];
    var wI = hd.indexOf(pair[1]); if (wI === -1) return;
    var n = 0;
    for (var r = d.length - 1; r >= 1; r--) {
      if (dummyIds[String(d[r][wI])]) { sh.deleteRow(r + 1); n++; }
    }
    report.push('🧹 ' + pair[0] + ': ' + n + ' baris');
  });

  // mekanik dummy
  var ms = ss.getSheetByName('Config_Mechanics');
  if (ms && ms.getLastRow() > 1) {
    var md = ms.getDataRange().getValues(); var mh = md[0];
    var midI = mh.indexOf('mechanic_id'); var n2 = 0;
    for (var r2 = md.length - 1; r2 >= 1; r2--) {
      if (String(md[r2][midI] || '').indexOf('MECH-D') === 0) { ms.deleteRow(r2 + 1); n2++; }
    }
    report.push('🧹 mekanik dummy: ' + n2);
  }

  var out = report.join('\n');
  Logger.log('=== HASIL WIPE DUMMY ===\n' + out);
  return out;
}