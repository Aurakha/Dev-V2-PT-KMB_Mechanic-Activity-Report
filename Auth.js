/**
 * ============================================================================
 * Auth.gs - User Authentication & Authorization
 * ============================================================================
 * 
 * Production-grade auth dengan:
 * - Google Session integration
 * - Role-based access control (RBAC)
 * - Authorization helpers
 * - User info caching (per execution only)
 * 
 * Dependencies: Constants.gs, Logger.gs, ConfigService.gs, ResponseHelper.gs
 * ============================================================================
 */

// Cache untuk current user (per execution)
var _cachedCurrentUser = null;

// ============================================================================
// USER AUTHENTICATION
// ============================================================================

/**
 * Get current user email from Google Session
 * @return {string|null}
 */
function getCurrentUser() {
  try {
    // 1. Token context (mode token, tanpa Google login)
    var tokenEmail = (typeof getTokenContextEmail === 'function') ? getTokenContextEmail() : null;
    if (tokenEmail) return tokenEmail;

    // 2. Fallback: Google Session (mode lama / owner)
    var user = Session.getActiveUser();
    if (!user) return null;
    var email = user.getEmail();
    if (!email || email.length === 0) {
      Log.warn('getCurrentUser', 'No email in session');
      return null;
    }
    return email;
  } catch (e) {
    Log.exception('getCurrentUser', e);
    return null;
  }
}

/**
 * Get user role berdasarkan email
 * @param {string} email - Optional, uses current user if not provided
 * @return {string|null} role atau null
 */
function getUserRole(email) {
  if (!email) {
    email = getCurrentUser();
  }
  
  if (!email) return null;
  
  try {
    var mechanic = getMechanicByEmail(email);
    if (!mechanic) {
      Log.debug('getUserRole', 'User not in Config_Mechanics', {email: email});
      return null;
    }
    
    var role = mechanic.role;
    if (!role || typeof role !== 'string') {
      Log.warn('getUserRole', 'Role not defined', {email: email});
      return null;
    }
    
    return role.toLowerCase().trim();
  } catch (e) {
    Log.exception('getUserRole', e, {email: email});
    return null;
  }
}

/**
 * Get current user with role
 * Returns user object even if not in Config_Mechanics
 * NEVER returns null - always returns valid user object
 */
function getCurrentUserWithRole() {
  try {
    // 1. Token context (mode token)
    var email = (typeof getTokenContextEmail === 'function') ? getTokenContextEmail() : null;

    // 2. Fallback: Google Session
    if (!email) {
      try { email = Session.getEffectiveUser().getEmail(); } catch (se) { email = null; }
    }

    if (!email) {
      Log.warn('getCurrentUserWithRole', 'No email (no token, no session)');
      return { email: 'unknown@example.com', role: null, mechanic_id: null, mechanic_name: 'Unknown User' };
    }

    var mechanic = getMechanicByEmail(email);
    if (mechanic) {
      return {
        email: email,
        role: mechanic.role || null,
        mechanic_id: mechanic.mechanic_id || null,
        mechanic_name: mechanic.mechanic_name || email.split('@')[0]
      };
    }

    Log.info('getCurrentUserWithRole', 'User not in mechanics list', {email: email});
    return { email: email, role: null, mechanic_id: null, mechanic_name: email.split('@')[0] };
  } catch (e) {
    Log.exception('getCurrentUserWithRole', e);
    return { email: 'error@example.com', role: null, mechanic_id: null, mechanic_name: 'Error User' };
  }
}

/**
 * Clear cached current user (force re-fetch)
 */
function clearAuthCache() {
  _cachedCurrentUser = null;
}

// ============================================================================
// ROLE CHECKS (Return boolean)
// ============================================================================

function isMechanic(email) {
  return getUserRole(email) === ROLES.MECHANIC;
}

function isSupervisor(email) {
  return getUserRole(email) === ROLES.SUPERVISOR;
}

function isSuperintendent(email) {
  return getUserRole(email) === ROLES.SUPERINTENDENT;
}

function isApprover(email) {
  var role = getUserRole(email);
  return APPROVER_ROLES.indexOf(role) !== -1;
}

function hasRole(allowedRoles, email) {
  if (!allowedRoles || !Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    return false;
  }
  
  var role = getUserRole(email);
  if (!role) return false;
  
  for (var i = 0; i < allowedRoles.length; i++) {
    if (allowedRoles[i].toLowerCase() === role) return true;
  }
  
  return false;
}

// ============================================================================
// AUTHORIZATION (Throw on failure)
// ============================================================================

/**
 * Require specific role, throw error if not authorized
 * @param {Array<string>} allowedRoles
 * @throws {Error}
 */
function requireRole(allowedRoles) {
  var user = getCurrentUserWithRole();
  
  if (!user || !user.email) {
    throw new Error('AUTH_REQUIRED: Authentication required. Please log in.');
  }
  
  if (!user.role) {
    throw new Error('AUTH_USER_NOT_FOUND: User not found in system. Please contact admin.');
  }
  
  if (!hasRole(allowedRoles)) {
    throw new Error('AUTH_FORBIDDEN: Access denied. Required role: ' + allowedRoles.join(' or ') + ' (current: ' + user.role + ')');
  }
}

function requireMechanic() {
  requireRole([ROLES.MECHANIC]);
}

function requireSupervisor() {
  requireRole([ROLES.SUPERVISOR]);
}

function requireSuperintendent() {
  requireRole([ROLES.SUPERINTENDENT]);
}

function requireApprover() {
  requireRole(APPROVER_ROLES);
}

// ============================================================================
// AUTHORIZATION (Return response - non-throwing)
// ============================================================================

/**
 * Check authorization, return success/error response (non-throwing)
 * FIXED: Check user.email and user.role instead of non-existent properties
 * @param {Array<string>} allowedRoles
 * @return {Object} Response object
 */
function checkAuthorization(allowedRoles) {
  var user = getCurrentUserWithRole();
  
  // Check if user object exists and has email
  if (!user || !user.email) {
    return errorResponse(ERROR_CODES.AUTH_NOT_LOGGED_IN, 'Not logged in. Please refresh the page.');
  }
  
  // Check if user has a role (exists in Config_Mechanics)
  if (!user.role) {
    return errorResponse(ERROR_CODES.AUTH_USER_NOT_FOUND, 'User not found in system. Please contact admin.', {email: user.email});
  }
  
  // Check if user has one of the allowed roles
  if (!hasRole(allowedRoles, user.email)) {
    return permissionDeniedResponse(allowedRoles.join(' or '), user.role);
  }
  
  return successResponse(user);
}

// ============================================================================
// USER UTILITY FUNCTIONS
// ============================================================================

function userExists(email) {
  if (!email) return false;
  return getMechanicByEmail(email) !== null;
}

function isUserActive(email) {
  if (!email) return false;
  
  try {
    var mechanic = getMechanicByEmail(email);
    if (!mechanic) return false;
    return mechanic.is_active === true || mechanic.is_active === 'TRUE';
  } catch (e) {
    return false;
  }
}

function getUserDisplayName(email) {
  if (!email) email = getCurrentUser();
  if (!email) return 'Unknown User';
  
  try {
    var mechanic = getMechanicByEmail(email);
    if (mechanic && mechanic.mechanic_name) {
      return mechanic.mechanic_name;
    }
    return email;
  } catch (e) {
    return email;
  }
}

function getMechanicIdFromEmail(email) {
  if (!email) email = getCurrentUser();
  if (!email) return null;
  
  try {
    var mechanic = getMechanicByEmail(email);
    return mechanic ? (mechanic.mechanic_id || null) : null;
  } catch (e) {
    return null;
  }
}

function getEmailFromMechanicId(mechanicId) {
  if (!mechanicId) return null;
  
  try {
    var mechanic = getMechanicById(mechanicId);
    return mechanic ? (mechanic.email || null) : null;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// ADMIN / DEBUG
// ============================================================================

function getAllUsersWithRoles() {
  try {
    var mechanics = loadMechanics();
    var users = [];
    
    for (var i = 0; i < mechanics.length; i++) {
      var m = mechanics[i];
      users.push({
        email: m.email,
        name: m.mechanic_name,
        role: m.role,
        is_active: m.is_active,
        mechanic_id: m.mechanic_id
      });
    }
    
    return users;
  } catch (e) {
    Log.exception('getAllUsersWithRoles', e);
    return [];
  }
}

function logCurrentUserInfo() {
  var user = getCurrentUserWithRole();
  
  Log.separator('Current User Info');
  if (user) {
    Log.info('user', 'Email: ' + user.email);
    Log.info('user', 'Name: ' + user.mechanic_name);
    Log.info('user', 'Role: ' + user.role);
    Log.info('user', 'Mechanic ID: ' + user.mechanic_id);
  } else {
    Log.warn('user', 'No user logged in');
  }
}

// ============================================================================
// TESTING
// ============================================================================

function testAuth() {
  Log.separator('Testing Auth.gs');
  
  var passed = 0;
  var failed = 0;
  
  function assert(condition, name) {
    if (condition) { Log.info('test', '✅ ' + name); passed++; }
    else { Log.error('test', '❌ ' + name); failed++; }
  }
  
  function tryTest(name, fn) {
    try { fn(); }
    catch (e) { Log.error('test', '❌ ' + name + ' ERROR: ' + e.message); failed++; }
  }
  
  // Test getCurrentUser
  Log.section('Session');
  tryTest('getCurrentUser', function() {
    var email = getCurrentUser();
    assert(email && email.indexOf('@') !== -1, 'Got valid email from session');
  });
  
  // Test getUserRole dengan known emails
  Log.section('Role Detection');
  tryTest('getUserRole', function() {
    assert(getUserRole('ahmad.fauzi@company.com') === 'mechanic', 'Ahmad = mechanic');
    assert(getUserRole('maman.suryadi@company.com') === 'supervisor', 'Maman = supervisor');
    assert(getUserRole('pandu.wijaksono@company.com') === 'superintendent', 'Pandu = superintendent');
    assert(getUserRole('nonexistent@company.com') === null, 'Unknown user = null');
  });
  
  // Test role checks
  Log.section('Role Checks');
  tryTest('isMechanic', function() {
    assert(isMechanic('ahmad.fauzi@company.com') === true, 'Is mechanic');
    assert(isMechanic('maman.suryadi@company.com') === false, 'Not mechanic');
  });
  
  tryTest('isSupervisor', function() {
    assert(isSupervisor('maman.suryadi@company.com') === true, 'Is supervisor');
  });
  
  tryTest('isSuperintendent', function() {
    assert(isSuperintendent('pandu.wijaksono@company.com') === true, 'Is superintendent');
  });
  
  tryTest('isApprover', function() {
    assert(isApprover('maman.suryadi@company.com') === true, 'Supervisor is approver');
    assert(isApprover('pandu.wijaksono@company.com') === true, 'Superintendent is approver');
    assert(isApprover('ahmad.fauzi@company.com') === false, 'Mechanic not approver');
  });
  
  tryTest('hasRole', function() {
    assert(hasRole(['mechanic'], 'ahmad.fauzi@company.com') === true, 'Has mechanic role');
    assert(hasRole(['supervisor', 'superintendent'], 'maman.suryadi@company.com') === true, 'Has approver role');
    assert(hasRole(['mechanic'], 'maman.suryadi@company.com') === false, 'Not mechanic');
  });
  
  // Test helpers
  Log.section('Helpers');
  tryTest('userExists', function() {
    assert(userExists('ahmad.fauzi@company.com') === true, 'Existing user');
    assert(userExists('notexist@company.com') === false, 'Non-existent');
  });
  
  tryTest('isUserActive', function() {
    assert(isUserActive('ahmad.fauzi@company.com') === true, 'Ahmad active');
  });
  
  tryTest('getUserDisplayName', function() {
    assert(getUserDisplayName('ahmad.fauzi@company.com') === 'Ahmad Fauzi', 'Display name');
  });
  
  tryTest('getMechanicIdFromEmail', function() {
    assert(getMechanicIdFromEmail('ahmad.fauzi@company.com') === 'MECH-001', 'Mechanic ID lookup');
  });
  
  tryTest('getEmailFromMechanicId', function() {
    assert(getEmailFromMechanicId('MECH-001') === 'ahmad.fauzi@company.com', 'Email lookup');
  });
  
  // Test authorization
  Log.section('Authorization');
  tryTest('checkAuthorization', function() {
    // Current user (whoever is running) - just verify response structure
    var result = checkAuthorization([ROLES.MECHANIC, ROLES.SUPERVISOR, ROLES.SUPERINTENDENT]);
    assert(result && typeof result.success === 'boolean', 'checkAuthorization returns response');
  });
  
  // Current user info
  Log.section('Current User');
  logCurrentUserInfo();
  
  // List all users
  Log.section('All Users');
  var allUsers = getAllUsersWithRoles();
  Log.info('test', 'Total users: ' + allUsers.length);
  
  // Summary
  Log.separator('Test Results');
  Log.info('test', '✅ Passed: ' + passed + ' | ❌ Failed: ' + failed);
  if (failed === 0) Log.info('test', '🎉 All tests passed!');
}

// ═══ FASE 1.5: SCOPE CLUSTER PER USER ═══════════════════════════════════════
/**
 * Scope cluster user dari Config_Mechanics.section.
 * Approver boleh daftar koma ("field,tyreman"). Kosong/tidak ada = null = SEMUA (HO).
 */
function getUserSectionScope(email) {
  try {
    if (!email) return null;
    var rows = queryRows(SHEETS.CONFIG_MECHANICS, function(m) {
      return String(m.email || '').toLowerCase() === String(email).toLowerCase();
    });
    if (!rows.length) return null;
    var raw = String(rows[0].section || '').trim();
    if (!raw) return null;
    var parts = raw.split(',');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim().toLowerCase();
      if (p) out.push(p);
    }
    return out.length ? out : null;
  } catch (e) {
    Log.exception('getUserSectionScope', e);
    return null;
  }
}

/** true bila scope (null=semua) mengizinkan section. WO lama tanpa section = boleh. */
function userScopeAllows(scope, section) {
  if (!scope) return true;
  var s = String(section || '').toLowerCase();
  if (!s) return true;
  return scope.indexOf(s) !== -1;
}