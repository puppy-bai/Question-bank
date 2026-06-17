const cloud = require('wx-server-sdk');
const { assertAdmin } = require('./common/admin');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const adminOpenid = wxContext.OPENID;
  await assertAdmin(db, adminOpenid);

  const action = event.action || 'overview';

  if (action === 'overview') {
    return getOverview();
  }

  if (action === 'saveClass') {
    return saveClass(event, adminOpenid);
  }

  if (action === 'saveUser') {
    return saveUser(event, adminOpenid);
  }

  if (action === 'setStudentClass') {
    return setStudentClass(event, adminOpenid);
  }

  if (action === 'setTeacherClasses') {
    return setTeacherClasses(event, adminOpenid);
  }

  throw new Error('未知管理操作');
};

async function getOverview() {
  const [classResult, userResult, studentRelationResult, teacherRelationResult] = await Promise.all([
    db.collection('classes').where({ status: 'active' }).orderBy('name', 'asc').limit(100).get(),
    db.collection('users').orderBy('updatedAt', 'desc').limit(200).get(),
    db.collection('student_classes').limit(500).get(),
    db.collection('teacher_classes').limit(500).get()
  ]);

  const classMap = toClassMap(classResult.data);
  const studentClassMap = {};
  const teacherClassMap = {};

  studentRelationResult.data.forEach((relation) => {
    studentClassMap[relation.studentOpenid] = relation.classId;
  });

  teacherRelationResult.data.forEach((relation) => {
    if (!teacherClassMap[relation.teacherOpenid]) {
      teacherClassMap[relation.teacherOpenid] = [];
    }
    teacherClassMap[relation.teacherOpenid].push(relation.classId);
  });

  const classes = classResult.data.map((item) => ({
    id: item._id,
    name: item.name,
    grade: item.grade || '',
    remark: item.remark || '',
    studentCount: studentRelationResult.data.filter((relation) => relation.classId === item._id).length,
    teacherCount: teacherRelationResult.data.filter((relation) => relation.classId === item._id).length
  }));

  const users = userResult.data.map((user) => {
    const studentClassId = studentClassMap[user.openid] || '';
    const teacherClassIds = teacherClassMap[user.openid] || [];
    return {
      id: user._id,
      openid: user.openid,
      name: user.name || '',
      role: user.role || 'student',
      className: user.className || '',
      studentClassId,
      studentClassName: classMap[studentClassId] ? classMap[studentClassId].name : '',
      teacherClassIds,
      teacherClassNames: teacherClassIds
        .map((classId) => classMap[classId] && classMap[classId].name)
        .filter(Boolean)
    };
  });

  return {
    ok: true,
    classes,
    users,
    summary: {
      classCount: classes.length,
      studentCount: users.filter((user) => user.role === 'student').length,
      teacherCount: users.filter((user) => user.role === 'teacher').length,
      adminCount: users.filter((user) => user.role === 'admin').length
    }
  };
}

async function saveClass(event, adminOpenid) {
  const name = normalizeText(event.name);
  if (!name) {
    throw new Error('请填写班级名称');
  }

  const now = new Date();
  const data = {
    name,
    grade: normalizeText(event.grade),
    remark: normalizeText(event.remark),
    status: 'active',
    updatedBy: adminOpenid,
    updatedAt: now
  };

  if (event.classId) {
    await db.collection('classes').doc(event.classId).update({ data });
    await refreshClassNameForStudents(event.classId, name);
    await writeAdminLog('save_class', adminOpenid, { classId: event.classId, name });
    return { ok: true, classId: event.classId };
  }

  const inserted = await db.collection('classes').add({
    data: {
      ...data,
      createdBy: adminOpenid,
      createdAt: now
    }
  });

  await writeAdminLog('create_class', adminOpenid, { classId: inserted._id, name });
  return { ok: true, classId: inserted._id };
}

async function saveUser(event, adminOpenid) {
  const openid = normalizeText(event.openid);
  const role = normalizeRole(event.role);
  const name = normalizeText(event.name);

  if (!openid) {
    throw new Error('请填写用户 OpenID');
  }

  if (openid === adminOpenid && role !== 'admin') {
    throw new Error('不能把当前登录管理员改成非管理员');
  }

  const now = new Date();
  const found = await db.collection('users').where({ openid }).limit(1).get();
  const userData = {
    openid,
    role,
    name,
    updatedBy: adminOpenid,
    updatedAt: now
  };

  if (found.data.length) {
    await db.collection('users').doc(found.data[0]._id).update({ data: userData });
  } else {
    await db.collection('users').add({
      data: {
        ...userData,
        className: '',
        visibleBanks: 0,
        wrongCount: 0,
        createdBy: adminOpenid,
        createdAt: now
      }
    });
  }

  if (role !== 'student') {
    await db.collection('student_classes').where({ studentOpenid: openid }).remove();
    await updateUserClassName(openid, '');
  }

  if (role !== 'teacher') {
    await db.collection('teacher_classes').where({ teacherOpenid: openid }).remove();
  }

  await writeAdminLog('save_user', adminOpenid, { openid, role });
  return { ok: true, openid };
}

async function setStudentClass(event, adminOpenid) {
  const studentOpenid = normalizeText(event.studentOpenid);
  const classId = normalizeText(event.classId);
  if (!studentOpenid) {
    throw new Error('缺少学生 OpenID');
  }

  const student = await getUserByOpenid(studentOpenid);
  if (!student || student.role !== 'student') {
    throw new Error('只能给学生账号分班');
  }

  await db.collection('student_classes').where({ studentOpenid }).remove();

  if (!classId) {
    await updateUserClassName(studentOpenid, '');
    await writeAdminLog('clear_student_class', adminOpenid, { studentOpenid });
    return { ok: true };
  }

  const klass = await getClassById(classId);
  const now = new Date();
  await db.collection('student_classes').add({
    data: {
      studentOpenid,
      classId,
      createdBy: adminOpenid,
      createdAt: now,
      updatedAt: now
    }
  });

  await updateUserClassName(studentOpenid, klass.name);
  await writeAdminLog('set_student_class', adminOpenid, { studentOpenid, classId });
  return { ok: true };
}

async function setTeacherClasses(event, adminOpenid) {
  const teacherOpenid = normalizeText(event.teacherOpenid);
  const classIds = Array.isArray(event.classIds)
    ? Array.from(new Set(event.classIds.map(normalizeText).filter(Boolean)))
    : [];

  if (!teacherOpenid) {
    throw new Error('缺少老师 OpenID');
  }

  const teacher = await getUserByOpenid(teacherOpenid);
  if (!teacher || teacher.role !== 'teacher') {
    throw new Error('只能给老师账号分配负责班级');
  }

  const classes = await getClassesByIds(classIds);
  if (classes.length !== classIds.length) {
    throw new Error('存在无效班级');
  }

  await db.collection('teacher_classes').where({ teacherOpenid }).remove();

  const now = new Date();
  for (const classId of classIds) {
    await db.collection('teacher_classes').add({
      data: {
        teacherOpenid,
        classId,
        createdBy: adminOpenid,
        createdAt: now,
        updatedAt: now
      }
    });
  }

  await writeAdminLog('set_teacher_classes', adminOpenid, { teacherOpenid, classIds });
  return { ok: true };
}

async function getUserByOpenid(openid) {
  const found = await db.collection('users').where({ openid }).limit(1).get();
  return found.data[0] || null;
}

async function getClassById(classId) {
  const found = await db.collection('classes').doc(classId).get();
  if (!found.data || found.data.status !== 'active') {
    throw new Error('班级不存在');
  }
  return found.data;
}

async function getClassesByIds(classIds) {
  if (!classIds.length) return [];
  const classes = [];
  for (const classId of classIds) {
    classes.push(await getClassById(classId));
  }
  return classes;
}

async function updateUserClassName(openid, className) {
  const found = await db.collection('users').where({ openid }).limit(1).get();
  if (!found.data.length) return;
  await db.collection('users').doc(found.data[0]._id).update({
    data: {
      className,
      updatedAt: new Date()
    }
  });
}

async function refreshClassNameForStudents(classId, className) {
  const relations = await db.collection('student_classes').where({ classId }).limit(500).get();
  for (const relation of relations.data) {
    await updateUserClassName(relation.studentOpenid, className);
  }
}

async function writeAdminLog(action, openid, detail) {
  await db.collection('admin_logs').add({
    data: {
      action,
      openid,
      detail,
      createdAt: new Date()
    }
  });
}

function toClassMap(classes) {
  return classes.reduce((map, item) => {
    map[item._id] = item;
    return map;
  }, {});
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeRole(value) {
  if (['student', 'teacher', 'admin'].includes(value)) {
    return value;
  }
  throw new Error('账号角色不正确');
}
