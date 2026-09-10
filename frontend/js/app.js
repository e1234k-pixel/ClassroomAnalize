/* ═══ Classroom Hub — App Logic ═══ */
const CLIENT_ID = '1043421437059-of9k7vt7hft5lf9vb1ffjlis3q6r4bd2.apps.googleusercontent.com';
const SCOPES = [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.rosters.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
    'https://www.googleapis.com/auth/classroom.student-submissions.students.readonly',
    'https://www.googleapis.com/auth/drive.readonly'
].join(' ');

let accessToken = null;
let courses = [], students = [], assignments = [], submissions = [];
let currentCourseId = null, currentAssignmentId = null;

/* ─── Auth ─── */
function handleGoogleLogin() {
    google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
            if (resp.access_token) {
                accessToken = resp.access_token;
                afterLogin();
            }
        }
    }).requestAccessToken();
}

async function afterLogin() {
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    try {
        const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const p = await r.json();
        document.getElementById('user-photo').src = p.picture || '';
        document.getElementById('user-name').textContent = p.name || '';
        document.getElementById('user-info').classList.remove('hidden');
        document.getElementById('user-info').classList.add('flex');
    } catch (e) { console.error(e); }
    loadCourses();
}

function handleGoogleLogout() {
    if (accessToken) google.accounts.oauth2.revoke(accessToken, () => location.reload());
    else location.reload();
}

/* ─── API helper ─── */
async function gapi(path) {
    const r = await fetch(`https://classroom.googleapis.com/v1/${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return r.json();
}

/* ─── Courses (owned by me + ACTIVE only) ─── */
async function loadCourses() {
    try {
        const data = await gapi('courses?pageSize=100&courseStates=ACTIVE&teacherId=me');
        courses = data.courses || [];
        document.getElementById('stat-courses').textContent = courses.length;
        const sel = document.getElementById('course-select');
        sel.innerHTML = '<option value="">-- เลือกวิชา --</option>';
        courses.forEach(c => {
            const o = document.createElement('option');
            o.value = c.id;
            o.textContent = c.name + (c.section ? ` (${c.section})` : '');
            sel.appendChild(o);
        });
    } catch (e) {
        console.error(e);
        toast('❌ โหลดรายวิชาไม่สำเร็จ');
    }
}

/* ─── On course change: load assignments + students ─── */
async function onCourseChange() {
    currentCourseId = document.getElementById('course-select').value;
    resetAssignmentSelect();
    if (!currentCourseId) { resetStudentSelect(); return; }

    loadStudents(currentCourseId);
    try {
        const data = await gapi(`courses/${currentCourseId}/courseWork?pageSize=100`);
        assignments = data.courseWork || [];
        const sel = document.getElementById('assignment-select');
        sel.innerHTML = '<option value="">-- เลือกงาน --</option>';
        assignments.forEach(w => {
            const o = document.createElement('option');
            o.value = w.id;
            o.textContent = w.title + (w.maxPoints ? ` (${w.maxPoints} คะแนน)` : '');
            sel.appendChild(o);
        });
        if (!assignments.length) sel.innerHTML = '<option value="">ไม่มีงานในวิชานี้</option>';
    } catch (e) {
        console.error(e);
        document.getElementById('assignment-select').innerHTML = '<option value="">โหลดไม่สำเร็จ</option>';
    }
}

async function loadStudents(courseId) {
    try {
        const data = await gapi(`courses/${courseId}/students?pageSize=100`);
        students = data.students || [];
        document.getElementById('stat-students').textContent = students.length;
        const sel = document.getElementById('student-select');
        sel.innerHTML = '<option value="">-- เลือกนักเรียน --</option>';
        students.forEach(s => {
            const o = document.createElement('option');
            o.value = s.userId;
            o.textContent = s.profile.name.fullName;
            sel.appendChild(o);
        });
        if (!students.length) sel.innerHTML = '<option value="">ไม่มีนักเรียน</option>';
    } catch (e) {
        console.error(e);
        document.getElementById('student-select').innerHTML = '<option value="">โหลดไม่สำเร็จ</option>';
    }
}

/* ─── On assignment change: load submissions + heatmap + gradebook ─── */
async function onAssignmentChange() {
    currentAssignmentId = document.getElementById('assignment-select').value;
    if (!currentCourseId) return;
    if (!currentAssignmentId) { resetStudentSelect(); return; }

    try {
        const data = await gapi(`courses/${currentCourseId}/courseWork/${currentAssignmentId}/studentSubmissions?pageSize=100`);
        submissions = data.studentSubmissions || [];
        buildHeatmap();
        buildGradebook();
    } catch (e) {
        console.error(e);
        toast('❌ โหลดการส่งงานไม่สำเร็จ');
    }
}

/* ─── On student change: show work + info + slip ─── */
async function onStudentChange() {
    const userId = document.getElementById('student-select').value;
    const viewer = document.getElementById('work-viewer');
    const sub = submissions.find(s => s.userId === userId);

    if (!sub) {
        viewer.innerHTML = '<div class="text-center text-slate-400"><div class="text-5xl mb-3">📄</div><p>ยังไม่มีการส่งงาน หรือยังไม่ได้เลือกงาน</p></div>';
        document.getElementById('submission-state').textContent = '-';
        document.getElementById('student-score').textContent = '-';
        buildSlip(null);
        return;
    }

    // State badge
    const stateMap = { CREATED: 'ยังไม่ส่ง', TURNED_IN: 'ส่งแล้ว', RETURNED: 'คืนแล้ว', NEW: 'ใหม่', RECLAIMED_BY_STUDENT: 'นักเรียนเรียกคืน' };
    const badge = document.getElementById('submission-state');
    badge.textContent = (stateMap[sub.state] || sub.state) + (sub.late ? ' ⏰ ส่งช้า' : '');
    badge.className = 'text-xs px-2 py-1 rounded-full ' + (sub.late ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700');

    // Score
    const pts = assignments.find(a => a.id === currentAssignmentId)?.maxPoints;
    document.getElementById('student-score').textContent =
        sub.assignedGrade != null ? sub.assignedGrade : (sub.draftGrade != null ? sub.draftGrade + '*' : 'ยังไม่ให้คะแนน');

    // Attachments preview
    const materials = sub.assignmentSubmission?.attachments || [];
    if (materials.length) {
        const links = materials.map(m => {
            if (m.driveFile) {
                const fid = m.driveFile.driveFile?.id || m.driveFile.id;
                return `<iframe src="https://drive.google.com/file/d/${fid}/preview" class="w-full h-full" allow="autoplay"></iframe>`;
            }
            if (m.link) return `<a href="${m.link.url}" target="_blank" class="text-brand-600 underline">${m.link.title || m.link.url}</a>`;
            if (m.youtubeVideo) return `<a href="https://youtube.com/watch?v=${m.youtubeVideo.id}" target="_blank" class="text-brand-600 underline">${m.youtubeVideo.title}</a>`;
            return '';
        }).filter(Boolean);
        viewer.innerHTML = links.length
            ? `<div class="w-full h-full">${links[0]}</div>${links.length > 1 ? `<p class="text-xs text-slate-400 mt-2">มีไฟล์แนบอีก ${links.length - 1} ไฟล์</p>` : ''}`
            : '<div class="text-center text-slate-400">ไม่มีไฟล์แสดงตัวอย่างได้</div>';
    } else {
        viewer.innerHTML = '<div class="text-center text-slate-400"><div class="text-5xl mb-3">📭</div><p>ยังไม่มีไฟล์แนบ</p></div>';
    }

    buildSlip(sub);
}

/* ─── Pending count per student (across all assignments in this course) ─── */
async function countPendingAll(userId) {
    try {
        let pending = 0, ontime = 0;
        for (const a of assignments) {
            const data = await gapi(`courses/${currentCourseId}/courseWork/${a.id}/studentSubmissions?userId=${userId}`);
            const subs = data.studentSubmissions || [];
            subs.forEach(s => {
                if (s.state === 'CREATED' || s.state === 'NEW') pending++;
                else if (!s.late) ontime++;
            });
        }
        document.getElementById('student-pending-count').textContent = pending;
        document.getElementById('student-ontime').textContent = ontime;
    } catch (e) { console.error(e); }
}

/* ─── Heatmap ─── */
function buildHeatmap() {
    const grid = document.getElementById('heatmap-grid');
    grid.innerHTML = '';
    if (!submissions.length) {
        grid.innerHTML = '<div class="col-span-full text-center text-slate-400 py-8">ยังไม่มีข้อมูลการส่งงาน</div>';
        return;
    }
    submissions.forEach(s => {
        const st = students.find(x => x.userId === s.userId);
        const name = st ? st.profile.name.fullName : s.userId;
        const missing = s.state === 'CREATED' || s.state === 'NEW';
        const div = document.createElement('div');
        div.className = 'p-2 rounded-lg text-center text-xs font-medium cursor-pointer ' +
            (missing ? 'risk-red' : s.late ? 'risk-yellow' : 'risk-green');
        div.textContent = name.split(' ')[0];
        div.title = `${name}\nสถานะ: ${s.state}${s.late ? ' (ส่งช้า)' : ''}`;
        div.onclick = () => {
            document.getElementById('student-select').value = s.userId;
            switchTab('grading');
            onStudentChange();
        };
        grid.appendChild(div);
    });
}

/* ─── Gradebook ─── */
function buildGradebook() {
    document.getElementById('gradebook-course').textContent =
        document.getElementById('course-select').selectedOptions[0]?.textContent || '';

    const head = document.getElementById('gradebook-head');
    const body = document.getElementById('gradebook-body');
    if (!submissions.length) {
        head.innerHTML = '';
        body.innerHTML = '<tr><td class="text-center text-slate-400 py-8">เลือกงานเพื่อดูคะแนน</td></tr>';
        return;
    }

    head.innerHTML = '<th class="px-4 py-2.5 text-left">ชื่อ</th><th class="px-4 py-2.5">สถานะ</th><th class="px-4 py-2.5">คะแนน</th><th class="px-4 py-2.5">เกรด</th>';
    const scale = getGradeScale();
    body.innerHTML = submissions.map(s => {
        const st = students.find(x => x.userId === s.userId);
        const name = st ? st.profile.name.fullName : s.userId;
        const grade = s.assignedGrade ?? s.draftGrade;
        const pts = assignments.find(a => a.id === currentAssignmentId)?.maxPoints || 100;
        const pct = grade != null ? (grade / pts) * 100 : null;
        const g = pct != null ? gradeFromPct(pct, scale) : '-';
        const missing = s.state === 'CREATED' || s.state === 'NEW';
        return `<tr class="hover:bg-slate-50">
            <td class="px-4 py-2.5 font-medium text-slate-700">${name}</td>
            <td class="px-4 py-2.5 text-center">${missing ? '<span class="text-rose-600 text-xs">ยังไม่ส่ง</span>' : s.late ? '<span class="text-amber-600 text-xs">ส่งช้า</span>' : '<span class="text-emerald-600 text-xs">ส่งแล้ว</span>'}</td>
            <td class="px-4 py-2.5 text-center font-semibold">${grade != null ? grade : '-'}</td>
            <td class="px-4 py-2.5 text-center">${g !== '-' ? `<span class="bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full text-xs font-bold">${g}</span>` : '-'}</td>
        </tr>`;
    }).join('');
}

/* ─── Grade scale ─── */
function getGradeScale() {
    return [...document.querySelectorAll('#grade-scale input')].map(i => ({
        min: parseFloat(i.value), grade: parseFloat(i.dataset.grade)
    })).sort((a, b) => b.min - a.min);
}
function gradeFromPct(pct, scale) {
    for (const s of scale) if (pct >= s.min) return s.grade;
    return 0;
}
function saveGradeScale() {
    localStorage.setItem('gradeScale', JSON.stringify(getGradeScale()));
    buildGradebook();
    toast('💾 บันทึกเกณฑ์เกรดแล้ว');
}

/* ─── Student Slip ─── */
function buildSlip(sub) {
    const el = document.getElementById('slip-content');
    if (!sub) { el.textContent = 'เลือกนักเรียนเพื่อสร้าง Slip'; return; }
    const st = students.find(x => x.userId === sub.userId);
    const name = st ? st.profile.name.fullName : '-';
    const missing = sub.state === 'CREATED' || sub.state === 'NEW';
    const workTitle = document.getElementById('assignment-select').selectedOptions[0]?.textContent || '-';
    window._slip = `น้อง${name} | ${missing ? 'ยังไม่ส่งงาน' : sub.late ? 'ส่งงานช้า' : 'ส่งงานแล้ว'}: ${workTitle} | คะแนน: ${sub.assignedGrade ?? sub.draftGrade ?? 'ยังไม่ให้คะแนน'}`;
    el.innerHTML = window._slip.replace(/\|/g, '<br>•').replace(/^/, '• ');
}

function copySlip() {
    if (window._slip) { navigator.clipboard.writeText(window._slip); toast('📋 คัดลอก Slip แล้ว'); }
    else toast('ยังไม่มีข้อมูล Slip');
}

/* ─── Feedback ─── */
function generateFeedback() {
    const sub = submissions.find(s => s.userId === document.getElementById('student-select').value);
    const name = students.find(x => x.userId === sub?.userId)?.profile.name.fullName || 'นักเรียน';
    let fb;
    if (!sub) fb = 'ยังไม่พบการส่งงาน กรุณาเลือกนักเรียนและงานก่อนครับ';
    else if (sub.state === 'CREATED' || sub.state === 'NEW') fb = `${name} ยังไม่ส่งงาน กรุณารีบส่งภายในกำหนดนะครับ`;
    else if ((sub.assignedGrade ?? sub.draftGrade ?? 0) / (assignments.find(a => a.id === currentAssignmentId)?.maxPoints || 100) >= 0.8)
        fb = `${name} ทำงานได้ดีมาก จัดรูปแบบเรียบร้อย เนื้อหาถูกต้องครบถ้วน ชมเชยมากครับ 👏`;
    else fb = `${name} ทำงานส่งแล้ว แต่ควรปรับปรุงความถูกต้องของคำตอบและตรวจสอบก่อนส่งอีกครั้งครับ`;
    document.getElementById('feedback-text').value = fb;
    toast('✨ ร่าง Feedback แล้ว');
}

/* ─── Export ─── */
function exportExcel() {
    if (!submissions.length) { toast('ยังไม่มีข้อมูล'); return; }
    const pts = assignments.find(a => a.id === currentAssignmentId)?.maxPoints || 100;
    const scale = getGradeScale();
    let csv = '\uFEFFชื่อ,สถานะ,ส่งช้า,คะแนน,เต็ม,เกรด\n';
    submissions.forEach(s => {
        const st = students.find(x => x.userId === s.userId);
        const grade = s.assignedGrade ?? s.draftGrade;
        const pct = grade != null ? (grade / pts) * 100 : null;
        csv += `"${st?.profile.name.fullName || s.userId}",${s.state},${s.late ? 'ใช่' : 'ไม่'},${grade ?? ''},${pts},${pct != null ? gradeFromPct(pct, scale) : ''}\n`;
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'gradebook.csv';
    a.click();
    toast('📊 ส่งออก Excel แล้ว (CSV เปิดใน Excel ได้)');
}
function exportPdf() { toast('🖨️ ฟังก์ชัน PDF อยู่ระหว่างพัฒนา — ใช้ปุ่ม Print ของเบราว์เซอร์ชั่วคราว'); window.print(); }
function exportTable() {
    if (!submissions.length) { toast('ยังไม่มีข้อมูล'); return; }
    exportExcel();
}

/* ─── Helpers ─── */
function resetAssignmentSelect() { document.getElementById('assignment-select').innerHTML = '<option value="">-- เลือกงาน --</option>'; submissions = []; }
function resetStudentSelect() { document.getElementById('student-select').innerHTML = '<option value="">-- เลือกนักเรียน --</option>'; }
function openClassroom() { window.open('https://classroom.google.com', '_blank'); }
function switchTab(name) {
    document.querySelectorAll('[id^="content-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById('content-' + name).classList.remove('hidden');
    document.querySelectorAll('[id^="tab-"]').forEach(el => { el.classList.remove('tab-active'); el.classList.add('tab-inactive'); });
    const tab = document.getElementById('tab-' + name);
    tab.classList.remove('tab-inactive'); tab.classList.add('tab-active');
}
function copySnippet(t) { navigator.clipboard.writeText(t); toast('📋 ' + t); }
function copyFeedback() {
    const t = document.getElementById('feedback-text').value;
    if (t) { navigator.clipboard.writeText(t); toast('📋 คัดลอก Feedback แล้ว'); }
}
function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.remove('hidden');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 2500);
}

/* Pending stats after students+assignments loaded */
const _origOnAssignmentChange = onAssignmentChange;
onAssignmentChange = async function() {
    await _origOnAssignmentChange();
    const uid = document.getElementById('student-select').value;
    if (uid) countPendingAll(uid);
};
