/**
 * ============================================================================
 * MECHANIC INCENTIVE SYSTEM - SETUP SCRIPT v3.0
 * ============================================================================
 * 
 * SCHEMA UPDATED untuk Session 1 Backend Compatibility
 * 
 * Changes from v2:
 * - Config_Units: changed 'equipment_type' → 'unit_type', added 'is_active'
 * - Config_BaseSettings: added 'description' column
 * - WorkOrders: simplified untuk Session 1 (minimal required columns)
 * - WorkOrderTeam: changed 'work_order_id' → 'wo_id', simplified columns
 * - Approvals: changed 'approval_stage' → 'stage', 'approver_id' → 'approver_email', removed unnecessary columns
 * - ScoringSnapshots: simplified to essential columns only
 * - MechanicPoints: changed 'work_order_id' → 'wo_id', removed week/month/year, changed 'created_at' → 'awarded_at'
 * - OthersJobRequests: drastically simplified
 * - AuditLogs: simplified to essential audit fields
 * - MtbfTracking: completely changed schema untuk MTBF wait period tracking
 * 
 * IDEMPOTENT - Bisa di-run berkali-kali dengan hasil yang sama
 * 
 * ============================================================================
 */

function setupSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    Logger.log('═══════════════════════════════════════════════════════════');
    Logger.log('🚀 MECHANIC INCENTIVE SETUP v3.0 - Starting...');
    Logger.log('═══════════════════════════════════════════════════════════');
    
    // Step 1: Clear all existing sheets
    Logger.log('');
    Logger.log('📋 Step 1/4: Clearing existing sheets...');
    clearAllSheets(ss);
    Logger.log('   ✅ All existing sheets cleared');
    
    // Step 2: Create 13 sheets with headers
    Logger.log('');
    Logger.log('📋 Step 2/4: Creating 13 sheets with headers...');
    var sheetsCreated = createAllSheets(ss);
    Logger.log('   ✅ Created ' + sheetsCreated + ' sheets');
    
    // Step 3: Seed config data
    Logger.log('');
    Logger.log('🌱 Step 3/4: Seeding master data...');
    var dataSummary = seedAllConfigData(ss);
    Logger.log('   ✅ Components: ' + dataSummary.components + ' rows');
    Logger.log('   ✅ Units: ' + dataSummary.units + ' rows');
    Logger.log('   ✅ Mechanics: ' + dataSummary.mechanics + ' rows');
    Logger.log('   ✅ Factors: ' + dataSummary.factors + ' rows');
    Logger.log('   ✅ Settings: ' + dataSummary.settings + ' rows');
    
    // Step 4: Format all sheets
    Logger.log('');
    Logger.log('🎨 Step 4/4: Formatting sheets...');
    var sheetsFormatted = formatAllSheets(ss);
    Logger.log('   ✅ Formatted ' + sheetsFormatted + ' sheets');
    
    // Step 5: Cleanup temp sheet
    Logger.log('');
    Logger.log('🧹 Cleaning up temporary sheets...');
    cleanupTempSheets(ss);
    Logger.log('   ✅ Cleanup complete');
    
    // Success!
    Logger.log('');
    Logger.log('═══════════════════════════════════════════════════════════');
    Logger.log('✅ SETUP COMPLETE v3.0 - All 13 sheets ready!');
    Logger.log('   Schema: 100% compatible with Session 1 backend');
    Logger.log('═══════════════════════════════════════════════════════════');
    
    SpreadsheetApp.getUi().alert(
      '✅ Setup Complete v3.0!\n\n' +
      '13 sheets created with Session 1 compatible schema:\n' +
      '• 5 config sheets (with master data)\n' +
      '• 8 transaction sheets (headers only)\n\n' +
      'Run runHealthCheck() to verify.\n' +
      'All checks should PASS now.'
    );
    
  } catch (error) {
    Logger.log('');
    Logger.log('❌ ERROR: ' + error.message);
    Logger.log('Stack trace: ' + error.stack);
    
    SpreadsheetApp.getUi().alert(
      '❌ Setup Failed\n\n' +
      'Error: ' + error.message + '\n\n' +
      'Check View > Logs for details.\n' +
      'You can re-run setupSpreadsheet() to try again.'
    );
    
    throw error;
  }
}

// ============================================================================
// STEP 1: CLEAR ALL EXISTING SHEETS
// ============================================================================

function clearAllSheets(ss) {
  var sheets = ss.getSheets();
  Logger.log('   Found ' + sheets.length + ' existing sheet(s)');
  
  while (sheets.length > 1) {
    var lastSheet = sheets[sheets.length - 1];
    Logger.log('   Deleting: ' + lastSheet.getName());
    ss.deleteSheet(lastSheet);
    sheets = ss.getSheets();
  }
  
  var tempName = '_temp_' + new Date().getTime();
  sheets[0].setName(tempName);
  Logger.log('   Renamed last sheet to: ' + tempName);
}

// ============================================================================
// STEP 2: CREATE ALL SHEETS WITH HEADERS (v3 - Session 1 Compatible)
// ============================================================================

function createAllSheets(ss) {
  var sheetsConfig = [
    // ===== CONFIG SHEETS =====
    {
      name: 'Config_Components',
      headers: ['component_no', 'component_name', 'category', 'base_points', 'target_hours', 'default_team_size', 'notes']
    },
    {
      name: 'Config_Units',
      headers: ['unit_id', 'unit_name', 'unit_type', 'unit_factor', 'is_active']
    },
    {
      name: 'Config_Mechanics',
      headers: ['mechanic_id', 'mechanic_name', 'email', 'role', 'is_active']
    },
    {
      name: 'Config_Factors',
      headers: ['factor_type', 'factor_key', 'factor_value', 'description']
    },
    {
      name: 'Config_BaseSettings',
      headers: ['setting_key', 'setting_value', 'description']
    },
    
    // ===== TRANSACTION SHEETS (Session 1 minimal schema) =====
    {
      name: 'WorkOrders',
      headers: ['id', 'wo_number', 'component_id', 'unit_id', 'status', 'created_by', 'created_at']
    },
    {
      name: 'WorkOrderTeam',
      headers: ['id', 'wo_id', 'mechanic_id', 'percentage', 'is_lead']
    },
    {
      name: 'Approvals',
      headers: ['id', 'wo_id', 'stage', 'decision', 'approver_email', 'approved_at']
    },
    {
      name: 'ScoringSnapshots',
      headers: ['id', 'wo_id', 'base_points', 'unit_factor', 'work_condition_factor', 'timeliness_factor', 'safety_factor', 'mtbf_factor', 'final_score', 'created_at']
    },
    {
      name: 'MechanicPoints',
      headers: ['id', 'mechanic_id', 'wo_id', 'points', 'idr_value', 'awarded_at']
    },
    {
      name: 'OthersJobRequests',
      headers: ['id', 'job_description', 'requested_by', 'status', 'created_at']
    },
    {
      name: 'AuditLogs',
      headers: ['id', 'action', 'entity_type', 'entity_id', 'user_email', 'details', 'timestamp']
    },
    {
      name: 'MtbfTracking',
      headers: ['id', 'wo_id', 'mtbf_start_date', 'mtbf_expiry_date', 'status']
    }
  ];
  
  for (var i = 0; i < sheetsConfig.length; i++) {
    var config = sheetsConfig[i];
    var sheet = ss.insertSheet(config.name);
    sheet.appendRow(config.headers);
    Logger.log('   Created: ' + config.name + ' (' + config.headers.length + ' columns)');
  }
  
  return sheetsConfig.length;
}

// ============================================================================
// STEP 3: SEED ALL CONFIG DATA
// ============================================================================

function seedAllConfigData(ss) {
  var summary = {
    components: 0,
    units: 0,
    mechanics: 0,
    factors: 0,
    settings: 0
  };
  
  summary.components = seedComponents(ss);
  summary.units = seedUnits(ss);
  summary.mechanics = seedMechanics(ss);
  summary.factors = seedFactors(ss);
  summary.settings = seedBaseSettings(ss);
  
  return summary;
}

function seedComponents(ss) {
  var sheet = ss.getSheetByName('Config_Components');
  
  // Schema: component_no, component_name, category, base_points, target_hours, default_team_size, notes
  var data = [
    ['COM-001', 'Intercooler', 'Remove & Install - Major Repair', 3, 6, 1, 'Active'],
    ['COM-002', 'Injector Volvo', 'Remove & Install - Major Repair', 3, 6, 1, 'Active'],
    ['COM-003', 'Injector Beiben', 'Remove & Install - Major Repair', 2, 4, 1, 'Active'],
    ['COM-004', 'Injector Axor', 'Remove & Install - Major Repair', 1, 2, 1, 'Active'],
    ['COM-005', 'Alternator', 'Remove & Install - Minor Repair', 0.5, 1, 1, 'Active'],
    ['COM-006', 'Water Pump', 'Remove & Install - Minor Repair', 1.5, 3, 1, 'Active'],
    ['COM-007', 'Fuel Filter', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-008', 'Rehose Fuel', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-009', 'Radiator & Cooling System', 'Remove & Install - Minor Repair', 2, 4, 1, 'Active'],
    ['COM-010', 'Adjust Valve', 'Adjustment - Minor Repair', 1.5, 3, 1, 'Active'],
    ['COM-011', 'Turbocharger', 'Remove & Install - Minor Repair', 1.5, 3, 1, 'Active'],
    ['COM-012', 'Disc Clutch', 'Remove & Install - Major Repair', 6, 8, 2, 'Active'],
    ['COM-013', 'Transmission', 'Remove & Install - Major Repair', 6, 8, 2, 'Active'],
    ['COM-014', 'Clucth Cylinder', 'Remove & Install - Major Repair', 6, 6, 2, 'Active'],
    ['COM-015', 'Servo Clutch', 'Remove & Install - Minor Repair', 3, 3, 1, 'Active'],
    ['COM-016', 'Rehose Transmission', 'Remove & Install - Minor Repair', 3, 3, 1, 'Active'],
    ['COM-017', 'Propeller Shaft & U-Joint Rear', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-018', 'Propeller Shaft & U-Joint Front', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-019', 'Front Axle And Wheel', 'Remove & Install - Major Repair', 6, 12, 2, 'Active'],
    ['COM-020', 'Center Bearing / Support Bearing', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-021', 'Rear Axle And Wheel', 'Remove & Install - Minor Repair', 6, 12, 2, 'Active'],
    ['COM-022', 'Final Drive Lh', 'Overhaul - Major Repair', 2, 4, 2, 'Active'],
    ['COM-023', 'Final Drive Rh', 'Overhaul - Major Repair', 2, 4, 2, 'Active'],
    ['COM-024', 'Air Compressor And Air Tank', 'Remove & Install - Major Repair', 2, 4, 2, 'Active'],
    ['COM-025', 'Brake Chamber + Brake Relay', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-026', 'Brake Valves + Accumulator', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-027', 'Slack Adjuster', 'Remove & Install & Adjustment - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-028', 'Front Brake', 'Remove & Install & Adjustment - Minor Repair', 1, 0.5, 1, 'Active'],
    ['COM-029', 'Rear Brake', 'Remove & Install & Adjustment - Minor Repair', 1, 0.5, 1, 'Active'],
    ['COM-030', 'Hydraulic Control Valve', 'Reseal - Minor Repair', 0.5, 1, 1, 'Active'],
    ['COM-031', 'Hydraulic Cylinder', 'Remove & Install - Major Repair', 6, 12, 2, 'Active'],
    ['COM-032', 'Hidraulic Hose', 'Remove & Install - Minor Repair', 0.5, 1, 1, 'Active'],
    ['COM-033', 'Hydraulic Pump / Pto', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-034', 'Boggie And Suspension', 'Remove & Install - Major Repair', 3, 6, 2, 'Active'],
    ['COM-035', 'Steering And Brake Valve', 'Remove & Install - Minor Repair', 3, 6, 1, 'Active'],
    ['COM-036', 'Steering Gearbox', 'Remove & Install - Major Repair', 3, 6, 2, 'Active'],
    ['COM-037', 'Steering Lingkage ( Tie Rod )', 'Remove & Install - Minor Repair', 1.5, 3, 1, 'Active'],
    ['COM-038', 'Steering Pump', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-039', 'Drag Link', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-040', 'Rehose Steering', 'Remove & Install - Minor Repair', 1, 1, 1, 'Active'],
    ['COM-041', 'King Pin', 'Remove & Install - Major Repair', 2, 2, 2, 'Active'],
    ['COM-042', 'Air Conditioner', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-043', 'Alternator', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-044', 'Electric Harness', 'Remove & Install, Repair - Minor Repair', 1.5, 3, 1, 'Active'],
    ['COM-045', 'Starting Motor', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-046', 'Wiper Blade', 'Remove & Install - Minor Repair', 10, 0.33, 1, 'Active'],
    ['COM-047', 'Head Lamp', 'Remove & Install, Repair - Minor Repair', 0.5, 1, 1, 'Active'],
    ['COM-048', 'Tail Lamp', 'Remove & Install, Repair - Minor Repair', 0.5, 1, 1, 'Active'],
    ['COM-049', 'Trouble Shooting Air Conditioning', 'Trouble Shooting - Major Repair', 6, 3, 1, 'Active'],
    ['COM-050', 'Hose Air Conditioning', 'Remove & Install - Minor Repair', 2, 2, 1, 'Active'],
    ['COM-051', 'Vessel', 'Welding Repair - Major Repair', 1.5, 3, 2, 'Active'],
    ['COM-052', 'Tail Gate', 'Welding Repair - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-053', 'Upper Structure', 'Welding Repair - Minor Repair', 1.5, 3, 2, 'Active'],
    ['COM-054', 'Lower Structure', 'Welding Repair - Minor Repair', 1.5, 3, 2, 'Active'],
    ['COM-055', 'Front Spring A1', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-056', 'Front Spring A2', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-057', 'Rear Spring A1', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-058', 'Rear Spring A2', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-059', 'Torque Rod', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-060', 'V - Stay', 'Remove & Install - Minor Repair', 2, 4, 1, 'Active'],
    ['COM-061', 'Shock Absorber Rear', 'Remove & Install - Minor Repair', 1, 1, 1, 'Active'],
    ['COM-062', 'Shock Absorber Front', 'Remove & Install - Minor Repair', 1, 1, 1, 'Active'],
    ['COM-063', 'Contact Stud / Hollow Spring', 'Remove & Install - Minor Repair', 1, 1, 1, 'Active'],
    ['COM-064', 'Spring Seat', 'Remove & Install - Minor Repair', 1, 1, 1, 'Active'],
    ['COM-065', 'Stabilizer', 'Remove & Install - Minor Repair', 1, 1, 1, 'Active'],
    ['COM-066', 'Rear Tire', 'Remove & Install - Minor Repair', 1, 0.5, 1, 'Active'],
    ['COM-067', 'Front Tire', 'Remove & Install - Minor Repair', 1, 0.5, 1, 'Active'],
    ['COM-068', 'Stock Tire / Repair Tire', 'Remove & Install - Minor Repair', 1, 2, 1, 'Active'],
    ['COM-069', 'Wheel Bearing', 'Remove & Install - Minor Repair', 1, 1, 1, 'Active'],
    ['COM-070', 'Periodic Service 250', 'PS & Backlog - PM Ringan', 3, 3, 1, 'Active'],
    ['COM-071', 'Periodic Service 500', 'PS & Backlog - PM Sedang', 3, 3, 1, 'Active'],
    ['COM-072', 'Periodic Service 750', 'PS & Backlog - PM Sedang', 3, 3, 1, 'Active'],
    ['COM-073', 'Periodic Service 1000', 'PS & Backlog - PM Berat', 6, 6, 1, 'Active'],
    ['COM-074', 'Greasing', 'Schedule Greasing - PM Ringan', 0.5, 0.25, 1, 'Active'],
    ['COM-075', 'Refill Oil / Coolant', 'P2H - PM Ringan', 0.5, 0.25, 1, 'Active'],
    ['COM-076', 'Inspection Unit', 'Inspection - Minor Repair', 0.5, 1, 1, 'Active'],
    ['COM-077', 'Cek Pressure Tire', 'Adjustment - Minor Repair', 0.5, 0.25, 1, 'Active'],
    ['COM-078', 'Engine', 'Remove & Install - Overhaul Engine', 42, 56, 3, 'Active'],
    ['COM-079', 'Transmission', 'Remove & Install - Overhaul Transmissi', 30, 56, 3, 'Active'],
    ['COM-080', 'Repair Cabin Vessel', 'Painting - Major Repair', 112, 112, 4, 'Active'],
    ['COM-081', 'Remove Install Engine', 'Ovh Remove Install - Major Repair', 12, 24, 2, 'Active'],
    ['COM-082', 'Remove Install Transmission', 'Ovh Remove Install - Major Repair', 12, 24, 2, 'Active'],
    ['COM-083', 'Front Brake Lining 1 Set', 'Rotable - Minor Repair', 1, 0.5, 1, 'Active'],
    ['COM-084', 'Rear Brake Lining 1 Set', 'Rotable - Minor Repair', 1, 0.5, 1, 'Active'],
    ['COM-085', 'Rotable Alternator', 'Rotable - Minor Repair', 0.5, 1, 1, 'Active'],
    ['COM-086', 'Rotable Motor Starting', 'Rotable - Minor Repair', 0.5, 1, 1, 'Active'],
    ['COM-087', 'Rotable Injector Volvo 6 Pcs', 'Rotable - Minor Repair', 3, 6, 1, 'Active'],
    ['COM-088', 'Rotable Injector Axor 6 Pcs', 'Rotable - Minor Repair', 3, 3, 1, 'Active'],
    ['COM-089', 'Rotable Torque Rod Volvo Axor Beiben', 'Rotable - Minor Repair', 0.5, 1, 1, 'Active'],
    ['COM-090', 'Rotable V Stay Volvo Axor Beiben', 'Rotable - Minor Repair', 0.5, 1, 1, 'Active'],
    ['COM-091', 'Commissioning Completed', 'Inspection Repair - Minor Repair', 24, 12, 2, 'Active'],
    ['COM-092', 'Stock Spring Sesis', 'Welding & Repair - Minor Repair', 3.5, 4, 2, 'Active'],
    ['COM-093', 'Fabrikasi Support Minor', 'Welding & Repair - Minor Repair', 2, 4, 1, 'Active'],
    ['COM-094', 'Fabrikasi Support Major', 'Welding & Repair - Major Repair', 8, 10, 2, 'Active']
  ];
  
  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
  return data.length;
}

function seedUnits(ss) {
  var sheet = ss.getSheetByName('Config_Units');
  
  // Schema: unit_id, unit_name, unit_type, unit_factor, is_active
  var data = [
    ['UNIT-001', 'Excavator CAT 320', 'Excavator', 1.2, true],
    ['UNIT-002', 'Truck Volvo FH16', 'Truck', 1.0, true],
    ['UNIT-003', 'Loader Komatsu WA', 'Loader', 0.8, true],
    ['UNIT-004', 'Dozer Caterpillar', 'Dozer', 1.1, true]
  ];
  
  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
  return data.length;
}

function seedMechanics(ss) {
  var sheet = ss.getSheetByName('Config_Mechanics');
  
  // Schema: mechanic_id, mechanic_name, email, role, is_active
  var data = [
    ['MECH-001', 'Ahmad Fauzi', 'ahmad.fauzi@company.com', 'mechanic', true],
    ['MECH-002', 'Budi Santoso', 'budi.santoso@company.com', 'mechanic', true],
    ['MECH-003', 'Charlie Wijaya', 'charlie.wijaya@company.com', 'mechanic', true],
    ['MECH-004', 'Doni Pratama', 'doni.pratama@company.com', 'mechanic', true],
    ['MECH-005', 'Eko Saputra', 'eko.saputra@company.com', 'mechanic', true],
    ['MECH-006', 'Fajar Nugroho', 'fajar.nugroho@company.com', 'mechanic', true],
    ['MECH-007', 'Gani Hermawan', 'gani.hermawan@company.com', 'mechanic', true],
    ['MECH-008', 'Hendra Kurniawan', 'hendra.kurniawan@company.com', 'mechanic', true],
    ['MECH-009', 'Irfan Hakim', 'irfan.hakim@company.com', 'mechanic', true],
    ['MECH-010', 'Joko Susanto', 'joko.susanto@company.com', 'mechanic', true],
    ['MECH-011', 'Krisna Adiputra', 'krisna.adiputra@company.com', 'mechanic', true],
    ['MECH-012', 'Lutfi Rahman', 'lutfi.rahman@company.com', 'mechanic', true],
    ['SUPV-001', 'Maman Suryadi', 'maman.suryadi@company.com', 'supervisor', true],
    ['SUPV-002', 'Nanang Setiawan', 'nanang.setiawan@company.com', 'supervisor', true],
    ['SUPV-003', 'Oman Abdurrahman', 'oman.abdurrahman@company.com', 'supervisor', true],
    ['SUPT-001', 'Pandu Wijaksono', 'pandu.wijaksono@company.com', 'superintendent', true],
    ['SUPT-002', 'Qomar Hidayat', 'qomar.hidayat@company.com', 'superintendent', true]
  ];
  
  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
  return data.length;
}

function seedFactors(ss) {
  var sheet = ss.getSheetByName('Config_Factors');
  
  // Schema: factor_type, factor_key, factor_value, description
  var data = [
    ['work_condition', 'normal', 1.0, 'Normal working conditions'],
    ['work_condition', 'difficult', 1.1, 'Difficult working conditions (e.g., rain, heat)'],
    ['work_condition', 'extreme', 1.2, 'Extreme working conditions (e.g., confined space, high risk)'],
    ['timeliness', 'on_time', 1.0, 'Completed on time (actual ≤ 100% of target)'],
    ['timeliness', 'late', 0.8, 'Late completion (actual 101-150% of target)'],
    ['timeliness', 'way_late', 0.5, 'Very late completion (actual > 150% of target)'],
    ['safety', 'no_incident', 1.0, 'No safety incidents'],
    ['safety', 'incident', 0.0, 'Safety incident occurred - all points cancelled'],
    ['mtbf', 'redo', 0.8, 'REDO job (cumulative hours < threshold)'],
    ['mtbf', 'first_time', 1.2, 'First time or good MTBF (cumulative hours ≥ threshold)']
  ];
  
  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
  return data.length;
}

function seedBaseSettings(ss) {
  var sheet = ss.getSheetByName('Config_BaseSettings');
  
  // Schema: setting_key, setting_value, description
  var data = [
    ['mtbf_threshold_hours', 80, 'MTBF threshold in hours (cumulative hours to qualify for first_time factor)'],
    ['idr_rate', 50000, 'IDR per point conversion rate'],
    ['points_to_idr_multiplier', 50000, 'Points to IDR multiplier'],
    ['base_points_multiplier', 10, 'Base points multiplier'],
    ['on_time_days_buffer', 0, 'On-time grace period in days'],
    ['safety_incident_penalty', 0, 'Safety incident penalty (0 = cancel all points)']
  ];
  
  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
  return data.length;
}

// ============================================================================
// STEP 4: FORMAT ALL SHEETS
// ============================================================================

function formatAllSheets(ss) {
  var sheets = ss.getSheets();
  var formattedCount = 0;
  
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var sheetName = sheet.getName();
    
    if (sheetName.indexOf('_temp_') === 0) continue;
    
    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) {
      Logger.log('   ⚠️  Skipping empty sheet: ' + sheetName);
      continue;
    }
    
    sheet.setFrozenRows(1);
    
    var headerRange = sheet.getRange(1, 1, 1, lastCol);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4a86e8');
    headerRange.setFontColor('#ffffff');
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');
    
    for (var col = 1; col <= lastCol; col++) {
      sheet.autoResizeColumn(col);
    }
    
    sheet.setRowHeight(1, 30);
    
    formattedCount++;
  }
  
  return formattedCount;
}

// ============================================================================
// STEP 5: CLEANUP TEMP SHEETS
// ============================================================================

function cleanupTempSheets(ss) {
  var sheets = ss.getSheets();
  
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var sheetName = sheet.getName();
    
    if (sheetName.indexOf('_temp_') === 0) {
      Logger.log('   Deleting temp sheet: ' + sheetName);
      ss.deleteSheet(sheet);
    }
  }
}