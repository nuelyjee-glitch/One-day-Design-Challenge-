const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const WHATSAPP_NUMBER = (process.env.ORGANIZER_WHATSAPP || '').replace(/\D/g, '');
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const MAX_PARTICIPANTS = 15;
const BUCKET = 'challenge-entries';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Please upload a PNG or JPG image.'), allowed.includes(file.mimetype));
  }
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function admin(req, res, next) {
  const token = req.get('x-admin-token');
  if (!ADMIN_PASSWORD || !token || !safeEqual(token, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }
  next();
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function configError(res) {
  if (!supabase) return res.status(503).json({ error: 'The website database is not configured yet. Follow SETUP.md.' });
  return null;
}
function nowNigerian() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
}
function eventState() {
  const now = nowNigerian();
  const start = new Date('2026-10-24T09:00:00');
  const open = new Date('2026-10-24T18:00:00');
  const close = new Date('2026-10-24T21:00:00');
  if (now < start) return { phase: 'before_brief', message: 'The design brief will be released on Saturday at 9:00 a.m. WAT.' };
  if (now < open) return { phase: 'brief_live', message: 'The brief is available. Submissions open at 6:00 p.m. WAT.' };
  if (now < close) return { phase: 'submissions_open', message: 'Submissions are open. The deadline is 9:00 p.m. WAT.' };
  return { phase: 'closed', message: 'Submissions are closed. Results will be published after judging.' };
}
async function dbQuery(query, res) {
  const { data, error } = await query;
  if (error) { console.error(error); res.status(500).json({ error: 'A database operation failed. Please try again.' }); return null; }
  return data;
}
app.get('/api/status', async (req, res) => {
  if (configError(res)) return;
  const { count, error } = await supabase.from('participants').select('*', { count: 'exact', head: true });
  if (error) return res.status(500).json({ error: 'Could not load registration status.' });
  res.json({ ...eventState(), registered: count || 0, maxParticipants: MAX_PARTICIPANTS, registrationOpen: (count || 0) < MAX_PARTICIPANTS });
});
app.get('/api/brief', (req, res) => {
  const state = eventState();
  if (state.phase === 'before_brief') return res.status(403).json({ error: 'The brief has not been released yet.' });
  res.json({ title: 'One-Day Design Challenge', brief: process.env.DESIGN_BRIEF || 'The organizer will publish the official brief here. Check this page after 9:00 a.m. WAT on Saturday.', state });
});
app.post('/api/register', async (req, res) => {
  if (configError(res)) return;
  const name = String(req.body.creativeName || '').trim().slice(0, 60);
  const phone = String(req.body.phone || '').replace(/[^\d+]/g, '').slice(0, 20);
  if (name.length < 2 || phone.replace(/\D/g, '').length < 7) return res.status(400).json({ error: 'Enter a creative name and a valid phone number.' });
  const { count, error: countError } = await supabase.from('participants').select('*', { count: 'exact', head: true });
  if (countError) return res.status(500).json({ error: 'Could not check registration capacity.' });
  if ((count || 0) >= MAX_PARTICIPANTS) return res.status(409).json({ error: 'Registration is full. The 15 participant limit has been reached.' });
  const { data: duplicate } = await supabase.from('participants').select('id').eq('phone', phone).maybeSingle();
  if (duplicate) return res.status(409).json({ error: 'This phone number is already registered.' });
  const { data, error } = await supabase.from('participants').insert({ creative_name: name, phone }).select('id, creative_name').single();
  if (error) { console.error(error); return res.status(500).json({ error: 'Registration could not be completed. Please try again.' }); }
  res.json({ message: 'Registration successful. Keep your participant name safe.', participant: data });
});
app.post('/api/submit', upload.single('design'), async (req, res) => {
  if (configError(res)) return;
  const phase = eventState().phase;
  if (phase !== 'submissions_open') return res.status(403).json({ error: 'Submissions are only accepted from 6:00 p.m. to 9:00 p.m. WAT on Saturday, 24 October 2026.' });
  const participantId = String(req.body.participantId || '').trim();
  if (!participantId || !req.file) return res.status(400).json({ error: 'Enter the participant ID provided after registration and choose a PNG or JPG design.' });
  const { data: participant, error: pError } = await supabase.from('participants').select('id').eq('id', participantId).maybeSingle();
  if (pError || !participant) return res.status(400).json({ error: 'Participant ID not found. Use the ID shown after registration.' });
  const { data: existing } = await supabase.from('submissions').select('id').eq('participant_id', participantId).maybeSingle();
  if (existing) return res.status(409).json({ error: 'A submission has already been received for this participant.' });
  const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
  const objectPath = `${participantId}/${crypto.randomUUID()}.${ext}`;
  const { error: storageError } = await supabase.storage.from(BUCKET).upload(objectPath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
  if (storageError) { console.error(storageError); return res.status(500).json({ error: 'Could not store the design. Please contact the organizer.' }); }
  const { error } = await supabase.from('submissions').insert({ participant_id: participantId, object_path: objectPath, submitted_at: new Date().toISOString() });
  if (error) { console.error(error); return res.status(500).json({ error: 'The image was uploaded but the submission record could not be saved. Contact the organizer.' }); }
  res.json({ message: 'Submission received. Entries remain private until submissions close.' });
});
app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin password has not been configured in Render.' });
  if (!safeEqual(String(req.body.password || ''), ADMIN_PASSWORD)) return res.status(401).json({ error: 'Incorrect admin password.' });
  res.json({ token: ADMIN_PASSWORD });
});
app.get('/api/admin/entries', admin, async (req, res) => {
  if (configError(res)) return;
  const { data, error } = await supabase.from('participants')
    .select('id, creative_name, created_at, submissions(id, object_path, submitted_at, concept_score, typography_score, colour_score, layout_score, total_score)')
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: 'Could not load entries.' });
  const entries = [];
  for (const p of data || []) {
    const s = (p.submissions || [])[0];
    let imageUrl = null;
    if (s) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(s.object_path, 3600);
      imageUrl = signed?.signedUrl || null;
    }
    entries.push({ id: p.id, creativeName: p.creative_name, registeredAt: p.created_at, submission: s ? { ...s, imageUrl } : null });
  }
  res.json({ entries, maxParticipants: MAX_PARTICIPANTS });
});
app.post('/api/admin/score', admin, async (req, res) => {
  if (configError(res)) return;
  const { submissionId, concept, typography, colour, layout } = req.body;
  const scores = [concept, typography, colour, layout].map(Number);
  if (!submissionId || scores.some(n => !Number.isInteger(n) || n < 0 || n > 25)) return res.status(400).json({ error: 'Each score must be a whole number from 0 to 25.' });
  const total = scores.reduce((a, b) => a + b, 0);
  const { error } = await supabase.from('submissions').update({
    concept_score: scores[0], typography_score: scores[1], colour_score: scores[2], layout_score: scores[3], total_score: total
  }).eq('id', submissionId);
  if (error) return res.status(500).json({ error: 'Could not save scores.' });
  res.json({ message: 'Scores saved.', total });
});
app.post('/api/admin/publish', admin, async (req, res) => {
  if (configError(res)) return;
  const { published } = req.body;
  const { error } = await supabase.from('site_settings').upsert({ key: 'results_published', value: published ? 'true' : 'false' });
  if (error) return res.status(500).json({ error: 'Could not update results visibility.' });
  res.json({ message: published ? 'Results are now public.' : 'Results are hidden.' });
});
app.get('/api/results', async (req, res) => {
  if (configError(res)) return;
  const { data: setting } = await supabase.from('site_settings').select('value').eq('key', 'results_published').maybeSingle();
  if (setting?.value !== 'true') return res.json({ published: false, results: [] });
  const { data, error } = await supabase.from('submissions')
    .select('concept_score, typography_score, colour_score, layout_score, total_score, participants(creative_name)')
    .not('total_score', 'is', null).order('total_score', { ascending: false });
  if (error) return res.status(500).json({ error: 'Could not load results.' });
  res.json({ published: true, results: (data || []).map((x, i) => ({ rank: i + 1, creativeName: x.participants?.creative_name || 'Participant', concept: x.concept_score, typography: x.typography_score, colour: x.colour_score, layout: x.layout_score, total: x.total_score })) });
});
app.get('/api/prize-contact', (req, res) => {
  if (!WHATSAPP_NUMBER) return res.status(404).json({ error: 'Prize contact has not been configured.' });
  res.json({ url: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hello, I am contacting you about the One-Day Design Challenge prize.')}` });
});
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 8 MB or smaller.' : 'Please upload one image only.' });
  if (err) return res.status(400).json({ error: err.message || 'Request could not be processed.' });
  next();
});
app.listen(PORT, () => console.log(`One-Day Design Challenge running on port ${PORT}`));
