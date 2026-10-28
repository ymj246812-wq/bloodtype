// =====================================================================
//  수혈 관계 탐구 - 저장 서버 (구글 앱스크립트)
//  화면은 Vercel 사이트가 보여 주고, 이 코드는 이름·모둠·관계도 저장만 합니다.
// =====================================================================

// ★ 교사용 비밀번호: 원하는 것으로 바꾸세요 (따옴표는 지우지 마세요)
var TEACHER_PW = '1234';

// 주소로 직접 들어오면 서버가 켜져 있는지만 알려 줍니다.
function doGet() {
  return ContentService.createTextOutput('수혈 관계 탐구 저장 서버가 작동 중입니다 ✔');
}

// Vercel 화면이 보내는 요청을 처리합니다.
function doPost(e) {
  var out;
  try {
    var body = JSON.parse(e.postData.contents);
    out = { ok: true, data: api(body.op, JSON.stringify(body.arg || {})) };
  } catch (err) {
    out = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

// 처음 한 번 편집기에서 실행해서 권한을 승인하세요.
function test() {
  Logger.log(api('state', '{}'));
}

function api(op, argJson) {
  var a = JSON.parse(argJson || '{}');
  if (op === 'ping') return JSON.stringify({ ok: true });

  var props = PropertiesService.getScriptProperties();
  var load = function () { return JSON.parse(props.getProperty('S') || '{"students":{},"teams":{}}'); };

  // 읽기(state)는 잠금 없이 빠르게 처리합니다.
  if (op === 'state') return JSON.stringify(load());

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('사용자가 많아요. 잠시 후 다시 눌러 주세요.');
  try {
    var s = load();
    var save = true;

    function checkTeacher() {
      if (String(a.pw) !== String(TEACHER_PW)) throw new Error('비밀번호가 달라요');
    }
    function myTeam() {
      var st = s.students[a.name];
      if (!st || !st.team) return null;
      if (!s.teams[st.team]) s.teams[st.team] = { chart: {}, done: false };
      return s.teams[st.team];
    }

    if (op === 'join') {
      if (!a.name) throw new Error('이름을 입력하세요');
      if (!s.students[a.name]) s.students[a.name] = { team: '' };
    } else if (op === 'assign') {
      checkTeacher();
      if (s.students[a.name]) s.students[a.name].team = a.team;
    } else if (op === 'auto') {
      checkTeacher();
      var names = Object.keys(s.students).sort(function () { return Math.random() - 0.5; });
      names.forEach(function (n, i) { s.students[n].team = String(Math.floor(i / 4) + 1); });
    } else if (op === 'cell') {
      var t = myTeam();
      if (t) { t.chart[a.key] = a.val; t.done = false; }
    } else if (op === 'submit') {
      var t2 = myTeam();
      if (t2) t2.done = true;
    } else if (op === 'teacher') {
      checkTeacher(); save = false;
    } else if (op === 'reset') {
      checkTeacher(); s = { students: {}, teams: {} };
    } else {
      save = false;
    }

    if (save) props.setProperty('S', JSON.stringify(s));
    return JSON.stringify(s);
  } finally {
    lock.releaseLock();
  }
}
