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

  // ----- 수업 기록 보관함 (수업마다 따로 저장) -----
  if (op === 'archives' || op === 'archiveGet' || op === 'archiveDel' || op === 'archive') {
    if (String(a.pw) !== String(TEACHER_PW)) throw new Error('비밀번호가 달라요');
    var idx = JSON.parse(props.getProperty('AIDX') || '[]');
    if (op === 'archives') return JSON.stringify({ list: idx });
    if (op === 'archiveGet') return props.getProperty('A_' + a.id) || JSON.stringify({ missing: true });
    if (op === 'archiveDel') {
      props.deleteProperty('A_' + a.id);
      idx = idx.filter(function (x) { return String(x.id) !== String(a.id); });
      props.setProperty('AIDX', JSON.stringify(idx));
      return JSON.stringify({ list: idx });
    }
    // archive: 지금 수업을 이름 붙여 저장 (진행 중인 찜은 빼고 결과만)
    var cur = load(), teams = {};
    Object.keys(cur.teams).forEach(function (k) {
      var c = cur.teams[k].chart || {}, out = {};
      Object.keys(c).forEach(function (key) {
        if (/^c_/.test(key)) { if (String(c[key]).charAt(0) === '=') out[key] = c[key]; }
        else if (c[key] == 1 || c[key] == 2) out[key] = c[key];
      });
      teams[k] = { chart: out, done: !!cur.teams[k].done };
    });
    var id = String(new Date().getTime());
    var snap = { id: id, label: String(a.label || '수업 기록').slice(0, 40), at: new Date().toISOString(), students: cur.students, teams: teams };
    var bytes = function (t) { return Utilities.newBlob(t).getBytes().length; };   // 저장 칸 하나는 9KB까지
    var txt = JSON.stringify(snap);
    if (bytes(txt) > 8800) throw new Error('기록이 너무 커서 저장하지 못했어요. 학생 수를 확인해 주세요.');
    idx.unshift({ id: id, label: snap.label, at: snap.at.slice(0, 16), teams: Object.keys(teams).length, students: Object.keys(cur.students).length });
    var idxTxt = JSON.stringify(idx);
    if (bytes(idxTxt) > 8800) throw new Error('보관함이 가득 찼어요. 오래된 기록을 몇 개 지운 뒤 다시 저장해 주세요.');
    props.setProperty('A_' + id, txt);
    props.setProperty('AIDX', idxTxt);
    return JSON.stringify({ list: idx, saved: id });
  }

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
    } else if (op === 'reveal') {
      checkTeacher(); s.reveal = !!a.on;          // 학생 화면에 정답 공개 / 숨기기
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
