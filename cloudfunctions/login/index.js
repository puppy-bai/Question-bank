const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const name = normalizeText(event.name);
  const phone = normalizePhone(event.phone);
  const shouldSaveProfile = !!(name || phone);

  const found = await db.collection('users').where({ openid }).limit(1).get();
  if (found.data.length) {
    if (shouldSaveProfile) {
      if (!name) throw new Error('请输入姓名');
      if (!isValidPhone(phone)) throw new Error('请输入正确的手机号');
      await db.collection('users').doc(found.data[0]._id).update({
        data: {
          name,
          phone,
          registered: true,
          updatedAt: new Date()
        }
      });
      return {
        openid,
        user: {
          ...found.data[0],
          name,
          phone,
          registered: true
        }
      };
    }

    return {
      openid,
      user: {
        ...found.data[0],
        registered: !!(found.data[0].name && found.data[0].phone)
      }
    };
  }

  if (shouldSaveProfile && (!name || !isValidPhone(phone))) {
    throw new Error(!name ? '请输入姓名' : '请输入正确的手机号');
  }

  const now = new Date();
  const user = {
    openid,
    role: 'user',
    name,
    phone,
    registered: !!(name && phone),
    visibleBanks: 0,
    wrongCount: 0,
    createdAt: now,
    updatedAt: now
  };

  const inserted = await db.collection('users').add({ data: user });

  return {
    openid,
    user: {
      _id: inserted._id,
      ...user
    }
  };
};

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizePhone(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function isValidPhone(value) {
  return /^1\d{10}$/.test(value);
}
