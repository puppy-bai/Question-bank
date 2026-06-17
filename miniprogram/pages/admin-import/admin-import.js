const IMPORT_BATCH_SIZE = 50;

Page({
  data: {
    preview: null,
    loading: false,
    confirming: false,
    statusText: '',
    bankName: '',
    fileID: ''
  },

  chooseWord() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['docx'],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        await this.uploadAndParse(file);
      }
    });
  },

  async uploadAndParse(file) {
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云开发', icon: 'none' });
      return;
    }

    this.setData({ loading: true, preview: null, statusText: '正在准备上传文件...' });

    try {
      const uploadFilePath = await prepareUploadFile(file);
      const upload = await uploadWordWithRetry(uploadFilePath, (attempt) => {
        this.setData({ statusText: `正在上传 Word 文件（第 ${attempt} 次）...` });
      });

      this.setData({ statusText: '文件上传完成，正在解析题目...' });
      const result = await callFunctionWithRetry({
        name: 'parseWord',
        data: {
          fileID: upload.fileID
        },
        onRetry: (attempt) => {
          this.setData({ statusText: `云端解析连接失败，正在重试（第 ${attempt} 次）...` });
        }
      });

      const preview = normalizePreview(result.result);
      this.setData({
        preview,
        fileID: upload.fileID
      });
      wx.showToast({
        title: preview.totalQuestions ? '解析完成' : '解析异常',
        icon: preview.totalQuestions ? 'success' : 'none'
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: formatImportError(error), icon: 'none' });
    } finally {
      this.setData({ loading: false, statusText: '' });
    }
  },

  onBankNameInput(event) {
    this.setData({ bankName: event.detail.value });
  },

  async confirmImport() {
    const { preview, bankName, fileID } = this.data;
    const allQuestions = preview && Array.isArray(preview.allQuestions) ? preview.allQuestions : [];

    if (!preview || !preview.totalQuestions || !allQuestions.length) {
      wx.showToast({ title: '没有可导入的题目', icon: 'none' });
      return;
    }

    if (preview.errors && preview.errors.length) {
      wx.showToast({ title: '存在解析错误，请先修正', icon: 'none' });
      return;
    }

    if (!bankName.trim()) {
      wx.showToast({ title: '请输入题库名称', icon: 'none' });
      return;
    }

    this.setData({ confirming: true, statusText: '正在创建题库...' });

    try {
      const chapterNames = Array.from(new Set(allQuestions.map((item) => item.chapter || '默认章节')));
      const created = await callFunctionWithRetry({
        name: 'confirmImport',
        data: {
          mode: 'createBank',
          bankName,
          fileID,
          chapterNames,
          totalQuestions: allQuestions.length,
          warningCount: preview.warningCount || 0,
          errorCount: preview.errors.length
        },
        onRetry: (attempt) => {
          this.setData({ statusText: `创建题库连接失败，正在重试（第 ${attempt} 次）...` });
        }
      });

      const { bankId, importJobId, chapterIds } = created.result;
      let importedCount = 0;
      for (let index = 0; index < allQuestions.length; index += IMPORT_BATCH_SIZE) {
        const batch = allQuestions.slice(index, index + IMPORT_BATCH_SIZE);
        const batchNo = Math.floor(index / IMPORT_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(allQuestions.length / IMPORT_BATCH_SIZE);
        this.setData({
          statusText: `正在导入第 ${batchNo}/${totalBatches} 批，已导入 ${importedCount} 题...`
        });

        const imported = await callFunctionWithRetry({
          name: 'confirmImport',
          data: {
            mode: 'importBatch',
            bankId,
            chapterIds,
            questions: batch,
            batchIndex: batchNo - 1,
            startIndex: index,
            progressCount: index + batch.length
          },
          onRetry: (attempt) => {
            this.setData({
              statusText: `第 ${batchNo}/${totalBatches} 批连接失败，正在重试（第 ${attempt} 次）...`
            });
          }
        });
        importedCount += imported.result.importedCount || batch.length;
      }

      await callFunctionWithRetry({
        name: 'confirmImport',
        data: {
          mode: 'finishImport',
          bankId,
          importJobId,
          questionCount: importedCount
        },
        onRetry: (attempt) => {
          this.setData({ statusText: `完成导入连接失败，正在重试（第 ${attempt} 次）...` });
        }
      });

      wx.showToast({ title: `导入 ${importedCount} 题`, icon: 'success' });
      this.setData({ preview: null, bankName: '', fileID: '', statusText: '' });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '导入失败', icon: 'none' });
    } finally {
      this.setData({ confirming: false, statusText: '' });
    }
  }
});

function makeAsciiImportName() {
  return `questions-${Date.now()}-${Math.floor(Math.random() * 100000)}.docx`;
}

function prepareUploadFile(file) {
  const sourcePath = file.path || file.tempFilePath;
  if (!sourcePath) {
    return Promise.reject(new Error('没有获取到 Word 文件路径'));
  }

  const fs = wx.getFileSystemManager && wx.getFileSystemManager();
  if (!fs || !wx.env || !wx.env.USER_DATA_PATH) {
    return Promise.resolve(sourcePath);
  }

  const targetPath = `${wx.env.USER_DATA_PATH}/${makeAsciiImportName()}`;
  return new Promise((resolve) => {
    fs.copyFile({
      srcPath: sourcePath,
      destPath: targetPath,
      success: () => resolve(targetPath),
      fail: () => resolve(sourcePath)
    });
  });
}

function uploadWordWithRetry(filePath, onAttempt) {
  const maxAttempts = 3;

  return new Promise((resolve, reject) => {
    const run = (attempt) => {
      if (onAttempt) onAttempt(attempt);

      wx.cloud.uploadFile({
        cloudPath: `imports/${makeAsciiImportName()}`,
        filePath,
        success: resolve,
        fail: (error) => {
          const message = (error && (error.errMsg || error.message)) || '';
          const canRetry = attempt < maxAttempts && /ECONNRESET|timeout|fail/i.test(message);
          if (canRetry) {
            setTimeout(() => run(attempt + 1), 800 * attempt);
            return;
          }
          reject(error);
        }
      });
    };

    run(1);
  });
}

function callFunctionWithRetry(options) {
  const maxAttempts = 4;
  const { onRetry, ...callOptions } = options;

  return new Promise((resolve, reject) => {
    const run = (attempt) => {
      wx.cloud.callFunction({
        ...callOptions,
        success: resolve,
        fail: (error) => {
          const canRetry = attempt < maxAttempts && isRetryableCloudError(error);
          if (canRetry) {
            if (onRetry) onRetry(attempt + 1, error);
            setTimeout(() => run(attempt + 1), 1000 * attempt);
            return;
          }
          reject(error);
        }
      });
    };

    run(1);
  });
}

function isRetryableCloudError(error) {
  const message = (error && (error.errMsg || error.message)) || '';
  return /Failed to fetch|ECONNRESET|timeout|network/i.test(message);
}

function formatImportError(error) {
  const message = (error && (error.errMsg || error.message)) || '';
  if (/uploadFile:fail|ECONNRESET/i.test(message)) {
    return '上传失败，请检查网络后重试';
  }
  if (/Failed to fetch|webapi_getwxaasyncsecinfo/i.test(message)) {
    return '云开发连接失败，请重启开发者工具或检查网络';
  }
  if (/FUNCTIONS_TIME_LIMIT_EXCEEDED|timed out after 3 seconds|timeout/i.test(message)) {
    return '云函数超时，已改为分批导入，请重新编译后再试';
  }
  return error.message || '解析失败';
}

function normalizePreview(payload = {}) {
  const allQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  const previewQuestions = Array.isArray(payload.previewQuestions)
    ? payload.previewQuestions
    : allQuestions.slice(0, 30);
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  const totalQuestions = Number(payload.totalQuestions || allQuestions.length || previewQuestions.length || 0);

  return {
    ...payload,
    ok: payload.ok !== false,
    importJobId: '',
    parserVersion: payload.parserVersion || 'unknown',
    paragraphCount: Number(payload.paragraphCount || 0),
    totalQuestions,
    questions: previewQuestions,
    allQuestions,
    warnings,
    warningCount: Number(payload.warningCount || warnings.length || 0),
    errors,
    firstParagraphs: Array.isArray(payload.firstParagraphs) ? payload.firstParagraphs : []
  };
}
