/**
 * SeedManpower (hapus).gs — manpower dummy 3 cluster + akun asli. HAPUS SEBELUM GO-LIVE.
 * runSeedManpower()      : buat/upsert semua user di bawah
 * runWipeManpowerDummy() : hapus semua baris ber-keterangan 'DUMMY' (akun asli tidak disentuh)
 */

var REAL_ACCOUNTS = [
  {email: 'hrdptmulia@gmail.com',    name: 'Pengawas HO',              role: 'superintendent', section: '',              ket: 'HO pengawas — helicopter view semua cluster'},
  {email: 'gabrielrudra9@gmail.com', name: 'Supt Workshop',            role: 'superintendent', section: 'workshop',      ket: 'Approver L2 khusus cluster WORKSHOP'},
  {email: 'gabrielrudra3@gmail.com', name: 'Supt Field & Tyreman',     role: 'superintendent', section: 'field,tyreman', ket: 'Approver L2 khusus cluster FIELD + TYREMAN'}
];

var RATE_LAYERS = [
  ['rate_junior',  2500, 'Rate insentif per poin — layer Junior'],
  ['rate_senior',  3500, 'Rate insentif per poin — layer Senior'],
  ['rate_advisor', 4500, 'Rate insentif per poin — layer Advisor']
];

function runSeedManpower() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Config_Mechanics');
  var report = [];
  if (!sh) { Logger.log('❌ Config_Mechanics tidak ada'); return 'ABORT'; }

  // ── pastikan kolom keterangan ada ──
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h){ return String(h).trim(); });
  var col = {};
  for (var i = 0; i < headers.length; i++) col[headers[i]] = i + 1;
  if (!col['keterangan']) {
    sh.getRange(1, lastCol + 1).setValue('keterangan');
    col['keterangan'] = lastCol + 1;
    report.push('➕ kolom keterangan dibuat (kolom ' + col['keterangan'] + ')');
  }
  ['mechanic_id','mechanic_name','email','role','is_active','position','section'].forEach(function(k){
    if (!col[k]) report.push('❌ kolom ' + k + ' TIDAK ADA — periksa header!');
  });

  // ── rate 3 layer di Config_BaseSettings (idempotent) ──
  var bs = ss.getSheetByName('Config_BaseSettings');
  if (bs) {
    var bsData = bs.getDataRange().getValues();
    var existingKeys = {};
    for (var b = 1; b < bsData.length; b++) existingKeys[String(bsData[b][0]).trim()] = true;
    for (var rl = 0; rl < RATE_LAYERS.length; rl++) {
      if (!existingKeys[RATE_LAYERS[rl][0]]) {
        bs.appendRow(RATE_LAYERS[rl]);
        report.push('➕ setting ' + RATE_LAYERS[rl][0] + ' = ' + RATE_LAYERS[rl][1]);
      } else report.push('✓ setting ' + RATE_LAYERS[rl][0] + ' sudah ada');
    }
  }

  // ── peta email → row untuk upsert ──
  function emailRowMap() {
    var out = {};
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return out;
    var em = sh.getRange(2, col['email'], lastRow - 1, 1).getValues();
    for (var r = 0; r < em.length; r++) {
      var e = String(em[r][0] || '').toLowerCase().trim();
      if (e) out[e] = r + 2;
    }
    return out;
  }
  function nextIdNum(prefix) {
    var lastRow = sh.getLastRow(); var mx = 0;
    if (lastRow > 1) {
      var ids = sh.getRange(2, col['mechanic_id'], lastRow - 1, 1).getValues();
      for (var r = 0; r < ids.length; r++) {
        var v = String(ids[r][0] || '');
        if (v.indexOf(prefix) === 0) {
          var n = parseInt(v.substring(prefix.length), 10);
          if (!isNaN(n) && n > mx) mx = n;
        }
      }
    }
    return mx + 1;
  }
  function upsert(id, name, email, role, position, section, ket) {
    var map = emailRowMap();
    var rowVals = {};
    rowVals[col['mechanic_name']] = name; rowVals[col['role']] = role;
    rowVals[col['is_active']] = true; rowVals[col['position']] = position;
    rowVals[col['section']] = section; rowVals[col['keterangan']] = ket;
    var existingRow = map[email.toLowerCase()];
    if (existingRow) {
      for (var c in rowVals) sh.getRange(existingRow, parseInt(c, 10)).setValue(rowVals[c]);
      report.push('🔁 upsert ' + email + ' → role=' + role + ' section="' + section + '"');
    } else {
      var arr = [];
      for (var cc = 1; cc <= sh.getLastColumn(); cc++) arr.push('');
      arr[col['mechanic_id'] - 1] = id; arr[col['mechanic_name'] - 1] = name;
      arr[col['email'] - 1] = email; arr[col['role'] - 1] = role;
      arr[col['is_active'] - 1] = true; arr[col['position'] - 1] = position;
      arr[col['section'] - 1] = section; arr[col['keterangan'] - 1] = ket;
      sh.appendRow(arr);
      report.push('➕ ' + id + ' ' + name + ' (' + (section || 'HO') + ')');
    }
  }

  // ── AKUN ASLI (upsert) ──
  for (var ra = 0; ra < REAL_ACCOUNTS.length; ra++) {
    var A = REAL_ACCOUNTS[ra];
    upsert('SUPT-R' + (ra + 1), A.name, A.email, A.role, '-', A.section, A.ket);
  }

  // ── SUPERVISOR L1 DUMMY per cluster ──
  var l1 = [
    ['Planner Field Alpha',  'dummy.plannerft1@test.local', 'field,tyreman', 'DUMMY — Approver L1 (planner) cluster Field+Tyreman'],
    ['Planner Field Beta',   'dummy.plannerft2@test.local', 'field,tyreman', 'DUMMY — Approver L1 (planner) cluster Field+Tyreman'],
    ['Planner WS Alpha',     'dummy.plannerws1@test.local', 'workshop',      'DUMMY — Approver L1 (planner) cluster Workshop'],
    ['Planner WS Beta',      'dummy.plannerws2@test.local', 'workshop',      'DUMMY — Approver L1 (planner) cluster Workshop']
  ];
  for (var s = 0; s < l1.length; s++) {
    upsert('SPV-D' + (s + 1) + '0', l1[s][0], l1[s][1], 'supervisor', '-', l1[s][2], l1[s][3]);
  }

  // ── MEKANIK DUMMY (31 orang) ──
  // [nama, cluster, layer, tugas utk keterangan]
  var TY = [['Agus Priyanto','senior','lead tyre'],['Budi Hartono','junior','tyre'],['Cahyo Nugroho','junior','tyre'],
            ['Dedi Kurniawan','junior','tyre'],['Eko Wibowo','senior','tyre'],['Fajar Ramadhan','junior','tyre'],
            ['Gilang Saputra','junior','tyre'],['Hendra Gunawan','advisor','advisor tyre']];
  var FL = [['Irfan Maulana','senior','welder'],['Joko Susilo','junior','welder'],['Krisna Bayu','senior','elektrik'],
            ['Lukman Hakim','junior','elektrik'],['Miko Ardiansyah','junior','schedule'],['Nanda Pratama','junior','schedule'],
            ['Oki Setiawan','senior','schedule'],['Putra Wijaya','junior','unschedule'],['Qomar Zaman','junior','unschedule'],
            ['Rizki Febrian','senior','unschedule'],['Surya Darmawan','junior','unschedule'],['Taufik Hidayat','advisor','advisor field']];
  var WS = [['Umar Said','senior','welder fabrikasi'],['Vino Anggara','junior','welder fabrikasi'],['Wawan Kurnia','junior','elektrik'],
            ['Yanto Prabowo','senior','schedule rebuild'],['Zaki Firmansyah','junior','schedule rebuild'],['Andi Saputro','junior','schedule rebuild'],
            ['Bagas Prakoso','junior','unschedule repair'],['Candra Wijaya','senior','unschedule repair'],['Dimas Aditya','junior','unschedule repair'],
            ['Erwin Santoso','advisor','advisor workshop']];

  function seedCluster(list, cluster, prefix) {
    var n = nextIdNum(prefix);
    for (var i = 0; i < list.length; i++) {
      var id = prefix + (n + i < 10 ? '0' : '') + (n + i);
      upsert(id, list[i][0], 'dummy.' + prefix.toLowerCase().replace('-','') + (n + i) + '@test.local',
             'mechanic', list[i][1], cluster,
             'DUMMY — Mekanik ' + cluster.toUpperCase() + ' (' + list[i][2] + '), layer ' + list[i][1]);
    }
    report.push('➕ ' + list.length + ' mekanik ' + cluster);
  }
  seedCluster(TY, 'tyreman', 'MECH-T');
  seedCluster(FL, 'field', 'MECH-F');
  seedCluster(WS, 'workshop', 'MECH-W');

  var out = report.join('\n');
  Logger.log('=== HASIL SEED MANPOWER ===\n' + out);
  return out;
}

function runWipeManpowerDummy() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Config_Mechanics');
  if (!sh || sh.getLastRow() < 2) return 'kosong';
  var d = sh.getDataRange().getValues();
  var ketI = d[0].map(function(h){return String(h).trim();}).indexOf('keterangan');
  if (ketI === -1) return 'kolom keterangan tidak ada';
  var n = 0;
  for (var r = d.length - 1; r >= 1; r--) {
    if (String(d[r][ketI] || '').indexOf('DUMMY') === 0) { sh.deleteRow(r + 1); n++; }
  }
  Logger.log('🧹 ' + n + ' baris dummy dihapus (akun asli aman)');
  return n + ' dihapus';
}