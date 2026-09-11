# PRD: Classroom Insights & Grader Hub
**เวอร์ชัน 1.2 | วันที่: 10 กันยายน 2026 | สถานะ: ใช้งานจริง (Production)**

---

## 1. ภาพรวมโปรเจกต์

ระบบช่วยครูวิเคราะห์และติดตามงานนักเรียนจาก Google Classroom แบบ **Read-Only** (ครูตรวจให้คะแนนใน Classroom เป็นหลัก ระบบดึงข้อมูลมาวิเคราะห์แสดงผล)

**เจ้าของโปรเจกต์:** ครูเอก (Eknarin) — eknarin.com, GitHub: e1234k-pixel

**สถานะปัจจุบัน:**
- 🟢 Deploy ออนไลน์: `https://classroomanalize.ekai.workers.dev/`
- 🟢 Login Google ใช้งานได้
- 🟢 โหลดวิชา/นักเรียน/งาน/การส่งงาน ได้จริง
- 🟡 ระบบตรวจงาน (Grading Studio) — ทำ UI แล้ว พักพัฒนาต่อชั่วคราว

---

## 2. ข้อมูลการเชื่อมต่อ API ทั้งหมด

### 2.1 Google OAuth 2.0 (สำคัญที่สุด)

```
Client ID:     1043421437059-of9k7vt7hft5lf9vb1ffjlis3q6r4bd2.apps.googleusercontent.com
Project ID:    hermesvps-508213
Auth URI:      https://accounts.google.com/o/oauth2/auth
Token URI:     https://oauth2.googleapis.com/token
Redirect URI:  http://localhost:8000/auth/callback  (มีใน config เดิม)
```

**⚠️ Client Secret ห้ามเก็บในโค้ด/PRD นี้** — ดูจากไฟล์ `credentials.json` ในเครื่อง (ไม่ได้อยู่ใน Git) หรือ Google Cloud Console

**Authorized JavaScript origins (ต้องลงทะเบียนครบใน Google Cloud Console):**
```
https://classroomanalize.ekai.workers.dev
https://classroomanalize.pages.dev
```

**Scopes ที่ใช้อยู่:**
```
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.rosters.readonly
https://www.googleapis.com/auth/classroom.coursework.students.readonly
https://www.googleapis.com/auth/classroom.student-submissions.students.readonly
https://www.googleapis.com/auth/drive.readonly
```

**วิธี Auth (Frontend-only ผ่าน Google Identity Services):**
```javascript
google.accounts.oauth2.initTokenClient({
  client_id: '1043421437059-of9k7vt7hft5lf9vb1ffjlis3q6r4bd2.apps.googleusercontent.com',
  scope: SCOPES,
  callback: (resp) => { accessToken = resp.access_token; }
}).requestAccessToken();
```
- ไม่มี backend session — access token เก็บในหน่วยความจำ JS เท่านั้น
- User profile: `GET https://www.googleapis.com/oauth2/v2/userinfo` (Bearer token)

### 2.2 Google Classroom API Endpoints ที่ใช้

| ฟังก์ชัน | Endpoint |
|---|---|
| รายวิชาของครู (ACTIVE เท่านั้น) | `GET https://classroom.googleapis.com/v1/courses?pageSize=100&courseStates=ACTIVE&teacherId=me` |
| รายชื่อนักเรียน | `GET /v1/courses/{courseId}/students?pageSize=100` |
| รายการงานในวิชา | `GET /v1/courses/{courseId}/courseWork?pageSize=100` |
| การส่งงานของนักเรียน | `GET /v1/courses/{courseId}/courseWork/{courseWorkId}/studentSubmissions?pageSize=100` |
| พรีวิวไฟล์งาน (Drive) | iframe: `https://drive.google.com/file/d/{fileId}/preview` |

**สถานะ Submission ที่เจอ:** `CREATED` (ยังไม่ส่ง), `TURNED_IN` (ส่งแล้ว), `RETURNED` (คืนแล้ว), `NEW`, `RECLAIMED_BY_STUDENT`
**คะแนน:** `assignedGrade` (นักเรียนเห็น), `draftGrade` (เฉพาะครู) — อ่านได้จากทุกงาน

### 2.3 Cloudflare

```
Live URL:        https://classroomanalize.ekai.workers.dev/
Pages URL:       https://classroomanalize.pages.dev
Project name:    classroomanalize
Account ID:      4d43a89db7547319090b59eda83e813e
Zone ID (eknarin.com): 93f9f16d0b93e2c515f986c908fc4154
Domain:          eknarin.com (Cloudflare DNS)
```
- ⚠️ API Token ที่เคยส่งในแชตใช้ไม่ได้/ควร revoke — สร้างใหม่ที่ dash.cloudflare.com → My Profile → API Tokens (template: Edit Cloudflare Pages)
- Deploy: push ไป GitHub → auto-deploy (~1-2 นาที)

### 2.4 GitHub

```
Repo:    git@github.com:e1234k-pixel/ClassroomAnalize.git
Branch:  main
SSH Key: /opt/data/.ssh/id_ed25519_classroom (private, อยู่ในเครื่องทำงานเท่านั้น)
Push:    GIT_SSH_COMMAND="ssh -i /opt/data/.ssh/id_ed25519_classroom -o StrictHostKeyChecking=no" git push
```

### 2.5 AI Model (แผนใช้ทำ Feedback)

```
Provider:  LongCat 2.0 (Meituan)
Endpoint:  https://api.longcat.chat/openai  (OpenAI-compatible, /v1/chat/completions)
Model:     LongCat-2.0
สำรอง:     OpenRouter — model `meituan/longcat-2.0`
```
- ⚠️ API key ของ LongCat ถูกเปิดเผยในแชต 2 ครั้ง — ต้องสร้าง key ใหม่และเก็บใน env var เท่านั้น

---

## 3. สถาปัตยกรรม

```
[เบราว์เซอร์ครู]
   └── Static SPA (frontend/index.html + frontend/js/app.js)
         ├── Google Identity Services (OAuth token, frontend-only)
         ├── Classroom REST API (fetch + Bearer token, อ่านอย่างเดียว)
         └── Drive iframe preview (ไฟล์งานนักเรียน)
[Cloudflare Workers/Pages] — เสิร์ฟ static files, auto-deploy จาก GitHub main
[GitHub: e1234k-pixel/ClassroomAnalize] — source of truth
[Backend FastAPI + SQLite] — มีโครงสร้างพร้อม (backend/) แต่ยังไม่ใช้ใน production
```

**โครงสร้างไฟล์:**
```
classroom-hub/
├── frontend/
│   ├── index.html        # SPA หลัก (Tailwind CDN, 4 แท็บ)
│   └── js/app.js         # Logic ทั้งหมด (auth, API, heatmap, gradebook, export)
├── backend/              # FastAPI (ยังไม่ใช้ใน production)
│   ├── main.py
│   ├── database/         # SQLAlchemy + SQLite models
│   ├── routers/          # courses, assignments, students, grading, auth, sync
│   └── services/google_auth.py
├── requirements.txt
├── .env.example
├── .gitignore            # credentials.json, token.json, *.db
└── credentials.json      # (เฉพาะเครื่อง, ไม่อยู่ใน Git)
```

---

## 4. ฟีเจอร์ (สถานะปัจจุบัน)

### 4.1 Login & Course Selection 🟢
- Login ด้วย Google (GIS token client)
- แสดงเฉพาะวิชาที่ account เป็นเจ้าของ + ยังเปิดสอน (ACTIVE)
- การ์ดสถิติ: จำนวนวิชา / นักเรียน / งาน

### 4.2 Grading Studio (Split Screen) 🟡
- ฝั่งซ้าย: พรีวิวไฟล์งานนักเรียนจริง (Drive preview iframe)
- ฝั่งขวา: ข้อมูลนักเรียน (คะแนน/งานค้าง/ส่งตรงเวลา), Quick Snippets, AI Feedback, Rubric Checklist
- ปุ่ม "เปิดใน Classroom" เปิดแท็บใหม่
- สถานะ: UI + โหลด submission จริงเสร็จ — **พักพัฒนาต่อ** (ครูตรวจใน Classroom เองก่อน)

### 4.3 Debt Tracker 🟢
- Heatmap สีต่อนักเรียน: แดง=ยังไม่ส่ง, เหลือง=ส่งช้า, เขียว=ปกติ
- คลิกชื่อใน Heatmap → กระโดดไปดูงานคนนั้น
- Student Slip: สรุปรายคน + ปุ่มคัดลอกส่ง LINE

### 4.4 Gradebook 🟢
- ตารางคะแนนจริงจาก submissions (assignedGrade/draftGrade)
- ตัดเกรดอัตโนมัติตามเกณฑ์ (เก็บใน localStorage)
- เกณฑ์เริ่มต้น: 80=4, 75=3.5, 70=3, 65=2.5, 60=2, 55=1.5, 50=1, <50=0

### 4.5 Export 🟢
- CSV UTF-8 (เปิดใน Excel ได้, มี BOM \uFEFF สำหรับภาษาไทย)
- PDF (ปพ.5) — ยังเป็น window.print() ชั่วคราว

---

## 5. ข้อจำกัดสำคัญของ Google Classroom API (ยืนยันแล้ว)

1. **เขียนคะแนนไม่ได้กับงานที่สร้างในหน้าเว็บ Classroom** — `studentSubmissions.patch` (draftGrade/assignedGrade) ใช้ได้เฉพาะ CourseWork ที่สร้างผ่าน API โดย client เดียวกัน → งานที่ครูสร้างเองใน UI จะ 403 Permission Denied
2. **ฝัง classroom.google.com ใน iframe ไม่ได้** (X-Frame-Options) — ฝังได้เฉพาะไฟล์ Drive preview
3. **assignedGrade ต้องมี draftGrade ก่อน** — จึงจะตั้งค่าได้
4. **Scopes ที่ต้องเพิ่มถ้าจะทำเขียนคะแนน:** `classroom.coursework.students` + `classroom.student-submissions.students` (แบบไม่ readonly) และต้องทำฟีเจอร์ "สร้างงานผ่าน API"

---

## 6. Gamification — ระบบเกมกระตุ้นแรงจูงใจนักเรียน

### 6.1 ระบบคะแนนสะสมและระดับ (XP & Levels)
- **XP ได้จาก:** ส่งงานตรงเวลา (+50), ส่งงานช้า (+20), คะแนนงาน ≥80% (+30 bonus), ส่งงานต่อเนื่องครบทุกงานในสัปดาห์ (+100 streak bonus)
- **ระดับ (Level):** ระดับมีชื่อภาษาไทยตามบริบทโรงเรียน เช่น ดาวรุ่ง → นักสำรวจ → นักผจญภัย → นักปราชญ์ → ตำนานห้องเรียน (แต่ละระดับใช้ XP ที่เพิ่มขึ้นแบบทวีคูณ)
- แสดง XP bar และเลเวลในหน้า Student Slip

### 6.2 Streak (สายส่งต่อเนื่อง)
- นับจำนวนงาน/สัปดาห์ที่ส่งตรงเวลาติดต่อกัน (เหมือน Duolingo)
- แสดงเป็น 🔥 x จำนวนวัน — ถ้าพลาดส่งงาน 1 ชิ้น streak รีเซ็ต
- Streak ≥ 4 สัปดาห์ ได้ป้ายพิเศษ "นักส่งมืออาชีพ"

### 6.3 ป้ายรางวัล (Badges)
| ป้าย | เงื่อนไข |
|---|---|
| 🌅 ตื่นเช้า | ส่งงานก่อนเดดไลน์ 24 ชม. ครบ 5 ครั้ง |
| 💯 เพอร์เฟกต์ | ได้คะแนนเต็ม 3 งาน |
| 🚀 พัฒนาตัวเอง | คะแนนงานถัดไปสูงขึ้นติดต่อกัน 3 งาน |
| 🛡️ ไม่ยอมแพ้ | เคยค้างงานแต่กลับมาส่งครบทุกงานหลังจากนั้น |
| 👑 เจ้าตาราง | ส่งครบทุกงานทั้งเทอม (ยากสุด) |

### 6.4 ตารางคะแนนห้อง (Class Leaderboard)
- จัดอันดับ XP ในห้อง — แนะนำโหมด 2 แบบ:
  - **โหมดรายคน:** อันดับ XP สูงสุด 10 คน (ปกปิดอันดับท้ายเพื่อไม่ให้เด็กรู้สึกแย่)
  - **โหมดทีม:** แบ่งห้องเป็นทีม แข่ง XP รวมต่อสัปดาห์
- ⚠️ ครูเปิด/ปิด Leaderboard ได้ (เด็กบางคนไม่ชอบการแข่งขัน)

### 6.5 ภารกิจรายสัปดาห์ (Weekly Quests)
- ระบบสุ่มภารกิจให้ทั้งห้อง เช่น "สัปดาห์นี้ถ้าทั้งห้องส่งงานครบ 90% ทุกคนได้ XP คูณ 2"
- สร้างความรู้สึกทำเพื่อเพื่อนร่วมห้อง ไม่ใช่แค่ตัวเอง

### 6.6 หลักการออกแบบ (ต้องยึด)
1. **ไม่ตีคนจน** — กลุ่มเสี่ยง (แดง) ต้องได้ภารกิจง่ายที่ทำสำเร็จได้ทันที (quick win) เพื่อสร้างความมั่นใจ ไม่ใช่เห็นตัวเองจมอันดับ
2. **เน้นพัฒนาการ ไม่ใช่ความเก่ง** — ป้าย "พัฒนาตัวเอง" สำคัญกว่าป้าย "คะแนนเต็ม" สำหรับเด็กกลาง/กลุ่มเสี่ยง
3. **ครูควบคุมได้เต็มที่** — ทุกองค์ประกอบเกม (เปิด/ปิด, สูตร XP, ป้าย) ตั้งค่าได้ในแท็บ Settings
4. **Slip ที่ส่งผู้ปกครอง/LINE แสดงข่าวดีก่อนเสมอ** — เช่น "🔥 ส่งต่อเนื่อง 3 สัปดาห์! ขาอีก 2 งาน"

### 6.7 การเชื่อมกับระบบปัจจุบัน
- คำนวณจากข้อมูลที่มีอยู่แล้ว: submissions (state, late, grades) — ไม่ต้องขอสิทธิ์ API เพิ่ม
- หน้าใหม่: แท็บที่ 5 "🏆 Quests & Badges" + เพิ่ม XP/Streak ใน Student Slip
- เก็บ XP ใน localStorage ตอนนี้ → ย้ายไป backend SQLite เมื่อเปิดใช้ backend
- **สถานะ: ทำ Phase 1 เสร็จแล้ว (deploy แล้ว)** — แท็บ 🏆 Quests & Badges: Leaderboard Top 10, XP/Level/Streak ต่อคน, Badge auto-award (เพอร์เฟกต์/พัฒนาตัวเอง/เจ้าตาราง/นักส่งมืออาชีพ), Weekly Quest (อัตราส่งงานทั้งห้อง ≥90% = XP x2), การ์ดนักเรียนแบบ XP bar
- **Phase 2 เสร็จแล้ว:** ร้านคู่หู (ไข่กาชา 11 ตัว + สกินทอง 7 วัน + โล่ป้องกัน Streak), Pity System การันตีตัวใหม่ครั้งที่ 5, Quick Win ภารกิจกลุ่มเสี่ยง, XP หักถาวรแบบ spent ledger, ภาพคู่หูจริงแทน emoji

### 6.8 XP Sync Engine — อัปเดต XP เมื่อครูให้คะแนนใน Classroom (แผนระยะถัดไป)

**ปัญหา:** XP คำนวณจากข้อมูล Classroom ตอนเปิดหน้าเว็บ — ถ้าครูให้คะแนนใหม่แต่ไม่มีใครเปิดหน้าเว็บ นักเรียนจะเห็น XP เก่า

**โซลูชัน 3 ชั้น (แนะนำทำรวมกัน):**

1. **Pull on Open (มีอยู่แล้ว):** ทุกครั้งที่เปิดหน้า/เลือกวิชา ระบบดึงข้อมูลใหม่จาก Classroom API แล้วคำนวณ XP ใหม่ — แม่นยำ 100% แต่ขึ้นกับว่ามีคนเปิดเว็บ

2. **Scheduled Sync (Cloudflare Cron Trigger — ฟรี):** Worker รันทุก 15-30 นาที ดึง submissions ทั้งหมด → คำนวณ XP → เขียนลง D1 → นักเรียนเปิดเว็บเจอข้อมูลล่าสุดเสมอ (ตัวนับ "อัปเดตล่าสุด X นาทีที่แล้ว" บนหน้าเว็บ)

3. **Push Realtime (แนวโน้มสูง):**
   - ครูกด "รีเฟรชข้อมูล" ในแดชบอร์ด → sync ทันที
   - นักเรียนเปิดหน้าค้างไว้ → Worker ใช้ SSE/polling ทุก 1-2 นาที เช็คค่า XP ใน D1 → ถ้าเปลี่ยน เด้ง animation "+50 XP! ครูให้คะแนนงานใหม่" เหมือนได้ของรางวัลสดๆ

**Event ที่ทำให้ XP เปลี่ยน:** ครู patch assignedGrade (งานถูกตรวจแล้ว → +30 XP ถ้า ≥80%), return งาน, นักเรียนส่งงานใหม่ (TURNED_IN → +50/+20), สายส่งต่อเนื่องครบสัปดาห์ (+100)

**การไล่ระดับ (ต้องมี Worker + D1 ก่อน ตามแผน Student Login ระยะ 1):**
```
ครูให้คะแนนใน Classroom
   ↓ (ทุก 15-30 นาที หรือเมื่อครูกดรีเฟรช)
Cloudflare Worker ดึง studentSubmissions จาก Classroom API
   ↓ คำนวณ delta XP ต่อนักเรียน (เทียบกับค่าเก่าใน D1)
D1: xp_events table (uid, event, amount, workId, timestamp)
   ↓ นักเรียนเปิดหน้า / SSE push
หน้านักเรียน: การ์ดเด้ง "+80 XP! ครูตรวจงาน Lab 3 แล้ว" + คู่หูทำท่าดีใจ
```

**กติกาสำคัญ:** XP เคยคำนวณแล้วต้องไม่นับซ้ำ — เก็บ `workId+state+grade` ล่าสุดต่อ submission ใน D1 เป็น fingerprint ถ้าเหมือนเดิม = ข้าม

---

## 7. Roadmap / สิ่งที่ทำต่อ

| ลำดับความสำคัญ | งาน |
|---|---|
| สูง | ต่อ Grading Studio: นับงานค้างข้าม assignment, โหลดงานหลายงานพร้อมกัน (ปัจจุบัน count pending ทำ per-request loop ช้า) |
| สูง | AI Feedback จริง: เชื่อม LongCat-2.0 (สร้าง key ใหม่, เก็บใน env) |
| สูง | 🏆 Gamification Phase 2: สัตว์เลี้ยงกิน XP + ร้านค้า + ภารกิจเฉพาะกลุ่มเสี่ยง (quick win) — ✅ เสร็จแล้ว |
| สูง | 🎭 Student Login: ระบบบทบาทครู/นักเรียน + Cloudflare Worker API + D1 เก็บ XP กลาง (ระยะ 1-3) |
| สูง | 🔄 XP Sync Engine: ระบบอัปเดต XP อัตโนมัติเมื่อครูให้คะแนนใน Classroom (อธิบายใน PRD §6.8) |
| กลาง | Export PDF ปพ.5 จริง (เช่น jsPDF / SheetJS) |
| กลาง | Custom Domain `classroom.eknarin.com` (CNAME → classroomanalize.pages.dev) |
| กลาง | 🏆 Gamification Phase 1: XP + Streak + Student Slip (คำนวณจาก submissions ที่มีอยู่) |
| กลาง | 🏆 Gamification Phase 2: Badges + Leaderboard + Weekly Quests (แท็บใหม่) |
| ต่ำ | เปิดใช้ Backend FastAPI + Sync เข้า SQLite (โค้ดพร้อมแล้วใน backend/) |
| ต่ำ | ระบบบันทึกคะแนนอัตโนมัติ (เฉพาะงานที่สร้างผ่าน API) |

---

## 7. กฎความปลอดภัย (ห้ามละเมิด)

1. **ห้าม commit** `credentials.json`, `token.json`, `.env`, `*.db` — อยู่ใน .gitignore แล้ว (เคยโดน GitHub บล็อก push มาแล้ว ต้อง re-init repo)
2. **API keys ที่หมดอายุความเชื่อถือ** (เคยถูกพิมพ์ในแชต): LongCat key 2 ตัว, Cloudflare token, Google Client Secret → ควร rotate ทั้งหมด
3. Secrets ทุกตัวเก็บใน environment variables / ไฟล์ในเครื่องเท่านั้น ไม่ใส่โค้ด ไม่ส่งในแชต
4. SSH private key: `/opt/data/.ssh/id_ed25519_classroom` — อยู่ในเครื่องทำงานเท่านั้น

---

## 8. สภาพแวดล้อมการพัฒนา

```
เครื่องทำงาน:   Linux container (Hermes Agent, ไม่มี public IP)
Python:        3.13 (venv ที่ classroom-hub/.venv)
Node:          v26.5.1
Git push:      ผ่าน SSH key (คำสั่งในข้อ 2.4)
ทดสอบ deploy:  curl -s https://classroomanalize.ekai.workers.dev/ | grep app.js
เครื่องมือ AI:  Google Antigravity (ครูใช้เขียนโค้ดในเครื่องตัวเอง, login e1234k@gmail.com)
```

---

*เอกสารนี้เขียนสำหรับส่งต่อให้ AI/นักพัฒนาตัวอื่นทำงานต่อ — ข้อมูลยืนยันจากการทดสอบจริง ณ 10 ก.ย. 2026*
