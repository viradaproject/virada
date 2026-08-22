import { useState, useMemo, useEffect, useRef } from "react";
import { Home, CalendarDays, Bell, User, ChevronLeft, ChevronRight, Check, X, KeyRound, Lock, LogOut, Users, RotateCw, Anchor, Search, Camera, Pencil } from "lucide-react";
import { supabase } from "./supabaseClient";

async function hashPassword(password) {
  const enc = new TextEncoder().encode(password || "");
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

const ROWERS = [];
const ROWER_NAME = Object.fromEntries(ROWERS.map(r => [r.id, r.name]));
const ROWER_TEAM = Object.fromEntries(ROWERS.map(r => [r.id, r.team]));
const ROWER_NICKNAME = Object.fromEntries(ROWERS.map(r => [r.id, r.nickname]));
const ROWER_SIDE = Object.fromEntries(ROWERS.map(r => [r.id, r.side]));
const SIDE_META = {
  babor: { label: "BABOR", letter: "B", color: "#E61E29" },
  estribor: { label: "ESTRIBOR", letter: "E", color: "#3EA55A" },
  ambos: { label: "AMBOS", letter: "B+E", color: "#E67E22" },
  patron: { label: "PATRÓN", letter: "P", color: "#22B8CF" },
};
// Etiquetas completas para el formulario de registro ("Función en el equipo")
const REGISTER_SIDE_OPTIONS = [
  { key: "babor", label: "Remero de Babor", letter: "B", color: "#E61E29" },
  { key: "estribor", label: "Remero de Estribor", letter: "E", color: "#3EA55A" },
  { key: "ambos", label: "Remero de ambos lados", letter: "B+E", color: "#E67E22" },
  { key: "patron", label: "Patrón", letter: "P", color: "#22B8CF" },
];
const TEAMS_SEED = [];
const ME_ROWER = "r1";
const ME_TEAM = ROWER_TEAM[ME_ROWER];
const ATTENDANCE_BASE = { label: "2026", attendedBeforeAgosto: 0, totalBeforeAgosto: 0 };
const COACH_NAME = "Entrenador";
const COACH_ID = "coach1";
const CLUB_NAME = "Tu club";

// Numeración de códigos de acceso: AA (año) + CCC (club) + FFFF (remero) = 9 dígitos
const CURRENT_YEAR_2D = "26";
const rowerAccessCode = (r, clubCode) => `${r.joinYear}${clubCode}${String(r.seq).padStart(4, "0")}`;
const ROWER_CODE = {};
const randomTeamCode = () => `EQ-${Math.floor(1000 + Math.random() * 9000)}`;
const randomClubCode = () => String(Math.floor(Math.random() * 900) + 100); // código de 3 dígitos, único por club registrado

const DEFAULT_SESSION_TITLE = "ENTRENO DE AGUA";
const TIME_OPTIONS = ["7:00 – 8:30", "8:00 – 9:30", "9:00 – 10:30", "17:00 – 18:30", "18:00 – 19:30", "19:00 – 20:30", "20:00 – 21:30"];

const BOATS = ["Alarona", "Llaüt Nou", "Llaüt Vell", "Batel 1", "Batel 2"];
const OARS = ["Amilibia", "Braka 1.0", "Braka 2.0", "Ami Batel", "Braka Batel"];
const BOAT_OARS = {
  "Alarona": ["Amilibia", "Braka 1.0", "Braka 2.0"],
  "Llaüt Nou": ["Amilibia", "Braka 1.0", "Braka 2.0"],
  "Llaüt Vell": ["Amilibia", "Braka 1.0", "Braka 2.0"],
  "Batel 1": ["Ami Batel", "Braka Batel"],
  "Batel 2": ["Ami Batel", "Braka Batel"],
};
const oarsOptionsFor = (boat) => BOAT_OARS[boat] || OARS;

const parseTimeRange = (str) => {
  if (!str) return null;
  const m = str.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return [(+m[1]) * 60 + (+m[2]), (+m[3]) * 60 + (+m[4])];
};
const rangesOverlap = (a, b) => !!a && !!b && a[0] < b[1] && b[0] < a[1];

function buildSessions(teamId) {
  const year = 2026, month = 7; // agosto (0-indexed)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const sessions = [];
  const today = new Date(2026, 7, 12);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dow = date.getDay();
    const iso = date.toISOString().slice(0, 10);
    const isPast = date < today;
    sessions.push({
      id: `${teamId}-${iso}`, teamId, date, iso, dow, time: TIME_OPTIONS[5],
      title: DEFAULT_SESSION_TITLE,
      active: false, // por defecto todos los días están desactivados; el entrenador activa los que correspondan
      suspendedReason: null,
      boat: null,
      oars: null,
      signups: new Set(),
      seats: Array(8).fill(null),
      patron: null,
      reserves: [null, null],
      zodiac: [null, null, null],
      status: isPast ? "cerrado" : "abierto",
    });
  }
  return sessions;
}

const SUSPEND_REASONS = ["No hay entreno", "Falta de remeros", "Falta de patrón", "Mal tiempo", "Mala organización de botes"];

// ---- Calendario de regatas ----
const RACE_MONTH_ORDER = { "OCTUBRE": 1, "NOVEMBRE": 2, "NOVIEMBRE": 2, "DESEMBRE": 3, "GENER": 4, "FEBRER": 5, "MARÇ": 6, "ABRIL": 7, "MAIG": 8, "JUNY": 9, "JULIOL": 10, "AGOST": 11, "SETEMBRE": 12 };
const raceSortKey = (dateLabel) => {
  const s = (dateLabel || "").toUpperCase();
  const dayMatch = s.match(/\d+/);
  const day = dayMatch ? parseInt(dayMatch[0], 10) : 0;
  let month = 99;
  for (const name of Object.keys(RACE_MONTH_ORDER)) {
    if (s.includes(name)) { month = RACE_MONTH_ORDER[name]; break; }
  }
  return month * 100 + day;
};
// Meses 0-indexados (para construir un Date real); la temporada empieza en octubre
const CATALAN_MONTH_INDEX = { "GENER": 0, "FEBRER": 1, "MARÇ": 2, "ABRIL": 3, "MAIG": 4, "JUNY": 5, "JULIOL": 6, "AGOST": 7, "SETEMBRE": 8, "OCTUBRE": 9, "NOVEMBRE": 10, "NOVIEMBRE": 10, "DESEMBRE": 11 };
const guessRaceDate = (dateLabel) => {
  const s = (dateLabel || "").toUpperCase();
  const dayMatch = s.match(/\d+/);
  const day = dayMatch ? parseInt(dayMatch[0], 10) : null;
  let month = null;
  for (const name of Object.keys(CATALAN_MONTH_INDEX)) {
    if (s.includes(name)) { month = CATALAN_MONTH_INDEX[name]; break; }
  }
  if (day === null || month === null) return null;
  const year = month >= 9 ? 2026 : 2027; // oct/nov/dic 2026, resto 2027 (temporada a caballo de año)
  return new Date(year, month, day);
};
const raceCountdownLabel = (dateLabel) => {
  const d = guessRaceDate(dateLabel);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff > 1) return `Faltan ${diff} días`;
  if (diff === 1) return "¡Es mañana!";
  if (diff === 0) return "¡Es hoy!";
  return "Ya celebrada";
};
const isRacePast = (dateLabel) => {
  const d = guessRaceDate(dateLabel);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
};
const race = (dateLabel, title) => ({ id: `rc${Math.random().toString(36).slice(2, 9)}`, dateLabel, title, notes: "", docs: [] });
const RACE_SEED = [
  {
    id: "cat-fcr-oficiales", name: "REGATAS FCR OFICIALES",
    races: [
      race("4 Octubre", "Arenys"),
      race("18 Octubre", "Roses"),
      race("8 Novembre", "Lloret (Peskis)"),
      race("15 Novembre", "CN St Feliu"),
      race("29 Novembre", "Lloret (Hotelers)"),
      race("19 i 20 Desembre", "CCAT VE Cambrils"),
      race("23 Gener", "1a Regata Llaüt - Flix"),
      race("7 Febrer", "2a Regata Llaüt - Empuriabrava"),
      race("20 Febrer", "1a Regata Batel - Lloret (Hotelers)"),
      race("21 Febrer", "3a Regata de Llaüt - Lloret (Hotelers)"),
      race("6 Març", ""),
      race("7 Març", ""),
      race("20 Març", ""),
      race("21 Març", ""),
      race("11 Abril", ""),
      race("18 Abril", ""),
      race("9 Maig", ""),
      race("21, 22 i 23 Maig", "CE"),
    ],
  },
  {
    id: "cat-no-oficiales", name: "REGATAS NO OFICIALES",
    races: [],
  },
  {
    id: "cat-extraordinarios", name: "EVENTOS EXTRAORDINARIOS",
    races: [],
  },
];
const DOC_TYPES = ["Dossier", "Horarios", "Resultados", "Otro"];

// Los días de entreno de gimnasio son ahora variables por semana (de 1 a 7), elegidos por el entrenador
const WEEK_DAY_KEYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
const WEEK_DAY_LABELS = { lun: "Lunes", mar: "Martes", mie: "Miércoles", jue: "Jueves", vie: "Viernes", sab: "Sábado", dom: "Domingo" };
const FISICO_SLOTS = WEEK_DAY_KEYS;
const FISICO_LABELS = WEEK_DAY_LABELS;

const seatFill = (s) => s.seats.filter(Boolean).length + (s.patron ? 1 : 0) + s.reserves.filter(Boolean).length + (s.zodiac ? s.zodiac.filter(Boolean).length : 0);
const hasPassed = (s, now) => s.date < now;
const inCrew = (s, id) => [...s.seats, s.patron, ...s.reserves, ...(s.zodiac || [])].includes(id);
const crewStatsFor = (sessions, id, now) => {
  let convocado = 0, entrenado = 0;
  sessions.forEach(s => {
    if (!s.active || s.status !== "cerrado" || !inCrew(s, id)) return;
    convocado++;
    if (hasPassed(s, now)) entrenado++;
  });
  return { convocado, entrenado };
};
const weekOfDate = (date) => Math.ceil(date.getDate() / 7);
// Convierte una fila cruda de la tabla water_sessions al formato que usa la app
const mapWaterSessionRow = (s) => ({
  id: s.id, teamId: s.team_id, date: new Date(s.date + "T00:00:00"), iso: s.iso, dow: s.dow,
  time: s.time, title: s.title, active: s.active, status: s.status,
  suspendedReason: s.suspended_reason, boat: s.boat, oars: s.oars,
  signups: new Set(s.signups || []),
  seats: (s.seats && s.seats.length === 8) ? s.seats : Array(8).fill(null),
  patron: s.patron || null,
  reserves: (s.reserves && s.reserves.length === 2) ? s.reserves : [null, null],
  zodiac: (s.zodiac && s.zodiac.length === 3) ? s.zodiac : [null, null, null],
});
const JS_DOW_TO_WEEK_KEY = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"]; // Date.getDay(): 0=domingo..6=sábado
// Posiciones del bote: patrón (0) al frente, luego 4 filas de BABOR/ESTRIBOR (1 a 4)
const SEAT_LABELS = [
  { side: "BABOR", num: 1 }, { side: "ESTRIBOR", num: 1 },
  { side: "BABOR", num: 2 }, { side: "ESTRIBOR", num: 2 },
  { side: "BABOR", num: 3 }, { side: "ESTRIBOR", num: 3 },
  { side: "BABOR", num: 4 }, { side: "ESTRIBOR", num: 4 },
];
const seatLabel = (i) => `${SEAT_LABELS[i].num} ${SEAT_LABELS[i].side}`;
const seatShort = (i) => `${SEAT_LABELS[i].num}${SEAT_LABELS[i].side === "BABOR" ? "B" : "E"}`;
const firstName = (name) => name.split(" ")[0];
const crewLabel = (id, nicknameOf, nameOf) => {
  const nick = nicknameOf ? nicknameOf(id) : null;
  if (nick) return nick;
  const full = nameOf ? nameOf(id) : null;
  return full ? firstName(full) : id;
};


const SEED_ACCOUNTS = [];

// ---- Acceso directo de pruebas ----
const DEMO_CLUB_ID = "demo-club-001";
const DEMO_CLUB = { id: DEMO_CLUB_ID, name: "Club de pruebas", code: "001", username: "CLUB", password: "1234", createdAt: 0 };
const DEMO_COACHES = [
  { id: "demo-oscar", clubId: DEMO_CLUB_ID, username: "Oscar", apodo: null, side: null },
  { id: "demo-marina", clubId: DEMO_CLUB_ID, username: "Marina", apodo: null, side: null },
  { id: "demo-metra", clubId: DEMO_CLUB_ID, username: "Metra", apodo: null, side: null },
];
const DEMO_ROWERS = [
  { id: "demo-oscar1", clubId: DEMO_CLUB_ID, username: "Oscar1", apodo: "Oscar", side: "babor" },
  { id: "demo-marina1", clubId: DEMO_CLUB_ID, username: "Marina1", apodo: "Marina", side: "estribor" },
  { id: "demo-metra1", clubId: DEMO_CLUB_ID, username: "Metra1", apodo: "Metra", side: "ambos" },
];
const DEMO_USERS = [...DEMO_COACHES, ...DEMO_ROWERS];
const DEMO_ROLE_OVERRIDES = Object.fromEntries([
  ...DEMO_COACHES.map(u => [u.id, "coach"]),
  ...DEMO_ROWERS.map(u => [u.id, "rower"]),
]);
const DEMO_PASSWORDS = Object.fromEntries(DEMO_USERS.map(u => [u.id, "1234"]));

export default function ViradaPrototype() {
  const [sessions, setSessions] = useState([]);
  const [screen, setScreen] = useState("login");
  const [role, setRole] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(ME_ROWER);
  const [openSession, setOpenSession] = useState(null);
  const [openTeam, setOpenTeam] = useState(null);
  const [openPerson, setOpenPerson] = useState(null);
  const [suspendTarget, setSuspendTarget] = useState(null);
  const [viewPhoto, setViewPhoto] = useState(null); // { photo, caption }
  const [openRace, setOpenRace] = useState(null); // { catId, raceId }
  const [selectedRowerChip, setSelectedRowerChip] = useState(null);
  const [coachScope, setCoachScope] = useState("club");
  const [teams, setTeams] = useState([]); // { id, clubId, name, code }
  const [teamOverrides, setTeamOverrides] = useState({});
  const [roleOverrides, setRoleOverrides] = useState(DEMO_ROLE_OVERRIDES);
  const [coachTeams, setCoachTeams] = useState({});
  const [nicknameOverrides, setNicknameOverrides] = useState({});
  const [sideOverrides, setSideOverrides] = useState({});
  const [clubs, setClubs] = useState([DEMO_CLUB]); // { id, name, code, username, password, createdAt }
  const [currentClubId, setCurrentClubId] = useState(null);
  const [raceCategories, setRaceCategories] = useState([]); // se carga desde Supabase
  const [passwords, setPasswords] = useState(DEMO_PASSWORDS);
  const [recoveryEmails, setRecoveryEmails] = useState({});
  const [loginError, setLoginError] = useState(null);
  const [pendingUsers, setPendingUsers] = useState([]); // incluyen clubId
  const [assignedUsers, setAssignedUsers] = useState(DEMO_USERS); // incluyen clubId
  const [lastRegistered, setLastRegistered] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);

  // Cada club es totalmente independiente: solo ve y gestiona sus propias tripulaciones y usuarios
  const currentClub = clubs.find(c => c.id === currentClubId) || null;
  const clubCode = currentClub ? currentClub.code : null;
  const clubDisplayName = currentClub ? currentClub.name : CLUB_NAME;
  const clubTeams = useMemo(() => teams.filter(t => t.clubId === currentClubId), [teams, currentClubId]);
  const clubAssignedUsers = useMemo(() => assignedUsers.filter(u => u.clubId === currentClubId), [assignedUsers, currentClubId]);
  const clubPendingUsers = useMemo(() => pendingUsers.filter(u => u.clubId === currentClubId), [pendingUsers, currentClubId]);

  // Carga desde Supabase: clubes y usuarios (activos y pendientes) guardados de verdad.
  // Se llama al arrancar la app, y se vuelve a llamar justo después de iniciar sesión,
  // porque con RLS activado la base de datos solo devuelve los datos del club/usuario ya autenticado.
  const refetchCoachPerms = async () => {
    const { data: permsData } = await supabase.from("coach_team_permissions").select("*");
    if (permsData) {
      const byCoach = {};
      permsData.forEach(p => { byCoach[p.coach_id] = [...(byCoach[p.coach_id] || []), p.team_id]; });
      setCoachTeams(byCoach);
    }
  };
  const refetchRaces = async () => {
    const { data: catsData, error: catsErr } = await supabase.from("race_categories").select("*");
    const { data: racesData } = await supabase.from("races").select("*");
    const { data: docsData } = await supabase.from("race_documents").select("*");
    if (!catsErr && catsData) {
      const assembled = catsData.map(cat => ({
        id: cat.id, name: cat.name,
        races: (racesData || []).filter(r => r.category_id === cat.id).map(r => ({
          id: r.id, dateLabel: r.date_label, title: r.title || "", notes: r.notes || "", subcategory: r.subcategory || null,
          docs: (docsData || []).filter(d => d.race_id === r.id).map(d => ({
            id: d.id, label: d.title, name: d.file_name, fileType: d.file_type, dataUrl: d.file_url,
          })),
        })),
      }));
      setRaceCategories(assembled);
    }
  };
  const refetchGymPlans = async () => {
    const { data: gymWeeksData } = await supabase.from("gym_weeks").select("*");
    const { data: gymDaysData } = await supabase.from("gym_days").select("*");
    if (gymWeeksData || gymDaysData) {
      const plans = {};
      (gymWeeksData || []).forEach(w => {
        plans[w.team_id] = plans[w.team_id] || {};
        plans[w.team_id][w.week_number] = plans[w.team_id][w.week_number] || { activeDays: [], weekAttachment: null, days: {} };
        plans[w.team_id][w.week_number].activeDays = w.active_days || [];
        plans[w.team_id][w.week_number].weekAttachment = w.attachment_url ? { name: w.attachment_name, fileType: w.attachment_type, dataUrl: w.attachment_url } : null;
      });
      (gymDaysData || []).forEach(d => {
        plans[d.team_id] = plans[d.team_id] || {};
        plans[d.team_id][d.week_number] = plans[d.team_id][d.week_number] || { activeDays: [], weekAttachment: null, days: {} };
        plans[d.team_id][d.week_number].days[d.day_key] = { content: d.content || "" };
      });
      setGymPlans(plans);
    }
  };
  const refetchGymCompletions = async () => {
    const { data: gymCompletionsData } = await supabase.from("gym_completions").select("*");
    if (gymCompletionsData) {
      const completion = {};
      gymCompletionsData.forEach(c => {
        completion[c.rower_id] = completion[c.rower_id] || {};
        completion[c.rower_id][`${c.team_id}-${c.week_number}-${c.day_key}`] = { done: c.done, photos: c.photos || [] };
      });
      setGymCompletion(completion);
    }
  };
  const loadData = async () => {
      const { data: clubsData, error: clubsErr } = await supabase.from("clubs").select("*");
      if (!clubsErr && clubsData) {
        setClubs(clubsData.map(c => ({
          id: c.id, name: c.name, code: c.access_code,
          username: c.username, createdAt: c.created_at,
          photoUrl: c.photo_url || null,
        })));
      }
      const { data: usersData, error: usersErr } = await supabase.from("users").select("*");
      if (!usersErr && usersData) {
        const activeUsers = usersData.filter(u => u.status === "active").map(u => ({
          id: u.id, clubId: u.club_id, username: u.username, apodo: u.nickname, side: u.side,
        }));
        const pendingList = usersData.filter(u => u.status === "pending").map(u => ({
          id: u.id, clubId: u.club_id, username: u.username, apodo: u.nickname, side: u.side,
        }));
        setAssignedUsers(activeUsers);
        setPendingUsers(pendingList);
        const roles = {}, pwds = {}, emails = {}, photos = {}, teamsById = {};
        usersData.forEach(u => {
          if (u.role) roles[u.id] = u.role;
          pwds[u.id] = u.password_hash;
          if (u.recovery_email) emails[u.id] = u.recovery_email;
          if (u.photo_url) photos[u.id] = u.photo_url;
          if (u.team_id) teamsById[u.id] = u.team_id;
        });
        setRoleOverrides(prev => ({ ...prev, ...roles }));
        setPasswords(prev => ({ ...prev, ...pwds }));
        setRecoveryEmails(prev => ({ ...prev, ...emails }));
        setProfilePhotos(prev => ({ ...prev, ...photos }));
        setTeamOverrides(prev => ({ ...prev, ...teamsById }));
      }
      await refetchCoachPerms();
      const { data: teamsData, error: teamsErr } = await supabase.from("teams").select("*");
      if (!teamsErr && teamsData) {
        setTeams(teamsData.map(t => ({ id: t.id, clubId: t.club_id, name: t.name, code: t.code })));
      }
      const { data: waterSessionsData, error: waterErr } = await supabase.from("water_sessions").select("*").order("iso", { ascending: true });
      if (!waterErr && waterSessionsData) {
        setSessions(waterSessionsData.map(mapWaterSessionRow));
      }
      const { data: notificationsData } = await supabase.from("notifications").select("*").order("created_at", { ascending: false });
      if (notificationsData) {
        setNotifications(notificationsData.map(n => ({ id: n.id, rowerId: n.rower_id, text: n.text })));
      }
      const { data: alertsData } = await supabase.from("session_alerts").select("*").order("created_at", { ascending: false });
      if (alertsData) {
        const bySession = {};
        alertsData.forEach(a => {
          bySession[a.session_id] = [...(bySession[a.session_id] || []), { id: a.id, rowerId: a.rower_id, text: a.text, resolved: a.resolved }];
        });
        setSessionAlerts(bySession);
      }
      await refetchRaces();
      await refetchGymPlans();
      await refetchGymCompletions();
      const { data: pesosData } = await supabase.from("pesos_exercises").select("*");
      if (pesosData) {
        const byRower = {};
        pesosData.forEach(ex => {
          byRower[ex.rower_id] = [...(byRower[ex.rower_id] || []), { id: ex.id, name: ex.name, baseKg: ex.base_kg }];
        });
        setPesosExercises(byRower);
      }
      const { data: ergoData } = await supabase.from("ergo_tests").select("*");
      if (ergoData) {
        const byRower = {};
        ergoData.forEach(row => { byRower[row.rower_id] = row.test_time; });
        setErgoTestTimes(byRower);
      }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Tiempo real: si otra persona activa un día, se apunta, monta la alineación o cierra/reabre
  // la tripulación, se refleja en la app de todos los que la tengan abierta, sin recargar
  useEffect(() => {
    const channel = supabase
      .channel("water_sessions_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "water_sessions" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setSessions(prev => prev.filter(s => s.id !== payload.old.id));
          return;
        }
        const updated = mapWaterSessionRow(payload.new);
        setSessions(prev => {
          const exists = prev.some(s => s.id === updated.id);
          return exists ? prev.map(s => s.id === updated.id ? updated : s) : [...prev, updated];
        });
        setOpenSession(prev => (prev && prev.id === updated.id) ? updated : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Tiempo real: si un remero avisa que no puede venir, el entrenador lo ve al instante
  useEffect(() => {
    const channel = supabase
      .channel("session_alerts_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "session_alerts" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setSessionAlerts(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(sid => { next[sid] = next[sid].filter(a => a.id !== payload.old.id); });
            return next;
          });
          return;
        }
        const a = payload.new;
        setSessionAlerts(prev => {
          const list = prev[a.session_id] || [];
          const exists = list.some(x => x.id === a.id);
          const nextList = exists
            ? list.map(x => x.id === a.id ? { id: a.id, rowerId: a.rower_id, text: a.text, resolved: a.resolved } : x)
            : [...list, { id: a.id, rowerId: a.rower_id, text: a.text, resolved: a.resolved }];
          return { ...prev, [a.session_id]: nextList };
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Tiempo real: tripulaciones, usuarios, notificaciones, plan de gimnasio, regatas y permisos —
  // cualquier cambio hecho por el club o el admin llega al momento al resto de usuarios conectados
  useEffect(() => {
    const channel = supabase
      .channel("app_data_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setTeams(prev => prev.filter(t => t.id !== payload.old.id));
          return;
        }
        const t = payload.new;
        const mapped = { id: t.id, clubId: t.club_id, name: t.name, code: t.code };
        setTeams(prev => {
          const exists = prev.some(x => x.id === mapped.id);
          return exists ? prev.map(x => x.id === mapped.id ? mapped : x) : [...prev, mapped];
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = payload.old.id;
          setAssignedUsers(prev => prev.filter(u => u.id !== id));
          setPendingUsers(prev => prev.filter(u => u.id !== id));
          return;
        }
        const u = payload.new;
        const entry = { id: u.id, clubId: u.club_id, username: u.username, apodo: u.nickname, side: u.side };
        if (u.status === "active") {
          setAssignedUsers(prev => {
            const exists = prev.some(x => x.id === u.id);
            return exists ? prev.map(x => x.id === u.id ? entry : x) : [...prev, entry];
          });
          setPendingUsers(prev => prev.filter(x => x.id !== u.id));
        } else if (u.status === "pending") {
          setPendingUsers(prev => {
            const exists = prev.some(x => x.id === u.id);
            return exists ? prev.map(x => x.id === u.id ? entry : x) : [...prev, entry];
          });
          setAssignedUsers(prev => prev.filter(x => x.id !== u.id));
        }
        if (u.role) setRoleOverrides(prev => ({ ...prev, [u.id]: u.role }));
        setTeamOverrides(prev => ({ ...prev, [u.id]: u.team_id || null }));
        if (u.photo_url) setProfilePhotos(prev => ({ ...prev, [u.id]: u.photo_url }));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        const n = payload.new;
        setNotifications(prev => prev.some(x => x.id === n.id) ? prev : [{ id: n.id, rowerId: n.rower_id, text: n.text }, ...prev]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "gym_weeks" }, () => refetchGymPlans())
      .on("postgres_changes", { event: "*", schema: "public", table: "gym_days" }, () => refetchGymPlans())
      .on("postgres_changes", { event: "*", schema: "public", table: "gym_completions" }, () => refetchGymCompletions())
      .on("postgres_changes", { event: "*", schema: "public", table: "race_categories" }, () => refetchRaces())
      .on("postgres_changes", { event: "*", schema: "public", table: "races" }, () => refetchRaces())
      .on("postgres_changes", { event: "*", schema: "public", table: "race_documents" }, () => refetchRaces())
      .on("postgres_changes", { event: "*", schema: "public", table: "coach_team_permissions" }, () => refetchCoachPerms())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Detecta cuando alguien llega desde el enlace de recuperación de contraseña del correo
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setScreen("resetPassword");
      }
    });
    return () => { authListener?.subscription?.unsubscribe(); };
  }, []);

  const setNewPasswordAfterRecovery = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { flash("No se pudo cambiar la contraseña. Inténtalo de nuevo."); return; }
    const { data: authUser } = await supabase.auth.getUser();
    const uid = authUser?.user?.id;
    await loadData();
    if (uid) {
      const { data: userRow } = await supabase.from("users").select("*").eq("auth_user_id", uid).maybeSingle();
      if (userRow) {
        setCurrentUserId(userRow.id);
        setCurrentClubId(userRow.club_id ?? null);
        if (userRow.role) setRoleOverrides(prev => ({ ...prev, [userRow.id]: userRow.role }));
        setRole(userRow.role || "rower");
        setScreen("home");
        flash("Contraseña actualizada");
        return;
      }
      const { data: clubRow } = await supabase.from("clubs").select("*").eq("auth_user_id", uid).maybeSingle();
      if (clubRow) {
        setCurrentClubId(clubRow.id);
        setRole("club");
        setScreen("home");
        flash("Contraseña actualizada");
        return;
      }
    }
    setScreen("login");
    setRole(null);
    flash("Contraseña actualizada. Ya puedes iniciar sesión.");
  };

  const teamOf = (id) => teamOverrides[id] ?? ROWER_TEAM[id] ?? null;
  const roleOf = (id) => roleOverrides[id] ?? (id === COACH_ID ? "coach" : "rower");
  const nicknameOf = (id) => nicknameOverrides[id] ?? ROWER_NICKNAME[id] ?? assignedUsers.find(u => u.id === id)?.apodo ?? null;
  const sideOf = (id) => sideOverrides[id] ?? ROWER_SIDE[id] ?? assignedUsers.find(u => u.id === id)?.side ?? null;
  const displayNameOf = (id) => {
    if (id === COACH_ID) return COACH_NAME;
    const rower = ROWERS.find(r => r.id === id);
    if (rower) return rower.name;
    const au = assignedUsers.find(u => u.id === id);
    if (au) return au.username;
    return "Usuario";
  };
  const nameOf = displayNameOf;
  const rowerCodeOf = (id) => {
    if (ROWER_CODE[id]) return ROWER_CODE[id];
    const idx = clubAssignedUsers.filter(u => roleOf(u.id) === "rower").findIndex(u => u.id === id);
    if (idx === -1 || !clubCode) return "—";
    const joinYear = "26"; // año de alta al club, prototipo
    const seq = ROWERS.length + idx + 1;
    return `${joinYear}${clubCode}${String(seq).padStart(4, "0")}`;
  };
  const updateMyProfile = async ({ apodo, side, email, newPassword }) => {
    const updates = { nickname: apodo, side };
    if (email !== undefined) updates.recovery_email = email;
    const { error } = await supabase.from("users").update(updates).eq("id", currentUserId);
    if (error) { flash("No se pudo actualizar el perfil. Inténtalo de nuevo."); return; }
    if (newPassword) {
      const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
      if (pwError) { flash("Perfil actualizado, pero no se pudo cambiar la contraseña. Inténtalo de nuevo."); return; }
    }
    setNicknameOverrides(prev => ({ ...prev, [currentUserId]: apodo }));
    setSideOverrides(prev => ({ ...prev, [currentUserId]: side }));
    if (email !== undefined) setRecoveryEmails(prev => ({ ...prev, [currentUserId]: email }));
    setAssignedUsers(prev => prev.map(u => u.id === currentUserId ? { ...u, apodo, side } : u));
    flash("Perfil actualizado");
  };
  const [profilePhotos, setProfilePhotos] = useState({}); // { [userId]: dataUrl }
  const updateMyPhoto = async (dataUrl) => {
    const { error } = await supabase.from("users").update({ photo_url: dataUrl }).eq("id", currentUserId);
    if (error) { flash("No se pudo guardar la foto. Inténtalo de nuevo."); return; }
    setProfilePhotos(prev => ({ ...prev, [currentUserId]: dataUrl }));
    flash("Foto de perfil actualizada");
  };
  const updateClubPhoto = async (dataUrl) => {
    const { error } = await supabase.from("clubs").update({ photo_url: dataUrl }).eq("id", currentClubId);
    if (error) { flash("No se pudo guardar la foto. Inténtalo de nuevo."); return; }
    setClubs(prev => prev.map(c => c.id === currentClubId ? { ...c, photoUrl: dataUrl } : c));
    flash("Foto del club actualizada");
  };
  const updateClubName = async (name) => {
    const { error } = await supabase.from("clubs").update({ name }).eq("id", currentClubId);
    if (error) { flash("No se pudo actualizar el nombre del club. Inténtalo de nuevo."); return; }
    setClubs(prev => prev.map(c => c.id === currentClubId ? { ...c, name } : c));
    flash("Nombre del club actualizado");
  };
  const assignTeam = async (id, teamId) => {
    const { data, error } = await supabase.from("users").update({ team_id: teamId }).eq("id", id).select();
    if (error) { flash("No se pudo guardar la tripulación. Inténtalo de nuevo."); return; }
    if (!data || data.length === 0) { flash("No se pudo guardar: no tienes permiso sobre este usuario."); return; }
    setTeamOverrides(prev => ({ ...prev, [id]: teamId }));
    flash(`${displayNameOf(id)} asignado a ${teamName(teamId)}`);
  };
  const setPersonRole = async (id, role) => {
    const { data, error } = await supabase.from("users").update({ role }).eq("id", id).select();
    if (error) { flash("No se pudo actualizar el rol. Inténtalo de nuevo."); return; }
    if (!data || data.length === 0) { flash("No se pudo actualizar el rol: no tienes permiso sobre este usuario."); return; }
    setRoleOverrides(prev => ({ ...prev, [id]: role }));
    flash(`Rol actualizado a ${role === "coach" ? "Entrenador" : "Remero"}`);
  };
  const managedTeamsOf = (coachId) => coachTeams[coachId] || [];
  const toggleCoachTeam = async (coachId, teamId) => {
    const cur = coachTeams[coachId] || [];
    const granting = !cur.includes(teamId);
    const next = granting ? [...cur, teamId] : cur.filter(id => id !== teamId);
    setCoachTeams(prev => ({ ...prev, [coachId]: next }));
    if (granting) {
      const { error } = await supabase.from("coach_team_permissions").insert({ coach_id: coachId, team_id: teamId });
      if (error) { flash("No se pudo guardar el permiso. Inténtalo de nuevo."); return; }
    } else {
      const { error } = await supabase.from("coach_team_permissions").delete().eq("coach_id", coachId).eq("team_id", teamId);
      if (error) { flash("No se pudo quitar el permiso. Inténtalo de nuevo."); return; }
    }
    flash("Permisos de gestión actualizados");
  };
  const isUsernameTaken = (username) => {
    const u = (username || "").trim().toLowerCase();
    if (!u) return false;
    if (u === "admin") return true;
    if (clubs.some(c => c.username.toLowerCase() === u)) return true;
    if (assignedUsers.some(p => p.username.toLowerCase() === u)) return true;
    if (pendingUsers.some(p => p.username.toLowerCase() === u)) return true;
    return false;
  };

  const registerUser = async (person) => {
    setLoginError(null);
    if (!person.firstName?.trim() || !person.lastName?.trim() || !person.apodo?.trim() || !person.birthDate || !person.email?.trim()) {
      setLoginError("Rellena todos los campos obligatorios.");
      return;
    }
    if (!person.side) { setLoginError("Elige tu función en el equipo."); return; }
    if (person.password !== person.passwordRepeat) { setLoginError("Las contraseñas no coinciden."); return; }
    const code = (person.clubCode || "").trim();
    const { data: clubRow, error: clubErr } = await supabase.from("clubs").select("*").eq("access_code", code).maybeSingle();
    if (clubErr || !clubRow) { setLoginError(clubs.length === 0 ? "Todavía no se ha registrado ningún club." : "Código de club incorrecto."); return; }
    if (isUsernameTaken(person.username)) { setLoginError("Ese nombre de usuario ya existe. Elige otro."); return; }
    const cleanUsername = person.username.trim().toLowerCase();
    const cleanEmail = person.email.trim().toLowerCase();
    const password = person.password || "1234";

    let authUserId;
    const { data: authData, error: authError } = await supabase.auth.signUp({ email: cleanEmail, password });
    if (authError || !authData?.user) {
      // Si el correo ya existe, puede ser un registro anterior que se quedó a medias (creó la cuenta de acceso
      // pero no llegó a guardar sus datos). Probamos a entrar con lo mismo que acaba de escribir para completarlo.
      if (authError?.message?.includes("already registered")) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (signInError || !signInData?.user) {
          setLoginError("Ese correo ya está registrado con otra contraseña. Si es tuyo, entra con 'Acceso usuario'.");
          return;
        }
        const { data: existingRow } = await supabase.from("users").select("id").eq("auth_user_id", signInData.user.id).maybeSingle();
        if (existingRow) {
          setLoginError("Ya existe una cuenta completa con ese correo. Entra con 'Acceso usuario'.");
          return;
        }
        authUserId = signInData.user.id; // cuenta a medias: seguimos para completarla
      } else {
        setLoginError(authError?.message === "Password should be at least 6 characters" ? "La contraseña debe tener al menos 6 caracteres." : "No se pudo completar el registro. Inténtalo de nuevo.");
        return;
      }
    } else {
      authUserId = authData.user.id;
    }

    const { data, error } = await supabase.from("users").insert({
      club_id: clubRow.id,
      username: cleanUsername,
      auth_user_id: authUserId,
      first_name: person.firstName.trim(),
      last_name: person.lastName.trim(),
      nickname: person.apodo.trim(),
      birth_date: person.birthDate,
      email: cleanEmail,
      phone: person.phone?.trim() || null,
      side: person.side,
      status: "pending",
      photo_url: person.photo || null,
    }).select().single();
    if (error) {
      // No dejamos una cuenta de acceso a medias sin cerrar: si no se pudo guardar, cerramos la sesión
      // recién creada para no quedarnos "a medio registrar" y poder reintentarlo limpio.
      await supabase.auth.signOut();
      setLoginError("No se pudo completar el registro. Vuelve a intentarlo en un momento.");
      return;
    }
    const entry = { id: data.id, clubId: data.club_id, username: data.username, apodo: data.nickname, side: data.side };
    setPendingUsers(prev => [...prev, entry]);
    if (person.photo) setProfilePhotos(prev => ({ ...prev, [data.id]: person.photo }));
    setLastRegistered(entry);
    setCurrentClubId(clubRow.id);
    setScreen("pendingRole");
  };
  const assignPendingUser = async (id, role, teamId) => {
    const p = pendingUsers.find(u => u.id === id);
    if (!p) return;
    const updates = { status: "active", role, activated_at: new Date().toISOString() };
    if (role === "rower" && teamId) updates.team_id = teamId;
    const { data, error } = await supabase.from("users").update(updates).eq("id", id).select();
    if (error) { flash("No se pudo asignar el rol. Inténtalo de nuevo."); return; }
    if (!data || data.length === 0) { flash("No se pudo asignar el rol: no tienes permiso sobre este usuario."); return; }
    setPendingUsers(prev => prev.filter(u => u.id !== id));
    setAssignedUsers(prev => [...prev, p]);
    setRoleOverrides(prev => ({ ...prev, [id]: role }));
    if (role === "rower" && teamId) setTeamOverrides(prev => ({ ...prev, [id]: teamId }));
    flash(`${p.apodo || p.username} asignado como ${role === "coach" ? "Entrenador" : "Remero"}`);
  };
  const rejectPendingUser = async (id) => {
    const p = pendingUsers.find(u => u.id === id);
    await supabase.from("users").delete().eq("id", id);
    setPendingUsers(prev => prev.filter(u => u.id !== id));
    flash(`Solicitud de ${p?.username || "usuario"} eliminada`);
  };
  const removeAssignedUser = async (id) => {
    const p = assignedUsers.find(u => u.id === id);
    const { error } = await supabase.from("users").delete().eq("id", id);
    if (error) { flash("No se pudo eliminar el usuario. Inténtalo de nuevo."); return; }
    setAssignedUsers(prev => prev.filter(u => u.id !== id));
    setCoachTeams(prev => { const next = { ...prev }; delete next[id]; return next; });
    flash(`${p?.apodo || p?.username || "Usuario"} eliminado del club`);
  };
  const deleteClub = async (clubId) => {
    const c = clubs.find(cl => cl.id === clubId);
    const teamIds = teams.filter(t => t.clubId === clubId).map(t => t.id);
    const { error } = await supabase.from("clubs").delete().eq("id", clubId);
    if (error) { flash("No se pudo eliminar el club. Inténtalo de nuevo."); return; }
    setClubs(prev => prev.filter(cl => cl.id !== clubId));
    setTeams(prev => prev.filter(t => t.clubId !== clubId));
    setAssignedUsers(prev => prev.filter(u => u.clubId !== clubId));
    setPendingUsers(prev => prev.filter(u => u.clubId !== clubId));
    setSessions(prev => prev.filter(s => !teamIds.includes(s.teamId)));
    setGymPlans(prev => { const next = { ...prev }; teamIds.forEach(id => delete next[id]); return next; });
    if (currentClubId === clubId) setCurrentClubId(null);
    flash(`Club "${c?.name}" eliminado junto con todos sus datos`);
  };

  const teamName = (id) => teams.find(t => t.id === id)?.name || "—";
  const teamCode = (id) => teams.find(t => t.id === id)?.code || "—";
  const addTeam = async (name) => {
    const code = randomTeamCode();
    const { data, error } = await supabase.from("teams").insert({
      club_id: currentClubId, name, code,
    }).select().single();
    if (error) { flash("No se pudo crear la tripulación. Inténtalo de nuevo."); return; }
    const newTeam = { id: data.id, clubId: data.club_id, name: data.name, code: data.code };
    setTeams(prev => [...prev, newTeam]);
    const newSessions = buildSessions(data.id);
    setSessions(prev => [...prev, ...newSessions]);
    const rows = newSessions.map(s => ({
      id: s.id, team_id: s.teamId, date: s.iso, iso: s.iso, dow: s.dow, time: s.time, title: s.title,
      active: s.active, status: s.status, suspended_reason: s.suspendedReason, boat: s.boat, oars: s.oars,
      signups: [], seats: s.seats, patron: s.patron, reserves: s.reserves, zodiac: s.zodiac,
    }));
    const { error: sessErr } = await supabase.from("water_sessions").insert(rows);
    if (sessErr) { flash("Tripulación creada, pero hubo un problema guardando el calendario."); return; }
    flash(`Tripulación "${name}" creada`);
  };
  const removeTeam = async (id) => {
    const t = teams.find(t => t.id === id);
    const { error } = await supabase.from("teams").delete().eq("id", id);
    if (error) { flash("No se pudo eliminar la tripulación. Inténtalo de nuevo."); return; }
    setTeams(prev => prev.filter(t => t.id !== id));
    setSessions(prev => prev.filter(s => s.teamId !== id));
    setCoachTeams(prev => Object.fromEntries(Object.entries(prev).map(([cid, ids]) => [cid, ids.filter(tid => tid !== id)])));
    if (coachScope === id) setCoachScope("club");
    flash(`Tripulación "${t?.name}" eliminada`);
  };

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const today = new Date(2026, 7, 12);

  const myTeamId = teamOf(currentUserId);
  const myManagedTeams = managedTeamsOf(currentUserId);
  const canManage = (teamId) => myManagedTeams.includes(teamId);
  const myTeamSessions = useMemo(() => sessions.filter(s => s.teamId === myTeamId), [sessions, myTeamId]);
  const rowerUpcoming = useMemo(() => myTeamSessions.filter(s => s.active && s.date >= today).sort((a, b) => a.date - b.date).slice(0, 40), [myTeamSessions]);
  const rowerWeekAhead = rowerUpcoming.slice(0, 6);

  const coachTeamSessions = useMemo(() => {
    const clubTeamIds = new Set(clubTeams.map(t => t.id));
    return coachScope === "club" ? sessions.filter(s => clubTeamIds.has(s.teamId)) : sessions.filter(s => s.teamId === coachScope);
  }, [sessions, coachScope, clubTeams]);
  const coachUpcoming = useMemo(() => coachTeamSessions.filter(s => s.active && s.date >= today).sort((a, b) => a.date - b.date).slice(0, 40), [coachTeamSessions]);
  const coachWeekAhead = coachUpcoming.slice(0, 6);

  const totalPastActiveFor = (teamId) => sessions.filter(s => s.teamId === teamId && s.active && hasPassed(s, today)).length;
  const totalPastActive = totalPastActiveFor(myTeamId);

  const attendanceStats = useMemo(() => {
    const past = sessions.filter(s => s.teamId === myTeamId && s.active && hasPassed(s, today));
    const monthAttended = past.filter(s => s.status === "cerrado" && inCrew(s, currentUserId)).length;
    const monthTotal = past.length;
    return {
      month: { label: "agosto", attended: monthAttended, total: monthTotal },
      year: {
        label: ATTENDANCE_BASE.label,
        attended: ATTENDANCE_BASE.attendedBeforeAgosto + monthAttended,
        total: ATTENDANCE_BASE.totalBeforeAgosto + monthTotal,
      },
    };
  }, [sessions, currentUserId, myTeamId]);

  const statsFor = (id) => crewStatsFor(sessions, id, today);

  const overlapFor = (session) => {
    if (!session.active || !session.boat) return null; // sin bote asignado no se puede saber si hay conflicto real
    const range = parseTimeRange(session.time);
    const clash = sessions.find(s =>
      s.teamId !== session.teamId && s.iso === session.iso && s.active &&
      s.boat === session.boat &&
      rangesOverlap(range, parseTimeRange(s.time))
    );
    if (!clash) return null;
    return { team: teamName(clash.teamId), time: clash.time, boat: clash.boat };
  };

  const updateSession = async (id, patch) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    if (openSession && openSession.id === id) setOpenSession(prev => ({ ...prev, ...patch }));
    const dbPatch = {};
    if ("active" in patch) dbPatch.active = patch.active;
    if ("suspendedReason" in patch) dbPatch.suspended_reason = patch.suspendedReason;
    if ("time" in patch) dbPatch.time = patch.time;
    if ("title" in patch) dbPatch.title = patch.title;
    if ("boat" in patch) dbPatch.boat = patch.boat;
    if ("oars" in patch) dbPatch.oars = patch.oars;
    if ("status" in patch) dbPatch.status = patch.status;
    if ("signups" in patch) dbPatch.signups = Array.from(patch.signups);
    if ("seats" in patch) dbPatch.seats = patch.seats;
    if ("patron" in patch) dbPatch.patron = patch.patron;
    if ("reserves" in patch) dbPatch.reserves = patch.reserves;
    if ("zodiac" in patch) dbPatch.zodiac = patch.zodiac;
    if (Object.keys(dbPatch).length === 0) return true;
    const { data, error } = await supabase.from("water_sessions").update(dbPatch).eq("id", id).select();
    if (error) { flash("No se pudo guardar el cambio. Inténtalo de nuevo."); return false; }
    if (!data || data.length === 0) { flash("No se pudo guardar: no tienes permiso sobre esta tripulación."); return false; }
    return true;
  };

  const toggleSignup = async (session) => {
    const next = new Set(session.signups);
    if (next.has(currentUserId)) next.delete(currentUserId); else next.add(currentUserId);
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, signups: next } : s));
    if (openSession && openSession.id === session.id) setOpenSession(prev => ({ ...prev, signups: next }));
    const { error } = await supabase.rpc("toggle_water_signup", { p_session_id: session.id });
    if (error) flash("No se pudo actualizar. Inténtalo de nuevo.");
  };

  const [sessionAlerts, setSessionAlerts] = useState({}); // { [sessionId]: [{id, rowerId, text, resolved}] }
  const alertsFor = (sessionId) => (sessionAlerts[sessionId] || []).filter(a => !a.resolved);
  const sendCantComeAlert = async (session) => {
    const text = `${displayNameOf(currentUserId)} avisa que no puede venir al entreno del ${session.date.getDate()} de ${MONTHS_ES[session.date.getMonth()]}.`;
    const { data, error } = await supabase.from("session_alerts").insert({ session_id: session.id, rower_id: currentUserId, text }).select().single();
    if (error) { flash("No se pudo enviar el aviso. Inténtalo de nuevo."); return; }
    setSessionAlerts(prev => ({ ...prev, [session.id]: [...(prev[session.id] || []), { id: data.id, rowerId: data.rower_id, text: data.text, resolved: false }] }));
    flash("Aviso enviado al entrenador");
  };
  const resolveAlert = async (sessionId, alertId) => {
    setSessionAlerts(prev => ({ ...prev, [sessionId]: (prev[sessionId] || []).map(a => a.id === alertId ? { ...a, resolved: true } : a) }));
    await supabase.from("session_alerts").update({ resolved: true }).eq("id", alertId);
  };

  const assign = (session, slotType, slotIndex) => {
    if (!selectedRowerChip) return;
    const already = session.seats.includes(selectedRowerChip) || session.patron === selectedRowerChip || session.reserves.includes(selectedRowerChip) || session.zodiac.includes(selectedRowerChip);
    if (already) return;
    if (slotType === "seat") {
      const seats = [...session.seats]; seats[slotIndex] = selectedRowerChip;
      updateSession(session.id, { seats });
    } else if (slotType === "patron") {
      updateSession(session.id, { patron: selectedRowerChip });
    } else if (slotType === "zodiac") {
      const zodiac = [...session.zodiac]; zodiac[slotIndex] = selectedRowerChip;
      updateSession(session.id, { zodiac });
    } else {
      const reserves = [...session.reserves]; reserves[slotIndex] = selectedRowerChip;
      updateSession(session.id, { reserves });
    }
    setSelectedRowerChip(null);
  };

  const clearSlot = (session, slotType, slotIndex) => {
    if (slotType === "seat") { const seats = [...session.seats]; seats[slotIndex] = null; updateSession(session.id, { seats }); }
    else if (slotType === "patron") updateSession(session.id, { patron: null });
    else if (slotType === "zodiac") { const zodiac = [...session.zodiac]; zodiac[slotIndex] = null; updateSession(session.id, { zodiac }); }
    else { const reserves = [...session.reserves]; reserves[slotIndex] = null; updateSession(session.id, { reserves }); }
  };

  const closeCrew = async (session, previousRoster) => {
    const ok = await updateSession(session.id, { status: "cerrado" });
    if (!ok) return; // si no se pudo cerrar de verdad, no mandamos notificaciones con datos que no cuadran
    const assigned = [...session.seats, session.patron, ...session.reserves, ...session.zodiac].filter(Boolean);
    const notes = assigned.map(rid => {
      let role = "reserva";
      const seatIdx = session.seats.indexOf(rid);
      if (seatIdx > -1) role = `puesto ${seatShort(seatIdx)}`;
      else if (session.patron === rid) role = "patrón";
      else if (session.zodiac.includes(rid)) role = "zodiac";
      return {
        rowerId: rid,
        text: `Has sido convocado al entreno de agua del ${session.date.getDate()} de ${MONTHS_ES[session.date.getMonth()]}, ${session.time}. Rol: ${role}.`,
      };
    });
    // Si venimos de reabrir y modificar una convocatoria ya cerrada, avisamos aparte
    // a quien haya quedado fuera, con un mensaje distinto al de "convocado"
    if (previousRoster) {
      const prevAssigned = [...previousRoster.seats, previousRoster.patron, ...previousRoster.reserves, ...(previousRoster.zodiac || [])].filter(Boolean);
      const removed = prevAssigned.filter(rid => !assigned.includes(rid));
      removed.forEach(rid => {
        notes.push({
          rowerId: rid,
          text: `Ya no estás convocado/a al entreno de agua del ${session.date.getDate()} de ${MONTHS_ES[session.date.getMonth()]}, ${session.time}. La convocatoria ha cambiado.`,
        });
      });
    }
    if (notes.length > 0) {
      const { data, error } = await supabase.from("notifications").insert(
        notes.map(n => ({ rower_id: n.rowerId, session_id: session.id, text: n.text }))
      ).select();
      if (!error && data) {
        setNotifications(prev => [...data.map(d => ({ id: d.id, rowerId: d.rower_id, text: d.text })), ...prev]);
      } else if (error) {
        flash("Tripulación cerrada, pero hubo un problema guardando las notificaciones.");
        return;
      }
    }
    flash("Tripulación cerrada y notificaciones enviadas");
  };

  const reopenCrew = (session) => {
    updateSession(session.id, { status: "abierto" });
    flash("Tripulación reabierta — modifica lo que haga falta y vuelve a cerrarla para notificar");
  };

  const toggleActive = (session) => {
    if (session.active) {
      const hasData = !!session.boat || !!session.oars
        || session.signups.size > 0
        || session.seats.some(Boolean) || !!session.patron || session.reserves.some(Boolean);
      if (hasData) { setSuspendTarget(session); return; } // hay bote/rems/gente: pedimos motivo antes de tocar nada
      updateSession(session.id, { active: false, suspendedReason: null }); // nada configurado todavía: se desactiva sin más
      return;
    }
    updateSession(session.id, { active: true, suspendedReason: null });
  };
  const confirmSuspend = (reason) => {
    if (!suspendTarget) return;
    updateSession(suspendTarget.id, { active: false, suspendedReason: reason });
    flash(`Entreno del ${suspendTarget.date.getDate()} de ${MONTHS_ES[suspendTarget.date.getMonth()]} suspendido: ${reason}`);
    setSuspendTarget(null);
  };
  const renameSession = (session, title) => updateSession(session.id, { title });

  const [pesosLogs, setPesosLogs] = useState({});
  const [ergoLogs, setErgoLogs] = useState({});
  const pesosLogOf = (id) => pesosLogs[id] || [];
  const ergoLogOf = (id) => ergoLogs[id] || [];
  const addPesosEntry = (entry) => {
    setPesosLogs(prev => ({ ...prev, [currentUserId]: [{ id: `p${Date.now()}`, ...entry }, ...(prev[currentUserId] || [])] }));
    flash("Registro de pesos guardado");
  };
  const addErgoEntry = (entry) => {
    setErgoLogs(prev => ({ ...prev, [currentUserId]: [{ id: `e${Date.now()}`, ...entry }, ...(prev[currentUserId] || [])] }));
    flash("Registro de ergo guardado");
  };

  const [pesosExercises, setPesosExercises] = useState({}); // { [rowerId]: [{id,name,baseKg}] }
  const pesosExercisesOf = (id) => pesosExercises[id] || [];
  const addPesosExercise = async (rowerId, name) => {
    const { data, error } = await supabase.from("pesos_exercises").insert({ rower_id: rowerId, name }).select().single();
    if (error) { flash("No se pudo crear el ejercicio. Inténtalo de nuevo."); return; }
    setPesosExercises(prev => ({ ...prev, [rowerId]: [...(prev[rowerId] || []), { id: data.id, name: data.name, baseKg: data.base_kg }] }));
  };
  const setPesosExerciseBase = async (rowerId, exId, kg) => {
    setPesosExercises(prev => ({ ...prev, [rowerId]: (prev[rowerId] || []).map(ex => ex.id === exId ? { ...ex, baseKg: kg } : ex) }));
    const { error } = await supabase.from("pesos_exercises").update({ base_kg: kg }).eq("id", exId);
    if (error) { flash("No se pudo guardar. Inténtalo de nuevo."); return; }
    flash("Registro actualizado");
  };
  const removePesosExercise = async (rowerId, exId) => {
    setPesosExercises(prev => ({ ...prev, [rowerId]: (prev[rowerId] || []).filter(ex => ex.id !== exId) }));
    const { error } = await supabase.from("pesos_exercises").delete().eq("id", exId);
    if (error) { flash("No se pudo eliminar. Inténtalo de nuevo."); return; }
    flash("Ejercicio eliminado");
  };

  const [ergoTestTimes, setErgoTestTimes] = useState({}); // { [rowerId]: "mm:ss" del TEST 1600 }
  const setErgoTest = async (timeStr) => {
    setErgoTestTimes(prev => ({ ...prev, [currentUserId]: timeStr }));
    const { error } = await supabase.from("ergo_tests").upsert(
      { rower_id: currentUserId, test_time: timeStr, updated_at: new Date().toISOString() },
      { onConflict: "rower_id" }
    );
    if (error) { flash("No se pudo guardar. Inténtalo de nuevo."); return; }
    flash("TEST 1600 actualizado");
  };
  const [gymPlans, setGymPlans] = useState({}); // { [teamId]: { [week]: { activeDays: [...], weekAttachment, days: { lun: {content}, ... } } } }
  const [gymCompletion, setGymCompletion] = useState({}); // { [rowerId]: { "teamId-week-day": { done, photos: [{dataUrl,kind}] } } }
  const currentWeek = Math.ceil(today.getDate() / 7);
  const gymWeekMeta = (teamId, week) => (gymPlans[teamId] && gymPlans[teamId][week]) || { activeDays: [], weekAttachment: null, days: {} };
  // vista "plana" por día, para las pantallas que solo necesitan el contenido de texto de cada día
  const gymWeekPlan = (teamId, week) => gymWeekMeta(teamId, week).days || {};
  const setGymActiveDays = async (teamId, week, activeDays) => {
    setGymPlans(prev => {
      const meta = (prev[teamId] || {})[week] || { activeDays: [], weekAttachment: null, days: {} };
      return { ...prev, [teamId]: { ...(prev[teamId] || {}), [week]: { ...meta, activeDays } } };
    });
    const { error } = await supabase.from("gym_weeks").upsert(
      { team_id: teamId, week_number: week, active_days: activeDays },
      { onConflict: "team_id,week_number" }
    );
    if (error) flash("No se pudo guardar. Inténtalo de nuevo.");
  };
  const setGymWeekAttachment = async (teamId, week, attachment) => {
    setGymPlans(prev => {
      const meta = (prev[teamId] || {})[week] || { activeDays: [], weekAttachment: null, days: {} };
      return { ...prev, [teamId]: { ...(prev[teamId] || {}), [week]: { ...meta, weekAttachment: attachment } } };
    });
    const { error } = await supabase.from("gym_weeks").upsert(
      {
        team_id: teamId, week_number: week,
        attachment_name: attachment ? attachment.name : null,
        attachment_type: attachment ? attachment.fileType : null,
        attachment_url: attachment ? attachment.dataUrl : null,
      },
      { onConflict: "team_id,week_number" }
    );
    if (error) { flash("No se pudo guardar el archivo. Inténtalo de nuevo."); return; }
    flash(attachment ? "Archivo de la semana adjuntado" : "Archivo de la semana eliminado");
  };
  const setGymContent = async (teamId, week, day, content) => {
    setGymPlans(prev => {
      const meta = (prev[teamId] || {})[week] || { activeDays: [], weekAttachment: null, days: {} };
      return { ...prev, [teamId]: { ...(prev[teamId] || {}), [week]: { ...meta, days: { ...meta.days, [day]: { ...(meta.days[day] || {}), content } } } } };
    });
    const { error } = await supabase.from("gym_days").upsert(
      { team_id: teamId, week_number: week, day_key: day, content },
      { onConflict: "team_id,week_number,day_key" }
    );
    if (error) { flash("No se pudo guardar. Inténtalo de nuevo."); return; }
    flash("Entreno de gimnasio guardado");
  };
  const gymRecordOf = (rowerId, teamId, week, day) => (gymCompletion[rowerId] && gymCompletion[rowerId][`${teamId}-${week}-${day}`]) || null;
  const addGymPhoto = async (rowerId, teamId, week, day, photo, photoKind) => {
    const key = `${teamId}-${week}-${day}`;
    const existing = (gymCompletion[rowerId] || {})[key];
    const photos = [...((existing && existing.photos) || []), { dataUrl: photo, kind: photoKind || "image" }];
    setGymCompletion(prev => ({ ...prev, [rowerId]: { ...(prev[rowerId] || {}), [key]: { done: true, photos } } }));
    const { error } = await supabase.from("gym_completions").upsert(
      { rower_id: rowerId, team_id: teamId, week_number: week, day_key: day, done: true, photos },
      { onConflict: "rower_id,team_id,week_number,day_key" }
    );
    if (error) { flash("No se pudo guardar la foto. Inténtalo de nuevo."); return; }
    flash("Foto añadida — entreno marcado como hecho");
  };
  const removeGymPhoto = async (rowerId, teamId, week, day, photoIndex) => {
    const key = `${teamId}-${week}-${day}`;
    const existing = (gymCompletion[rowerId] || {})[key];
    if (!existing) return;
    const photos = existing.photos.filter((_, i) => i !== photoIndex);
    setGymCompletion(prev => {
      const mine = { ...(prev[rowerId] || {}) };
      if (photos.length === 0) delete mine[key];
      else mine[key] = { done: true, photos };
      return { ...prev, [rowerId]: mine };
    });
    if (photos.length === 0) {
      await supabase.from("gym_completions").delete()
        .eq("rower_id", rowerId).eq("team_id", teamId).eq("week_number", week).eq("day_key", day);
    } else {
      await supabase.from("gym_completions").upsert(
        { rower_id: rowerId, team_id: teamId, week_number: week, day_key: day, done: true, photos },
        { onConflict: "rower_id,team_id,week_number,day_key" }
      );
    }
  };
  const clearGymRecord = async (rowerId, teamId, week, day) => {
    const key = `${teamId}-${week}-${day}`;
    setGymCompletion(prev => {
      const mine = { ...(prev[rowerId] || {}) };
      delete mine[key];
      return { ...prev, [rowerId]: mine };
    });
    await supabase.from("gym_completions").delete()
      .eq("rower_id", rowerId).eq("team_id", teamId).eq("week_number", week).eq("day_key", day);
  };

  const waterStatsFor = (rowerId, teamId) => {
    const teamPast = sessions.filter(s => s.teamId === teamId && s.active && hasPassed(s, today));
    const weekPast = teamPast.filter(s => weekOfDate(s.date) === currentWeek);
    // "completado" exige tripulación cerrada Y que el entreno ya haya pasado
    return {
      weekDone: weekPast.filter(s => s.status === "cerrado" && inCrew(s, rowerId)).length,
      weekTotal: weekPast.length,
      monthDone: teamPast.filter(s => s.status === "cerrado" && inCrew(s, rowerId)).length,
      monthTotal: teamPast.length,
    };
  };
  const gymStatsFor = (rowerId, teamId) => {
    let weekDone = 0, weekTotal = 0, monthDone = 0, monthTotal = 0;
    for (let w = 1; w <= currentWeek; w++) {
      const meta = gymWeekMeta(teamId, w);
      (meta.activeDays || []).forEach(day => {
        monthTotal++;
        const rec = gymRecordOf(rowerId, teamId, w, day);
        const done = !!(rec && rec.done);
        if (done) monthDone++;
        if (w === currentWeek) {
          weekTotal++;
          if (done) weekDone++;
        }
      });
    }
    return { weekDone, weekTotal, monthDone, monthTotal };
  };

  const findLoginId = (username) => {
    const u = (username || "").trim().toLowerCase();
    if (!u) return null;
    const assigned = assignedUsers.find(p => p.username.toLowerCase() === u);
    if (assigned) return { id: assigned.id, clubId: assigned.clubId };
    const pending = pendingUsers.find(p => p.username.toLowerCase() === u);
    if (pending) return { pending };
    return null;
  };

  const tryAdminLogin = async (username, password) => {
    const cleanUsername = (username || "").trim().toLowerCase();
    if (cleanUsername !== "admin") return false;
    const authEmail = `${cleanUsername}@virada.app`;
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: authEmail, password });
    if (authError || !authData?.user) return false;
    const { data, error } = await supabase.from("admins").select("*").eq("auth_user_id", authData.user.id).maybeSingle();
    if (error || !data) return false;
    await loadData();
    setRole("admin");
    setCurrentClubId(null);
    setScreen("home");
    return true;
  };

  const loginClub = async (username, password) => {
    setLoginError(null);
    if (await tryAdminLogin(username, password)) return;
    const cleanUsername = (username || "").trim().toLowerCase();
    const { data: resolvedEmail, error: resolveError } = await supabase.rpc("resolve_club_login_email", { p_username: cleanUsername });
    if (resolveError || !resolvedEmail) {
      setLoginError("Usuario o contraseña incorrectos.");
      return;
    }
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password });
    if (authError || !authData?.user) {
      setLoginError("Usuario o contraseña incorrectos.");
      return;
    }
    const { data, error } = await supabase.from("clubs").select("*").eq("auth_user_id", authData.user.id).maybeSingle();
    if (error || !data) {
      setLoginError("Usuario o contraseña incorrectos.");
      return;
    }
    await loadData();
    setClubs(prev => prev.some(c => c.id === data.id) ? prev : [...prev, {
      id: data.id, code: data.access_code, name: data.name, username: data.username, createdAt: data.created_at, photoUrl: data.photo_url || null,
    }]);
    setCurrentClubId(data.id);
    setRole("club");
    setScreen("home");
  };

  const loginUser = async (username, password) => {
    setLoginError(null);
    if (await tryAdminLogin(username, password)) return;
    const cleanUsername = (username || "").trim().toLowerCase();
    const { data: resolvedEmail, error: resolveError } = await supabase.rpc("resolve_user_login_email", { p_username: cleanUsername });
    if (resolveError || !resolvedEmail) {
      setLoginError("Usuario o contraseña incorrectos.");
      return;
    }
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password });
    if (authError || !authData?.user) {
      setLoginError("Usuario o contraseña incorrectos.");
      return;
    }
    const { data, error } = await supabase.from("users").select("*").eq("auth_user_id", authData.user.id).maybeSingle();
    if (error || !data) {
      setLoginError("Usuario o contraseña incorrectos.");
      return;
    }
    if (data.status === "pending") {
      const entry = { id: data.id, clubId: data.club_id, username: data.username, apodo: data.nickname, side: data.side };
      setLastRegistered(entry);
      setCurrentClubId(data.club_id);
      setScreen("pendingRole");
      return;
    }
    await loadData();
    setCurrentUserId(data.id);
    setCurrentClubId(data.club_id ?? null);
    if (data.role) setRoleOverrides(prev => ({ ...prev, [data.id]: data.role }));
    setRole(data.role || "rower");
    setScreen("home");
  };

  const registerClub = async (club) => {
    setLoginError(null);
    if (!club.username || !club.password) { setLoginError("Usuario y contraseña son obligatorios."); return; }
    if (club.password !== club.passwordRepeat) { setLoginError("Las contraseñas no coinciden."); return; }
    if (!club.email?.trim()) {
      setLoginError("El correo electrónico es obligatorio.");
      return;
    }
    if (!club.contactFirstName?.trim() || !club.contactLastName?.trim() || !club.contactRole?.trim()) {
      setLoginError("Rellena los datos de la persona de contacto.");
      return;
    }
    if (isUsernameTaken(club.username)) { setLoginError("Ese nombre de usuario ya existe. Elige otro."); return; }
    const cleanUsername = club.username.trim().toLowerCase();
    const cleanEmail = club.email.trim().toLowerCase();

    let authUserId;
    const { data: authData, error: authError } = await supabase.auth.signUp({ email: cleanEmail, password: club.password });
    if (authError || !authData?.user) {
      // Si el correo ya existe, puede ser un registro anterior que se quedó a medias (creó la cuenta de acceso
      // pero no llegó a guardar el club). Probamos a entrar con lo mismo que acaba de escribir para completarlo.
      if (authError?.message?.includes("already registered")) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: club.password });
        if (signInError || !signInData?.user) {
          setLoginError("Ese correo ya está registrado con otra contraseña. Si es tuyo, entra con 'Acceso club'.");
          return;
        }
        const { data: existingRow } = await supabase.from("clubs").select("id").eq("auth_user_id", signInData.user.id).maybeSingle();
        if (existingRow) {
          setLoginError("Ya existe un club completo con ese correo. Entra con 'Acceso club'.");
          return;
        }
        authUserId = signInData.user.id; // cuenta a medias: seguimos para completarla
      } else {
        setLoginError(authError?.message === "Password should be at least 6 characters" ? "La contraseña debe tener al menos 6 caracteres." : "No se pudo registrar el club. Inténtalo de nuevo.");
        return;
      }
    } else {
      authUserId = authData.user.id;
    }

    let code = randomClubCode();
    while (clubs.some(c => c.code === code)) code = randomClubCode(); // cada club tiene un código único, propio y exclusivo
    const { data, error } = await supabase.from("clubs").insert({
      name: club.name && club.name.trim() ? club.name.trim() : "Tu club",
      access_code: code,
      username: cleanUsername,
      auth_user_id: authUserId,
      photo_url: club.photo || null,
      legal_name: club.legalName?.trim() || null,
      nif: club.nif?.trim() || null,
      email: cleanEmail,
      address: club.address?.trim() || null,
      city: club.city?.trim() || null,
      postal_code: club.postalCode?.trim() || null,
      contact_first_name: club.contactFirstName.trim(),
      contact_last_name: club.contactLastName.trim(),
      contact_role: club.contactRole.trim(),
      contact_phone: club.contactPhone?.trim() || null,
    }).select().single();
    if (error) {
      // No dejamos una cuenta de acceso a medias sin cerrar: si no se pudo guardar, cerramos la sesión
      // recién creada para no quedarnos "a medio registrar" y poder reintentarlo limpio.
      await supabase.auth.signOut();
      setLoginError("No se pudo registrar el club. Vuelve a intentarlo en un momento.");
      return;
    }
    await loadData();
    const newClub = {
      id: data.id, code: data.access_code, name: data.name,
      username: data.username, createdAt: data.created_at,
      photoUrl: data.photo_url || null,
    };
    setClubs(prev => [...prev, newClub]);
    setCurrentClubId(data.id);
    setRole("club");
    setScreen("home");
    flash(`Club registrado · código ${code}`);
  };

  const addRaceCategory = async (name) => {
    if (!name || !name.trim()) return;
    const { data, error } = await supabase.from("race_categories").insert({ name: name.trim().toUpperCase() }).select().single();
    if (error) { flash("No se pudo crear la categoría. Inténtalo de nuevo."); return; }
    setRaceCategories(prev => [...prev, { id: data.id, name: data.name, races: [] }]);
    flash("Categoría de regatas creada");
  };
  const removeRaceCategory = async (catId) => {
    const { error } = await supabase.from("race_categories").delete().eq("id", catId);
    if (error) { flash("No se pudo eliminar la categoría. Inténtalo de nuevo."); return; }
    setRaceCategories(prev => prev.filter(c => c.id !== catId));
    flash("Categoría eliminada");
  };
  const addRace = async (catId, dateLabel, title, subcategory) => {
    if (!dateLabel || !dateLabel.trim()) return;
    const { data, error } = await supabase.from("races").insert({
      category_id: catId, date_label: dateLabel.trim(), title: (title || "").trim(), subcategory: subcategory || null,
    }).select().single();
    if (error) { flash("No se pudo añadir el día. Inténtalo de nuevo."); return; }
    const newRace = { id: data.id, dateLabel: data.date_label, title: data.title || "", notes: data.notes || "", subcategory: data.subcategory || null, docs: [] };
    setRaceCategories(prev => prev.map(c => c.id === catId ? { ...c, races: [...c.races, newRace] } : c));
    flash("Día de regata añadido");
  };
  const removeRace = async (catId, raceId) => {
    const { error } = await supabase.from("races").delete().eq("id", raceId);
    if (error) { flash("No se pudo eliminar el día. Inténtalo de nuevo."); return; }
    setRaceCategories(prev => prev.map(c => c.id === catId ? { ...c, races: c.races.filter(r => r.id !== raceId) } : c));
    flash("Día de regata eliminado");
  };
  const addRaceDoc = async (catId, raceId, doc) => {
    const { data, error } = await supabase.from("race_documents").insert({
      race_id: raceId, title: doc.label, file_name: doc.name, file_type: doc.fileType, file_url: doc.dataUrl,
    }).select().single();
    if (error) { flash("No se pudo subir el documento. Inténtalo de nuevo."); return; }
    const newDoc = { id: data.id, label: data.title, name: data.file_name, fileType: data.file_type, dataUrl: data.file_url };
    setRaceCategories(prev => prev.map(c => c.id !== catId ? c : {
      ...c, races: c.races.map(r => r.id !== raceId ? r : { ...r, docs: [...r.docs, newDoc] }),
    }));
    flash("Documento subido");
  };
  const removeRaceDoc = async (catId, raceId, docId) => {
    const { error } = await supabase.from("race_documents").delete().eq("id", docId);
    if (error) { flash("No se pudo eliminar el documento. Inténtalo de nuevo."); return; }
    setRaceCategories(prev => prev.map(c => c.id !== catId ? c : {
      ...c, races: c.races.map(r => r.id !== raceId ? r : { ...r, docs: r.docs.filter(d => d.id !== docId) }),
    }));
  };
  const updateRaceTitle = async (catId, raceId, title) => {
    const { error } = await supabase.from("races").update({ title }).eq("id", raceId);
    if (error) { flash("No se pudo actualizar el título. Inténtalo de nuevo."); return; }
    setRaceCategories(prev => prev.map(c => c.id !== catId ? c : {
      ...c, races: c.races.map(r => r.id !== raceId ? r : { ...r, title }),
    }));
    flash("Título actualizado");
  };
  const updateRaceNotes = async (catId, raceId, notes) => {
    const { error } = await supabase.from("races").update({ notes }).eq("id", raceId);
    if (error) { flash("No se pudo actualizar la información. Inténtalo de nuevo."); return; }
    setRaceCategories(prev => prev.map(c => c.id !== catId ? c : {
      ...c, races: c.races.map(r => r.id !== raceId ? r : { ...r, notes }),
    }));
    flash("Información actualizada");
  };

  const recoverPassword = async (username) => {
    const cleanUsername = (username || "").trim().toLowerCase();
    if (cleanUsername) {
      const { data: email } = await supabase.rpc("resolve_user_login_email", { p_username: cleanUsername });
      if (email) {
        await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      }
    }
    // Mismo mensaje exista o no el usuario, para no revelar qué nombres de usuario están en uso
    flash("Si el usuario existe, hemos enviado un enlace a su correo de recuperación.");
  };

  const myNotifications = notifications.filter(n => n.rowerId === currentUserId);

  const Logo = ({ size = 22 }) => (
    <img src="data:image/png;base64,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" alt="VIRADA" style={{ height: size * 1.8, width: "auto", display: "block" }} />
  );

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "24px 8px", background: "#262626" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800;900&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');
        .vir-app * { box-sizing: border-box; font-family: 'Inter', sans-serif; }
        .vir-mono { font-family: 'IBM Plex Mono', monospace; }
        .vir-btn { cursor: pointer; border: none; transition: transform .1s ease, opacity .15s ease; }
        .vir-btn:active { transform: scale(0.97); }
        .vir-scroll::-webkit-scrollbar { display: none; }
        .vir-chip { transition: background .15s ease, border-color .15s ease; }
        .vir-seat { transition: fill .15s ease, stroke .15s ease; cursor: pointer; }
        @media print {
          body * { visibility: hidden; }
          .vir-print-area, .vir-print-area * { visibility: visible; }
          .vir-print-area { position: absolute; top: 0; left: 0; width: 100%; background: #FFFFFF !important; color: #111 !important; }
        }
      `}</style>
      <div className="vir-app vir-scroll" style={{
        width: 380, height: 780, background: "#333333",
        borderRadius: 40, border: "10px solid #1A1A1A", boxShadow: "0 30px 60px rgba(0,0,0,.5)",
        overflow: "hidden", position: "relative", display: "flex", flexDirection: "column"
      }}>
        {toast && (
          <div style={{ position: "absolute", top: 14, left: 14, right: 14, zIndex: 50, background: "#F5F5F5", border: "1px solid #E61E29", color: "#B5151E", padding: "10px 14px", borderRadius: 10, fontSize: 13, textAlign: "center", fontWeight: 600 }}>{toast}</div>
        )}

        {suspendTarget && (
          <SuspendReasonModal session={suspendTarget} onSelect={confirmSuspend} onCancel={() => setSuspendTarget(null)} />
        )}

        {viewPhoto && (
          <PhotoLightbox photo={viewPhoto.photo} caption={viewPhoto.caption} onClose={() => setViewPhoto(null)} />
        )}

        {screen === "login" && (
          <LoginScreen onRegisterClub={registerClub} onLoginClub={loginClub} onLoginUser={loginUser} onRegisterUser={registerUser} onRecoverPassword={recoverPassword} onClearError={() => setLoginError(null)} loginError={loginError} Logo={Logo} />
        )}

        {screen === "resetPassword" && (
          <ResetPasswordScreen onSubmit={setNewPasswordAfterRecovery} Logo={Logo} />
        )}

        {screen === "pendingRole" && (
          <PendingRoleScreen user={lastRegistered} onBack={() => { setLastRegistered(null); setScreen("login"); }} />
        )}

        {screen !== "login" && screen !== "pendingRole" && screen !== "resetPassword" && (
          <>
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #565656", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Logo size={20} />
              <button className="vir-btn" onClick={() => { setScreen("login"); setRole(null); setOpenSession(null); setCurrentClubId(null); }} style={{ background: "transparent", color: "#ADADAD" }}>
                <LogOut size={18} />
              </button>
            </div>

            <div className="vir-scroll" style={{ flex: 1, overflowY: "auto" }}>
              {screen === "home" && role === "rower" && (
                <RowerHome
                  sessions={rowerWeekAhead}
                  onOpen={(s) => { setOpenSession(s); setScreen("sessionRower"); }}
                  onToggle={toggleSignup}
                  notifCount={myNotifications.length}
                  teamName={teamName}
                  attendance={attendanceStats}
                  crewStats={statsFor(currentUserId)}
                  pesosExercises={pesosExercisesOf(currentUserId)}
                  ergoTest={ergoTestTimes[currentUserId] ? Math.round(wattsFromTestTime(ergoTestTimes[currentUserId])) : null}
                  onNavigate={(id) => setScreen(id)}
                  myId={currentUserId}
                  myName={displayNameOf(currentUserId)}
                  myTeam={teamOf(currentUserId)}
                />
              )}
              {screen === "home" && role === "coach" && (
                <CoachHome sessions={coachWeekAhead} onOpen={(s) => { setOpenSession(s); setSelectedRowerChip(null); setScreen("sessionCoach"); }} scope={coachScope} setScope={setCoachScope} teams={clubTeams} onPlanCalendar={() => setScreen("coachPlan")} onGymPlan={() => setScreen("coachGymPlan")} onTeamStats={() => setScreen("coachTeamStats")} onOpenRegattas={() => setScreen("regattas")} onOpenInformes={() => setScreen("informes")} coachName={displayNameOf(currentUserId)} teamName={teamName} showTeamLabel={coachScope === "club"} />
              )}
              {screen === "coachPlan" && (role === "coach" || role === "admin") && (
                <CoachPlanScreen
                  teamId={coachScope}
                  teams={clubTeams}
                  setScope={setCoachScope}
                  sessions={sessions.filter(s => s.teamId === coachScope)}
                  onBack={() => setScreen("home")}
                  onToggleActive={toggleActive}
                  onRename={renameSession}
                  onUpdateSession={updateSession}
                  overlapFor={overlapFor}
                  editable={role === "admin" ? true : canManage(coachScope)}
                />
              )}
              {screen === "coachGymPlan" && (role === "coach" || role === "admin") && (
                <CoachGymPlanScreen
                  teamId={coachScope}
                  teams={clubTeams}
                  setScope={setCoachScope}
                  currentWeek={currentWeek}
                  weekMetaFor={gymWeekMeta}
                  onSaveContent={setGymContent}
                  onSaveActiveDays={setGymActiveDays}
                  onSaveWeekAttachment={setGymWeekAttachment}
                  onBack={() => setScreen("home")}
                  editable={role === "admin" ? true : canManage(coachScope)}
                />
              )}
              {screen === "rowerGymPlan" && role === "rower" && (
                <RowerGymPlanScreen
                  teamId={teamOf(currentUserId)}
                  teamName={teamName}
                  currentWeek={currentWeek}
                  weekMetaFor={gymWeekMeta}
                  recordFor={(teamId, week, day) => gymRecordOf(currentUserId, teamId, week, day)}
                  onAddPhoto={(teamId, week, day, photo, photoKind) => addGymPhoto(currentUserId, teamId, week, day, photo, photoKind)}
                  onRemovePhoto={(teamId, week, day, idx) => removeGymPhoto(currentUserId, teamId, week, day, idx)}
                  onViewPhoto={(photo, caption) => setViewPhoto({ photo, caption })}
                  onBack={() => setScreen("home")}
                />
              )}
              {screen === "informes" && (role === "coach" || role === "admin") && (
                <InformesScreen
                  teamId={coachScope}
                  teams={clubTeams}
                  setScope={setCoachScope}
                  sessions={coachScope === "club" ? [] : sessions.filter(s => s.teamId === coachScope)}
                  gymWeekMetaFor={gymWeekMeta}
                  gymRecordFor={gymRecordOf}
                  members={[...ROWERS, ...clubAssignedUsers]
                    .filter(p => roleOf(p.id) === "rower" && teamOf(p.id) === coachScope)
                    .map(p => ({ id: p.id, name: p.name || p.username, nickname: nicknameOf(p.id) }))}
                  currentWeek={currentWeek}
                  waterStatsFor={waterStatsFor}
                  gymStatsFor={gymStatsFor}
                  today={today}
                  onBack={() => setScreen("home")}
                  onViewPhoto={(photo, caption) => setViewPhoto({ photo, caption })}
                />
              )}
              {screen === "coachTeamStats" && (role === "coach" || role === "admin") && (
                <CoachTeamStatsScreen
                  onBack={() => setScreen("home")}
                  scope={coachScope}
                  teams={clubTeams}
                  teamOf={teamOf}
                  teamName={teamName}
                  statsFor={statsFor}
                  totalPastActiveFor={totalPastActiveFor}
                  allPeople={[
                    ...ROWERS.map(r => ({ id: r.id, name: r.name, nickname: r.nickname })),
                    ...clubAssignedUsers.map(u => ({ id: u.id, name: u.username, nickname: u.apodo })),
                  ].filter(p => roleOf(p.id) === "rower")}
                  onOpenPerson={(p) => { setOpenPerson(p); setScreen("coachRowerDetail"); }}
                />
              )}
              {screen === "coachRowerDetail" && (role === "coach" || role === "admin") && openPerson && (
                <CoachRowerDetailScreen
                  person={openPerson}
                  onBack={() => setScreen("coachTeamStats")}
                  teamName={teamName}
                  teamOf={teamOf}
                  statsFor={statsFor}
                  totalPastActive={totalPastActiveFor(teamOf(openPerson.id))}
                  pesosExercises={pesosExercisesOf(openPerson.id)}
                  ergoTest={ergoTestTimes[openPerson.id] ? Math.round(wattsFromTestTime(ergoTestTimes[openPerson.id])) : null}
                  currentWeek={currentWeek}
                  weekPlanFor={gymWeekPlan}
                  recordFor={(teamId, week, day) => gymRecordOf(openPerson.id, teamId, week, day)}
                  waterWeekMonth={waterStatsFor(openPerson.id, teamOf(openPerson.id))}
                  gymWeekMonth={gymStatsFor(openPerson.id, teamOf(openPerson.id))}
                  onViewPhoto={(photo, caption) => setViewPhoto({ photo, caption })}
                  onOpenPesos={() => setScreen("coachPesos")}
                />
              )}
              {screen === "home" && role === "club" && (
                <ClubHome
                  teams={clubTeams}
                  onManageTeams={() => setScreen("teams")}
                  onManageUsers={() => setScreen("users")}
                  onOpenRegattas={() => setScreen("regattas")}
                  clubDisplayName={clubDisplayName}
                  clubCode={clubCode}
                  coachCount={[...ROWERS, ...clubAssignedUsers].filter(p => roleOf(p.id) === "coach").length}
                  rowerCount={[...ROWERS, ...clubAssignedUsers].filter(p => roleOf(p.id) === "rower").length}
                />
              )}
              {screen === "home" && role === "admin" && (
                <AdminHome
                  onOpenRegattas={() => setScreen("regattas")}
                  onOpenUsers={() => setScreen("users")}
                  onOpenTeams={() => setScreen("teams")}
                  onOpenWater={() => { setCoachScope("club"); setScreen("coachPlan"); }}
                  onOpenGym={() => { setCoachScope("club"); setScreen("coachGymPlan"); }}
                  onOpenStats={() => { setCoachScope("club"); setScreen("coachTeamStats"); }}
                  clubCode={clubCode}
                  clubDisplayName={clubDisplayName}
                  teamsCount={clubTeams.length}
                  coachCount={[...ROWERS, ...clubAssignedUsers].filter(p => roleOf(p.id) === "coach").length}
                  rowerCount={[...ROWERS, ...clubAssignedUsers].filter(p => roleOf(p.id) === "rower").length}
                  clubs={clubs}
                  currentClubId={currentClubId}
                  onSwitchClub={(id) => setCurrentClubId(id)}
                  onDeleteClub={deleteClub}
                />
              )}
              {screen === "regattas" && (
                <RegattasScreen
                  categories={raceCategories}
                  editable={role === "admin"}
                  onBack={() => setScreen("home")}
                  onOpenRace={(catId, raceId) => { setOpenRace({ catId, raceId }); setScreen("raceDetail"); }}
                  onAddCategory={addRaceCategory}
                  onRemoveCategory={removeRaceCategory}
                  onAddRace={addRace}
                  onRemoveRace={removeRace}
                />
              )}
              {screen === "raceDetail" && openRace && (() => {
                const cat = raceCategories.find(c => c.id === openRace.catId);
                const raceObj = cat && cat.races.find(r => r.id === openRace.raceId);
                if (!raceObj) return null;
                return (
                  <RaceDetailScreen
                    race={raceObj}
                    editable={role === "admin"}
                    onBack={() => setScreen("regattas")}
                    onUpdateTitle={(title) => updateRaceTitle(openRace.catId, openRace.raceId, title)}
                    onUpdateNotes={(notes) => updateRaceNotes(openRace.catId, openRace.raceId, notes)}
                    onAddDoc={(doc) => addRaceDoc(openRace.catId, openRace.raceId, doc)}
                    onRemoveDoc={(docId) => removeRaceDoc(openRace.catId, openRace.raceId, docId)}
                    onViewPhoto={(photo, caption) => setViewPhoto({ photo, caption })}
                  />
                );
              })()}
              {screen === "teams" && (role === "club" || role === "admin") && (
                <ClubTeamsScreen teams={clubTeams} onAddTeam={addTeam} onRemoveTeam={removeTeam} teamOf={teamOf} roleOf={roleOf} members={clubAssignedUsers} onOpenTeam={(t) => { setOpenTeam(t); setScreen("teamDetail"); }} />
              )}
              {screen === "teamDetail" && (role === "club" || role === "admin") && openTeam && (
                <TeamDetailScreen
                  team={openTeam}
                  onBack={() => setScreen("teams")}
                  trainedDays={totalPastActiveFor(openTeam.id)}
                  weatherSuspended={sessions.filter(s => s.teamId === openTeam.id && s.suspendedReason === "Mal tiempo").length}
                  members={[
                    ...ROWERS.map(r => ({ id: r.id, name: r.name, nickname: nicknameOf(r.id), side: sideOf(r.id) })),
                    ...clubAssignedUsers.map(u => ({ id: u.id, name: u.username, nickname: nicknameOf(u.id), side: sideOf(u.id) })),
                  ].filter(m => roleOf(m.id) === "rower" && teamOf(m.id) === openTeam.id)}
                  onExport={() => setScreen("teamExport")}
                />
              )}
              {screen === "teamExport" && (role === "club" || role === "admin") && openTeam && (
                <SeasonExportScreen
                  team={openTeam}
                  sessions={sessions.filter(s => s.teamId === openTeam.id).sort((a, b) => a.date - b.date)}
                  gymPlanForTeam={(week) => gymWeekPlan(openTeam.id, week)}
                  currentWeek={currentWeek}
                  members={[
                    ...ROWERS.map(r => ({ id: r.id, name: r.name, nickname: nicknameOf(r.id), side: sideOf(r.id) })),
                    ...clubAssignedUsers.map(u => ({ id: u.id, name: u.username, nickname: nicknameOf(u.id), side: sideOf(u.id) })),
                  ].filter(m => roleOf(m.id) === "rower" && teamOf(m.id) === openTeam.id)}
                  onBack={() => setScreen("teamDetail")}
                />
              )}
              {screen === "users" && (role === "club" || role === "admin") && (
                <ClubUsersScreen teams={clubTeams} teamName={teamName} teamOf={teamOf} roleOf={roleOf} onAssignTeam={assignTeam} onSetRole={setPersonRole} pendingUsers={clubPendingUsers} assignedUsers={clubAssignedUsers} onAssignPending={assignPendingUser} onRejectPending={rejectPendingUser} onRemoveUser={removeAssignedUser} managedTeamsOf={managedTeamsOf} onToggleCoachTeam={toggleCoachTeam} />
              )}
              {screen === "calendar" && role === "rower" && (
                <CalendarScreen sessions={rowerUpcoming} onOpen={(s) => { setOpenSession(s); setScreen("sessionRower"); }} onToggle={toggleSignup} myId={currentUserId} />
              )}
              {screen === "calendar" && role === "coach" && (
                <CalendarScreen sessions={coachUpcoming} onOpen={(s) => { setOpenSession(s); setSelectedRowerChip(null); setScreen("sessionCoach"); }} myId={currentUserId} teamName={teamName} showTeamLabel={coachScope === "club"} />
              )}
              {screen === "sessionRower" && openSession && (
                <SessionRowerScreen session={openSession} onBack={() => setScreen(role === "rower" ? "home" : "calendar")} onToggle={toggleSignup} onSendAlert={sendCantComeAlert} myAlerts={openSession ? alertsFor(openSession.id).filter(a => a.rowerId === currentUserId) : []} myId={currentUserId} nameOf={nameOf} nicknameOf={nicknameOf} sideOf={sideOf} />
              )}
              {screen === "sessionCoach" && openSession && (
                <SessionCoachScreen
                  session={openSession}
                  onBack={() => setScreen("home")}
                  selected={selectedRowerChip}
                  setSelected={setSelectedRowerChip}
                  onAssign={assign}
                  onClear={clearSlot}
                  onClose={closeCrew}
                  onReopen={reopenCrew}
                  teamName={teamName}
                  teamOf={teamOf}
                  nameOf={nameOf}
                  nicknameOf={nicknameOf}
                  sideOf={sideOf}
                  waterStatsFor={waterStatsFor}
                  gymStatsFor={gymStatsFor}
                  onUpdateSession={updateSession}
                  editable={role === "admin" ? true : canManage(openSession.teamId)}
                  alerts={alertsFor(openSession.id)}
                  onResolveAlert={(alertId) => resolveAlert(openSession.id, alertId)}
                  myId={currentUserId}
                  onToggleSignup={toggleSignup}
                />
              )}
              {screen === "notifications" && (
                <NotificationsScreen items={role === "rower" ? myNotifications : notifications} role={role} nameOf={nameOf} />
              )}
              {screen === "profile" && (
                <ProfileScreen
                  role={role}
                  scope={coachScope}
                  attendance={attendanceStats}
                  crewStats={statsFor(currentUserId)}
                  teams={clubTeams}
                  teamName={teamName}
                  teamCode={teamCode}
                  onOpenTraining={(id) => setScreen(id)}
                  myId={currentUserId}
                  myDisplayName={displayNameOf(currentUserId)}
                  myNickname={nicknameOf(currentUserId)}
                  mySide={sideOf(currentUserId)}
                  myTeam={teamOf(currentUserId)}
                  myEmail={recoveryEmails[currentUserId] || ""}
                  myRowerCode={rowerCodeOf(currentUserId)}
                  myPhoto={profilePhotos[currentUserId] || null}
                  onUpdateMyPhoto={updateMyPhoto}
                  clubCode={clubCode}
                  onUpdateMyProfile={updateMyProfile}
                  clubDisplayName={clubDisplayName}
                  clubPhoto={currentClub?.photoUrl || null}
                  onUpdateClubName={updateClubName}
                  onUpdateClubPhoto={updateClubPhoto}
                />
              )}
              {screen === "testPesos" && role === "rower" && (
                <PesosScreen
                  exercises={pesosExercisesOf(currentUserId)}
                  onAddExercise={(name) => addPesosExercise(currentUserId, name)}
                  onSetBase={(exId, kg) => setPesosExerciseBase(currentUserId, exId, kg)}
                  onRemoveExercise={(exId) => removePesosExercise(currentUserId, exId)}
                  onBack={() => setScreen("profile")}
                  editable
                />
              )}
              {screen === "coachPesos" && (role === "coach" || role === "admin") && openPerson && (
                <PesosScreen
                  exercises={pesosExercisesOf(openPerson.id)}
                  onAddExercise={(name) => addPesosExercise(openPerson.id, name)}
                  onSetBase={(exId, kg) => setPesosExerciseBase(openPerson.id, exId, kg)}
                  onRemoveExercise={(exId) => removePesosExercise(openPerson.id, exId)}
                  onBack={() => setScreen("coachRowerDetail")}
                  editable={false}
                  subtitle={`Test de pesos de ${openPerson.name} · lo gestiona el propio remero desde su perfil`}
                />
              )}
              {screen === "zonasErgo" && role === "rower" && (
                <ErgoZonesScreen
                  testTime={ergoTestTimes[currentUserId] || null}
                  onSetTest={setErgoTest}
                  onBack={() => setScreen("profile")}
                />
              )}
              {screen === "estadisticas" && role === "rower" && (
                <RowerStatsScreen
                  onBack={() => setScreen("profile")}
                  attendance={attendanceStats}
                  crewStats={statsFor(currentUserId)}
                  pesosCount={pesosExercisesOf(currentUserId).length}
                  ergoTestSet={!!ergoTestTimes[currentUserId]}
                  waterWeekMonth={waterStatsFor(currentUserId, myTeamId)}
                  gymWeekMonth={gymStatsFor(currentUserId, myTeamId)}
                  currentWeek={currentWeek}
                />
              )}
            </div>

            <TabBar screen={screen} setScreen={setScreen} notifCount={role === "rower" ? myNotifications.length : notifications.length} role={role} />
          </>
        )}
      </div>
    </div>
  );
}

// "Club Rem Lloret" -> "ADMINCRL" (sugerencia, el club puede cambiarla libremente)
// Etiqueta de campo con indicador dinámico: (opcional) en gris, * roja si falta por rellenar, ✓ verde si ya está
function FieldLabel({ text, required, filled, hint }) {
  return (
    <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px", display: "flex", alignItems: "center", gap: 5 }}>
      <span>{text}</span>
      {required ? (
        filled
          ? <Check size={13} color="#3EA55A" />
          : <span style={{ color: "#E61E29", fontWeight: 800, fontSize: 14 }}>*</span>
      ) : (
        <span style={{ color: "#8A8A8A", fontWeight: 400, fontSize: 11 }}>(opcional)</span>
      )}
      {hint && <span style={{ color: "#8A8A8A", fontWeight: 400, fontSize: 11 }}>{hint}</span>}
    </label>
  );
}

const suggestClubUsername = (clubName) => {
  const words = (clubName || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const initials = words.map(w => w[0].toUpperCase()).join("");
  return `ADMIN${initials}`;
};

function LoginScreen({ onRegisterClub, onLoginClub, onLoginUser, onRegisterUser, onRecoverPassword, onClearError, loginError, Logo }) {
  const [view, setView] = useState("menu"); // "menu" | "registerClub" | "registerUser" | "loginClub" | "loginUser"
  const [showRegisterMenu, setShowRegisterMenu] = useState(false);
  const [regSide, setRegSide] = useState(null); // obligatorio: no viene preseleccionado
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [apodoInput, setApodoInput] = useState("");
  const [clubNameRegInput, setClubNameRegInput] = useState("");
  const [clubCodeInput, setClubCodeInput] = useState("");
  const [regPhoto, setRegPhoto] = useState(null);
  const [passwordRepeatInput, setPasswordRepeatInput] = useState("");
  const [firstNameInput, setFirstNameInput] = useState("");
  const [lastNameInput, setLastNameInput] = useState("");
  const [birthDateInput, setBirthDateInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [legalNameInput, setLegalNameInput] = useState("");
  const [nifInput, setNifInput] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [postalCodeInput, setPostalCodeInput] = useState("");
  const [contactFirstNameInput, setContactFirstNameInput] = useState("");
  const [contactLastNameInput, setContactLastNameInput] = useState("");
  const [contactRoleInput, setContactRoleInput] = useState("");
  const [contactPhoneInput, setContactPhoneInput] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);

  const goTo = (v) => {
    setUsernameInput(""); setPasswordInput(""); setApodoInput(""); setClubNameRegInput("");
    setClubCodeInput(""); setShowRecovery(false); setRecoverySent(false); setRegPhoto(null);
    setPasswordRepeatInput(""); setFirstNameInput(""); setLastNameInput(""); setBirthDateInput("");
    setEmailInput(""); setPhoneInput(""); setRegSide(null); setUsernameTouched(false);
    setLegalNameInput(""); setNifInput(""); setAddressInput(""); setCityInput(""); setPostalCodeInput("");
    setContactFirstNameInput(""); setContactLastNameInput(""); setContactRoleInput(""); setContactPhoneInput("");
    setShowRegisterMenu(false);
    onClearError();
    setView(v);
  };

  const submitRegisterClub = () => onRegisterClub({
    name: clubNameRegInput, username: usernameInput, password: passwordInput, passwordRepeat: passwordRepeatInput, photo: regPhoto,
    legalName: legalNameInput, nif: nifInput, email: emailInput, address: addressInput, city: cityInput, postalCode: postalCodeInput,
    contactFirstName: contactFirstNameInput, contactLastName: contactLastNameInput, contactRole: contactRoleInput, contactPhone: contactPhoneInput,
  });

  const submitRegisterUser = () => {
    onRegisterUser({
      username: usernameInput, password: passwordInput, passwordRepeat: passwordRepeatInput,
      firstName: firstNameInput, lastName: lastNameInput, apodo: apodoInput,
      birthDate: birthDateInput, email: emailInput, phone: phoneInput,
      side: regSide, clubCode: clubCodeInput, photo: regPhoto,
    });
  };

  const sendRecovery = () => {
    onRecoverPassword(usernameInput);
    setRecoverySent(true);
  };

  const usernamePasswordFields = (
    <>
      <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Usuario</label>
      <input value={usernameInput} onChange={e => setUsernameInput(e.target.value)} style={inputStyle} />
      <label style={{ fontSize: 12, color: "#ADADAD", margin: "14px 0 6px" }}>Contraseña</label>
      <div style={{ position: "relative" }}>
        <Lock size={15} color="#8A8A8A" style={{ position: "absolute", left: 12, top: 12 }} />
        <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} style={{ ...inputStyle, paddingLeft: 34 }} />
      </div>
    </>
  );

  const recoveryBlock = (
    <>
      {loginError && <p style={{ color: "#FF8890", fontSize: 11.5, margin: "8px 2px 0" }}>{loginError}</p>}
      <button className="vir-btn" onClick={() => { setShowRecovery(!showRecovery); setRecoverySent(false); }} style={{ background: "transparent", color: "#ADADAD", fontSize: 11.5, marginTop: 8, textDecoration: "underline", alignSelf: "flex-start" }}>
        ¿Has olvidado tu contraseña?
      </button>
      {showRecovery && (
        <div style={{ background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 10, padding: 12, marginTop: 8 }}>
          <label style={{ fontSize: 11, color: "#ADADAD", marginBottom: 4, display: "block" }}>Correo de recuperación</label>
          <input type="email" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" style={{ ...inputStyle, padding: "8px 10px", fontSize: 12, marginBottom: 8 }} />
          <button className="vir-btn" onClick={sendRecovery} style={{ ...ghostBtn, width: "100%", padding: "8px 0", fontSize: 12 }}>Enviar enlace de recuperación</button>
          {recoverySent && <p style={{ color: "#8A8A8A", fontSize: 11, margin: "8px 2px 0", lineHeight: 1.4 }}>Si el usuario existe, hemos enviado un enlace a su correo de recuperación.</p>}
        </div>
      )}
    </>
  );

  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [view]);

  return (
    <div ref={scrollRef} style={{
      flex: 1, display: "flex", flexDirection: "column", overflowY: "auto",
      justifyContent: (view === "menu" || view === "loginClub" || view === "loginUser") ? "center" : "flex-start",
      padding: (view === "menu" || view === "loginClub" || view === "loginUser") ? "0 28px" : "28px 28px 0",
    }}>
      {view === "menu" && (
        <>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 6, marginTop: 24 }}><Logo size={50} /></div>
          <p style={{ textAlign: "center", color: "#ADADAD", fontSize: 13, margin: "4px 0 34px", letterSpacing: 1.5, textTransform: "uppercase" }}>Club Manager</p>
        </>
      )}

      {view === "menu" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="vir-btn" onClick={() => goTo("loginUser")} style={{ ...primaryBtn, textAlign: "center", padding: "16px 16px", fontSize: 14, letterSpacing: 0.5, textTransform: "uppercase", borderRadius: 30 }}>
            Acceso usuario
          </button>

          <button className="vir-btn" onClick={() => setShowRegisterMenu(!showRegisterMenu)} style={{ ...ghostBtn, textAlign: "center", padding: "14px 16px", letterSpacing: 0.5, textTransform: "uppercase", borderRadius: 30 }}>
            Registro
          </button>
          {showRegisterMenu && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="vir-btn" onClick={() => goTo("registerClub")} style={{ ...ghostBtn, flex: 1, padding: "12px 0", fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", borderRadius: 24 }}>
                Registro de club
              </button>
              <button className="vir-btn" onClick={() => goTo("registerUser")} style={{ ...ghostBtn, flex: 1, padding: "12px 0", fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", borderRadius: 24 }}>
                Registro de usuario
              </button>
            </div>
          )}

          <button className="vir-btn" onClick={() => goTo("loginClub")} style={{ background: "transparent", color: "#8A8A8A", fontSize: 12, textDecoration: "underline", marginTop: 8 }}>
            ¿Eres el club? Accede aquí
          </button>
        </div>
      )}

      {view === "loginClub" && (
        <>
          <BackRow onBack={() => goTo("menu")} />
          <div style={{ display: "flex", justifyContent: "center", margin: "18px 0 22px" }}><Logo size={38} /></div>
          <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "#F5F5F5", margin: "10px 0 18px" }}>Acceso club</h2>
          {usernamePasswordFields}
          {recoveryBlock}
          <button className="vir-btn" onClick={() => onLoginClub(usernameInput, passwordInput)} style={{ ...primaryBtn, marginTop: 22 }}>Entrar</button>
        </>
      )}

      {view === "loginUser" && (
        <>
          <BackRow onBack={() => goTo("menu")} />
          <div style={{ display: "flex", justifyContent: "center", margin: "18px 0 22px" }}><Logo size={38} /></div>
          <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "#F5F5F5", margin: "10px 0 4px" }}>Acceso usuario</h2>
          <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>Entras con el rol que el club te haya asignado (entrenador o remero).</p>
          {usernamePasswordFields}
          {recoveryBlock}
          <button className="vir-btn" onClick={() => onLoginUser(usernameInput, passwordInput)} style={{ ...primaryBtn, marginTop: 22 }}>Entrar</button>
        </>
      )}

      {view === "registerClub" && (
        <>
          <BackRow onBack={() => goTo("menu")} />
          <div style={{ display: "flex", justifyContent: "center", margin: "18px 0 22px" }}><Logo size={38} /></div>
          <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "#F5F5F5", margin: "0 0 4px" }}>Registro del club</h2>
          <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "0 0 18px", lineHeight: 1.4 }}>
            Al crear la cuenta, VIRADA generará automáticamente el código de acceso de tu club. Compártelo con tus entrenadores y remeros para que puedan registrarse dentro de tu club y no de otro.
          </p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18 }}>
            <AvatarPicker photo={regPhoto} initials="?" onChange={setRegPhoto} size={72} />
            <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "8px 0 0" }}>Logo del club — toca para {regPhoto ? "cambiarlo" : "añadirlo"} (podrás cambiarlo luego desde el perfil)</p>
          </div>

          <FieldLabel text="Nombre del club" required={false} />
          <input
            value={clubNameRegInput}
            onChange={e => {
              const v = e.target.value;
              setClubNameRegInput(v);
              if (!usernameTouched) setUsernameInput(suggestClubUsername(v));
            }}
            placeholder="Ej. Club Rem Lloret"
            style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }}
          />

          <FieldLabel text="Usuario del club" required filled={!!usernameInput.trim()} />
          <input
            value={usernameInput}
            onChange={e => { setUsernameInput(e.target.value); setUsernameTouched(true); }}
            placeholder="Ej. ADMINCRL"
            style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 4 }}
          />
          <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "0 0 14px", lineHeight: 1.4 }}>
            Te sugerimos "ADMIN" + las iniciales del nombre del club, pero puedes usar el que prefieras para entrar.
          </p>

          <FieldLabel text="Contraseña" required filled={!!passwordInput} />
          <div style={{ position: "relative", marginBottom: 14 }}>
            <Lock size={15} color="#8A8A8A" style={{ position: "absolute", left: 12, top: 12 }} />
            <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", paddingLeft: 34 }} />
          </div>

          <FieldLabel text="Repetir contraseña" required filled={!!passwordRepeatInput && passwordRepeatInput === passwordInput} />
          <div style={{ position: "relative" }}>
            <Lock size={15} color="#8A8A8A" style={{ position: "absolute", left: 12, top: 12 }} />
            <input type="password" value={passwordRepeatInput} onChange={e => setPasswordRepeatInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", paddingLeft: 34 }} />
          </div>

          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "22px 0 12px", borderTop: "1px solid #565656", paddingTop: 18 }}>Datos del club</p>

          <FieldLabel text="Nombre fiscal del club" required={false} />
          <input value={legalNameInput} onChange={e => setLegalNameInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="NIF" required={false} />
          <input value={nifInput} onChange={e => setNifInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Correo electrónico" required filled={!!emailInput.trim()} hint="lo necesitamos para recuperar la contraseña" />
          <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Dirección" required={false} />
          <input value={addressInput} onChange={e => setAddressInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Población" required={false} />
          <input value={cityInput} onChange={e => setCityInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Código postal" required={false} />
          <input value={postalCodeInput} onChange={e => setPostalCodeInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 4 }} />

          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "22px 0 12px", borderTop: "1px solid #565656", paddingTop: 18 }}>Persona de contacto</p>

          <FieldLabel text="Nombre" required filled={!!contactFirstNameInput.trim()} />
          <input value={contactFirstNameInput} onChange={e => setContactFirstNameInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Apellido" required filled={!!contactLastNameInput.trim()} />
          <input value={contactLastNameInput} onChange={e => setContactLastNameInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Cargo en el club" required filled={!!contactRoleInput.trim()} />
          <input value={contactRoleInput} onChange={e => setContactRoleInput(e.target.value)} placeholder="Ej. Presidente, Secretaría, Coordinador..." style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Nº Teléfono" required={false} />
          <input type="tel" value={contactPhoneInput} onChange={e => setContactPhoneInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 4 }} />

          {loginError && <p style={{ color: "#FF8890", fontSize: 11.5, margin: "14px 2px 0" }}>{loginError}</p>}
          <button className="vir-btn" onClick={submitRegisterClub} style={{ ...primaryBtn, marginTop: 22 }}>Registrar club</button>
        </>
      )}

      {view === "registerUser" && (
        <>
          <BackRow onBack={() => goTo("menu")} />
          <div style={{ display: "flex", justifyContent: "center", margin: "18px 0 22px" }}><Logo size={38} /></div>
          <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "#F5F5F5", margin: "10px 0 4px" }}>Registro de usuario</h2>
          <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>
            Con el código de tu club accedes a su paraguas de gestión. Una vez dentro, será el club quien te asigne el rol — entrenador o remero — y, si corresponde, la tripulación.
          </p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18 }}>
            <AvatarPicker photo={regPhoto} initials="?" onChange={setRegPhoto} size={72} />
            <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "8px 0 0" }}>Toca la foto para {regPhoto ? "cambiarla" : "añadirla"}</p>
          </div>

          <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Número de club</label>
          <div style={{ position: "relative", marginBottom: 14 }}>
            <KeyRound size={15} color="#8A8A8A" style={{ position: "absolute", left: 12, top: 12 }} />
            <input
              value={clubCodeInput}
              onChange={e => setClubCodeInput(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="Ej. 452"
              maxLength={3}
              inputMode="numeric"
              style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", paddingLeft: 34 }}
            />
          </div>

          <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Nombre de usuario</label>
          <input value={usernameInput} onChange={e => setUsernameInput(e.target.value)} placeholder="Acceso a la plataforma" style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Contraseña</label>
          <div style={{ position: "relative", marginBottom: 14 }}>
            <Lock size={15} color="#8A8A8A" style={{ position: "absolute", left: 12, top: 12 }} />
            <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", paddingLeft: 34 }} />
          </div>

          <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Repetir contraseña</label>
          <div style={{ position: "relative" }}>
            <Lock size={15} color="#8A8A8A" style={{ position: "absolute", left: 12, top: 12 }} />
            <input type="password" value={passwordRepeatInput} onChange={e => setPasswordRepeatInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", paddingLeft: 34 }} />
          </div>

          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "22px 0 12px", borderTop: "1px solid #565656", paddingTop: 18 }}>Datos personales</p>

          <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Nombre</label>
          <input value={firstNameInput} onChange={e => setFirstNameInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Apellido</label>
          <input value={lastNameInput} onChange={e => setLastNameInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Apodo</label>
          <input value={apodoInput} onChange={e => setApodoInput(e.target.value)} placeholder="Aparecerá en las tripulaciones" style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Fecha de nacimiento</label>
          <input type="date" value={birthDateInput} onChange={e => setBirthDateInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Correo electrónico <span style={{ color: "#8A8A8A", fontWeight: 400, textTransform: "none" }}>(recuperación de acceso)</span></label>
          <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Nº Teléfono <span style={{ color: "#8A8A8A", fontWeight: 400, textTransform: "none" }}>(opcional)</span></label>
          <input type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 4 }} />

          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "22px 0 12px", borderTop: "1px solid #565656", paddingTop: 18 }}>Función en el equipo</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {REGISTER_SIDE_OPTIONS.map(({ key, label, color, letter }) => {
              const active = regSide === key;
              return (
                <button key={key} className="vir-btn" onClick={() => setRegSide(key)} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10,
                  background: active ? color : "#404040",
                  border: `1px solid ${active ? color : "#565656"}`,
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: active ? "rgba(0,0,0,0.2)" : "#565656", color: active ? "#FFFFFF" : "#ADADAD",
                    fontSize: 10, fontWeight: 800,
                  }}>{letter}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: active ? "#FFFFFF" : "#E8E8E8", textAlign: "left", lineHeight: 1.2 }}>{label}</span>
                </button>
              );
            })}
          </div>

          {loginError && (
            <p style={{ color: "#FF8890", fontSize: 11.5, margin: "14px 2px 0" }}>{loginError}</p>
          )}
          <button className="vir-btn" onClick={submitRegisterUser} style={{ ...primaryBtn, marginTop: 22 }}>Crear cuenta</button>
        </>
      )}
    </div>
  );
}

function ResetPasswordScreen({ onSubmit, Logo }) {
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (password !== passwordRepeat) { setError("Las contraseñas no coinciden."); return; }
    setError(null);
    setSubmitting(true);
    await onSubmit(password);
    setSubmitting(false);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24, marginTop: 24 }}><Logo size={44} /></div>
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "#F5F5F5", margin: "0 0 4px", textAlign: "center" }}>Nueva contraseña</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 22px", textAlign: "center", lineHeight: 1.4 }}>
        Elige tu nueva contraseña para volver a entrar.
      </p>

      <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Nueva contraseña</label>
      <div style={{ position: "relative" }}>
        <Lock size={15} color="#8A8A8A" style={{ position: "absolute", left: 12, top: 12 }} />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, paddingLeft: 34, fontSize: 16, padding: "11px 11px 11px 34px", marginBottom: 14 }} />
      </div>

      <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Repetir contraseña</label>
      <div style={{ position: "relative" }}>
        <Lock size={15} color="#8A8A8A" style={{ position: "absolute", left: 12, top: 12 }} />
        <input type="password" value={passwordRepeat} onChange={e => setPasswordRepeat(e.target.value)} style={{ ...inputStyle, paddingLeft: 34, fontSize: 16, padding: "11px 11px 11px 34px" }} />
      </div>

      {error && <p style={{ color: "#FF8890", fontSize: 11.5, margin: "8px 2px 0" }}>{error}</p>}

      <button className="vir-btn" disabled={submitting} onClick={submit} style={{ ...primaryBtn, marginTop: 22, opacity: submitting ? 0.6 : 1 }}>
        {submitting ? "Guardando..." : "Guardar contraseña"}
      </button>
    </div>
  );
}

function PendingRoleScreen({ user, onBack }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 28px", textAlign: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: 28, background: "#404040", border: "1px solid #565656", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
        <KeyRound size={22} color="#8A8A8A" />
      </div>
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "#F5F5F5", margin: "0 0 8px" }}>Cuenta creada</h2>
      <p style={{ color: "#ADADAD", fontSize: 13, lineHeight: 1.5, margin: "0 0 4px" }}>
        {user ? `¡Bienvenido/a, ${user.apodo || user.username}!` : "Tu cuenta se ha creado."} Todavía no tienes acceso a la app.
      </p>
      <p style={{ color: "#8A8A8A", fontSize: 12.5, lineHeight: 1.5, margin: "0 0 24px" }}>
        El club revisará tu solicitud y te asignará un rol — entrenador o remero — y, si corresponde, una tripulación. En cuanto lo haga, podrás entrar con tu usuario y contraseña.
      </p>
      <button className="vir-btn" onClick={onBack} style={{ ...ghostBtn, padding: "11px 24px" }}>Volver al inicio</button>
    </div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ padding: "20px 20px 4px" }}>
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 24, color: "#F5F5F5", margin: 0, letterSpacing: 0.4 }}>{children}</h2>
      {sub && <p style={{ color: "#ADADAD", fontSize: 12.5, margin: "3px 0 0" }}>{sub}</p>}
    </div>
  );
}

function SessionRow({ s, onOpen, right, teamLabel, semaphore }) {
  const dow = DAYS_ES[s.dow];
  return (
    <div className="vir-btn" onClick={() => onOpen(s)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#404040", border: "1px solid #565656", borderRadius: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {semaphore && (
          <span title={semaphore.label} style={{ width: 10, height: 10, borderRadius: "50%", background: semaphore.color, flexShrink: 0 }} />
        )}
        <div style={{ width: 42, textAlign: "center" }}>
          <div className="vir-mono" style={{ color: "#E61E29", fontSize: 18, lineHeight: 1 }}>{s.date.getDate()}</div>
          <div style={{ color: "#8A8A8A", fontSize: 10, textTransform: "uppercase" }}>{dow}</div>
        </div>
        <div>
          <div style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 500 }}>{s.title || DEFAULT_SESSION_TITLE}{teamLabel ? ` · ${teamLabel}` : ""}</div>
          <div className="vir-mono" style={{ color: "#ADADAD", fontSize: 11.5 }}>{s.time}</div>
        </div>
      </div>
      {right}
    </div>
  );
}

// Semáforo del remero para una sesión de agua: rojo = tripulación aún por cerrar o no convocado,
// naranja = de reserva, verde = convocado para remar
const rowerSemaphore = (s, myId) => {
  const isCalled = s.seats.includes(myId) || s.patron === myId || (s.zodiac && s.zodiac.includes(myId));
  const isReserve = !isCalled && s.reserves.includes(myId);
  if (s.status !== "cerrado") return { color: "#E24B4A", label: "Tripulación aún por cerrar" };
  if (isCalled) return { color: "#3EA55A", label: "Convocado/a para remar" };
  if (isReserve) return { color: "#E67E22", label: "De reserva" };
  return { color: "#E24B4A", label: "No convocado/a" };
};

function Badge({ text, tone, onClick }) {
  const tones = {
    open: { bg: "#454545", color: "#ADADAD" },
    signed: { bg: "#3D2A2C", color: "#F0A8AC" },
    selected: { bg: "#F5F5F5", color: "#B5151E" },
    closed: { bg: "#3D3D3D", color: "#8A8A8A" },
    action: { bg: "#E61E29", color: "#F5F5F5" },
  };
  const t = tones[tone] || tones.open;
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      className={onClick ? "vir-btn vir-chip" : undefined}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
      style={{ background: t.bg, color: t.color, fontSize: 10.5, padding: "6px 11px", borderRadius: 20, fontWeight: 600, whiteSpace: "nowrap", border: "none" }}
    >{text}</Tag>
  );
}

function RowerHome({ sessions, onOpen, onToggle, notifCount, teamName, attendance, crewStats, pesosExercises, ergoTest, onNavigate, myId, myName, myTeam }) {
  const registeredExercises = pesosExercises.filter(ex => ex.baseKg).length;
  const pct = attendance.year.total > 0 ? Math.round((attendance.year.attended / attendance.year.total) * 100) : 0;

  const tileGroups = [
    {
      label: "Entrenos",
      tiles: [
        { id: "calendar", label: "Entrenos de agua", sub: "Calendario y apuntarte a remar", icon: CalendarDays },
        { id: "rowerGymPlan", label: "Entrenos de gim", sub: "Plan semanal, 5 sesiones", icon: Check },
      ],
    },
    {
      label: "Rendimiento",
      tiles: [
        { id: "testPesos", label: "Test de pesos", sub: "Registra tus marcas", icon: Anchor },
        { id: "zonasErgo", label: "Zonas de ergo", sub: "Registra tus ritmos", icon: RotateCw },
      ],
    },
    {
      label: "Regatas",
      tiles: [
        { id: "regattas", label: "Calendario de regatas", sub: "Fechas, dosier, horarios y resultados", icon: KeyRound },
      ],
    },
  ];

  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionTitle sub={`Hola, ${myName} · ${CLUB_NAME} · ${teamName(myTeam)}`}>Tu evolución</SectionTitle>

      <div style={{ padding: "0 16px 6px" }}>
        <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <p style={{ color: "#8A8A8A", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 4px" }}>Asistencia este año</p>
              <p className="vir-mono" style={{ color: "#F5F5F5", fontSize: 26, fontWeight: 700, margin: 0 }}>{pct}%</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ color: "#8A8A8A", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 4px" }}>Convocado / Entrenado</p>
              <p className="vir-mono" style={{ color: "#F5F5F5", fontSize: 15, fontWeight: 700, margin: 0 }}>{crewStats.convocado} / {crewStats.entrenado}</p>
            </div>
          </div>
          <div style={{ borderTop: "1px solid #565656", paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ color: "#ADADAD", fontSize: 11.5, margin: 0 }}>
              {registeredExercises > 0 ? `Test de pesos: ${registeredExercises} ejercicio${registeredExercises > 1 ? "s" : ""} registrado${registeredExercises > 1 ? "s" : ""}` : "Todavía no has registrado ningún test de pesos."}
            </p>
            <p style={{ color: "#ADADAD", fontSize: 11.5, margin: 0 }}>
              {ergoTest ? `TEST 1600: ${ergoTest} W` : "Todavía no has registrado tu TEST 1600 de ergómetro."}
            </p>
          </div>
        </div>
      </div>

      {tileGroups.map(group => (
        <div key={group.label} style={{ padding: "10px 16px 4px" }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>{group.label}</p>
          <div style={{ display: "grid", gridTemplateColumns: group.tiles.length === 1 ? "1fr" : "1fr 1fr", gap: 10 }}>
            {group.tiles.map(t => {
              const Icon = t.icon;
              return (
                <div key={t.id} className="vir-btn" onClick={() => onNavigate(t.id)} style={{
                  aspectRatio: group.tiles.length === 1 ? "3.2" : "1", background: "#404040", border: "1px solid #565656", borderRadius: 14,
                  padding: 14, display: "flex", flexDirection: group.tiles.length === 1 ? "row" : "column", alignItems: group.tiles.length === 1 ? "center" : "stretch", gap: group.tiles.length === 1 ? 12 : 0, justifyContent: "space-between",
                }}>
                  <Icon size={20} color="#E61E29" />
                  <div style={{ flex: 1 }}>
                    <p style={{ color: "#F5F5F5", fontSize: 13, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{t.label}</p>
                    <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "3px 0 0" }}>{t.sub}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ padding: "14px 16px 0" }}>
        <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>Próximos entrenos</p>
      </div>
      <div style={{ padding: "0 16px" }}>
        {sessions.map(s => (
          <SessionRow key={s.id} s={s} onOpen={onOpen} semaphore={rowerSemaphore(s, myId)} right={
            s.status === "cerrado"
              ? <Badge text={[...s.seats, s.patron, ...s.reserves, ...(s.zodiac || [])].includes(myId) ? "Seleccionado" : "Cerrado"} tone={[...s.seats, s.patron, ...s.reserves, ...(s.zodiac || [])].includes(myId) ? "selected" : "closed"} />
              : <Badge text={s.signups.has(myId) ? "Apuntado ✓" : "Apuntarse"} tone={s.signups.has(myId) ? "signed" : "action"} onClick={() => onToggle(s)} />
          } />
        ))}
      </div>
    </div>
  );
}

function CoachHome({ sessions, onOpen, scope, setScope, teams, onPlanCalendar, onTeamStats, onGymPlan, onOpenRegattas, onOpenInformes, coachName, teamName, showTeamLabel }) {
  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionTitle sub={`Hola, ${coachName} · ${CLUB_NAME}`}>Planificación de botes</SectionTitle>
      <div style={{ padding: "6px 16px 4px" }}>
        <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>Alcance de acceso</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ScopeChip active={scope === "club"} onClick={() => setScope("club")} label="Todo el club" />
          {teams.map(t => (
            <ScopeChip key={t.id} active={scope === t.id} onClick={() => setScope(t.id)} label={t.name} />
          ))}
        </div>
      </div>
      <div style={{ padding: "4px 16px 10px" }}>
        <div className="vir-btn" onClick={onPlanCalendar} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Entrenos de agua</p>
            <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>Activa días de entreno y edita su título</p>
          </div>
          <ChevronRight size={18} color="#8A8A8A" />
        </div>
        <div className="vir-btn" onClick={onGymPlan} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Plan de gimnasio semanal</p>
            <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>Marca los días de la semana y sube el contenido</p>
          </div>
          <ChevronRight size={18} color="#8A8A8A" />
        </div>
        <div className="vir-btn" onClick={onTeamStats} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Estadísticas de tripulación</p>
            <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>Frecuencia, convocatorias y entrenos de agua</p>
          </div>
          <ChevronRight size={18} color="#8A8A8A" />
        </div>
        <div className="vir-btn" onClick={onOpenInformes} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Informes</p>
            <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>Diario, semanal y mensual · exportables a PDF</p>
          </div>
          <ChevronRight size={18} color="#8A8A8A" />
        </div>
        <div className="vir-btn" onClick={onOpenRegattas} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Calendario de regatas</p>
            <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>Fechas, dosieres, horarios y resultados</p>
          </div>
          <ChevronRight size={18} color="#8A8A8A" />
        </div>
      </div>
      <div style={{ padding: "10px 16px" }}>
        {sessions.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 13 }}>Esta tripulación no tiene entrenos activos próximamente.</p>}
        {sessions.map(s => (
          <SessionRow key={s.id} s={s} onOpen={onOpen} teamLabel={showTeamLabel ? teamName(s.teamId) : null} right={
            s.status === "cerrado" ? <Badge text="Cerrado" tone="closed" />
              : <Badge text={`${s.signups.size} apuntados · ${seatFill(s)}/11`} tone={seatFill(s) === 11 ? "selected" : "open"} />
          } />
        ))}
      </div>
    </div>
  );
}

function CoachTeamStatsScreen({ onBack, scope, teams, teamOf, teamName, allPeople, statsFor, totalPastActiveFor, onOpenPerson }) {
  const people = allPeople.filter(p => scope === "club" || teamOf(p.id) === scope);

  const aggregate = people.reduce((acc, p) => {
    const s = statsFor(p.id);
    acc.convocado += s.convocado;
    acc.entrenado += s.entrenado;
    return acc;
  }, { convocado: 0, entrenado: 0 });
  const scopeTotalPastActive = scope === "club"
    ? teams.reduce((sum, t) => sum + totalPastActiveFor(t.id), 0)
    : totalPastActiveFor(scope);
  const freqs = people.map(p => {
    const s = statsFor(p.id);
    const total = totalPastActiveFor(teamOf(p.id));
    return total > 0 ? (s.entrenado / total) * 100 : 0;
  });
  const avgFreq = freqs.length > 0 ? Math.round(freqs.reduce((a, b) => a + b, 0) / freqs.length) : 0;

  const groups = scope === "club"
    ? teams.map(t => ({ id: t.id, label: t.name, members: people.filter(p => teamOf(p.id) === t.id), total: totalPastActiveFor(t.id) })).filter(g => g.members.length > 0)
    : [{ id: scope, label: teamName(scope), members: people, total: totalPastActiveFor(scope) }];

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Estadísticas de tripulación</h2>
      <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "0 0 16px" }}>Alcance: {scope === "club" ? "todo el club" : teamName(scope)}{scope !== "club" ? ` · ${scopeTotalPastActive} entrenos de agua realizados` : ""}</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <StatCard label="Convocatorias totales" value={aggregate.convocado} />
        <StatCard label="Entrenados en total" value={aggregate.entrenado} />
        <StatCard label="Asistencia media" value={`${avgFreq}%`} />
      </div>

      {people.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 13 }}>No hay remeros en este alcance.</p>}

      {groups.map(g => (
        <div key={g.id} style={{ marginBottom: 18 }}>
          {scope === "club" && (
            <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>{g.label} · {g.total} entrenos de agua realizados</p>
          )}
          {g.members.map(p => {
            const s = statsFor(p.id);
            const freq = g.total > 0 ? Math.round((s.entrenado / g.total) * 100) : 0;
            return (
              <div key={p.id} className="vir-btn" onClick={() => onOpenPerson(p)} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{p.name}</p>
                    {p.nickname && <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "2px 0 0" }}>"{p.nickname}"</p>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="vir-mono" style={{ color: "#F5F5F5", fontSize: 16, fontWeight: 700 }}>{freq}%</span>
                    <ChevronRight size={16} color="#8A8A8A" />
                  </div>
                </div>
                <div style={{ height: 5, background: "#565656", borderRadius: 3, marginBottom: 10, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${freq}%`, background: "#E61E29", borderRadius: 3 }} />
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <span style={{ fontSize: 11.5, color: "#ADADAD" }}>Convocado al entreno de agua: <span className="vir-mono" style={{ color: "#F5F5F5" }}>{s.convocado}</span></span>
                  <span style={{ fontSize: 11.5, color: "#ADADAD" }}>Entrenado agua: <span className="vir-mono" style={{ color: "#F5F5F5" }}>{s.entrenado}</span></span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CoachRowerDetailScreen({ person, onBack, teamName, teamOf, statsFor, totalPastActive, pesosExercises, ergoTest, currentWeek, weekPlanFor, recordFor, waterWeekMonth, gymWeekMonth, onViewPhoto, onOpenPesos }) {
  const s = statsFor(person.id);
  const freq = totalPastActive > 0 ? Math.round((s.entrenado / totalPastActive) * 100) : 0;
  const registeredExercises = pesosExercises.filter(ex => ex.baseKg).length;
  const hasGymLogs = registeredExercises > 0 || !!ergoTest;
  const teamId = teamOf(person.id);
  const weeks = [];
  for (let w = currentWeek; w >= 1; w--) weeks.push(w);
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "10px 0 20px" }}>
        <div style={{ width: 52, height: 52, borderRadius: 26, background: "#454545", display: "flex", alignItems: "center", justifyContent: "center", color: "#E61E29", fontWeight: 700, fontSize: 18, fontFamily: "'Big Shoulders Display', sans-serif" }}>
          {person.name.split(" ").map(n => n[0]).join("")}
        </div>
        <div>
          <p style={{ color: "#F5F5F5", fontWeight: 700, fontSize: 16, margin: 0 }}>{person.name}</p>
          <p style={{ color: "#8A8A8A", fontSize: 12, margin: "3px 0 0" }}>
            {person.nickname ? `"${person.nickname}" · ` : ""}{teamName(teamId)}
          </p>
        </div>
      </div>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Entrenos de agua</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <StatCard label="Convocado" value={s.convocado} />
        <StatCard label="Entrenado" value={s.entrenado} />
        <StatCard label="Frecuencia" value={`${freq}%`} />
      </div>
      <div style={{ height: 6, background: "#565656", borderRadius: 3, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${freq}%`, background: "#E61E29", borderRadius: 3 }} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <AttendanceCard label={`Agua · semana ${currentWeek}`} attended={waterWeekMonth.weekDone} total={waterWeekMonth.weekTotal} />
        <AttendanceCard label="Agua · este mes" attended={waterWeekMonth.monthDone} total={waterWeekMonth.monthTotal} />
      </div>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Entrenos de gim · check semanal</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <AttendanceCard label={`Gim · semana ${currentWeek}`} attended={gymWeekMonth.weekDone} total={gymWeekMonth.weekTotal} unitLabel="hecho" />
        <AttendanceCard label="Gim · este mes" attended={gymWeekMonth.monthDone} total={gymWeekMonth.monthTotal} unitLabel="hecho" />
      </div>
      {weeks.map(week => {
        const plan = weekPlanFor(teamId, week);
        const items = FISICO_SLOTS.filter(slot => plan[slot] && plan[slot].content);
        if (items.length === 0) return null;
        return (
          <div key={week} style={{ marginBottom: 14 }}>
            <p style={{ color: "#ADADAD", fontSize: 11, margin: "0 0 6px" }}>Semana {week}{week === currentWeek ? " · actual" : ""}</p>
            {items.map(slot => {
              const record = recordFor(teamId, week, slot);
              const done = !!(record && record.done);
              return (
                <div key={slot} style={{ display: "flex", alignItems: "center", gap: 10, background: "#404040", border: `1px solid ${done ? "#3EA55A" : "#565656"}`, borderRadius: 10, padding: "9px 12px", marginBottom: 6 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: done ? "#3EA55A" : "#565656",
                  }}>
                    {done && <Check size={13} color="#FFFFFF" />}
                  </div>
                  <p style={{ color: "#F5F5F5", fontSize: 12.5, margin: 0, flex: 1 }}>{FISICO_LABELS[slot]}</p>
                  {done && record.photos && record.photos.length > 0 && (
                    <div style={{ display: "flex", gap: 3 }}>
                      {record.photos.slice(0, 3).map((p, i) => (
                        p.kind === "pdf" ? (
                          <div key={i} onClick={() => window.open(p.dataUrl, "_blank")} style={{ width: 30, height: 30, borderRadius: 6, background: "#333333", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                            <KeyRound size={13} color="#ADADAD" />
                          </div>
                        ) : (
                          <img
                            key={i}
                            src={p.dataUrl}
                            alt="Toca para ampliar"
                            onClick={() => onViewPhoto(p.dataUrl, `${FISICO_LABELS[slot]} · Semana ${week} · ${person.name}`)}
                            style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover", cursor: "pointer", flexShrink: 0 }}
                          />
                        )
                      ))}
                      {record.photos.length > 3 && <span style={{ color: "#8A8A8A", fontSize: 10, alignSelf: "center" }}>+{record.photos.length - 3}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {weeks.every(week => FISICO_SLOTS.every(slot => !weekPlanFor(teamId, week)[slot])) && (
        <p style={{ color: "#8A8A8A", fontSize: 12.5 }}>Todavía no hay plan de gimnasio subido para esta tripulación.</p>
      )}

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "22px 0 10px" }}>Test de pesos y zonas de ergo</p>
      {hasGymLogs ? (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <StatCard label="Ejercicios con marca" value={registeredExercises} />
            <StatCard label="TEST 1600" value={ergoTest ? `${ergoTest} W` : "—"} />
          </div>
        </>
      ) : (
        <p style={{ color: "#8A8A8A", fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
          Todavía no hay ningún registro de pesos ni de ergo para este remero.
        </p>
      )}
      <button className="vir-btn" onClick={onOpenPesos} style={{ ...primaryBtn, padding: "11px 0", fontSize: 12.5 }}>
        Ver Test de pesos
      </button>
    </div>
  );
}

function ClubHome({ teams, onManageTeams, onManageUsers, onOpenRegattas, clubDisplayName, clubCode, coachCount, rowerCount }) {
  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionTitle sub={`Hola, ${clubDisplayName}`}>Panel del club</SectionTitle>
      <div style={{ padding: "10px 16px" }}>
        <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <p style={{ color: "#8A8A8A", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 6px" }}>Número de club</p>
          <p className="vir-mono" style={{ color: "#F5F5F5", fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: 1 }}>{clubCode}</p>
          <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "8px 0 0", lineHeight: 1.4 }}>
            Se generó automáticamente al crear la cuenta. Compártelo con tus entrenadores para que accedan a sus tripulaciones, y úsalo también para volver a entrar como club desde la pantalla de inicio.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <StatCard label="Tripulaciones" value={teams.length} />
          <StatCard label="Entrenadores" value={coachCount} />
          <StatCard label="Remeros" value={rowerCount} />
        </div>

        <div className="vir-btn" onClick={onManageUsers} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Usuarios del club</p>
            <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>Filtra por categoría, asigna tripulaciones y cambia roles</p>
          </div>
          <ChevronRight size={18} color="#8A8A8A" />
        </div>

        <div className="vir-btn" onClick={onManageTeams} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Tripulaciones y categorías</p>
            <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>{teams.map(t => t.name).join(" · ")}</p>
          </div>
          <ChevronRight size={18} color="#8A8A8A" />
        </div>

        <div className="vir-btn" onClick={onOpenRegattas} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Calendario de regatas</p>
            <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>Fechas, dosieres, horarios y resultados</p>
          </div>
          <ChevronRight size={18} color="#8A8A8A" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ flex: 1, background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
      <p className="vir-mono" style={{ color: "#F5F5F5", fontSize: 20, fontWeight: 700, margin: 0 }}>{value}</p>
      <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "4px 0 0" }}>{label}</p>
    </div>
  );
}

function AdminHome({ onOpenRegattas, onOpenUsers, onOpenTeams, onOpenWater, onOpenGym, onOpenStats, clubCode, clubDisplayName, teamsCount, coachCount, rowerCount, clubs, currentClubId, onSwitchClub, onDeleteClub }) {
  const [deletingId, setDeletingId] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const links = [
    { label: "Usuarios", sub: "Todos los entrenadores y remeros de este club, sin restricción", onClick: onOpenUsers },
    { label: "Tripulaciones", sub: "Crear, eliminar y ver el detalle de cada una", onClick: onOpenTeams },
    { label: "Entrenos de agua", sub: "Calendario, bote/rems y alineaciones de cualquier tripulación", onClick: onOpenWater },
    { label: "Plan de gimnasio", sub: "Ver y editar las 5 sesiones semanales de cualquier tripulación", onClick: onOpenGym },
    { label: "Estadísticas de tripulación", sub: "Convocatorias, asistencia y ficha de cada remero", onClick: onOpenStats },
    { label: "Calendario de regatas", sub: "Añade o quita días, dosieres, horarios y resultados (compartido entre todos los clubes)", onClick: onOpenRegattas },
  ];

  if (!currentClubId) {
    return (
      <div style={{ paddingBottom: 20 }}>
        <SectionTitle sub="Control abierto de todos los aspectos de la aplicación">Panel de administración</SectionTitle>
        <div style={{ padding: "10px 16px" }}>
          <div style={{ background: "#402226", border: "1px solid #E61E29", borderRadius: 14, padding: 16, marginBottom: 18 }}>
            <p style={{ color: "#FF8890", fontSize: 11.5, fontWeight: 700, margin: "0 0 6px" }}>Acceso de soporte y administración</p>
            <p style={{ color: "#F5F5F5", fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
              VIRADA está pensada para dar servicio a varios clubes a la vez, cada uno con su propio código de acceso y su estructura de entrenadores y remeros, completamente independiente del resto. Elige un club para entrar en su estructura.
            </p>
          </div>

          <StatCard label="Clubes dados de alta en esta sesión" value={clubs.length} />

          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "18px 0 10px" }}>Clubes</p>
          {clubs.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 13 }}>Todavía no se ha registrado ningún club en esta sesión.</p>}
          {clubs.map(c => (
            <div key={c.id} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", marginBottom: 10 }}>
              <div className="vir-btn" onClick={() => onSwitchClub(c.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{c.name}</p>
                  <p className="vir-mono" style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>Código {c.code}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    className="vir-btn"
                    onClick={(e) => { e.stopPropagation(); setDeletingId(deletingId === c.id ? null : c.id); setConfirmText(""); }}
                    style={{ background: "transparent", color: "#8A8A8A", padding: 4 }}
                    title="Eliminar club"
                  >
                    <X size={16} />
                  </button>
                  <ChevronRight size={18} color="#8A8A8A" />
                </div>
              </div>

              {deletingId === c.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #565656" }}>
                  <p style={{ color: "#FF8890", fontSize: 12, fontWeight: 700, margin: "0 0 6px" }}>⚠ Esto elimina el club por completo</p>
                  <p style={{ color: "#ADADAD", fontSize: 11.5, lineHeight: 1.5, margin: "0 0 12px" }}>
                    Se borrarán para siempre el club "{c.name}", todos sus usuarios, tripulaciones, entrenos de agua y plan de gimnasio. No se puede deshacer.
                  </p>
                  <label style={{ fontSize: 11.5, color: "#ADADAD", marginBottom: 6, display: "block" }}>
                    Escribe <span style={{ color: "#F5F5F5", fontWeight: 700 }}>{c.name}</span> para confirmar
                  </label>
                  <input
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    style={{ ...inputStyle, padding: "9px 11px", fontSize: 13, marginBottom: 10 }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="vir-btn"
                      disabled={confirmText !== c.name}
                      onClick={() => { onDeleteClub(c.id); setDeletingId(null); setConfirmText(""); }}
                      style={{
                        flex: 1, background: confirmText === c.name ? "#E61E29" : "#565656", color: "#F5F5F5",
                        fontWeight: 700, fontSize: 12.5, padding: "10px 0", borderRadius: 10,
                        opacity: confirmText === c.name ? 1 : 0.5, cursor: confirmText === c.name ? "pointer" : "not-allowed",
                      }}
                    >
                      Eliminar definitivamente
                    </button>
                    <button className="vir-btn" onClick={() => { setDeletingId(null); setConfirmText(""); }} style={{ ...ghostBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionTitle sub="Control abierto de todos los aspectos de la aplicación">Panel de administración</SectionTitle>
      <div style={{ padding: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: 0 }}>Explorando: <span style={{ color: "#F5F5F5", fontWeight: 600 }}>{clubDisplayName}</span></p>
          <button className="vir-btn" onClick={() => onSwitchClub(null)} style={{ background: "transparent", color: "#ADADAD", fontSize: 11, textDecoration: "underline" }}>Cambiar de club</button>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <StatCard label="Clubes en total" value={clubs.length} />
          <StatCard label="Tripulaciones" value={teamsCount} />
          <StatCard label="Entrenadores" value={coachCount} />
          <StatCard label="Remeros" value={rowerCount} />
        </div>
        <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "0 0 18px", lineHeight: 1.4 }}>
          Club: {clubDisplayName} (código {clubCode}). Recuerda que este prototipo no tiene base de datos real — estos datos son solo de la sesión actual.
        </p>

        {links.map(l => (
          <div key={l.label} className="vir-btn" onClick={l.onClick} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{l.label}</p>
              <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>{l.sub}</p>
            </div>
            <ChevronRight size={18} color="#8A8A8A" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DocUploadField({ onAdd }) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const okType = file.type === "application/pdf" || file.type === "image/jpeg" || /\.(pdf|jpe?g)$/i.test(file.name || "");
    if (!okType) { setError("Solo se admiten PDF o JPG."); e.target.value = ""; return; }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      onAdd({ label: title.trim() || "Documento", name: file.name, fileType: file.type.includes("pdf") ? "pdf" : "jpg", dataUrl: reader.result });
      setTitle("");
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <p style={{ color: "#8A8A8A", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 6px" }}>Añadir documento</p>
      <label style={{ fontSize: 11.5, color: "#ADADAD", marginBottom: 4, display: "block" }}>Título</label>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Ej. Dossier, Horarios, Resultados..."
        style={{ ...inputStyle, padding: "9px 11px", fontSize: 12.5, marginBottom: 10 }}
      />
      <label style={{ fontSize: 11.5, color: "#ADADAD", marginBottom: 4, display: "block" }}>Archivo</label>
      <label className="vir-btn" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#404040", border: "1px dashed #565656", borderRadius: 10, padding: "11px 0", color: "#ADADAD", fontSize: 12.5, cursor: "pointer" }}>
        <Camera size={15} />
        Subir archivo (PDF o JPG)
        <input type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg" style={{ display: "none" }} onChange={handleFile} />
      </label>
      {error && <p style={{ color: "#FF8890", fontSize: 10.5, margin: "6px 2px 0" }}>{error}</p>}
    </div>
  );
}

function RegattasScreen({ categories, editable, onBack, onOpenRace, onAddCategory, onRemoveCategory, onAddRace, onRemoveRace }) {
  const [tab, setTab] = useState(categories[0]?.id || null);
  const [newCatName, setNewCatName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSubcat, setNewSubcat] = useState("");

  const activeCat = categories.find(c => c.id === tab) || categories[0];
  const sortedRaces = activeCat ? [...activeCat.races].sort((a, b) => raceSortKey(a.dateLabel) - raceSortKey(b.dateLabel)) : [];
  const subcats = [...new Set(sortedRaces.map(r => r.subcategory).filter(Boolean))];
  const orderedSubcats = ["LLAGUT", "LLAÜT MEDITERRANEO Y BATEL", ...subcats.filter(s => s !== "LLAGUT" && s !== "LLAÜT MEDITERRANEO Y BATEL")];

  const raceRow = (r) => (
    <div key={r.id} className="vir-btn" onClick={() => onOpenRace(activeCat.id, r.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 74, textAlign: "center" }}>
          <p className="vir-mono" style={{ color: "#E61E29", fontSize: 12.5, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{r.dateLabel}</p>
          {raceCountdownLabel(r.dateLabel) && (
            <p style={{ color: "#8A8A8A", fontSize: 9, margin: "2px 0 0", lineHeight: 1.2 }}>{raceCountdownLabel(r.dateLabel)}</p>
          )}
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{r.title || "Sin título todavía"}</p>
            {isRacePast(r.dateLabel) && (
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#3EA55A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Check size={11} color="#FFFFFF" />
              </span>
            )}
          </div>
          {r.docs.length > 0 && <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "3px 0 0" }}>📎 {r.docs.length} documento{r.docs.length > 1 ? "s" : ""}</p>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {editable && (
          <button className="vir-btn" onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Eliminar el día "${r.dateLabel}${r.title ? " · " + r.title : ""}"? Se perderán también sus documentos.`)) onRemoveRace(activeCat.id, r.id); }} style={{ background: "transparent", color: "#8A8A8A", padding: 4 }}>
            <X size={15} />
          </button>
        )}
        <ChevronRight size={16} color="#8A8A8A" />
      </div>
    </div>
  );

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 16px" }}>Calendario de regatas</h2>

      {categories.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 13 }}>Todavía no hay categorías de regatas.</p>}

      {categories.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {categories.map(c => (
            <ScopeChip key={c.id} active={tab === c.id} onClick={() => setTab(c.id)} label={c.name} />
          ))}
        </div>
      )}

      {editable && (
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, color: "#ADADAD", marginBottom: 6, display: "block" }}>Nueva categoría</label>
          <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Ej. LLAGUT" style={{ ...inputStyle, padding: "11px", fontSize: 16, width: "100%", marginBottom: 10 }} />
          <button className="vir-btn" onClick={() => { onAddCategory(newCatName); setNewCatName(""); }} style={{ ...primaryBtn, padding: "11px 0", fontSize: 13 }}>Crear</button>
        </div>
      )}

      {activeCat && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: 0 }}>{activeCat.name}</p>
            {editable && (
              <button className="vir-btn" onClick={() => { if (window.confirm(`¿Eliminar la categoría "${activeCat.name}" entera? Se perderán todos sus días de regata y documentos.`)) onRemoveCategory(activeCat.id); }} style={{ background: "transparent", color: "#8A8A8A", fontSize: 10.5, textDecoration: "underline" }}>Eliminar categoría</button>
            )}
          </div>

          {sortedRaces.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 12.5, marginBottom: 14 }}>Sin días de regata todavía.</p>}

          {subcats.length > 0 ? (
            <>
              {orderedSubcats.filter(sc => sortedRaces.some(r => r.subcategory === sc)).map(sc => (
                <div key={sc} style={{ marginBottom: 14 }}>
                  <p style={{ color: "#ADADAD", fontSize: 11.5, fontWeight: 700, margin: "0 0 8px" }}>{sc}</p>
                  {sortedRaces.filter(r => r.subcategory === sc).map(raceRow)}
                </div>
              ))}
              {sortedRaces.some(r => !r.subcategory) && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ color: "#ADADAD", fontSize: 11.5, fontWeight: 700, margin: "0 0 8px" }}>Otras</p>
                  {sortedRaces.filter(r => !r.subcategory).map(raceRow)}
                </div>
              )}
            </>
          ) : (
            sortedRaces.map(raceRow)
          )}

          {editable && (
            <div style={{ background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 12, padding: 14, marginTop: 6 }}>
              <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Nuevo día de regata</p>

              <label style={{ fontSize: 12, color: "#ADADAD", marginBottom: 6, display: "block" }}>Fecha</label>
              <input value={newDate} onChange={e => setNewDate(e.target.value)} placeholder="Ej. 6 Març" style={{ ...inputStyle, padding: "11px", fontSize: 16, width: "100%", marginBottom: 12 }} />

              <label style={{ fontSize: 12, color: "#ADADAD", marginBottom: 6, display: "block" }}>Título / lugar (opcional)</label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ej. Roses" style={{ ...inputStyle, padding: "11px", fontSize: 16, width: "100%", marginBottom: 12 }} />

              <label style={{ fontSize: 12, color: "#ADADAD", marginBottom: 6, display: "block" }}>Subcategoría (opcional)</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {["", "LLAGUT", "LLAÜT MEDITERRANEO Y BATEL"].map(sc => (
                  <button key={sc || "none"} className="vir-btn" onClick={() => setNewSubcat(sc)} style={{
                    padding: "8px 13px", borderRadius: 20, fontSize: 12,
                    background: newSubcat === sc ? "#E61E29" : "#404040",
                    border: `1px solid ${newSubcat === sc ? "#E61E29" : "#565656"}`,
                    color: "#F5F5F5", fontWeight: newSubcat === sc ? 600 : 400,
                  }}>{sc || "Ninguna"}</button>
                ))}
              </div>

              <button className="vir-btn" onClick={() => { onAddRace(activeCat.id, newDate, newTitle, newSubcat); setNewDate(""); setNewTitle(""); setNewSubcat(""); }} style={{ ...primaryBtn, padding: "11px 0", fontSize: 13 }}>Añadir día</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RaceDetailScreen({ race: r, editable, onBack, onUpdateTitle, onUpdateNotes, onAddDoc, onRemoveDoc, onViewPhoto }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(r.title);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState(r.notes || "");

  const saveTitle = () => {
    onUpdateTitle(titleInput);
    setEditingTitle(false);
  };
  const saveNotes = () => {
    onUpdateNotes(notesInput);
    setEditingNotes(false);
  };

  const openDoc = (doc) => {
    if (doc.fileType === "jpg") onViewPhoto(doc.dataUrl, `${doc.label} · ${doc.name}`);
    else window.open(doc.dataUrl, "_blank");
  };

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <p className="vir-mono" style={{ color: "#E61E29", fontSize: 14, fontWeight: 700, margin: "10px 0 2px" }}>{r.dateLabel}</p>
      {raceCountdownLabel(r.dateLabel) && (
        <p style={{ color: "#8A8A8A", fontSize: 11, margin: "0 0 4px" }}>{raceCountdownLabel(r.dateLabel)}</p>
      )}

      {editingTitle ? (
        <div style={{ marginBottom: 18, marginTop: 8 }}>
          <input value={titleInput} onChange={e => setTitleInput(e.target.value)} placeholder="Título / lugar" style={{ ...inputStyle, padding: "9px 11px", fontSize: 14, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="vir-btn" onClick={saveTitle} style={{ ...primaryBtn, flex: 1, padding: "9px 0", fontSize: 12.5 }}>Guardar</button>
            <button className="vir-btn" onClick={() => { setTitleInput(r.title); setEditingTitle(false); }} style={{ ...ghostBtn, flex: 1, padding: "9px 0", fontSize: 12.5 }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 18 }}>
          <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: 0 }}>{r.title || "Sin título todavía"}</h2>
          {editable && (
            <button className="vir-btn" onClick={() => setEditingTitle(true)} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "8px 10px", color: "#ADADAD" }}>
              <Pencil size={15} />
            </button>
          )}
        </div>
      )}

      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: 0 }}>Información</p>
          {editable && !editingNotes && (
            <button className="vir-btn" onClick={() => setEditingNotes(true)} style={{ background: "transparent", color: "#8A8A8A", padding: 4 }}>
              <Pencil size={13} />
            </button>
          )}
        </div>
        {editingNotes ? (
          <div>
            <textarea
              value={notesInput}
              onChange={e => setNotesInput(e.target.value)}
              placeholder="Información para los deportistas: punto de encuentro, transporte, indicaciones..."
              rows={4}
              style={{ ...inputStyle, fontSize: 12.5, padding: "9px 11px", resize: "vertical", width: "100%", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="vir-btn" onClick={saveNotes} style={{ ...primaryBtn, flex: 1, padding: "9px 0", fontSize: 12.5 }}>Guardar</button>
              <button className="vir-btn" onClick={() => { setNotesInput(r.notes || ""); setEditingNotes(false); }} style={{ ...ghostBtn, flex: 1, padding: "9px 0", fontSize: 12.5 }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <p style={{ color: r.notes ? "#ADADAD" : "#8A8A8A", fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
            {r.notes || "El club todavía no ha añadido información para este día."}
          </p>
        )}
      </div>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Documentos</p>
      {r.docs.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 12.5, marginBottom: 18 }}>Todavía no hay documentos para este día.</p>}
      {r.docs.map(d => (
        <div key={d.id} className="vir-btn" onClick={() => openDoc(d)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#333333", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {d.fileType === "pdf" ? <KeyRound size={15} color="#ADADAD" /> : <Camera size={15} color="#ADADAD" />}
            </div>
            <div>
              <p style={{ color: "#F5F5F5", fontSize: 13, fontWeight: 600, margin: 0 }}>{d.label}</p>
              <p style={{ color: "#8A8A8A", fontSize: 11, margin: "2px 0 0" }}>{d.name}</p>
            </div>
          </div>
          {editable && (
            <button className="vir-btn" onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Eliminar el documento "${d.label}"?`)) onRemoveDoc(d.id); }} style={{ background: "transparent", color: "#8A8A8A", padding: 4 }}>
              <X size={15} />
            </button>
          )}
        </div>
      ))}

      {editable && (
        <div style={{ background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 12, padding: 14, marginTop: 8 }}>
          <DocUploadField onAdd={onAddDoc} />
        </div>
      )}
    </div>
  );
}

function ClubUsersScreen({ teams, teamName, teamOf, roleOf, onAssignTeam, onSetRole, pendingUsers, assignedUsers, onAssignPending, onRejectPending, onRemoveUser, managedTeamsOf, onToggleCoachTeam }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);

  const people = [
    ...ROWERS.map(r => ({ id: r.id, name: r.name, nickname: r.nickname })),
    ...assignedUsers.map(u => ({ id: u.id, name: u.username, nickname: u.apodo })),
  ];

  const visible = people.filter(p => {
    if (filter !== "all") {
      if (roleOf(p.id) === "coach") return false; // los entrenadores no están sujetos a una única categoría
      if (teamOf(p.id) !== filter) return false;
    }
    const q = search.trim().toLowerCase();
    if (q && !p.name.toLowerCase().includes(q) && !(p.nickname || "").toLowerCase().includes(q)) return false;
    return true;
  });

  const openPerson = openId ? people.find(p => p.id === openId) : null;

  if (openPerson) {
    const role = roleOf(openPerson.id);
    return (
      <div style={{ paddingBottom: 20 }}>
        <div style={{ padding: "16px 20px 0" }}>
          <BackRow onBack={() => setOpenId(null)} />
        </div>
        <SectionTitle sub={openPerson.nickname ? `"${openPerson.nickname}"` : undefined}>{openPerson.name}</SectionTitle>
        <div style={{ padding: "10px 16px" }}>
          <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ color: "#8A8A8A", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 8px" }}>Rol</p>
            <div style={{ display: "flex", borderRadius: 20, overflow: "hidden", border: "1px solid #565656", marginBottom: 16 }}>
              {[{ id: "coach", label: "Entrenador" }, { id: "rower", label: "Remero" }].map(r => (
                <button key={r.id} className="vir-btn" onClick={() => onSetRole(openPerson.id, r.id)} style={{
                  flex: 1, padding: "9px 0", fontSize: 12, fontWeight: 600,
                  background: role === r.id ? "#E61E29" : "transparent",
                  color: role === r.id ? "#F5F5F5" : "#8A8A8A", border: "none",
                }}>{r.label}</button>
              ))}
            </div>

            {role === "rower" ? (
              <div>
                <p style={{ color: "#8A8A8A", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 6px" }}>Categoría</p>
                <select
                  value={teamOf(openPerson.id) || ""}
                  onChange={e => onAssignTeam(openPerson.id, e.target.value)}
                  style={{ ...inputStyle, padding: "10px 11px", fontSize: 13 }}
                >
                  <option value="" disabled>Sin asignar</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <p style={{ color: "#8A8A8A", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 8px" }}>Tripulaciones que puede gestionar</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                  {teams.map(t => {
                    const managed = managedTeamsOf(openPerson.id).includes(t.id);
                    return (
                      <button key={t.id} className="vir-btn" onClick={() => onToggleCoachTeam(openPerson.id, t.id)} style={{
                        padding: "6px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 600,
                        background: managed ? "#3EA55A" : "#404040",
                        border: `1px solid ${managed ? "#3EA55A" : "#565656"}`,
                        color: managed ? "#FFFFFF" : "#ADADAD",
                      }}>{managed ? "✓ " : ""}{t.name}</button>
                    );
                  })}
                </div>
                <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "6px 0 0", lineHeight: 1.4 }}>
                  Puede ver el calendario de todas las tripulaciones, pero solo editar y montar botes en las que tenga marcadas aquí.
                </p>
              </div>
            )}
          </div>

          <button
            className="vir-btn"
            onClick={() => {
              if (window.confirm(`¿Eliminar a ${openPerson.nickname || openPerson.name} del club? Perderá el acceso y no podrá deshacerse.`)) {
                onRemoveUser(openPerson.id);
                setOpenId(null);
              }
            }}
            style={{ background: "transparent", color: "#F09595", fontSize: 12, textDecoration: "underline", marginTop: 16 }}
          >
            Eliminar usuario del club
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionTitle sub="Toca un usuario para ver toda su información">Usuarios del club</SectionTitle>

      <div style={{ padding: "10px 16px 0" }}>
        <div style={{ position: "relative" }}>
          <Search size={15} color="#8A8A8A" style={{ position: "absolute", left: 12, top: 12 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar usuario por nombre o apodo"
            style={{ ...inputStyle, paddingLeft: 34 }}
          />
        </div>
      </div>

      {pendingUsers.length > 0 && (
        <div style={{ padding: "6px 16px 4px" }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "10px 2px 10px" }}>Pendientes de asignación ({pendingUsers.length})</p>
          {pendingUsers.map(u => (
            <PendingUserRow key={u.id} user={u} teams={teams} onAssign={onAssignPending} onReject={onRejectPending} />
          ))}
        </div>
      )}

      <div style={{ padding: "10px 16px 4px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ScopeChip active={filter === "all"} onClick={() => setFilter("all")} label="Todos" />
          {teams.map(t => (
            <ScopeChip key={t.id} active={filter === t.id} onClick={() => setFilter(t.id)} label={t.name} />
          ))}
        </div>
      </div>

      <div style={{ padding: "10px 16px" }}>
        {visible.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 13 }}>Sin usuarios que coincidan.</p>}
        {visible.map(p => {
          const role = roleOf(p.id);
          return (
            <div key={p.id} className="vir-btn" onClick={() => setOpenId(p.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <div>
                <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{p.name}</p>
                {p.nickname && <p style={{ color: "#8A8A8A", fontSize: 11, margin: "2px 0 0" }}>"{p.nickname}"</p>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 10.5, fontWeight: 600,
                  background: role === "coach" ? "#22B8CF22" : "#3EA55A22",
                  color: role === "coach" ? "#22B8CF" : "#3EA55A",
                }}>{role === "coach" ? "Entrenador" : "Remero"}</span>
                <ChevronRight size={16} color="#8A8A8A" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PendingUserRow({ user, teams, onAssign, onReject }) {
  const [role, setRole] = useState("rower");
  const [team, setTeam] = useState(teams[0]?.id || "");
  return (
    <div style={{ background: "#3A3A3A", border: "1px dashed #E61E29", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ marginBottom: 10 }}>
        <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{user.username}</p>
        {user.apodo && <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "2px 0 0" }}>"{user.apodo}" · {SIDE_META[user.side]?.label}</p>}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", borderRadius: 20, overflow: "hidden", border: "1px solid #565656", flex: 1 }}>
          {[{ id: "coach", label: "Entrenador" }, { id: "rower", label: "Remero" }].map(r => (
            <button key={r.id} className="vir-btn" onClick={() => setRole(r.id)} style={{
              flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 600,
              background: role === r.id ? "#E61E29" : "transparent",
              color: role === r.id ? "#F5F5F5" : "#8A8A8A", border: "none",
            }}>{r.label}</button>
          ))}
        </div>
      </div>
      {role === "rower" && (
        <select value={team} onChange={e => setTeam(e.target.value)} style={{ ...inputStyle, padding: "8px 10px", fontSize: 12.5, marginBottom: 10 }}>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="vir-btn" onClick={() => onAssign(user.id, role, role === "rower" ? team : null)} style={{ ...primaryBtn, flex: 1, padding: "9px 0", fontSize: 12.5 }}>
          Aceptar y asignar rol
        </button>
        <button className="vir-btn" onClick={() => { if (window.confirm(`¿Eliminar la solicitud de "${user.username}"? Tendría que registrarse de nuevo para volver a pedir acceso.`)) onReject(user.id); }} style={{ background: "transparent", border: "1px solid #565656", borderRadius: 10, color: "#FF8890", padding: "9px 14px", fontSize: 12.5 }}>
          Eliminar
        </button>
      </div>
    </div>
  );
}

function ClubTeamsScreen({ teams, onAddTeam, onRemoveTeam, onOpenTeam, teamOf, roleOf, members }) {
  const [name, setName] = useState("");
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddTeam(trimmed);
    setName("");
  };
  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionTitle sub="Toca una tripulación para ver quién la forma">Tripulaciones y categorías</SectionTitle>
      <div style={{ padding: "10px 16px" }}>
        {teams.map(t => {
          const count = members.filter(m => roleOf(m.id) === "rower" && teamOf(m.id) === t.id).length;
          return (
            <div key={t.id} className="vir-btn" onClick={() => onOpenTeam(t)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#404040", border: "1px solid #565656", borderRadius: 12, marginBottom: 10 }}>
              <div>
                <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.name}</p>
                <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>{count} remeros</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="vir-mono" style={{ color: "#ADADAD", fontSize: 12 }}>{t.code}</span>
                <button className="vir-btn" onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Eliminar la tripulación "${t.name}"? Se perderán sus entrenos de agua, plan de gimnasio y remeros dejarán de tenerla asignada.`)) onRemoveTeam(t.id); }} style={{ background: "transparent", color: "#8A8A8A", padding: 4, borderRadius: 8 }} title="Eliminar tripulación">
                  <X size={16} />
                </button>
                <ChevronRight size={16} color="#8A8A8A" />
              </div>
            </div>
          );
        })}

        <div style={{ marginTop: 18, background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 12, padding: 14 }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Nueva tripulación o categoría</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Veteranos" style={{ ...inputStyle, flex: 1 }} />
            <button className="vir-btn" onClick={submit} style={{ background: "#E61E29", color: "#F5F5F5", fontWeight: 700, fontSize: 13, padding: "0 18px", borderRadius: 10 }}>Crear</button>
          </div>
          <p style={{ color: "#8A8A8A", fontSize: 11, margin: "8px 2px 0" }}>Se generará un código de tripulación automáticamente para compartir con el entrenador.</p>
        </div>
      </div>
    </div>
  );
}

function TeamDetailScreen({ team, onBack, members, trainedDays, weatherSuspended, onExport }) {
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>{team.name}</h2>
      <p className="vir-mono" style={{ color: "#E61E29", fontSize: 13, margin: "0 0 4px" }}>{team.code}</p>
      <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "0 0 16px" }}>{members.length} remeros</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <StatCard label="Días entrenados de agua" value={trainedDays} />
        <StatCard label="Suspendidos por mal tiempo" value={weatherSuspended} />
      </div>

      <div className="vir-btn" onClick={onExport} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Historial de temporada</p>
          <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>Consulta y exporta todo en PDF</p>
        </div>
        <ChevronRight size={18} color="#8A8A8A" />
      </div>

      {members.length === 0 && (
        <p style={{ color: "#8A8A8A", fontSize: 13 }}>Todavía no hay remeros asignados a esta tripulación.</p>
      )}
      {members.map(m => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <div>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{m.name}</p>
            {m.nickname && <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "2px 0 0" }}>"{m.nickname}"</p>}
          </div>
          {m.side && <SideBadge side={m.side} />}
        </div>
      ))}
    </div>
  );
}

function InformesScreen({ teamId, teams, setScope, sessions, gymWeekMetaFor, gymRecordFor, members, currentWeek, waterStatsFor, gymStatsFor, today, onBack, onViewPhoto }) {
  const [tab, setTab] = useState("diario");
  const [day, setDay] = useState(today);
  const [week, setWeek] = useState(currentWeek);

  if (teamId === "club") {
    return (
      <div style={{ padding: "16px 20px 28px" }}>
        <BackRow onBack={onBack} />
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Informes</h2>
        <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>Elige una tripulación para sacar sus informes.</p>
        {teams.map(t => (
          <div key={t.id} className="vir-btn" onClick={() => setScope(t.id)} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.name}</p>
            <ChevronRight size={18} color="#8A8A8A" />
          </div>
        ))}
      </div>
    );
  }

  const team = teams.find(t => t.id === teamId);

  // --- datos de un día concreto ---
  const sessionForDay = (date) => sessions.find(s => s.iso === date.toISOString().slice(0, 10));
  const dayRow = (rower, date) => {
    const s = sessionForDay(date);
    const swam = !!(s && s.active && s.status === "cerrado" && inCrew(s, rower.id));
    const wk = weekOfDate(date);
    const dayKey = JS_DOW_TO_WEEK_KEY[date.getDay()];
    const meta = gymWeekMetaFor(teamId, wk);
    const isGymDay = (meta.activeDays || []).includes(dayKey);
    const rec = isGymDay ? gymRecordFor(rower.id, teamId, wk, dayKey) : null;
    const gymDone = !!(rec && rec.done);
    const photos = (rec && rec.photos) || [];
    return { swam, isGymDay, gymDone, photos, dayLabel: WEEK_DAY_LABELS[dayKey] };
  };

  // --- datos de una semana completa ---
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    // aproximación: días 1-7 de la semana del mes = (week-1)*7+1 .. +7, acotado al mes
    const d = new Date(2026, 7, Math.min(31, (week - 1) * 7 + 1 + i));
    return d;
  }).filter(d => d.getMonth() === 7 && weekOfDate(d) === week);
  const weekMeta = gymWeekMetaFor(teamId, week);
  const weekActiveDays = weekMeta.activeDays || [];

  // --- datos del mes (todas las semanas hasta la actual) ---
  const monthlyRows = members.map(m => {
    const water = waterStatsFor(m.id, teamId);
    const gym = gymStatsFor(m.id, teamId);
    const commitment = Math.round((
      (water.monthTotal > 0 ? water.monthDone / water.monthTotal : 0) +
      (gym.monthTotal > 0 ? gym.monthDone / gym.monthTotal : 0)
    ) / 2 * 100);
    return { member: m, water, gym, commitment };
  });

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Informes</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 16px" }}>{team?.name}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[{ id: "diario", label: "Diario" }, { id: "semanal", label: "Semanal" }, { id: "mensual", label: "Mensual" }].map(t => (
          <ScopeChip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} label={t.label} />
        ))}
      </div>

      <button className="vir-btn" onClick={() => window.print()} style={{ ...primaryBtn, marginBottom: 20 }}>
        Exportar / Guardar como PDF
      </button>

      {tab === "diario" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button className="vir-btn" onClick={() => setDay(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "8px 12px", color: "#ADADAD" }}><ChevronLeft size={16} /></button>
            <p style={{ color: "#F5F5F5", fontSize: 14, fontWeight: 700, margin: 0 }}>{DAYS_ES[day.getDay()]} {day.getDate()} {MONTHS_ES[day.getMonth()]}</p>
            <button className="vir-btn" onClick={() => setDay(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "8px 12px", color: "#ADADAD" }}><ChevronRight size={16} /></button>
          </div>

          <div className="vir-print-area">
            <h1 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 18, margin: "0 0 2px" }}>Informe diario · {team?.name}</h1>
            <p style={{ fontSize: 12, margin: "0 0 16px" }}>{DAYS_ES[day.getDay()]} {day.getDate()} {MONTHS_ES[day.getMonth()]} de {day.getFullYear()}</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #999" }}>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>Remero/a</th>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>Agua</th>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>Sesión de gim</th>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>Fotos</th>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>Evolución</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const row = dayRow(m, day);
                  const commitment = monthlyRows.find(r => r.member.id === m.id)?.commitment ?? 0;
                  return (
                    <tr key={m.id} style={{ borderBottom: "1px solid #DDD" }}>
                      <td style={{ padding: "4px 6px" }}>{m.name}{m.nickname ? ` "${m.nickname}"` : ""}</td>
                      <td style={{ padding: "4px 6px" }}>{row.swam ? "✓ Entrenó" : "—"}</td>
                      <td style={{ padding: "4px 6px" }}>{!row.isGymDay ? "Sin sesión" : row.gymDone ? `✓ ${row.dayLabel}` : "✕ No hecho"}</td>
                      <td style={{ padding: "4px 6px" }}>{row.photos.length}</td>
                      <td style={{ padding: "4px 6px" }}>{commitment}% compromiso</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {members.some(m => dayRow(m, day).photos.length > 0) && (
            <div style={{ marginTop: 18 }}>
              <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Fotos subidas ese día</p>
              {members.map(m => {
                const row = dayRow(m, day);
                if (row.photos.length === 0) return null;
                return (
                  <div key={m.id} style={{ marginBottom: 12 }}>
                    <p style={{ color: "#ADADAD", fontSize: 12, margin: "0 0 6px" }}>{m.nickname || m.name}</p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {row.photos.map((p, i) => p.kind === "pdf" ? (
                        <div key={i} onClick={() => window.open(p.dataUrl, "_blank")} style={{ width: 48, height: 48, borderRadius: 8, background: "#333333", border: "1px solid #565656", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <KeyRound size={16} color="#ADADAD" />
                        </div>
                      ) : (
                        <img key={i} src={p.dataUrl} onClick={() => onViewPhoto(p.dataUrl, `${m.nickname || m.name} · ${DAYS_ES[day.getDay()]} ${day.getDate()}`)} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", border: "1px solid #565656", cursor: "pointer" }} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "semanal" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button className="vir-btn" onClick={() => setWeek(w => Math.max(1, w - 1))} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "8px 12px", color: "#ADADAD" }}><ChevronLeft size={16} /></button>
            <p style={{ color: "#F5F5F5", fontSize: 14, fontWeight: 700, margin: 0 }}>Semana {week}{week === currentWeek ? " · actual" : ""}</p>
            <button className="vir-btn" onClick={() => setWeek(w => w + 1)} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "8px 12px", color: "#ADADAD" }}><ChevronRight size={16} /></button>
          </div>

          <div className="vir-print-area">
            <h1 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 18, margin: "0 0 2px" }}>Informe semanal · {team?.name}</h1>
            <p style={{ fontSize: 12, margin: "0 0 16px" }}>Semana {week}</p>

            <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Entrenos de agua</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 16 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #999" }}>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>Fecha</th>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>Estado</th>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>Tripulación embarcada</th>
                </tr>
              </thead>
              <tbody>
                {weekDates.map(d => {
                  const s = sessionForDay(d);
                  const crew = s ? members.filter(m => inCrew(s, m.id)).map(m => m.nickname || m.name).join(", ") : "";
                  return (
                    <tr key={d.toISOString()} style={{ borderBottom: "1px solid #DDD" }}>
                      <td style={{ padding: "4px 6px" }}>{DAYS_ES[d.getDay()]} {d.getDate()}</td>
                      <td style={{ padding: "4px 6px" }}>{!s || !s.active ? "Sin entreno" : s.status === "cerrado" ? "Cerrado" : "Abierto"}</td>
                      <td style={{ padding: "4px 6px" }}>{crew || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Gimnasio — días de esta semana: {weekActiveDays.map(d => WEEK_DAY_LABELS[d]).join(", ") || "ninguno"}</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #999" }}>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>Remero/a</th>
                  {weekActiveDays.map(d => <th key={d} style={{ textAlign: "left", padding: "4px 6px" }}>{WEEK_DAY_LABELS[d].slice(0, 3)}</th>)}
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>Total semana</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const doneCount = weekActiveDays.filter(d => { const r = gymRecordFor(m.id, teamId, week, d); return !!(r && r.done); }).length;
                  return (
                    <tr key={m.id} style={{ borderBottom: "1px solid #DDD" }}>
                      <td style={{ padding: "4px 6px" }}>{m.nickname || m.name}</td>
                      {weekActiveDays.map(d => {
                        const r = gymRecordFor(m.id, teamId, week, d);
                        return <td key={d} style={{ padding: "4px 6px" }}>{r && r.done ? "✓" : "✕"}</td>;
                      })}
                      <td style={{ padding: "4px 6px" }}>{doneCount}/{weekActiveDays.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "mensual" && (
        <div className="vir-print-area">
          <h1 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 18, margin: "0 0 2px" }}>Informe mensual · {team?.name}</h1>
          <p style={{ fontSize: 12, margin: "0 0 16px" }}>{MONTHS_ES[7]} de 2026 · semanas 1 a {currentWeek}</p>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #999" }}>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>Remero/a</th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>Días de agua</th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>Sesiones de gim</th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>% compromiso</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map(r => (
                <tr key={r.member.id} style={{ borderBottom: "1px solid #DDD" }}>
                  <td style={{ padding: "4px 6px" }}>{r.member.nickname || r.member.name}</td>
                  <td style={{ padding: "4px 6px" }}>{r.water.monthDone} / {r.water.monthTotal}</td>
                  <td style={{ padding: "4px 6px" }}>{r.gym.monthDone} / {r.gym.monthTotal}</td>
                  <td style={{ padding: "4px 6px" }}>{r.commitment}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ fontSize: 10, color: "#666", marginTop: 16 }}>
            El % de compromiso combina a partes iguales la asistencia a agua y la constancia en gimnasio. Iremos ampliando este informe con más datos.
          </p>
        </div>
      )}
    </div>
  );
}

function SeasonExportScreen({ team, sessions, gymPlanForTeam, currentWeek, members, onBack }) {
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "10px 0 4px" }}>
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: 0 }}>Historial de temporada</h2>
      </div>
      <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 16px" }}>{team.name} · {CLUB_NAME}</p>

      <button className="vir-btn" onClick={() => window.print()} style={{ ...primaryBtn, marginBottom: 20 }}>
        Exportar / Guardar como PDF
      </button>

      <div className="vir-print-area">
        <h1 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, margin: "0 0 2px" }}>{CLUB_NAME} · {team.name}</h1>
        <p style={{ fontSize: 12, margin: "0 0 16px" }}>Código de tripulación: {team.code} · Temporada {ATTENDANCE_BASE.label}</p>

        <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Remeros ({members.length})</h3>
        <p style={{ fontSize: 12, margin: "0 0 16px", lineHeight: 1.6 }}>
          {members.map(m => m.name).join(" · ") || "Sin remeros asignados"}
        </p>

        <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Calendario de entrenos de agua</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 20 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #999" }}>
              <th style={{ textAlign: "left", padding: "4px 6px" }}>Fecha</th>
              <th style={{ textAlign: "left", padding: "4px 6px" }}>Hora</th>
              <th style={{ textAlign: "left", padding: "4px 6px" }}>Título</th>
              <th style={{ textAlign: "left", padding: "4px 6px" }}>Bote / rems</th>
              <th style={{ textAlign: "left", padding: "4px 6px" }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id} style={{ borderBottom: "1px solid #DDD" }}>
                <td style={{ padding: "4px 6px" }}>{DAYS_ES[s.dow]} {s.date.getDate()} {MONTHS_ES[s.date.getMonth()]}</td>
                <td style={{ padding: "4px 6px" }}>{s.active ? s.time : "—"}</td>
                <td style={{ padding: "4px 6px" }}>{s.active ? s.title : (s.suspendedReason ? `Suspendido: ${s.suspendedReason}` : "Sin entreno")}</td>
                <td style={{ padding: "4px 6px" }}>{s.boat ? `${s.boat} · ${s.oars || "—"}` : "—"}</td>
                <td style={{ padding: "4px 6px" }}>{s.active ? (s.status === "cerrado" ? "Cerrado" : "Abierto") : "Suspendido"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Plan de gimnasio por semana</h3>
        {Array.from({ length: currentWeek }, (_, i) => currentWeek - i).map(week => {
          const plan = gymPlanForTeam(week);
          const items = FISICO_SLOTS.filter(slot => plan[slot] && plan[slot].content);
          return (
            <div key={week} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 4px" }}>Semana {week}</p>
              {items.length === 0 && <p style={{ fontSize: 11, margin: "0 0 4px" }}>Sin plan subido.</p>}
              {items.map(slot => (
                <p key={slot} style={{ fontSize: 11, margin: "0 0 2px" }}>{FISICO_LABELS[slot]}: {plan[slot].content}{plan[slot].attachment ? " (+ archivo adjunto)" : ""}</p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoachGymPlanScreen({ teamId, teams, setScope, currentWeek, weekMetaFor, onSaveContent, onSaveActiveDays, onSaveWeekAttachment, onBack, editable }) {
  const [week, setWeek] = useState(currentWeek);
  const dirtyRef = useRef(new Set());
  const markDirty = (slot, isDirty) => {
    if (isDirty) dirtyRef.current.add(slot); else dirtyRef.current.delete(slot);
  };
  const guardNavigation = (action) => {
    if (dirtyRef.current.size > 0 && !window.confirm("Tienes cambios sin guardar en esta semana. ¿Salir y descartarlos?")) return;
    dirtyRef.current = new Set();
    action();
  };

  if (teamId === "club") {
    return (
      <div style={{ padding: "16px 20px 28px" }}>
        <BackRow onBack={onBack} />
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Plan de gimnasio semanal</h2>
        <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>Elige una tripulación para ver o subir su plan de la semana.</p>
        {teams.map(t => (
          <div key={t.id} className="vir-btn" onClick={() => setScope(t.id)} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.name}</p>
            <ChevronRight size={18} color="#8A8A8A" />
          </div>
        ))}
      </div>
    );
  }

  const teamLabel = teams.find(t => t.id === teamId)?.name || "";
  const meta = weekMetaFor(teamId, week);
  const activeDays = meta.activeDays || [];
  const toggleDay = (day) => {
    const next = activeDays.includes(day) ? activeDays.filter(d => d !== day) : [...activeDays, day];
    onSaveActiveDays(teamId, week, next);
  };
  const handleWeekFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const okType = file.type === "application/pdf" || file.type === "image/jpeg" || /\.(pdf|jpe?g)$/i.test(file.name || "");
    if (!okType) { e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      onSaveWeekAttachment(teamId, week, { name: file.name, fileType: file.type.includes("pdf") ? "pdf" : "jpg", dataUrl: reader.result });
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={() => guardNavigation(onBack)} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Plan de gimnasio semanal</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 4px", lineHeight: 1.4 }}>
        Tripulación: <span style={{ color: "#E61E29", fontWeight: 600 }}>{teamLabel}</span>
      </p>
      {!editable && (
        <p style={{ color: "#E67E22", fontSize: 12, margin: "0 0 8px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, marginTop: 8 }}>
        <button className="vir-btn" onClick={() => guardNavigation(() => setWeek(w => Math.max(1, w - 1)))} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "8px 12px", color: "#ADADAD" }}><ChevronLeft size={16} /></button>
        <p style={{ color: "#F5F5F5", fontSize: 15, fontWeight: 700, margin: 0 }}>Semana {week}{week === currentWeek ? " · actual" : ""}</p>
        <button className="vir-btn" onClick={() => guardNavigation(() => setWeek(w => w + 1))} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "8px 12px", color: "#ADADAD" }}><ChevronRight size={16} /></button>
      </div>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>Días de entreno esta semana ({activeDays.length}/7)</p>
      {editable ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          {WEEK_DAY_KEYS.map(day => {
            const active = activeDays.includes(day);
            return (
              <button key={day} className="vir-btn" onClick={() => toggleDay(day)} style={{
                padding: "9px 12px", borderRadius: 10, fontSize: 12, fontWeight: active ? 700 : 400,
                background: active ? "#E61E29" : "#404040",
                border: `1px solid ${active ? "#E61E29" : "#565656"}`,
                color: "#F5F5F5",
              }}>{WEEK_DAY_LABELS[day].slice(0, 3)}</button>
            );
          })}
        </div>
      ) : (
        <p style={{ color: "#8A8A8A", fontSize: 12.5, marginBottom: 18 }}>
          {activeDays.length === 0 ? "Sin días de entreno marcados esta semana." : activeDays.map(d => WEEK_DAY_LABELS[d]).join(", ")}
        </p>
      )}

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>Archivo de la semana (PDF o JPG, opcional)</p>
      {meta.weekAttachment ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "10px 12px", marginBottom: 18 }}>
          <span className="vir-btn" onClick={() => window.open(meta.weekAttachment.dataUrl, "_blank")} style={{ color: "#ADADAD", fontSize: 12.5, cursor: "pointer" }}>
            📎 {meta.weekAttachment.name}
          </span>
          {editable && (
            <button className="vir-btn" onClick={() => { if (window.confirm(`¿Eliminar el archivo "${meta.weekAttachment.name}" de esta semana?`)) onSaveWeekAttachment(teamId, week, null); }} style={{ background: "transparent", color: "#8A8A8A", padding: 4 }}>
              <X size={15} />
            </button>
          )}
        </div>
      ) : editable ? (
        <label className="vir-btn" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#404040", border: "1px dashed #565656", borderRadius: 10, padding: "11px 0", color: "#ADADAD", fontSize: 12.5, cursor: "pointer", marginBottom: 18 }}>
          <Camera size={15} />
          Subir archivo de la semana
          <input type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg" style={{ display: "none" }} onChange={handleWeekFile} />
        </label>
      ) : (
        <p style={{ color: "#8A8A8A", fontSize: 12.5, marginBottom: 18 }}>Sin archivo esta semana.</p>
      )}

      {activeDays.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 12.5 }}>Marca los días de entreno de esta semana para poder escribir el contenido de cada uno.</p>}

      {WEEK_DAY_KEYS.filter(day => activeDays.includes(day)).map(day => (
        <GymSlotEditor
          key={`${week}-${day}`}
          slot={day}
          value={(meta.days[day] && meta.days[day].content) || ""}
          onSave={(content) => onSaveContent(teamId, week, day, content)}
          editable={editable}
          onDirtyChange={(isDirty) => markDirty(day, isDirty)}
        />
      ))}
    </div>
  );
}

function GymSlotEditor({ slot, value, onSave, editable, onDirtyChange }) {
  const [text, setText] = useState(value);
  const [justSaved, setJustSaved] = useState(false);
  const dirty = text !== value;

  useEffect(() => {
    if (onDirtyChange) onDirtyChange(dirty);
    return () => { if (onDirtyChange) onDirtyChange(false); };
  }, [dirty]);

  if (!editable) {
    return (
      <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: 14, marginBottom: 10 }}>
        <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>{FISICO_LABELS[slot]}</p>
        <p style={{ color: value ? "#ADADAD" : "#8A8A8A", fontSize: 12.5, margin: 0, lineHeight: 1.4 }}>{value || "Sin contenido todavía."}</p>
      </div>
    );
  }
  const save = () => {
    onSave(text);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  };
  return (
    <div style={{ background: "#404040", border: `1px solid ${dirty ? "#E67E22" : "#565656"}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: 0 }}>{FISICO_LABELS[slot]}</p>
        {dirty ? (
          <p style={{ color: "#E67E22", fontSize: 10.5, margin: 0, fontWeight: 600 }}>Cambios sin guardar</p>
        ) : justSaved ? (
          <p style={{ color: "#3EA55A", fontSize: 10.5, margin: 0, fontWeight: 600 }}>✓ Guardado</p>
        ) : value ? (
          <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: 0 }}>Guardado</p>
        ) : null}
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Ej. Sentadillas 4x10, remo en polea 3x12, plancha 3x40s..."
        rows={3}
        style={{ ...inputStyle, fontSize: 16, padding: "11px", resize: "vertical", width: "100%" }}
      />
      <button className="vir-btn" onClick={save} disabled={!dirty} style={{
        ...primaryBtn, marginTop: 8, padding: "11px 0", fontSize: 13,
        opacity: dirty ? 1 : 0.4, background: dirty ? "#E61E29" : "#565656",
      }}>
        Guardar
      </button>
      {dirty && (
        <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "6px 2px 0" }}>Pulsa Guardar antes de cambiar de semana o salir, o se perderá.</p>
      )}
    </div>
  );
}

function RowerGymPlanScreen({ teamId, teamName, currentWeek, weekMetaFor, recordFor, onAddPhoto, onRemovePhoto, onViewPhoto, onBack }) {
  const [week, setWeek] = useState(currentWeek);
  const meta = weekMetaFor(teamId, week);
  const activeDays = meta.activeDays || [];
  const overdue = week < currentWeek;

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Entrenos de gim</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
        Tripulación: <span style={{ color: "#E61E29", fontWeight: 600 }}>{teamName(teamId)}</span> · sube la foto (JPG/HEIC) o el PDF del entreno para marcar cada sesión como hecha
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button className="vir-btn" onClick={() => setWeek(w => Math.max(1, w - 1))} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "8px 12px", color: "#ADADAD" }}><ChevronLeft size={16} /></button>
        <p style={{ color: "#F5F5F5", fontSize: 15, fontWeight: 700, margin: 0 }}>Semana {week}{week === currentWeek ? " · actual" : ""}</p>
        <button className="vir-btn" onClick={() => setWeek(w => Math.min(currentWeek, w + 1))} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "8px 12px", color: "#ADADAD" }}><ChevronRight size={16} /></button>
      </div>

      {meta.weekAttachment && (
        <div
          className="vir-btn"
          onClick={() => window.open(meta.weekAttachment.dataUrl, "_blank")}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "11px 12px", marginBottom: 16, cursor: "pointer" }}
        >
          <KeyRound size={15} color="#ADADAD" />
          <span style={{ color: "#ADADAD", fontSize: 12.5, flex: 1 }}>📎 {meta.weekAttachment.name}</span>
          <span style={{ color: "#8A8A8A", fontSize: 10.5 }}>Ver / descargar</span>
        </div>
      )}

      {activeDays.length === 0 && (
        <p style={{ color: "#8A8A8A", fontSize: 12.5 }}>El entrenador todavía no ha marcado días de entreno esta semana.</p>
      )}

      {WEEK_DAY_KEYS.filter(day => activeDays.includes(day)).map(day => (
        (meta.days[day] && meta.days[day].content) ? (
          <FisicoRecordRow
            key={day}
            slot={day}
            content={meta.days[day].content}
            record={recordFor(teamId, week, day)}
            overdue={overdue}
            onAddPhoto={(photo, kind) => onAddPhoto(teamId, week, day, photo, kind)}
            onRemovePhoto={(idx) => onRemovePhoto(teamId, week, day, idx)}
            onViewPhoto={(photo) => onViewPhoto(photo, `${FISICO_LABELS[day]} · Semana ${week}`)}
          />
        ) : (
          <div key={day} style={{ background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
            <p style={{ color: "#8A8A8A", fontSize: 13, fontWeight: 700, margin: 0 }}>{FISICO_LABELS[day]}</p>
            <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "4px 0 0" }}>El entrenador todavía no ha escrito el contenido de este día.</p>
          </div>
        )
      ))}
    </div>
  );
}

function FisicoRecordRow({ slot, content, record, overdue, onAddPhoto, onRemovePhoto, onViewPhoto }) {
  const [uploading, setUploading] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [pendingKind, setPendingKind] = useState(null);
  const photos = (record && record.photos) || [];
  const done = !!(record && record.done && photos.length > 0);
  const missed = !done && overdue; // ha pasado el día y no se subió ningún justificante

  const badgeStyle = {
    width: 56, height: 56, borderRadius: 12, flexShrink: 0, display: "flex",
    alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden",
    background: done ? "#3EA55A" : missed ? "#7A1F1F" : "#565656",
    border: `1px solid ${done ? "#3EA55A" : missed ? "#E24B4A" : "#565656"}`,
  };
  const firstImg = photos.find(p => p.kind !== "pdf");

  return (
    <div style={{ background: "#404040", border: `1px solid ${done ? "#3EA55A" : missed ? "#E24B4A" : "#565656"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: "#F5F5F5", fontSize: 13, fontWeight: 700, margin: 0 }}>{FISICO_LABELS[slot]}</p>
          <p style={{ color: "#ADADAD", fontSize: 12, margin: "4px 0 0", lineHeight: 1.4 }}>{content}</p>
          {missed && <p style={{ color: "#F09595", fontSize: 11, margin: "6px 0 0", fontWeight: 600 }}>✕ Entreno no realizado</p>}
          {done && <p style={{ color: "#9FE1CB", fontSize: 11, margin: "6px 0 0", fontWeight: 600 }}>✓ Entreno hecho · {photos.length} foto{photos.length > 1 ? "s" : ""}</p>}
        </div>
        <div style={badgeStyle} onClick={() => setUploading(u => !u)}>
          {done ? (
            firstImg ? <img src={firstImg.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Check size={22} color="#FFFFFF" />
          ) : missed ? (
            <X size={22} color="#FFFFFF" />
          ) : (
            <Camera size={18} color="#ADADAD" />
          )}
        </div>
      </div>

      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position: "relative" }}>
              {p.kind === "pdf" ? (
                <div onClick={() => window.open(p.dataUrl, "_blank")} style={{ width: 44, height: 44, borderRadius: 8, background: "#333333", border: "1px solid #565656", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <KeyRound size={16} color="#ADADAD" />
                </div>
              ) : (
                <img
                  src={p.dataUrl}
                  onClick={() => onViewPhoto(p.dataUrl)}
                  alt=""
                  style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", border: "1px solid #565656", cursor: "pointer" }}
                />
              )}
              <button
                className="vir-btn"
                onClick={() => { if (window.confirm("¿Eliminar esta foto de justificante?")) onRemovePhoto(i); }}
                style={{ position: "absolute", top: -6, right: -6, width: 17, height: 17, borderRadius: "50%", background: "#333333", border: "1px solid #565656", color: "#ADADAD", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {uploading && (
        <div style={{ marginTop: 10 }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, margin: "0 0 6px" }}>Foto del ergómetro/GPS, o PDF del entreno — puedes subir varias</p>
          <PhotoField
            photo={pendingPhoto}
            onChange={(dataUrl, kind) => { setPendingPhoto(dataUrl); setPendingKind(kind); }}
            jpgOnly
            allowPdf
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="vir-btn" disabled={!pendingPhoto} onClick={() => { onAddPhoto(pendingPhoto, pendingKind); setPendingPhoto(null); setPendingKind(null); }} style={{ ...primaryBtn, flex: 1, padding: "9px 0", fontSize: 12.5, opacity: pendingPhoto ? 1 : 0.4 }}>
              Añadir foto
            </button>
            <button className="vir-btn" onClick={() => { setUploading(false); setPendingPhoto(null); setPendingKind(null); }} style={{ ...ghostBtn, flex: 1, padding: "9px 0", fontSize: 12.5 }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CoachPlanScreen({ teamId, teams, setScope, sessions, onBack, onToggleActive, onRename, onUpdateSession, overlapFor, editable }) {
  if (teamId === "club") {
    return (
      <div style={{ padding: "16px 20px 28px" }}>
        <BackRow onBack={onBack} />
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Entrenos de agua</h2>
        <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
          Cada tripulación sale al agua en días y horas distintos. Elige una tripulación para planificar su calendario.
        </p>
        {teams.map(t => (
          <div key={t.id} className="vir-btn" onClick={() => setScope(t.id)} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.name}</p>
            <ChevronRight size={18} color="#8A8A8A" />
          </div>
        ))}
      </div>
    );
  }

  const weeks = {};
  [...sessions].sort((a, b) => a.iso.localeCompare(b.iso)).forEach(s => {
    const key = MONTHS_ES[s.date.getMonth()] + " " + s.date.getFullYear();
    (weeks[key] = weeks[key] || []).push(s);
  });
  const teamLabel = teams.find(t => t.id === teamId)?.name || "";

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Entrenos de agua</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 4px", lineHeight: 1.4 }}>
        Tripulación: <span style={{ color: "#E61E29", fontWeight: 600 }}>{teamLabel}</span>
      </p>
      {editable ? (
        <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
          Activa o desactiva cada día, ajusta su hora, el título y el bote/rems. Por defecto: "{DEFAULT_SESSION_TITLE}".
        </p>
      ) : (
        <p style={{ color: "#E67E22", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}
      {Object.entries(weeks).map(([label, items]) => (
        <div key={label}>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, margin: "12px 4px 8px" }}>{label}</p>
          {items.map(s => {
            const overlap = overlapFor(s);
            return (
              <div key={s.id} style={{ background: "#404040", border: `1px solid ${overlap ? "#E67E22" : "#565656"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10, opacity: s.active ? 1 : 0.65 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, textAlign: "center" }}>
                      <div className="vir-mono" style={{ color: s.active ? "#E61E29" : "#8A8A8A", fontSize: 17, lineHeight: 1 }}>{s.date.getDate()}</div>
                      <div style={{ color: "#8A8A8A", fontSize: 9.5, textTransform: "uppercase" }}>{DAYS_ES[s.dow]}</div>
                    </div>
                    <div className="vir-mono" style={{ color: "#ADADAD", fontSize: 11.5 }}>{s.time}</div>
                  </div>
                  <ToggleSwitch checked={s.active} onChange={() => editable && onToggleActive(s)} disabled={!editable} />
                </div>
                {s.active && (
                  <>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <input
                        value={s.title}
                        onChange={e => onRename(s, e.target.value)}
                        placeholder={DEFAULT_SESSION_TITLE}
                        disabled={!editable}
                        style={{ ...inputStyle, fontSize: 12.5, padding: "9px 11px", flex: 2, opacity: editable ? 1 : 0.6 }}
                      />
                      <select
                        value={s.time}
                        onChange={e => onUpdateSession(s.id, { time: e.target.value })}
                        disabled={!editable}
                        style={{ ...inputStyle, fontSize: 12.5, padding: "9px 11px", flex: 1, opacity: editable ? 1 : 0.6 }}
                      >
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {overlap && (
                      <p style={{ color: "#E67E22", fontSize: 11, margin: "8px 0 0", lineHeight: 1.4 }}>
                        ⚠ Mismo bote ({overlap.boat}) que {overlap.team}, que lo usa a las {overlap.time}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <select
                        value={s.boat || ""}
                        onChange={e => {
                          const boat = e.target.value || null;
                          const validOars = oarsOptionsFor(boat);
                          const oars = validOars.includes(s.oars) ? s.oars : null;
                          onUpdateSession(s.id, { boat, oars });
                        }}
                        disabled={!editable}
                        style={{ ...inputStyle, padding: "9px 10px", fontSize: 12, flex: 1, opacity: editable ? 1 : 0.6 }}
                      >
                        <option value="">Sin bote</option>
                        {BOATS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <select
                        value={s.oars || ""}
                        onChange={e => onUpdateSession(s.id, { oars: e.target.value || null })}
                        disabled={!editable || !s.boat}
                        style={{ ...inputStyle, padding: "9px 10px", fontSize: 12, flex: 1, opacity: (editable && s.boat) ? 1 : 0.5 }}
                      >
                        <option value="">Sin rems</option>
                        {oarsOptionsFor(s.boat).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </>
                )}
                {!s.active && s.suspendedReason && (
                  <p style={{ color: "#FF8890", fontSize: 11.5, margin: "8px 0 0" }}>Suspendido: {s.suspendedReason}</p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SuspendReasonModal({ session, onSelect, onCancel }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#333333", border: "1px solid #565656", borderRadius: 16, padding: 20, width: "100%" }}>
        <h3 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 18, color: "#F5F5F5", margin: "0 0 4px" }}>Suspender entreno</h3>
        <p style={{ color: "#ADADAD", fontSize: 12.5, margin: "0 0 16px", lineHeight: 1.4 }}>
          {DAYS_ES[session.dow]} {session.date.getDate()} de {MONTHS_ES[session.date.getMonth()]} · ¿Cuál es el motivo de la suspensión?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SUSPEND_REASONS.map(reason => (
            <button key={reason} className="vir-btn" onClick={() => onSelect(reason)} style={{
              background: "#404040", border: "1px solid #565656", color: "#F5F5F5",
              fontSize: 13, fontWeight: 500, padding: "11px 14px", borderRadius: 10, textAlign: "left",
            }}>{reason}</button>
          ))}
        </div>
        <button className="vir-btn" onClick={onCancel} style={{ background: "transparent", color: "#ADADAD", fontSize: 12.5, marginTop: 16, textDecoration: "underline", display: "block", marginLeft: "auto", marginRight: "auto" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function PhotoLightbox({ photo, caption, onClose }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <img src={photo} alt={caption || "Registro del entreno"} style={{ maxWidth: "100%", maxHeight: "70%", borderRadius: 12, border: "1px solid #565656", objectFit: "contain" }} />
      {caption && <p style={{ color: "#F5F5F5", fontSize: 12.5, margin: "14px 16px 0", textAlign: "center" }}>{caption}</p>}
      <button className="vir-btn" onClick={onClose} style={{ marginTop: 18, background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "9px 20px", color: "#ADADAD", fontSize: 12.5 }}>
        Cerrar
      </button>
    </div>
  );
}

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      className="vir-btn"
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(); }}
      style={{
        width: 42, height: 24, borderRadius: 14, padding: 3, flexShrink: 0,
        background: checked ? "#E61E29" : "#565656", border: "none", position: "relative",
        opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span style={{
        display: "block", width: 18, height: 18, borderRadius: "50%", background: "#F5F5F5",
        transform: checked ? "translateX(18px)" : "translateX(0)", transition: "transform .15s ease",
      }} />
    </button>
  );
}

function CalendarScreen({ sessions, onOpen, onToggle, myId, teamName, showTeamLabel }) {
  const weeks = {};
  [...sessions].sort((a, b) => a.iso.localeCompare(b.iso)).forEach(s => {
    const key = MONTHS_ES[s.date.getMonth()] + " " + s.date.getFullYear();
    (weeks[key] = weeks[key] || []).push(s);
  });
  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionTitle>Calendario mensual</SectionTitle>
      <div style={{ padding: "10px 16px" }}>
        {Object.entries(weeks).map(([label, items]) => (
          <div key={label}>
            <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, margin: "12px 4px 8px" }}>{label}</p>
            {items.map(s => {
              let right;
              if (!onToggle) {
                right = <Badge text={s.status === "cerrado" ? "Cerrado" : `${s.signups.size} aptdos`} tone={s.status === "cerrado" ? "closed" : "open"} />;
              } else if (s.status === "cerrado") {
                const selected = [...s.seats, s.patron, ...s.reserves, ...(s.zodiac || [])].includes(myId);
                right = <Badge text={selected ? "Seleccionado" : "Cerrado"} tone={selected ? "selected" : "closed"} />;
              } else {
                const signed = s.signups.has(myId);
                right = <Badge text={signed ? "Apuntado ✓" : "Apuntarse"} tone={signed ? "signed" : "action"} onClick={() => onToggle(s)} />;
              }
              return <SessionRow key={s.id} s={s} onOpen={onOpen} right={right} teamLabel={showTeamLabel && teamName ? teamName(s.teamId) : null} semaphore={onToggle ? rowerSemaphore(s, myId) : null} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionRowerScreen({ session, onBack, onToggle, onSendAlert, myAlerts, myId, nameOf, nicknameOf, sideOf }) {
  const seatIdx = session.seats.indexOf(myId);
  const isPatron = session.patron === myId;
  const zodiacIdx = session.zodiac.indexOf(myId);
  const isZodiac = zodiacIdx > -1;
  const reserveIdx = session.reserves.indexOf(myId);
  const isCalled = seatIdx > -1 || isPatron || isZodiac;
  const isReserve = !isCalled && reserveIdx > -1;
  const mySeatLabel = () => {
    if (seatIdx > -1) return seatLabel(seatIdx);
    if (isPatron) return "0 · Patrón";
    if (isZodiac) return `Zodiac Z${zodiacIdx + 1}`;
    if (reserveIdx > -1) return `Reserva R${reserveIdx + 1}`;
    return null;
  };
  return (
    <div style={{ padding: "16px 20px 24px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>
        {DAYS_ES[session.dow]} {session.date.getDate()} de {MONTHS_ES[session.date.getMonth()]}
      </h2>
      <p className="vir-mono" style={{ color: "#E61E29", fontSize: 13, margin: "0 0 6px" }}>{session.time}</p>
      {session.boat && (
        <p style={{ color: "#ADADAD", fontSize: 12, margin: "0 0 20px" }}>🚣 {session.boat}{session.oars ? ` · ${session.oars}` : ""}</p>
      )}
      {!session.boat && <div style={{ marginBottom: 20 }} />}

      {session.status === "abierto" ? (
        <>
          <p style={{ color: "#ADADAD", fontSize: 13, lineHeight: 1.5 }}>
            Apúntate a este entreno para entrar en la lista de disponibles. El entrenador seleccionará la tripulación más adelante.
          </p>
          <button className="vir-btn" onClick={() => onToggle(session)} style={{
            ...primaryBtn, marginTop: 18,
            background: session.signups.has(myId) ? "transparent" : "#E61E29",
            border: session.signups.has(myId) ? "1px solid #FF8890" : "none",
            color: session.signups.has(myId) ? "#FF8890" : "#F5F5F5",
          }}>
            {session.signups.has(myId) ? "Darme de baja" : "Apuntarme"}
          </button>
          <div style={{ marginTop: 22 }}>
            <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", marginBottom: 8 }}>Apuntados ({session.signups.size})</p>
            {[...session.signups].map(id => <NameChip key={id} name={nameOf(id)} />)}
          </div>
        </>
      ) : (
        <div>
          <div style={{
            display: "flex", alignItems: "center", gap: 12, borderRadius: 12, padding: 16, marginBottom: 18,
            background: isCalled ? "#1E3A2A" : isReserve ? "#3D2E17" : "#3A1E1E",
            border: `1px solid ${isCalled ? "#3EA55A" : isReserve ? "#E67E22" : "#E24B4A"}`,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: isCalled ? "#3EA55A" : isReserve ? "transparent" : "#E24B4A",
              border: isReserve ? "2px solid #E67E22" : "none",
            }}>
              {isCalled ? <Check size={19} color="#FFFFFF" /> : isReserve ? (
                <span style={{ color: "#E67E22", fontWeight: 800, fontSize: 16, fontFamily: "'Big Shoulders Display', sans-serif" }}>R</span>
              ) : <X size={19} color="#FFFFFF" />}
            </div>
            <div>
              <p style={{ color: "#F5F5F5", fontWeight: 700, fontSize: 14, margin: 0 }}>
                {isCalled ? "Convocado/a" : isReserve ? "Estás de reserva" : "No convocado/a"}
              </p>
              {mySeatLabel() && <p className="vir-mono" style={{ color: "#ADADAD", fontSize: 12.5, margin: "3px 0 0" }}>{mySeatLabel()}</p>}
            </div>
          </div>
          <BoatDiagram session={session} readOnly nicknameOf={nicknameOf} nameOf={nameOf} sideOf={sideOf} />
          {(isCalled || isReserve) && (
            myAlerts && myAlerts.length > 0 ? (
              <p style={{ color: "#8A8A8A", fontSize: 12, marginTop: 16, textAlign: "center" }}>
                Ya has avisado al entrenador de que no puedes venir.
              </p>
            ) : (
              <button
                className="vir-btn"
                onClick={() => {
                  if (window.confirm("¿Avisar al entrenador de que no puedes venir a este entreno? La tripulación ya cerrada no cambia sola — el entrenador tendrá que reabrirla y buscar un sustituto.")) onSendAlert(session);
                }}
                style={{ ...ghostBtn, marginTop: 18, borderColor: "#E24B4A", color: "#FF8890" }}
              >
                Avisar que no puedo venir
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function SessionCoachScreen({ session, onBack, selected, setSelected, onAssign, onClear, onClose, onReopen, teamName, teamOf, nameOf, nicknameOf, sideOf, waterStatsFor, gymStatsFor, onUpdateSession, editable, alerts, onResolveAlert, myId, onToggleSignup }) {
  const [preEditRoster, setPreEditRoster] = useState(null);
  const handleReopen = () => {
    setPreEditRoster({ seats: [...session.seats], patron: session.patron, reserves: [...session.reserves], zodiac: [...session.zodiac] });
    onReopen(session);
  };
  const handleClose = () => {
    onClose(session, preEditRoster);
    setPreEditRoster(null);
  };
  const inScope = (id) => teamOf(id) === session.teamId;
  const available = [...session.signups].filter(id => !session.seats.includes(id) && session.patron !== id && !session.reserves.includes(id) && !session.zodiac.includes(id) && (inScope(id) || id === myId));
  const filled = seatFill(session);
  const setBoat = (boat) => {
    const validOars = oarsOptionsFor(boat);
    const oars = validOars.includes(session.oars) ? session.oars : null;
    onUpdateSession(session.id, { boat, oars });
  };
  const setOars = (oars) => onUpdateSession(session.id, { oars });
  const canEdit = editable && session.status === "abierto";
  const pctFor = (id) => {
    const w = waterStatsFor(id, session.teamId);
    const g = gymStatsFor(id, session.teamId);
    const wPct = w.monthTotal > 0 ? (w.monthDone / w.monthTotal) * 100 : 0;
    const gPct = g.monthTotal > 0 ? (g.monthDone / g.monthTotal) * 100 : 0;
    return Math.round((wPct + gPct) / 2);
  };
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>
        {DAYS_ES[session.dow]} {session.date.getDate()} de {MONTHS_ES[session.date.getMonth()]}
      </h2>
      <p className="vir-mono" style={{ color: "#E61E29", fontSize: 13, margin: "0 0 4px" }}>{session.time} · {filled}/11 asignados</p>
      <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "0 0 4px" }}>Tripulación: {teamName(session.teamId)}</p>
      {!editable && (
        <p style={{ color: "#E67E22", fontSize: 12, margin: "0 0 16px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}
      {editable && <div style={{ marginBottom: 16 }} />}

      {alerts && alerts.length > 0 && (
        <div style={{ background: "#402226", border: "1px solid #E61E29", borderRadius: 12, padding: "12px 14px", marginBottom: 18 }}>
          <p style={{ color: "#FF8890", fontSize: 11.5, fontWeight: 700, margin: "0 0 8px" }}>⚠ Avisos de baja</p>
          {alerts.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <p style={{ color: "#F5F5F5", fontSize: 12.5, margin: 0, lineHeight: 1.4 }}>{a.text}</p>
              {editable && (
                <button className="vir-btn" onClick={() => onResolveAlert(a.id)} style={{ background: "transparent", color: "#8A8A8A", fontSize: 10.5, textDecoration: "underline", whiteSpace: "nowrap", flexShrink: 0 }}>
                  Ya lo he visto
                </button>
              )}
            </div>
          ))}
          <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "6px 0 0", lineHeight: 1.4 }}>
            Reabre la tripulación para hacer los cambios necesarios y vuelve a cerrarla para notificar.
          </p>
        </div>
      )}

      {session.status === "abierto" && (
        <button
          className="vir-btn"
          onClick={() => onToggleSignup(session)}
          style={{
            width: "100%", marginBottom: 18, padding: "11px 0", borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: session.signups.has(myId) ? "transparent" : "#404040",
            border: session.signups.has(myId) ? "1px solid #FF8890" : "1px solid #565656",
            color: session.signups.has(myId) ? "#FF8890" : "#ADADAD",
          }}
        >
          {session.signups.has(myId) ? "Quitarme de disponible" : "Apuntarme también — cubriré un puesto"}
        </button>
      )}

      <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: 14, marginBottom: 18 }}>
        <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Bote y rems</p>
        <div style={{ display: "flex", gap: 8, marginBottom: session.boat ? 8 : 0 }}>
          <select value={session.boat || ""} onChange={e => setBoat(e.target.value || null)} disabled={!canEdit} style={{ ...inputStyle, padding: "9px 10px", fontSize: 12.5, flex: 1, opacity: canEdit ? 1 : 0.6 }}>
            <option value="">Sin bote</option>
            {BOATS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={session.oars || ""} onChange={e => setOars(e.target.value || null)} disabled={!canEdit || !session.boat} style={{ ...inputStyle, padding: "9px 10px", fontSize: 12.5, flex: 1, opacity: (canEdit && session.boat) ? 1 : 0.5 }}>
            <option value="">Sin rems</option>
            {oarsOptionsFor(session.boat).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        {!session.boat && <p style={{ color: "#8A8A8A", fontSize: 11, margin: "8px 2px 0" }}>Elige primero el bote para ver los rems compatibles.</p>}
      </div>

      {session.status === "abierto" ? (
        <>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", marginBottom: 8 }}>Disponibles ({available.length}) · toca uno y luego un puesto</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {available.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 12.5 }}>Nadie más apuntado todavía.</p>}
            {available.map(id => {
              const meta = SIDE_META[sideOf(id)];
              const isSel = selected === id;
              const label = nicknameOf(id) || nameOf(id);
              const pct = pctFor(id);
              return (
                <button key={id} className="vir-chip vir-btn" disabled={!editable} onClick={() => editable && setSelected(isSel ? null : id)} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 12px 6px 6px", borderRadius: 20, fontSize: 12.5,
                  background: isSel ? "#E61E29" : "#404040",
                  border: `1px solid ${isSel ? "#E61E29" : "#565656"}`,
                  color: "#F5F5F5", fontWeight: isSel ? 600 : 400,
                  opacity: editable ? 1 : 0.6, cursor: editable ? "pointer" : "not-allowed",
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: meta ? meta.color : "#565656", color: "#FFFFFF", fontSize: 8.5, fontWeight: 800,
                  }}>{meta ? meta.letter : "?"}</span>
                  {label}
                  <span className="vir-mono" style={{ color: isSel ? "#FFD9DB" : "#8A8A8A", fontSize: 10.5 }}>· {pct}%</span>
                </button>
              );
            })}
          </div>

          <BoatDiagram session={session} selected={selected} onAssign={onAssign} onClear={onClear} readOnly={!editable} nicknameOf={nicknameOf} nameOf={nameOf} sideOf={sideOf} />

          {editable && (
            <button className="vir-btn" disabled={filled === 0} onClick={handleClose} style={{
              ...primaryBtn, marginTop: 20, opacity: filled === 0 ? 0.4 : 1,
            }}>
              Cerrar tripulación y notificar
            </button>
          )}
        </>
      ) : (
        <>
          <Badge text="Tripulación cerrada" tone="closed" />
          <div style={{ marginTop: 16 }}><BoatDiagram session={session} readOnly nicknameOf={nicknameOf} nameOf={nameOf} sideOf={sideOf} /></div>
          {editable && (
            <button className="vir-btn" onClick={handleReopen} style={{ ...ghostBtn, marginTop: 18 }}>
              Reabrir para modificar
            </button>
          )}
        </>
      )}
    </div>
  );
}

function BoatDiagram({ session, selected, onAssign, onClear, readOnly, nicknameOf, nameOf, sideOf }) {
  const handleSlot = (type, idx, occupied) => {
    if (readOnly) return;
    if (occupied) { onClear(session, type, idx); return; }
    if (selected) onAssign(session, type, idx);
  };
  const canClick = (occupied) => !readOnly && (occupied || !!selected);
  const colorFor = (rowerId) => (sideOf && rowerId && SIDE_META[sideOf(rowerId)]) ? SIDE_META[sideOf(rowerId)].color : "#E61E29";

  const centerX = 150;
  const cx = { babor: 92, estribor: 208 };
  const rowY = (row) => 130 + row * 64; // row 0 = fila 4 (arriba) ... row 3 = fila 1 (abajo, junto al patrón)
  const lineTop = 96;
  const lineBottom = 460;
  const reservePos = [{ x: 92, y: 44 }, { x: 208, y: 44 }];
  const patronPos = { x: centerX, y: 486 };
  const zodiacPos = [{ x: 80, y: 538 }, { x: 150, y: 538 }, { x: 220, y: 538 }];

  const Seat = ({ x, y, filled, label, rowerId, onClick }) => {
    const color = colorFor(rowerId);
    return (
      <g style={{ cursor: canClick(filled) ? "pointer" : "default" }} onClick={onClick}>
        <circle cx={x} cy={y} r="18" className="vir-seat"
          fill={filled ? color : "#404040"} stroke={filled ? color : "#6E6E6E"} strokeWidth="1.5" />
        <text x={x} y={y + 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={filled ? "#FFFFFF" : "#8A8A8A"}>{label}</text>
        {filled && (
          <text x={x} y={y + 34} textAnchor="middle" fontSize="11" fontWeight="600" fill="#F5F5F5">{crewLabel(rowerId, nicknameOf, nameOf)}</text>
        )}
      </g>
    );
  };

  return (
    <div style={{ background: "#3A3A3A", border: "1px solid #565656", borderRadius: 14, padding: "16px 0 10px" }}>
      <svg viewBox="0 0 300 610" width="100%" height="530">
        <line x1={centerX} y1={lineTop} x2={centerX} y2={lineBottom} stroke="#767676" strokeWidth="2" />

        <text x={cx.babor} y={80} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#8A8A8A" letterSpacing="0.5">BABOR</text>
        <text x={cx.estribor} y={80} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#8A8A8A" letterSpacing="0.5">ESTRIBOR</text>

        {[0, 1].map(i => {
          const rColor = colorFor(session.reserves[i]);
          return (
            <g key={i} style={{ cursor: canClick(!!session.reserves[i]) ? "pointer" : "default" }}
              onClick={() => handleSlot("reserve", i, !!session.reserves[i])}>
              <rect x={reservePos[i].x - 26} y={reservePos[i].y - 16} width="52" height="32" rx="9" className="vir-seat"
                fill={session.reserves[i] ? rColor : "#404040"} stroke={session.reserves[i] ? rColor : "#6E6E6E"} strokeWidth="1.5" />
              <text x={reservePos[i].x} y={reservePos[i].y + 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={session.reserves[i] ? "#FFFFFF" : "#8A8A8A"}>R{i + 1}</text>
              {session.reserves[i] && <text x={reservePos[i].x} y={reservePos[i].y - 24} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#F5F5F5">{crewLabel(session.reserves[i], nicknameOf, nameOf)}</text>}
            </g>
          );
        })}

        {[0, 1, 2, 3].map(row => {
          const seatNum = 4 - row; // fila 4 arriba -> fila 1 abajo
          const baborIdx = (seatNum - 1) * 2;
          const estriborIdx = (seatNum - 1) * 2 + 1;
          return (
            <g key={row}>
              <Seat x={cx.babor} y={rowY(row)} filled={!!session.seats[baborIdx]} label={seatShort(baborIdx)}
                rowerId={session.seats[baborIdx]}
                onClick={() => handleSlot("seat", baborIdx, !!session.seats[baborIdx])} />
              <Seat x={cx.estribor} y={rowY(row)} filled={!!session.seats[estriborIdx]} label={seatShort(estriborIdx)}
                rowerId={session.seats[estriborIdx]}
                onClick={() => handleSlot("seat", estriborIdx, !!session.seats[estriborIdx])} />
            </g>
          );
        })}

        <g style={{ cursor: canClick(!!session.patron) ? "pointer" : "default" }}
          onClick={() => handleSlot("patron", 0, !!session.patron)}>
          <circle cx={patronPos.x} cy={patronPos.y} r="19" className="vir-seat"
            fill={session.patron ? colorFor(session.patron) : "#404040"} stroke={session.patron ? colorFor(session.patron) : "#6E6E6E"} strokeWidth="1.5" />
          <text x={patronPos.x} y={patronPos.y + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill={session.patron ? "#FFFFFF" : "#8A8A8A"}>P</text>
          {session.patron && <text x={patronPos.x} y={patronPos.y + 38} textAnchor="middle" fontSize="11" fontWeight="600" fill="#F5F5F5">{crewLabel(session.patron, nicknameOf, nameOf)}</text>}
        </g>

        <text x={centerX} y={512} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#8A8A8A" letterSpacing="0.5">ZODIAC</text>
        {[0, 1, 2].map(i => {
          const zColor = colorFor(session.zodiac[i]);
          return (
            <g key={i} style={{ cursor: canClick(!!session.zodiac[i]) ? "pointer" : "default" }}
              onClick={() => handleSlot("zodiac", i, !!session.zodiac[i])}>
              <rect x={zodiacPos[i].x - 26} y={zodiacPos[i].y - 16} width="52" height="32" rx="9" className="vir-seat"
                fill={session.zodiac[i] ? zColor : "#404040"} stroke={session.zodiac[i] ? zColor : "#6E6E6E"} strokeWidth="1.5" />
              <text x={zodiacPos[i].x} y={zodiacPos[i].y + 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={session.zodiac[i] ? "#FFFFFF" : "#8A8A8A"}>Z{i + 1}</text>
              {session.zodiac[i] && <text x={zodiacPos[i].x} y={zodiacPos[i].y + 26} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#F5F5F5">{crewLabel(session.zodiac[i], nicknameOf, nameOf)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function NameChip({ name }) {
  return <div style={{ display: "inline-block", background: "#454545", color: "#E8E8E8", fontSize: 12, padding: "6px 12px", borderRadius: 20, marginRight: 6, marginBottom: 6 }}>{name}</div>;
}

function NotificationsScreen({ items, role, nameOf }) {
  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionTitle sub={role === "rower" ? "Confirmaciones de tripulación" : "Registro de notificaciones enviadas"}>Notificaciones</SectionTitle>
      <div style={{ padding: "10px 16px" }}>
        {items.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 13, marginTop: 20 }}>Aún no hay notificaciones.</p>}
        {items.map(n => (
          <div key={n.id} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: 14, marginBottom: 10, display: "flex", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 15, background: "#402226", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bell size={14} color="#E61E29" />
            </div>
            <div>
              {role === "coach" && <p style={{ color: "#ADADAD", fontSize: 11, margin: "0 0 3px" }}>{nameOf(n.rowerId)}</p>}
              <p style={{ color: "#F5F5F5", fontSize: 12.5, margin: 0, lineHeight: 1.45 }}>{n.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileScreen({ role, scope, attendance, crewStats, teams, teamName, teamCode, onOpenTraining, myId, myDisplayName, myNickname, mySide, myTeam, myEmail, myRowerCode, myPhoto, onUpdateMyProfile, onUpdateMyPhoto, clubDisplayName, clubCode, clubPhoto, onUpdateClubName, onUpdateClubPhoto }) {
  const name = role === "coach" ? myDisplayName : role === "club" ? clubDisplayName : myDisplayName;
  const roleLabel = role === "coach" ? "Entrenador" : role === "club" ? "Club" : "Remero";
  const photo = role === "club" ? clubPhoto : myPhoto;
  const onChangePhoto = role === "club" ? onUpdateClubPhoto : onUpdateMyPhoto;
  const [editing, setEditing] = useState(false);
  const [apodoInput, setApodoInput] = useState(myNickname);
  const [sideInput, setSideInput] = useState(mySide);
  const [clubNameInput, setClubNameInput] = useState(clubDisplayName);
  const [emailInput, setEmailInput] = useState(myEmail);
  const [newPasswordInput, setNewPasswordInput] = useState("");

  const startEdit = () => {
    setApodoInput(myNickname);
    setSideInput(mySide);
    setClubNameInput(clubDisplayName);
    setEmailInput(myEmail);
    setNewPasswordInput("");
    setEditing(true);
  };
  const saveEdit = () => {
    if (role === "rower" || role === "coach") {
      onUpdateMyProfile({ apodo: apodoInput, side: sideInput, email: emailInput, newPassword: newPasswordInput || null });
    }
    if (role === "club") onUpdateClubName(clubNameInput);
    setEditing(false);
  };

  const editable = true; // club, entrenador y remero pueden modificar su cuenta

  return (
    <div style={{ padding: "24px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <AvatarPicker photo={photo} initials={name.split(" ").map(n => n[0]).join("")} onChange={onChangePhoto} />
          <div>
            <p style={{ color: "#F5F5F5", fontWeight: 600, fontSize: 16, margin: 0 }}>{name}</p>
            <p style={{ color: "#ADADAD", fontSize: 12.5, margin: "3px 0 0" }}>{roleLabel}{role !== "club" ? ` · ${clubDisplayName}` : ""}</p>
          </div>
        </div>
        {editable && !editing && (
          <button className="vir-btn" onClick={startEdit} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "8px 10px", color: "#ADADAD" }}>
            <Pencil size={15} />
          </button>
        )}
      </div>

      {editing && (role === "rower" || role === "coach") && (
        <div style={{ background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 12, padding: 14, marginBottom: 20 }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Editar perfil</p>
          {role === "rower" && (
            <>
              <label style={{ fontSize: 11.5, color: "#ADADAD", marginBottom: 4, display: "block" }}>Apodo</label>
              <input value={apodoInput} onChange={e => setApodoInput(e.target.value)} style={{ ...inputStyle, padding: "9px 11px", fontSize: 12.5, marginBottom: 10 }} />
              <label style={{ fontSize: 11.5, color: "#ADADAD", marginBottom: 6, display: "block" }}>Lado de remo</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {Object.entries(SIDE_META).map(([key, meta]) => {
                  const active = sideInput === key;
                  return (
                    <button key={key} className="vir-btn" onClick={() => setSideInput(key)} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 10,
                      background: active ? meta.color : "#404040",
                      border: `1px solid ${active ? meta.color : "#565656"}`,
                    }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        background: active ? "rgba(0,0,0,0.2)" : "#565656", color: active ? "#FFFFFF" : "#ADADAD", fontSize: 9.5, fontWeight: 800,
                      }}>{meta.letter}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: active ? "#FFFFFF" : "#E8E8E8" }}>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <label style={{ fontSize: 11.5, color: "#ADADAD", marginBottom: 4, display: "block" }}>Correo de recuperación</label>
          <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="tucorreo@ejemplo.com" style={{ ...inputStyle, padding: "9px 11px", fontSize: 12.5, marginBottom: 10 }} />
          <label style={{ fontSize: 11.5, color: "#ADADAD", marginBottom: 4, display: "block" }}>Nueva contraseña</label>
          <input type="password" value={newPasswordInput} onChange={e => setNewPasswordInput(e.target.value)} placeholder="Déjalo en blanco para no cambiarla" style={{ ...inputStyle, padding: "9px 11px", fontSize: 12.5, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="vir-btn" onClick={saveEdit} style={{ ...primaryBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Guardar</button>
            <button className="vir-btn" onClick={() => setEditing(false)} style={{ ...ghostBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Cancelar</button>
          </div>
        </div>
      )}

      {editing && role === "club" && (
        <div style={{ background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 12, padding: 14, marginBottom: 20 }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Editar perfil</p>
          <label style={{ fontSize: 11.5, color: "#ADADAD", marginBottom: 4, display: "block" }}>Nombre del club</label>
          <input value={clubNameInput} onChange={e => setClubNameInput(e.target.value)} style={{ ...inputStyle, padding: "9px 11px", fontSize: 12.5, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="vir-btn" onClick={saveEdit} style={{ ...primaryBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Guardar</button>
            <button className="vir-btn" onClick={() => setEditing(false)} style={{ ...ghostBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Cancelar</button>
          </div>
        </div>
      )}

      {role === "rower" && (
        <div style={{ marginBottom: 22 }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Asistencia a entrenos de agua</p>
          <div style={{ display: "flex", gap: 10 }}>
            <AttendanceCard label={`Este mes · ${attendance.month.label}`} attended={attendance.month.attended} total={attendance.month.total} />
            <AttendanceCard label={`Este año · ${attendance.year.label}`} attended={attendance.year.attended} total={attendance.year.total} />
          </div>
          <p style={{ color: "#8A8A8A", fontSize: 11, margin: "8px 2px 0" }}>Se actualiza cuando termina el horario del entreno, no al apuntarte.</p>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <InfoRow icon={<Check size={15} />} label="Días confirmados de asistencia" value={crewStats.convocado} />
          </div>
          <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "4px 2px 0" }}>Veces que el entrenador te ha convocado para el entreno de agua, hayan pasado ya o no.</p>
        </div>
      )}

      {role === "rower" && (
        <div style={{ marginBottom: 22 }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Entrenamiento</p>
          {[
            { id: "rowerGymPlan", label: "Entrenos de gim", sub: "5 sesiones de cada semana, con foto/PDF" },
            { id: "testPesos", label: "Test de pesos", sub: "Registra tus marcas de fuerza" },
            { id: "zonasErgo", label: "Zonas de ergo", sub: "Registra tus tiempos y ritmos de ergómetro" },
            { id: "estadisticas", label: "Estadísticas", sub: "Asistencia, agua y gimnasio, todo junto" },
          ].map(item => (
            <div key={item.id} className="vir-btn" onClick={() => onOpenTraining(item.id)} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{item.label}</p>
                <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>{item.sub}</p>
              </div>
              <ChevronRight size={18} color="#8A8A8A" />
            </div>
          ))}
        </div>
      )}

      {role === "club" ? (
        <>
          <InfoRow icon={<KeyRound size={15} />} label="Número de club" value={clubCode} mono />
          <InfoRow icon={<Users size={15} />} label="Tripulaciones" value={teams.length} />
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "18px 2px 8px" }}>Códigos de tripulación</p>
          {teams.map(t => (
            <InfoRow key={t.id} icon={<KeyRound size={15} />} label={t.name} value={t.code} mono />
          ))}
        </>
      ) : (
        <InfoRow icon={<Users size={15} />} label="Club" value={clubDisplayName} />
      )}
      {role === "coach" ? (
        <>
          <InfoRow icon={<Anchor size={15} />} label="Acceso" value={scope === "club" ? "Todo el club" : teamName(scope)} />
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "18px 2px 8px" }}>Códigos de tripulación · compártelos con tus remeros</p>
          {teams.map(t => (
            <InfoRow key={t.id} icon={<KeyRound size={15} />} label={t.name} value={t.code} mono />
          ))}
        </>
      ) : role === "rower" ? (
        <>
          <InfoRow icon={<User size={15} />} label="Apodo" value={myNickname} />
          <InfoRow icon={<Anchor size={15} />} label="Lado de remo" value={<SideBadge side={mySide} />} />
          <InfoRow icon={<KeyRound size={15} />} label="Código de remero" value={myRowerCode} mono />
          <InfoRow icon={<KeyRound size={15} />} label="Código de club" value={clubCode} mono />
          <InfoRow icon={<Users size={15} />} label="Tripulación" value={teamName(myTeam)} />
          <InfoRow icon={<KeyRound size={15} />} label="Código de tripulación" value={teamCode(myTeam)} mono />
          <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "10px 2px 0", lineHeight: 1.4 }}>
            Código de remero = año de alta + código de club + número correlativo.
          </p>
        </>
      ) : null}
      <InfoRow icon={<Anchor size={15} />} label="Rol" value={roleLabel} />
    </div>
  );
}

function AvatarPicker({ photo, initials, onChange, size = 56 }) {
  const inputRef = useRef(null);
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        className="vir-btn"
        onClick={() => inputRef.current?.click()}
        style={{
          width: size, height: size, borderRadius: size / 2, background: "#454545", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          color: "#E61E29", fontWeight: 700, fontSize: size * 0.36, fontFamily: "'Big Shoulders Display', sans-serif",
        }}
      >
        {photo ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
      </div>
      <div
        className="vir-btn"
        onClick={() => inputRef.current?.click()}
        style={{
          position: "absolute", bottom: -2, right: -2, width: size * 0.36, height: size * 0.36, borderRadius: "50%",
          background: "#E61E29", border: "2px solid #333333", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}
      >
        <Camera size={size * 0.19} color="#FFFFFF" />
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
    </div>
  );
}

function PhotoField({ photo, onChange, jpgOnly, allowPdf }) {
  const [error, setError] = useState(null);
  const [kind, setKind] = useState(null); // "image" | "pdf"
  const isAllowedFormat = (file) => {
    const type = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    if (type === "image/jpeg" || type === "image/heic" || type === "image/heif") return true;
    if (allowPdf && (type === "application/pdf" || /\.pdf$/.test(name))) return true;
    // algunos navegadores no informan el tipo MIME de HEIC/HEIF; comprobamos también la extensión
    return /\.(jpe?g|heic|heif)$/.test(name) || (allowPdf && /\.pdf$/.test(name));
  };
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (jpgOnly && !isAllowedFormat(file)) {
      setError(allowPdf ? "Solo se admiten archivos en formato JPG, HEIC o PDF." : "Solo se admiten archivos en formato JPG o HEIC.");
      e.target.value = "";
      return;
    }
    setError(null);
    const isPdf = /pdf/.test(file.type) || /\.pdf$/i.test(file.name || "");
    setKind(isPdf ? "pdf" : "image");
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result, isPdf ? "pdf" : "image");
    reader.readAsDataURL(file);
  };
  const formatsLabel = allowPdf ? "JPG, HEIC o PDF" : "JPG o HEIC";
  return (
    <div style={{ marginTop: 4 }}>
      <label className="vir-btn" style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        background: "#404040", border: "1px dashed #565656", borderRadius: 10,
        padding: "11px 0", color: "#ADADAD", fontSize: 12.5, cursor: "pointer",
      }}>
        <Camera size={15} />
        {photo ? "Cambiar archivo" : jpgOnly ? `Añadir archivo (${formatsLabel})` : "Añadir foto (opcional)"}
        <input
          type="file"
          accept={jpgOnly ? (allowPdf ? ".jpg,.jpeg,.heic,.heif,.pdf,image/jpeg,image/heic,image/heif,application/pdf" : ".jpg,.jpeg,.heic,.heif,image/jpeg,image/heic,image/heif") : "image/*"}
          style={{ display: "none" }}
          onChange={handleFile}
        />
      </label>
      {jpgOnly && !error && (
        <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "4px 2px 0" }}>Formatos admitidos: {formatsLabel}.</p>
      )}
      {error && (
        <p style={{ color: "#FF8890", fontSize: 11, margin: "6px 2px 0" }}>{error}</p>
      )}
      {photo && kind !== "pdf" && (
        <img src={photo} alt="Foto del entreno" style={{ marginTop: 8, width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 10, border: "1px solid #565656" }} />
      )}
      {photo && kind === "pdf" && (
        <p style={{ marginTop: 8, color: "#ADADAD", fontSize: 12 }}>📄 Archivo PDF adjuntado</p>
      )}
    </div>
  );
}

const PESOS_PCTS = Array.from({ length: 21 }, (_, i) => 100 - i * 5); // 100 → 0, saltos de 5
const ERGO_ZONES = ["Z0", "Z1", "Z2", "Z3", "Z4", "Z5", "Z6"];
const ERGO_PCTS = Array.from({ length: 23 }, (_, i) => 150 - i * 5); // 150 → 40, saltos de 5
// Bandas de intensidad por zona, como % del TEST (fórmula fija, igual para todos)
const ERGO_ZONE_BANDS = {
  Z0: [40, 50], Z1: [50, 60], Z2: [60, 70], Z3: [70, 80],
  Z4: [80, 90], Z5: [90, 100], Z6: [100, 115],
};
const parseErgoTime = (str) => {
  const m = (str || "").trim().match(/^(\d{1,2}):(\d{2})(?:\.(\d))?$/);
  if (!m) return null;
  return (+m[1]) * 60 + (+m[2]) + (m[3] ? +m[3] / 10 : 0);
};
// Fórmula estándar de ergómetro (Concept2): vatios = 2.80 / (ritmo por 500m en segundos / 500) ^ 3
const wattsFromTestTime = (timeStr, distanceM = 1600) => {
  const seconds = parseErgoTime(timeStr);
  if (!seconds) return null;
  const splitPer500 = (seconds * 500) / distanceM;
  return 2.8 / Math.pow(splitPer500 / 500, 3);
};

function PesosScreen({ exercises, onAddExercise, onSetBase, onRemoveExercise, onBack, editable, subtitle }) {
  const [search, setSearch] = useState("");
  const [newExercise, setNewExercise] = useState("");

  const visible = exercises.filter(ex => ex.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Test de pesos</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 16px", lineHeight: 1.4 }}>
        {subtitle || "Cada ejercicio tiene su propia tabla de porcentajes de trabajo, calculada a partir del registro (100%)."}
      </p>
      {!editable && (
        <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "0 0 16px", lineHeight: 1.4 }}>
          🔒 Solo consulta — lo gestiona el propio remero desde su perfil.
        </p>
      )}

      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={15} color="#8A8A8A" style={{ position: "absolute", left: 12, top: 12 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar ejercicio" style={{ ...inputStyle, paddingLeft: 34 }} />
      </div>

      {editable && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: "#ADADAD", marginBottom: 6, display: "block" }}>Ejercicio</label>
          <input value={newExercise} onChange={e => setNewExercise(e.target.value)} placeholder="Ej. Sentadilla" style={{ ...inputStyle, padding: "11px", fontSize: 16, width: "100%", marginBottom: 10 }} />
          <button className="vir-btn" onClick={() => { if (newExercise.trim()) { onAddExercise(newExercise.trim()); setNewExercise(""); } }} style={{ ...primaryBtn, padding: "11px 0", fontSize: 13 }}>Crear</button>
        </div>
      )}

      {visible.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 13 }}>{exercises.length === 0 ? "Todavía no hay ejercicios registrados." : "Sin ejercicios que coincidan con la búsqueda."}</p>}
      {visible.map(ex => (
        <PesosExerciseCard
          key={ex.id}
          exercise={ex}
          onSetBase={(kg) => onSetBase(ex.id, kg)}
          onRemove={onRemoveExercise ? () => {
            if (window.confirm(`¿Eliminar "${ex.name}"? Se perderá su registro y su tabla de porcentajes.`)) onRemoveExercise(ex.id);
          } : null}
          editable={editable}
        />
      ))}
    </div>
  );
}

function PesosExerciseCard({ exercise, onSetBase, onRemove, editable }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [baseInput, setBaseInput] = useState(exercise.baseKg || "");

  const save = () => {
    const v = parseFloat(baseInput);
    if (!isNaN(v) && v > 0) onSetBase(v);
    setEditing(false);
    setExpanded(true);
  };

  return (
    <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 12, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: (editing || expanded) ? 8 : 0 }}>
        <p
          className="vir-btn"
          onClick={() => setExpanded(!expanded)}
          style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 700, margin: 0, flex: 1, cursor: "pointer" }}
        >
          {exercise.name} <span style={{ color: "#8A8A8A", fontSize: 11 }}>{expanded ? "▲" : "▼"}</span>
        </p>
        {editable && (
          <button className="vir-btn" onClick={() => setMenuOpen(!menuOpen)} style={{ background: "transparent", color: "#ADADAD", padding: "4px 6px", fontSize: 18, lineHeight: 1 }}>
            ⋮
          </button>
        )}
        {menuOpen && (
          <div style={{ position: "absolute", top: 38, right: 12, zIndex: 10, background: "#333333", border: "1px solid #565656", borderRadius: 10, overflow: "hidden", minWidth: 160, boxShadow: "0 8px 20px rgba(0,0,0,.4)" }}>
            <button
              className="vir-btn"
              onClick={() => { setBaseInput(exercise.baseKg || ""); setEditing(true); setExpanded(true); setMenuOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", color: "#F5F5F5", fontSize: 13, background: "transparent", borderBottom: "1px solid #565656" }}
            >
              Modificar peso
            </button>
            {onRemove && (
              <button
                className="vir-btn"
                onClick={() => { setMenuOpen(false); onRemove(); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", color: "#FF8890", fontSize: 13, background: "transparent" }}
              >
                Eliminar ejercicio
              </button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div style={{ marginBottom: 4 }}>
          <label style={{ fontSize: 12, color: "#ADADAD", marginBottom: 6, display: "block" }}>Peso 100% (2RP)</label>
          <input
            type="number" inputMode="decimal" value={baseInput} onChange={e => setBaseInput(e.target.value)}
            placeholder="Kg"
            style={{ ...inputStyle, padding: "11px", fontSize: 16, width: "100%", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="vir-btn" onClick={save} style={{ ...primaryBtn, flex: 1, padding: "11px 0", fontSize: 13 }}>Guardar</button>
            <button className="vir-btn" onClick={() => setEditing(false)} style={{ ...ghostBtn, flex: 1, padding: "11px 0", fontSize: 13 }}>Cancelar</button>
          </div>
        </div>
      ) : !exercise.baseKg ? (
        expanded && <p style={{ color: "#8A8A8A", fontSize: 12, margin: 0 }}>{editable ? "Abre el menú (⋮) para registrar el 100%." : "Tu entrenador todavía no ha registrado esta marca."}</p>
      ) : expanded ? (
        <>
          <p style={{ color: "#8A8A8A", fontSize: 11, margin: "0 0 8px" }}>Registro (100%): <span className="vir-mono" style={{ color: "#F5F5F5" }}>{exercise.baseKg} kg</span></p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {PESOS_PCTS.map(pct => (
              <div key={pct} style={{ background: "#333333", border: "1px solid #565656", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                <p style={{ color: "#8A8A8A", fontSize: 10, margin: 0 }}>{pct}%</p>
                <p className="vir-mono" style={{ color: pct === 100 ? "#E61E29" : "#F5F5F5", fontSize: 12.5, fontWeight: 700, margin: "2px 0 0" }}>
                  {Math.round(exercise.baseKg * pct / 100 * 2) / 2} kg
                </p>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ErgoZonesScreen({ testTime, onSetTest, onBack }) {
  const [editingTest, setEditingTest] = useState(false);
  const [testInput, setTestInput] = useState(testTime || "");

  const baseWatts = wattsFromTestTime(testTime);

  const saveTest = () => {
    if (parseErgoTime(testInput)) onSetTest(testInput.trim());
    setEditingTest(false);
  };

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Zonas de ergómetro</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>
        Registra tu tiempo del TEST 1600; las zonas Z0-Z6 y los porcentajes de trabajo se calculan solos a partir de ese tiempo.
      </p>

      <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "14px 16px", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: editingTest ? 10 : 0 }}>
          <div>
            <p style={{ color: "#8A8A8A", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 4px" }}>TEST 1600 · tiempo</p>
            <p className="vir-mono" style={{ color: "#F5F5F5", fontSize: 22, fontWeight: 700, margin: 0 }}>{testTime || "—"}</p>
            {baseWatts && <p style={{ color: "#8A8A8A", fontSize: 11, margin: "4px 0 0" }}>≈ {Math.round(baseWatts)} W de media</p>}
          </div>
          <button className="vir-btn" onClick={() => { setTestInput(testTime || ""); setEditingTest(!editingTest); }} style={{ background: "#333333", border: "1px solid #565656", borderRadius: 10, padding: "8px 10px", color: "#ADADAD" }}>
            <Pencil size={15} />
          </button>
        </div>
        {editingTest && (
          <div>
            <label style={{ fontSize: 12, color: "#ADADAD", marginBottom: 6, display: "block" }}>Tiempo TEST 1600</label>
            <input value={testInput} onChange={e => setTestInput(e.target.value)} placeholder="mm:ss (ej. 6:45)" inputMode="numeric" style={{ ...inputStyle, padding: "11px", fontSize: 16, width: "100%", marginBottom: 10 }} />
            <button className="vir-btn" onClick={saveTest} style={{ ...primaryBtn, padding: "11px 0", fontSize: 13 }}>Guardar</button>
          </div>
        )}
      </div>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Trabajo de zonas</p>
      {!baseWatts ? (
        <p style={{ color: "#8A8A8A", fontSize: 12.5, marginBottom: 22 }}>Registra tu tiempo del TEST 1600 para calcular las zonas.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 22 }}>
          {ERGO_ZONES.map(z => {
            const [minPct, maxPct] = ERGO_ZONE_BANDS[z];
            const minW = Math.round(baseWatts * minPct / 100);
            const maxW = Math.round(baseWatts * maxPct / 100);
            return (
              <div key={z} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "10px 12px" }}>
                <p style={{ color: "#E61E29", fontSize: 12.5, fontWeight: 800, margin: "0 0 4px" }}>{z}</p>
                <p className="vir-mono" style={{ color: "#F5F5F5", fontSize: 13, fontWeight: 700, margin: 0 }}>{minW}–{maxW} W</p>
                <p style={{ color: "#8A8A8A", fontSize: 9.5, margin: "2px 0 0" }}>{minPct}–{maxPct}% del test</p>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Valores de trabajo por porcentaje</p>
      {!baseWatts ? (
        <p style={{ color: "#8A8A8A", fontSize: 12.5 }}>Registra tu tiempo del TEST 1600 para calcular esta tabla.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {ERGO_PCTS.map(pct => (
            <div key={pct} style={{ background: "#404040", border: `1px solid ${pct === 100 ? "#E61E29" : "#565656"}`, borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
              <p style={{ color: "#8A8A8A", fontSize: 10, margin: 0 }}>{pct}%</p>
              <p className="vir-mono" style={{ color: pct === 100 ? "#E61E29" : "#F5F5F5", fontSize: 12.5, fontWeight: 700, margin: "2px 0 0" }}>
                {Math.round(baseWatts * pct / 100)} W
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrainingLogScreen({ title, sub, fields, entries, onAdd, onBack, renderSummary }) {
  const emptyForm = Object.fromEntries(fields.map(f => [f.key, ""]));
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState(null);

  const submit = () => {
    const hasValue = fields.some(f => form[f.key]?.trim());
    if (!hasValue) return;
    onAdd({ ...form, photo, date: new Date() });
    setForm(emptyForm);
    setPhoto(null);
  };

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>{title}</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>{sub}</p>

      <div style={{ background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 12, padding: 14, marginBottom: 20 }}>
        <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Nuevo registro</p>
        {fields.map(f => (
          <div key={f.key} style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11.5, color: "#ADADAD", marginBottom: 4, display: "block" }}>{f.label}</label>
            <input
              type={f.type || "text"}
              value={form[f.key]}
              onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              style={{ ...inputStyle, padding: "9px 11px", fontSize: 12.5 }}
            />
          </div>
        ))}
        <PhotoField photo={photo} onChange={setPhoto} />
        <button className="vir-btn" onClick={submit} style={{ ...primaryBtn, marginTop: 12, padding: "11px 0", fontSize: 13 }}>Guardar registro</button>
      </div>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Historial ({entries.length})</p>
      {entries.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 13 }}>Todavía no has añadido ningún registro.</p>}
      {entries.map(e => (
        <div key={e.id} style={{ display: "flex", gap: 12, background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          {e.photo && <img src={e.photo} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
          <div>
            <p style={{ color: "#F5F5F5", fontSize: 13, fontWeight: 600, margin: 0 }}>{renderSummary(e)}</p>
            <p className="vir-mono" style={{ color: "#8A8A8A", fontSize: 11, margin: "4px 0 0" }}>
              {DAYS_ES[e.date.getDay()]} {e.date.getDate()} de {MONTHS_ES[e.date.getMonth()]}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function RowerStatsScreen({ onBack, attendance, crewStats, pesosCount, ergoTestSet, waterWeekMonth, gymWeekMonth, currentWeek }) {
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 18px" }}>Estadísticas</h2>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Asistencia general</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <AttendanceCard label={`Este mes · ${attendance.month.label}`} attended={attendance.month.attended} total={attendance.month.total} />
        <AttendanceCard label={`Este año · ${attendance.year.label}`} attended={attendance.year.attended} total={attendance.year.total} />
      </div>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Entrenos de agua hechos</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
        <AttendanceCard label={`Semana ${currentWeek}`} attended={waterWeekMonth.weekDone} total={waterWeekMonth.weekTotal} />
        <AttendanceCard label="Este mes" attended={waterWeekMonth.monthDone} total={waterWeekMonth.monthTotal} />
      </div>
      <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "0 0 22px" }}>Convocado: {crewStats.convocado} · Entrenado: {crewStats.entrenado}</p>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Entrenos de gim hechos (5 sesiones semanales)</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <AttendanceCard label={`Semana ${currentWeek}`} attended={gymWeekMonth.weekDone} total={gymWeekMonth.weekTotal} unitLabel="hecho" />
        <AttendanceCard label="Este mes" attended={gymWeekMonth.monthDone} total={gymWeekMonth.monthTotal} unitLabel="hecho" />
      </div>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Test de pesos y zonas de ergo</p>
      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Ejercicios con marca" value={pesosCount} />
        <StatCard label="TEST 1600 registrado" value={ergoTestSet ? "Sí" : "No"} />
      </div>
      <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "10px 2px 0", lineHeight: 1.4 }}>
        Los registros de pesos y ergo son los que tú mismo has ido guardando, con sus fotos y valores, para ver tu evolución de cargas y ritmos.
      </p>
    </div>
  );
}

function AttendanceCard({ label, attended, total, unitLabel = "asistencia" }) {
  const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
  return (
    <div style={{ flex: 1, background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: 12 }}>
      <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "0 0 8px", textTransform: "uppercase" }}>{label}</p>
      <p className="vir-mono" style={{ color: "#F5F5F5", fontSize: 20, fontWeight: 600, margin: 0 }}>{attended}<span style={{ color: "#8A8A8A", fontSize: 13 }}>/{total}</span></p>
      <div style={{ height: 5, background: "#565656", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#E61E29", borderRadius: 3 }} />
      </div>
      <p style={{ color: "#ADADAD", fontSize: 10.5, margin: "6px 0 0" }}>{pct}% {unitLabel}</p>
    </div>
  );
}

function ScopeChip({ active, onClick, label }) {
  return (
    <button className="vir-btn" onClick={onClick} style={{
      padding: "7px 13px", borderRadius: 20, fontSize: 12,
      background: active ? "#E61E29" : "#404040",
      border: `1px solid ${active ? "#E61E29" : "#565656"}`,
      color: "#F5F5F5", fontWeight: active ? 600 : 400,
    }}>{label}</button>
  );
}

function InfoRow({ icon, label, value, mono }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 2px", borderBottom: "1px solid #565656" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#ADADAD", fontSize: 13 }}>{icon}{label}</div>
      <span className={mono ? "vir-mono" : ""} style={{ color: "#F5F5F5", fontSize: 13 }}>{value}</span>
    </div>
  );
}

function SideBadge({ side }) {
  const meta = SIDE_META[side];
  if (!meta) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, background: meta.color, color: "#FFFFFF",
      fontSize: 11, fontWeight: 800, padding: "3px 9px 3px 6px", borderRadius: 20,
    }}>
      <span style={{ width: 16, height: 16, borderRadius: 4, background: "rgba(0,0,0,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>{meta.letter}</span>
      {meta.label}
    </span>
  );
}

function BackRow({ onBack }) {
  return (
    <button className="vir-btn" onClick={onBack} style={{ background: "transparent", color: "#ADADAD", display: "flex", alignItems: "center", gap: 4, fontSize: 13, padding: 0 }}>
      <ChevronLeft size={16} /> Volver
    </button>
  );
}

function TabBar({ screen, setScreen, notifCount, role }) {
  const tabs = role === "club"
    ? [
        { id: "home", icon: Home, label: "Inicio" },
        { id: "users", icon: Users, label: "Usuarios" },
        { id: "teams", icon: Anchor, label: "Tripulaciones" },
        { id: "profile", icon: User, label: "Perfil" },
      ]
    : role === "coach"
    ? [
        { id: "home", icon: Home, label: "Inicio" },
        { id: "calendar", icon: CalendarDays, label: "Entrenos" },
        { id: "coachTeamStats", icon: Users, label: "Equipo" },
        { id: "notifications", icon: Bell, label: "Avisos", badge: notifCount },
        { id: "profile", icon: User, label: "Perfil" },
      ]
    : role === "admin"
    ? [
        { id: "home", icon: Home, label: "Inicio" },
        { id: "regattas", icon: CalendarDays, label: "Regatas" },
      ]
    : [
        { id: "home", icon: Home, label: "Inicio" },
        { id: "calendar", icon: CalendarDays, label: "Entrenos" },
        { id: "notifications", icon: Bell, label: "Avisos", badge: notifCount },
        { id: "profile", icon: User, label: "Perfil" },
      ];
  const homeGroup = ["sessionRower", "sessionCoach", "coachPlan", "coachGymPlan", "informes"];
  const profileGroup = ["testPesos", "zonasErgo", "estadisticas", "rowerGymPlan"];
  const active = homeGroup.includes(screen) ? "home"
    : (screen === "coachRowerDetail" || screen === "coachPesos") ? "coachTeamStats"
    : (screen === "teamDetail" || screen === "teamExport") ? "teams"
    : screen === "raceDetail" ? "regattas"
    : profileGroup.includes(screen) ? "profile"
    : screen;
  return (
    <div style={{ display: "flex", borderTop: "1px solid #565656", background: "#3A3A3A" }}>
      {tabs.map(t => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button key={t.id} className="vir-btn" onClick={() => setScreen(t.id)} style={{
            flex: 1, background: "transparent", padding: "10px 0 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative",
          }}>
            <Icon size={19} color={isActive ? "#E61E29" : "#8A8A8A"} />
            {!!t.badge && <span style={{ position: "absolute", top: 5, right: "28%", width: 7, height: 7, borderRadius: 4, background: "#FF8890" }} />}
            <span style={{ fontSize: 10, color: isActive ? "#E61E29" : "#8A8A8A", fontWeight: isActive ? 600 : 400 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const inputStyle = {
  width: "100%", background: "#404040", border: "1px solid #565656", borderRadius: 10,
  padding: "11px 12px", color: "#F5F5F5", fontSize: 13.5, outline: "none",
};
const primaryBtn = {
  width: "100%", background: "#E61E29", color: "#F5F5F5", fontWeight: 700, fontSize: 14,
  padding: "13px 0", borderRadius: 12,
};
const ghostBtn = {
  background: "transparent", border: "1px solid #565656", color: "#E8E8E8", fontSize: 13,
  padding: "10px 0", borderRadius: 10,
};

function ViradaMark({ height = 32, color = "#F5F5F5" }) {
  const width = height * (566.93 / 283.46);
  return (
    <svg width={width} height={height} viewBox="0 0 566.93 283.46" fill={color}>
      <path d="M145.27,188.58l-28.31,28.31-12.57,12.81-13.03-12.89-38.97-38.98c-15.97-15.97-23.7-35.1-22.36-55.35,1.17-17.66,9.32-35.26,22.36-48.3,13.03-13.03,30.63-21.18,48.29-22.35,20.29-1.31,39.39,6.39,55.35,22.35,3.34,3.34,6.16,6.71,8.61,10.08h22.3c-4.15-7.79-9.83-15.7-17.56-23.43-25.18-25.18-51.99-29.04-69.94-27.84-22.16,1.47-44.17,11.62-60.4,27.84-16.22,16.23-26.38,38.24-27.84,60.4-1.19,18.01,2.67,44.77,27.84,69.94l65.55,65.27,64.8-65.27c.83-.83,1.57-1.74,2.37-2.6h-26.47Z"/>
      <path d="M110.87,177.37l-34.12-75.09h18.29l17.06,39.53,17.16-39.53h16.96l-34.12,75.09h-1.22Z"/>
      <path d="M172.69,102.28h17.26v72.33h-17.26V102.28Z"/>
      <path d="M227.25,102.28h18.59c9.2,0,16.35,.61,22.58,5.11,5.41,3.88,8.48,9.91,8.48,16.14,0,9.09-4.7,16.14-13.48,20.02l22.07,31.06h-19.72l-19.31-28.4h-2.45v28.4h-16.75V102.28Zm16.75,13.18v20.02h3.68c8.78,0,13.38-3.68,13.38-10.22,0-7.25-4.7-9.81-14.2-9.81h-2.86Z"/>
      <path d="M338.31,100.04h1.12l36.06,74.58h-18.08l-4.6-10.52h-29.32l-4.7,10.52h-17.37l36.88-74.58Zm9.19,51.59l-9.4-22.68-9.6,22.68h19Z"/>
      <path d="M401.36,102.28h19.2c27.89,0,43.21,14.5,43.21,36.16,0,13.38-6.13,24.01-17.88,30.75-7.66,4.39-15.63,5.41-25.34,5.41h-19.2V102.28Zm20.84,56.8c15.53,0,24.11-8.07,24.11-20.64s-8.58-20.74-24.11-20.74h-3.78v41.37h3.78Z"/>
      <path d="M521.82,100.04h1.12l36.06,74.58h-18.08l-4.6-10.52h-29.32l-4.7,10.52h-17.37l36.88-74.58Zm9.19,51.59l-9.4-22.68-9.6,22.68h19Z"/>
      <path d="M230.66,199.68h4.94c3.29,0,5.28,1.67,5.28,4.42,0,1.97-1.01,3.37-2.79,4l3,4.25h-1.97l-2.73-3.89c-.25,.02-.51,.04-.8,.04h-3.13v3.85h-1.81v-12.67Zm4.89,7.28c2.32,0,3.53-1.05,3.53-2.86s-1.21-2.84-3.53-2.84h-3.08v5.7h3.08Z"/>
      <path d="M254.66,199.68h8.94v1.57h-7.13v3.89h6.35v1.54h-6.35v4.09h7.38v1.57h-9.19v-12.67Z"/>
      <path d="M277.64,199.68h1.48l5.28,8.9,5.21-8.9h1.48l.02,12.67h-1.74l-.02-9.25-4.58,7.71h-.83l-4.58-7.64v9.17h-1.74v-12.67Z"/>
      <path d="M320.46,206.02c0-3.75,2.86-6.48,6.71-6.48,1.95,0,3.66,.67,4.81,1.97l-1.18,1.14c-.98-1.03-2.17-1.5-3.56-1.5-2.86,0-4.98,2.06-4.98,4.87s2.12,4.87,4.98,4.87c1.39,0,2.59-.49,3.56-1.52l1.18,1.14c-1.16,1.3-2.86,1.99-4.83,1.99-3.84,0-6.7-2.73-6.7-6.48Z"/>
      <path d="M348.75,199.68h1.79l5.75,12.67h-1.9l-1.39-3.17h-6.73l-1.39,3.17h-1.86l5.74-12.67Zm3.62,8.05l-2.73-6.21-2.73,6.21h5.46Z"/>
      <path d="M370.91,201.26h-4.34v-1.57h10.48v1.57h-4.34v11.09h-1.79v-11.09Z"/>
      <path d="M393.05,199.68h1.79l5.75,12.67h-1.9l-1.39-3.17h-6.73l-1.39,3.17h-1.86l5.74-12.67Zm3.62,8.05l-2.73-6.21-2.73,6.21h5.46Z"/>
      <path d="M413.33,199.68h1.81v11.09h6.86v1.57h-8.67v-12.67Z"/>
      <path d="M434.61,206.88v-7.2h1.81v7.13c0,2.81,1.28,4.07,3.56,4.07s3.58-1.27,3.58-4.07v-7.13h1.75v7.2c0,3.67-2.01,5.61-5.36,5.61s-5.36-1.94-5.36-5.61Z"/>
      <path d="M459.88,199.68h1.48l7.6,9.45v-9.45h1.81v12.67h-1.48l-7.6-9.45v9.45h-1.81v-12.67Z"/>
      <path d="M488.21,207.93l-5.03-8.25h1.94l4.05,6.66,4.07-6.66h1.79l-5.03,8.25v4.42h-1.79v-4.42Z"/>
      <path d="M510.62,199.68h1.79l5.75,12.67h-1.9l-1.39-3.17h-6.73l-1.39,3.17h-1.86l5.74-12.67Zm3.62,8.05l-2.73-6.21-2.73,6.21h5.46Z"/>
    </svg>
  );
}
