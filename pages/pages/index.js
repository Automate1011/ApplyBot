// pages/index.js — ApplyBot full app

import { useState, useEffect, useRef } from "react";
import Head from "next/head";

/* ─── STORAGE ─── */
const DB = {
  get:   k     => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set:   (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const STORE = "applybot_v4";

/* ─── HELPERS ─── */
const uid   = () => Math.random().toString(36).slice(2, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const JOB_TYPES    = ["Any", "Full Time", "Part Time", "Contract", "Temporary"];
const SHIFT_TYPES   = ["Any", "Night Shift", "Weekend", "Days", "Evenings", "Rotating"];
const APP_STATUSES  = ["Applied", "Interview Booked", "Interview Done", "Offer Received", "Rejected", "Withdrawn"];

/* ─── API CALLS (to our own server — no CORS) ─── */
async function searchJobs(keywords, location, jobType) {
  const params = new URLSearchParams({ keywords, location: location || "London", jobType: jobType || "Any", resultsToTake: 20 });
  const res = await fetch(`/api/jobs?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Search failed ${res.status}`);
  return data.jobs || [];
}

async function aiCall(system, user, maxTokens = 1200) {
  const res = await fetch("/api/ai", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ system, user, maxTokens }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "AI call failed");
  return data.text || "";
}

async function buildKeywords(jobDesc, shiftType) {
  const shift = shiftType && shiftType !== "Any" ? ` (shift: ${shiftType})` : "";
  try {
    const txt = await aiCall(
      `You are a UK job search expert. Extract specific job title search terms from this job description.
Return ONLY a JSON array of 4-6 short job title strings suitable for searching Reed.co.uk.
Each string must be a real job title — NOT a sentence, NOT a description.
Good examples: ["security guard", "door supervisor", "retail security officer", "delivery driver", "customer service advisor", "courier"]
Bad examples: ["Abdinnaser is looking", "roles in London", "someone with experience"]
Return the JSON array only, nothing else.`,
      `Job description: ${jobDesc}${shift}\n\nReturn JSON array of job title search terms only.`,
      400
    );
    const clean = txt.replace(/\`\`\`json|\`\`\`/gi, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { const m = clean.match(/\[[\s\S]*?\]/); if (m) parsed = JSON.parse(m[0]); }
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, 6).map(k => String(k).trim()).filter(Boolean);
    }
  } catch (e) { console.warn("keyword AI failed:", e.message); }
  return ["security guard", "customer service", "delivery driver", "door supervisor"];
}

async function tailorCVForJob(cv, job) {
  return await aiCall(
    `You are an expert UK CV writer. Rewrite ONLY the personal profile / professional summary section of the CV to match this specific job. Keep ALL other sections completely unchanged word for word. Rules: 3–5 natural sentences, match the original tone, include job keywords naturally, sound human. Output the COMPLETE CV text only — no labels, no markdown, no commentary.`,
    `JOB TITLE: ${job.title}\nCOMPANY: ${job.company}\nJOB DESCRIPTION:\n${job.description.slice(0, 1200)}\n\nCV:\n${cv}\n\nReturn the complete tailored CV now.`
  );
}

async function scoreJobs(jobs, cv, jobDesc) {
  const list = jobs.slice(0, 20).map((j, i) => `${i + 1}. ${j.title} at ${j.company} — ${j.description.slice(0, 120)}`).join("\n");
  try {
    const txt = await aiCall(
      `You are a UK recruiter. Score each job 1–10 for how well it matches the candidate. Return ONLY a JSON array: [{"i":1,"score":8,"reason":"brief reason"},...]`,
      `Candidate wants: ${jobDesc.slice(0, 300)}\nCV summary: ${cv.slice(0, 300)}\n\nJobs:\n${list}\n\nReturn JSON array only.`,
      1500
    );
    const clean = txt.replace(/```json|```/gi, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { const m = clean.match(/\[[\s\S]*\]/); if (m) parsed = JSON.parse(m[0]); }
    if (Array.isArray(parsed)) {
      return jobs.map((j, i) => {
        const s = parsed.find(p => p.i === i + 1);
        return s ? { ...j, score: s.score, reason: s.reason } : j;
      });
    }
  } catch (e) { console.warn("scoring failed:", e.message); }
  return jobs;
}

/* ─── THEME ─── */
const C = {
  navy: "#0b1f3a", gold: "#c9a84c", green: "#1a7a4a", red: "#c0392b",
  slate: "#5a6b87", light: "#8a9bb5", border: "#dde4f0",
  bg: "#f0f4fb", white: "#fff", text: "#1a2640",
  goldPale: "#fdf6e3", greenBg: "#edfaf3", redBg: "#fff0f0",
};

const IS = { padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, background: C.white, width: "100%", fontFamily: "inherit" };

/* ─── ATOMS ─── */
const Spin = ({ size = 16, color = "#fff" }) => (
  <span style={{ display: "inline-block", width: size, height: size, border: `2.5px solid ${color}44`, borderTop: `2.5px solid ${color}`, borderRadius: "50%", animation: "spin .7s linear infinite", flexShrink: 0 }} />
);

function Btn({ children, onClick, disabled, loading, variant = "navy", small, block, style: xs = {} }) {
  const vs = {
    navy:   { background: C.navy,  color: "#fff", border: "none" },
    gold:   { background: C.gold,  color: "#fff", border: "none" },
    green:  { background: C.green, color: "#fff", border: "none" },
    ghost:  { background: "transparent", color: C.slate, border: `1.5px solid ${C.border}` },
    danger: { background: C.redBg, color: C.red,  border: `1.5px solid ${C.red}44` },
  };
  const v = vs[variant] || vs.navy;
  return (
    <button onClick={onClick} disabled={disabled || loading}
      style={{ ...v, padding: small ? "7px 14px" : "11px 22px", borderRadius: 8, cursor: (disabled || loading) ? "not-allowed" : "pointer", fontWeight: 700, fontSize: small ? 12 : 14, fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: (disabled || loading) ? 0.5 : 1, width: block ? "100%" : "auto", transition: "opacity .15s, transform .1s", ...xs }}
      onMouseEnter={e => { if (!disabled && !loading) { e.currentTarget.style.opacity = ".82"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
      onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}>
      {loading ? <Spin color={variant === "ghost" ? C.slate : "#fff"} /> : children}
    </button>
  );
}

function Inp({ label, hint, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 700, color: C.light, letterSpacing: ".07em", textTransform: "uppercase" }}>{label}{hint && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 11, marginLeft: 6 }}>{hint}</span>}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={IS} />
    </div>
  );
}

function TA({ label, hint, value, onChange, placeholder, height = 160 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 700, color: C.light, letterSpacing: ".07em", textTransform: "uppercase" }}>{label}{hint && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 11, marginLeft: 6 }}>{hint}</span>}</label>}
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...IS, height, resize: "vertical", lineHeight: 1.65 }} />
    </div>
  );
}

function DD({ label, value, onChange, options }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 700, color: C.light, letterSpacing: ".07em", textTransform: "uppercase" }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...IS, cursor: "pointer" }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

const Card = ({ children, style }) => <div style={{ background: C.white, borderRadius: 14, padding: "22px 26px", boxShadow: "0 2px 18px rgba(11,31,58,.07)", border: `1px solid ${C.border}`, ...style }}>{children}</div>;
const H2 = ({ children }) => <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 21, fontWeight: 700, color: C.navy, marginBottom: 14 }}>{children}</div>;

const TopBar = ({ title, onBack, backLabel, onSettings }) => (
  <div style={{ background: C.navy, height: 54, padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 2px 12px rgba(11,31,58,.3)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: C.gold, cursor: "pointer", fontWeight: 700, fontSize: 13, padding: 0, fontFamily: "inherit" }}>← {backLabel || "Back"}</button>}
      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: "#fff", fontWeight: 700 }}>{title || "ApplyBot 🤖"}</span>
    </div>
    {onSettings && <button onClick={onSettings} style={{ background: "none", border: "1px solid #1e4a82", color: C.light, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>⚙ Settings</button>}
  </div>
);

const Skel = () => (
  <div style={{ background: C.white, borderRadius: 12, padding: "18px 20px", border: `1px solid ${C.border}` }}>
    {[70, 45, 90, 35].map((w, i) => <div key={i} style={{ height: 11, borderRadius: 6, marginBottom: 9, width: `${w}%`, background: "linear-gradient(90deg,#eee 25%,#f5f5f5 50%,#eee 75%)", backgroundSize: "400px 100%", animation: "shimmer 1.4s infinite" }} />)}
  </div>
);

const scoreStyle = s => s >= 7 ? { bg: C.greenBg, border: "#1a7a4a44", text: C.green } : s >= 4 ? { bg: "#fff8e8", border: "#c9a84c44", text: "#7a5800" } : { bg: C.redBg, border: `${C.red}44`, text: C.red };

/* ─── QUICK APPLY MODAL ─── */
function ApplyModal({ job, client, cvText, onClose, onMarkApplied }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState([false, false, false]);
  const mark = i => { const n = [...done]; n[i] = true; setDone(n); };

  const dlCV = () => {
    const safe = cvText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'><head><meta charset='utf-8'><style>body{font-family:Calibri,sans-serif;font-size:11pt;margin:2cm}pre{white-space:pre-wrap;line-height:1.6;font-family:Calibri}</style></head><body><pre>${safe}</pre></body></html>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" }));
    a.download = `${(client.name || "CV").replace(/\s+/g, "_")}_${(job.title || "job").replace(/[^a-z0-9]/gi, "_")}.doc`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    mark(0); setStep(s => Math.max(s, 1));
  };
  const cpDetails = () => {
    const lines = [client.name && `Name: ${client.name}`, client.email && `Email: ${client.email}`, client.phone && `Phone: ${client.phone}`, client.address && `Address: ${client.address}`].filter(Boolean);
    navigator.clipboard.writeText(lines.join("\n") || client.name || "");
    mark(1); setStep(s => Math.max(s, 2));
  };
  const openJob = () => { window.open(job.url, "_blank"); mark(2); setStep(3); };

  const steps = [
    { icon: "⬇", label: "Download tailored CV",    sub: "Saves as a Word .doc file",           btn: done[0] ? "✓ Downloaded" : "Download CV",  action: dlCV },
    { icon: "📋", label: "Copy contact details",    sub: "Paste into the application form",     btn: done[1] ? "✓ Copied"    : "Copy Details",   action: cpDetails },
    { icon: "🌐", label: "Open application page",   sub: "Opens employer's page in new tab",    btn: "Open Page",                               action: openJob },
    { icon: "✅", label: "Mark as applied",          sub: "Saves to your application tracker",   btn: "Done — Mark Applied",                     action: () => { onMarkApplied(); onClose(); } },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,31,58,.65)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 18, padding: "28px 32px", maxWidth: 460, width: "100%", boxShadow: "0 12px 50px rgba(11,31,58,.3)", animation: "slideIn .25s ease" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 23, fontWeight: 700, color: C.navy, marginBottom: 4 }}>⚡ Quick Apply</div>
        <div style={{ color: C.slate, fontSize: 13, marginBottom: 20 }}>{job.title}{job.company ? ` · ${job.company}` : ""}</div>
        <div style={{ display: "grid", gap: 9, marginBottom: 22 }}>
          {steps.map((s, i) => {
            const active = i === step, isDone = done[i] || i < step;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: isDone ? C.greenBg : active ? "#f4f7ff" : C.bg, border: `1.5px solid ${isDone ? "#1a7a4a55" : active ? C.gold + "99" : C.border}`, transition: "all .2s" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, background: isDone ? C.green : active ? C.gold : C.border, color: "#fff", transition: "background .2s" }}>
                  {isDone ? "✓" : s.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: isDone ? C.green : C.navy }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: C.light, marginTop: 1 }}>{s.sub}</div>
                </div>
                {(active || isDone) && <Btn small variant={isDone && i < 3 ? "ghost" : "gold"} disabled={isDone && i < 3} onClick={s.action}>{s.btn}</Btn>}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={onClose}>Close</Btn></div>
      </div>
    </div>
  );
}

/* ─── HOME ─── */
function HomeScreen({ clients, onAdd, onOpen, onSettings }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <TopBar onSettings={onSettings} />
      <div style={{ maxWidth: 740, margin: "0 auto", padding: "28px 20px", animation: "fadeUp .35s ease" }}>
        <div style={{ background: `linear-gradient(135deg,${C.navy} 0%,#1a3f73 100%)`, borderRadius: 16, padding: "28px 32px", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, color: "#fff", fontWeight: 700, marginBottom: 6 }}>ApplyBot 🤖</div>
          <p style={{ color: C.light, fontSize: 14, lineHeight: 1.65, marginBottom: 20 }}>Add a client → jobs found from Reed.co.uk automatically → CVs tailored → you apply</p>
          <Btn variant="gold" onClick={onAdd}>+ Add Client</Btn>
        </div>
        {clients.length === 0 ? (
          <Card style={{ textAlign: "center", padding: "44px 28px" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>👤</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: C.navy, fontWeight: 700, marginBottom: 8 }}>No clients yet</div>
            <p style={{ color: C.slate, fontSize: 14, marginBottom: 20 }}>Add your first client to get started</p>
            <Btn variant="gold" onClick={onAdd}>+ Add First Client</Btn>
          </Card>
        ) : (
          <>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: C.navy, fontWeight: 700, marginBottom: 12 }}>Your Clients ({clients.length})</div>
            <div style={{ display: "grid", gap: 10 }}>
              {clients.map(c => {
                const apps = c.applications || [];
                return (
                  <Card key={c.id} style={{ padding: "16px 20px", cursor: "pointer", transition: "all .2s" }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 24px rgba(11,31,58,.14)"; e.currentTarget.style.borderColor = C.gold + "99"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = ""; }}
                    onClick={() => onOpen(c)}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.navy, display: "flex", alignItems: "center", justifyContent: "center", color: C.gold, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
                          {(c.name || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: C.navy, marginBottom: 3 }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: C.slate, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            {c.location && <span>📍 {c.location}</span>}
                            {c.jobType && c.jobType !== "Any" && <span style={{ background: "#0b1f3a18", color: C.navy, padding: "1px 8px", borderRadius: 99, fontWeight: 600 }}>{c.jobType}</span>}
                            {c.shiftType && c.shiftType !== "Any" && <span style={{ background: C.gold + "18", color: C.gold, padding: "1px 8px", borderRadius: 99, fontWeight: 600 }}>{c.shiftType}</span>}
                            {apps.length > 0 && <span style={{ color: C.green, fontWeight: 700 }}>✓ {apps.length} applied</span>}
                          </div>
                        </div>
                      </div>
                      <Btn small variant="gold" onClick={e => { e.stopPropagation(); onOpen(c); }}>Open →</Btn>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── EDIT CLIENT ─── */
function EditScreen({ client, onSave, onDelete, onBack }) {
  const [f, setF] = useState({
    name: client.name || "", email: client.email || "", phone: client.phone || "",
    address: client.address || "", location: client.location || "",
    jobType: client.jobType || "Any", shiftType: client.shiftType || "Any",
    jobDesc: client.jobDesc || "", cv: client.cv || "",
  });
  const upd = k => v => setF(p => ({ ...p, [k]: v }));
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  const save = () => {
    if (!f.name.trim())     { setErr("Please enter the client's name.");       return; }
    if (!f.location.trim()) { setErr("Please enter their job search location."); return; }
    if (!f.jobDesc.trim())  { setErr("Please describe what jobs they want.");   return; }
    setErr(""); setOk(true);
    onSave({ ...client, ...f, name: f.name.trim(), location: f.location.trim(), jobDesc: f.jobDesc.trim(), cv: f.cv.trim(), isNew: false });
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <TopBar title={client.isNew ? "New Client" : `Edit — ${client.name || "Client"}`} onBack={onBack} backLabel="Back" />
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "28px 20px", animation: "fadeUp .35s ease" }}>
        <Card style={{ marginBottom: 14 }}>
          <H2>Personal Details</H2>
          <p style={{ color: C.slate, fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>Email, phone and address are copied to clipboard during Quick Apply</p>
          <div style={{ display: "grid", gap: 13 }}>
            <Inp label="Full Name *" value={f.name} onChange={upd("name")} placeholder="e.g. Abdinnaser" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Inp label="Email" value={f.email} onChange={upd("email")} placeholder="email@example.com" />
              <Inp label="Phone" value={f.phone} onChange={upd("phone")} placeholder="07700 900000" />
            </div>
            <Inp label="Home Address" hint="(optional)" value={f.address} onChange={upd("address")} placeholder="e.g. Friern Barnet, London N11 3EY" />
            <Inp label="Job Search Location *" value={f.location} onChange={upd("location")} placeholder="e.g. Friern Barnet London" />
          </div>
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <H2>Job Preferences</H2>
          <p style={{ color: C.slate, fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>Write naturally — this is used to search Reed.co.uk automatically when you open the client</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 13 }}>
            <DD label="Job Type" value={f.jobType} onChange={upd("jobType")} options={JOB_TYPES} />
            <DD label="Shift Preference" value={f.shiftType} onChange={upd("shiftType")} options={SHIFT_TYPES} />
          </div>
          <TA label="Describe what jobs they want *"
            hint="— write naturally, as much detail as possible"
            value={f.jobDesc} onChange={upd("jobDesc")}
            placeholder="e.g. Abdinnaser is looking for security guard, door supervisor or retail security roles around Friern Barnet London N11. He holds an SIA licence and first aid certificate with 3 months mobile patrol experience. Also open to customer service, delivery or courier work — 3 years Deliveroo experience and owns a motorbike. Available any shift including nights and weekends."
            height={140} />
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <H2>CV</H2>
          <TA label="Paste full CV text *"
            hint="— personal profile, work experience, education, skills"
            value={f.cv} onChange={upd("cv")}
            placeholder="Paste the complete CV here — make sure the personal profile / summary is at the top as that gets rewritten for each job…"
            height={280} />
          <p style={{ fontSize: 12, color: C.light, marginTop: 7 }}>💡 The personal profile gets rewritten for each job — everything else stays the same</p>
        </Card>

        {err && <div style={{ background: C.redBg, border: `1px solid ${C.red}44`, borderRadius: 10, padding: "11px 15px", fontSize: 13, color: C.red, marginBottom: 14, fontWeight: 500 }}>⚠ {err}</div>}
        {ok  && <div style={{ background: C.greenBg, border: `1px solid ${C.green}44`, borderRadius: 10, padding: "11px 15px", fontSize: 13, color: C.green, marginBottom: 14, fontWeight: 700 }}>✓ Client saved!</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {!client.isNew && <Btn variant="danger" onClick={() => { if (window.confirm(`Delete ${client.name}?`)) onDelete(client.id); }}>🗑 Delete</Btn>}
          <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
            <Btn variant="ghost" onClick={onBack}>Cancel</Btn>
            <Btn variant="gold" onClick={save}>Save Client ✓</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── DASHBOARD ─── */
function Dashboard({ client, onEdit, onBack, onSettings, onClientUpdate }) {
  const [phase,      setPhase]      = useState("idle");
  const [statusMsg,  setStatusMsg]  = useState("");
  const [errMsg,     setErrMsg]     = useState("");
  const [jobs,       setJobs]       = useState([]);
  const [tailoring,  setTailoring]  = useState(new Set());
  const [tailored,   setTailored]   = useState({});
  const [bulkBusy,   setBulkBusy]   = useState(false);
  const [bulkDone,   setBulkDone]   = useState(false);
  const [tab,        setTab]        = useState("jobs");
  const [modal,      setModal]      = useState(null);
  const [scoredCount,setScoredCount]= useState(0);
  const [mTitle,   setMTitle]   = useState("");
  const [mCompany, setMCompany] = useState("");
  const [mUrl,     setMUrl]     = useState("");
  const [mDesc,    setMDesc]    = useState("");
  const [mBusy,    setMBusy]    = useState(false);
  const [mErr,     setMErr]     = useState("");
  const started = useRef(false);
  const apps = client.applications || [];

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (client.jobDesc) runSearch();
    else setPhase("idle");
  }, []);

  const runSearch = async () => {
    setPhase("searching"); setStatusMsg("AI is reading job preferences and building search terms…");
    setErrMsg(""); setJobs([]); setScoredCount(0); setBulkDone(false); setTailored({});
    try {
      // Step 1: AI extracts proper job titles from the description
      const kws = await buildKeywords(client.jobDesc, client.shiftType || "Any");
      setStatusMsg(`Searching Reed.co.uk for: ${kws.join(", ")}`);

      // Step 2: Search Reed for each keyword, collect all results
      const allJobs = []; const seen = new Set();
      for (let i = 0; i < kws.length; i++) {
        const kw = kws[i];
        setStatusMsg(`Searching "${kw}"… (${i + 1}/${kws.length})`);
        try {
          const results = await searchJobs(kw, client.location || "London", client.jobType || "Any");
          for (const j of results) {
            if (!seen.has(j.id)) { seen.add(j.id); allJobs.push(j); }
          }
        } catch (e) { console.warn("search failed for", kw, e.message); }
        await sleep(300);
      }

      if (allJobs.length === 0) {
        setPhase("done"); setJobs([]);
        setErrMsg("No jobs found on Reed. Try editing the job description or use Manual Paste.");
        return;
      }

      // Step 3: Show jobs immediately
      setJobs([...allJobs]);
      setPhase("done");
      setStatusMsg(`Found ${allJobs.length} jobs — now scoring…`);

      // Step 4: Score all jobs against CV
      const scored = await scoreJobs(allJobs, client.cv || "", client.jobDesc);
      setJobs(scored.sort((a, b) => (b.score || 0) - (a.score || 0)));
      setScoredCount(scored.length);

    } catch (e) {
      setPhase("error"); setErrMsg(`Search failed: ${e.message}`);
    }
  };

  const tailorOne = async (job) => {
    if (!client.cv) { alert("No CV saved — edit the client profile first."); return; }
    setTailoring(p => new Set([...p, job.id]));
    try {
      const result = await tailorCVForJob(client.cv, job);
      setTailored(p => ({ ...p, [job.id]: result }));
    } catch (e) { alert("Tailoring failed: " + e.message); }
    setTailoring(p => { const s = new Set(p); s.delete(job.id); return s; });
  };

  const tailorAll = async () => {
    const top = jobs.filter(j => j.score >= 7 && !tailored[j.id] && !tailoring.has(j.id));
    if (!top.length) { alert("No high-scoring untailored jobs (score 7+)."); return; }
    setBulkBusy(true);
    for (const j of top) { await tailorOne(j); await sleep(400); }
    setBulkBusy(false); setBulkDone(true);
  };

  const tailorManual = async () => {
    if (!mDesc.trim()) { setMErr("Please paste a job description."); return; }
    if (!client.cv) { setMErr("No CV saved — edit the client profile first."); return; }
    setMBusy(true); setMErr("");
    const fakeJob = { id: `m_${Date.now()}`, title: mTitle || "Job Role", company: mCompany || "", url: mUrl || "#", salary: "", description: mDesc, posted: "Today" };
    try {
      const result = await tailorCVForJob(client.cv, fakeJob);
      setTailored(p => ({ ...p, [fakeJob.id]: result }));
      setJobs(p => [fakeJob, ...p]);
      setTab("jobs");
      setModal(fakeJob);
    } catch (e) { setMErr("Tailoring failed: " + e.message); }
    setMBusy(false);
  };

  const markApplied = (job) => {
    if (apps.find(a => a.jobId === job.id)) return;
    onClientUpdate({ ...client, applications: [{ jobId: job.id, title: job.title, company: job.company, salary: job.salary || "", date: new Date().toLocaleDateString("en-GB"), status: "Applied" }, ...apps] });
  };
  const setStatus = (jobId, status) => onClientUpdate({ ...client, applications: apps.map(a => a.jobId === jobId ? { ...a, status } : a) });
  const removeApp = jobId => onClientUpdate({ ...client, applications: apps.filter(a => a.jobId !== jobId) });

  const dlDoc = (job, cvText) => {
    const safe = cvText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'><head><meta charset='utf-8'><style>body{font-family:Calibri,sans-serif;font-size:11pt;margin:2cm}pre{white-space:pre-wrap;line-height:1.6;font-family:Calibri}</style></head><body><pre>${safe}</pre></body></html>`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" })); a.download = `${(client.name || "CV").replace(/\s+/g, "_")}_${(job.title || "job").replace(/[^a-z0-9]/gi, "_")}.doc`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const high = jobs.filter(j => j.score >= 7).length;

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <TopBar title={client.name} onBack={onBack} backLabel="All Clients" onSettings={onSettings} />
      {modal && tailored[modal.id] && <ApplyModal job={modal} client={client} cvText={tailored[modal.id]} onClose={() => setModal(null)} onMarkApplied={() => { markApplied(modal); setModal(null); }} />}

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "22px 20px" }}>
        {/* Client header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: C.navy, display: "flex", alignItems: "center", justifyContent: "center", color: C.gold, fontFamily: "'Cormorant Garamond', serif", fontSize: 21, fontWeight: 700, flexShrink: 0 }}>{(client.name || "?")[0].toUpperCase()}</div>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: C.navy }}>{client.name}</div>
              <div style={{ fontSize: 12, color: C.slate, marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {client.location && <span>📍 {client.location}</span>}
                {client.email && <span>✉ {client.email}</span>}
                {client.phone && <span>📞 {client.phone}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small variant="ghost" onClick={onEdit}>✏ Edit</Btn>
            <Btn small variant="navy" onClick={() => { started.current = false; setPhase("idle"); setJobs([]); setTimeout(runSearch, 100); }}>↺ Refresh Jobs</Btn>
          </div>
        </div>

        {/* Banners */}
        {phase === "searching" && <Card style={{ background: C.navy, border: "none", marginBottom: 14 }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><Spin size={20} /><div><div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{statusMsg}</div><div style={{ color: C.light, fontSize: 12, marginTop: 3 }}>Searching Reed.co.uk — usually takes 5–10 seconds</div></div></div></Card>}
        {errMsg && <Card style={{ background: C.redBg, border: `1px solid ${C.red}44`, marginBottom: 14 }}><div style={{ color: C.red, fontWeight: 700, marginBottom: 10 }}>⚠ {errMsg}</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Btn small variant="navy" onClick={() => { started.current = false; setErrMsg(""); runSearch(); }}>↺ Try Again</Btn><Btn small variant="ghost" onClick={onEdit}>Edit Job Description</Btn><Btn small variant="ghost" onClick={() => setTab("manual")}>✍ Paste Manually</Btn></div></Card>}
        {phase === "idle" && <Card style={{ textAlign: "center", padding: "32px", marginBottom: 14 }}><div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div><div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: C.navy, marginBottom: 8 }}>Ready to search</div><p style={{ color: C.slate, fontSize: 13, marginBottom: 18 }}>Click to search Reed.co.uk for matching jobs</p><Btn variant="gold" onClick={() => { started.current = false; runSearch(); }}>🚀 Search Jobs Now</Btn></Card>}

        {/* Stats */}
        {phase === "done" && jobs.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
            {[{ l: "Jobs Found", v: jobs.length, c: C.navy }, { l: "Strong Matches", v: high, c: C.green }, { l: "CVs Tailored", v: Object.keys(tailored).length, c: C.gold }, { l: "Applied", v: apps.length, c: C.green }].map(s => (
              <Card key={s.l} style={{ padding: "12px", textAlign: "center" }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>{s.l}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", background: C.white, borderRadius: 10, padding: 3, border: `1px solid ${C.border}`, marginBottom: 16 }}>
          {[["jobs", `🔍 Jobs (${jobs.length})`], ["manual", "✍ Manual Paste"], ["tracker", `📋 Tracker (${apps.length})`]].map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "8px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit", background: tab === t ? C.navy : "transparent", color: tab === t ? "#fff" : C.slate, transition: "all .2s" }}>{l}</button>
          ))}
        </div>

        {/* JOBS TAB */}
        {tab === "jobs" && (
          <>
            {phase === "searching" && jobs.length === 0 && <div style={{ display: "grid", gap: 10 }}>{[1, 2, 3, 4, 5].map(i => <Skel key={i} />)}</div>}
            {phase === "done" && jobs.length === 0 && !errMsg && <Card style={{ textAlign: "center", padding: "36px" }}><div style={{ fontSize: 32, marginBottom: 10 }}>🤷</div><div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: C.navy, marginBottom: 8 }}>No jobs found</div><p style={{ color: C.slate, fontSize: 13, marginBottom: 16 }}>Try editing the job description or use Manual Paste</p><div style={{ display: "flex", gap: 10, justifyContent: "center" }}><Btn small variant="ghost" onClick={onEdit}>Edit Job Description</Btn><Btn small variant="gold" onClick={() => setTab("manual")}>✍ Paste Manually</Btn></div></Card>}
            {jobs.length > 0 && (
              <>
                {high > 0 && <div style={{ background: C.greenBg, border: `1px solid ${C.green}44`, borderRadius: 10, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}><div style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>✨ {high} strong match{high > 1 ? "es" : ""} — tailor all CVs in one click</div><Btn small variant="green" onClick={tailorAll} loading={bulkBusy} disabled={bulkDone || bulkBusy}>{bulkDone ? "✓ All Tailored" : bulkBusy ? null : "⚡ Tailor All Top Jobs"}</Btn></div>}
                <div style={{ display: "grid", gap: 10 }}>
                  {jobs.map((j, idx) => {
                    const cv = tailored[j.id], busy = tailoring.has(j.id), applied = apps.find(a => a.jobId === j.id);
                    const sc = j.score !== null ? scoreStyle(j.score) : null;
                    return (
                      <Card key={j.id} style={{ padding: "16px 20px", animation: `fadeUp .2s ease ${Math.min(idx * .025, .3)}s both`, borderColor: applied ? `${C.green}55` : C.border }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>{j.title}</span>
                              {sc && <span style={{ ...sc, padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, border: `1px solid ${sc.border}` }}>⭐ {j.score}/10</span>}
                              {!sc && <span style={{ background: C.bg, color: C.light, padding: "2px 9px", borderRadius: 99, fontSize: 11, border: `1px solid ${C.border}` }}>Scoring…</span>}
                              {applied && <span style={{ background: C.greenBg, color: C.green, padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, border: `1px solid ${C.green}44` }}>✓ Applied {applied.date}</span>}
                            </div>
                            {j.reason && <div style={{ fontSize: 12, color: C.slate, fontStyle: "italic", marginBottom: 5 }}>"{j.reason}"</div>}
                            <div style={{ fontSize: 13, color: C.slate, marginBottom: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                              {j.company && <span>🏢 {j.company}</span>}
                              {j.location && <span>📍 {j.location}</span>}
                              <span style={{ color: C.green, fontWeight: 700 }}>💷 {j.salary}</span>
                              <span style={{ color: C.light }}>📅 {j.posted}</span>
                            </div>
                            {j.description && <p style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.6, margin: 0 }}>{j.description.slice(0, 220)}{j.description.length > 220 ? "..." : ""}</p>}
                            {cv && !applied && <div style={{ marginTop: 10, background: C.goldPale, borderLeft: `3px solid ${C.gold}`, borderRadius: "0 8px 8px 0", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><span style={{ fontSize: 12, color: "#7a5800", fontWeight: 700 }}>✨ CV tailored — ready to apply</span><Btn small variant="gold" onClick={() => setModal(j)}>⚡ Quick Apply →</Btn></div>}
                            {cv && applied && <div style={{ marginTop: 8 }}><Btn small variant="ghost" onClick={() => dlDoc(j, cv)}>⬇ Re-download CV</Btn></div>}
                            {busy && <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, color: C.slate, fontSize: 13 }}><Spin size={13} color={C.slate} /> Tailoring CV…</div>}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                            {!cv && !busy && <Btn small variant="gold" disabled={!client.cv} onClick={() => tailorOne(j)}>✨ Tailor</Btn>}
                            <a href={j.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><Btn small variant="ghost">View ↗</Btn></a>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* MANUAL TAB */}
        {tab === "manual" && (
          <Card style={{ animation: "fadeUp .3s ease" }}>
            <H2>✍ Paste a Job Manually</H2>
            <p style={{ color: C.slate, fontSize: 13, marginBottom: 18, lineHeight: 1.6 }}>Found a job on Indeed, LinkedIn or anywhere? Paste it here and we'll tailor {client.name}'s CV instantly.</p>
            <div style={{ display: "grid", gap: 13 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Inp label="Job Title" value={mTitle} onChange={setMTitle} placeholder="e.g. Security Guard" />
                <Inp label="Company" hint="(optional)" value={mCompany} onChange={setMCompany} placeholder="e.g. G4S Security" />
              </div>
              <Inp label="Job URL" hint="(optional)" value={mUrl} onChange={setMUrl} placeholder="https://www.indeed.co.uk/jobs/…" />
              <TA label="Job Description *" value={mDesc} onChange={setMDesc} placeholder="Paste the full job description here…" height={220} />
            </div>
            {mErr && <div style={{ background: C.redBg, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.red, marginTop: 12 }}>⚠ {mErr}</div>}
            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Btn variant="gold" loading={mBusy} disabled={!mDesc.trim() || !client.cv || mBusy} onClick={tailorManual}>{mBusy ? null : "✨ Tailor CV for This Job →"}</Btn>
              {mBusy && <span style={{ color: C.slate, fontSize: 13 }}>Tailoring… ~15 seconds</span>}
            </div>
          </Card>
        )}

        {/* TRACKER TAB */}
        {tab === "tracker" && (
          apps.length === 0 ? (
            <Card style={{ textAlign: "center", padding: "36px" }}><div style={{ fontSize: 32, marginBottom: 10 }}>📋</div><div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: C.navy, marginBottom: 8 }}>No applications yet</div><p style={{ color: C.slate, fontSize: 13 }}>Tailor a CV and use ⚡ Quick Apply to log applications here</p></Card>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {APP_STATUSES.map(s => { const n = apps.filter(a => a.status === s).length; return n > 0 ? <div key={s} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 99, padding: "4px 13px", fontSize: 12, fontWeight: 600, color: C.slate }}>{s}: <span style={{ color: C.navy }}>{n}</span></div> : null; })}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {apps.map(a => (
                  <Card key={a.jobId} style={{ padding: "14px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>{a.title}</div><div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>{a.company && <span>🏢 {a.company} · </span>}{a.salary && <span>💷 {a.salary} · </span>}<span>📅 Applied {a.date}</span></div></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <select value={a.status} onChange={e => setStatus(a.jobId, e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, color: C.text, background: C.white, cursor: "pointer", fontFamily: "inherit" }}>{APP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
                        <button onClick={() => removeApp(a.jobId)} style={{ background: "none", border: "none", cursor: "pointer", color: C.light, fontSize: 20, lineHeight: 1, padding: "0 4px" }}>×</button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}

/* ─── ROOT ─── */
export default function App() {
  const [screen,  setScreen]  = useState("home");
  const [clients, setClients] = useState([]);
  const [active,  setActive]  = useState(null);
  const [editing, setEditing] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const s = DB.get(STORE);
    if (s && Array.isArray(s)) setClients(s);
  }, []);

  const persist  = list => { setClients(list); DB.set(STORE, list); };
  const onSave   = c    => { persist([c, ...clients.filter(x => x.id !== c.id)]); setActive(c); setEditing(null); setScreen("dashboard"); };
  const onUpdate = c    => { persist(clients.map(x => x.id === c.id ? c : x)); setActive(c); };
  const onDelete = id   => { persist(clients.filter(c => c.id !== id)); setActive(null); setEditing(null); setScreen("home"); };

  // Prevent SSR mismatch
  if (!mounted) return null;

  return (
    <>
      <Head>
        <title>ApplyBot 🤖</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.text}; }
          @keyframes spin    { to { transform: rotate(360deg); } }
          @keyframes fadeUp  { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
          input:focus, textarea:focus, select:focus { outline: 2px solid ${C.gold}; outline-offset: 1px; }
        `}</style>
      </Head>

      {screen === "home"      && <HomeScreen  clients={clients} onAdd={() => { setEditing({ id: uid(), name: "", email: "", phone: "", address: "", cv: "", location: "", jobType: "Any", shiftType: "Any", jobDesc: "", applications: [], isNew: true }); setScreen("edit"); }} onOpen={c => { setActive(c); setScreen("dashboard"); }} onSettings={() => setScreen("settings")} />}
      {screen === "edit"      && <EditScreen  client={editing || active} onSave={onSave} onDelete={onDelete} onBack={() => setScreen(active && !(editing?.isNew) ? "dashboard" : "home")} />}
      {screen === "dashboard" && <Dashboard   client={active} onEdit={() => { setEditing({ ...active }); setScreen("edit"); }} onBack={() => setScreen("home")} onSettings={() => setScreen("settings")} onClientUpdate={onUpdate} />}
      {screen === "settings"  && (
        <div style={{ minHeight: "100vh", background: C.bg }}>
          <TopBar title="Settings" onBack={() => setScreen("home")} backLabel="Home" />
          <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 20px" }}>
            <Card>
              <H2>ℹ About ApplyBot</H2>
              <p style={{ color: C.slate, fontSize: 13, lineHeight: 1.75 }}>
                ApplyBot searches <strong>Reed.co.uk</strong> for real UK jobs, scores them against the client's CV, tailors the CV automatically and guides you through applying.<br /><br />
                <strong>Job data:</strong> Powered by Reed.co.uk API<br />
                <strong>CV tailoring:</strong> Powered by Claude AI<br />
                <strong>Your data:</strong> Saved in your browser only — never shared
              </p>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
