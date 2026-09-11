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
// ═══ AI Feedback via LongCat 2.0 (OpenAI-compatible) ═══
function getAIConfig() { return JSON.parse(localStorage.getItem('aiConfig') || 'null'); }
function saveAIConfig() {
        const cfg = {
            key: document.getElementById('ai-key').value.trim(),
            base: document.getElementById('ai-base').value.trim() || 'https://api.longcat.chat/openai',
            model: document.getElementById('ai-model').value.trim() || 'LongCat-2.0',
        };
        if (!cfg.key) { toast('❌ กรอก API Key ก่อน'); return; }
        localStorage.setItem('aiConfig', JSON.stringify(cfg));
        document.getElementById('ai-setup-modal').classList.add('hidden');
        toast('✅ บันทึกการตั้งค่า AI แล้ว');
    }
    function openAISetup() {
        const cfg = getAIConfig();
        if (cfg) {
            document.getElementById('ai-key').value = cfg.key || '';
            document.getElementById('ai-base').value = cfg.base || '';
            document.getElementById('ai-model').value = cfg.model || '';
        }
        document.getElementById('ai-setup-modal').classList.remove('hidden');
    }

    async function generateFeedback() {
        const sub = submissions.find(s => s.userId === document.getElementById('student-select').value);
        const name = students.find(x => x.userId === sub?.userId)?.profile.name.fullName || 'นักเรียน';
        const cfg = getAIConfig();
        if (!cfg || !cfg.key) { openAISetup(); return; }

        const workTitle = document.getElementById('assignment-select').selectedOptions[0]?.textContent || '-';
        const maxPts = assignments.find(a => a.id === currentAssignmentId)?.maxPoints || 100;
        const grade = sub ? (sub.assignedGrade ?? sub.draftGrade) : null;
        const stateMap = { CREATED: 'ยังไม่ส่งงาน', TURNED_IN: 'ส่งงานแล้วรอตรวจ', RETURNED: 'ได้รับงานคืนแล้ว', NEW: 'ยังไม่ส่งงาน', RECLAIMED_BY_STUDENT: 'นักเรียนเรียกคืนงาน' };
        const missing = sub && (sub.state === 'CREATED' || sub.state === 'NEW');

        const sys = 'คุณเป็นครูผู้ช่วยเขียนข้อความฟีดแบ็กให้นักเรียนไทยระดับมัธยม ตอบเป็นข้อความเดียวสั้นกระชับ 2-4 ประโยค ภาษาไทยแบบอบอุ่นให้กำลังใจ เหมาะกับส่งใน Google Classroom ห้ามใช้ Markdown ห้ามขึ้นต้นด้วยคำทักทาย';
        const user = `นักเรียน: ${name}\nงาน: ${workTitle}\nสถานะ: ${sub ? (stateMap[sub.state] || sub.state) : 'ไม่พบการส่งงาน'}${sub?.late ? ' (ส่งล่าช้า)' : ''}\nคะแนน: ${grade != null ? `${grade}/${maxPts}` : 'ยังไม่ให้คะแนน'}\n${missing ? 'ชวนให้รีบส่งงานอย่างมีกำลังใจ' : grade != null && grade / maxPts >= 0.8 ? 'ชมเชยบวกข้อเสนอแนะเล็กน้อย' : 'ให้กำลังใจพร้อมข้อเสนอแนะให้ปรับปรุง'}`;

        const btn = document.querySelector('[onclick="generateFeedback()"]');
        const orig = btn.textContent; btn.textContent = '⏳ กำลังร่าง...'; btn.disabled = true;
        try {
            const r = await fetch(`${cfg.base}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
                body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 300, temperature: 0.7 })
            });
            if (!r.ok) throw new Error(`API ${r.status}`);
            const data = await r.json();
            document.getElementById('feedback-text').value = data.choices?.[0]?.message?.content?.trim() || '';
            toast('✨ AI ร่าง Feedback แล้ว');
        } catch (e) {
            console.error(e);
            // fallback template
            let fb;
            if (!sub) fb = 'ยังไม่พบการส่งงาน กรุณาเลือกนักเรียนและงานก่อนครับ';
            else if (missing) fb = `${name} ยังไม่ส่งงาน กรุณารีบส่งภายในกำหนดนะครับ`;
            else if (grade != null && grade / maxPts >= 0.8) fb = `${name} ทำงานได้ดีมาก เนื้อหาถูกต้องครบถ้วน ชมเชยมากครับ 👏`;
            else fb = `${name} ส่งงานแล้ว แต่ควรปรับปรุงความถูกต้องของคำตอบก่อนส่งครั้งต่อไปครับ`;
            document.getElementById('feedback-text').value = fb;
            toast('⚠️ เชื่อม AI ไม่ได้ ใช้ร่างสำเร็จรูปแทน');
        } finally {
            btn.textContent = orig; btn.disabled = false;
        }
    }

/* ═══ Pet Shop & Quick Win Quests ═══ */
const SHOP_ITEMS = [
    { id: 'egg_common', name: 'ไข่ธรรมดา', icon: '🥚', cost: 150, desc: 'สุ่มคู่หูทั่วไป (6 แบบ)' },
    { id: 'egg_rare', name: 'ไข่หายาก', icon: '🥚✨', cost: 400, desc: 'สุ่มคู่หูหายาก (5 แบบ)' },
    { id: 'food', name: 'อาหารคู่หู', icon: '🍖', cost: 80, desc: '+30 XP ให้คู่หูโตเร็ว' },
    { id: 'skin_gold', name: 'สกินทอง', icon: '👑', cost: 600, desc: 'กรอบชื่อสีทอง 7 วัน' },
    { id: 'streak_shield', name: 'โล่ป้องกัน Streak', icon: '🛡️', cost: 250, desc: 'คุ้มครอง Streak 1 ครั้งเมื่อพลาดส่ง' },
];

/* Pet catalog: common/rare pools with real artwork */
const PET_CATALOG = {
    common: [
        { id: 'cat', name: 'ลูกแมวขี้อ้อน', icon: '🐱', img: 'img/pets/cat.png' },
        { id: 'bunny', name: 'กระต่ายน้อย', icon: '🐰', img: 'img/pets/bunny.png' },
        { id: 'panda', name: 'แพนด้าขี้เซา', icon: '🐼', img: 'img/pets/panda.png' },
        { id: 'fox', name: 'จิ้งจอกส้ม', icon: '🦊', img: 'img/pets/fox.png' },
        { id: 'penguin', name: 'เพนกวินจอมป่วน', icon: '🐧', img: 'img/pets/penguin.png' },
        { id: 'turtle', name: 'เต่านักเรียน', icon: '🐢', img: 'img/pets/turtle.png' },
    ],
    rare: [
        { id: 'unicorn', name: 'ยูนิคอร์นสายรุ้ง', icon: '🦄', img: 'img/pets/unicorn.png' },
        { id: 'tiger', name: 'เสือขาวผู้กล้า', icon: '🐯', img: 'img/pets/tiger.png' },
        { id: 'koala', name: 'โคอาล่านักฝัน', icon: '🐨', img: 'img/pets/koala.png' },
        { id: 'eagle', name: 'อินทรีสายฟ้า', icon: '🦅', img: 'img/pets/eagle.png' },
        { id: 'dolphin', name: 'โลมาประดับดาว', icon: '🐬', img: 'img/pets/dolphin.png' },
    ],
};
function petImg(pet, size = 'w-10 h-10', extra = '') {
    return `<img src="${pet.img || ''}" alt="${pet.name}" loading="lazy" class="${size} object-contain rounded-lg inline-block ${extra}" title="${pet.name}">`;
}

function getPetsKey(uid) { return `myPets_${uid}`; }
function getPets(uid) { return JSON.parse(localStorage.getItem(getPetsKey(uid)) || '[]'); }
function savePets(uid, p) { localStorage.setItem(getPetsKey(uid), JSON.stringify(p)); }
function getInventory(uid) { return JSON.parse(localStorage.getItem(`inventory_${uid}`) || '{}'); }
function saveInventory(uid, inv) { localStorage.setItem(`inventory_${uid}`, JSON.stringify(inv)); }
function getSpent(uid) { return parseInt(localStorage.getItem(`spent_${uid}`) || '0'); }
function addSpent(uid, amount) { localStorage.setItem(`spent_${uid}`, String(getSpent(uid) + amount)); }

function buildShop() {
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    grid.innerHTML = SHOP_ITEMS.map(it => `
        <div class="border border-slate-200 rounded-xl p-3 text-center hover:shadow-md transition bg-white">
            <div class="text-3xl mb-1">${it.icon}</div>
            <p class="text-sm font-bold text-slate-700">${it.name}</p>
            <p class="text-xs text-slate-400 mb-2">${it.desc}</p>
            <button onclick="buyItem('${it.id}')" class="w-full bg-amber-400 hover:bg-amber-500 text-amber-900 text-xs font-bold py-1.5 rounded-lg">🪙 ${it.cost} XP</button>
        </div>`).join('');
}

function buyItem(id) {
    const item = SHOP_ITEMS.find(i => i.id === id);
    const uid = document.getElementById('quest-student-select').value;
    if (!uid || !_gamified || !_gamified[uid]) { toast('เลือกนักเรียนก่อน'); return; }
    const d = _gamified[uid];
    // spendable XP = earned (from Classroom) - spent (permanent)
    const spendable = d.xp - getSpent(uid);
    if (spendable < item.cost) { toast(`❌ XP ไม่พอ (มี ${spendable}, ต้องการ ${item.cost})`); return; }
    addSpent(uid, item.cost);

    if (id === 'egg_common' || id === 'egg_rare') {
        const pool = id === 'egg_common' ? PET_CATALOG.common : PET_CATALOG.rare;
        const rolled = pool[Math.floor(Math.random() * pool.length)];
        const pets = getPets(uid);
        const dupe = pets.filter(p => p.petId === rolled.id).length;
        pets.push({ petId: rolled.id, name: rolled.name, icon: rolled.icon, img: rolled.img, stars: dupe + 1, acquired: Date.now() });
        savePets(uid, pets);
        showEggReveal(rolled, dupe > 0 ? dupe + 1 : 0, id === 'egg_rare');
    } else {
        const inv = getInventory(uid);
        inv[id] = (inv[id] || 0) + 1;
        saveInventory(uid, inv);
        if (id === 'food') toast('🍖 คู่หูได้กำลังใจเพิ่ม!');
        else toast(`🛒 ซื้อ ${item.name} สำเร็จ!`);
    }
    showQuestDetail();
    buildQuestsPanel();
}

function buildQuestsPanel() {
    const uid = document.getElementById('quest-student-select').value;
    const el = document.getElementById('shop-balance');
    if (!el) return;
    if (!uid || !_gamified || !_gamified[uid]) { el.textContent = 'เลือกนักเรียนเพื่อดู XP'; return; }
    const spendable = Math.max(0, _gamified[uid].xp - getSpent(uid));
    const pets = getPets(uid);
    const petChips = pets.length
        ? pets.map(p => `<span class="relative inline-block cursor-pointer pet-pop" title="${p.name}${p.stars > 1 ? ` ⭐×${p.stars}` : ''}" onclick="petSay('${p.name}','${p.icon}')">${petImg(p, 'w-11 h-11 bg-white border border-slate-200 shadow-sm')}${p.stars > 1 ? `<span class="absolute -bottom-1 -right-1 bg-yellow-400 text-white text-[10px] font-bold rounded-full px-1">⭐${p.stars}</span>` : ''}</span>`).join(' ')
        : '<span class="text-xs text-slate-400">ยังไม่มีคู่หู — เปิดไข่แรกได้เลย!</span>';
    el.innerHTML = `🪙 ${spendable} XP <span class="text-xs text-slate-400 ml-1">(สะสม ${_gamified[uid].xp} - ใช้ไป ${getSpent(uid)})</span><br><span class="text-base">${petChips}</span>`;
}

function petSay(name, icon) {
    const lines = ['อยากกินขนม 🍪', 'ส่งงานอีกแล้วได้ XP นะ!', 'วันนี้เก่งมากเลย!', 'ขอออกไปเล่นน้ำ 😊', 'มาลากันเล่นไหม?', 'ขอโอบหน่อยยย~'];
    toast(`${icon} ${name}: "${lines[Math.floor(Math.random() * lines.length)]}"`);
}

/* ═══ Egg reveal animation (gacha-style) ═══ */
function showEggReveal(pet, stars, isRare) {
    const existing = document.getElementById('egg-reveal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'egg-reveal-overlay';
    overlay.className = 'fixed inset-0 z-[60] flex items-center justify-center';
    overlay.style.cssText = 'background:rgba(15,23,42,0.85);backdrop-filter:blur(6px)';
    overlay.innerHTML = `
        <div class="text-center px-4">
            <div id="egg-anim" class="text-8xl md:text-9xl mx-auto" style="animation: eggShake .4s infinite">🥚</div>
            <p id="egg-status" class="text-white text-lg mt-6 font-medium">กำลังเปิดไข่${isRare ? 'หายาก ✨' : ''}...</p>
        </div>`;
    document.body.appendChild(overlay);

    // crack sequence
    setTimeout(() => { overlay.querySelector('#egg-anim').textContent = '🥚'; }, 800);
    setTimeout(() => { overlay.querySelector('#egg-anim').textContent = '🐣'; }, 1600);
    // reveal!
    setTimeout(() => {
        const shine = isRare
            ? 'radial-gradient(circle, rgba(255,215,0,.55) 0%, rgba(168,85,247,.35) 45%, transparent 70%)'
            : 'radial-gradient(circle, rgba(139,92,246,.5) 0%, rgba(59,110,245,.3) 45%, transparent 70%)';
        overlay.innerHTML = `
            <div class="text-center px-4 fade-in">
                <div class="mx-auto mb-4 flex items-center justify-center" style="width:280px;height:280px;border-radius:50%;background:${shine}">
                    <img src="${pet.img}" alt="${pet.name}" class="w-52 h-52 object-contain" style="animation: bounce 1.2s infinite;filter:drop-shadow(0 8px 24px rgba(0,0,0,.35))">
                </div>
                <p class="text-3xl font-bold text-white">${pet.name}${stars > 1 ? ` <span class="text-yellow-300">⭐×${stars}</span>` : ''}</p>
                <p class="text-sm mt-2 ${isRare ? 'text-yellow-300' : 'text-violet-200'}">${isRare ? '✨ คู่หูหายาก! คุณโชคดีมาก!' : '🎉 ได้คู่หูใหม่แล้ว!'}</p>
                <p class="text-xs text-slate-300 mt-1">เพื่อนคู่หูนี้จะอยู่กับคุณตลอดการเรียน</p>
                <button onclick="this.closest('#egg-reveal-overlay').remove();buildQuestsPanel();" class="mt-6 bg-gradient-to-r from-violet-600 to-brand-500 hover:opacity-90 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition">เย่! รับคู่หูเลย 🎉</button>
            </div>`;
    }, 2500);
}

function buildQuickWin(uid) {
    const el = document.getElementById('quick-win');
    if (!el) return;
    if (!uid || !_gamified || !_gamified[uid]) { el.innerHTML = '<p class="text-xs text-slate-400">เลือกนักเรียนเพื่อดูภารกิจ</p>'; return; }
    const d = _gamified[uid];
    const quests = [];
    if (d.missing > 0) {
        quests.push({ icon: '🎯', text: `ส่งงานที่ค้าง 1 ชิ้น (เหลือ ${d.missing} ชิ้น)`, reward: 50 });
        if (d.missing > 2) quests.push({ icon: '🎯', text: 'ส่งงานค้างอีก 1 ชิ้น (ทำต่อจากเมื่อวาน)', reward: 50 });
    } else {
        quests.push({ icon: '🌟', text: 'ส่งงานถัดไปให้ตรงเวลา', reward: 50 });
    }
    quests.push({ icon: '📈', text: 'ทำคะแนนงานหน้าให้ดีขึ้นจากงานล่าสุด', reward: 80 });
    el.innerHTML = quests.map(q => `
        <div class="flex items-center justify-between bg-mint-50 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-1.5">
            <span class="text-xs text-slate-600">${q.icon} ${q.text}</span>
            <span class="text-xs font-bold text-emerald-600 whitespace-nowrap ml-2">+${q.reward} XP</span>
        </div>`).join('');
}

/* ═══ Gamification: XP / Streak / Badges ═══ */
async function loadAllSubmissions() {
    // fetch submissions for every assignment in the current course
    const all = [];
    for (const a of assignments) {
        try {
            const data = await gapi(`courses/${currentCourseId}/courseWork/${a.id}/studentSubmissions?pageSize=100`);
            (data.studentSubmissions || []).forEach(s => all.push({ ...s, _work: a }));
        } catch (e) { console.error(e); }
    }
    return all;
}

function computeGamification(allSubs) {
    // per student: XP, ontime streak, badges
    const byStudent = {};
    students.forEach(st => {
        byStudent[st.userId] = { name: st.profile.name.fullName, xp: 0, ontime: 0, late: 0, missing: 0, graded: [], streak: 0, badges: [] };
    });

    allSubs.forEach(s => {
        const rec = byStudent[s.userId];
        if (!rec) return;
        const pts = s._work?.maxPoints || 100;
        const grade = s.assignedGrade ?? s.draftGrade;
        const missing = s.state === 'CREATED' || s.state === 'NEW';

        if (missing) { rec.missing++; return; }
        if (s.late) { rec.xp += 20; rec.late++; }
        else { rec.xp += 50; rec.ontime++; }
        if (grade != null && grade / pts >= 0.8) rec.xp += 30;
        if (grade != null) rec.graded.push({ pct: (grade / pts) * 100, full: grade >= pts });
    });

    // weekly streak: consecutive ontime across works ordered by due date
    Object.values(byStudent).forEach(rec => {
        let streak = 0;
        for (const g of rec.graded.sort((a, b) => 0)) { /* keep order */ break; }
        streak = rec.missing === 0 ? rec.ontime : 0;
        rec.streak = streak;

        // badges
        if (rec.graded.filter(g => g.full).length >= 3) rec.badges.push({ icon: '💯', name: 'เพอร์เฟกต์' });
        if (rec.streak >= 4) rec.badges.push({ icon: '🔥', name: 'นักส่งมืออาชีพ' });
        const pcts = rec.graded.map(g => g.pct);
        let rising = 0;
        for (let i = 1; i < pcts.length; i++) if (pcts[i] > pcts[i - 1]) rising++; else rising = 0;
        if (rising >= 2) rec.badges.push({ icon: '🚀', name: 'พัฒนาตัวเอง' });
        if (rec.missing === 0 && rec.ontime + rec.late >= assignments.length && assignments.length > 0) rec.badges.push({ icon: '👑', name: 'เจ้าตาราง' });
        rec.xp += rec.streak >= 1 ? 100 : 0; // weekly streak bonus
    });
    return byStudent;
}

const LEVELS = [
    { min: 0, name: 'ดาวรุ่ง', icon: '⭐', pet: '🐣', petName: 'ลูกไก่น้อย' },
    { min: 200, name: 'นักสำรวจ', icon: '🧭', pet: '🐥', petName: 'สำรวจไก่' },
    { min: 500, name: 'นักผจญภัย', icon: '🗺️', pet: '🐺', petName: 'หมาป่าผจญภัย' },
    { min: 900, name: 'นักปราชญ์', icon: '📚', pet: '🦉', petName: 'นกฮูกปราชญ์' },
    { min: 1400, name: 'ตำนานห้องเรียน', icon: '🏆', pet: '🐉', petName: 'มังกรตำนาน' },
];
function levelOf(xp) {
    let lv = LEVELS[0];
    for (const l of LEVELS) if (xp >= l.min) lv = l;
    return lv;
}

let _gamified = null;
async function buildQuests() {
    if (!currentCourseId || !assignments.length) {
        document.getElementById('leaderboard-body').innerHTML = '<tr><td colspan="4" class="text-center text-slate-400 py-8">เลือกวิชาใน Grading Studio ก่อน</td></tr>';
        return;
    }
    toast('⏳ กำลังคำนวณ XP...');
    const allSubs = await loadAllSubmissions();
    const data = computeGamification(allSubs);
    _gamified = data;

    const rows = Object.entries(data)
        .map(([uid, d]) => ({ uid, ...d }))
        .sort((a, b) => b.xp - a.xp);
    rows.forEach(r => { r.uid = r.uid; });

    document.getElementById('leaderboard-body').innerHTML = rows.slice(0, 10).map((d, i) => {
        const lv = levelOf(d.xp);
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
        const badges = d.badges.map(b => `<span title="${b.name}">${b.icon}</span>`).join(' ');
        const pet = d.xp >= 1400 ? '🐉' : lv.pet || lv.icon;
        const myPets = getPets(d.uid);
        const petRow = myPets.length
            ? myPets.slice(0, 4).map(p => petImg(p, 'w-8 h-8 bg-white border border-slate-200', 'hover:scale-125 transition')).join('') + (myPets.length > 4 ? `<span class="text-xs text-slate-400 ml-0.5">+${myPets.length - 4}</span>` : '')
            : '';
        return `<tr class="hover:bg-slate-50">
            <td class="px-4 py-2.5 text-center text-lg">${medal}</td>
            <td class="px-4 py-2.5 font-medium text-slate-700"><span class="text-xl mr-1">${pet}</span>${d.name}${petRow ? `<span class="ml-2 inline-flex items-center gap-0.5">${petRow}</span>` : ''}</td>
            <td class="px-4 py-2.5 text-center">${lv.icon} <b>${lv.name}</b></td>
            <td class="px-4 py-2.5 text-center font-bold text-brand-600">${d.xp} XP</td>
            <td class="px-4 py-2.5 text-center">${d.streak > 0 ? `🔥 ${d.streak}` : '-'}</td>
            <td class="px-4 py-2.5 text-center text-lg">${badges || '-'}</td>
        </tr>`;
    }).join('');

    // class quest: submission rate this week
    const totalWorks = assignments.length * students.length;
    const submitted = allSubs.filter(s => !(s.state === 'CREATED' || s.state === 'NEW')).length;
    const rate = totalWorks ? Math.round(submitted / totalWorks * 100) : 0;
    const qEl = document.getElementById('class-quest');
    qEl.innerHTML = rate >= 90
        ? `🎉 <b>ภารกิจสำเร็จ!</b> ทั้งห้องส่งงาน ${rate}% — สัปดาห์หน้าทุกคนได้ XP คูณ 2!`
        : `🎯 ภารกิจสัปดาห์นี้: ทั้งห้องส่งงานให้ครบ <b>90%</b> (ตอนนี้ ${rate}%) เหลืออีก ${Math.max(0, Math.ceil(totalWorks * 0.9) - submitted)} ชิ้น`;

    // build per-student quest panel select
    const sel = document.getElementById('quest-student-select');
    sel.innerHTML = '<option value="">-- เลือกนักเรียน --</option>';
    students.forEach(s => {
        const o = document.createElement('option');
        o.value = s.userId;
        o.textContent = s.profile.name.fullName;
        sel.appendChild(o);
    });
    document.getElementById('quest-detail').innerHTML = '<p class="text-slate-400 text-sm">เลือกนักเรียนเพื่อดู XP, Streak และป้ายรางวัล</p>';
    buildShop();
    buildQuestsPanel();
    buildQuickWin(null);
}

function showQuestDetail() {
    const uid = document.getElementById('quest-student-select').value;
    buildQuickWin(uid);
    buildQuestsPanel();
    const el = document.getElementById('quest-detail');
    if (!uid || !_gamified || !_gamified[uid]) { el.innerHTML = '<p class="text-slate-400 text-sm">เลือกนักเรียนเพื่อดูข้อมูล</p>'; return; }
    const d = _gamified[uid];
    const lv = levelOf(d.xp);
    const next = LEVELS.find(l => l.min > d.xp);
    const progress = next ? Math.min(100, Math.round((d.xp - lv.min) / (next.min - lv.min) * 100)) : 100;
    el.innerHTML = `
        <div class="flex items-center gap-4 mb-3">
            <div class="text-5xl" style="animation: bounce 2s infinite">${d.xp >= 1400 ? '🐉' : lv.pet || lv.icon}</div>
            <div class="flex-1">
                <p class="font-bold text-slate-700">${d.name} — ${lv.name}</p>
                <p class="text-xs text-violet-600 mb-1">สัตว์เลี้ยงคู่หู: ${lv.petName || ''} ${d.xp >= 1400 ? '🐉' : lv.pet || ''}</p>
                <div class="h-2.5 bg-slate-200 rounded-full mt-1 overflow-hidden"><div class="h-full bg-gradient-to-r from-brand-500 to-indigo-500" style="width:${progress}%"></div></div>
                <p class="text-xs text-slate-500 mt-1">${d.xp} XP ${next ? `• อีก ${next.min - d.xp} XP ถึง ${next.name} (ปลดล็อก ${next.petName || next.name})` : '• ระดับสูงสุด!'}</p>
            </div>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center text-sm mb-3">
            <div class="bg-emerald-50 rounded-lg p-2">✅ ส่งตรงเวลา<br><b>${d.ontime}</b></div>
            <div class="bg-amber-50 rounded-lg p-2">⏰ ส่งช้า<br><b>${d.late}</b></div>
            <div class="bg-rose-50 rounded-lg p-2">❌ ยังไม่ส่ง<br><b>${d.missing}</b></div>
        </div>
        <p class="text-sm text-slate-600 mb-1">🔥 Streak: <b>${d.streak}</b> งานต่อเนื่อง</p>
        <div class="flex flex-wrap gap-2 mb-3">${d.badges.map(b => `<span class="bg-violet-100 text-violet-800 text-xs px-2 py-1 rounded-full">${b.icon} ${b.name}</span>`).join('') || '<span class="text-xs text-slate-400">ยังไม่มีป้าย — ส่งงานตรงเวลาเพื่อสะสมป้ายแรก!</span>'}</div>
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p class="text-xs font-semibold text-slate-500 mb-1.5">🐾 คู่หูของฉัน (${getPets(uid).length} ตัว):</p>
            ${getPets(uid).length
                ? `<div class="flex flex-wrap gap-2">${getPets(uid).map(p => `<span class="relative inline-block pet-pop cursor-pointer" title="${p.name}${p.stars > 1 ? ` ⭐×${p.stars}` : ''}" onclick="petSay('${p.name}','${p.icon}')">${petImg(p, 'w-14 h-14 bg-white border border-slate-200 shadow-sm')}${p.stars > 1 ? `<span class="absolute -bottom-1 -right-1 bg-yellow-400 text-white text-[10px] font-bold rounded-full px-1">⭐${p.stars}</span>` : ''}</span>`).join('')}</div>`
                : '<p class="text-xs text-slate-400">ยังไม่มีคู่หู — ไปร้านคู่หูเปิดไข่แรกได้เลย! 🥚</p>'}
        </div>`;
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

const _origOnCourseChange = onCourseChange;
onCourseChange = async function() {
    await _origOnCourseChange();
    if (currentCourseId) buildQuests();
};
