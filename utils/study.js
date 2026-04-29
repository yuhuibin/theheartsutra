const sutraData = require('../data/sutra-lines');
const lessonData = require('../data/daily-lessons');
const { formatDateTime } = require('./date');
const {
  getAppMeta,
  setAppMeta,
  getPlanState,
  setPlanState,
  getDailyRecords,
  setDailyRecords
} = require('./storage');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const IGNORABLE_COPY_CHARS = new Set([
  '，', '。', '；', '：', '、', '！', '？',
  '（', '）', '《', '》', '“', '”', '‘', '’',
  ',', '.', ';', ':', '!', '?', '(', ')', '[', ']', '{', '}', '<', '>', '"', "'",
  ' ', '\n', '\r', '\t', '　'
]);

function isIgnorableCopyChar(char) {
  return IGNORABLE_COPY_CHARS.has(char);
}

function getComparableChars(text) {
  return (text || '').split('').filter((char) => !isIgnorableCopyChar(char));
}

function isCopiedTextMatched(sourceText, copiedText) {
  const sourceChars = getComparableChars(sourceText);
  const copiedChars = getComparableChars(copiedText);

  return sourceChars.length === copiedChars.length && sourceChars.every((char, index) => char === copiedChars[index]);
}

function getLessons() {
  return lessonData.lessons || [];
}

function getSutraLines() {
  return sutraData.lines || [];
}

function getEmptyMeta() {
  return {
    initializedAt: '',
    dataVersion: lessonData.version,
    lastCompletedLessonSequence: 0
  };
}

function getEmptyPlanState() {
  return {
    currentSequence: 1,
    lastAssignedDate: ''
  };
}

function ensureInitialized() {
  let meta = getAppMeta();
  if (!meta || !meta.initializedAt) {
    meta = {
      ...getEmptyMeta(),
      initializedAt: formatDateTime(new Date())
    };
    setAppMeta(meta);
  }

  let planState = getPlanState();
  if (!planState || !planState.currentSequence) {
    planState = getEmptyPlanState();
    setPlanState(planState);
  }

  return {
    meta,
    planState
  };
}

function getLessonBySequence(sequence) {
  const lessons = getLessons();
  if (!lessons.length) {
    return null;
  }

  const normalizedSequence = Math.min(Math.max(sequence, 1), lessons.length);
  return clone(lessons[normalizedSequence - 1]);
}

function getAssignedSequence(meta) {
  const lessons = getLessons();
  if (!lessons.length) {
    return 1;
  }

  const nextSequence = (meta.lastCompletedLessonSequence || 0) + 1;
  return Math.min(nextSequence, lessons.length);
}

function buildCopyEntries() {
  return getSutraLines().map((line) => ({
    lineId: line.id,
    sourceText: line.text,
    copiedText: '',
    updatedAt: ''
  }));
}

function reconcileCopyEntries(copyEntries) {
  const existingMap = (copyEntries || []).reduce((result, item) => {
    result[item.lineId] = item;
    return result;
  }, {});

  return getSutraLines().map((line) => {
    const existing = existingMap[line.id];

    if (existing) {
      return {
        ...existing,
        sourceText: line.text
      };
    }

    return {
      lineId: line.id,
      sourceText: line.text,
      copiedText: '',
      updatedAt: ''
    };
  });
}

function getCompletedLineCount(copyEntries) {
  return copyEntries.filter((item) => isCopiedTextMatched(item.sourceText, item.copiedText)).length;
}

function mergeCopiedText(copyEntries) {
  return copyEntries
    .map((item) => (item.copiedText || '').trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeRecord(record) {
  const copyEntries = reconcileCopyEntries(clone(record.copyEntries || []));
  const completedLineCount = getCompletedLineCount(copyEntries);

  return {
    ...record,
    copyEntries,
    totalLineCount: getSutraLines().length,
    completedLineCount,
    mergedText: mergeCopiedText(copyEntries)
  };
}

function persistRecord(record) {
  const nextRecord = normalizeRecord(record);
  const records = getDailyRecords();
  records[nextRecord.date] = nextRecord;
  setDailyRecords(records);
  return nextRecord;
}

function createDailyRecord(dateString) {
  const { meta } = ensureInitialized();
  const lessonSequence = getAssignedSequence(meta);
  const lesson = getLessonBySequence(lessonSequence);
  const now = formatDateTime(new Date());

  const record = {
    date: dateString,
    lessonId: lesson ? lesson.id : '',
    lessonSequence,
    lessonSnapshot: lesson,
    copyEntries: buildCopyEntries(),
    mergedText: '',
    completedLineCount: 0,
    totalLineCount: getSutraLines().length,
    status: 'in_progress',
    createdAt: now,
    updatedAt: now,
    completedAt: ''
  };

  setPlanState({
    currentSequence: lessonSequence,
    lastAssignedDate: dateString
  });

  return persistRecord(record);
}

function getOrCreateDailyRecord(dateString) {
  ensureInitialized();
  const records = getDailyRecords();
  if (records[dateString]) {
    return normalizeRecord(records[dateString]);
  }
  return createDailyRecord(dateString);
}

function updateDailyCopyEntry(dateString, lineId, copiedText) {
  const record = clone(getOrCreateDailyRecord(dateString));
  if (record.status === 'completed') {
    return record;
  }

  const target = record.copyEntries.find((item) => item.lineId === lineId);
  if (!target) {
    return record;
  }

  target.copiedText = copiedText;
  target.updatedAt = formatDateTime(new Date());
  record.updatedAt = formatDateTime(new Date());

  return persistRecord(record);
}

function completeDailyRecord(dateString) {
  const record = clone(getOrCreateDailyRecord(dateString));
  const normalizedRecord = normalizeRecord(record);

  if (!normalizedRecord.totalLineCount || normalizedRecord.completedLineCount < normalizedRecord.totalLineCount) {
    return {
      ok: false,
      message: '请先完成全部抄写'
    };
  }

  const now = formatDateTime(new Date());
  normalizedRecord.status = 'completed';
  normalizedRecord.completedAt = normalizedRecord.completedAt || now;
  normalizedRecord.updatedAt = now;

  const savedRecord = persistRecord(normalizedRecord);
  const { meta } = ensureInitialized();
  const lastCompletedLessonSequence = Math.max(meta.lastCompletedLessonSequence || 0, savedRecord.lessonSequence || 0);

  setAppMeta({
    ...meta,
    lastCompletedLessonSequence
  });

  return {
    ok: true,
    record: savedRecord
  };
}

function resetDailyRecord(dateString) {
  const record = clone(getOrCreateDailyRecord(dateString));
  const now = formatDateTime(new Date());
  const nextRecord = {
    ...record,
    copyEntries: reconcileCopyEntries(record.copyEntries).map((item) => ({
      ...item,
      copiedText: '',
      updatedAt: ''
    })),
    mergedText: '',
    completedLineCount: 0,
    totalLineCount: getSutraLines().length,
    status: 'in_progress',
    updatedAt: now,
    completedAt: ''
  };

  return persistRecord(nextRecord);
}

function getHistoryRecords() {
  const records = Object.values(getDailyRecords()).map((record) => normalizeRecord(record));
  return records.sort((left, right) => right.date.localeCompare(left.date));
}

function getRecordByDate(dateString) {
  const records = getDailyRecords();
  if (!records[dateString]) {
    return null;
  }
  return normalizeRecord(records[dateString]);
}

module.exports = {
  getOrCreateDailyRecord,
  updateDailyCopyEntry,
  completeDailyRecord,
  resetDailyRecord,
  getHistoryRecords,
  getRecordByDate,
  getSutraLines,
  getLessons,
  isIgnorableCopyChar,
  getComparableChars,
  isCopiedTextMatched,
  getSutraTitle: () => sutraData.title
};
