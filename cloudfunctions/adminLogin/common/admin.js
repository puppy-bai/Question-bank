const crypto = require('crypto');

async function getSettings(db) {
  const found = await db.collection('settings').where({ key: 'admin' }).limit(1).get();
  return found.data[0] || null;
}

async function getAdminUser(db, openid) {
  const found = await db.collection('users').where({ openid, role: 'admin' }).limit(1).get();
  return found.data[0] || null;
}

async function assertAdmin(db, openid) {
  const user = await getAdminUser(db, openid);
  if (!user) {
    throw new Error('无管理员权限');
  }
  return user;
}

function hashPassword(password, salt) {
  return crypto
    .createHash('sha256')
    .update(`${salt}:${password}`)
    .digest('hex');
}

function createSalt() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = {
  assertAdmin,
  createSalt,
  getAdminUser,
  getSettings,
  hashPassword
};
