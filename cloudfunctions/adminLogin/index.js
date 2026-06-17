const cloud = require('wx-server-sdk');
const { createSalt, getSettings, hashPassword } = require('./common/admin');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const { password, setupToken } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!password || password.length < 6) {
    throw new Error('管理员密码至少需要 6 位');
  }

  const settings = await getSettings(db);
  if (!settings) {
    return setupFirstAdmin({ openid, password, setupToken });
  }

  const passwordHash = hashPassword(password, settings.salt);
  if (passwordHash !== settings.passwordHash) {
    throw new Error('管理员密码错误');
  }

  const found = await db.collection('users').where({ openid }).limit(1).get();
  if (!found.data.length || found.data[0].role !== 'admin') {
    throw new Error('当前微信未绑定管理员权限');
  }

  const now = new Date();
  await db.collection('users').doc(found.data[0]._id).update({
    data: {
      updatedAt: now
    }
  });

  await db.collection('admin_logs').add({
    data: {
      action: 'admin_login',
      openid,
      createdAt: now
    }
  });

  return {
    ok: true,
    firstSetup: false,
    role: 'admin'
  };
};

async function setupFirstAdmin({ openid, password, setupToken }) {
  const expectedToken = process.env.ADMIN_SETUP_TOKEN || '';
  if (expectedToken && setupToken !== expectedToken) {
    throw new Error('首次初始化令牌错误');
  }

  const salt = createSalt();
  const passwordHash = hashPassword(password, salt);
  const now = new Date();

  await db.collection('settings').add({
    data: {
      key: 'admin',
      salt,
      passwordHash,
      createdBy: openid,
      createdAt: now,
      updatedAt: now
    }
  });

  await db.collection('users').add({
    data: {
      openid,
      role: 'admin',
      name: '初始管理员',
      className: '',
      visibleBanks: 0,
      wrongCount: 0,
      createdAt: now,
      updatedAt: now
    }
  });

  await db.collection('admin_logs').add({
    data: {
      action: 'admin_first_setup',
      openid,
      createdAt: now
    }
  });

  return {
    ok: true,
    firstSetup: true,
    role: 'admin'
  };
}
