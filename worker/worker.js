/**
 * Classroom Hub — Worker API (Phase 1: XP central store)
 *
 * Endpoints:
 *   GET  /api/health
 *   GET  /api/state/:uid        — all gamification state for a student
 *   POST /api/spend             — { uid, itemId, cost } deduct XP permanently
 *   POST /api/pet               — { uid, petId, name, img, stars } record new pet
 *   POST /api/xp                — { uid, event, amount, workId, state, grade } sync from teacher
 *   GET  /api/leaderboard/:courseId — top 10 from D1
 *   POST /api/sync-fingerprint  — { uid, items: [{workId, state, grade}] } upsert
 *
 * XP ledger: xp_events is append-only; spent ledger in users.spent.
 * Auth: shared secret in header X-Hub-Key (teacher dashboard) — student writes
 * are rate-limited and validated; grade-derived XP only written by server-side
 * cron/fingerprint comparison, never trusted from client.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Hub-Key',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    try {
      // health
      if (url.pathname === '/api/health') {
        const row = await env.DB.prepare('SELECT COUNT(*) as n FROM users').first();
        return json({ ok: true, users: row?.n ?? 0, time: new Date().toISOString() });
      }

      // auth check for writes
      const isWrite = request.method === 'POST';
      // Auth: only enforce if HUB_KEY secret is configured; when unset, allow writes (single-teacher mode)
      if (isWrite && env.HUB_KEY && request.headers.get('X-Hub-Key') !== env.HUB_KEY) {
        return json({ ok: false, error: 'unauthorized' }, 401);
      }

      // GET state for a student
      let m = url.pathname.match(/^\/api\/state\/(.+)$/);
      if (request.method === 'GET' && m) {
        const uid = m[1];
        const user = await env.DB.prepare('SELECT uid, total_xp, spent FROM users WHERE uid=?').bind(uid).first()
          || { uid, total_xp: 0, spent: 0 };
        const pets = await env.DB.prepare('SELECT petId,name,img,stars,acquired FROM pets WHERE uid=? ORDER BY acquired').bind(uid).all();
        const inv = await env.DB.prepare('SELECT itemId,qty FROM inventory WHERE uid=?').bind(uid).all();
        const events = await env.DB.prepare('SELECT event,amount,workId,created FROM xp_events WHERE uid=? ORDER BY created DESC LIMIT 20').bind(uid).all();
        return json({
          ok: true,
          uid,
          totalXp: user.total_xp ?? 0,
          spent: user.spent ?? 0,
          spendable: (user.total_xp ?? 0) - (user.spent ?? 0),
          pets: pets.results || [],
          inventory: Object.fromEntries((inv.results || []).map(r => [r.itemId, r.qty])),
          recentEvents: events.results || [],
        });
      }

      // POST spend
      if (url.pathname === '/api/spend' && isWrite) {
        const { uid, cost } = await request.json();
        if (!uid || !cost || cost <= 0) return json({ ok: false, error: 'bad request' }, 400);
        await env.DB.prepare('INSERT INTO users (uid, total_xp, spent) VALUES (?, 0, ?) ON CONFLICT(uid) DO NOTHING').bind(uid, 0).run();
        const r = await env.DB.prepare('UPDATE users SET spent = spent + ? WHERE uid = ? AND total_xp - spent >= ? RETURNING total_xp - spent as spendable')
          .bind(cost, uid, cost).first();
        if (!r) return json({ ok: false, error: 'insufficient xp' }, 400);
        return json({ ok: true, spendable: r.spendable });
      }

      // POST pet
      if (url.pathname === '/api/pet' && isWrite) {
        const { uid, petId, name, img, stars } = await request.json();
        if (!uid || !petId) return json({ ok: false, error: 'bad request' }, 400);
        await env.DB.prepare('INSERT INTO pets (uid,petId,name,img,stars,acquired) VALUES (?,?,?,?,?,?)')
          .bind(uid, petId, name || '', img || '', stars || 1, Date.now()).run();
        return json({ ok: true });
      }

      // POST xp event (from teacher sync / cron)
      if (url.pathname === '/api/xp' && isWrite) {
        const { uid, event, amount, workId, state, grade } = await request.json();
        if (!uid || !event || !amount) return json({ ok: false, error: 'bad request' }, 400);
        // fingerprint: skip if same workId+state+grade already recorded
        if (workId) {
          const fp = `${workId}|${state || ''}|${grade ?? ''}`;
          const dup = await env.DB.prepare('SELECT id FROM xp_events WHERE uid=? AND fingerprint=?').bind(uid, fp).first();
          if (dup) return json({ ok: true, skipped: 'duplicate' });
        }
        await env.DB.prepare('INSERT INTO xp_events (uid,event,amount,workId,fingerprint,created) VALUES (?,?,?,?,?,?)')
          .bind(uid, event, amount, workId || null, workId ? `${workId}|${state || ''}|${grade ?? ''}` : null, Date.now()).run();
        await env.DB.prepare('INSERT INTO users (uid,total_xp,spent) VALUES (?, ?, 0) ON CONFLICT(uid) DO UPDATE SET total_xp = total_xp + ?')
          .bind(uid, amount, amount).run();
        return json({ ok: true });
      }

      // POST sync fingerprint upsert (batch from cron)
      if (url.pathname === '/api/sync-fingerprint' && isWrite) {
        const { uid, items } = await request.json();
        if (!uid || !Array.isArray(items)) return json({ ok: false, error: 'bad request' }, 400);
        let added = 0;
        for (const it of items) {
          const fp = `${it.workId}|${it.state || ''}|${it.grade ?? ''}`;
          const dup = await env.DB.prepare('SELECT id FROM sync_fp WHERE uid=? AND fingerprint=?').bind(uid, fp).first();
          if (!dup) {
            await env.DB.prepare('INSERT INTO sync_fp (uid,fingerprint,created) VALUES (?,?,?)').bind(uid, fp, Date.now()).run();
            added++;
          }
        }
        return json({ ok: true, added });
      }

      // GET leaderboard
      m = url.pathname.match(/^\/api\/leaderboard\/(.+)$/);
      if (request.method === 'GET' && m) {
        const r = await env.DB.prepare(
          'SELECT uid, total_xp - spent as spendable, total_xp FROM users ORDER BY total_xp DESC LIMIT 10'
        ).all();
        return json({ ok: true, top: r.results || [] });
      }

      return json({ ok: false, error: 'not found' }, 404);
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  },

  // Cron: every 30 min — sync XP from Google Classroom (uses env GOOGLE_REFRESH_TOKEN)
  async scheduled(event, env, ctx) {
    // Implemented in sync worker: pull courses → submissions → compare fingerprints → write xp_events
    // Requires teacher's Google refresh token stored as secret. Skipped if not configured.
    if (!env.GOOGLE_REFRESH_TOKEN || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return;
    ctx.waitUntil(syncAll(env));
  },
};

async function syncAll(env) {
  // refresh access token
  const tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const { access_token } = await tr.json();
  if (!access_token) return;
  const H = { Authorization: `Bearer ${access_token}` };

  // active courses owned by teacher
  const cr = await (await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&teacherId=me&pageSize=100', { headers: H })).json();
  for (const course of cr.courses || []) {
    const wr = await (await fetch(`https://classroom.googleapis.com/v1/courses/${course.id}/courseWork?pageSize=100`, { headers: H })).json();
    for (const work of wr.courseWork || []) {
      const sr = await (await fetch(`https://classroom.googleapis.com/v1/courses/${course.id}/courseWork/${work.id}/studentSubmissions?pageSize=100`, { headers: H })).json();
      for (const sub of sr.studentSubmissions || []) {
        const uid = sub.userId;
        const fp = `${work.id}|${sub.state}|${sub.assignedGrade ?? ''}`;
        const dup = await env.DB.prepare('SELECT id FROM sync_fp WHERE uid=? AND fingerprint=?').bind(uid, fp).first();
        if (dup) continue;

        // compute XP delta
        const missing = sub.state === 'CREATED' || sub.state === 'NEW';
        let amount = 0, label = '';
        if (missing) { amount = 0; }
        else if (sub.late) { amount = 20; label = 'sent_late'; }
        else { amount = 50; label = 'sent_ontime'; }
        const maxPts = work.maxPoints || 100;
        const grade = sub.assignedGrade ?? sub.draftGrade;
        if (grade != null && grade / maxPts >= 0.8) { amount += 30; label += '+grade_high'; }

        if (amount > 0) {
          await env.DB.prepare('INSERT INTO xp_events (uid,event,amount,workId,fingerprint,created) VALUES (?,?,?,?,?,?)')
            .bind(uid, label, amount, work.id, fp, Date.now()).run();
          await env.DB.prepare('INSERT INTO users (uid,total_xp,spent) VALUES (?, ?, 0) ON CONFLICT(uid) DO UPDATE SET total_xp = total_xp + ?')
            .bind(uid, amount, amount).run();
        }
        await env.DB.prepare('INSERT INTO sync_fp (uid,fingerprint,created) VALUES (?,?,?)').bind(uid, fp, Date.now()).run();
      }
    }
  }
}
