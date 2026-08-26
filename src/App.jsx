import { useState, useMemo, useEffect, useRef } from "react";
import { Home, CalendarDays, Bell, User, ChevronLeft, ChevronRight, Check, X, KeyRound, Lock, LogOut, Users, RotateCw, Anchor, Search, Camera, Pencil, Trash2, Ruler, Waves, Dumbbell, BarChart3, ClipboardList, Sailboat, Trophy, StickyNote } from "lucide-react";
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

const LAYOUTS = [
  { id: "llagut8", label: "Llagut · 8 puestos", oars: ["Amilibia", "Braka 1.0", "Braka 2.0"] },
  { id: "llaut8", label: "Llaüt · 8 puestos", oars: ["Amilibia", "Braka 1.0", "Braka 2.0"] },
  { id: "llaut9", label: "Llaüt · 9 puestos", oars: ["Amilibia", "Braka 1.0", "Braka 2.0"] },
  { id: "batel4", label: "Bàtel · 4 puestos", oars: ["Ami Batel", "Braka Batel"] },
];
const layoutMeta = (layout) => LAYOUTS.find(l => l.id === layout) || LAYOUTS[0];
const oarsOptionsForLayout = (layout) => layoutMeta(layout).oars;

const parseTimeRange = (str) => {
  if (!str) return null;
  const m = str.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return [(+m[1]) * 60 + (+m[2]), (+m[3]) * 60 + (+m[4])];
};
const rangesOverlap = (a, b) => !!a && !!b && a[0] < b[1] && b[0] < a[1];

function buildSessions(teamId) {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth(); // mes actual real
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const sessions = [];
  const today = new Date();
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
      signups: new Set(),
      crews: [], // los botes de ese día se añaden aparte, uno o varios
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
const inCrew = (s, id) => (s.crews || []).some(c => c.status === "cerrado" && [...c.seats, c.patron, ...c.reserves, ...(c.zodiac || [])].includes(id));
const crewStatsFor = (sessions, id, now) => {
  let convocado = 0, entrenado = 0;
  sessions.forEach(s => {
    if (!s.active || !inCrew(s, id)) return;
    convocado++;
    if (hasPassed(s, now)) entrenado++;
  });
  return { convocado, entrenado };
};
const weekOfDate = (date) => Math.ceil(date.getDate() / 7);
// Convierte una fila cruda de la tabla water_sessions al formato que usa la app
const mapWaterSessionRow = (s) => ({
  id: s.id, teamId: s.team_id, date: new Date(s.date + "T00:00:00"), iso: s.iso, dow: s.dow,
  time: s.time, title: s.title, active: s.active,
  suspendedReason: s.suspended_reason,
  signups: new Set(s.signups || []),
  crews: [], // se rellena aparte desde session_crews
});
const mapNotificationRow = (n) => ({
  id: n.id, rowerId: n.rower_id, sessionId: n.session_id, text: n.text,
  read: !!n.read, readByCoach: !!n.read_by_coach,
  hiddenForRower: !!n.hidden_for_rower, hiddenForCoach: !!n.hidden_for_coach,
});
const mapCrewRow = (c) => ({
  id: c.id, sessionId: c.session_id, boat: c.boat, layout: c.layout || "llagut8", oars: c.oars, status: c.status,
  seats: (c.seats && c.seats.length >= 8) ? [...c.seats, ...Array(Math.max(0, 9 - c.seats.length)).fill(null)] : Array(9).fill(null),
  patron: c.patron || null,
  reserves: (c.reserves && c.reserves.length === 2) ? c.reserves : [null, null],
  zodiac: (c.zodiac && c.zodiac.length === 4) ? c.zodiac : [null, null, null, null],
});
// Todos los remeros/entrenador metidos en cualquier bote de un día (para saber si alguien ya está ocupado ese día)
const allCrewedIds = (session) => session.crews.flatMap(c => [...c.seats, c.patron, ...c.reserves, ...c.zodiac]).filter(Boolean);
const JS_DOW_TO_WEEK_KEY = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"]; // Date.getDay(): 0=domingo..6=sábado
// Posiciones del bote: patrón (0) al frente, luego 4 filas de BABOR/ESTRIBOR (1 a 4)
const SEAT_LABELS = [
  { side: "BABOR", num: 1 }, { side: "ESTRIBOR", num: 1 },
  { side: "BABOR", num: 2 }, { side: "ESTRIBOR", num: 2 },
  { side: "BABOR", num: 3 }, { side: "ESTRIBOR", num: 3 },
  { side: "BABOR", num: 4 }, { side: "ESTRIBOR", num: 4 },
  { side: "ESTRIBOR", num: 0 }, // idx 8: el puesto extra 0E del llaüt
];
const seatLabel = (i) => `${SEAT_LABELS[i].num} ${SEAT_LABELS[i].side}`;
const seatShort = (i) => `${SEAT_LABELS[i].num}${SEAT_LABELS[i].side === "BABOR" ? "B" : "E"}`;
const BATEL_SEAT_NUMS = ["1", "2", "3", "4"]; // idx 0-3, botel: puestos en línea sin babor/estribor
const isBatel = (layout) => layout === "batel4";
const isLlaut9 = (layout) => layout === "llaut9";
const isLlaut8 = (layout) => layout === "llaut8";
const seatShortForBoat = (layout, i) => isBatel(layout) ? BATEL_SEAT_NUMS[i] : seatShort(i);
const seatLabelForBoat = (layout, i) => isBatel(layout) ? `Puesto ${BATEL_SEAT_NUMS[i]}` : seatLabel(i);
const firstName = (name) => name.split(" ")[0];
// Pone en mayúscula solo la primera letra, sin tocar el resto de lo que haya escrito la persona
// (si escribe todo en mayúsculas o minúsculas, se respeta tal cual a partir de la segunda letra)
const capitalizeFirst = (str) => (str && str.length > 0) ? str.charAt(0).toUpperCase() + str.slice(1) : str;
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
  const [theme, setTheme] = useState(() => localStorage.getItem("vir-theme") || "dark"); // "dark" | "light" — se guarda en este dispositivo
  useEffect(() => { localStorage.setItem("vir-theme", theme); }, [theme]);
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
          legalName: c.legal_name || "", nif: c.nif || "", email: c.email || "",
          address: c.address || "", city: c.city || "", postalCode: c.postal_code || "",
          contactFirstName: c.contact_first_name || "", contactLastName: c.contact_last_name || "",
          contactRole: c.contact_role || "", contactPhone: c.contact_phone || "",
        })));
      }
      const { data: usersData, error: usersErr } = await supabase.from("users").select("*");
      if (!usersErr && usersData) {
        const activeUsers = usersData.filter(u => u.status === "active").map(u => ({
          id: u.id, clubId: u.club_id, username: u.username, apodo: u.nickname, side: u.side,
          firstName: u.first_name || "", lastName: u.last_name || "", birthDate: u.birth_date || "", phone: u.phone || "",
        }));
        const pendingList = usersData.filter(u => u.status === "pending").map(u => ({
          id: u.id, clubId: u.club_id, username: u.username, apodo: u.nickname, side: u.side,
          firstName: u.first_name || "", lastName: u.last_name || "", birthDate: u.birth_date || "", phone: u.phone || "",
        }));
        setAssignedUsers(activeUsers);
        setPendingUsers(pendingList);
        const roles = {}, pwds = {}, emails = {}, photos = {}, teamsById = {};
        usersData.forEach(u => {
          if (u.role) roles[u.id] = u.role;
          pwds[u.id] = u.password_hash;
          if (u.email) emails[u.id] = u.email;
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
      const { data: crewsData } = await supabase.from("session_crews").select("*").order("created_at", { ascending: true });
      if (!waterErr && waterSessionsData) {
        const crewsBySession = {};
        (crewsData || []).forEach(c => {
          crewsBySession[c.session_id] = [...(crewsBySession[c.session_id] || []), mapCrewRow(c)];
        });
        setSessions(waterSessionsData.map(s => ({ ...mapWaterSessionRow(s), crews: crewsBySession[s.id] || [] })));
      }
      const { data: notificationsData } = await supabase.from("notifications").select("*").order("created_at", { ascending: false });
      if (notificationsData) {
        setNotifications(notificationsData.map(mapNotificationRow));
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
      const { data: notesData } = await supabase.from("rower_notes").select("*");
      if (notesData) {
        const notes = {};
        notesData.forEach(n => { notes[n.rower_id] = n.text || ""; });
        setRowerNotes(notes);
      }
      const { data: fleetBoatsData } = await supabase.from("fleet_boats").select("*");
      if (fleetBoatsData) {
        setFleetBoats(fleetBoatsData.map(b => ({ id: b.id, teamId: b.team_id, name: b.name, layout: b.layout })));
      }
      const { data: measData } = await supabase.from("boat_measurements").select("*");
      if (measData) {
        const byBoat = {};
        measData.forEach(m => {
          byBoat[m.boat_id] = { ...(byBoat[m.boat_id] || {}), [m.rower_id]: m.value };
        });
        setBoatMeasurements(byBoat);
      }
      const { data: notesRowsData } = await supabase.from("reminder_notes").select("*");
      if (notesRowsData) {
        const clubNote = notesRowsData.find(n => n.team_id === null);
        setClubReminderNote(clubNote ? { id: clubNote.id, text: clubNote.text } : null);
        const teamNotes = {};
        notesRowsData.filter(n => n.team_id !== null).forEach(n => { teamNotes[n.team_id] = { id: n.id, text: n.text }; });
        setTeamReminderNotes(teamNotes);
      }
      const { data: broadcastsData } = await supabase.from("reminder_broadcasts").select("*").order("created_at", { ascending: false });
      if (broadcastsData) {
        setBroadcasts(broadcastsData.map(mapBroadcastRow));
      }
  };

  // Nota: la restauración automática de sesión al abrir la app se ha probado y aparcado por ahora
  // (pendiente de retomar más adelante) — de momento la app siempre pide entrar con usuario/contraseña.

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
          const existing = prev.find(s => s.id === updated.id);
          const merged = { ...updated, crews: existing ? existing.crews : [] }; // no perder las tripulaciones ya cargadas
          return existing ? prev.map(s => s.id === updated.id ? merged : s) : [...prev, merged];
        });
        setOpenSession(prev => (prev && prev.id === updated.id) ? { ...updated, crews: prev.crews } : prev);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "session_crews" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setSessions(prev => prev.map(s => ({ ...s, crews: s.crews.filter(c => c.id !== payload.old.id) })));
          setOpenSession(prev => prev ? { ...prev, crews: prev.crews.filter(c => c.id !== payload.old.id) } : prev);
          return;
        }
        const crew = mapCrewRow(payload.new);
        const applyCrew = (s) => {
          if (s.id !== crew.sessionId) return s;
          const exists = s.crews.some(c => c.id === crew.id);
          return { ...s, crews: exists ? s.crews.map(c => c.id === crew.id ? crew : c) : [...s.crews, crew] };
        };
        setSessions(prev => prev.map(applyCrew));
        setOpenSession(prev => (prev && prev.id === crew.sessionId) ? applyCrew(prev) : prev);
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
        const entry = {
          id: u.id, clubId: u.club_id, username: u.username, apodo: u.nickname, side: u.side,
          firstName: u.first_name || "", lastName: u.last_name || "", birthDate: u.birth_date || "", phone: u.phone || "",
        };
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
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setNotifications(prev => prev.filter(x => x.id !== payload.old.id));
          return;
        }
        const n = mapNotificationRow(payload.new);
        setNotifications(prev => {
          const exists = prev.some(x => x.id === n.id);
          return exists ? prev.map(x => x.id === n.id ? n : x) : [n, ...prev];
        });
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
    const au = assignedUsers.find(u => u.id === id) || pendingUsers.find(u => u.id === id);
    if (au) {
      const fullName = `${au.firstName || ""} ${au.lastName || ""}`.trim();
      if (fullName) return fullName;
      if (au.apodo) return au.apodo;
      return au.username;
    }
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
  const updateMyProfile = async ({ apodo, side, email, newPassword, firstName, lastName, birthDate, phone }) => {
    const updates = { nickname: capitalizeFirst((apodo || "").trim()), side };
    if (firstName !== undefined) updates.first_name = capitalizeFirst(firstName.trim());
    if (lastName !== undefined) updates.last_name = capitalizeFirst(lastName.trim());
    if (birthDate !== undefined) updates.birth_date = birthDate || null;
    if (phone !== undefined) updates.phone = phone.trim() || null;
    const emailChanged = email !== undefined && email.trim() && email.trim().toLowerCase() !== (recoveryEmails[currentUserId] || "").trim().toLowerCase();
    if (emailChanged) updates.email = email.trim().toLowerCase();
    const { error } = await supabase.from("users").update(updates).eq("id", currentUserId);
    if (error) {
      flash(error.message?.includes("duplicate") ? "Ese correo ya está en uso por otra cuenta." : "No se pudo actualizar el perfil. Inténtalo de nuevo.");
      return;
    }
    if (emailChanged) {
      // El correo real es el que usa Supabase Auth para entrar y para recuperar la contraseña — hay que mantenerlo sincronizado
      const { error: emailError } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
      if (emailError) { flash("Perfil actualizado, pero no se pudo actualizar el correo de acceso. Inténtalo de nuevo."); return; }
    }
    if (newPassword) {
      const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
      if (pwError) { flash("Perfil actualizado, pero no se pudo cambiar la contraseña. Inténtalo de nuevo."); return; }
    }
    setNicknameOverrides(prev => ({ ...prev, [currentUserId]: updates.nickname }));
    setSideOverrides(prev => ({ ...prev, [currentUserId]: side }));
    if (emailChanged) setRecoveryEmails(prev => ({ ...prev, [currentUserId]: email.trim().toLowerCase() }));
    setAssignedUsers(prev => prev.map(u => u.id === currentUserId ? {
      ...u, apodo: updates.nickname, side,
      firstName: firstName !== undefined ? updates.first_name : u.firstName,
      lastName: lastName !== undefined ? updates.last_name : u.lastName,
      birthDate: birthDate !== undefined ? birthDate : u.birthDate,
      phone: phone !== undefined ? phone.trim() : u.phone,
    } : u));
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
  const updateClubProfile = async (fields) => {
    const updates = {};
    if (fields.name !== undefined) updates.name = fields.name.trim();
    if (fields.legalName !== undefined) updates.legal_name = fields.legalName.trim() || null;
    if (fields.nif !== undefined) updates.nif = fields.nif.trim() || null;
    if (fields.address !== undefined) updates.address = fields.address.trim() || null;
    if (fields.city !== undefined) updates.city = fields.city.trim() || null;
    if (fields.postalCode !== undefined) updates.postal_code = fields.postalCode.trim() || null;
    if (fields.contactFirstName !== undefined) updates.contact_first_name = capitalizeFirst(fields.contactFirstName.trim());
    if (fields.contactLastName !== undefined) updates.contact_last_name = capitalizeFirst(fields.contactLastName.trim());
    if (fields.contactRole !== undefined) updates.contact_role = fields.contactRole.trim();
    if (fields.contactPhone !== undefined) updates.contact_phone = fields.contactPhone.trim() || null;
    const club = clubs.find(c => c.id === currentClubId);
    const emailChanged = fields.email !== undefined && fields.email.trim() && fields.email.trim().toLowerCase() !== (club?.email || "").trim().toLowerCase();
    if (emailChanged) updates.email = fields.email.trim().toLowerCase();
    const { error } = await supabase.from("clubs").update(updates).eq("id", currentClubId);
    if (error) {
      flash(error.message?.includes("duplicate") ? "Ese correo ya está en uso por otra cuenta." : "No se pudo actualizar el perfil del club. Inténtalo de nuevo.");
      return;
    }
    if (emailChanged) {
      const { error: emailError } = await supabase.auth.updateUser({ email: fields.email.trim().toLowerCase() });
      if (emailError) { flash("Perfil actualizado, pero no se pudo actualizar el correo de acceso. Inténtalo de nuevo."); return; }
    }
    setClubs(prev => prev.map(c => c.id === currentClubId ? {
      ...c,
      name: fields.name !== undefined ? fields.name.trim() : c.name,
      legalName: fields.legalName !== undefined ? fields.legalName.trim() : c.legalName,
      nif: fields.nif !== undefined ? fields.nif.trim() : c.nif,
      email: emailChanged ? fields.email.trim().toLowerCase() : c.email,
      address: fields.address !== undefined ? fields.address.trim() : c.address,
      city: fields.city !== undefined ? fields.city.trim() : c.city,
      postalCode: fields.postalCode !== undefined ? fields.postalCode.trim() : c.postalCode,
      contactFirstName: fields.contactFirstName !== undefined ? capitalizeFirst(fields.contactFirstName.trim()) : c.contactFirstName,
      contactLastName: fields.contactLastName !== undefined ? capitalizeFirst(fields.contactLastName.trim()) : c.contactLastName,
      contactRole: fields.contactRole !== undefined ? fields.contactRole.trim() : c.contactRole,
      contactPhone: fields.contactPhone !== undefined ? fields.contactPhone.trim() : c.contactPhone,
    } : c));
    flash("Perfil del club actualizado");
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
    if (!person.username || person.username.trim().length < 3) { setLoginError("El usuario debe tener al menos 3 caracteres."); return; }
    if (!person.password || person.password.length < 4) { setLoginError("La contraseña debe tener al menos 4 caracteres."); return; }
    if (!person.side) { setLoginError("Elige tu función en el equipo."); return; }
    if (person.password !== person.passwordRepeat) { setLoginError("Las contraseñas no coinciden."); return; }
    const code = (person.clubCode || "").trim();
    if (code.length !== 3) { setLoginError("El número de club debe tener 3 cifras."); return; }
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
      first_name: capitalizeFirst(person.firstName.trim()),
      last_name: capitalizeFirst(person.lastName.trim()),
      nickname: capitalizeFirst(person.apodo.trim()),
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
      active: s.active, suspended_reason: s.suspendedReason,
      signups: [],
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

  const today = new Date();

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
    const monthAttended = past.filter(s => inCrew(s, currentUserId)).length;
    const monthTotal = past.length;
    return {
      month: { label: MONTHS_ES[today.getMonth()], attended: monthAttended, total: monthTotal },
      year: {
        label: ATTENDANCE_BASE.label,
        attended: ATTENDANCE_BASE.attendedBeforeAgosto + monthAttended,
        total: ATTENDANCE_BASE.totalBeforeAgosto + monthTotal,
      },
    };
  }, [sessions, currentUserId, myTeamId]);

  const statsFor = (id) => crewStatsFor(sessions, id, today);

  const overlapFor = (session, crew) => {
    if (!session.active || !crew || !crew.boat) return null; // sin bote asignado no se puede saber si hay conflicto real
    const range = parseTimeRange(session.time);
    for (const s of sessions) {
      if (s.teamId === session.teamId || s.iso !== session.iso || !s.active) continue;
      const clashCrew = (s.crews || []).find(c => c.boat === crew.boat);
      if (clashCrew && rangesOverlap(range, parseTimeRange(s.time))) {
        return { team: teamName(s.teamId), time: s.time, boat: clashCrew.boat };
      }
    }
    return null;
  };

  const updateSession = async (id, patch) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    if (openSession && openSession.id === id) setOpenSession(prev => ({ ...prev, ...patch }));
    const dbPatch = {};
    if ("active" in patch) dbPatch.active = patch.active;
    if ("suspendedReason" in patch) dbPatch.suspended_reason = patch.suspendedReason;
    if ("time" in patch) dbPatch.time = patch.time;
    if ("title" in patch) dbPatch.title = patch.title;
    if ("signups" in patch) dbPatch.signups = Array.from(patch.signups);
    if (Object.keys(dbPatch).length === 0) return true;
    const { data, error } = await supabase.from("water_sessions").update(dbPatch).eq("id", id).select();
    if (error) { flash("No se pudo guardar el cambio. Inténtalo de nuevo."); return false; }
    if (!data || data.length === 0) { flash("No se pudo guardar: no tienes permiso sobre esta tripulación."); return false; }
    return true;
  };

  // Actualiza una tripulación (bote) concreta dentro de un día, y sincroniza el estado local
  const patchCrewLocal = (sessionId, crewId, patch) => {
    setSessions(prev => prev.map(s => s.id !== sessionId ? s : {
      ...s, crews: s.crews.map(c => c.id === crewId ? { ...c, ...patch } : c),
    }));
    if (openSession && openSession.id === sessionId) {
      setOpenSession(prev => ({ ...prev, crews: prev.crews.map(c => c.id === crewId ? { ...c, ...patch } : c) }));
    }
  };
  const updateCrew = async (sessionId, crewId, patch) => {
    patchCrewLocal(sessionId, crewId, patch);
    const dbPatch = {};
    if ("boat" in patch) dbPatch.boat = patch.boat;
    if ("layout" in patch) dbPatch.layout = patch.layout;
    if ("oars" in patch) dbPatch.oars = patch.oars;
    if ("status" in patch) dbPatch.status = patch.status;
    if ("seats" in patch) dbPatch.seats = patch.seats;
    if ("patron" in patch) dbPatch.patron = patch.patron;
    if ("reserves" in patch) dbPatch.reserves = patch.reserves;
    if ("zodiac" in patch) dbPatch.zodiac = patch.zodiac;
    if (Object.keys(dbPatch).length === 0) return true;
    const { data, error } = await supabase.from("session_crews").update(dbPatch).eq("id", crewId).select();
    if (error) { flash("No se pudo guardar el cambio. Inténtalo de nuevo."); return false; }
    if (!data || data.length === 0) { flash("No se pudo guardar: no tienes permiso sobre esta tripulación."); return false; }
    return true;
  };
  const addCrew = async (session, fleetBoat) => {
    const { data, error } = await supabase.from("session_crews").insert({
      session_id: session.id, boat: fleetBoat.name, layout: fleetBoat.layout, oars: null,
      seats: Array(9).fill(null), patron: null, reserves: [null, null], zodiac: [null, null, null, null],
      status: "abierto",
    }).select().single();
    if (error) { flash("No se pudo añadir el bote. Inténtalo de nuevo."); return; }
    const newCrew = mapCrewRow(data);
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, crews: [...s.crews, newCrew] } : s));
    if (openSession && openSession.id === session.id) setOpenSession(prev => ({ ...prev, crews: [...prev.crews, newCrew] }));
    flash(`${fleetBoat.name} añadido a este día`);
  };
  const removeCrew = async (session, crewId) => {
    const { error } = await supabase.from("session_crews").delete().eq("id", crewId);
    if (error) { flash("No se pudo quitar el bote. Inténtalo de nuevo."); return; }
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, crews: s.crews.filter(c => c.id !== crewId) } : s));
    if (openSession && openSession.id === session.id) setOpenSession(prev => ({ ...prev, crews: prev.crews.filter(c => c.id !== crewId) }));
    flash("Bote quitado de este día");
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

  const assign = (session, crew, slotType, slotIndex) => {
    if (!selectedRowerChip) return;
    const already = allCrewedIds(session).includes(selectedRowerChip);
    if (already) return;
    if (slotType === "seat") {
      const seats = [...crew.seats]; seats[slotIndex] = selectedRowerChip;
      updateCrew(session.id, crew.id, { seats });
    } else if (slotType === "patron") {
      updateCrew(session.id, crew.id, { patron: selectedRowerChip });
    } else if (slotType === "zodiac") {
      const zodiac = [...crew.zodiac]; zodiac[slotIndex] = selectedRowerChip;
      updateCrew(session.id, crew.id, { zodiac });
    } else {
      const reserves = [...crew.reserves]; reserves[slotIndex] = selectedRowerChip;
      updateCrew(session.id, crew.id, { reserves });
    }
    setSelectedRowerChip(null);
  };

  const clearSlot = (session, crew, slotType, slotIndex) => {
    if (slotType === "seat") { const seats = [...crew.seats]; seats[slotIndex] = null; updateCrew(session.id, crew.id, { seats }); }
    else if (slotType === "patron") updateCrew(session.id, crew.id, { patron: null });
    else if (slotType === "zodiac") { const zodiac = [...crew.zodiac]; zodiac[slotIndex] = null; updateCrew(session.id, crew.id, { zodiac }); }
    else { const reserves = [...crew.reserves]; reserves[slotIndex] = null; updateCrew(session.id, crew.id, { reserves }); }
  };

  const closeCrew = async (session, crew, previousRoster) => {
    const ok = await updateCrew(session.id, crew.id, { status: "cerrado" });
    if (!ok) return; // si no se pudo cerrar de verdad, no mandamos notificaciones con datos que no cuadran
    const dayLabel = `${session.date.getDate()} de ${MONTHS_ES[session.date.getMonth()]}`;

    const statusFor = (rid, seats, patron, reserves, zodiac) => {
      if (seats.includes(rid) || patron === rid || zodiac.includes(rid)) return "convocado";
      if (reserves.includes(rid)) return "reserva";
      return "no";
    };
    const roleFor = (rid) => {
      const seatIdx = crew.seats.indexOf(rid);
      if (seatIdx > -1) return `puesto ${seatShortForBoat(crew.layout, seatIdx)}`;
      if (crew.patron === rid) return "patrón";
      if (crew.zodiac.includes(rid)) return "zodiac";
      return "puesto";
    };

    // Un aviso individual a cada uno de los que se apuntaron: convocado, de reserva, o no convocado.
    // Si venimos de reabrir y modificar una convocatoria ya cerrada, solo avisamos a quien de verdad
    // le haya cambiado algo, con un mensaje que deja claro que es una modificación.
    const notes = [];
    [...session.signups].forEach(rid => {
      const newStatus = statusFor(rid, crew.seats, crew.patron, crew.reserves, crew.zodiac);
      if (previousRoster) {
        const prevStatus = statusFor(rid, previousRoster.seats, previousRoster.patron, previousRoster.reserves, previousRoster.zodiac || []);
        if (prevStatus === newStatus) return; // sin cambios para esta persona, no repetimos aviso
        let text;
        if (newStatus === "convocado") text = `La convocatoria de "${crew.boat}" ha cambiado — ahora estás convocado/a para el entreno del ${dayLabel}, ${session.time}. Rol: ${roleFor(rid)}.`;
        else if (newStatus === "reserva") text = `La convocatoria de "${crew.boat}" ha cambiado — ahora estás de reserva para el entreno del ${dayLabel}, ${session.time}.`;
        else text = `La convocatoria de "${crew.boat}" ha cambiado — ya no estás convocado/a para el entreno del ${dayLabel}, ${session.time}.`;
        notes.push({ rowerId: rid, text });
      } else {
        let text;
        if (newStatus === "convocado") text = `Convocado/a al entreno de agua del ${dayLabel}, ${session.time} (${crew.boat}). Rol: ${roleFor(rid)}.`;
        else if (newStatus === "reserva") text = `De reserva para el entreno de agua del ${dayLabel}, ${session.time} (${crew.boat}).`;
        else text = `No convocado/a al entreno de agua del ${dayLabel}, ${session.time} (${crew.boat}).`;
        notes.push({ rowerId: rid, text });
      }
    });

    // Un único aviso resumen para el propio entrenador, que le lleva directo a la convocatoria al tocarlo
    notes.push({
      rowerId: null,
      text: previousRoster
        ? `Has actualizado la convocatoria de "${crew.boat}" para el día ${dayLabel} a las ${session.time}h.`
        : `Has cerrado la convocatoria de "${crew.boat}" para el día ${dayLabel} a las ${session.time}h.`,
    });

    const { data, error } = await supabase.from("notifications").insert(
      notes.map(n => ({ rower_id: n.rowerId, session_id: session.id, text: n.text }))
    ).select();
    if (!error && data) {
      setNotifications(prev => [...data.map(mapNotificationRow), ...prev]);
    } else if (error) {
      flash(`Tripulación cerrada, pero hubo un problema guardando las notificaciones: ${error.message}`);
      return;
    }
    flash(`${crew.boat} cerrado y notificaciones enviadas`);
  };

  const reopenCrew = (session, crew) => {
    updateCrew(session.id, crew.id, { status: "abierto" });
    flash(`${crew.boat} reabierto — modifica lo que haga falta y vuelve a cerrarlo para notificar`);
  };

  const toggleActive = (session) => {
    if (session.active) {
      const hasData = session.signups.size > 0 || (session.crews && session.crews.length > 0);
      if (hasData) { setSuspendTarget(session); return; } // hay botes/gente: pedimos motivo antes de tocar nada
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

  // NOTAS: apuntes privados del propio remero
  const [rowerNotes, setRowerNotes] = useState({}); // { [rowerId]: text }
  const updateMyNotes = async (text) => {
    setRowerNotes(prev => ({ ...prev, [currentUserId]: text }));
    const { error } = await supabase.from("rower_notes").upsert(
      { rower_id: currentUserId, text, updated_at: new Date().toISOString() },
      { onConflict: "rower_id" }
    );
    if (error) { flash("No se pudieron guardar las notas. Inténtalo de nuevo."); return; }
    flash("Notas guardadas");
  };

  // RECORDATORIOS: la nota fija del club (visible a todos) y la de cada equipo (visible a sus remeros)
  const [clubReminderNote, setClubReminderNote] = useState(null); // {id, text} | null
  const [teamReminderNotes, setTeamReminderNotes] = useState({}); // { [teamId]: {id, text} }
  const setClubNote = async (text) => {
    if (clubReminderNote) {
      const { error } = await supabase.from("reminder_notes").update({ text, updated_at: new Date().toISOString() }).eq("id", clubReminderNote.id);
      if (error) { flash("No se pudo guardar. Inténtalo de nuevo."); return; }
      setClubReminderNote({ id: clubReminderNote.id, text });
    } else {
      const { data, error } = await supabase.from("reminder_notes").insert({ club_id: currentClubId, team_id: null, text }).select().single();
      if (error) { flash("No se pudo guardar. Inténtalo de nuevo."); return; }
      setClubReminderNote({ id: data.id, text });
    }
    flash("Recordatorio del club actualizado");
  };
  const removeClubNote = async () => {
    if (!clubReminderNote) return;
    const { error } = await supabase.from("reminder_notes").delete().eq("id", clubReminderNote.id);
    if (error) { flash("No se pudo eliminar. Inténtalo de nuevo."); return; }
    setClubReminderNote(null);
    flash("Recordatorio del club eliminado");
  };
  const setTeamNote = async (teamId, text) => {
    const existing = teamReminderNotes[teamId];
    if (existing) {
      const { error } = await supabase.from("reminder_notes").update({ text, updated_at: new Date().toISOString() }).eq("id", existing.id);
      if (error) { flash("No se pudo guardar. Inténtalo de nuevo."); return; }
      setTeamReminderNotes(prev => ({ ...prev, [teamId]: { id: existing.id, text } }));
    } else {
      const { data, error } = await supabase.from("reminder_notes").insert({ club_id: currentClubId, team_id: teamId, text }).select().single();
      if (error) { flash("No se pudo guardar. Inténtalo de nuevo."); return; }
      setTeamReminderNotes(prev => ({ ...prev, [teamId]: { id: data.id, text } }));
    }
    flash("Recordatorio del equipo actualizado");
  };
  const removeTeamNote = async (teamId) => {
    const existing = teamReminderNotes[teamId];
    if (!existing) return;
    const { error } = await supabase.from("reminder_notes").delete().eq("id", existing.id);
    if (error) { flash("No se pudo eliminar. Inténtalo de nuevo."); return; }
    setTeamReminderNotes(prev => { const next = { ...prev }; delete next[teamId]; return next; });
    flash("Recordatorio del equipo eliminado");
  };

  // Avisos difusores: mismo mecanismo que las notificaciones normales, pero se pueden mandar
  // tantas veces como se quiera, a un equipo o a todo el club, y programarse para más adelante
  const [broadcasts, setBroadcasts] = useState([]); // [{id, clubId, teamId, audience, text, scheduledFor, sentAt}]
  const mapBroadcastRow = (b) => ({
    id: b.id, clubId: b.club_id, teamId: b.team_id, audience: b.audience, text: b.text,
    scheduledFor: b.scheduled_for, sentAt: b.sent_at,
  });
  const recipientsFor = (broadcast) => {
    if (broadcast.teamId) {
      return assignedUsers.filter(u => roleOf(u.id) === "rower" && teamOf(u.id) === broadcast.teamId).map(u => u.id);
    }
    return assignedUsers.filter(u => {
      const r = roleOf(u.id);
      if (broadcast.audience === "coaches") return r === "coach";
      if (broadcast.audience === "rowers") return r === "rower";
      return r === "coach" || r === "rower";
    }).map(u => u.id);
  };
  const dispatchBroadcast = async (broadcast) => {
    const recipients = recipientsFor(broadcast);
    if (recipients.length > 0) {
      const { error } = await supabase.from("notifications").insert(
        recipients.map(rid => ({ rower_id: rid, session_id: null, text: `📌 ${broadcast.text}` }))
      ).select();
      if (error) { flash("El aviso se guardó, pero hubo un problema al enviarlo a todos."); }
    }
    const sentAt = new Date().toISOString();
    await supabase.from("reminder_broadcasts").update({ sent_at: sentAt }).eq("id", broadcast.id);
    setBroadcasts(prev => prev.map(b => b.id === broadcast.id ? { ...b, sentAt } : b));
  };
  const sendBroadcast = async ({ teamId, audience, text, scheduledFor }) => {
    const { data, error } = await supabase.from("reminder_broadcasts").insert({
      club_id: currentClubId, team_id: teamId || null, audience: teamId ? "rowers" : audience, text,
      scheduled_for: scheduledFor || null,
    }).select().single();
    if (error) { flash("No se pudo crear el aviso. Inténtalo de nuevo."); return; }
    const mapped = mapBroadcastRow(data);
    setBroadcasts(prev => [mapped, ...prev]);
    if (!scheduledFor) {
      await dispatchBroadcast(mapped);
      flash("Aviso enviado");
    } else {
      flash("Aviso programado");
    }
  };

  // Comprueba cada minuto si hay avisos programados cuya hora ya ha llegado, y los manda.
  // Como no hay un reloj de servidor detrás, se envían la próxima vez que un club/entrenador
  // tenga la app abierta después de esa hora, no en el segundo exacto. De paso, elimina del
  // registro los avisos que ya llevan más de 10 días enviados.
  useEffect(() => {
    if (!(role === "club" || role === "coach" || role === "admin")) return;
    const checkAndSend = () => {
      const now = new Date();
      broadcasts.forEach(b => {
        if (!b.sentAt && b.scheduledFor && new Date(b.scheduledFor) <= now) {
          dispatchBroadcast(b);
        }
      });
    };
    const cleanupOld = async () => {
      const cutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const expired = broadcasts.filter(b => b.sentAt && b.sentAt < cutoff);
      if (expired.length === 0) return;
      const ids = expired.map(b => b.id);
      const { error } = await supabase.from("reminder_broadcasts").delete().in("id", ids);
      if (!error) setBroadcasts(prev => prev.filter(b => !ids.includes(b.id)));
    };
    checkAndSend();
    cleanupOld();
    const interval = setInterval(() => { checkAndSend(); cleanupOld(); }, 60000);
    return () => clearInterval(interval);
  }, [role, broadcasts]);

  // MEDIDAS: botes con la medida de cada remero, a cargo del entrenador/club
  // BOTES: la flota real del equipo (nombre + disposición), gestionada por el entrenador/club.
  // Se usa tanto para elegir bote al montar un entreno de agua como para Medidas.
  const [fleetBoats, setFleetBoats] = useState([]); // [{id, teamId, name, layout}]
  const fleetBoatsFor = (teamId) => fleetBoats.filter(b => b.teamId === teamId);
  const addFleetBoat = async (teamId, name, layout) => {
    const { data, error } = await supabase.from("fleet_boats").insert({ team_id: teamId, name, layout }).select().single();
    if (error) { flash("No se pudo añadir el bote. Inténtalo de nuevo."); return; }
    setFleetBoats(prev => [...prev, { id: data.id, teamId: data.team_id, name: data.name, layout: data.layout }]);
    flash(`Bote "${name}" añadido a la flota`);
  };
  const removeFleetBoat = async (boatId) => {
    const { error } = await supabase.from("fleet_boats").delete().eq("id", boatId);
    if (error) { flash("No se pudo eliminar el bote. Inténtalo de nuevo."); return; }
    setFleetBoats(prev => prev.filter(b => b.id !== boatId));
    setBoatMeasurements(prev => { const next = { ...prev }; delete next[boatId]; return next; });
    flash("Bote eliminado de la flota");
  };

  const [boatMeasurements, setBoatMeasurements] = useState({}); // { [boatId]: { [rowerId]: value } }
  const setBoatMeasurement = async (boatId, rowerId, value) => {
    setBoatMeasurements(prev => ({ ...prev, [boatId]: { ...(prev[boatId] || {}), [rowerId]: value } }));
    const { error } = await supabase.from("boat_measurements").upsert(
      { boat_id: boatId, rower_id: rowerId, value, updated_at: new Date().toISOString() },
      { onConflict: "boat_id,rower_id" }
    );
    if (error) flash("No se pudo guardar la medida. Inténtalo de nuevo.");
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
      weekDone: weekPast.filter(s => inCrew(s, rowerId)).length,
      weekTotal: weekPast.length,
      monthDone: teamPast.filter(s => inCrew(s, rowerId)).length,
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
    if (!club.name?.trim()) { setLoginError("El nombre del club es obligatorio."); return; }
    if (!club.username || club.username.trim().length < 3) { setLoginError("El usuario debe tener al menos 3 caracteres."); return; }
    if (!club.password || club.password.length < 4) { setLoginError("La contraseña debe tener al menos 4 caracteres."); return; }
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
      contact_first_name: capitalizeFirst(club.contactFirstName.trim()),
      contact_last_name: capitalizeFirst(club.contactLastName.trim()),
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
      const { data: userEmail } = await supabase.rpc("resolve_user_login_email", { p_username: cleanUsername });
      const { data: clubEmail } = await supabase.rpc("resolve_club_login_email", { p_username: cleanUsername });
      const email = userEmail || clubEmail;
      if (email) {
        await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      }
    }
    // Mismo mensaje exista o no el usuario, para no revelar qué nombres de usuario están en uso
    flash("Si el usuario existe, hemos enviado un enlace a su correo de recuperación.");
  };

  const myNotifications = notifications.filter(n => n.rowerId === currentUserId && !n.hiddenForRower);
  const coachNotifications = notifications.filter(n => n.rowerId === null && !n.hiddenForCoach);

  const markNotificationRead = async (id, forRole) => {
    const col = forRole === "coach" ? "readByCoach" : "read";
    const dbCol = forRole === "coach" ? "read_by_coach" : "read";
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, [col]: true } : n));
    const { error } = await supabase.from("notifications").update({ [dbCol]: true }).eq("id", id);
    if (error) flash("No se pudo marcar como visto. Inténtalo de nuevo.");
  };
  const hideNotification = async (id, forRole) => {
    const col = forRole === "coach" ? "hiddenForCoach" : "hiddenForRower";
    const dbCol = forRole === "coach" ? "hidden_for_coach" : "hidden_for_rower";
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, [col]: true } : n));
    const { error } = await supabase.from("notifications").update({ [dbCol]: true }).eq("id", id);
    if (error) flash("No se pudo eliminar el aviso. Inténtalo de nuevo.");
  };
  const openNotificationSession = (n, forRole) => {
    markNotificationRead(n.id, forRole);
    if (!n.sessionId) {
      // aviso general (recordatorio, sin entreno asociado): lleva a la pantalla de Recordatorios
      if (role === "rower") setScreen("recordatorios");
      else if (role === "club") setScreen("remindersClub");
      else setScreen("remindersCoach"); // entrenador o admin
      return;
    }
    const session = sessions.find(s => s.id === n.sessionId);
    if (!session) { flash("Ese entreno ya no está disponible."); return; }
    setOpenSession(session);
    setScreen(forRole === "rower" ? "sessionRower" : "sessionCoach");
  };

  const LOGO_DARK_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAlgAAAEbCAYAAAAGQvqDAABpJElEQVR42u2deXhdZbX/v+vde58pczomTTo3HSi10ioyJkEFrzKo1wQBRVEQBJSLICjqL63eq14HFAUZZPDqdSARr3K1oHBJCoKArWUsbTq3aTpmHs6097t+f5y921Ap5AxJTk7W53nOQ+lwcs7e737f7/q+610LEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBmEhQA6A48TIY1ebRV53BR/+Mhvz6DV51RvPr/i0MBlQDoACQXGZBEARBEHKSoyKp2kyIIahR/NnqqABLCDa5I4IgCIJwfGShzFIaALUKddSCg1SDtZoA/QZ/zXi5fF55r8NFZKg5lYY1N6ydYAS6VBFNLyaj0gBZccB4o59hgh2H4PRpZ7fNvD8A1RFURni3E99mOrwjZKD3xPZt7QCcNxJdQLUCpjLQpAlguWuCIAiCIAIrq2CAmgA1BdVUg7XOsYLl8alzppUqa2aJZayMaHt+vlIr4owpFtFckyhgESGPlPdeYACO9xb85nffAIGGDIYB1ogzw2aOxJm3WYTDA5r/7oNqPcz2uh4M7n5ve3vHGwuutZ7YEsElCIIgiMASxkZUAXUqcSOaXucSPVU2d+ZkZb3TUvQuC3gXgKUBUkX5SoEA2GBoBiKsPWtLM1iDE3eVADCIhv1JAD76b0kBUAYAPykoAiwQHAD92kGE+TAzvwaitRHw351I5Pmlh3btf/071hlAEx/HeRMEQRAEEVhCpkUVFFD3OlG1pnR+4ax8emdAq/cYRLUGsKxQGQGLCDYYkYSjBIDthDVEnulENEL3kY86UQwwJ34ImRYR/ESwQIgwY0Dr3hjr52Pgxzq0fuy09q0veKqNADyBarMFa/VqEVuCIAiCCCwhkzQAqgbVqhZrbe/3NsyaVVxgB8/yKXzIJFT7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"; // texto blanco, para fondos oscuros
  const LOGO_LIGHT_B64 = "data:image/png;base64,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"; // texto gris oscuro, para fondos claros
  const Logo = ({ size = 22, variant }) => {
    const useLight = (variant || theme) === "light";
    return <img src={useLight ? LOGO_LIGHT_B64 : LOGO_DARK_B64} alt="VIRADA" style={{ height: size * 1.8, width: "auto", display: "block" }} />;
  };

  return (
    <div data-theme={theme} style={{ display: "flex", justifyContent: "center", padding: "24px 8px", background: "var(--vir-bg-page, #262626)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800;900&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');
        .vir-app * { box-sizing: border-box; font-family: 'Inter', sans-serif; }
        .vir-mono { font-family: 'IBM Plex Mono', monospace; }
        .vir-btn { cursor: pointer; border: none; transition: transform .1s ease, opacity .15s ease; }
        .vir-btn:active { transform: scale(0.97); }
        .vir-scroll::-webkit-scrollbar { display: none; }
        .vir-chip { transition: background .15s ease, border-color .15s ease; }
        .vir-seat { transition: fill .15s ease, stroke .15s ease; cursor: pointer; }

        /* Paleta de colores por tema — todo lo que se vaya adaptando usará estas variables
           en vez de un color fijo, para que cambiar de tema sea instantáneo en toda la app */
        [data-theme="dark"] {
          --vir-bg-page: #262626;
          --vir-bg-phone: #333333;
          --vir-bg-surface: #404040;
          --vir-bg-surface-alt: #3A3A3A;
          --vir-bg-input: #404040;
          --vir-border: #565656;
          --vir-text-primary: #F5F5F5;
          --vir-text-secondary: #ADADAD;
          --vir-text-muted: #8A8A8A;
          --vir-red: #E61E29;
          --vir-green: #3EA55A;
          --vir-orange: #E67E22;
          --vir-danger: #E24B4A;
          --vir-danger-bg: #402226;
          --vir-success-bg: #1E3A2A;
          --vir-warning-bg: #3D2E17;
          --vir-error: #FF8890;
          --vir-boat-bg: #333333;
          --vir-boat-zodiac-bg: #333333;
          --vir-boat-label: #8A8A8A;
          --vir-boat-name: #F5F5F5;
        }
        [data-theme="light"] {
          --vir-bg-page: #E9E9E9;
          --vir-bg-phone: #FFFFFF;
          --vir-bg-surface: #F2F2F2;
          --vir-bg-surface-alt: #F7F7F7;
          --vir-bg-input: #FFFFFF;
          --vir-border: #DADADA;
          --vir-text-primary: #333333;
          --vir-text-secondary: #666666;
          --vir-text-muted: #7A7A7A;
          --vir-red: #D8151F;
          --vir-green: #2E8B4F;
          --vir-orange: #C96A16;
          --vir-danger: #C93A38;
          --vir-danger-bg: #FBE4E3;
          --vir-success-bg: #E3F3E9;
          --vir-warning-bg: #FBEFDF;
          --vir-error: #C93A38;
          --vir-boat-bg: #E6E6E6;
          --vir-boat-zodiac-bg: #E6E6E6;
          --vir-boat-label: #333333;
          --vir-boat-name: #333333;
        }

        @media print {
          body * { visibility: hidden; }
          .vir-print-area, .vir-print-area * { visibility: visible; }
          .vir-print-area { position: absolute; top: 0; left: 0; width: 100%; background: #FFFFFF !important; color: #111 !important; }
        }
      `}</style>
      <div className="vir-app vir-scroll" data-theme={theme} style={{
        width: 380, height: 780, background: "var(--vir-bg-phone)",
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
            <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--vir-border, #565656)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Logo size={26} />
              <button className="vir-btn" onClick={async () => { await supabase.auth.signOut(); setScreen("login"); setRole(null); setOpenSession(null); setCurrentClubId(null); setCurrentUserId(null); }} style={{ background: "transparent", color: "var(--vir-text-secondary, #ADADAD)" }}>
                <LogOut size={18} />
              </button>
            </div>

            <div className="vir-scroll" style={{ flex: 1, overflowY: "auto" }}>
              {screen === "home" && role === "rower" && (
                <RowerHome
                  sessions={rowerWeekAhead}
                  onOpen={(s) => { setOpenSession(s); setScreen("sessionRower"); }}
                  onToggle={toggleSignup}
                  notifCount={myNotifications.filter(n => !n.read).length}
                  teamName={teamName}
                  attendance={attendanceStats}
                  crewStats={statsFor(currentUserId)}
                  pesosExercises={pesosExercisesOf(currentUserId)}
                  ergoTest={ergoTestTimes[currentUserId] ? Math.round(wattsFromTestTime(ergoTestTimes[currentUserId])) : null}
                  onNavigate={(id) => setScreen(id)}
                  myId={currentUserId}
                  myName={displayNameOf(currentUserId)}
                  myTeam={teamOf(currentUserId)}
                  alertsFor={alertsFor}
                />
              )}
              {screen === "home" && role === "coach" && (
                <CoachHome sessions={coachWeekAhead} onOpen={(s) => { setOpenSession(s); setSelectedRowerChip(null); setScreen("sessionCoach"); }} scope={coachScope} setScope={setCoachScope} teams={clubTeams} onPlanCalendar={() => setScreen("coachPlan")} onGymPlan={() => setScreen("coachGymPlan")} onTeamStats={() => setScreen("coachTeamStats")} onOpenRegattas={() => setScreen("regattas")} onOpenInformes={() => setScreen("informes")} onOpenMeasurements={() => setScreen("medidasCoach")} onOpenFleet={() => setScreen("botesCoach")} onOpenReminders={() => setScreen("remindersCoach")} coachName={displayNameOf(currentUserId)} teamName={teamName} showTeamLabel={coachScope === "club"} alertsFor={alertsFor} />
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
              {screen === "medidasCoach" && (role === "coach" || role === "admin") && (
                <CoachMeasurementsScreen
                  teamId={coachScope}
                  teams={clubTeams}
                  setScope={setCoachScope}
                  boats={fleetBoatsFor(coachScope)}
                  members={[...ROWERS, ...clubAssignedUsers]
                    .filter(p => roleOf(p.id) === "rower" && teamOf(p.id) === coachScope)
                    .map(p => ({ id: p.id, name: p.name || p.username, nickname: nicknameOf(p.id), side: sideOf(p.id) }))}
                  measurements={boatMeasurements}
                  editable={role === "admin" ? true : canManage(coachScope)}
                  onSetValue={setBoatMeasurement}
                  onBack={() => setScreen("home")}
                />
              )}
              {screen === "botesCoach" && (role === "coach" || role === "admin") && (
                <CoachFleetScreen
                  teamId={coachScope}
                  teams={clubTeams}
                  setScope={setCoachScope}
                  boats={fleetBoatsFor(coachScope)}
                  sessions={coachScope === "club" ? [] : sessions.filter(s => s.teamId === coachScope)}
                  editable={role === "admin" ? true : canManage(coachScope)}
                  onAddBoat={addFleetBoat}
                  onRemoveBoat={removeFleetBoat}
                  onBack={() => setScreen("home")}
                />
              )}
              {screen === "remindersClub" && (role === "club" || role === "admin") && (
                <ClubRemindersScreen
                  note={clubReminderNote}
                  onSaveNote={setClubNote}
                  onRemoveNote={removeClubNote}
                  broadcasts={broadcasts.filter(b => b.teamId === null)}
                  onSend={(payload) => sendBroadcast({ ...payload, teamId: null })}
                  onBack={() => setScreen("home")}
                />
              )}
              {screen === "remindersCoach" && (role === "coach" || role === "admin") && (
                <CoachRemindersScreen
                  teamId={coachScope}
                  teams={clubTeams}
                  setScope={setCoachScope}
                  note={coachScope !== "club" ? teamReminderNotes[coachScope] : null}
                  onSaveNote={(text) => setTeamNote(coachScope, text)}
                  onRemoveNote={() => removeTeamNote(coachScope)}
                  broadcasts={broadcasts.filter(b => b.teamId === coachScope)}
                  onSend={(payload) => sendBroadcast({ ...payload, teamId: coachScope })}
                  editable={role === "admin" ? true : canManage(coachScope)}
                  onBack={() => setScreen("home")}
                />
              )}
              {screen === "recordatorios" && role === "rower" && (
                <RowerRemindersScreen
                  clubNote={clubReminderNote}
                  teamNote={teamReminderNotes[teamOf(currentUserId)]}
                  onBack={() => setScreen("home")}
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
                  onOpenReminders={() => setScreen("remindersClub")}
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
                  onOpenInformes={() => { setCoachScope("club"); setScreen("informes"); }}
                  onOpenMeasurements={() => { setCoachScope("club"); setScreen("medidasCoach"); }}
                  onOpenFleet={() => { setCoachScope("club"); setScreen("botesCoach"); }}
                  onOpenReminders={() => setScreen("remindersClub")}
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
                  ].filter(m => (roleOf(m.id) === "rower" && teamOf(m.id) === openTeam.id) || (roleOf(m.id) === "coach" && managedTeamsOf(m.id).includes(openTeam.id)))
                    .map(m => ({ ...m, isCoach: roleOf(m.id) === "coach" }))}
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
                <CalendarScreen sessions={rowerUpcoming} onOpen={(s) => { setOpenSession(s); setScreen("sessionRower"); }} onToggle={toggleSignup} myId={currentUserId} alertsFor={alertsFor} />
              )}
              {screen === "calendar" && role === "coach" && (
                <CalendarScreen sessions={coachUpcoming} onOpen={(s) => { setOpenSession(s); setSelectedRowerChip(null); setScreen("sessionCoach"); }} myId={currentUserId} teamName={teamName} showTeamLabel={coachScope === "club"} alertsFor={alertsFor} />
              )}
              {screen === "sessionRower" && openSession && (
                <SessionRowerScreen session={openSession} onBack={() => setScreen(role === "rower" ? "home" : "calendar")} onToggle={toggleSignup} onSendAlert={sendCantComeAlert} myAlerts={openSession ? alertsFor(openSession.id).filter(a => a.rowerId === currentUserId) : []} myId={currentUserId} nameOf={nameOf} nicknameOf={nicknameOf} sideOf={sideOf} photoOf={(id) => profilePhotos[id] || null} fleetBoats={openSession ? fleetBoatsFor(openSession.teamId) : []} boatMeasurements={boatMeasurements} />
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
                  onAddCrew={addCrew}
                  onRemoveCrew={removeCrew}
                  onSetCrewBoat={(sessionId, crew, fleetBoat) => {
                    const oars = oarsOptionsForLayout(fleetBoat.layout).includes(crew.oars) ? crew.oars : null;
                    updateCrew(sessionId, crew.id, { boat: fleetBoat.name, layout: fleetBoat.layout, oars });
                  }}
                  onSetCrewOars={(sessionId, crewId, oars) => updateCrew(sessionId, crewId, { oars })}
                  overlapFor={overlapFor}
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
                  photoOf={(id) => profilePhotos[id] || null}
                  fleetBoats={fleetBoatsFor(openSession.teamId)}
                  boatMeasurements={boatMeasurements}
                />
              )}
              {screen === "notifications" && (
                <NotificationsScreen
                  items={role === "rower" ? myNotifications : coachNotifications}
                  role={role}
                  nameOf={nameOf}
                  onOpen={(n) => openNotificationSession(n, role === "rower" ? "rower" : "coach")}
                  onMarkRead={(id) => markNotificationRead(id, role === "rower" ? "rower" : "coach")}
                  onHide={(id) => hideNotification(id, role === "rower" ? "rower" : "coach")}
                />
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
                  myFirstName={assignedUsers.find(u => u.id === currentUserId)?.firstName || ""}
                  myLastName={assignedUsers.find(u => u.id === currentUserId)?.lastName || ""}
                  myBirthDate={assignedUsers.find(u => u.id === currentUserId)?.birthDate || ""}
                  myPhone={assignedUsers.find(u => u.id === currentUserId)?.phone || ""}
                  myRowerCode={rowerCodeOf(currentUserId)}
                  myPhoto={profilePhotos[currentUserId] || null}
                  onUpdateMyPhoto={updateMyPhoto}
                  clubCode={clubCode}
                  onUpdateMyProfile={updateMyProfile}
                  clubDisplayName={clubDisplayName}
                  clubPhoto={currentClub?.photoUrl || null}
                  clubProfile={currentClub}
                  onUpdateClubProfile={updateClubProfile}
                  onUpdateClubPhoto={updateClubPhoto}
                  theme={theme}
                  onToggleTheme={setTheme}
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
                  subtitle={`Datos de gim de ${openPerson.name} · lo gestiona el propio remero desde su perfil`}
                />
              )}
              {screen === "zonasErgo" && role === "rower" && (
                <ErgoZonesScreen
                  testTime={ergoTestTimes[currentUserId] || null}
                  onSetTest={setErgoTest}
                  onBack={() => setScreen("profile")}
                />
              )}
              {screen === "notas" && role === "rower" && (
                <NotesScreen
                  notes={rowerNotes[currentUserId] || ""}
                  onSave={updateMyNotes}
                  onBack={() => setScreen("profile")}
                />
              )}
              {screen === "medidas" && role === "rower" && (
                <RowerMeasurementsScreen
                  boats={fleetBoatsFor(teamOf(currentUserId))}
                  measurements={boatMeasurements}
                  myId={currentUserId}
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

            <TabBar screen={screen} setScreen={setScreen} notifCount={role === "rower" ? myNotifications.filter(n => !n.read).length : coachNotifications.filter(n => !n.readByCoach).length} role={role} />
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
      <label style={{ fontSize: 12, color: "var(--vir-text-secondary, #ADADAD)", margin: "0 0 6px" }}>Usuario</label>
      <input value={usernameInput} onChange={e => setUsernameInput(e.target.value)} style={inputStyle} />
      <label style={{ fontSize: 12, color: "var(--vir-text-secondary, #ADADAD)", margin: "14px 0 6px" }}>Contraseña</label>
      <div style={{ position: "relative" }}>
        <Lock size={15} color="var(--vir-text-muted, #8A8A8A)" style={{ position: "absolute", left: 12, top: 12 }} />
        <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} style={{ ...inputStyle, paddingLeft: 34 }} />
      </div>
    </>
  );

  const recoveryBlock = (
    <>
      {loginError && <p style={{ color: "var(--vir-error, #FF8890)", fontSize: 11.5, margin: "8px 2px 0" }}>{loginError}</p>}
      <button className="vir-btn" onClick={() => { setShowRecovery(!showRecovery); setRecoverySent(false); }} style={{ background: "transparent", color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11.5, marginTop: 8, textDecoration: "underline", alignSelf: "flex-start" }}>
        ¿Has olvidado tu contraseña?
      </button>
      {showRecovery && (
        <div style={{ background: "var(--vir-bg-surface-alt, #3A3A3A)", border: "1px dashed var(--vir-border, #565656)", borderRadius: 10, padding: 12, marginTop: 8 }}>
          <label style={{ fontSize: 11, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 4, display: "block" }}>Correo de recuperación</label>
          <input type="email" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" style={{ ...inputStyle, padding: "8px 10px", fontSize: 12, marginBottom: 8 }} />
          <button className="vir-btn" onClick={sendRecovery} style={{ ...ghostBtn, width: "100%", padding: "8px 0", fontSize: 12 }}>Enviar enlace de recuperación</button>
          {recoverySent && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, margin: "8px 2px 0", lineHeight: 1.4 }}>Si el usuario existe, hemos enviado un enlace a su correo de recuperación.</p>}
        </div>
      )}
    </>
  );

  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [view]);

  return (
    <div ref={scrollRef} data-theme="dark" style={{
      flex: 1, display: "flex", flexDirection: "column", overflowY: "auto",
      justifyContent: (view === "menu" || view === "loginClub" || view === "loginUser") ? "center" : "flex-start",
      padding: (view === "menu" || view === "loginClub" || view === "loginUser") ? "0 28px" : "28px 28px 0",
      background: "var(--vir-bg-phone, #333333)",
    }}>
      {view === "menu" && (
        <>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 6, marginTop: 8 }}><Logo size={74} variant="dark" /></div>
          <p style={{ textAlign: "center", color: "#ADADAD", fontSize: 13, margin: "4px 0 108px", letterSpacing: 1.5, textTransform: "uppercase" }}>Club Manager</p>
        </>
      )}

      {view === "menu" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="vir-btn" onClick={() => goTo("loginUser")} style={{ ...primaryBtn, background: "#E61E29", color: "#F5F5F5", textAlign: "center", padding: "16px 16px", fontSize: 14, letterSpacing: 0.5, textTransform: "uppercase", borderRadius: 30 }}>
            Acceso usuario
          </button>

          <button className="vir-btn" onClick={() => setShowRegisterMenu(!showRegisterMenu)} style={{ ...ghostBtn, border: "1px solid #565656", color: "#E8E8E8", textAlign: "center", padding: "14px 16px", letterSpacing: 0.5, textTransform: "uppercase", borderRadius: 30 }}>
            Registro
          </button>
          {showRegisterMenu && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="vir-btn" onClick={() => goTo("registerClub")} style={{ ...ghostBtn, border: "1px solid #565656", color: "#E8E8E8", flex: 1, padding: "12px 0", fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", borderRadius: 24 }}>
                Registro de club
              </button>
              <button className="vir-btn" onClick={() => goTo("registerUser")} style={{ ...ghostBtn, border: "1px solid #565656", color: "#E8E8E8", flex: 1, padding: "12px 0", fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", borderRadius: 24 }}>
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
          <div style={{ display: "flex", justifyContent: "center", margin: "28px 0 36px" }}><Logo size={58} variant="dark" /></div>
          <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 18px" }}>Acceso club</h2>
          {usernamePasswordFields}
          {recoveryBlock}
          <button className="vir-btn" onClick={() => onLoginClub(usernameInput, passwordInput)} style={{ ...primaryBtn, marginTop: 22 }}>Entrar</button>
        </>
      )}

      {view === "loginUser" && (
        <>
          <BackRow onBack={() => goTo("menu")} />
          <div style={{ display: "flex", justifyContent: "center", margin: "28px 0 36px" }}><Logo size={58} variant="dark" /></div>
          <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 4px" }}>Acceso usuario</h2>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>Entras con el rol que el club te haya asignado (entrenador o remero).</p>
          {usernamePasswordFields}
          {recoveryBlock}
          <button className="vir-btn" onClick={() => onLoginUser(usernameInput, passwordInput)} style={{ ...primaryBtn, marginTop: 22 }}>Entrar</button>
        </>
      )}

      {view === "registerClub" && (
        <>
          <BackRow onBack={() => goTo("menu")} />
          <div style={{ display: "flex", justifyContent: "center", margin: "28px 0 36px" }}><Logo size={58} variant="dark" /></div>
          <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "var(--vir-text-primary, #F5F5F5)", margin: "0 0 4px" }}>Registro del club</h2>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "0 0 18px", lineHeight: 1.4 }}>
            Al crear la cuenta, VIRADA generará automáticamente el código de acceso de tu club. Compártelo con tus entrenadores y remeros para que puedan registrarse dentro de tu club y no de otro.
          </p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18 }}>
            <AvatarPicker photo={regPhoto} initials="?" onChange={setRegPhoto} size={72} />
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "8px 0 0" }}>Logo del club — toca para {regPhoto ? "cambiarlo" : "añadirlo"} (podrás cambiarlo luego desde el perfil)</p>
          </div>

          <FieldLabel text="Nombre del club" required filled={!!clubNameRegInput.trim()} />
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

          <FieldLabel text="Usuario del club" required filled={usernameInput.trim().length >= 3} hint="mínimo 3 caracteres" />
          <input
            value={usernameInput}
            onChange={e => { setUsernameInput(e.target.value); setUsernameTouched(true); }}
            placeholder="Ej. ADMINCRL"
            style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 4 }}
          />
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "0 0 14px", lineHeight: 1.4 }}>
            Te sugerimos "ADMIN" + las iniciales del nombre del club, pero puedes usar el que prefieras para entrar.
          </p>

          <FieldLabel text="Contraseña" required filled={passwordInput.length >= 4} hint="mínimo 4 caracteres" />
          <div style={{ position: "relative", marginBottom: 14 }}>
            <Lock size={15} color="var(--vir-text-muted, #8A8A8A)" style={{ position: "absolute", left: 12, top: 12 }} />
            <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", paddingLeft: 34 }} />
          </div>

          <FieldLabel text="Repetir contraseña" required filled={passwordRepeatInput.length >= 4 && passwordRepeatInput === passwordInput} />
          <div style={{ position: "relative" }}>
            <Lock size={15} color="var(--vir-text-muted, #8A8A8A)" style={{ position: "absolute", left: 12, top: 12 }} />
            <input type="password" value={passwordRepeatInput} onChange={e => setPasswordRepeatInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", paddingLeft: 34 }} />
          </div>

          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "22px 0 12px", borderTop: "1px solid var(--vir-border, #565656)", paddingTop: 18 }}>Datos del club</p>

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

          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "22px 0 12px", borderTop: "1px solid var(--vir-border, #565656)", paddingTop: 18 }}>Persona de contacto</p>

          <FieldLabel text="Nombre" required filled={!!contactFirstNameInput.trim()} />
          <input value={contactFirstNameInput} onChange={e => setContactFirstNameInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Apellido" required filled={!!contactLastNameInput.trim()} />
          <input value={contactLastNameInput} onChange={e => setContactLastNameInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Cargo en el club" required filled={!!contactRoleInput.trim()} />
          <input value={contactRoleInput} onChange={e => setContactRoleInput(e.target.value)} placeholder="Ej. Presidente, Secretaría, Coordinador..." style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Nº Teléfono" required={false} />
          <input type="tel" value={contactPhoneInput} onChange={e => setContactPhoneInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 4 }} />

          {loginError && <p style={{ color: "var(--vir-error, #FF8890)", fontSize: 11.5, margin: "14px 2px 0" }}>{loginError}</p>}
          <button className="vir-btn" onClick={submitRegisterClub} style={{ ...primaryBtn, marginTop: 22 }}>Registrar club</button>
        </>
      )}

      {view === "registerUser" && (
        <>
          <BackRow onBack={() => goTo("menu")} />
          <div style={{ display: "flex", justifyContent: "center", margin: "28px 0 36px" }}><Logo size={58} variant="dark" /></div>
          <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 4px" }}>Registro de usuario</h2>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>
            Con el código de tu club accedes a su paraguas de gestión. Una vez dentro, será el club quien te asigne el rol — entrenador o remero — y, si corresponde, la tripulación.
          </p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18 }}>
            <AvatarPicker photo={regPhoto} initials="?" onChange={setRegPhoto} size={72} />
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "8px 0 0" }}>Toca la foto para {regPhoto ? "cambiarla" : "añadirla"}</p>
          </div>

          <FieldLabel text="Número de club" required filled={clubCodeInput.trim().length === 3} />
          <div style={{ position: "relative", marginBottom: 14 }}>
            <KeyRound size={15} color="var(--vir-text-muted, #8A8A8A)" style={{ position: "absolute", left: 12, top: 12 }} />
            <input
              value={clubCodeInput}
              onChange={e => setClubCodeInput(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="Ej. 452"
              maxLength={3}
              inputMode="numeric"
              style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", paddingLeft: 34 }}
            />
          </div>

          <FieldLabel text="Nombre de usuario" required filled={usernameInput.trim().length >= 3} hint="mínimo 3 caracteres" />
          <input value={usernameInput} onChange={e => setUsernameInput(e.target.value)} placeholder="Acceso a la plataforma" style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Contraseña" required filled={passwordInput.length >= 4} hint="mínimo 4 caracteres" />
          <div style={{ position: "relative", marginBottom: 14 }}>
            <Lock size={15} color="var(--vir-text-muted, #8A8A8A)" style={{ position: "absolute", left: 12, top: 12 }} />
            <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", paddingLeft: 34 }} />
          </div>

          <FieldLabel text="Repetir contraseña" required filled={passwordRepeatInput.length >= 4 && passwordRepeatInput === passwordInput} />
          <div style={{ position: "relative" }}>
            <Lock size={15} color="var(--vir-text-muted, #8A8A8A)" style={{ position: "absolute", left: 12, top: 12 }} />
            <input type="password" value={passwordRepeatInput} onChange={e => setPasswordRepeatInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", paddingLeft: 34 }} />
          </div>

          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "22px 0 12px", borderTop: "1px solid var(--vir-border, #565656)", paddingTop: 18 }}>Datos personales</p>

          <FieldLabel text="Nombre" required filled={!!firstNameInput.trim()} />
          <input value={firstNameInput} onChange={e => setFirstNameInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Apellido" required filled={!!lastNameInput.trim()} />
          <input value={lastNameInput} onChange={e => setLastNameInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Apodo" required filled={!!apodoInput.trim()} hint="aparecerá en las tripulaciones" />
          <input value={apodoInput} onChange={e => setApodoInput(e.target.value)} placeholder="Aparecerá en las tripulaciones" style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Fecha de nacimiento" required filled={!!birthDateInput} />
          <input type="date" value={birthDateInput} onChange={e => setBirthDateInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Correo electrónico" required filled={!!emailInput.trim()} hint="para recuperar el acceso" />
          <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 14 }} />

          <FieldLabel text="Nº Teléfono" required={false} />
          <input type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 12px", marginBottom: 4 }} />

          <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "22px 0 12px", borderTop: "1px solid var(--vir-border, #565656)", paddingTop: 18 }}>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: 0 }}>Función en el equipo</p>
            {regSide ? <Check size={13} color="var(--vir-green, #3EA55A)" /> : <span style={{ color: "var(--vir-red, #E61E29)", fontWeight: 800, fontSize: 14 }}>*</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {REGISTER_SIDE_OPTIONS.map(({ key, label, color, letter }) => {
              const active = regSide === key;
              return (
                <button key={key} className="vir-btn" onClick={() => setRegSide(key)} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10,
                  background: active ? color : "var(--vir-bg-surface, #404040)",
                  border: `1px solid ${active ? color : "var(--vir-border, #565656)"}`,
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: active ? "rgba(0,0,0,0.2)" : "var(--vir-border, #565656)", color: active ? "#FFFFFF" : "var(--vir-text-secondary, #ADADAD)",
                    fontSize: 10, fontWeight: 800,
                  }}>{letter}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: active ? "#FFFFFF" : "var(--vir-text-primary, #E8E8E8)", textAlign: "left", lineHeight: 1.2 }}>{label}</span>
                </button>
              );
            })}
          </div>

          {loginError && (
            <p style={{ color: "var(--vir-error, #FF8890)", fontSize: 11.5, margin: "14px 2px 0" }}>{loginError}</p>
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
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24, marginTop: 24 }}><Logo size={44} variant="dark" /></div>
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
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 24, color: "var(--vir-text-primary, #F5F5F5)", margin: 0, letterSpacing: 0.4 }}>{children}</h2>
      {sub && <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12.5, margin: "3px 0 0" }}>{sub}</p>}
    </div>
  );
}

function SessionRow({ s, onOpen, right, teamLabel, semaphore, hasAlert }) {
  const dow = DAYS_ES[s.dow];
  const closedBoats = (s.crews || []).filter(c => c.status === "cerrado").map(c => c.boat);
  return (
    <div className="vir-btn" onClick={() => onOpen(s)} style={{ padding: "12px 16px", background: "#404040", border: "1px solid #565656", borderRadius: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
      {closedBoats.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #565656", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span title={hasAlert ? "Alguien se ha dado de baja — revisa la alineación" : "Todo confirmado y cerrado"} style={{ width: 8, height: 8, borderRadius: "50%", background: hasAlert ? "#E61E29" : "#3EA55A", flexShrink: 0 }} />
          <Anchor size={11} color="#8A8A8A" style={{ flexShrink: 0 }} />
          <span style={{ color: "#ADADAD", fontSize: 11 }}>{closedBoats.join(" · ")}</span>
        </div>
      )}
    </div>
  );
}

// Semáforo del remero para una sesión de agua: rojo = tripulación aún por cerrar o no convocado,
// naranja = de reserva, verde = convocado para remar
const rowerSemaphore = (s, myId) => {
  const closedCrews = (s.crews || []).filter(c => c.status === "cerrado");
  const myCrew = closedCrews.find(c => c.seats.includes(myId) || c.patron === myId || c.reserves.includes(myId) || (c.zodiac && c.zodiac.includes(myId)));
  if (closedCrews.length === 0) return { color: "#E24B4A", label: "Tripulación aún por cerrar" };
  if (!myCrew) return { color: "#E24B4A", label: "No convocado/a" };
  const isCalled = myCrew.seats.includes(myId) || myCrew.patron === myId || (myCrew.zodiac && myCrew.zodiac.includes(myId));
  if (isCalled) return { color: "#3EA55A", label: "Convocado/a para remar" };
  return { color: "#E67E22", label: "De reserva" };
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

function RowerHome({ sessions, onOpen, onToggle, notifCount, teamName, attendance, crewStats, pesosExercises, ergoTest, onNavigate, myId, myName, myTeam, alertsFor }) {
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
        { id: "testPesos", label: "Datos de gim", sub: "Registra tus marcas", icon: Anchor },
        { id: "zonasErgo", label: "Datos ergo", sub: "Registra tus ritmos", icon: RotateCw },
        { id: "medidas", label: "Medidas", sub: "A cargo del entrenador", icon: Ruler },
      ],
    },
    {
      label: "Regatas",
      tiles: [
        { id: "regattas", label: "Calendario de regatas", sub: "Fechas, dosier, horarios y resultados", icon: KeyRound },
      ],
    },
    {
      label: "Club",
      tiles: [
        { id: "recordatorios", label: "Recordatorios", sub: "Notas del club y de tu equipo", icon: Bell },
      ],
    },
  ];

  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionTitle sub={`Hola, ${myName} · ${CLUB_NAME} · ${teamName(myTeam)}`}>Tu evolución</SectionTitle>

      <div style={{ padding: "0 16px 6px" }}>
        <div style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 4px" }}>Asistencia este año</p>
              <p className="vir-mono" style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 26, fontWeight: 700, margin: 0 }}>{pct}%</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 4px" }}>Convocado / Entrenado</p>
              <p className="vir-mono" style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 15, fontWeight: 700, margin: 0 }}>{crewStats.convocado} / {crewStats.entrenado}</p>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--vir-border, #565656)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11.5, margin: 0 }}>
              {registeredExercises > 0 ? `Datos de gim: ${registeredExercises} ejercicio${registeredExercises > 1 ? "s" : ""} registrado${registeredExercises > 1 ? "s" : ""}` : "Todavía no has registrado ningún dato de gim."}
            </p>
            <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11.5, margin: 0 }}>
              {ergoTest ? `TEST 1600: ${ergoTest} W` : "Todavía no has registrado tu TEST 1600 de ergómetro."}
            </p>
          </div>
        </div>
      </div>

      {tileGroups.map(group => (
        <div key={group.label} style={{ padding: "10px 16px 4px" }}>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>{group.label}</p>
          <div style={{ display: "grid", gridTemplateColumns: group.tiles.length === 1 ? "1fr" : "1fr 1fr", gap: 10 }}>
            {group.tiles.map(t => {
              const Icon = t.icon;
              return (
                <div key={t.id} className="vir-btn" onClick={() => onNavigate(t.id)} style={{
                  aspectRatio: group.tiles.length === 1 ? "3.2" : "1", background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 14,
                  padding: 14, display: "flex", flexDirection: group.tiles.length === 1 ? "row" : "column", alignItems: group.tiles.length === 1 ? "center" : "stretch", gap: group.tiles.length === 1 ? 12 : 0, justifyContent: "space-between",
                }}>
                  <Icon size={20} color="var(--vir-red, #E61E29)" />
                  <div style={{ flex: 1 }}>
                    <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{t.label}</p>
                    <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "3px 0 0" }}>{t.sub}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ padding: "14px 16px 0" }}>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>Próximos entrenos</p>
      </div>
      <div style={{ padding: "0 16px" }}>
        {sessions.map(s => {
          const anyClosed = (s.crews || []).some(c => c.status === "cerrado");
          return (
            <SessionRow key={s.id} s={s} onOpen={onOpen} semaphore={rowerSemaphore(s, myId)} hasAlert={alertsFor(s.id).length > 0} right={
              anyClosed
                ? <Badge text={inCrew(s, myId) ? "Seleccionado" : "Cerrado"} tone={inCrew(s, myId) ? "selected" : "closed"} />
                : <Badge text={s.signups.has(myId) ? "Apuntado ✓" : "Apuntarse"} tone={s.signups.has(myId) ? "signed" : "action"} onClick={() => onToggle(s)} />
            } />
          );
        })}
      </div>
    </div>
  );
}

function CoachHome({ sessions, onOpen, scope, setScope, teams, onPlanCalendar, onTeamStats, onGymPlan, onOpenRegattas, onOpenInformes, onOpenMeasurements, onOpenFleet, onOpenReminders, coachName, teamName, showTeamLabel, alertsFor }) {
  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionTitle sub={`Hola, ${coachName} · ${CLUB_NAME}`}>Planificación de botes</SectionTitle>
      <div style={{ padding: "6px 16px 4px" }}>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>Alcance de acceso</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ScopeChip active={scope === "club"} onClick={() => setScope("club")} label="Todo el club" />
          {teams.map(t => (
            <ScopeChip key={t.id} active={scope === t.id} onClick={() => setScope(t.id)} label={t.name} />
          ))}
        </div>
      </div>
      <div style={{ padding: "4px 16px 10px" }}>
        <div className="vir-btn" onClick={onPlanCalendar} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <Waves size={20} color="var(--vir-red, #E61E29)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Entrenos de agua</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>Activa días de entreno y edita su título</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
        </div>
        <div className="vir-btn" onClick={onGymPlan} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <Dumbbell size={20} color="var(--vir-red, #E61E29)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Plan de gimnasio semanal</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>Marca los días de la semana y sube el contenido</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
        </div>
        <div className="vir-btn" onClick={onTeamStats} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <BarChart3 size={20} color="var(--vir-red, #E61E29)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Estadísticas de tripulación</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>Frecuencia, convocatorias y entrenos de agua</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
        </div>
        <div className="vir-btn" onClick={onOpenInformes} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <ClipboardList size={20} color="var(--vir-red, #E61E29)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Informes</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>Diario, semanal y mensual · exportables a PDF</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
        </div>
        <div className="vir-btn" onClick={onOpenMeasurements} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <Ruler size={20} color="var(--vir-red, #E61E29)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Medidas</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>Medidas de cada remero por bote</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
        </div>
        <div className="vir-btn" onClick={onOpenFleet} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <Sailboat size={20} color="var(--vir-red, #E61E29)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Botes</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>Crea o elimina la flota de esta tripulación</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
        </div>
        <div className="vir-btn" onClick={onOpenRegattas} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <Trophy size={20} color="var(--vir-red, #E61E29)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Calendario de regatas</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>Fechas, dosieres, horarios y resultados</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
        </div>
        <div className="vir-btn" onClick={onOpenReminders} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
          <StickyNote size={20} color="var(--vir-red, #E61E29)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Recordatorios</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>Nota fija para tu equipo, y avisos puntuales</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
        </div>
      </div>
      <div style={{ padding: "10px 16px" }}>
        {sessions.length === 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13 }}>Esta tripulación no tiene entrenos activos próximamente.</p>}
        {sessions.map(s => {
          const allClosed = s.crews.length > 0 && s.crews.every(c => c.status === "cerrado");
          const totalFilled = s.crews.reduce((sum, c) => sum + seatFill(c), 0);
          return (
            <SessionRow key={s.id} s={s} onOpen={onOpen} teamLabel={showTeamLabel ? teamName(s.teamId) : null} hasAlert={alertsFor(s.id).length > 0} right={
              allClosed ? <Badge text="Cerrado" tone="closed" />
                : <Badge text={`${s.signups.size} apuntados · ${totalFilled} asig.`} tone={s.crews.length > 0 ? "selected" : "open"} />
            } />
          );
        })}
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
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Estadísticas de tripulación</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "0 0 16px" }}>Alcance: {scope === "club" ? "todo el club" : teamName(scope)}{scope !== "club" ? ` · ${scopeTotalPastActive} entrenos de agua realizados` : ""}</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <StatCard label="Convocatorias totales" value={aggregate.convocado} />
        <StatCard label="Entrenados en total" value={aggregate.entrenado} />
        <StatCard label="Asistencia media" value={`${avgFreq}%`} />
      </div>

      {people.length === 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13 }}>No hay remeros en este alcance.</p>}

      {groups.map(g => (
        <div key={g.id} style={{ marginBottom: 18 }}>
          {scope === "club" && (
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>{g.label} · {g.total} entrenos de agua realizados</p>
          )}
          {g.members.map(p => {
            const s = statsFor(p.id);
            const freq = g.total > 0 ? Math.round((s.entrenado / g.total) * 100) : 0;
            return (
              <div key={p.id} className="vir-btn" onClick={() => onOpenPerson(p)} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{p.name}</p>
                    {p.nickname && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "2px 0 0" }}>"{p.nickname}"</p>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="vir-mono" style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 16, fontWeight: 700 }}>{freq}%</span>
                    <ChevronRight size={16} color="var(--vir-text-muted, #8A8A8A)" />
                  </div>
                </div>
                <div style={{ height: 5, background: "var(--vir-border, #565656)", borderRadius: 3, marginBottom: 10, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${freq}%`, background: "var(--vir-red, #E61E29)", borderRadius: 3 }} />
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <span style={{ fontSize: 11.5, color: "var(--vir-text-secondary, #ADADAD)" }}>Convocado al entreno de agua: <span className="vir-mono" style={{ color: "var(--vir-text-primary, #F5F5F5)" }}>{s.convocado}</span></span>
                  <span style={{ fontSize: 11.5, color: "var(--vir-text-secondary, #ADADAD)" }}>Entrenado agua: <span className="vir-mono" style={{ color: "var(--vir-text-primary, #F5F5F5)" }}>{s.entrenado}</span></span>
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
        <div style={{ width: 52, height: 52, borderRadius: 26, background: "var(--vir-bg-surface-alt, #454545)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--vir-red, #E61E29)", fontWeight: 700, fontSize: 18, fontFamily: "'Big Shoulders Display', sans-serif" }}>
          {person.name.split(" ").map(n => n[0]).join("")}
        </div>
        <div>
          <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontWeight: 700, fontSize: 16, margin: 0 }}>{person.name}</p>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, margin: "3px 0 0" }}>
            {person.nickname ? `"${person.nickname}" · ` : ""}{teamName(teamId)}
          </p>
        </div>
      </div>

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Entrenos de agua</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <StatCard label="Convocado" value={s.convocado} />
        <StatCard label="Entrenado" value={s.entrenado} />
        <StatCard label="Frecuencia" value={`${freq}%`} />
      </div>
      <div style={{ height: 6, background: "var(--vir-border, #565656)", borderRadius: 3, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${freq}%`, background: "var(--vir-red, #E61E29)", borderRadius: 3 }} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <AttendanceCard label={`Agua · semana ${currentWeek}`} attended={waterWeekMonth.weekDone} total={waterWeekMonth.weekTotal} />
        <AttendanceCard label="Agua · este mes" attended={waterWeekMonth.monthDone} total={waterWeekMonth.monthTotal} />
      </div>

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Entrenos de gim · check semanal</p>
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
            <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11, margin: "0 0 6px" }}>Semana {week}{week === currentWeek ? " · actual" : ""}</p>
            {items.map(slot => {
              const record = recordFor(teamId, week, slot);
              const done = !!(record && record.done);
              return (
                <div key={slot} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--vir-bg-surface, #404040)", border: `1px solid ${done ? "var(--vir-green, #3EA55A)" : "var(--vir-border, #565656)"}`, borderRadius: 10, padding: "9px 12px", marginBottom: 6 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: done ? "var(--vir-green, #3EA55A)" : "var(--vir-border, #565656)",
                  }}>
                    {done && <Check size={13} color="#FFFFFF" />}
                  </div>
                  <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5, margin: 0, flex: 1 }}>{FISICO_LABELS[slot]}</p>
                  {done && record.photos && record.photos.length > 0 && (
                    <div style={{ display: "flex", gap: 3 }}>
                      {record.photos.slice(0, 3).map((p, i) => (
                        p.kind === "pdf" ? (
                          <div key={i} onClick={() => window.open(p.dataUrl, "_blank")} style={{ width: 30, height: 30, borderRadius: 6, background: "var(--vir-bg-surface-alt, #333333)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                            <KeyRound size={13} color="var(--vir-text-secondary, #ADADAD)" />
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
                      {record.photos.length > 3 && <span style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10, alignSelf: "center" }}>+{record.photos.length - 3}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {weeks.every(week => FISICO_SLOTS.every(slot => !weekPlanFor(teamId, week)[slot])) && (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5 }}>Todavía no hay plan de gimnasio subido para esta tripulación.</p>
      )}

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "22px 0 10px" }}>Datos de gim y datos ergo</p>
      {hasGymLogs ? (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <StatCard label="Ejercicios con marca" value={registeredExercises} />
            <StatCard label="TEST 1600" value={ergoTest ? `${ergoTest} W` : "—"} />
          </div>
        </>
      ) : (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
          Todavía no hay ningún registro de pesos ni de ergo para este remero.
        </p>
      )}
      <button className="vir-btn" onClick={onOpenPesos} style={{ ...primaryBtn, padding: "11px 0", fontSize: 12.5 }}>
        Ver Datos de gim
      </button>
    </div>
  );
}

function ClubHome({ teams, onManageTeams, onManageUsers, onOpenRegattas, onOpenReminders, clubDisplayName, clubCode, coachCount, rowerCount }) {
  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionTitle sub={`Hola, ${clubDisplayName}`}>Panel del club</SectionTitle>
      <div style={{ padding: "10px 16px" }}>
        <div style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 6px" }}>Número de club</p>
          <p className="vir-mono" style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: 1 }}>{clubCode}</p>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "8px 0 0", lineHeight: 1.4 }}>
            Se generó automáticamente al crear la cuenta. Compártelo con tus entrenadores para que accedan a sus tripulaciones, y úsalo también para volver a entrar como club desde la pantalla de inicio.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <StatCard label="Tripulaciones" value={teams.length} />
          <StatCard label="Entrenadores" value={coachCount} />
          <StatCard label="Remeros" value={rowerCount} />
        </div>

        <div className="vir-btn" onClick={onManageUsers} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Usuarios del club</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>Filtra por categoría, asigna tripulaciones y cambia roles</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
        </div>

        <div className="vir-btn" onClick={onManageTeams} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Tripulaciones y categorías</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>{teams.map(t => t.name).join(" · ")}</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
        </div>

        <div className="vir-btn" onClick={onOpenRegattas} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <Trophy size={20} color="var(--vir-red, #E61E29)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Calendario de regatas</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>Fechas, dosieres, horarios y resultados</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
        </div>

        <div className="vir-btn" onClick={onOpenReminders} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
          <StickyNote size={20} color="var(--vir-red, #E61E29)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Recordatorios</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>Nota fija para todos, y avisos puntuales</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ flex: 1, background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
      <p className="vir-mono" style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 20, fontWeight: 700, margin: 0 }}>{value}</p>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "4px 0 0" }}>{label}</p>
    </div>
  );
}

function AdminHome({ onOpenRegattas, onOpenUsers, onOpenTeams, onOpenWater, onOpenGym, onOpenStats, onOpenInformes, onOpenMeasurements, onOpenFleet, onOpenReminders, clubCode, clubDisplayName, teamsCount, coachCount, rowerCount, clubs, currentClubId, onSwitchClub, onDeleteClub }) {
  const [deletingId, setDeletingId] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const links = [
    { label: "Usuarios", sub: "Todos los entrenadores y remeros de este club, sin restricción", onClick: onOpenUsers },
    { label: "Tripulaciones", sub: "Crear, eliminar y ver el detalle de cada una", onClick: onOpenTeams },
    { label: "Entrenos de agua", sub: "Calendario, bote/rems y alineaciones de cualquier tripulación", onClick: onOpenWater },
    { label: "Plan de gimnasio", sub: "Ver y editar las 5 sesiones semanales de cualquier tripulación", onClick: onOpenGym },
    { label: "Estadísticas de tripulación", sub: "Convocatorias, asistencia y ficha de cada remero", onClick: onOpenStats },
    { label: "Informes", sub: "Diario, semanal y mensual de cualquier tripulación", onClick: onOpenInformes },
    { label: "Medidas", sub: "Medidas de cada remero por bote, de cualquier tripulación", onClick: onOpenMeasurements },
    { label: "Botes", sub: "Flota de botes de cualquier tripulación", onClick: onOpenFleet },
    { label: "Recordatorios", sub: "Nota fija del club y avisos puntuales", onClick: onOpenReminders },
    { label: "Calendario de regatas", sub: "Añade o quita días, dosieres, horarios y resultados (compartido entre todos los clubes)", onClick: onOpenRegattas },
  ];

  if (!currentClubId) {
    return (
      <div style={{ paddingBottom: 20 }}>
        <SectionTitle sub="Control abierto de todos los aspectos de la aplicación">Panel de administración</SectionTitle>
        <div style={{ padding: "10px 16px" }}>
          <div style={{ background: "var(--vir-danger-bg, #402226)", border: "1px solid var(--vir-red, #E61E29)", borderRadius: 14, padding: 16, marginBottom: 18 }}>
            <p style={{ color: "var(--vir-error, #FF8890)", fontSize: 11.5, fontWeight: 700, margin: "0 0 6px" }}>Acceso de soporte y administración</p>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
              VIRADA está pensada para dar servicio a varios clubes a la vez, cada uno con su propio código de acceso y su estructura de entrenadores y remeros, completamente independiente del resto. Elige un club para entrar en su estructura.
            </p>
          </div>

          <StatCard label="Clubes dados de alta en esta sesión" value={clubs.length} />

          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "18px 0 10px" }}>Clubes</p>
          {clubs.length === 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13 }}>Todavía no se ha registrado ningún club en esta sesión.</p>}
          {clubs.map(c => (
            <div key={c.id} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", marginBottom: 10 }}>
              <div className="vir-btn" onClick={() => onSwitchClub(c.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{c.name}</p>
                  <p className="vir-mono" style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>Código {c.code}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    className="vir-btn"
                    onClick={(e) => { e.stopPropagation(); setDeletingId(deletingId === c.id ? null : c.id); setConfirmText(""); }}
                    style={{ background: "transparent", color: "var(--vir-text-muted, #8A8A8A)", padding: 4 }}
                    title="Eliminar club"
                  >
                    <X size={16} />
                  </button>
                  <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
                </div>
              </div>

              {deletingId === c.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--vir-border, #565656)" }}>
                  <p style={{ color: "var(--vir-error, #FF8890)", fontSize: 12, fontWeight: 700, margin: "0 0 6px" }}>⚠ Esto elimina el club por completo</p>
                  <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11.5, lineHeight: 1.5, margin: "0 0 12px" }}>
                    Se borrarán para siempre el club "{c.name}", todos sus usuarios, tripulaciones, entrenos de agua y plan de gimnasio. No se puede deshacer.
                  </p>
                  <label style={{ fontSize: 11.5, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 6, display: "block" }}>
                    Escribe <span style={{ color: "var(--vir-text-primary, #F5F5F5)", fontWeight: 700 }}>{c.name}</span> para confirmar
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
                        flex: 1, background: confirmText === c.name ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)", color: "var(--vir-text-primary, #F5F5F5)",
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
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: 0 }}>Explorando: <span style={{ color: "var(--vir-text-primary, #F5F5F5)", fontWeight: 600 }}>{clubDisplayName}</span></p>
          <button className="vir-btn" onClick={() => onSwitchClub(null)} style={{ background: "transparent", color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11, textDecoration: "underline" }}>Cambiar de club</button>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <StatCard label="Clubes en total" value={clubs.length} />
          <StatCard label="Tripulaciones" value={teamsCount} />
          <StatCard label="Entrenadores" value={coachCount} />
          <StatCard label="Remeros" value={rowerCount} />
        </div>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "0 0 18px", lineHeight: 1.4 }}>
          Club: {clubDisplayName} (código {clubCode}).
        </p>

        {links.map(l => (
          <div key={l.label} className="vir-btn" onClick={l.onClick} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{l.label}</p>
              <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>{l.sub}</p>
            </div>
            <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
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
      if (roleOf(p.id) === "coach") {
        if (!managedTeamsOf(p.id).includes(filter)) return false; // solo se muestra si gestiona esta tripulación
      } else if (teamOf(p.id) !== filter) {
        return false;
      }
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
  const rowerCount = members.filter(m => !m.isCoach).length;
  const coachCount = members.filter(m => m.isCoach).length;
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>{team.name}</h2>
      <p className="vir-mono" style={{ color: "#E61E29", fontSize: 13, margin: "0 0 4px" }}>{team.code}</p>
      <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "0 0 16px" }}>
        {rowerCount} remero{rowerCount === 1 ? "" : "s"}{coachCount > 0 ? ` · ${coachCount} entrenador${coachCount === 1 ? "" : "es"}` : ""}
      </p>

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
        <p style={{ color: "#8A8A8A", fontSize: 13 }}>Todavía no hay nadie asignado a esta tripulación.</p>
      )}
      {members.map(m => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <div>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{m.name}</p>
            {m.nickname && <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "2px 0 0" }}>"{m.nickname}"</p>}
          </div>
          {m.isCoach ? (
            <span style={{ color: "#E67E22", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", border: "1px solid #E67E22", borderRadius: 8, padding: "3px 8px" }}>Entrenador</span>
          ) : m.side && <SideBadge side={m.side} />}
        </div>
      ))}
    </div>
  );
}

function MeasurementRow({ m, value, editable, onSetValue }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(value || "");
  const meta = SIDE_META[m.side] || null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
      <span style={{
        width: 14, height: 14, borderRadius: 4, flexShrink: 0,
        background: meta ? meta.color : "#565656",
      }} />
      <p style={{ color: "#ADADAD", fontSize: 11.5, margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nickname || m.name}</p>
      {editing ? (
        <>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            autoFocus
            style={{ ...inputStyle, padding: "5px 6px", fontSize: 12, width: 56 }}
          />
          <button className="vir-btn" onClick={() => { onSetValue(m.id, input); setEditing(false); }} style={{ background: "#3EA55A", color: "#FFFFFF", borderRadius: 6, padding: "5px 7px", flexShrink: 0 }}>
            <Check size={12} />
          </button>
        </>
      ) : (
        <>
          <span className="vir-mono" style={{ color: value ? "#F5F5F5" : "#6E6E6E", fontSize: 11.5, minWidth: 26, textAlign: "right" }}>{value || "—"}</span>
          {editable && (
            <button className="vir-btn" onClick={() => { setInput(value || ""); setEditing(true); }} style={{ background: "transparent", color: "#8A8A8A", padding: "4px 5px", flexShrink: 0 }}>
              <Pencil size={12} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function MeasurementBoatCard({ boat, members, measurements, editable, onSetValue }) {
  const [expanded, setExpanded] = useState(false);
  const values = measurements[boat.id] || {};

  // Babor a la izquierda, estribor a la derecha; quien rema a ambos lados (naranja) se reparte
  // hacia el lado que en ese momento tenga menos remeros, para compensar las dos columnas
  const babor = [], estribor = [];
  members.forEach(m => {
    if (m.side === "babor") babor.push(m);
    else if (m.side === "estribor") estribor.push(m);
    else if (m.side === "ambos") (babor.length <= estribor.length ? babor : estribor).push(m);
    else babor.push(m); // patrón u otros: se listan igualmente, por defecto a la izquierda
  });

  return (
    <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p className="vir-btn" onClick={() => setExpanded(!expanded)} style={{ color: "#F5F5F5", fontSize: 12.5, fontWeight: 700, margin: 0, flex: 1, cursor: "pointer" }}>
          {boat.name} <span style={{ color: "#8A8A8A", fontSize: 10 }}>{expanded ? "▲" : "▼"}</span>
        </p>
        <span style={{ color: "#8A8A8A", fontSize: 9.5 }}>{layoutMeta(boat.layout).label}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 10 }}>
          {members.length === 0 ? (
            <p style={{ color: "#8A8A8A", fontSize: 12 }}>Sin remeros en esta tripulación.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <p style={{ color: "#E61E29", fontSize: 9.5, textTransform: "uppercase", fontWeight: 700, margin: "0 0 6px" }}>Babor</p>
                {babor.map(m => (
                  <MeasurementRow key={m.id} m={m} value={values[m.id]} editable={editable} onSetValue={(id, v) => onSetValue(boat.id, id, v)} />
                ))}
              </div>
              <div>
                <p style={{ color: "#3EA55A", fontSize: 9.5, textTransform: "uppercase", fontWeight: 700, margin: "0 0 6px" }}>Estribor</p>
                {estribor.map(m => (
                  <MeasurementRow key={m.id} m={m} value={values[m.id]} editable={editable} onSetValue={(id, v) => onSetValue(boat.id, id, v)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Compone y programa un aviso puntual; se reutiliza en el club y en el entrenador
function BroadcastComposer({ onSend, audienceOptions }) {
  const [text, setText] = useState("");
  const [audience, setAudience] = useState(audienceOptions ? audienceOptions[0].id : "all");
  const [scheduling, setScheduling] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [timeInput, setTimeInput] = useState("");

  const scheduledFor = () => {
    if (!scheduling || !dateInput || !timeInput) return null;
    return new Date(`${dateInput}T${timeInput}:00`).toISOString();
  };
  const canSend = text.trim().length > 0 && (!scheduling || (dateInput && timeInput));

  const submit = () => {
    onSend({ audience: audienceOptions ? audience : undefined, text: text.trim(), scheduledFor: scheduledFor() });
    setText(""); setScheduling(false); setDateInput(""); setTimeInput("");
  };

  return (
    <div style={{ background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 12, padding: 14, marginBottom: 20 }}>
      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Enviar un aviso</p>
      <textarea
        value={text} onChange={e => setText(e.target.value)}
        placeholder="Escribe el aviso..." rows={3}
        style={{ ...inputStyle, fontSize: 16, padding: "11px", width: "100%", resize: "vertical", marginBottom: 10 }}
      />
      {audienceOptions && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {audienceOptions.map(a => {
            const active = audience === a.id;
            return (
              <button key={a.id} className="vir-btn" onClick={() => setAudience(a.id)} style={{
                flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 11.5, fontWeight: active ? 700 : 400,
                background: active ? "#E61E29" : "#404040", border: `1px solid ${active ? "#E61E29" : "#565656"}`, color: "#F5F5F5",
              }}>{a.label}</button>
            );
          })}
        </div>
      )}
      <button className="vir-btn" onClick={() => setScheduling(!scheduling)} style={{ background: "transparent", color: "#ADADAD", fontSize: 11.5, textDecoration: "underline", marginBottom: scheduling ? 10 : 12, display: "block" }}>
        {scheduling ? "Cancelar programación — enviar ahora" : "Programar para más adelante"}
      </button>
      {scheduling && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input type="date" value={dateInput} onChange={e => setDateInput(e.target.value)} style={{ ...inputStyle, fontSize: 15, padding: "10px", flex: 1 }} />
          <input type="time" value={timeInput} onChange={e => setTimeInput(e.target.value)} style={{ ...inputStyle, fontSize: 15, padding: "10px", flex: 1 }} />
        </div>
      )}
      <button className="vir-btn" disabled={!canSend} onClick={submit} style={{ ...primaryBtn, padding: "11px 0", fontSize: 13, opacity: canSend ? 1 : 0.4 }}>
        {scheduling ? "Programar aviso" : "Enviar ahora"}
      </button>
    </div>
  );
}

function BroadcastLog({ items }) {
  if (items.length === 0) return <p style={{ color: "#8A8A8A", fontSize: 12.5 }}>Todavía no se ha enviado ningún aviso.</p>;
  const fmt = (iso) => new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <>
      {items.map(b => (
        <div key={b.id} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <p style={{ color: "#F5F5F5", fontSize: 12.5, margin: "0 0 6px", lineHeight: 1.4 }}>{b.text}</p>
          <p style={{ color: b.sentAt ? "#8A8A8A" : "#E67E22", fontSize: 10.5, margin: 0 }}>
            {b.sentAt ? `Enviado · ${fmt(b.sentAt)}` : `Programado para ${fmt(b.scheduledFor)}`}
          </p>
        </div>
      ))}
    </>
  );
}

function ClubRemindersScreen({ note, onSaveNote, onRemoveNote, broadcasts, onSend, onBack }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(note?.text || "");
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Recordatorios</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>La nota se ve fija para todos — entrenadores y remeros. Los avisos se mandan como notificación.</p>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Nota fija del club</p>
      {editing ? (
        <div style={{ marginBottom: 20 }}>
          <RichTextEditor value={input} onChange={setInput} rows={3} placeholder="Ej. Recordad traer el chaleco los sábados" />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="vir-btn" onClick={() => { onSaveNote(input.trim()); setEditing(false); }} style={{ ...primaryBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Guardar</button>
            <button className="vir-btn" onClick={() => { setInput(note?.text || ""); setEditing(false); }} style={{ ...ghostBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
          {note ? (
            <>
              <RichText text={note.text} style={{ color: "#F5F5F5", fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.4 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="vir-btn" onClick={() => { setInput(note.text); setEditing(true); }} style={{ background: "transparent", color: "#ADADAD", fontSize: 11.5, textDecoration: "underline" }}>Editar</button>
                <button className="vir-btn" onClick={() => { if (window.confirm("¿Quitar la nota fija del club?")) onRemoveNote(); }} style={{ background: "transparent", color: "#FF8890", fontSize: 11.5, textDecoration: "underline" }}>Eliminar</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 10px" }}>Todavía no hay ninguna nota fija.</p>
              <button className="vir-btn" onClick={() => { setInput(""); setEditing(true); }} style={{ background: "transparent", color: "#E61E29", fontSize: 12, fontWeight: 600 }}>+ Añadir nota</button>
            </>
          )}
        </div>
      )}

      <BroadcastComposer
        audienceOptions={[{ id: "all", label: "Todos" }, { id: "coaches", label: "Entrenadores" }, { id: "rowers", label: "Remeros" }]}
        onSend={onSend}
      />

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Avisos del club</p>
      <BroadcastLog items={broadcasts} />
    </div>
  );
}

function CoachRemindersScreen({ teamId, teams, setScope, note, onSaveNote, onRemoveNote, broadcasts, onSend, editable, onBack }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(note?.text || "");

  if (teamId === "club") {
    return (
      <div style={{ padding: "16px 20px 28px" }}>
        <BackRow onBack={onBack} />
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Recordatorios</h2>
        <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>Elige una tripulación para gestionar sus recordatorios.</p>
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

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Recordatorios</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
        Tripulación: <span style={{ color: "#E61E29", fontWeight: 600 }}>{teamLabel}</span> — visible solo a sus remeros
      </p>
      {!editable && (
        <p style={{ color: "#E67E22", fontSize: 12, margin: "0 0 16px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Nota fija del equipo</p>
      {editing ? (
        <div style={{ marginBottom: 20 }}>
          <RichTextEditor value={input} onChange={setInput} rows={3} placeholder="Ej. Este sábado entreno a las 8h en vez de las 9h" />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="vir-btn" onClick={() => { onSaveNote(input.trim()); setEditing(false); }} style={{ ...primaryBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Guardar</button>
            <button className="vir-btn" onClick={() => { setInput(note?.text || ""); setEditing(false); }} style={{ ...ghostBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
          {note ? (
            <>
              <RichText text={note.text} style={{ color: "#F5F5F5", fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.4 }} />
              {editable && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="vir-btn" onClick={() => { setInput(note.text); setEditing(true); }} style={{ background: "transparent", color: "#ADADAD", fontSize: 11.5, textDecoration: "underline" }}>Editar</button>
                  <button className="vir-btn" onClick={() => { if (window.confirm("¿Quitar la nota fija del equipo?")) onRemoveNote(); }} style={{ background: "transparent", color: "#FF8890", fontSize: 11.5, textDecoration: "underline" }}>Eliminar</button>
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: editable ? "0 0 10px" : 0 }}>Todavía no hay ninguna nota fija.</p>
              {editable && <button className="vir-btn" onClick={() => { setInput(""); setEditing(true); }} style={{ background: "transparent", color: "#E61E29", fontSize: 12, fontWeight: 600 }}>+ Añadir nota</button>}
            </>
          )}
        </div>
      )}

      {editable && <BroadcastComposer onSend={onSend} />}

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Avisos de este equipo</p>
      <BroadcastLog items={broadcasts} />
    </div>
  );
}

function RowerRemindersScreen({ clubNote, teamNote, onBack }) {
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Recordatorios</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 20px", lineHeight: 1.4 }}>🔒 Solo consulta — las gestionan el club y tu entrenador.</p>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Del club</p>
      <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
        {clubNote ? <RichText text={clubNote.text} style={{ color: "#F5F5F5", fontSize: 12.5, margin: 0, lineHeight: 1.4 }} /> : <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: 0 }}>Sin nota del club por ahora.</p>}
      </div>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>De tu equipo</p>
      <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px" }}>
        {teamNote ? <RichText text={teamNote.text} style={{ color: "#F5F5F5", fontSize: 12.5, margin: 0, lineHeight: 1.4 }} /> : <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: 0 }}>Sin nota de tu equipo por ahora.</p>}
      </div>
    </div>
  );
}

function CoachFleetScreen({ teamId, teams, setScope, boats, sessions, editable, onAddBoat, onRemoveBoat, onBack }) {
  const [newName, setNewName] = useState("");
  const [newLayout, setNewLayout] = useState(LAYOUTS[0].id);

  if (teamId === "club") {
    return (
      <div style={{ padding: "16px 20px 28px" }}>
        <BackRow onBack={onBack} />
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Botes</h2>
        <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>Elige una tripulación para gestionar su flota de botes.</p>
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
  // Un bote no se puede eliminar si está siendo usado en algún entreno (para no dejar tripulaciones huérfanas)
  const boatInUse = (boatName) => sessions.some(s => (s.crews || []).some(c => c.boat === boatName));

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Botes</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
        Tripulación: <span style={{ color: "#E61E29", fontWeight: 600 }}>{teamLabel}</span> · esta flota se usa tanto al montar los entrenos de agua como en Medidas
      </p>
      {!editable && (
        <p style={{ color: "#E67E22", fontSize: 12, margin: "0 0 16px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}

      {boats.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 13, marginBottom: 14 }}>Todavía no hay ningún bote en la flota.</p>}
      {boats.map(b => (
        <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <div>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{b.name}</p>
            <p style={{ color: "#8A8A8A", fontSize: 11, margin: "3px 0 0" }}>{layoutMeta(b.layout).label}</p>
          </div>
          {editable && (
            <button
              className="vir-btn"
              onClick={() => {
                const inUse = boatInUse(b.name);
                const msg = inUse
                  ? `"${b.name}" ya se ha usado en algún entreno de agua. Si lo eliminas, esos entrenos conservarán su alineación, pero no podrás volver a seleccionar este bote. ¿Eliminarlo igualmente?`
                  : `¿Eliminar el bote "${b.name}" de la flota?`;
                if (window.confirm(msg)) onRemoveBoat(b.id);
              }}
              style={{ background: "transparent", color: "#8A8A8A", padding: 6 }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      ))}

      {editable && (
        <div style={{ background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 12, padding: 14, marginTop: 6 }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Añadir bote</p>
          <label style={{ fontSize: 12, color: "#ADADAD", marginBottom: 6, display: "block" }}>Nombre del bote</label>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej. Alarona" style={{ ...inputStyle, padding: "11px", fontSize: 16, width: "100%", marginBottom: 12 }} />

          <label style={{ fontSize: 12, color: "#ADADAD", marginBottom: 6, display: "block" }}>Disposición de la tripulación</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {LAYOUTS.map(l => {
              const active = newLayout === l.id;
              return (
                <button key={l.id} className="vir-btn" onClick={() => setNewLayout(l.id)} style={{
                  textAlign: "left", padding: "10px 12px", borderRadius: 10, fontSize: 12.5, fontWeight: active ? 700 : 400,
                  background: active ? "#E61E29" : "#404040",
                  border: `1px solid ${active ? "#E61E29" : "#565656"}`,
                  color: "#F5F5F5",
                }}>{l.label}</button>
              );
            })}
          </div>

          <button className="vir-btn" onClick={() => { if (newName.trim()) { onAddBoat(teamId, newName.trim(), newLayout); setNewName(""); setNewLayout(LAYOUTS[0].id); } }} style={{ ...primaryBtn, padding: "11px 0", fontSize: 13 }}>Añadir a la flota</button>
        </div>
      )}
    </div>
  );
}

function CoachMeasurementsScreen({ teamId, teams, setScope, boats, members, measurements, editable, onSetValue, onBack }) {
  if (teamId === "club") {
    return (
      <div style={{ padding: "16px 20px 28px" }}>
        <BackRow onBack={onBack} />
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Medidas</h2>
        <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>Elige una tripulación para gestionar sus medidas.</p>
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

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Medidas</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
        Tripulación: <span style={{ color: "#E61E29", fontWeight: 600 }}>{teamLabel}</span>
      </p>
      {!editable && (
        <p style={{ color: "#E67E22", fontSize: 12, margin: "0 0 16px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}

      {boats.length === 0 ? (
        <p style={{ color: "#8A8A8A", fontSize: 13, marginBottom: 14 }}>
          Todavía no hay ningún bote en la flota de esta tripulación. Añádelos desde "Botes" en el inicio.
        </p>
      ) : (
        boats.map(b => (
          <MeasurementBoatCard key={b.id} boat={b} members={members} measurements={measurements} editable={editable} onSetValue={onSetValue} />
        ))
      )}
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
    const swam = !!(s && s.active && inCrew(s, rower.id));
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
            {(() => {
              const gymDayRows = members.map(m => dayRow(m, day)).filter(r => r.isGymDay);
              if (gymDayRows.length === 0) return null;
              const gymDone = gymDayRows.filter(r => r.gymDone).length;
              return (
                <p style={{ fontSize: 11.5, margin: "0 0 16px" }}>
                  Gimnasio: <strong>{gymDone}</strong> hecho{gymDone === 1 ? "" : "s"} · <strong>{gymDayRows.length - gymDone}</strong> pendiente{gymDayRows.length - gymDone === 1 ? "" : "s"}
                </p>
              );
            })()}
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
                  const closedCrews = s ? s.crews.filter(c => c.status === "cerrado") : [];
                  const crewText = closedCrews.map(c => {
                    const names = members.filter(m => [...c.seats, c.patron, ...c.reserves, ...c.zodiac].includes(m.id)).map(m => m.nickname || m.name);
                    return `${c.boat}: ${names.length > 0 ? names.join(", ") : "—"}`;
                  }).join(" · ");
                  return (
                    <tr key={d.toISOString()} style={{ borderBottom: "1px solid #DDD" }}>
                      <td style={{ padding: "4px 6px" }}>{DAYS_ES[d.getDay()]} {d.getDate()}</td>
                      <td style={{ padding: "4px 6px" }}>{!s || !s.active ? "Sin entreno" : (s.crews.length > 0 && s.crews.every(c => c.status === "cerrado")) ? "Cerrado" : "Abierto"}</td>
                      <td style={{ padding: "4px 6px" }}>{crewText || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Gimnasio — días de esta semana: {weekActiveDays.map(d => WEEK_DAY_LABELS[d]).join(", ") || "ninguno"}</h3>
            {(() => {
              const totalPossible = members.length * weekActiveDays.length;
              const doneEntries = [];
              members.forEach(m => {
                weekActiveDays.forEach(d => {
                  const r = gymRecordFor(m.id, teamId, week, d);
                  if (r && r.done) doneEntries.push({ member: m, day: d, photos: r.photos || [] });
                });
              });
              const totalDone = doneEntries.length;
              const totalMissing = totalPossible - totalDone;
              return (
                <>
                  <p style={{ fontSize: 11.5, margin: "0 0 12px" }}>
                    <strong>{totalDone}</strong> entreno{totalDone === 1 ? "" : "s"} hecho{totalDone === 1 ? "" : "s"} · <strong>{totalMissing}</strong> pendiente{totalMissing === 1 ? "" : "s"} de {totalPossible} posibles
                  </p>
                  {doneEntries.length === 0 ? (
                    <p style={{ fontSize: 11.5, color: "#666" }}>Nadie ha completado ningún entreno de gimnasio esta semana todavía.</p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #999" }}>
                          <th style={{ textAlign: "left", padding: "4px 6px" }}>Remero/a</th>
                          <th style={{ textAlign: "left", padding: "4px 6px" }}>Día</th>
                          <th style={{ textAlign: "left", padding: "4px 6px" }}>Fotos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doneEntries.map((e, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #DDD" }}>
                            <td style={{ padding: "4px 6px" }}>{e.member.nickname || e.member.name}</td>
                            <td style={{ padding: "4px 6px" }}>{WEEK_DAY_LABELS[e.day]}</td>
                            <td style={{ padding: "4px 6px" }}>
                              {e.photos.length === 0 ? "—" : (
                                <div style={{ display: "flex", gap: 4 }}>
                                  {e.photos.map((p, pi) => p.kind === "pdf" ? (
                                    <span key={pi} onClick={() => window.open(p.dataUrl, "_blank")} style={{ textDecoration: "underline", cursor: "pointer" }}>PDF</span>
                                  ) : (
                                    <img key={pi} src={p.dataUrl} onClick={() => onViewPhoto(p.dataUrl, `${e.member.nickname || e.member.name} · ${WEEK_DAY_LABELS[e.day]}`)} alt="" style={{ width: 26, height: 26, borderRadius: 5, objectFit: "cover", cursor: "pointer" }} />
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              );
            })()}
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
            El % de compromiso combina a partes iguales la asistencia a agua y la constancia en gimnasio.
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
                <td style={{ padding: "4px 6px" }}>{s.crews.length > 0 ? s.crews.map(c => `${c.boat}${c.oars ? " · " + c.oars : ""}`).join(", ") : "—"}</td>
                <td style={{ padding: "4px 6px" }}>{s.active ? (s.crews.length === 0 ? "Sin botes" : s.crews.every(c => c.status === "cerrado") ? "Cerrado" : "Abierto") : "Suspendido"}</td>
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
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Entrenos de agua</h2>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
          Cada tripulación sale al agua en días y horas distintos. Elige una tripulación para planificar su calendario.
        </p>
        {teams.map(t => (
          <div key={t.id} className="vir-btn" onClick={() => setScope(t.id)} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.name}</p>
            <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
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
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Entrenos de agua</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 4px", lineHeight: 1.4 }}>
        Tripulación: <span style={{ color: "var(--vir-red, #E61E29)", fontWeight: 600 }}>{teamLabel}</span>
      </p>
      {editable ? (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
          Activa o desactiva cada día, ajusta su hora, el título y el bote/rems. Por defecto: "{DEFAULT_SESSION_TITLE}".
        </p>
      ) : (
        <p style={{ color: "var(--vir-orange, #E67E22)", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}
      {Object.entries(weeks).map(([label, items]) => (
        <div key={label}>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, margin: "12px 4px 8px" }}>{label}</p>
          {items.map(s => {
            const clashes = (s.crews || []).map(c => overlapFor(s, c)).filter(Boolean);
            return (
              <div key={s.id} style={{ background: "var(--vir-bg-surface, #404040)", border: `1px solid ${clashes.length > 0 ? "var(--vir-orange, #E67E22)" : "var(--vir-border, #565656)"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10, opacity: s.active ? 1 : 0.65 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, textAlign: "center" }}>
                      <div className="vir-mono" style={{ color: s.active ? "var(--vir-red, #E61E29)" : "var(--vir-text-muted, #8A8A8A)", fontSize: 17, lineHeight: 1 }}>{s.date.getDate()}</div>
                      <div style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 9.5, textTransform: "uppercase" }}>{DAYS_ES[s.dow]}</div>
                    </div>
                    <div className="vir-mono" style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11.5 }}>{s.time}</div>
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
                    {clashes.map((clash, i) => (
                      <p key={i} style={{ color: "var(--vir-orange, #E67E22)", fontSize: 11, margin: "8px 0 0", lineHeight: 1.4 }}>
                        ⚠ Mismo bote ({clash.boat}) que {clash.team}, que lo usa a las {clash.time}
                      </p>
                    ))}
                    <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, margin: "10px 0 0", lineHeight: 1.4 }}>
                      {s.crews.length === 0 ? "Sin botes añadidos todavía." : s.crews.map(c => c.boat).join(", ")}
                      {" — "}gestiona los botes de este día desde su ficha completa.
                    </p>
                  </>
                )}
                {!s.active && s.suspendedReason && (
                  <p style={{ color: "var(--vir-error, #FF8890)", fontSize: 11.5, margin: "8px 0 0" }}>Suspendido: {s.suspendedReason}</p>
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

function CalendarScreen({ sessions, onOpen, onToggle, myId, teamName, showTeamLabel, alertsFor }) {
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
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, margin: "12px 4px 8px" }}>{label}</p>
            {items.map(s => {
              let right;
              const allClosed = s.crews.length > 0 && s.crews.every(c => c.status === "cerrado");
              if (!onToggle) {
                right = <Badge text={allClosed ? "Cerrado" : `${s.signups.size} aptdos`} tone={allClosed ? "closed" : "open"} />;
              } else if (allClosed) {
                const selected = inCrew(s, myId);
                right = <Badge text={selected ? "Seleccionado" : "Cerrado"} tone={selected ? "selected" : "closed"} />;
              } else {
                const signed = s.signups.has(myId);
                right = <Badge text={signed ? "Apuntado ✓" : "Apuntarse"} tone={signed ? "signed" : "action"} onClick={() => onToggle(s)} />;
              }
              return <SessionRow key={s.id} s={s} onOpen={onOpen} right={right} teamLabel={showTeamLabel && teamName ? teamName(s.teamId) : null} semaphore={onToggle ? rowerSemaphore(s, myId) : null} hasAlert={alertsFor(s.id).length > 0} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionRowerScreen({ session, onBack, onToggle, onSendAlert, myAlerts, myId, nameOf, nicknameOf, sideOf, photoOf, fleetBoats, boatMeasurements }) {
  const myCrew = session.crews.find(c => c.seats.includes(myId) || c.patron === myId || c.zodiac.includes(myId) || c.reserves.includes(myId));
  const closedCrews = session.crews.filter(c => c.status === "cerrado");
  const seatIdx = myCrew ? myCrew.seats.indexOf(myId) : -1;
  const isPatron = myCrew ? myCrew.patron === myId : false;
  const zodiacIdx = myCrew ? myCrew.zodiac.indexOf(myId) : -1;
  const isZodiac = zodiacIdx > -1;
  const reserveIdx = myCrew ? myCrew.reserves.indexOf(myId) : -1;
  const isCalled = myCrew ? (seatIdx > -1 || isPatron || isZodiac) : false;
  const isReserve = myCrew ? (!isCalled && reserveIdx > -1) : false;
  const mySeatLabel = () => {
    if (!myCrew) return null;
    if (seatIdx > -1) return seatLabelForBoat(myCrew.layout, seatIdx);
    if (isPatron) return "0 · Patrón";
    if (isZodiac) return `Zodiac ${zodiacIdx === 0 ? "Z" : `Z${zodiacIdx}`}`;
    if (reserveIdx > -1) return `Reserva R${reserveIdx + 1}`;
    return null;
  };
  return (
    <div style={{ padding: "16px 20px 24px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>
        {DAYS_ES[session.dow]} {session.date.getDate()} de {MONTHS_ES[session.date.getMonth()]}
      </h2>
      <p className="vir-mono" style={{ color: "var(--vir-red, #E61E29)", fontSize: 13, margin: "0 0 20px" }}>{session.time}</p>

      <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 13, lineHeight: 1.5 }}>
        Apúntate a este entreno para entrar en la lista de disponibles. El entrenador te asignará a un bote más adelante.
      </p>
      <button className="vir-btn" onClick={() => onToggle(session)} style={{
        ...primaryBtn, marginTop: 14,
        background: session.signups.has(myId) ? "transparent" : "var(--vir-red, #E61E29)",
        border: session.signups.has(myId) ? "1px solid var(--vir-error, #FF8890)" : "none",
        color: session.signups.has(myId) ? "var(--vir-error, #FF8890)" : "var(--vir-text-primary, #F5F5F5)",
      }}>
        {session.signups.has(myId) ? "Darme de baja" : "Apuntarme"}
      </button>
      <div style={{ marginTop: 18, marginBottom: 22 }}>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", marginBottom: 8 }}>Apuntados ({session.signups.size})</p>
        <SignupsBySide ids={[...session.signups]} sideOf={sideOf} nameOf={nameOf} nicknameOf={nicknameOf} />
      </div>

      {myCrew ? (
        <div>
          <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12, margin: "0 0 10px" }}>🚣 {myCrew.boat}{myCrew.oars ? ` · ${myCrew.oars}` : ""}</p>
          <div style={{
            display: "flex", alignItems: "center", gap: 12, borderRadius: 12, padding: 16, marginBottom: 18,
            background: isCalled ? "var(--vir-success-bg, #1E3A2A)" : isReserve ? "var(--vir-warning-bg, #3D2E17)" : "var(--vir-danger-bg, #3A1E1E)",
            border: `1px solid ${isCalled ? "var(--vir-green, #3EA55A)" : isReserve ? "var(--vir-orange, #E67E22)" : "var(--vir-danger, #E24B4A)"}`,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: isCalled ? "var(--vir-green, #3EA55A)" : isReserve ? "transparent" : "var(--vir-danger, #E24B4A)",
              border: isReserve ? "2px solid var(--vir-orange, #E67E22)" : "none",
            }}>
              {isCalled ? <Check size={19} color="#FFFFFF" /> : isReserve ? (
                <span style={{ color: "var(--vir-orange, #E67E22)", fontWeight: 800, fontSize: 16, fontFamily: "'Big Shoulders Display', sans-serif" }}>R</span>
              ) : <X size={19} color="#FFFFFF" />}
            </div>
            <div>
              <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontWeight: 700, fontSize: 14, margin: 0 }}>
                {isCalled ? "Convocado/a" : isReserve ? "Estás de reserva" : "No convocado/a"}
              </p>
              {mySeatLabel() && <p className="vir-mono" style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12.5, margin: "3px 0 0" }}>{mySeatLabel()}</p>}
            </div>
          </div>
          <BoatDiagram crew={myCrew} readOnly nicknameOf={nicknameOf} nameOf={nameOf} sideOf={sideOf} photoOf={photoOf} fleetBoats={fleetBoats} boatMeasurements={boatMeasurements} />
          {(isCalled || isReserve) && (
            myAlerts && myAlerts.length > 0 ? (
              <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, marginTop: 16, textAlign: "center" }}>
                Ya has avisado al entrenador de que no puedes venir.
              </p>
            ) : (
              <button
                className="vir-btn"
                onClick={() => {
                  if (window.confirm("¿Avisar al entrenador de que no puedes venir a este entreno? La tripulación ya cerrada no cambia sola — el entrenador tendrá que reabrirla y buscar un sustituto.")) onSendAlert(session);
                }}
                style={{ ...ghostBtn, marginTop: 18, borderColor: "var(--vir-danger, #E24B4A)", color: "var(--vir-error, #FF8890)" }}
              >
                Avisar que no puedo venir
              </button>
            )
          )}
        </div>
      ) : closedCrews.length > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 12, padding: 16, background: "var(--vir-danger-bg, #3A1E1E)", border: "1px solid var(--vir-danger, #E24B4A)" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--vir-danger, #E24B4A)" }}>
            <X size={19} color="#FFFFFF" />
          </div>
          <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontWeight: 700, fontSize: 14, margin: 0 }}>No convocado/a en ningún bote de este día</p>
        </div>
      ) : null}
    </div>
  );
}

function CrewCard({ session, crew, teamOf, nameOf, nicknameOf, sideOf, photoOf, waterStatsFor, gymStatsFor, editable, myId, selected, setSelected, onAssign, onClear, onClose, onReopen, onRemoveCrew, onSetBoat, onSetOars, overlapFor, fleetBoats, boatMeasurements }) {
  const [preEditRoster, setPreEditRoster] = useState(null);
  const handleReopen = () => {
    setPreEditRoster({ seats: [...crew.seats], patron: crew.patron, reserves: [...crew.reserves], zodiac: [...crew.zodiac] });
    onReopen(session, crew);
  };
  const handleClose = () => {
    onClose(session, crew, preEditRoster);
    setPreEditRoster(null);
  };
  const inScope = (id) => teamOf(id) === session.teamId;
  const available = [...session.signups].filter(id => !allCrewedIds(session).includes(id) && (inScope(id) || id === myId));
  const filled = seatFill(crew);
  const canEdit = editable && crew.status === "abierto";
  const clash = overlapFor(session, crew);
  const pctFor = (id) => {
    const w = waterStatsFor(id, session.teamId);
    const g = gymStatsFor(id, session.teamId);
    const wPct = w.monthTotal > 0 ? (w.monthDone / w.monthTotal) * 100 : 0;
    const gPct = g.monthTotal > 0 ? (g.monthDone / g.monthTotal) * 100 : 0;
    return Math.round((wPct + gPct) / 2);
  };
  return (
    <div style={{ flex: "1 1 100%", minWidth: "100%", background: "var(--vir-bg-surface-alt, var(--vir-bg-surface-alt, #3A3A3A))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 14, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <select value={crew.boat} onChange={e => { const fb = fleetBoats.find(b => b.name === e.target.value); if (fb) onSetBoat(crew, fb); }} disabled={!canEdit} style={{ ...inputStyle, padding: "6px 8px", fontSize: 12.5, fontWeight: 700, flex: 1, opacity: canEdit ? 1 : 0.6 }}>
          {fleetBoats.filter(b => b.name === crew.boat || !session.crews.some(c => c.id !== crew.id && c.boat === b.name)).map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
        </select>
        <select value={crew.oars || ""} onChange={e => onSetOars(crew, e.target.value || null)} disabled={!canEdit} style={{ ...inputStyle, padding: "6px 8px", fontSize: 12, flex: 1, opacity: canEdit ? 1 : 0.6 }}>
          <option value="">Sin rems</option>
          {oarsOptionsForLayout(crew.layout).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {editable && canEdit && (
          <button className="vir-btn" onClick={() => {
            const msg = filled > 0
              ? `¿Quitar "${crew.boat}" de este día? Hay ${filled} puesto${filled === 1 ? "" : "s"} asignado${filled === 1 ? "" : "s"} que se perderán.`
              : `¿Quitar "${crew.boat}" de este día?`;
            if (window.confirm(msg)) onRemoveCrew(session, crew.id);
          }} style={{ background: "transparent", color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", padding: "4px 6px", flexShrink: 0 }}>
            <X size={16} />
          </button>
        )}
      </div>

      {clash && (
        <p style={{ color: "var(--vir-orange, var(--vir-orange, #E67E22))", fontSize: 10.5, margin: "0 0 8px", lineHeight: 1.4 }}>
          ⚠ {clash.boat} también está en uso por {clash.team} a las {clash.time} — puede haber conflicto.
        </p>
      )}

      <p className="vir-mono" style={{ color: "var(--vir-red, var(--vir-red, #E61E29))", fontSize: 11.5, margin: "0 0 8px" }}>{filled} puesto{filled === 1 ? "" : "s"} asignado{filled === 1 ? "" : "s"}</p>

      {crew.status === "abierto" ? (
        <>
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, textTransform: "uppercase", marginBottom: 6 }}>Disponibles ({available.length})</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {available.length === 0 && <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5 }}>Nadie más apuntado todavía.</p>}
            {available.map(id => {
              const meta = SIDE_META[sideOf(id)];
              const isSel = selected === id;
              const label = nicknameOf(id) || nameOf(id);
              const pct = pctFor(id);
              return (
                <button key={id} className="vir-chip vir-btn" disabled={!editable} onClick={() => editable && setSelected(isSel ? null : id)} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "5px 10px 5px 5px", borderRadius: 20, fontSize: 11.5,
                  background: isSel ? "var(--vir-red, var(--vir-red, #E61E29))" : "var(--vir-bg-surface, var(--vir-bg-surface, #404040))",
                  border: `1px solid ${isSel ? "var(--vir-red, var(--vir-red, #E61E29))" : "var(--vir-border, var(--vir-border, #565656))"}`,
                  color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontWeight: isSel ? 600 : 400,
                  opacity: editable ? 1 : 0.6, cursor: editable ? "pointer" : "not-allowed",
                }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: meta ? meta.color : "var(--vir-border, var(--vir-border, #565656))", color: "#FFFFFF", fontSize: 7.5, fontWeight: 800,
                  }}>{meta ? meta.letter : "?"}</span>
                  {label}
                  <span className="vir-mono" style={{ color: isSel ? "#FFD9DB" : "var(--vir-text-primary, #F5F5F5)", fontSize: 11, fontWeight: 600 }}>· {pct}%</span>
                </button>
              );
            })}
          </div>

          <BoatDiagram crew={crew} selected={selected} onAssign={(c, type, idx) => onAssign(session, c, type, idx)} onClear={(c, type, idx) => onClear(session, c, type, idx)} readOnly={!editable} nicknameOf={nicknameOf} nameOf={nameOf} sideOf={sideOf} photoOf={photoOf} fleetBoats={fleetBoats} boatMeasurements={boatMeasurements} />

          {editable && (
            <button className="vir-btn" disabled={filled === 0} onClick={handleClose} style={{ ...primaryBtn, marginTop: 14, padding: "10px 0", fontSize: 12.5, opacity: filled === 0 ? 0.4 : 1 }}>
              Cerrar y notificar
            </button>
          )}
        </>
      ) : (
        <>
          <Badge text="Cerrado" tone="closed" />
          <div style={{ marginTop: 12 }}>
            <BoatDiagram crew={crew} readOnly nicknameOf={nicknameOf} nameOf={nameOf} sideOf={sideOf} photoOf={photoOf} fleetBoats={fleetBoats} boatMeasurements={boatMeasurements} />
          </div>
          {editable && (
            <button className="vir-btn" onClick={handleReopen} style={{ ...ghostBtn, marginTop: 12, padding: "9px 0", fontSize: 12 }}>
              Reabrir para modificar
            </button>
          )}
        </>
      )}
    </div>
  );
}

function SessionCoachScreen({ session, onBack, selected, setSelected, onAssign, onClear, onClose, onReopen, onAddCrew, onRemoveCrew, onSetCrewBoat, onSetCrewOars, teamName, teamOf, nameOf, nicknameOf, sideOf, waterStatsFor, gymStatsFor, onUpdateSession, editable, alerts, onResolveAlert, myId, onToggleSignup, photoOf, overlapFor, fleetBoats, boatMeasurements }) {
  const [newBoatName, setNewBoatName] = useState("");
  const availableBoats = fleetBoats.filter(b => !session.crews.some(c => c.boat === b.name));

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>
        {DAYS_ES[session.dow]} {session.date.getDate()} de {MONTHS_ES[session.date.getMonth()]}
      </h2>
      <p className="vir-mono" style={{ color: "var(--vir-red, #E61E29)", fontSize: 13, margin: "0 0 4px" }}>{session.time}</p>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "0 0 4px" }}>Tripulación: {teamName(session.teamId)}</p>
      {!editable && (
        <p style={{ color: "var(--vir-orange, #E67E22)", fontSize: 12, margin: "0 0 16px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}
      {editable && <div style={{ marginBottom: 16 }} />}

      {alerts && alerts.length > 0 && (
        <div style={{ background: "var(--vir-danger-bg, #402226)", border: "1px solid var(--vir-red, #E61E29)", borderRadius: 12, padding: "12px 14px", marginBottom: 18 }}>
          <p style={{ color: "var(--vir-error, #FF8890)", fontSize: 11.5, fontWeight: 700, margin: "0 0 8px" }}>⚠ Avisos de baja</p>
          {alerts.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5, margin: 0, lineHeight: 1.4 }}>{a.text}</p>
              {editable && (
                <button className="vir-btn" onClick={() => onResolveAlert(a.id)} style={{ background: "transparent", color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, textDecoration: "underline", whiteSpace: "nowrap", flexShrink: 0 }}>
                  Ya lo he visto
                </button>
              )}
            </div>
          ))}
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "6px 0 0", lineHeight: 1.4 }}>
            Reabre el bote correspondiente para hacer los cambios necesarios y vuelve a cerrarlo para notificar.
          </p>
        </div>
      )}

      <button
        className="vir-btn"
        onClick={() => onToggleSignup(session)}
        style={{
          width: "100%", marginBottom: 18, padding: "11px 0", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: session.signups.has(myId) ? "transparent" : "var(--vir-bg-surface, #404040)",
          border: session.signups.has(myId) ? "1px solid var(--vir-error, #FF8890)" : "1px solid var(--vir-border, #565656)",
          color: session.signups.has(myId) ? "var(--vir-error, #FF8890)" : "var(--vir-text-secondary, #ADADAD)",
        }}
      >
        {session.signups.has(myId) ? "Quitarme de disponible" : "Apuntarme también — cubriré un puesto"}
      </button>

      <div style={{ marginBottom: 18 }}>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", marginBottom: 8 }}>Apuntados ({session.signups.size})</p>
        {session.signups.size === 0 ? (
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5 }}>Todavía no se ha apuntado nadie.</p>
        ) : (
          <SignupsBySide ids={[...session.signups]} sideOf={sideOf} nameOf={nameOf} nicknameOf={nicknameOf} />
        )}
      </div>

      {session.crews.length === 0 && (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, marginBottom: 14 }}>Todavía no hay ningún bote añadido a este día.</p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {session.crews.map(crew => (
          <CrewCard
            key={crew.id}
            session={session} crew={crew}
            teamOf={teamOf} nameOf={nameOf} nicknameOf={nicknameOf} sideOf={sideOf} photoOf={photoOf}
            waterStatsFor={waterStatsFor} gymStatsFor={gymStatsFor} editable={editable} myId={myId}
            selected={selected} setSelected={setSelected}
            onAssign={onAssign} onClear={onClear} onClose={onClose} onReopen={onReopen} onRemoveCrew={onRemoveCrew}
            onSetBoat={(c, fleetBoat) => onSetCrewBoat(session.id, c, fleetBoat)}
            onSetOars={(c, oars) => onSetCrewOars(session.id, c.id, oars)}
            overlapFor={overlapFor}
            fleetBoats={fleetBoats}
            boatMeasurements={boatMeasurements}
          />
        ))}
      </div>

      {editable && (
        <div style={{ background: "var(--vir-bg-surface, #404040)", border: "1px dashed var(--vir-border, #565656)", borderRadius: 12, padding: 14, marginTop: 6 }}>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Añadir otro bote a este día</p>
          {fleetBoats.length === 0 ? (
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12 }}>Todavía no hay ningún bote en la flota — créalos desde "Botes" en el inicio.</p>
          ) : availableBoats.length === 0 ? (
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12 }}>Ya están añadidos todos los botes de la flota.</p>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <select value={availableBoats.some(b => b.name === newBoatName) ? newBoatName : availableBoats[0].name} onChange={e => setNewBoatName(e.target.value)} style={{ ...inputStyle, padding: "8px 10px", fontSize: 12.5, flex: 1 }}>
                {availableBoats.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
              <button className="vir-btn" onClick={() => {
                const chosen = availableBoats.find(b => b.name === newBoatName) || availableBoats[0];
                onAddCrew(session, chosen);
                setNewBoatName("");
              }} style={{ ...primaryBtn, padding: "8px 16px", fontSize: 12.5 }}>Añadir</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BoatDiagram({ crew, selected, onAssign, onClear, readOnly, nicknameOf, nameOf, sideOf, photoOf, fleetBoats, boatMeasurements }) {
  const handleSlot = (type, idx, occupied) => {
    if (readOnly) return;
    if (occupied) { onClear(crew, type, idx); return; }
    if (selected) onAssign(crew, type, idx);
  };
  const canClick = (occupied) => !readOnly && (occupied || !!selected);
  const colorFor = (rowerId) => (sideOf && rowerId && SIDE_META[sideOf(rowerId)]) ? SIDE_META[sideOf(rowerId)].color : "#E61E29";
  const centerX = 150;
  // Medida que el entrenador haya puesto para este remero en este bote concreto (a través de "Medidas")
  const boatId = fleetBoats ? fleetBoats.find(b => b.name === crew.boat)?.id : null;
  const measFor = (rid) => (boatId && boatMeasurements && boatMeasurements[boatId]) ? boatMeasurements[boatId][rid] : null;

  // Avatar redondo con aro del color de babor/estribor/ambos/patrón; si no hay foto, círculo de color con iniciales
  const Avatar = ({ x, y, r, filled, rowerId, label, nameBelow }) => {
    const color = colorFor(rowerId);
    const photo = filled && photoOf ? photoOf(rowerId) : null;
    const clipId = `bd-clip-${x}-${y}`;
    const measurement = filled ? measFor(rowerId) : null;
    return (
      <g style={{ cursor: canClick(filled) ? "pointer" : "default" }} onClick={() => handleSlot(label.type, label.idx, filled)}>
        {photo ? (
          <>
            <defs><clipPath id={clipId}><circle cx={x} cy={y} r={r - 3} /></clipPath></defs>
            <circle cx={x} cy={y} r={r} fill="#333333" stroke={color} strokeWidth="3.5" />
            <image href={photo} x={x - (r - 3)} y={y - (r - 3)} width={(r - 3) * 2} height={(r - 3) * 2} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
          </>
        ) : (
          <circle cx={x} cy={y} r={r} fill={filled ? color : "#404040"} stroke={filled ? color : "#6E6E6E"} strokeWidth="1.5" />
        )}
        {!photo && (
          <text x={x} y={y + r * 0.28} textAnchor="middle" fontSize={r * 0.62} fontWeight="700" fill="#FFFFFF">{label.text}</text>
        )}
        {filled && photo && (
          <g>
            <circle cx={x + r * 0.68} cy={y + r * 0.68} r={r * 0.36} fill={color} stroke="#3A3A3A" strokeWidth="1.5" />
            <text x={x + r * 0.68} y={y + r * 0.68 + r * 0.13} textAnchor="middle" fontSize={r * 0.32} fontWeight="800" fill="#FFFFFF">{label.text}</text>
          </g>
        )}
        {filled && nameBelow && (
          <text x={x} y={y + r + 15} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--vir-boat-name, #F5F5F5)">
            {crewLabel(rowerId, nicknameOf, nameOf)}{measurement ? ` · ${measurement}` : ""}
          </text>
        )}
      </g>
    );
  };

  const ZodiacBlock = ({ y }) => {
    const zodiacPos = [66, 122, 178, 234].map(x => ({ x, y }));
    return (
      <>
        <rect x="25" y={y - 40} width="250" height="80" rx="14" fill="var(--vir-boat-zodiac-bg, #333333)" stroke="#565656" strokeWidth="1.5" />
        {[0, 1, 2, 3].map(i => (
          <Avatar key={`z${i}`} x={zodiacPos[i].x} y={zodiacPos[i].y} r={17} filled={!!crew.zodiac[i]} rowerId={crew.zodiac[i]}
            label={{ type: "zodiac", idx: i, text: i === 0 ? "Z" : `Z${i}` }} nameBelow />
        ))}
      </>
    );
  };

  // ---------- BÀTEL: 4 puestos en una sola columna (4,3,2,1) + patrón, sin babor/estribor ----------
  if (isBatel(crew.layout)) {
    const seatY = (i) => 46 + i * 66; // i=0 arriba (puesto 4) ... i=3 abajo (puesto 1)
    const seatIdxForRow = [3, 2, 1, 0]; // fila de arriba a abajo: idx3="4", idx2="3", idx1="2", idx0="1"
    const patronY = seatY(3) + 66;
    const zodiacY = patronY + 96;
    const reserveY = zodiacY + 76;
    const viewH = reserveY + 50;
    return (
      <div style={{ background: "var(--vir-boat-bg, #666666)", border: "1px solid #565656", borderRadius: 14, padding: "16px 0 10px" }}>
        <svg viewBox={`0 0 300 ${viewH}`} width="100%" height={viewH * 0.92}>
          {seatIdxForRow.map((idx, row) => (
            <Avatar key={idx} x={centerX} y={seatY(row)} r={24} filled={!!crew.seats[idx]} rowerId={crew.seats[idx]}
              label={{ type: "seat", idx, text: BATEL_SEAT_NUMS[idx] }} nameBelow />
          ))}
          <Avatar x={centerX} y={patronY} r={26} filled={!!crew.patron} rowerId={crew.patron}
            label={{ type: "patron", idx: 0, text: "P" }} nameBelow />
          <ZodiacBlock y={zodiacY} />
          {[0, 1].map(i => (
            <Avatar key={`r${i}`} x={centerX + (i === 0 ? -50 : 50)} y={reserveY} r={20} filled={!!crew.reserves[i]} rowerId={crew.reserves[i]}
              label={{ type: "reserve", idx: i, text: `R${i + 1}` }} nameBelow />
          ))}
        </svg>
      </div>
    );
  }

  // ---------- LLAÜT: 9 puestos (4 babor + 5 estribor), estribor desplazado una fila hacia arriba ----------
  if (isLlaut9(crew.layout) || isLlaut8(crew.layout)) {
    const rowY = (row) => 118 + row * 66;
    const rows = [
      { babor: null, estribor: 7 }, // 4E sola, sin pareja en babor
      { babor: 6, estribor: 5 },    // 4B / 3E
      { babor: 4, estribor: 3 },    // 3B / 2E
      { babor: 2, estribor: 1 },    // 2B / 1E
      { babor: 0, estribor: isLlaut9(crew.layout) ? 8 : null }, // 1B / 0E (solo en el de 9 puestos)
    ];
    const cx = { babor: 88, estribor: 212 };
    const lineTop = 90;
    const patronPos = { x: centerX, y: rowY(4) + 60 };
    const lineBottom = patronPos.y - 4;
    const reservePos = [{ x: 88, y: 56 }, { x: 212, y: 56 }];
    const zodiacY = patronPos.y + 116;
    const viewH = zodiacY + 60;
    return (
      <div style={{ background: "var(--vir-boat-bg, #666666)", border: "1px solid #565656", borderRadius: 14, padding: "16px 0 10px" }}>
        <svg viewBox={`0 0 300 ${viewH}`} width="100%" height={viewH * 0.92}>
          <line x1={centerX} y1={lineTop} x2={centerX} y2={lineBottom} stroke="#767676" strokeWidth="2" />
          <text x={cx.babor} y={18} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--vir-boat-label, #8A8A8A)" letterSpacing="0.5">BABOR</text>
          <text x={cx.estribor} y={18} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--vir-boat-label, #8A8A8A)" letterSpacing="0.5">ESTRIBOR</text>

          {[0, 1].map(i => (
            <Avatar key={`r${i}`} x={reservePos[i].x} y={reservePos[i].y} r={22} filled={!!crew.reserves[i]} rowerId={crew.reserves[i]}
              label={{ type: "reserve", idx: i, text: `R${i + 1}` }} nameBelow />
          ))}

          {rows.map((r, row) => (
            <g key={row}>
              {r.babor !== null && (
                <Avatar x={cx.babor} y={rowY(row)} r={24} filled={!!crew.seats[r.babor]} rowerId={crew.seats[r.babor]}
                  label={{ type: "seat", idx: r.babor, text: seatShortForBoat(crew.layout, r.babor) }} nameBelow />
              )}
              {r.estribor !== null && (
                <Avatar x={cx.estribor} y={rowY(row)} r={24} filled={!!crew.seats[r.estribor]} rowerId={crew.seats[r.estribor]}
                  label={{ type: "seat", idx: r.estribor, text: seatShortForBoat(crew.layout, r.estribor) }} nameBelow />
              )}
            </g>
          ))}

          <Avatar x={patronPos.x} y={patronPos.y} r={26} filled={!!crew.patron} rowerId={crew.patron}
            label={{ type: "patron", idx: 0, text: "P" }} nameBelow />
          <ZodiacBlock y={zodiacY} />
        </svg>
      </div>
    );
  }

  // ---------- LLAGUT estándar (Alarona, Gaudir, o sin bote elegido): 8 puestos, 4 filas simétricas ----------
  const cx = { babor: 88, estribor: 212 };
  const rowY = (row) => 140 + row * 72; // row 0 = fila 4 (arriba) ... row 3 = fila 1 (abajo, junto al patrón)
  const lineTop = 90;
  const patronPos = { x: centerX, y: 140 + 4 * 72 - 4 }; // pegado a la fila de 1B/1E
  const lineBottom = patronPos.y - 4;
  const reservePos = [{ x: 88, y: 56 }, { x: 212, y: 56 }];
  const zodiacY = patronPos.y + 116;
  const viewH = zodiacY + 60;

  return (
    <div style={{ background: "var(--vir-boat-bg, #666666)", border: "1px solid #565656", borderRadius: 14, padding: "16px 0 10px" }}>
      <svg viewBox={`0 0 300 ${viewH}`} width="100%" height={viewH * 0.92}>
        <line x1={centerX} y1={lineTop} x2={centerX} y2={lineBottom} stroke="#767676" strokeWidth="2" />

        <text x={cx.babor} y={18} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--vir-boat-label, #8A8A8A)" letterSpacing="0.5">BABOR</text>
        <text x={cx.estribor} y={18} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--vir-boat-label, #8A8A8A)" letterSpacing="0.5">ESTRIBOR</text>

        {[0, 1].map(i => (
          <Avatar key={`r${i}`} x={reservePos[i].x} y={reservePos[i].y} r={22} filled={!!crew.reserves[i]} rowerId={crew.reserves[i]}
            label={{ type: "reserve", idx: i, text: `R${i + 1}` }} nameBelow />
        ))}

        {[0, 1, 2, 3].map(row => {
          const seatNum = 4 - row; // fila 4 arriba -> fila 1 abajo
          const baborIdx = (seatNum - 1) * 2;
          const estriborIdx = (seatNum - 1) * 2 + 1;
          return (
            <g key={row}>
              <Avatar x={cx.babor} y={rowY(row)} r={24} filled={!!crew.seats[baborIdx]} rowerId={crew.seats[baborIdx]}
                label={{ type: "seat", idx: baborIdx, text: seatShort(baborIdx) }} nameBelow />
              <Avatar x={cx.estribor} y={rowY(row)} r={24} filled={!!crew.seats[estriborIdx]} rowerId={crew.seats[estriborIdx]}
                label={{ type: "seat", idx: estriborIdx, text: seatShort(estriborIdx) }} nameBelow />
            </g>
          );
        })}

        <Avatar x={patronPos.x} y={patronPos.y} r={26} filled={!!crew.patron} rowerId={crew.patron}
          label={{ type: "patron", idx: 0, text: "P" }} nameBelow />

        <ZodiacBlock y={zodiacY} />
      </svg>
    </div>
  );
}

function NameChip({ name, side }) {
  const meta = side ? SIDE_META[side] : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#454545", color: "#E8E8E8", fontSize: 12, padding: "6px 12px", borderRadius: 20, marginRight: 6, marginBottom: 6 }}>
      {meta && <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: meta.color }} />}
      {name}
    </div>
  );
}

// Reparte a los apuntados en dos columnas, babor a la izquierda y estribor a la derecha; quien
// rema a ambos lados se coloca en la columna que en ese momento tenga menos gente, para compensar
function SignupsBySide({ ids, sideOf, nameOf, nicknameOf }) {
  const babor = [], estribor = [];
  ids.forEach(id => {
    const side = sideOf(id);
    if (side === "babor") babor.push(id);
    else if (side === "estribor") estribor.push(id);
    else if (side === "ambos") (babor.length <= estribor.length ? babor : estribor).push(id);
    else babor.push(id);
  });
  const Col = ({ label, color, list }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ color, fontSize: 9.5, textTransform: "uppercase", fontWeight: 700, margin: "0 0 6px" }}>{label}</p>
      {list.length === 0 ? (
        <p style={{ color: "#6E6E6E", fontSize: 11 }}>—</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {list.map(id => <NameChip key={id} name={nicknameOf(id) || nameOf(id)} side={sideOf(id)} />)}
        </div>
      )}
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 14 }}>
      <Col label="Babor" color="#E61E29" list={babor} />
      <Col label="Estribor" color="#3EA55A" list={estribor} />
    </div>
  );
}

// Una notificación deslizable: arrastra hacia la izquierda para descubrir los botones de "visto" y "eliminar".
// Tocar el texto (sin deslizar) lleva directo al entreno que menciona.
function SwipeableNotification({ n, isRead, subtitle, onOpen, onMarkRead, onHide }) {
  const ACTIONS_WIDTH = 132;
  const [dragX, setDragX] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef(null);
  const dragging = useRef(false);

  const clamp = (x) => Math.max(-ACTIONS_WIDTH, Math.min(0, x));

  const onPointerDown = (e) => {
    startX.current = e.clientX ?? e.touches?.[0]?.clientX;
    dragging.current = true;
  };
  const onPointerMove = (e) => {
    if (!dragging.current || startX.current === null) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    const delta = x - startX.current;
    setDragX(clamp((open ? -ACTIONS_WIDTH : 0) + delta));
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const shouldOpen = dragX < -ACTIONS_WIDTH / 2;
    setOpen(shouldOpen);
    setDragX(shouldOpen ? -ACTIONS_WIDTH : 0);
    startX.current = null;
  };
  const handleTap = () => {
    if (open) { setOpen(false); setDragX(0); return; } // primer toque solo cierra si estaba abierta
    onOpen();
  };

  return (
    <div style={{ position: "relative", borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: ACTIONS_WIDTH, display: "flex" }}>
        <button className="vir-btn" onClick={() => { onMarkRead(); setOpen(false); setDragX(0); }} style={{ flex: 1, background: "#3EA55A", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Check size={18} />
        </button>
        <button className="vir-btn" onClick={() => onHide()} style={{ flex: 1, background: "#E61E29", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Trash2 size={18} />
        </button>
      </div>
      <div
        onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={endDrag} onMouseLeave={endDrag}
        onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={endDrag}
        onClick={handleTap}
        className="vir-btn"
        style={{
          position: "relative", transform: `translateX(${dragX}px)`, transition: dragging.current ? "none" : "transform 0.2s",
          background: isRead ? "#3A3A3A" : "#404040", border: `1px solid ${isRead ? "#4A4A4A" : "#565656"}`,
          borderRadius: 12, padding: 14, display: "flex", gap: 10, cursor: "pointer", touchAction: "pan-y",
        }}
      >
        <div style={{ width: 30, height: 30, borderRadius: 15, background: isRead ? "#3A3A3A" : "#402226", border: isRead ? "1px solid #565656" : "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Bell size={14} color={isRead ? "#8A8A8A" : "#E61E29"} />
        </div>
        <div>
          {subtitle && <p style={{ color: "#ADADAD", fontSize: 11, margin: "0 0 3px" }}>{subtitle}</p>}
          <p style={{ color: isRead ? "#ADADAD" : "#F5F5F5", fontSize: 12.5, margin: 0, lineHeight: 1.45 }}>{n.text}</p>
        </div>
      </div>
    </div>
  );
}

function NotificationsScreen({ items, role, nameOf, onOpen, onMarkRead, onHide }) {
  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionTitle sub={role === "rower" ? "Confirmaciones de tripulación · desliza para ver más opciones" : "Registro de notificaciones enviadas · desliza para ver más opciones"}>Notificaciones</SectionTitle>
      <div style={{ padding: "10px 16px" }}>
        {items.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 13, marginTop: 20 }}>Aún no hay notificaciones.</p>}
        {items.map(n => (
          <SwipeableNotification
            key={n.id}
            n={n}
            isRead={role === "rower" ? n.read : n.readByCoach}
            subtitle={null}
            onOpen={() => onOpen(n)}
            onMarkRead={() => onMarkRead(n.id)}
            onHide={() => onHide(n.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ProfileScreen({ role, scope, attendance, crewStats, teams, teamName, teamCode, onOpenTraining, myId, myDisplayName, myNickname, mySide, myTeam, myEmail, myFirstName, myLastName, myBirthDate, myPhone, myRowerCode, myPhoto, onUpdateMyProfile, onUpdateMyPhoto, clubDisplayName, clubCode, clubPhoto, clubProfile, onUpdateClubProfile, onUpdateClubPhoto, theme, onToggleTheme }) {
  const name = role === "coach" ? myDisplayName : role === "club" ? clubDisplayName : myDisplayName;
  const roleLabel = role === "coach" ? "Entrenador" : role === "club" ? "Club" : "Remero";
  const photo = role === "club" ? clubPhoto : myPhoto;
  const onChangePhoto = role === "club" ? onUpdateClubPhoto : onUpdateMyPhoto;
  const [editing, setEditing] = useState(false);
  const [apodoInput, setApodoInput] = useState(myNickname);
  const [sideInput, setSideInput] = useState(mySide);
  const [firstNameInput, setFirstNameInput] = useState(myFirstName);
  const [lastNameInput, setLastNameInput] = useState(myLastName);
  const [birthDateInput, setBirthDateInput] = useState(myBirthDate);
  const [phoneInput, setPhoneInput] = useState(myPhone);
  const [emailInput, setEmailInput] = useState(myEmail);
  const [newPasswordInput, setNewPasswordInput] = useState("");

  const [clubNameInput, setClubNameInput] = useState(clubDisplayName);
  const [legalNameInput, setLegalNameInput] = useState(clubProfile?.legalName || "");
  const [nifInput, setNifInput] = useState(clubProfile?.nif || "");
  const [clubEmailInput, setClubEmailInput] = useState(clubProfile?.email || "");
  const [addressInput, setAddressInput] = useState(clubProfile?.address || "");
  const [cityInput, setCityInput] = useState(clubProfile?.city || "");
  const [postalCodeInput, setPostalCodeInput] = useState(clubProfile?.postalCode || "");
  const [contactFirstNameInput, setContactFirstNameInput] = useState(clubProfile?.contactFirstName || "");
  const [contactLastNameInput, setContactLastNameInput] = useState(clubProfile?.contactLastName || "");
  const [contactRoleInput, setContactRoleInput] = useState(clubProfile?.contactRole || "");
  const [contactPhoneInput, setContactPhoneInput] = useState(clubProfile?.contactPhone || "");

  const startEdit = () => {
    setApodoInput(myNickname);
    setSideInput(mySide);
    setFirstNameInput(myFirstName);
    setLastNameInput(myLastName);
    setBirthDateInput(myBirthDate);
    setPhoneInput(myPhone);
    setEmailInput(myEmail);
    setNewPasswordInput("");
    setClubNameInput(clubDisplayName);
    setLegalNameInput(clubProfile?.legalName || "");
    setNifInput(clubProfile?.nif || "");
    setClubEmailInput(clubProfile?.email || "");
    setAddressInput(clubProfile?.address || "");
    setCityInput(clubProfile?.city || "");
    setPostalCodeInput(clubProfile?.postalCode || "");
    setContactFirstNameInput(clubProfile?.contactFirstName || "");
    setContactLastNameInput(clubProfile?.contactLastName || "");
    setContactRoleInput(clubProfile?.contactRole || "");
    setContactPhoneInput(clubProfile?.contactPhone || "");
    setEditing(true);
  };
  const saveEdit = () => {
    if (role === "rower" || role === "coach") {
      onUpdateMyProfile({
        apodo: apodoInput, side: sideInput, email: emailInput, newPassword: newPasswordInput || null,
        firstName: firstNameInput, lastName: lastNameInput, birthDate: birthDateInput, phone: phoneInput,
      });
    }
    if (role === "club") {
      onUpdateClubProfile({
        name: clubNameInput, legalName: legalNameInput, nif: nifInput, email: clubEmailInput,
        address: addressInput, city: cityInput, postalCode: postalCodeInput,
        contactFirstName: contactFirstNameInput, contactLastName: contactLastNameInput,
        contactRole: contactRoleInput, contactPhone: contactPhoneInput,
      });
    }
    setEditing(false);
  };

  const editable = true; // club, entrenador y remero pueden modificar su cuenta
  const fieldStyle = { ...inputStyle, padding: "9px 11px", fontSize: 12.5, marginBottom: 10 };
  const labelStyle = { fontSize: 11.5, color: "#ADADAD", marginBottom: 4, display: "block" };

  return (
    <div style={{ padding: "24px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <AvatarPicker photo={photo} initials={name.split(" ").map(n => n[0]).join("")} onChange={onChangePhoto} />
          <div>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontWeight: 600, fontSize: 16, margin: 0 }}>{name}</p>
            <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12.5, margin: "3px 0 0" }}>{roleLabel}{role !== "club" ? ` · ${clubDisplayName}` : ""}</p>
          </div>
        </div>
        {editable && !editing && (
          <button className="vir-btn" onClick={startEdit} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "8px 10px", color: "#ADADAD" }}>
            <Pencil size={15} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
        <p style={{ color: "#F5F5F5", fontSize: 13, margin: 0 }}>Modo {theme === "dark" ? "oscuro" : "claro"}</p>
        <ToggleSwitch checked={theme === "light"} onChange={() => onToggleTheme(theme === "dark" ? "light" : "dark")} />
      </div>

      {editing && (role === "rower" || role === "coach") && (
        <div style={{ background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 12, padding: 14, marginBottom: 20 }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Editar perfil</p>

          <label style={labelStyle}>Nombre</label>
          <input value={firstNameInput} onChange={e => setFirstNameInput(e.target.value)} style={fieldStyle} />

          <label style={labelStyle}>Apellido</label>
          <input value={lastNameInput} onChange={e => setLastNameInput(e.target.value)} style={fieldStyle} />

          <label style={labelStyle}>Apodo</label>
          <input value={apodoInput} onChange={e => setApodoInput(e.target.value)} style={fieldStyle} />

          <label style={labelStyle}>Fecha de nacimiento</label>
          <input type="date" value={birthDateInput} onChange={e => setBirthDateInput(e.target.value)} style={fieldStyle} />

          <label style={labelStyle}>Nº Teléfono</label>
          <input type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} style={fieldStyle} />

          {role === "rower" && (
            <>
              <label style={{ ...labelStyle, marginBottom: 6 }}>Lado de remo</label>
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
          <label style={labelStyle}>Correo (acceso y recuperación)</label>
          <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="tucorreo@ejemplo.com" style={fieldStyle} />
          <label style={labelStyle}>Nueva contraseña</label>
          <input type="password" value={newPasswordInput} onChange={e => setNewPasswordInput(e.target.value)} placeholder="Déjalo en blanco para no cambiarla" style={{ ...fieldStyle, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="vir-btn" onClick={saveEdit} style={{ ...primaryBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Guardar</button>
            <button className="vir-btn" onClick={() => setEditing(false)} style={{ ...ghostBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Cancelar</button>
          </div>
        </div>
      )}

      {editing && role === "club" && (
        <div style={{ background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 12, padding: 14, marginBottom: 20 }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Editar perfil</p>

          <label style={labelStyle}>Nombre del club</label>
          <input value={clubNameInput} onChange={e => setClubNameInput(e.target.value)} style={fieldStyle} />

          <label style={labelStyle}>Correo (acceso y recuperación)</label>
          <input type="email" value={clubEmailInput} onChange={e => setClubEmailInput(e.target.value)} style={fieldStyle} />

          <p style={{ color: "#8A8A8A", fontSize: 10.5, textTransform: "uppercase", margin: "16px 0 8px" }}>Datos del club</p>
          <label style={labelStyle}>Nombre fiscal del club</label>
          <input value={legalNameInput} onChange={e => setLegalNameInput(e.target.value)} style={fieldStyle} />
          <label style={labelStyle}>NIF</label>
          <input value={nifInput} onChange={e => setNifInput(e.target.value)} style={fieldStyle} />
          <label style={labelStyle}>Dirección</label>
          <input value={addressInput} onChange={e => setAddressInput(e.target.value)} style={fieldStyle} />
          <label style={labelStyle}>Población</label>
          <input value={cityInput} onChange={e => setCityInput(e.target.value)} style={fieldStyle} />
          <label style={labelStyle}>Código postal</label>
          <input value={postalCodeInput} onChange={e => setPostalCodeInput(e.target.value)} style={fieldStyle} />

          <p style={{ color: "#8A8A8A", fontSize: 10.5, textTransform: "uppercase", margin: "16px 0 8px" }}>Persona de contacto</p>
          <label style={labelStyle}>Nombre</label>
          <input value={contactFirstNameInput} onChange={e => setContactFirstNameInput(e.target.value)} style={fieldStyle} />
          <label style={labelStyle}>Apellido</label>
          <input value={contactLastNameInput} onChange={e => setContactLastNameInput(e.target.value)} style={fieldStyle} />
          <label style={labelStyle}>Cargo en el club</label>
          <input value={contactRoleInput} onChange={e => setContactRoleInput(e.target.value)} style={fieldStyle} />
          <label style={labelStyle}>Nº Teléfono</label>
          <input type="tel" value={contactPhoneInput} onChange={e => setContactPhoneInput(e.target.value)} style={{ ...fieldStyle, marginBottom: 12 }} />

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
            { id: "testPesos", label: "Datos de gim", sub: "Registra tus marcas de fuerza" },
            { id: "zonasErgo", label: "Datos ergo", sub: "Registra tus tiempos y ritmos de ergómetro" },
            { id: "medidas", label: "Medidas", sub: "Tus medidas de bote, a cargo del entrenador" },
            { id: "notas", label: "Notas", sub: "Tus apuntes personales, privados" },
            { id: "recordatorios", label: "Recordatorios", sub: "Notas del club y de tu equipo" },
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

// Editor de texto simple con negrita/cursiva/subrayado (marca el texto con **, _ y ~ por debajo,
// para poder guardarlo como texto plano sin depender de HTML)
function RichTextEditor({ value, onChange, placeholder, rows = 5 }) {
  const taRef = useRef(null);
  const wrap = (mark) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const already = value.slice(start - mark.length, start) === mark && value.slice(end, end + mark.length) === mark;
    let newValue, cursorStart, cursorEnd;
    if (already) {
      newValue = value.slice(0, start - mark.length) + selected + value.slice(end + mark.length);
      cursorStart = start - mark.length; cursorEnd = end - mark.length;
    } else {
      newValue = value.slice(0, start) + mark + selected + mark + value.slice(end);
      cursorStart = start + mark.length; cursorEnd = end + mark.length;
    }
    onChange(newValue);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(cursorStart, cursorEnd); });
  };
  const toolBtn = { background: "#333333", border: "1px solid #565656", borderRadius: 6, width: 30, height: 28, color: "#F5F5F5", fontSize: 12.5 };
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button type="button" className="vir-btn" onClick={() => wrap("**")} style={{ ...toolBtn, fontWeight: 800 }}>N</button>
        <button type="button" className="vir-btn" onClick={() => wrap("_")} style={{ ...toolBtn, fontStyle: "italic" }}>K</button>
        <button type="button" className="vir-btn" onClick={() => wrap("~")} style={{ ...toolBtn, textDecoration: "underline" }}>S</button>
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{ ...inputStyle, fontSize: 14, padding: "11px", width: "100%", resize: "vertical" }}
      />
    </div>
  );
}

// Interpreta las marcas **negrita**, _cursiva_ y ~subrayado~ de un texto guardado en plano
const parseRichSegments = (line) => {
  const parts = [];
  let remaining = line;
  let key = 0;
  const re = /\*\*(.+?)\*\*|_(.+?)_|~(.+?)~/;
  while (remaining.length > 0) {
    const m = remaining.match(re);
    if (!m) { parts.push(remaining); break; }
    if (m.index > 0) parts.push(remaining.slice(0, m.index));
    if (m[1] !== undefined) parts.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined) parts.push(<em key={key++}>{m[2]}</em>);
    else if (m[3] !== undefined) parts.push(<u key={key++}>{m[3]}</u>);
    remaining = remaining.slice(m.index + m[0].length);
  }
  return parts;
};
function RichText({ text, style }) {
  if (!text) return null;
  return (
    <p style={style}>
      {text.split("\n").map((line, i) => (
        <span key={i}>{i > 0 && <br />}{parseRichSegments(line)}</span>
      ))}
    </p>
  );
}

function NotesScreen({ notes, onSave, onBack }) {
  const [text, setText] = useState(notes || "");
  const dirty = text !== (notes || "");
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Notas</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>
        Tus apuntes personales — solo tú los ves, ni el club ni el entrenador tienen acceso a ellos.
      </p>
      <RichTextEditor value={text} onChange={setText} placeholder="Escribe aquí lo que necesites recordar..." rows={12} />
      <button className="vir-btn" disabled={!dirty} onClick={() => onSave(text)} style={{ ...primaryBtn, marginTop: 16, opacity: dirty ? 1 : 0.4 }}>
        Guardar
      </button>
    </div>
  );
}

function RowerMeasurementsScreen({ boats, measurements, myId, onBack }) {
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Medidas</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>
        🔒 Solo consulta — las gestiona el entrenador para cada bote.
      </p>
      {boats.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 13 }}>Todavía no hay ningún bote con medidas registradas.</p>}
      {boats.map(b => {
        const value = (measurements[b.id] || {})[myId];
        return (
          <div key={b.id} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
            <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 700, margin: "0 0 6px" }}>{b.name}</p>
            {value ? (
              <p className="vir-mono" style={{ color: "#E61E29", fontSize: 15, fontWeight: 700, margin: 0 }}>{value}</p>
            ) : (
              <p style={{ color: "#8A8A8A", fontSize: 12, margin: 0 }}>El entrenador todavía no ha registrado tu medida en este bote.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PesosScreen({ exercises, onAddExercise, onSetBase, onRemoveExercise, onBack, editable, subtitle }) {
  const [search, setSearch] = useState("");
  const [newExercise, setNewExercise] = useState("");

  const visible = exercises.filter(ex => ex.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Datos de gim</h2>
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
  const parseParts = (t) => {
    const m = (t || "").trim().match(/^(\d{1,2}):(\d{1,2})(?:\.(\d))?$/);
    return m ? { min: m[1], sec: m[2], tenths: m[3] || "" } : { min: "", sec: "", tenths: "" };
  };
  const [editingTest, setEditingTest] = useState(false);
  const [minInput, setMinInput] = useState("");
  const [secInput, setSecInput] = useState("");
  const [tenthsInput, setTenthsInput] = useState("");

  const baseWatts = wattsFromTestTime(testTime);

  const startEdit = () => {
    const parts = parseParts(testTime);
    setMinInput(parts.min); setSecInput(parts.sec); setTenthsInput(parts.tenths);
    setEditingTest(!editingTest);
  };
  const composed = () => {
    if (minInput === "" || secInput === "") return null;
    const sec = secInput.padStart(2, "0");
    return tenthsInput ? `${minInput}:${sec}.${tenthsInput}` : `${minInput}:${sec}`;
  };
  const saveTest = () => {
    const value = composed();
    if (value && parseErgoTime(value)) onSetTest(value);
    setEditingTest(false);
  };

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Datos ergo</h2>
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
          <button className="vir-btn" onClick={startEdit} style={{ background: "#333333", border: "1px solid #565656", borderRadius: 10, padding: "8px 10px", color: "#ADADAD" }}>
            <Pencil size={15} />
          </button>
        </div>
        {editingTest && (
          <div>
            <label style={{ fontSize: 12, color: "#ADADAD", marginBottom: 6, display: "block" }}>Tiempo TEST 1600</label>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <input
                  value={minInput}
                  onChange={e => setMinInput(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="0"
                  inputMode="numeric"
                  style={{ ...inputStyle, padding: "11px", fontSize: 18, width: "100%", textAlign: "center" }}
                />
                <p style={{ color: "#8A8A8A", fontSize: 10, textAlign: "center", margin: "4px 0 0" }}>minutos</p>
              </div>
              <p style={{ color: "#8A8A8A", fontSize: 20, margin: "0 0 20px" }}>:</p>
              <div style={{ flex: 1 }}>
                <input
                  value={secInput}
                  onChange={e => setSecInput(Math.min(59, +e.target.value.replace(/\D/g, "") || 0).toString().slice(0, 2))}
                  placeholder="00"
                  inputMode="numeric"
                  style={{ ...inputStyle, padding: "11px", fontSize: 18, width: "100%", textAlign: "center" }}
                />
                <p style={{ color: "#8A8A8A", fontSize: 10, textAlign: "center", margin: "4px 0 0" }}>segundos</p>
              </div>
              <p style={{ color: "#8A8A8A", fontSize: 20, margin: "0 0 20px" }}>.</p>
              <div style={{ flex: 1 }}>
                <input
                  value={tenthsInput}
                  onChange={e => setTenthsInput(e.target.value.replace(/\D/g, "").slice(0, 1))}
                  placeholder="0"
                  inputMode="numeric"
                  style={{ ...inputStyle, padding: "11px", fontSize: 18, width: "100%", textAlign: "center" }}
                />
                <p style={{ color: "#8A8A8A", fontSize: 10, textAlign: "center", margin: "4px 0 0" }}>décimas</p>
              </div>
            </div>
            <button className="vir-btn" disabled={!composed()} onClick={saveTest} style={{ ...primaryBtn, padding: "11px 0", fontSize: 13, opacity: composed() ? 1 : 0.4 }}>Guardar</button>
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

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Datos de gim y datos ergo</p>
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
    <div style={{ display: "flex", borderTop: "1px solid var(--vir-border, #565656)", background: "var(--vir-bg-surface-alt, #3A3A3A)" }}>
      {tabs.map(t => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button key={t.id} className="vir-btn" onClick={() => setScreen(t.id)} style={{
            flex: 1, background: "transparent", padding: "10px 0 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative",
          }}>
            <Icon size={19} color={isActive ? "var(--vir-red, #E61E29)" : "var(--vir-text-muted, #8A8A8A)"} />
            {!!t.badge && <span style={{ position: "absolute", top: 5, right: "28%", width: 7, height: 7, borderRadius: 4, background: "var(--vir-error, #FF8890)" }} />}
            <span style={{ fontSize: 10, color: isActive ? "var(--vir-red, #E61E29)" : "var(--vir-text-muted, #8A8A8A)", fontWeight: isActive ? 600 : 400 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const inputStyle = {
  width: "100%", background: "var(--vir-bg-input, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 10,
  padding: "11px 12px", color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, outline: "none",
};
const primaryBtn = {
  width: "100%", background: "var(--vir-red, #E61E29)", color: "#F5F5F5", fontWeight: 700, fontSize: 14,
  padding: "13px 0", borderRadius: 12,
};
const ghostBtn = {
  background: "transparent", border: "1px solid var(--vir-border, #565656)", color: "var(--vir-text-primary, #E8E8E8)", fontSize: 13,
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
