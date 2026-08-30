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
  babor: { label: "BABOR", letter: "B", color: "var(--vir-red, #E61E29)" },
  estribor: { label: "ESTRIBOR", letter: "E", color: "var(--vir-green, #3EA55A)" },
  ambos: { label: "AMBOS", letter: "B+E", color: "var(--vir-orange, #E67E22)" },
  patron: { label: "PATRÓN", letter: "P", color: "#22B8CF" },
};
// Etiquetas completas para el formulario de registro ("Función en el equipo")
const REGISTER_SIDE_OPTIONS = [
  { key: "babor", label: "Remero de Babor", letter: "B", color: "var(--vir-red, #E61E29)" },
  { key: "estribor", label: "Remero de Estribor", letter: "E", color: "var(--vir-green, #3EA55A)" },
  { key: "ambos", label: "Remero de ambos lados", letter: "B+E", color: "var(--vir-orange, #E67E22)" },
  { key: "patron", label: "Patrón", letter: "P", color: "#22B8CF" },
];
const TEAMS_SEED = [];
const ME_ROWER = "r1";
const ME_TEAM = ROWER_TEAM[ME_ROWER];
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
const MORNING_TIMES = ["06:00h", "07:00h", "08:00h", "09:00h", "10:00h", "11:00h", "12:00h"];
const AFTERNOON_TIMES = ["16:00h", "17:00h", "18:00h", "19:00h", "20:00h", "21:00h", "22:00h"];

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
    const iso = toLocalISODate(date);
    const isPast = date < today;
    sessions.push({
      id: `${teamId}-${iso}`, teamId, date, iso, dow, time: "",
      title: DEFAULT_SESSION_TITLE,
      active: false, // por defecto todos los días están desactivados; el entrenador activa los que correspondan
      suspendedReason: null,
      signups: new Set(),
      crews: [], // los botes de ese día se añaden aparte, uno o varios
    });
  }
  return sessions;
}

// Genera un día por cada fecha entre el inicio y el fin de temporada (ambos incluidos)
function buildSeasonSessions(teamId, startDateStr, endDateStr) {
  const sessions = [];
  const start = new Date(startDateStr + "T00:00:00");
  const end = new Date(endDateStr + "T00:00:00");
  const d = new Date(start);
  while (d <= end) {
    const dow = d.getDay();
    const iso = toLocalISODate(d);
    sessions.push({
      id: `${teamId}-${iso}`, teamId, date: new Date(d), iso, dow, time: "",
      title: DEFAULT_SESSION_TITLE,
      active: false,
      suspendedReason: null,
      signups: new Set(),
      crews: [],
    });
    d.setDate(d.getDate() + 1);
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
// Convierte una fecha a "AAAA-MM-DD" usando el día/mes/año LOCAL del dispositivo — nunca usar
// date.toISOString() para esto, porque pasa a hora UTC y puede desplazar la fecha un día
// (España va por delante de UTC, así que a medianoche local podría devolver el día anterior)
// Abre un archivo guardado como "data:" (base64) de la forma más fiable posible en móvil.
// Los navegadores, sobre todo Safari en iPhone, a veces fallan al abrir un PDF pasado
// directamente como data: URL — convertirlo primero a un Blob real lo soluciona.
const openFileReliably = (dataUrl) => {
  try {
    const [header, base64] = dataUrl.split(",");
    const mimeMatch = header.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch (e) {
    window.open(dataUrl, "_blank"); // si algo falla, al menos lo intentamos como antes
  }
};
// --- Notificaciones push ---
// Clave pública VAPID (no es sensible, se puede incrustar en el código sin problema —
// la privada, esa sí, se queda solo en el servidor, dentro de la función de Vercel)
const VAPID_PUBLIC_KEY = "BHGcpOyRcuEDfZ_fKLH-ExVzo3s5j9e-jamy5mtcgz98u2m6pOsKsrKRANEYNQIhDhQGSVWAsbObSiJddObWsJA";
const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
};

const toLocalISODate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
// El lunes (en formato ISO, ej. "2026-09-07") de la semana real a la que pertenece una fecha —
// se usa como identificador de semana ligado a fechas reales, en vez de un número suelto
const mondayOf = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return toLocalISODate(d);
};
// Número de semana de temporada (1, 2, 3...), contando desde la semana del inicio de temporada —
// el mismo número sirve tanto para agua como para gimnasio, ya que comparten temporada
const seasonWeekNumber = (seasonStartStr, mondayIso) => {
  if (!seasonStartStr || !mondayIso) return null;
  const seasonMonday = new Date(mondayOf(new Date(seasonStartStr + "T00:00:00")) + "T00:00:00");
  const wkMonday = new Date(mondayIso + "T00:00:00");
  return Math.round((wkMonday - seasonMonday) / (7 * 24 * 60 * 60 * 1000)) + 1;
};
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
        if (!w.week_start) return; // ignora las filas del sistema antiguo (numeradas 1-5 por mes)
        plans[w.team_id] = plans[w.team_id] || {};
        plans[w.team_id][w.week_start] = plans[w.team_id][w.week_start] || { activeDays: [], weekAttachments: [], days: {} };
        plans[w.team_id][w.week_start].activeDays = w.active_days || [];
        plans[w.team_id][w.week_start].weekAttachments = (w.attachments || []).map(a => ({ name: a.name, fileType: a.type, dataUrl: a.url }));
      });
      (gymDaysData || []).forEach(d => {
        if (!d.week_start) return;
        plans[d.team_id] = plans[d.team_id] || {};
        plans[d.team_id][d.week_start] = plans[d.team_id][d.week_start] || { activeDays: [], weekAttachments: [], days: {} };
        plans[d.team_id][d.week_start].days[d.day_key] = { content: d.content || "" };
      });
      setGymPlans(plans);
    }
  };
  const refetchGymCompletions = async () => {
    const { data: gymCompletionsData } = await supabase.from("gym_completions").select("*");
    if (gymCompletionsData) {
      const completion = {};
      gymCompletionsData.forEach(c => {
        if (!c.week_start) return;
        completion[c.rower_id] = completion[c.rower_id] || {};
        completion[c.rower_id][`${c.team_id}-${c.week_start}-${c.day_key}`] = { done: c.done, validated: !!c.validated, photos: c.photos || [] };
      });
      setGymCompletion(completion);
    }
  };
  // Carga en dos tiempos: primero solo lo imprescindible para que se vea el inicio cuanto antes
  // (usuarios, equipos, entrenos, avisos y alertas — lo que se ve directamente en esa pantalla),
  // y justo después, sin bloquear nada, el resto de datos (regatas, gimnasio, notas, medidas...)
  const loadEssentialData = async () => {
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
          authUserId: u.auth_user_id,
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
        setTeams(teamsData.map(t => ({ id: t.id, clubId: t.club_id, name: t.name, code: t.code, seasonStart: t.season_start, seasonEnd: t.season_end })));
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
  };

  // Todo lo que no hace falta para el primer vistazo — se carga justo después, sin bloquear
  const loadSecondaryData = async () => {
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
  // Se mantiene por compatibilidad con quien ya llamaba a loadData() a secas (por ejemplo, tras
  // regenerar una temporada) — recarga las dos partes, una detrás de otra
  const loadData = async () => {
    await loadEssentialData();
    await loadSecondaryData();
  };

  // Nota: la restauración automática de sesión al abrir la app se ha probado y aparcado por ahora
  // (pendiente de retomar más adelante) — de momento la app siempre pide entrar con usuario/contraseña.

  useEffect(() => {
    loadEssentialData().then(() => { loadSecondaryData(); });
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
        const mapped = { id: t.id, clubId: t.club_id, name: t.name, code: t.code, seasonStart: t.season_start, seasonEnd: t.season_end };
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
          authUserId: u.auth_user_id,
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
    const newTeam = { id: data.id, clubId: data.club_id, name: data.name, code: data.code, seasonStart: null, seasonEnd: null };
    setTeams(prev => [...prev, newTeam]);
    flash(`Tripulación "${name}" creada — configura su temporada desde "Entrenos de agua"`);
  };
  // Define (o vuelve a definir) el inicio y el fin de temporada de una tripulación, y regenera
  // desde cero todo su calendario de entrenos de agua para que cubra la temporada entera
  // Amplía o recorta la temporada de una tripulación:
  // - Lo que ya existía dentro del nuevo rango se deja intacto, tal cual estaba
  // - Lo que se añade (rango ampliado) se genera nuevo, vacío
  // - Lo que queda fuera (rango acortado) se elimina, avisando antes si tenía actividad de por medio
  const setTeamSeason = async (teamId, startDate, endDate) => {
    const existingForTeam = sessions.filter(s => s.teamId === teamId);
    const outOfRange = existingForTeam.filter(s => s.iso < startDate || s.iso > endDate);

    if (outOfRange.length > 0) {
      const withData = outOfRange.filter(s => s.active || (s.crews && s.crews.length > 0) || s.signups.size > 0);
      if (withData.length > 0) {
        const ok = window.confirm(
          `Al acortar la temporada se perderían ${withData.length} día${withData.length === 1 ? "" : "s"} que ya tenía${withData.length === 1 ? "" : "n"} actividad (entreno activado, botes o gente apuntada). ¿Seguro que quieres continuar?`
        );
        if (!ok) return;
      }
      const idsToDelete = outOfRange.map(s => s.id);
      const { error: delErr } = await supabase.from("water_sessions").delete().in("id", idsToDelete);
      if (delErr) { flash("No se pudo actualizar el calendario. Inténtalo de nuevo."); return; }
    }

    const { error: teamErr } = await supabase.from("teams").update({ season_start: startDate, season_end: endDate }).eq("id", teamId);
    if (teamErr) { flash("No se pudo guardar la temporada. Inténtalo de nuevo."); return; }

    // Solo generamos los días del nuevo rango que todavía no existieran
    const existingIsos = new Set(existingForTeam.filter(s => s.iso >= startDate && s.iso <= endDate).map(s => s.iso));
    const allSeasonDays = buildSeasonSessions(teamId, startDate, endDate);
    const missingDays = allSeasonDays.filter(s => !existingIsos.has(s.iso));

    if (missingDays.length > 0) {
      const rows = missingDays.map(s => ({
        id: s.id, team_id: s.teamId, date: s.iso, iso: s.iso, dow: s.dow, time: s.time, title: s.title,
        active: s.active, suspended_reason: s.suspendedReason, signups: [],
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from("water_sessions").insert(rows.slice(i, i + 200));
        if (error) { flash("Temporada guardada, pero hubo un problema generando parte del calendario."); return; }
      }
    }

    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, seasonStart: startDate, seasonEnd: endDate } : t));
    setSessions(prev => [
      ...prev.filter(s => !(s.teamId === teamId && (s.iso < startDate || s.iso > endDate))),
      ...missingDays,
    ]);
    const parts = [];
    if (missingDays.length > 0) parts.push(`${missingDays.length} día${missingDays.length === 1 ? "" : "s"} nuevo${missingDays.length === 1 ? "" : "s"}`);
    if (outOfRange.length > 0) parts.push(`${outOfRange.length} eliminado${outOfRange.length === 1 ? "" : "s"}`);
    flash(parts.length > 0 ? `Temporada actualizada: ${parts.join(", ")}` : "Temporada guardada");
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
    const teamPast = sessions.filter(s => s.teamId === myTeamId && s.active && hasPassed(s, today));
    const monthPast = teamPast.filter(s => s.date.getMonth() === today.getMonth() && s.date.getFullYear() === today.getFullYear());
    const monthAttended = monthPast.filter(s => inCrew(s, currentUserId)).length;
    const monthTotal = monthPast.length;
    const seasonAttended = teamPast.filter(s => inCrew(s, currentUserId)).length;
    const seasonTotal = teamPast.length;
    const myTeam = teams.find(t => t.id === myTeamId);
    const seasonLabel = (myTeam?.seasonStart && myTeam?.seasonEnd)
      ? `${new Date(myTeam.seasonStart).getFullYear()}-${new Date(myTeam.seasonEnd).getFullYear()}`
      : String(today.getFullYear());
    return {
      month: { label: MONTHS_ES[today.getMonth()], attended: monthAttended, total: monthTotal },
      year: { label: seasonLabel, attended: seasonAttended, total: seasonTotal },
    };
  }, [sessions, currentUserId, myTeamId, teams]);

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
    // Blindaje: si algún apuntado ya no existe de verdad (cuenta eliminada sin limpiar del todo),
    // lo ignoramos aquí en vez de dejar que rompa el guardado de todas las notificaciones
    const validIds = new Set(assignedUsers.map(u => u.id));
    [...session.signups].filter(rid => validIds.has(rid)).forEach(rid => {
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
      // Push a cada remero avisado (el resumen del entrenador, rowerId null, no lleva push aquí)
      notes.filter(n => n.rowerId).forEach(n => sendPushToRower(n.rowerId, "VIRADA", n.text));
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
  // --- Notificaciones push: suscribirse, desuscribirse, y mandar un aviso a un dispositivo ---
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const checkPushSubscribed = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setPushSubscribed(false); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setPushSubscribed(!!sub);
    } catch { setPushSubscribed(false); }
  };
  useEffect(() => { checkPushSubscribed(); }, []);

  const subscribeToPush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      flash("Este dispositivo o navegador no admite avisos push.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { flash("No has dado permiso para recibir avisos."); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { flash("No se pudo identificar tu cuenta. Inténtalo de nuevo."); return; }
      const json = sub.toJSON();
      const { error } = await supabase.from("push_subscriptions").upsert(
        { auth_user_id: user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
        { onConflict: "endpoint" }
      );
      if (error) { flash("No se pudo activar el aviso en este dispositivo. Inténtalo de nuevo."); return; }
      setPushSubscribed(true);
      flash("Avisos activados en este dispositivo");
    } catch (e) {
      flash("No se pudo activar el aviso en este dispositivo.");
    }
  };
  const unsubscribeFromPush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setPushSubscribed(false);
      flash("Avisos desactivados en este dispositivo");
    } catch (e) {
      flash("No se pudo desactivar. Inténtalo de nuevo.");
    }
  };
  // Manda un push a todos los dispositivos suscritos de una persona (por su id de auth.users)
  const sendPushToAuthUser = async (authUserId, title, body, url) => {
    if (!authUserId) return;
    const { data: subs } = await supabase.from("push_subscriptions").select("*").eq("auth_user_id", authUserId);
    if (!subs || subs.length === 0) return;
    await Promise.all(subs.map(sub =>
      fetch("/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          title, body, url,
        }),
      }).catch(() => {})
    ));
  };
  // Igual, pero a partir del id de remero/entrenador (users.id), resolviendo su auth_user_id
  const sendPushToRower = async (rowerId, title, body) => {
    const au = assignedUsers.find(u => u.id === rowerId);
    if (au && au.authUserId) await sendPushToAuthUser(au.authUserId, title, body, "/");
  };

  const dispatchBroadcast = async (broadcast) => {
    const recipients = recipientsFor(broadcast);
    if (recipients.length > 0) {
      const { error } = await supabase.from("notifications").insert(
        recipients.map(rid => ({ rower_id: rid, session_id: null, text: `📌 ${broadcast.text}` }))
      ).select();
      if (error) { flash("El aviso se guardó, pero hubo un problema al enviarlo a todos."); }
      else { recipients.forEach(rid => sendPushToRower(rid, "VIRADA", broadcast.text)); }
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

  const [gymPlans, setGymPlans] = useState({}); // { [teamId]: { [weekStartIso]: { activeDays: [...], weekAttachments: [...], days: { lun: {content}, ... } } } }
  const [gymCompletion, setGymCompletion] = useState({}); // { [rowerId]: { "teamId-weekStartIso-day": { done, photos: [{dataUrl,kind}] } } }
  const currentWeek = Math.ceil(today.getDate() / 7);
  const currentGymWeek = mondayOf(today); // semana real (lunes ISO), ligada a fechas de verdad
  const gymWeekMeta = (teamId, week) => (gymPlans[teamId] && gymPlans[teamId][week]) || { activeDays: [], weekAttachments: [], days: {} };
  // vista "plana" por día, para las pantallas que solo necesitan el contenido de texto de cada día
  const gymWeekPlan = (teamId, week) => gymWeekMeta(teamId, week).days || {};
  const setGymActiveDays = async (teamId, week, activeDays) => {
    setGymPlans(prev => {
      const meta = (prev[teamId] || {})[week] || { activeDays: [], weekAttachments: [], days: {} };
      return { ...prev, [teamId]: { ...(prev[teamId] || {}), [week]: { ...meta, activeDays } } };
    });
    const { error } = await supabase.from("gym_weeks").upsert(
      { team_id: teamId, week_start: week, active_days: activeDays },
      { onConflict: "team_id,week_start" }
    );
    if (error) flash("No se pudo guardar. Inténtalo de nuevo.");
  };
  const addGymWeekAttachment = async (teamId, week, attachment) => {
    const current = ((gymPlans[teamId] || {})[week] || {}).weekAttachments || [];
    const next = [...current, attachment];
    setGymPlans(prev => {
      const meta = (prev[teamId] || {})[week] || { activeDays: [], weekAttachments: [], days: {} };
      return { ...prev, [teamId]: { ...(prev[teamId] || {}), [week]: { ...meta, weekAttachments: next } } };
    });
    const { error } = await supabase.from("gym_weeks").upsert(
      { team_id: teamId, week_start: week, attachments: next.map(a => ({ name: a.name, type: a.fileType, url: a.dataUrl })) },
      { onConflict: "team_id,week_start" }
    );
    if (error) { flash("No se pudo guardar el archivo. Inténtalo de nuevo."); return; }
    flash("Archivo de la semana añadido");
  };
  const removeGymWeekAttachment = async (teamId, week, index) => {
    const current = ((gymPlans[teamId] || {})[week] || {}).weekAttachments || [];
    const next = current.filter((_, i) => i !== index);
    setGymPlans(prev => {
      const meta = (prev[teamId] || {})[week] || { activeDays: [], weekAttachments: [], days: {} };
      return { ...prev, [teamId]: { ...(prev[teamId] || {}), [week]: { ...meta, weekAttachments: next } } };
    });
    const { error } = await supabase.from("gym_weeks").upsert(
      { team_id: teamId, week_start: week, attachments: next.map(a => ({ name: a.name, type: a.fileType, url: a.dataUrl })) },
      { onConflict: "team_id,week_start" }
    );
    if (error) { flash("No se pudo eliminar el archivo. Inténtalo de nuevo."); return; }
    flash("Archivo de la semana eliminado");
  };
  const setGymContent = async (teamId, week, day, content) => {
    setGymPlans(prev => {
      const meta = (prev[teamId] || {})[week] || { activeDays: [], weekAttachments: [], days: {} };
      return { ...prev, [teamId]: { ...(prev[teamId] || {}), [week]: { ...meta, days: { ...meta.days, [day]: { ...(meta.days[day] || {}), content } } } } };
    });
    const { error } = await supabase.from("gym_days").upsert(
      { team_id: teamId, week_start: week, day_key: day, content },
      { onConflict: "team_id,week_start,day_key" }
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
      { rower_id: rowerId, team_id: teamId, week_start: week, day_key: day, done: true, photos },
      { onConflict: "rower_id,team_id,week_start,day_key" }
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
        .eq("rower_id", rowerId).eq("team_id", teamId).eq("week_start", week).eq("day_key", day);
    } else {
      await supabase.from("gym_completions").upsert(
        { rower_id: rowerId, team_id: teamId, week_start: week, day_key: day, done: true, photos },
        { onConflict: "rower_id,team_id,week_start,day_key" }
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
      .eq("rower_id", rowerId).eq("team_id", teamId).eq("week_start", week).eq("day_key", day);
  };

  // El remero marca (o desmarca) que ha hecho su entreno de gimnasio — se queda en naranja,
  // pendiente de que el entrenador lo corrobore
  const toggleGymSelfReport = async (rowerId, teamId, week, day) => {
    const key = `${teamId}-${week}-${day}`;
    const existing = (gymCompletion[rowerId] || {})[key];
    if (existing && existing.done) {
      // desmarca su propio check (por si se ha equivocado); si ya estaba validado por el
      // entrenador, se avisa antes de quitarlo
      if (existing.validated && !window.confirm("El entrenador ya había validado este entreno. ¿Seguro que quieres desmarcarlo?")) return;
      await clearGymRecord(rowerId, teamId, week, day);
      return;
    }
    setGymCompletion(prev => ({ ...prev, [rowerId]: { ...(prev[rowerId] || {}), [key]: { done: true, validated: false, photos: [] } } }));
    const { error } = await supabase.from("gym_completions").upsert(
      { rower_id: rowerId, team_id: teamId, week_start: week, day_key: day, done: true, validated: false },
      { onConflict: "rower_id,team_id,week_start,day_key" }
    );
    if (error) { flash("No se pudo guardar. Inténtalo de nuevo."); return; }
    flash("Entreno marcado como hecho — pendiente de que el entrenador lo corrobore");
  };

  // El entrenador corrobora (o quita la corroboración de) un entreno que el remero ya marcó
  const toggleGymValidation = async (rowerId, teamId, week, day) => {
    const key = `${teamId}-${week}-${day}`;
    const existing = (gymCompletion[rowerId] || {})[key];
    if (!existing || !existing.done) return; // no se puede validar lo que el remero no ha marcado
    const nextValidated = !existing.validated;
    setGymCompletion(prev => ({ ...prev, [rowerId]: { ...(prev[rowerId] || {}), [key]: { ...existing, validated: nextValidated } } }));
    const { error } = await supabase.from("gym_completions").upsert(
      { rower_id: rowerId, team_id: teamId, week_start: week, day_key: day, done: true, validated: nextValidated },
      { onConflict: "rower_id,team_id,week_start,day_key" }
    );
    if (error) { flash("No se pudo guardar. Inténtalo de nuevo."); return; }
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
    // Recorre las semanas reales (por su lunes) que caen dentro del mes actual
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const seen = new Set();
    const d = new Date(monthStart);
    while (d <= monthEnd) {
      const wk = mondayOf(d);
      if (!seen.has(wk)) {
        seen.add(wk);
        const meta = gymWeekMeta(teamId, wk);
        (meta.activeDays || []).forEach(day => {
          monthTotal++;
          const rec = gymRecordOf(rowerId, teamId, wk, day);
          const done = !!(rec && rec.done);
          if (done) monthDone++;
          if (wk === currentGymWeek) {
            weekTotal++;
            if (done) weekDone++;
          }
        });
      }
      d.setDate(d.getDate() + 1);
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

  const LOGO_DARK_SRC = "/logo-dark.png"; // texto blanco, para fondos oscuros
  const LOGO_LIGHT_SRC = "/logo-light.png"; // texto gris oscuro, para fondos claros
  const Logo = ({ size = 22, variant }) => {
    const useLight = (variant || theme) === "light";
    return <img src={useLight ? LOGO_LIGHT_SRC : LOGO_DARK_SRC} alt="VIRADA" style={{ height: size * 1.8, width: "auto", display: "block" }} />;
  };

  return (
    <div className="vir-app-backdrop" data-theme={theme} style={{ display: "flex", justifyContent: "center", padding: "24px 8px", background: "var(--vir-bg-page, #262626)" }}>
      <style>{`
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
          --vir-bg-surface: var(--vir-bg-surface, #404040);
          --vir-bg-surface-alt: var(--vir-bg-surface-alt, #3A3A3A);
          --vir-bg-input: var(--vir-bg-surface, #404040);
          --vir-border: var(--vir-border, #565656);
          --vir-text-primary: var(--vir-text-primary, #F5F5F5);
          --vir-text-secondary: var(--vir-text-secondary, #ADADAD);
          --vir-text-muted: var(--vir-text-muted, #8A8A8A);
          --vir-red: var(--vir-red, #E61E29);
          --vir-green: var(--vir-green, #3EA55A);
          --vir-orange: var(--vir-orange, #E67E22);
          --vir-danger: var(--vir-danger, #E24B4A);
          --vir-danger-bg: var(--vir-danger-bg, #402226);
          --vir-signed-bg: #3D2A2C;
          --vir-signed-text: #F0A8AC;
          --vir-success-text: #9FE1CB;
          --vir-success-bg: var(--vir-success-bg, #1E3A2A);
          --vir-warning-bg: var(--vir-warning-bg, #3D2E17);
          --vir-error: var(--vir-error, #FF8890);
          --vir-boat-bg: #333333;
          --vir-boat-zodiac-bg: #333333;
          --vir-week-divider: #FFFFFF;
          --vir-boat-label: var(--vir-text-muted, #8A8A8A);
          --vir-boat-name: var(--vir-text-primary, #F5F5F5);
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
          --vir-signed-bg: #FBE4E3;
          --vir-signed-text: #C93A38;
          --vir-success-text: #2E8B4F;
          --vir-success-bg: #E3F3E9;
          --vir-warning-bg: #FBEFDF;
          --vir-error: #C93A38;
          --vir-boat-bg: #E6E6E6;
          --vir-boat-zodiac-bg: #E6E6E6;
          --vir-week-divider: var(--vir-red, #E61E29);
          --vir-boat-label: #333333;
          --vir-boat-name: #333333;
        }

        /* En un móvil de verdad (pantalla estrecha), la app ocupa la pantalla entera —
           el marco decorativo de "teléfono" solo tiene sentido viéndolo en un ordenador */
        @media (max-width: 480px) {
          .vir-app-backdrop { padding: 0 !important; }
          .vir-app {
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            border-radius: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
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
          <div style={{ position: "absolute", top: 14, left: 14, right: 14, zIndex: 50, background: "var(--vir-text-primary, #F5F5F5)", border: "1px solid var(--vir-red, #E61E29)", color: "#B5151E", padding: "10px 14px", borderRadius: 10, fontSize: 13, textAlign: "center", fontWeight: 600 }}>{toast}</div>
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
            <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--vir-border, var(--vir-border, #565656))", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Logo size={26} />
              <button className="vir-btn" onClick={async () => { await supabase.auth.signOut(); setScreen("login"); setRole(null); setOpenSession(null); setCurrentClubId(null); setCurrentUserId(null); }} style={{ background: "transparent", color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))" }}>
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
                  onSetSeason={setTeamSeason}
                />
              )}
              {screen === "coachGymPlan" && (role === "coach" || role === "admin") && (
                <CoachGymPlanScreen
                  teamId={coachScope}
                  teams={clubTeams}
                  setScope={setCoachScope}
                  currentGymWeek={currentGymWeek}
                  weekMetaFor={gymWeekMeta}
                  onSaveContent={setGymContent}
                  onSaveActiveDays={setGymActiveDays}
                  onAddWeekAttachment={addGymWeekAttachment}
                  onRemoveWeekAttachment={removeGymWeekAttachment}
                  onBack={() => setScreen("home")}
                  editable={role === "admin" ? true : canManage(coachScope)}
                  onOpenSeason={() => setScreen("coachPlan")}
                />
              )}
              {screen === "rowerGymPlan" && role === "rower" && (
                <RowerGymPlanScreen
                  teamId={teamOf(currentUserId)}
                  teamName={teamName}
                  seasonStart={clubTeams.find(t => t.id === teamOf(currentUserId))?.seasonStart}
                  seasonEnd={clubTeams.find(t => t.id === teamOf(currentUserId))?.seasonEnd}
                  currentGymWeek={currentGymWeek}
                  weekMetaFor={gymWeekMeta}
                  recordFor={(teamId, week, day) => gymRecordOf(currentUserId, teamId, week, day)}
                  onToggleReport={(teamId, week, day) => toggleGymSelfReport(currentUserId, teamId, week, day)}
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
                  currentGymWeek={currentGymWeek}
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
                  sessions={coachScope === "club" ? sessions : sessions.filter(s => s.teamId === coachScope)}
                  gymWeekMetaFor={gymWeekMeta}
                  gymRecordFor={gymRecordOf}
                  currentGymWeek={currentGymWeek}
                  onToggleValidation={toggleGymValidation}
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
                  teams={clubTeams}
                  statsFor={statsFor}
                  totalPastActive={totalPastActiveFor(teamOf(openPerson.id))}
                  pesosExercises={pesosExercisesOf(openPerson.id)}
                  ergoTest={ergoTestTimes[openPerson.id] ? Math.round(wattsFromTestTime(ergoTestTimes[openPerson.id])) : null}
                  currentWeek={currentWeek}
                  currentGymWeek={currentGymWeek}
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
                  currentGymWeek={currentGymWeek}
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
                  roleOf={roleOf}
                  managedTeamsOf={managedTeamsOf}
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
                  pushSubscribed={pushSubscribed}
                  onSubscribePush={subscribeToPush}
                  onUnsubscribePush={unsubscribeFromPush}
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
                  currentGymWeek={currentGymWeek}
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
    <label style={{ fontSize: 12, color: "var(--vir-text-secondary, #ADADAD)", margin: "0 0 6px", display: "flex", alignItems: "center", gap: 5 }}>
      <span>{text}</span>
      {required ? (
        filled
          ? <Check size={13} color="var(--vir-green, #3EA55A)" />
          : <span style={{ color: "var(--vir-red, #E61E29)", fontWeight: 800, fontSize: 14 }}>*</span>
      ) : (
        <span style={{ color: "var(--vir-text-muted, #8A8A8A)", fontWeight: 400, fontSize: 11 }}>(opcional)</span>
      )}
      {hint && <span style={{ color: "var(--vir-text-muted, #8A8A8A)", fontWeight: 400, fontSize: 11 }}>{hint}</span>}
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
      <div style={{ width: 56, height: 56, borderRadius: 28, background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
        <KeyRound size={22} color="var(--vir-text-muted, #8A8A8A)" />
      </div>
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "var(--vir-text-primary, #F5F5F5)", margin: "0 0 8px" }}>Cuenta creada</h2>
      <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 13, lineHeight: 1.5, margin: "0 0 4px" }}>
        {user ? `¡Bienvenido/a, ${user.apodo || user.username}!` : "Tu cuenta se ha creado."} Todavía no tienes acceso a la app.
      </p>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, lineHeight: 1.5, margin: "0 0 24px" }}>
        El club revisará tu solicitud y te asignará un rol — entrenador o remero — y, si corresponde, una tripulación. En cuanto lo haga, podrás entrar con tu usuario y contraseña.
      </p>
      <button className="vir-btn" onClick={onBack} style={{ ...ghostBtn, padding: "11px 24px" }}>Volver al inicio</button>
    </div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ padding: "20px 20px 4px" }}>
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 24, color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", margin: 0, letterSpacing: 0.4 }}>{children}</h2>
      {sub && <p style={{ color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", fontSize: 12.5, margin: "3px 0 0" }}>{sub}</p>}
    </div>
  );
}

function SessionRow({ s, onOpen, right, teamLabel, semaphore, hasAlert }) {
  const dow = DAYS_ES[s.dow];
  const closedBoats = (s.crews || []).filter(c => c.status === "cerrado").map(c => c.boat);
  return (
    <div className="vir-btn" onClick={() => onOpen(s)} style={{ padding: "12px 16px", background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {semaphore && (
            <span title={semaphore.label} style={{ width: 10, height: 10, borderRadius: "50%", background: semaphore.color, flexShrink: 0 }} />
          )}
          <div style={{ width: 42, textAlign: "center" }}>
            <div className="vir-mono" style={{ color: "var(--vir-red, #E61E29)", fontSize: 18, lineHeight: 1 }}>{s.date.getDate()}</div>
            <div style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10, textTransform: "uppercase" }}>{dow}</div>
          </div>
          <div>
            <div style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 500 }}>{s.title || DEFAULT_SESSION_TITLE}{teamLabel ? ` · ${teamLabel}` : ""}</div>
            <div className="vir-mono" style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11.5 }}>{s.time}</div>
          </div>
        </div>
        {right}
      </div>
      {closedBoats.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--vir-border, #565656)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span title={hasAlert ? "Alguien se ha dado de baja — revisa la alineación" : "Todo confirmado y cerrado"} style={{ width: 8, height: 8, borderRadius: "50%", background: hasAlert ? "var(--vir-red, #E61E29)" : "var(--vir-green, #3EA55A)", flexShrink: 0 }} />
          <Anchor size={11} color="var(--vir-text-muted, #8A8A8A)" style={{ flexShrink: 0 }} />
          <span style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11 }}>{closedBoats.join(" · ")}</span>
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
  if (closedCrews.length === 0) return { color: "var(--vir-danger, #E24B4A)", label: "Tripulación aún por cerrar" };
  if (!myCrew) return { color: "var(--vir-danger, #E24B4A)", label: "No convocado/a" };
  const isCalled = myCrew.seats.includes(myId) || myCrew.patron === myId || (myCrew.zodiac && myCrew.zodiac.includes(myId));
  if (isCalled) return { color: "var(--vir-green, #3EA55A)", label: "Convocado/a para remar" };
  return { color: "var(--vir-orange, #E67E22)", label: "De reserva" };
};

function Badge({ text, tone, onClick }) {
  const tones = {
    open: { bg: "var(--vir-bg-surface-alt, var(--vir-bg-surface-alt, #454545))", color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))" },
    signed: { bg: "var(--vir-signed-bg, #3D2A2C)", color: "var(--vir-signed-text, #F0A8AC)" },
    selected: { bg: "var(--vir-text-primary, #F5F5F5)", color: "#B5151E" },
    closed: { bg: "var(--vir-bg-surface, #3D3D3D)", color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" },
    action: { bg: "var(--vir-red, var(--vir-red, #E61E29))", color: "var(--vir-text-primary, #F5F5F5)" },
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
        { id: "estadisticas", label: "Estadísticas", sub: "Asistencia, agua y gimnasio, todo junto", icon: BarChart3 },
      ],
    },
    {
      label: "Tú",
      tiles: [
        { id: "notas", label: "Notas", sub: "Tus apuntes personales, privados", icon: Pencil },
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
        <div style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 4px" }}>Asistencia este año</p>
              <p className="vir-mono" style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 26, fontWeight: 700, margin: 0 }}>{pct}%</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 4px" }}>Convocado / Entrenado</p>
              <p className="vir-mono" style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 15, fontWeight: 700, margin: 0 }}>{crewStats.convocado} / {crewStats.entrenado}</p>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--vir-border, var(--vir-border, #565656))", paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", fontSize: 11.5, margin: 0 }}>
              {registeredExercises > 0 ? `Datos de gim: ${registeredExercises} ejercicio${registeredExercises > 1 ? "s" : ""} registrado${registeredExercises > 1 ? "s" : ""}` : "Todavía no has registrado ningún dato de gim."}
            </p>
            <p style={{ color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", fontSize: 11.5, margin: 0 }}>
              {ergoTest ? `TEST 1600: ${ergoTest} W` : "Todavía no has registrado tu TEST 1600 de ergómetro."}
            </p>
          </div>
        </div>
      </div>

      {tileGroups.map(group => (
        <div key={group.label} style={{ padding: "10px 16px 4px" }}>
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>{group.label}</p>
          {group.tiles.map(t => {
            const Icon = t.icon;
            return (
              <div key={t.id} className="vir-btn" onClick={() => onNavigate(t.id)} style={{
                background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12,
                padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10,
              }}>
                <Icon size={20} color="var(--vir-red, var(--vir-red, #E61E29))" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.label}</p>
                  <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>{t.sub}</p>
                </div>
                <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ padding: "14px 16px 0" }}>
        <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>Próximos entrenos</p>
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
        <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>Alcance de acceso</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ScopeChip active={scope === "club"} onClick={() => setScope("club")} label="Todo el club" />
          {teams.map(t => (
            <ScopeChip key={t.id} active={scope === t.id} onClick={() => setScope(t.id)} label={t.name} />
          ))}
        </div>
      </div>
      <div style={{ padding: "4px 16px 10px" }}>
        <div className="vir-btn" onClick={onPlanCalendar} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <Waves size={20} color="var(--vir-red, var(--vir-red, #E61E29))" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Entrenos de agua</p>
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>Activa días de entreno y edita su título</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
        </div>
        <div className="vir-btn" onClick={onGymPlan} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <Dumbbell size={20} color="var(--vir-red, var(--vir-red, #E61E29))" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Plan de gimnasio semanal</p>
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>Marca los días de la semana y sube el contenido</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
        </div>
        <div className="vir-btn" onClick={onTeamStats} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <BarChart3 size={20} color="var(--vir-red, var(--vir-red, #E61E29))" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Estadísticas de tripulación</p>
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>Frecuencia, convocatorias y entrenos de agua</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
        </div>
        <div className="vir-btn" onClick={onOpenInformes} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <ClipboardList size={20} color="var(--vir-red, var(--vir-red, #E61E29))" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Informes</p>
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>Diario, semanal y mensual · exportables a PDF</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
        </div>
        <div className="vir-btn" onClick={onOpenMeasurements} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <Ruler size={20} color="var(--vir-red, var(--vir-red, #E61E29))" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Medidas</p>
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>Medidas de cada remero por bote</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
        </div>
        <div className="vir-btn" onClick={onOpenFleet} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <Sailboat size={20} color="var(--vir-red, var(--vir-red, #E61E29))" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Botes</p>
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>Crea o elimina la flota de esta tripulación</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
        </div>
        <div className="vir-btn" onClick={onOpenRegattas} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <Trophy size={20} color="var(--vir-red, var(--vir-red, #E61E29))" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Calendario de regatas</p>
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>Fechas, dosieres, horarios y resultados</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
        </div>
        <div className="vir-btn" onClick={onOpenReminders} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
          <StickyNote size={20} color="var(--vir-red, var(--vir-red, #E61E29))" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Recordatorios</p>
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>Nota fija para tu equipo, y avisos puntuales</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
        </div>
      </div>
      <div style={{ padding: "10px 16px" }}>
        {sessions.length === 0 && <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 13 }}>Esta tripulación no tiene entrenos activos próximamente.</p>}
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

// Control de gimnasio de una tripulación: el entrenador ve, semana a semana, quién ha marcado
// su entreno (naranja) y puede corroborarlo tocándolo (pasa a verde)
function TeamGymControlBlock({ team, members, gymWeekMetaFor, gymRecordFor, onToggleValidation, currentGymWeek }) {
  const [week, setWeek] = useState(currentGymWeek);
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);

  if (!team?.seasonStart || !team?.seasonEnd) {
    return <p style={{ color: "var(--vir-orange, #E67E22)", fontSize: 12, marginBottom: 20 }}>Esta tripulación todavía no tiene temporada configurada.</p>;
  }

  const seasonMonths = [];
  {
    const d = new Date(team.seasonStart + "T00:00:00");
    d.setDate(1);
    const end = new Date(team.seasonEnd + "T00:00:00");
    while (d.getFullYear() < end.getFullYear() || (d.getFullYear() === end.getFullYear() && d.getMonth() <= end.getMonth())) {
      seasonMonths.push({ year: d.getFullYear(), month: d.getMonth(), key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS_ES[d.getMonth()] });
      d.setMonth(d.getMonth() + 1);
    }
  }
  const weekDate = new Date(week + "T00:00:00");
  const weekMonthKey = `${weekDate.getFullYear()}-${weekDate.getMonth()}`;
  const currentMonthKey = (() => { const d = new Date(currentGymWeek + "T00:00:00"); return `${d.getFullYear()}-${d.getMonth()}`; })();
  const activeMonthKey = selectedMonthKey && seasonMonths.some(m => m.key === selectedMonthKey)
    ? selectedMonthKey
    : (seasonMonths.some(m => m.key === weekMonthKey) ? weekMonthKey : (seasonMonths.some(m => m.key === currentMonthKey) ? currentMonthKey : seasonMonths[0]?.key));

  const [ay, am] = activeMonthKey.split("-").map(Number);
  const monthStart = new Date(ay, am, 1);
  const monthEnd = new Date(ay, am + 1, 0);
  const seasonStartDate = new Date(team.seasonStart + "T00:00:00");
  const seasonEndDate = new Date(team.seasonEnd + "T00:00:00");
  const weeksOfMonth = [];
  {
    const seen = new Set();
    const d = new Date(monthStart);
    while (d <= monthEnd) {
      if (d >= seasonStartDate && d <= seasonEndDate) {
        const wk = mondayOf(d);
        if (!seen.has(wk)) { seen.add(wk); weeksOfMonth.push(wk); }
      }
      d.setDate(d.getDate() + 1);
    }
  }

  const weekLabel = (mondayIso) => {
    const mon = new Date(mondayIso + "T00:00:00");
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const sameMonth = mon.getMonth() === sun.getMonth();
    return sameMonth ? `${mon.getDate()}-${sun.getDate()} ${MONTHS_ES[mon.getMonth()].slice(0, 3)}` : `${mon.getDate()} ${MONTHS_ES[mon.getMonth()].slice(0, 3)} - ${sun.getDate()} ${MONTHS_ES[sun.getMonth()].slice(0, 3)}`;
  };

  const meta = gymWeekMetaFor(team.id, week);
  const activeDays = WEEK_DAY_KEYS.filter(d => (meta.activeDays || []).includes(d));

  return (
    <div style={{ marginBottom: 28 }}>
      {(() => {
        const byYear = {};
        seasonMonths.forEach(m => { (byYear[m.year] = byYear[m.year] || []).push(m); });
        return Object.entries(byYear).map(([year, months]) => (
          <div key={year} style={{ marginBottom: 10 }}>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, fontWeight: 700, margin: "0 0 6px" }}>{year}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {months.map(m => {
                const active = m.key === activeMonthKey;
                return (
                  <button key={m.key} className="vir-btn" onClick={() => setSelectedMonthKey(m.key)} style={{
                    padding: "8px 4px", borderRadius: 10, fontSize: 11, fontWeight: active ? 700 : 500, whiteSpace: "nowrap", textAlign: "center",
                    background: active ? "var(--vir-red, #E61E29)" : "var(--vir-bg-surface, #404040)",
                    border: `1px solid ${active ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)"}`,
                    color: active ? "#FFFFFF" : "var(--vir-text-secondary, #ADADAD)",
                  }}>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        ));
      })()}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0 16px" }}>
        {weeksOfMonth.map(wk => {
          const active = wk === week;
          const wn = seasonWeekNumber(team.seasonStart, wk);
          return (
            <button key={wk} className="vir-btn" onClick={() => setWeek(wk)} style={{
              padding: "8px 12px", borderRadius: 10, fontWeight: active ? 700 : 500,
              background: active ? "var(--vir-red, #E61E29)" : "var(--vir-bg-surface, #404040)",
              border: `1px solid ${active ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)"}`,
              color: active ? "#FFFFFF" : "var(--vir-text-secondary, #ADADAD)",
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
            }}>
              {wn && <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>Semana {wn}</span>}
              <span style={{ fontSize: 11.5 }}>{weekLabel(wk)}{wk === currentGymWeek ? " · actual" : ""}</span>
            </button>
          );
        })}
      </div>

      {activeDays.length === 0 ? (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5 }}>Sin días de gimnasio marcados esta semana.</p>
      ) : (
        <div>
          <div style={{ display: "flex", marginBottom: 8, paddingLeft: 4 }}>
            <div style={{ flex: 1 }} />
            {activeDays.map(day => (
              <div key={day} style={{ width: 40, textAlign: "center", fontSize: 9.5, color: "var(--vir-text-muted, #8A8A8A)", fontWeight: 700, textTransform: "uppercase" }}>{WEEK_DAY_LABELS[day].slice(0, 3)}</div>
            ))}
          </div>
          {members.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0, color: "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 6 }}>
                {m.nickname || m.name}
              </div>
              {activeDays.map(day => {
                const rec = gymRecordFor(m.id, team.id, week, day);
                const done = !!(rec && rec.done);
                const validated = !!(rec && rec.validated);
                return (
                  <div key={day} style={{ width: 40, display: "flex", justifyContent: "center" }}>
                    <button
                      className="vir-btn"
                      disabled={!done}
                      onClick={() => onToggleValidation(m.id, team.id, week, day)}
                      title={validated ? "Corroborado — toca para quitar la validación" : done ? "Marcado por el remero — toca para corroborar" : "Todavía no marcado"}
                      style={{
                        width: 30, height: 30, borderRadius: 15,
                        background: validated ? "var(--vir-green, #3EA55A)" : done ? "var(--vir-orange, #E67E22)" : "var(--vir-bg-surface-alt, #3A3A3A)",
                        border: `1px solid ${validated ? "var(--vir-green, #3EA55A)" : done ? "var(--vir-orange, #E67E22)" : "var(--vir-border, #565656)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: done ? "pointer" : "default",
                      }}
                    >
                      {done && <Check size={14} color="#FFFFFF" />}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--vir-text-muted, #8A8A8A)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: "var(--vir-orange, #E67E22)" }} /> Marcado por el remero
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--vir-text-muted, #8A8A8A)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: "var(--vir-green, #3EA55A)" }} /> Corroborado
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function CoachTeamStatsScreen({ onBack, scope, teams, teamOf, teamName, allPeople, statsFor, totalPastActiveFor, onOpenPerson, sessions, gymWeekMetaFor, gymRecordFor, currentGymWeek, onToggleValidation }) {
  const [section, setSection] = useState("stats"); // "stats" | "gymControl"
  const [block, setBlock] = useState("colectivo"); // "individual" | "colectivo"
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
    ? teams.map(t => ({ id: t.id, label: t.name, members: people.filter(p => teamOf(p.id) === t.id), total: totalPastActiveFor(t.id), team: t })).filter(g => g.members.length > 0)
    : [{ id: scope, label: teamName(scope), members: people, total: totalPastActiveFor(scope), team: teams.find(t => t.id === scope) }];

  // Estadísticas colectivas de una tripulación concreta: agua por bote, suspendidos, y gimnasio de temporada
  const collectiveStatsFor = (g) => {
    const teamSessions = sessions.filter(s => s.teamId === g.id);
    const boatCounts = {};
    teamSessions.forEach(s => {
      (s.crews || []).filter(c => c.status === "cerrado").forEach(c => {
        boatCounts[c.boat] = (boatCounts[c.boat] || 0) + 1;
      });
    });
    const suspended = teamSessions.filter(s => !s.active && s.suspendedReason).length;

    let gymSessions = 0, gymPossible = 0, gymDone = 0;
    if (g.team?.seasonStart) {
      let wk = mondayOf(new Date(g.team.seasonStart + "T00:00:00"));
      const end = currentGymWeek;
      let guard = 0;
      while (wk <= end && guard < 104) { // tope de seguridad: 2 años de semanas
        const meta = gymWeekMetaFor(g.id, wk);
        const activeDays = meta.activeDays || [];
        gymSessions += activeDays.length;
        activeDays.forEach(day => {
          g.members.forEach(m => {
            gymPossible++;
            const rec = gymRecordFor(m.id, g.id, wk, day);
            if (rec && rec.done) gymDone++;
          });
        });
        const d = new Date(wk + "T00:00:00"); d.setDate(d.getDate() + 7); wk = toLocalISODate(d);
        guard++;
      }
    }
    const gymAttendancePct = gymPossible > 0 ? Math.round((gymDone / gymPossible) * 100) : 0;
    return { boatCounts, suspended, gymSessions, gymAttendancePct, totalWater: g.total };
  };

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", margin: "10px 0 2px" }}>Equipo</h2>
      <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "0 0 16px" }}>Alcance: {scope === "club" ? "todo el club" : teamName(scope)}{scope !== "club" ? ` · ${scopeTotalPastActive} entrenos de agua realizados` : ""}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <ScopeChip active={section === "stats"} onClick={() => setSection("stats")} label="Estadísticas de tripulación" />
        <ScopeChip active={section === "gymControl"} onClick={() => setSection("gymControl")} label="Control de gim" />
      </div>

      {section === "gymControl" && (
        <>
          {groups.length === 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13 }}>No hay tripulaciones en este alcance.</p>}
          {groups.map(g => (
            <div key={g.id}>
              {scope === "club" && (
                <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>{g.label}</p>
              )}
              <TeamGymControlBlock
                team={g.team}
                members={g.members}
                gymWeekMetaFor={gymWeekMetaFor}
                gymRecordFor={gymRecordFor}
                onToggleValidation={onToggleValidation}
                currentGymWeek={currentGymWeek}
              />
            </div>
          ))}
        </>
      )}

      {section === "stats" && (
        <>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <ScopeChip active={block === "colectivo"} onClick={() => setBlock("colectivo")} label="Colectivo" />
        <ScopeChip active={block === "individual"} onClick={() => setBlock("individual")} label="Individual" />
      </div>

      {block === "individual" && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
            <StatCard label="Convocatorias totales" value={aggregate.convocado} />
            <StatCard label="Entrenados en total" value={aggregate.entrenado} />
            <StatCard label="Asistencia media" value={`${avgFreq}%`} />
          </div>

          {people.length === 0 && <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 13 }}>No hay remeros en este alcance.</p>}

          {groups.map(g => (
            <div key={g.id} style={{ marginBottom: 18 }}>
              {scope === "club" && (
                <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>{g.label} · {g.total} entrenos de agua realizados</p>
              )}
              {g.members.map(p => {
                const s = statsFor(p.id);
                const freq = g.total > 0 ? Math.round((s.entrenado / g.total) * 100) : 0;
                return (
                  <div key={p.id} className="vir-btn" onClick={() => onOpenPerson(p)} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div>
                        <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{p.name}</p>
                        {p.nickname && <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "2px 0 0" }}>"{p.nickname}"</p>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="vir-mono" style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 16, fontWeight: 700 }}>{freq}%</span>
                        <ChevronRight size={16} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
                      </div>
                    </div>
                    <div style={{ height: 5, background: "var(--vir-border, var(--vir-border, #565656))", borderRadius: 3, marginBottom: 10, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${freq}%`, background: "var(--vir-red, var(--vir-red, #E61E29))", borderRadius: 3 }} />
                    </div>
                    <div style={{ display: "flex", gap: 16 }}>
                      <span style={{ fontSize: 11.5, color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))" }}>Convocado al entreno de agua: <span className="vir-mono" style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))" }}>{s.convocado}</span></span>
                      <span style={{ fontSize: 11.5, color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))" }}>Entrenado agua: <span className="vir-mono" style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))" }}>{s.entrenado}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}

      {block === "colectivo" && (
        <>
          {groups.length === 0 && <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 13 }}>No hay tripulaciones en este alcance.</p>}
          {groups.map(g => {
            const cs = collectiveStatsFor(g);
            const boatEntries = Object.entries(cs.boatCounts).sort((a, b) => b[1] - a[1]);
            return (
              <div key={g.id} style={{ marginBottom: 26 }}>
                {scope === "club" && (
                  <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>{g.label}</p>
                )}

                <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 8px" }}>Entrenos de agua</p>
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <StatCard label="Entrenos totales" value={cs.totalWater} />
                  <StatCard label="Suspendidos" value={cs.suspended} />
                </div>
                {boatEntries.length > 0 && (
                  <div style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "12px 14px", marginBottom: 18 }}>
                    <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 8px" }}>Entrenos por bote</p>
                    {boatEntries.map(([boat, count]) => (
                      <div key={boat} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", fontSize: 12.5 }}>{boat}</span>
                        <span className="vir-mono" style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 12.5, fontWeight: 700 }}>{count}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 8px" }}>Entrenos de gimnasio</p>
                <div style={{ display: "flex", gap: 10 }}>
                  <StatCard label="% asistencia del equipo" value={`${cs.gymAttendancePct}%`} />
                  <StatCard label="Entrenos programados" value={cs.gymSessions} />
                </div>
                {!g.team?.seasonStart && (
                  <p style={{ color: "var(--vir-orange, var(--vir-orange, #E67E22))", fontSize: 11, margin: "8px 0 0" }}>Esta tripulación todavía no tiene temporada configurada.</p>
                )}
              </div>
            );
          })}
        </>
      )}
        </>
      )}
    </div>
  );
}

function CoachRowerDetailScreen({ person, onBack, teamName, teamOf, teams, statsFor, totalPastActive, pesosExercises, ergoTest, currentWeek, currentGymWeek, weekPlanFor, recordFor, waterWeekMonth, gymWeekMonth, onViewPhoto, onOpenPesos }) {
  const s = statsFor(person.id);
  const freq = totalPastActive > 0 ? Math.round((s.entrenado / totalPastActive) * 100) : 0;
  const registeredExercises = pesosExercises.filter(ex => ex.baseKg).length;
  const hasGymLogs = registeredExercises > 0 || !!ergoTest;
  const teamId = teamOf(person.id);
  const weekLabel = (mondayIso) => {
    const mon = new Date(mondayIso + "T00:00:00");
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const sameMonth = mon.getMonth() === sun.getMonth();
    return sameMonth ? `${mon.getDate()}-${sun.getDate()} ${MONTHS_ES[mon.getMonth()].slice(0, 3)}` : `${mon.getDate()} ${MONTHS_ES[mon.getMonth()].slice(0, 3)} - ${sun.getDate()} ${MONTHS_ES[sun.getMonth()].slice(0, 3)}`;
  };
  // Últimas 10 semanas reales, de la más reciente a la más antigua
  const weeks = [];
  { const d = new Date(currentGymWeek + "T00:00:00"); for (let i = 0; i < 10; i++) { weeks.push(toLocalISODate(d)); d.setDate(d.getDate() - 7); } }
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "10px 0 20px" }}>
        <div style={{ width: 52, height: 52, borderRadius: 26, background: "var(--vir-bg-surface-alt, var(--vir-bg-surface-alt, #454545))", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--vir-red, var(--vir-red, #E61E29))", fontWeight: 700, fontSize: 18, fontFamily: "'Big Shoulders Display', sans-serif" }}>
          {person.name.split(" ").map(n => n[0]).join("")}
        </div>
        <div>
          <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontWeight: 700, fontSize: 16, margin: 0 }}>{person.name}</p>
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 12, margin: "3px 0 0" }}>
            {person.nickname ? `"${person.nickname}" · ` : ""}{teamName(teamId)}
          </p>
        </div>
      </div>

      <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Entrenos de agua</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <StatCard label="Convocado" value={s.convocado} />
        <StatCard label="Entrenado" value={s.entrenado} />
        <StatCard label="Frecuencia" value={`${freq}%`} />
      </div>
      <div style={{ height: 6, background: "var(--vir-border, var(--vir-border, #565656))", borderRadius: 3, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${freq}%`, background: "var(--vir-red, var(--vir-red, #E61E29))", borderRadius: 3 }} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <AttendanceCard label={`Agua · semana ${currentWeek}`} attended={waterWeekMonth.weekDone} total={waterWeekMonth.weekTotal} />
        <AttendanceCard label="Agua · este mes" attended={waterWeekMonth.monthDone} total={waterWeekMonth.monthTotal} />
      </div>

      <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Entrenos de gim · check semanal</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <AttendanceCard label={`Gim · ${weekLabel(currentGymWeek)}`} attended={gymWeekMonth.weekDone} total={gymWeekMonth.weekTotal} unitLabel="hecho" />
        <AttendanceCard label="Gim · este mes" attended={gymWeekMonth.monthDone} total={gymWeekMonth.monthTotal} unitLabel="hecho" />
      </div>
      {weeks.map(week => {
        const plan = weekPlanFor(teamId, week);
        const items = FISICO_SLOTS.filter(slot => plan[slot] && plan[slot].content);
        if (items.length === 0) return null;
        const wn = seasonWeekNumber(teams.find(t => t.id === teamId)?.seasonStart, week);
        return (
          <div key={week} style={{ marginBottom: 14 }}>
            {wn && <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 2px" }}>Semana {wn}</p>}
            <p style={{ color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", fontSize: 11, margin: "0 0 6px" }}>{weekLabel(week)}{week === currentGymWeek ? " · actual" : ""}</p>
            {items.map(slot => {
              const record = recordFor(teamId, week, slot);
              const done = !!(record && record.done);
              return (
                <div key={slot} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: `1px solid ${done ? "var(--vir-green, var(--vir-green, #3EA55A))" : "var(--vir-border, var(--vir-border, #565656))"}`, borderRadius: 10, padding: "9px 12px", marginBottom: 6 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: done ? "var(--vir-green, var(--vir-green, #3EA55A))" : "var(--vir-border, var(--vir-border, #565656))",
                  }}>
                    {done && <Check size={13} color="#FFFFFF" />}
                  </div>
                  <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 12.5, margin: 0, flex: 1 }}>{FISICO_LABELS[slot]}</p>
                  {done && record.photos && record.photos.length > 0 && (
                    <div style={{ display: "flex", gap: 3 }}>
                      {record.photos.slice(0, 3).map((p, i) => (
                        p.kind === "pdf" ? (
                          <div key={i} onClick={() => openFileReliably(p.dataUrl)} style={{ width: 30, height: 30, borderRadius: 6, background: "var(--vir-bg-surface-alt, #333333)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                            <KeyRound size={13} color="var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))" />
                          </div>
                        ) : (
                          <img
                            key={i}
                            src={p.dataUrl}
                            alt="Toca para ampliar"
                            onClick={() => onViewPhoto(p.dataUrl, `${FISICO_LABELS[slot]} · ${weekLabel(week)} · ${person.name}`)}
                            style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover", cursor: "pointer", flexShrink: 0 }}
                          />
                        )
                      ))}
                      {record.photos.length > 3 && <span style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10, alignSelf: "center" }}>+{record.photos.length - 3}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {weeks.every(week => FISICO_SLOTS.every(slot => !weekPlanFor(teamId, week)[slot])) && (
        <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 12.5 }}>Todavía no hay plan de gimnasio subido para esta tripulación.</p>
      )}

      <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "22px 0 10px" }}>Datos de gim y datos ergo</p>
      {hasGymLogs ? (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <StatCard label="Ejercicios con marca" value={registeredExercises} />
            <StatCard label="TEST 1600" value={ergoTest ? `${ergoTest} W` : "—"} />
          </div>
        </>
      ) : (
        <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
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
        <div style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 6px" }}>Número de club</p>
          <p className="vir-mono" style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: 1 }}>{clubCode}</p>
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "8px 0 0", lineHeight: 1.4 }}>
            Se generó automáticamente al crear la cuenta. Compártelo con tus entrenadores para que accedan a sus tripulaciones, y úsalo también para volver a entrar como club desde la pantalla de inicio.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <StatCard label="Tripulaciones" value={teams.length} />
          <StatCard label="Entrenadores" value={coachCount} />
          <StatCard label="Remeros" value={rowerCount} />
        </div>

        <div className="vir-btn" onClick={onManageUsers} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Usuarios del club</p>
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>Filtra por categoría, asigna tripulaciones y cambia roles</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
        </div>

        <div className="vir-btn" onClick={onManageTeams} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Tripulaciones y categorías</p>
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>{teams.map(t => t.name).join(" · ")}</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
        </div>

        <div className="vir-btn" onClick={onOpenRegattas} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
          <Trophy size={20} color="var(--vir-red, var(--vir-red, #E61E29))" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Calendario de regatas</p>
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>Fechas, dosieres, horarios y resultados</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
        </div>

        <div className="vir-btn" onClick={onOpenReminders} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
          <StickyNote size={20} color="var(--vir-red, var(--vir-red, #E61E29))" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Recordatorios</p>
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>Nota fija para todos, y avisos puntuales</p>
          </div>
          <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ flex: 1, background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
      <p className="vir-mono" style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 20, fontWeight: 700, margin: 0 }}>{value}</p>
      <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, margin: "4px 0 0" }}>{label}</p>
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
          <div style={{ background: "var(--vir-danger-bg, var(--vir-danger-bg, #402226))", border: "1px solid var(--vir-red, var(--vir-red, #E61E29))", borderRadius: 14, padding: 16, marginBottom: 18 }}>
            <p style={{ color: "var(--vir-error, var(--vir-error, #FF8890))", fontSize: 11.5, fontWeight: 700, margin: "0 0 6px" }}>Acceso de soporte y administración</p>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
              VIRADA está pensada para dar servicio a varios clubes a la vez, cada uno con su propio código de acceso y su estructura de entrenadores y remeros, completamente independiente del resto. Elige un club para entrar en su estructura.
            </p>
          </div>

          <StatCard label="Clubes dados de alta en esta sesión" value={clubs.length} />

          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "18px 0 10px" }}>Clubes</p>
          {clubs.length === 0 && <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 13 }}>Todavía no se ha registrado ningún club en esta sesión.</p>}
          {clubs.map(c => (
            <div key={c.id} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", marginBottom: 10 }}>
              <div className="vir-btn" onClick={() => onSwitchClub(c.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{c.name}</p>
                  <p className="vir-mono" style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>Código {c.code}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    className="vir-btn"
                    onClick={(e) => { e.stopPropagation(); setDeletingId(deletingId === c.id ? null : c.id); setConfirmText(""); }}
                    style={{ background: "transparent", color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", padding: 4 }}
                    title="Eliminar club"
                  >
                    <X size={16} />
                  </button>
                  <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
                </div>
              </div>

              {deletingId === c.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--vir-border, var(--vir-border, #565656))" }}>
                  <p style={{ color: "var(--vir-error, var(--vir-error, #FF8890))", fontSize: 12, fontWeight: 700, margin: "0 0 6px" }}>⚠ Esto elimina el club por completo</p>
                  <p style={{ color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", fontSize: 11.5, lineHeight: 1.5, margin: "0 0 12px" }}>
                    Se borrarán para siempre el club "{c.name}", todos sus usuarios, tripulaciones, entrenos de agua y plan de gimnasio. No se puede deshacer.
                  </p>
                  <label style={{ fontSize: 11.5, color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", marginBottom: 6, display: "block" }}>
                    Escribe <span style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontWeight: 700 }}>{c.name}</span> para confirmar
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
                        flex: 1, background: confirmText === c.name ? "var(--vir-red, var(--vir-red, #E61E29))" : "var(--vir-border, var(--vir-border, #565656))", color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))",
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
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: 0 }}>Explorando: <span style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontWeight: 600 }}>{clubDisplayName}</span></p>
          <button className="vir-btn" onClick={() => onSwitchClub(null)} style={{ background: "transparent", color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", fontSize: 11, textDecoration: "underline" }}>Cambiar de club</button>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <StatCard label="Clubes en total" value={clubs.length} />
          <StatCard label="Tripulaciones" value={teamsCount} />
          <StatCard label="Entrenadores" value={coachCount} />
          <StatCard label="Remeros" value={rowerCount} />
        </div>
        <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, margin: "0 0 18px", lineHeight: 1.4 }}>
          Club: {clubDisplayName} (código {clubCode}).
        </p>

        {links.map(l => (
          <div key={l.label} className="vir-btn" onClick={l.onClick} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{l.label}</p>
              <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "3px 0 0" }}>{l.sub}</p>
            </div>
            <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" />
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
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 6px" }}>Añadir documento</p>
      <label style={{ fontSize: 11.5, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 4, display: "block" }}>Título</label>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Ej. Dossier, Horarios, Resultados..."
        style={{ ...inputStyle, padding: "9px 11px", fontSize: 12.5, marginBottom: 10 }}
      />
      <label style={{ fontSize: 11.5, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 4, display: "block" }}>Archivo</label>
      <label className="vir-btn" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--vir-bg-surface, #404040)", border: "1px dashed var(--vir-border, #565656)", borderRadius: 10, padding: "11px 0", color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12.5, cursor: "pointer" }}>
        <Camera size={15} />
        Subir archivo (PDF o JPG)
        <input type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg" style={{ display: "none" }} onChange={handleFile} />
      </label>
      {error && <p style={{ color: "var(--vir-error, #FF8890)", fontSize: 10.5, margin: "6px 2px 0" }}>{error}</p>}
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
    <div key={r.id} className="vir-btn" onClick={() => onOpenRace(activeCat.id, r.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 74, textAlign: "center" }}>
          <p className="vir-mono" style={{ color: "var(--vir-red, #E61E29)", fontSize: 12.5, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{r.dateLabel}</p>
          {raceCountdownLabel(r.dateLabel) && (
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 9, margin: "2px 0 0", lineHeight: 1.2 }}>{raceCountdownLabel(r.dateLabel)}</p>
          )}
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{r.title || "Sin título todavía"}</p>
            {isRacePast(r.dateLabel) && (
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: "var(--vir-green, #3EA55A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Check size={11} color="#FFFFFF" />
              </span>
            )}
          </div>
          {r.docs.length > 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "3px 0 0" }}>📎 {r.docs.length} documento{r.docs.length > 1 ? "s" : ""}</p>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {editable && (
          <button className="vir-btn" onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Eliminar el día "${r.dateLabel}${r.title ? " · " + r.title : ""}"? Se perderán también sus documentos.`)) onRemoveRace(activeCat.id, r.id); }} style={{ background: "transparent", color: "var(--vir-text-muted, #8A8A8A)", padding: 4 }}>
            <X size={15} />
          </button>
        )}
        <ChevronRight size={16} color="var(--vir-text-muted, #8A8A8A)" />
      </div>
    </div>
  );

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 16px" }}>Calendario de regatas</h2>

      {categories.length === 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13 }}>Todavía no hay categorías de regatas.</p>}

      {categories.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {categories.map(c => (
            <ScopeChip key={c.id} active={tab === c.id} onClick={() => setTab(c.id)} label={c.name} />
          ))}
        </div>
      )}

      {editable && (
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 6, display: "block" }}>Nueva categoría</label>
          <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Ej. LLAGUT" style={{ ...inputStyle, padding: "11px", fontSize: 16, width: "100%", marginBottom: 10 }} />
          <button className="vir-btn" onClick={() => { onAddCategory(newCatName); setNewCatName(""); }} style={{ ...primaryBtn, padding: "11px 0", fontSize: 13 }}>Crear</button>
        </div>
      )}

      {activeCat && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: 0 }}>{activeCat.name}</p>
            {editable && (
              <button className="vir-btn" onClick={() => { if (window.confirm(`¿Eliminar la categoría "${activeCat.name}" entera? Se perderán todos sus días de regata y documentos.`)) onRemoveCategory(activeCat.id); }} style={{ background: "transparent", color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, textDecoration: "underline" }}>Eliminar categoría</button>
            )}
          </div>

          {sortedRaces.length === 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, marginBottom: 14 }}>Sin días de regata todavía.</p>}

          {subcats.length > 0 ? (
            <>
              {orderedSubcats.filter(sc => sortedRaces.some(r => r.subcategory === sc)).map(sc => (
                <div key={sc} style={{ marginBottom: 14 }}>
                  <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11.5, fontWeight: 700, margin: "0 0 8px" }}>{sc}</p>
                  {sortedRaces.filter(r => r.subcategory === sc).map(raceRow)}
                </div>
              ))}
              {sortedRaces.some(r => !r.subcategory) && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11.5, fontWeight: 700, margin: "0 0 8px" }}>Otras</p>
                  {sortedRaces.filter(r => !r.subcategory).map(raceRow)}
                </div>
              )}
            </>
          ) : (
            sortedRaces.map(raceRow)
          )}

          {editable && (
            <div style={{ background: "var(--vir-bg-surface-alt, #3A3A3A)", border: "1px dashed var(--vir-border, #565656)", borderRadius: 12, padding: 14, marginTop: 6 }}>
              <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Nuevo día de regata</p>

              <label style={{ fontSize: 12, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 6, display: "block" }}>Fecha</label>
              <input value={newDate} onChange={e => setNewDate(e.target.value)} placeholder="Ej. 6 Març" style={{ ...inputStyle, padding: "11px", fontSize: 16, width: "100%", marginBottom: 12 }} />

              <label style={{ fontSize: 12, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 6, display: "block" }}>Título / lugar (opcional)</label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ej. Roses" style={{ ...inputStyle, padding: "11px", fontSize: 16, width: "100%", marginBottom: 12 }} />

              <label style={{ fontSize: 12, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 6, display: "block" }}>Subcategoría (opcional)</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {["", "LLAGUT", "LLAÜT MEDITERRANEO Y BATEL"].map(sc => (
                  <button key={sc || "none"} className="vir-btn" onClick={() => setNewSubcat(sc)} style={{
                    padding: "8px 13px", borderRadius: 20, fontSize: 12,
                    background: newSubcat === sc ? "var(--vir-red, #E61E29)" : "var(--vir-bg-surface, #404040)",
                    border: `1px solid ${newSubcat === sc ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)"}`,
                    color: newSubcat === sc ? "#FFFFFF" : "var(--vir-text-primary, #F5F5F5)", fontWeight: newSubcat === sc ? 600 : 400,
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
    else openFileReliably(doc.dataUrl);
  };

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <p className="vir-mono" style={{ color: "var(--vir-red, #E61E29)", fontSize: 14, fontWeight: 700, margin: "10px 0 2px" }}>{r.dateLabel}</p>
      {raceCountdownLabel(r.dateLabel) && (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, margin: "0 0 4px" }}>{raceCountdownLabel(r.dateLabel)}</p>
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
          <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: 0 }}>{r.title || "Sin título todavía"}</h2>
          {editable && (
            <button className="vir-btn" onClick={() => setEditingTitle(true)} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 10, padding: "8px 10px", color: "var(--vir-text-secondary, #ADADAD)" }}>
              <Pencil size={15} />
            </button>
          )}
        </div>
      )}

      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: 0 }}>Información</p>
          {editable && !editingNotes && (
            <button className="vir-btn" onClick={() => setEditingNotes(true)} style={{ background: "transparent", color: "var(--vir-text-muted, #8A8A8A)", padding: 4 }}>
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
          <p style={{ color: r.notes ? "var(--vir-text-secondary, #ADADAD)" : "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
            {r.notes || "El club todavía no ha añadido información para este día."}
          </p>
        )}
      </div>

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Documentos</p>
      {r.docs.length === 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, marginBottom: 18 }}>Todavía no hay documentos para este día.</p>}
      {r.docs.map(d => (
        <div key={d.id} className="vir-btn" onClick={() => openDoc(d)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#333333", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {d.fileType === "pdf" ? <KeyRound size={15} color="var(--vir-text-secondary, #ADADAD)" /> : <Camera size={15} color="var(--vir-text-secondary, #ADADAD)" />}
            </div>
            <div>
              <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13, fontWeight: 600, margin: 0 }}>{d.label}</p>
              <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, margin: "2px 0 0" }}>{d.name}</p>
            </div>
          </div>
          {editable && (
            <button className="vir-btn" onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Eliminar el documento "${d.label}"?`)) onRemoveDoc(d.id); }} style={{ background: "transparent", color: "var(--vir-text-muted, #8A8A8A)", padding: 4 }}>
              <X size={15} />
            </button>
          )}
        </div>
      ))}

      {editable && (
        <div style={{ background: "var(--vir-bg-surface-alt, #3A3A3A)", border: "1px dashed var(--vir-border, #565656)", borderRadius: 12, padding: 14, marginTop: 8 }}>
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
          <div style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 8px" }}>Rol</p>
            <div style={{ display: "flex", borderRadius: 20, overflow: "hidden", border: "1px solid var(--vir-border, #565656)", marginBottom: 16 }}>
              {[{ id: "coach", label: "Entrenador" }, { id: "rower", label: "Remero" }].map(r => (
                <button key={r.id} className="vir-btn" onClick={() => onSetRole(openPerson.id, r.id)} style={{
                  flex: 1, padding: "9px 0", fontSize: 12, fontWeight: 600,
                  background: role === r.id ? "var(--vir-red, #E61E29)" : "transparent",
                  color: role === r.id ? "var(--vir-text-primary, #F5F5F5)" : "var(--vir-text-muted, #8A8A8A)", border: "none",
                }}>{r.label}</button>
              ))}
            </div>

            {role === "rower" ? (
              <div>
                <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 6px" }}>Categoría</p>
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
                <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 8px" }}>Tripulaciones que puede gestionar</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                  {teams.map(t => {
                    const managed = managedTeamsOf(openPerson.id).includes(t.id);
                    return (
                      <button key={t.id} className="vir-btn" onClick={() => onToggleCoachTeam(openPerson.id, t.id)} style={{
                        padding: "6px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 600,
                        background: managed ? "var(--vir-green, #3EA55A)" : "var(--vir-bg-surface, #404040)",
                        border: `1px solid ${managed ? "var(--vir-green, #3EA55A)" : "var(--vir-border, #565656)"}`,
                        color: managed ? "#FFFFFF" : "var(--vir-text-secondary, #ADADAD)",
                      }}>{managed ? "✓ " : ""}{t.name}</button>
                    );
                  })}
                </div>
                <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "6px 0 0", lineHeight: 1.4 }}>
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
            style={{ background: "transparent", color: "var(--vir-error, #F09595)", fontSize: 12, textDecoration: "underline", marginTop: 16 }}
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
          <Search size={15} color="var(--vir-text-muted, #8A8A8A)" style={{ position: "absolute", left: 12, top: 12 }} />
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
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "10px 2px 10px" }}>Pendientes de asignación ({pendingUsers.length})</p>
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
        {visible.length === 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13 }}>Sin usuarios que coincidan.</p>}
        {visible.map(p => {
          const role = roleOf(p.id);
          return (
            <div key={p.id} className="vir-btn" onClick={() => setOpenId(p.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <div>
                <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{p.name}</p>
                {p.nickname && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, margin: "2px 0 0" }}>"{p.nickname}"</p>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 10.5, fontWeight: 600,
                  background: role === "coach" ? "#22B8CF22" : "var(--vir-green, #3EA55A)22",
                  color: role === "coach" ? "#22B8CF" : "var(--vir-green, #3EA55A)",
                }}>{role === "coach" ? "Entrenador" : "Remero"}</span>
                <ChevronRight size={16} color="var(--vir-text-muted, #8A8A8A)" />
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
    <div style={{ background: "var(--vir-bg-surface-alt, #3A3A3A)", border: "1px dashed var(--vir-red, #E61E29)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ marginBottom: 10 }}>
        <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{user.username}</p>
        {user.apodo && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "2px 0 0" }}>"{user.apodo}" · {SIDE_META[user.side]?.label}</p>}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", borderRadius: 20, overflow: "hidden", border: "1px solid var(--vir-border, #565656)", flex: 1 }}>
          {[{ id: "coach", label: "Entrenador" }, { id: "rower", label: "Remero" }].map(r => (
            <button key={r.id} className="vir-btn" onClick={() => setRole(r.id)} style={{
              flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 600,
              background: role === r.id ? "var(--vir-red, #E61E29)" : "transparent",
              color: role === r.id ? "var(--vir-text-primary, #F5F5F5)" : "var(--vir-text-muted, #8A8A8A)", border: "none",
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
        <button className="vir-btn" onClick={() => { if (window.confirm(`¿Eliminar la solicitud de "${user.username}"? Tendría que registrarse de nuevo para volver a pedir acceso.`)) onReject(user.id); }} style={{ background: "transparent", border: "1px solid var(--vir-border, #565656)", borderRadius: 10, color: "var(--vir-error, #FF8890)", padding: "9px 14px", fontSize: 12.5 }}>
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
            <div key={t.id} className="vir-btn" onClick={() => onOpenTeam(t)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, marginBottom: 10 }}>
              <div>
                <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.name}</p>
                <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>{count} remeros</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="vir-mono" style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12 }}>{t.code}</span>
                <button className="vir-btn" onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Eliminar la tripulación "${t.name}"? Se perderán sus entrenos de agua, plan de gimnasio y remeros dejarán de tenerla asignada.`)) onRemoveTeam(t.id); }} style={{ background: "transparent", color: "var(--vir-text-muted, #8A8A8A)", padding: 4, borderRadius: 8 }} title="Eliminar tripulación">
                  <X size={16} />
                </button>
                <ChevronRight size={16} color="var(--vir-text-muted, #8A8A8A)" />
              </div>
            </div>
          );
        })}

        <div style={{ marginTop: 18, background: "var(--vir-bg-surface-alt, #3A3A3A)", border: "1px dashed var(--vir-border, #565656)", borderRadius: 12, padding: 14 }}>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Nueva tripulación o categoría</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Veteranos" style={{ ...inputStyle, flex: 1 }} />
            <button className="vir-btn" onClick={submit} style={{ background: "var(--vir-red, #E61E29)", color: "var(--vir-text-primary, #F5F5F5)", fontWeight: 700, fontSize: 13, padding: "0 18px", borderRadius: 10 }}>Crear</button>
          </div>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, margin: "8px 2px 0" }}>Se generará un código de tripulación automáticamente para compartir con el entrenador.</p>
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
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>{team.name}</h2>
      <p className="vir-mono" style={{ color: "var(--vir-red, #E61E29)", fontSize: 13, margin: "0 0 4px" }}>{team.code}</p>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "0 0 16px" }}>
        {rowerCount} remero{rowerCount === 1 ? "" : "s"}{coachCount > 0 ? ` · ${coachCount} entrenador${coachCount === 1 ? "" : "es"}` : ""}
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <StatCard label="Días entrenados de agua" value={trainedDays} />
        <StatCard label="Suspendidos por mal tiempo" value={weatherSuspended} />
      </div>

      <div className="vir-btn" onClick={onExport} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>Historial de temporada</p>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "3px 0 0" }}>Consulta y exporta todo en PDF</p>
        </div>
        <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
      </div>

      {members.length === 0 && (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13 }}>Todavía no hay nadie asignado a esta tripulación.</p>
      )}
      {members.map(m => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <div>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{m.name}</p>
            {m.nickname && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "2px 0 0" }}>"{m.nickname}"</p>}
          </div>
          {m.isCoach ? (
            <span style={{ color: "var(--vir-orange, #E67E22)", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", border: "1px solid var(--vir-orange, #E67E22)", borderRadius: 8, padding: "3px 8px" }}>Entrenador</span>
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
        background: meta ? meta.color : "var(--vir-border, #565656)",
      }} />
      <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11.5, margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nickname || m.name}</p>
      {editing ? (
        <>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            autoFocus
            style={{ ...inputStyle, padding: "5px 6px", fontSize: 12, width: 56 }}
          />
          <button className="vir-btn" onClick={() => { onSetValue(m.id, input); setEditing(false); }} style={{ background: "var(--vir-green, #3EA55A)", color: "#FFFFFF", borderRadius: 6, padding: "5px 7px", flexShrink: 0 }}>
            <Check size={12} />
          </button>
        </>
      ) : (
        <>
          <span className="vir-mono" style={{ color: value ? "var(--vir-text-primary, #F5F5F5)" : "#6E6E6E", fontSize: 11.5, minWidth: 26, textAlign: "right" }}>{value || "—"}</span>
          {editable && (
            <button className="vir-btn" onClick={() => { setInput(value || ""); setEditing(true); }} style={{ background: "transparent", color: "var(--vir-text-muted, #8A8A8A)", padding: "4px 5px", flexShrink: 0 }}>
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
    <div style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p className="vir-btn" onClick={() => setExpanded(!expanded)} style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5, fontWeight: 700, margin: 0, flex: 1, cursor: "pointer" }}>
          {boat.name} <span style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10 }}>{expanded ? "▲" : "▼"}</span>
        </p>
        <span style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 9.5 }}>{layoutMeta(boat.layout).label}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 10 }}>
          {members.length === 0 ? (
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12 }}>Sin remeros en esta tripulación.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <p style={{ color: "var(--vir-red, #E61E29)", fontSize: 9.5, textTransform: "uppercase", fontWeight: 700, margin: "0 0 6px" }}>Babor</p>
                {babor.map(m => (
                  <MeasurementRow key={m.id} m={m} value={values[m.id]} editable={editable} onSetValue={(id, v) => onSetValue(boat.id, id, v)} />
                ))}
              </div>
              <div>
                <p style={{ color: "var(--vir-green, #3EA55A)", fontSize: 9.5, textTransform: "uppercase", fontWeight: 700, margin: "0 0 6px" }}>Estribor</p>
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
    <div style={{ background: "var(--vir-bg-surface-alt, #3A3A3A)", border: "1px dashed var(--vir-border, #565656)", borderRadius: 12, padding: 14, marginBottom: 20 }}>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Enviar un aviso</p>
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
                background: active ? "var(--vir-red, #E61E29)" : "var(--vir-bg-surface, #404040)", border: `1px solid ${active ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)"}`, color: active ? "#FFFFFF" : "var(--vir-text-primary, #F5F5F5)",
              }}>{a.label}</button>
            );
          })}
        </div>
      )}
      <button className="vir-btn" onClick={() => setScheduling(!scheduling)} style={{ background: "transparent", color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11.5, textDecoration: "underline", marginBottom: scheduling ? 10 : 12, display: "block" }}>
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
  if (items.length === 0) return <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5 }}>Todavía no se ha enviado ningún aviso.</p>;
  const fmt = (iso) => new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <>
      {items.map(b => (
        <div key={b.id} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5, margin: "0 0 6px", lineHeight: 1.4 }}>{b.text}</p>
          <p style={{ color: b.sentAt ? "var(--vir-text-muted, #8A8A8A)" : "var(--vir-orange, #E67E22)", fontSize: 10.5, margin: 0 }}>
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
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Recordatorios</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>La nota se ve fija para todos — entrenadores y remeros. Los avisos se mandan como notificación.</p>

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Nota fija del club</p>
      {editing ? (
        <div style={{ marginBottom: 20 }}>
          <RichTextEditor value={input} onChange={setInput} rows={3} placeholder="Ej. Recordad traer el chaleco los sábados" />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="vir-btn" onClick={() => { onSaveNote(input.trim()); setEditing(false); }} style={{ ...primaryBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Guardar</button>
            <button className="vir-btn" onClick={() => { setInput(note?.text || ""); setEditing(false); }} style={{ ...ghostBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
          {note ? (
            <>
              <RichText text={note.text} style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.4 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="vir-btn" onClick={() => { setInput(note.text); setEditing(true); }} style={{ background: "transparent", color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11.5, textDecoration: "underline" }}>Editar</button>
                <button className="vir-btn" onClick={() => { if (window.confirm("¿Quitar la nota fija del club?")) onRemoveNote(); }} style={{ background: "transparent", color: "var(--vir-error, #FF8890)", fontSize: 11.5, textDecoration: "underline" }}>Eliminar</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 10px" }}>Todavía no hay ninguna nota fija.</p>
              <button className="vir-btn" onClick={() => { setInput(""); setEditing(true); }} style={{ background: "transparent", color: "var(--vir-red, #E61E29)", fontSize: 12, fontWeight: 600 }}>+ Añadir nota</button>
            </>
          )}
        </div>
      )}

      <BroadcastComposer
        audienceOptions={[{ id: "all", label: "Todos" }, { id: "coaches", label: "Entrenadores" }, { id: "rowers", label: "Remeros" }]}
        onSend={onSend}
      />

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Avisos del club</p>
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
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Recordatorios</h2>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>Elige una tripulación para gestionar sus recordatorios.</p>
        {teams.map(t => (
          <div key={t.id} className="vir-btn" onClick={() => setScope(t.id)} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.name}</p>
            <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
          </div>
        ))}
      </div>
    );
  }

  const teamLabel = teams.find(t => t.id === teamId)?.name || "";

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Recordatorios</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
        Tripulación: <span style={{ color: "var(--vir-red, #E61E29)", fontWeight: 600 }}>{teamLabel}</span> — visible solo a sus remeros
      </p>
      {!editable && (
        <p style={{ color: "var(--vir-orange, #E67E22)", fontSize: 12, margin: "0 0 16px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Nota fija del equipo</p>
      {editing ? (
        <div style={{ marginBottom: 20 }}>
          <RichTextEditor value={input} onChange={setInput} rows={3} placeholder="Ej. Este sábado entreno a las 8h en vez de las 9h" />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="vir-btn" onClick={() => { onSaveNote(input.trim()); setEditing(false); }} style={{ ...primaryBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Guardar</button>
            <button className="vir-btn" onClick={() => { setInput(note?.text || ""); setEditing(false); }} style={{ ...ghostBtn, flex: 1, padding: "10px 0", fontSize: 12.5 }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
          {note ? (
            <>
              <RichText text={note.text} style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.4 }} />
              {editable && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="vir-btn" onClick={() => { setInput(note.text); setEditing(true); }} style={{ background: "transparent", color: "var(--vir-text-secondary, #ADADAD)", fontSize: 11.5, textDecoration: "underline" }}>Editar</button>
                  <button className="vir-btn" onClick={() => { if (window.confirm("¿Quitar la nota fija del equipo?")) onRemoveNote(); }} style={{ background: "transparent", color: "var(--vir-error, #FF8890)", fontSize: 11.5, textDecoration: "underline" }}>Eliminar</button>
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: editable ? "0 0 10px" : 0 }}>Todavía no hay ninguna nota fija.</p>
              {editable && <button className="vir-btn" onClick={() => { setInput(""); setEditing(true); }} style={{ background: "transparent", color: "var(--vir-red, #E61E29)", fontSize: 12, fontWeight: 600 }}>+ Añadir nota</button>}
            </>
          )}
        </div>
      )}

      {editable && <BroadcastComposer onSend={onSend} />}

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Avisos de este equipo</p>
      <BroadcastLog items={broadcasts} />
    </div>
  );
}

function RowerRemindersScreen({ clubNote, teamNote, onBack }) {
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Recordatorios</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, margin: "0 0 20px", lineHeight: 1.4 }}>🔒 Solo consulta — las gestionan el club y tu entrenador.</p>

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Del club</p>
      <div style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
        {clubNote ? <RichText text={clubNote.text} style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5, margin: 0, lineHeight: 1.4 }} /> : <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: 0 }}>Sin nota del club por ahora.</p>}
      </div>

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>De tu equipo</p>
      <div style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px" }}>
        {teamNote ? <RichText text={teamNote.text} style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5, margin: 0, lineHeight: 1.4 }} /> : <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: 0 }}>Sin nota de tu equipo por ahora.</p>}
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
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Botes</h2>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>Elige una tripulación para gestionar su flota de botes.</p>
        {teams.map(t => (
          <div key={t.id} className="vir-btn" onClick={() => setScope(t.id)} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.name}</p>
            <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
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
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Botes</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
        Tripulación: <span style={{ color: "var(--vir-red, #E61E29)", fontWeight: 600 }}>{teamLabel}</span> · esta flota se usa tanto al montar los entrenos de agua como en Medidas
      </p>
      {!editable && (
        <p style={{ color: "var(--vir-orange, #E67E22)", fontSize: 12, margin: "0 0 16px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}

      {boats.length === 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13, marginBottom: 14 }}>Todavía no hay ningún bote en la flota.</p>}
      {boats.map(b => (
        <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <div>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{b.name}</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, margin: "3px 0 0" }}>{layoutMeta(b.layout).label}</p>
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
              style={{ background: "transparent", color: "var(--vir-text-muted, #8A8A8A)", padding: 6 }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      ))}

      {editable && (
        <div style={{ background: "var(--vir-bg-surface-alt, #3A3A3A)", border: "1px dashed var(--vir-border, #565656)", borderRadius: 12, padding: 14, marginTop: 6 }}>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Añadir bote</p>
          <label style={{ fontSize: 12, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 6, display: "block" }}>Nombre del bote</label>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej. Alarona" style={{ ...inputStyle, padding: "11px", fontSize: 16, width: "100%", marginBottom: 12 }} />

          <label style={{ fontSize: 12, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 6, display: "block" }}>Disposición de la tripulación</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {LAYOUTS.map(l => {
              const active = newLayout === l.id;
              return (
                <button key={l.id} className="vir-btn" onClick={() => setNewLayout(l.id)} style={{
                  textAlign: "left", padding: "10px 12px", borderRadius: 10, fontSize: 12.5, fontWeight: active ? 700 : 400,
                  background: active ? "var(--vir-red, #E61E29)" : "var(--vir-bg-surface, #404040)",
                  border: `1px solid ${active ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)"}`,
                  color: active ? "#FFFFFF" : "var(--vir-text-primary, #F5F5F5)",
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
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Medidas</h2>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>Elige una tripulación para gestionar sus medidas.</p>
        {teams.map(t => (
          <div key={t.id} className="vir-btn" onClick={() => setScope(t.id)} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.name}</p>
            <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
          </div>
        ))}
      </div>
    );
  }

  const teamLabel = teams.find(t => t.id === teamId)?.name || "";

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Medidas</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
        Tripulación: <span style={{ color: "var(--vir-red, #E61E29)", fontWeight: 600 }}>{teamLabel}</span>
      </p>
      {!editable && (
        <p style={{ color: "var(--vir-orange, #E67E22)", fontSize: 12, margin: "0 0 16px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}

      {boats.length === 0 ? (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13, marginBottom: 14 }}>
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

function InformesScreen({ teamId, teams, setScope, sessions, gymWeekMetaFor, gymRecordFor, members, currentGymWeek, waterStatsFor, gymStatsFor, today, onBack, onViewPhoto }) {
  const [tab, setTab] = useState("diario");
  const [day, setDay] = useState(today);
  const [week, setWeek] = useState(currentGymWeek);
  const weekLabel = (mondayIso) => {
    const mon = new Date(mondayIso + "T00:00:00");
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const sameMonth = mon.getMonth() === sun.getMonth();
    return sameMonth ? `${mon.getDate()}-${sun.getDate()} ${MONTHS_ES[mon.getMonth()]}` : `${mon.getDate()} ${MONTHS_ES[mon.getMonth()].slice(0, 3)} - ${sun.getDate()} ${MONTHS_ES[sun.getMonth()].slice(0, 3)}`;
  };
  const shiftWeek = (delta) => { const d = new Date(week + "T00:00:00"); d.setDate(d.getDate() + delta * 7); setWeek(toLocalISODate(d)); };

  if (teamId === "club") {
    return (
      <div style={{ padding: "16px 20px 28px" }}>
        <BackRow onBack={onBack} />
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Informes</h2>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>Elige una tripulación para sacar sus informes.</p>
        {teams.map(t => (
          <div key={t.id} className="vir-btn" onClick={() => setScope(t.id)} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.name}</p>
            <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
          </div>
        ))}
      </div>
    );
  }

  const team = teams.find(t => t.id === teamId);

  // --- datos de un día concreto ---
  const sessionForDay = (date) => sessions.find(s => s.iso === toLocalISODate(date));
  const dayRow = (rower, date) => {
    const s = sessionForDay(date);
    const swam = !!(s && s.active && inCrew(s, rower.id));
    const wk = mondayOf(date);
    const dayKey = JS_DOW_TO_WEEK_KEY[date.getDay()];
    const meta = gymWeekMetaFor(teamId, wk);
    const isGymDay = (meta.activeDays || []).includes(dayKey);
    const rec = isGymDay ? gymRecordFor(rower.id, teamId, wk, dayKey) : null;
    const gymDone = !!(rec && rec.done);
    const photos = (rec && rec.photos) || [];
    return { swam, isGymDay, gymDone, photos, dayLabel: WEEK_DAY_LABELS[dayKey] };
  };

  // --- datos de una semana completa (7 días reales a partir del lunes seleccionado) ---
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week + "T00:00:00");
    d.setDate(d.getDate() + i);
    return d;
  });
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
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Informes</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 16px" }}>{team?.name}</p>

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
            <button className="vir-btn" onClick={() => setDay(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 10, padding: "8px 12px", color: "var(--vir-text-secondary, #ADADAD)" }}><ChevronLeft size={16} /></button>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 14, fontWeight: 700, margin: 0 }}>{DAYS_ES[day.getDay()]} {day.getDate()} {MONTHS_ES[day.getMonth()]}</p>
            <button className="vir-btn" onClick={() => setDay(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 10, padding: "8px 12px", color: "var(--vir-text-secondary, #ADADAD)" }}><ChevronRight size={16} /></button>
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
              <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Fotos subidas ese día</p>
              {members.map(m => {
                const row = dayRow(m, day);
                if (row.photos.length === 0) return null;
                return (
                  <div key={m.id} style={{ marginBottom: 12 }}>
                    <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12, margin: "0 0 6px" }}>{m.nickname || m.name}</p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {row.photos.map((p, i) => p.kind === "pdf" ? (
                        <div key={i} onClick={() => openFileReliably(p.dataUrl)} style={{ width: 48, height: 48, borderRadius: 8, background: "#333333", border: "1px solid var(--vir-border, #565656)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <KeyRound size={16} color="var(--vir-text-secondary, #ADADAD)" />
                        </div>
                      ) : (
                        <img key={i} src={p.dataUrl} onClick={() => onViewPhoto(p.dataUrl, `${m.nickname || m.name} · ${DAYS_ES[day.getDay()]} ${day.getDate()}`)} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", border: "1px solid var(--vir-border, #565656)", cursor: "pointer" }} />
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
            <button className="vir-btn" onClick={() => shiftWeek(-1)} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 10, padding: "8px 12px", color: "var(--vir-text-secondary, #ADADAD)" }}><ChevronLeft size={16} /></button>
            <div style={{ textAlign: "center" }}>
              {seasonWeekNumber(team?.seasonStart, week) && (
                <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 2px" }}>Semana {seasonWeekNumber(team?.seasonStart, week)}</p>
              )}
              <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 14, fontWeight: 700, margin: 0 }}>{weekLabel(week)}{week === currentGymWeek ? " · actual" : ""}</p>
            </div>
            <button className="vir-btn" onClick={() => shiftWeek(1)} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 10, padding: "8px 12px", color: "var(--vir-text-secondary, #ADADAD)" }}><ChevronRight size={16} /></button>
          </div>

          <div className="vir-print-area">
            <h1 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 18, margin: "0 0 2px" }}>Informe semanal · {team?.name}</h1>
            <p style={{ fontSize: 12, margin: "0 0 16px" }}>Semana del {weekLabel(week)}</p>

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
                                    <span key={pi} onClick={() => openFileReliably(p.dataUrl)} style={{ textDecoration: "underline", cursor: "pointer" }}>PDF</span>
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
          <p style={{ fontSize: 12, margin: "0 0 16px" }}>{MONTHS_ES[today.getMonth()]} de {today.getFullYear()}</p>

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

function SeasonExportScreen({ team, sessions, gymPlanForTeam, currentGymWeek, members, onBack }) {
  const weekLabel = (mondayIso) => {
    const mon = new Date(mondayIso + "T00:00:00");
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const sameMonth = mon.getMonth() === sun.getMonth();
    return sameMonth ? `${mon.getDate()}-${sun.getDate()} ${MONTHS_ES[mon.getMonth()]}` : `${mon.getDate()} ${MONTHS_ES[mon.getMonth()].slice(0, 3)} - ${sun.getDate()} ${MONTHS_ES[sun.getMonth()].slice(0, 3)}`;
  };
  // Todas las semanas reales de la temporada, desde su inicio hasta la semana actual
  const seasonWeeks = [];
  if (team.seasonStart) {
    const d = new Date(mondayOf(new Date(team.seasonStart + "T00:00:00")) + "T00:00:00");
    const endD = new Date(currentGymWeek + "T00:00:00");
    while (d <= endD) { seasonWeeks.push(toLocalISODate(d)); d.setDate(d.getDate() + 7); }
    seasonWeeks.reverse();
  }
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "10px 0 4px" }}>
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: 0 }}>Historial de temporada</h2>
      </div>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, margin: "0 0 16px" }}>{team.name} · {CLUB_NAME}</p>

      <button className="vir-btn" onClick={() => window.print()} style={{ ...primaryBtn, marginBottom: 20 }}>
        Exportar / Guardar como PDF
      </button>

      <div className="vir-print-area">
        <h1 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, margin: "0 0 2px" }}>{CLUB_NAME} · {team.name}</h1>
        <p style={{ fontSize: 12, margin: "0 0 16px" }}>
          Código de tripulación: {team.code} · Temporada {team.seasonStart && team.seasonEnd ? `${new Date(team.seasonStart).getFullYear()}-${new Date(team.seasonEnd).getFullYear()}` : "sin definir"}
        </p>

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
        {seasonWeeks.length === 0 && <p style={{ fontSize: 11 }}>Esta tripulación todavía no tiene temporada configurada.</p>}
        {seasonWeeks.map(week => {
          const plan = gymPlanForTeam(week);
          const items = FISICO_SLOTS.filter(slot => plan[slot] && plan[slot].content);
          const wn = seasonWeekNumber(team.seasonStart, week);
          return (
            <div key={week} style={{ marginBottom: 10 }}>
              {wn && <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 2px", color: "#666" }}>Semana {wn}</p>}
              <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 4px" }}>{weekLabel(week)}</p>
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

function CoachGymPlanScreen({ teamId, teams, setScope, currentGymWeek, weekMetaFor, onSaveContent, onSaveActiveDays, onAddWeekAttachment, onRemoveWeekAttachment, onBack, editable, onOpenSeason }) {
  const [week, setWeek] = useState(currentGymWeek);
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);
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
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Plan de gimnasio semanal</h2>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>Elige una tripulación para ver o subir su plan de la semana.</p>
        {teams.map(t => (
          <div key={t.id} className="vir-btn" onClick={() => setScope(t.id)} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.name}</p>
            <ChevronRight size={18} color="var(--vir-text-muted, #8A8A8A)" />
          </div>
        ))}
      </div>
    );
  }

  const team = teams.find(t => t.id === teamId);
  const teamLabel = team?.name || "";

  if (!team?.seasonStart || !team?.seasonEnd) {
    return (
      <div style={{ padding: "16px 20px 28px" }}>
        <BackRow onBack={onBack} />
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Plan de gimnasio semanal</h2>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 4px", lineHeight: 1.4 }}>
          Tripulación: <span style={{ color: "var(--vir-red, #E61E29)", fontWeight: 600 }}>{teamLabel}</span>
        </p>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
          El gimnasio usa la misma temporada que los entrenos de agua, y esta tripulación todavía no la tiene configurada.
        </p>
        {editable && (
          <button className="vir-btn" onClick={onOpenSeason} style={{ ...primaryBtn, width: "auto", padding: "10px 18px", fontSize: 12.5 }}>Configurar temporada</button>
        )}
      </div>
    );
  }

  // Meses de la temporada, igual que en Entrenos de agua
  const seasonMonths = [];
  {
    const d = new Date(team.seasonStart + "T00:00:00");
    d.setDate(1);
    const end = new Date(team.seasonEnd + "T00:00:00");
    while (d.getFullYear() < end.getFullYear() || (d.getFullYear() === end.getFullYear() && d.getMonth() <= end.getMonth())) {
      seasonMonths.push({ year: d.getFullYear(), month: d.getMonth(), key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS_ES[d.getMonth()] });
      d.setMonth(d.getMonth() + 1);
    }
  }
  const weekDate = new Date(week + "T00:00:00");
  const weekMonthKey = `${weekDate.getFullYear()}-${weekDate.getMonth()}`;
  const currentMonthKey = (() => { const d = new Date(currentGymWeek + "T00:00:00"); return `${d.getFullYear()}-${d.getMonth()}`; })();
  const activeMonthKey = selectedMonthKey && seasonMonths.some(m => m.key === selectedMonthKey)
    ? selectedMonthKey
    : (seasonMonths.some(m => m.key === weekMonthKey) ? weekMonthKey : (seasonMonths.some(m => m.key === currentMonthKey) ? currentMonthKey : seasonMonths[0]?.key));

  // Semanas (por su lunes) que tocan ese mes, recortadas a lo que dura la temporada de verdad
  const [ay, am] = activeMonthKey.split("-").map(Number);
  const monthStart = new Date(ay, am, 1);
  const monthEnd = new Date(ay, am + 1, 0);
  const seasonStartDate = new Date(team.seasonStart + "T00:00:00");
  const seasonEndDate = new Date(team.seasonEnd + "T00:00:00");
  const weeksOfMonth = [];
  {
    const seen = new Set();
    const d = new Date(monthStart);
    while (d <= monthEnd) {
      if (d >= seasonStartDate && d <= seasonEndDate) {
        const wk = mondayOf(d);
        if (!seen.has(wk)) { seen.add(wk); weeksOfMonth.push(wk); }
      }
      d.setDate(d.getDate() + 1);
    }
  }

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
      onAddWeekAttachment(teamId, week, { name: file.name, fileType: file.type.includes("pdf") ? "pdf" : "jpg", dataUrl: reader.result });
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };
  const weekLabel = (mondayIso) => {
    const mon = new Date(mondayIso + "T00:00:00");
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const sameMonth = mon.getMonth() === sun.getMonth();
    return sameMonth ? `${mon.getDate()}-${sun.getDate()} ${MONTHS_ES[mon.getMonth()].slice(0, 3)}` : `${mon.getDate()} ${MONTHS_ES[mon.getMonth()].slice(0, 3)} - ${sun.getDate()} ${MONTHS_ES[sun.getMonth()].slice(0, 3)}`;
  };

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={() => guardNavigation(onBack)} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Plan de gimnasio semanal</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 4px", lineHeight: 1.4 }}>
        Tripulación: <span style={{ color: "var(--vir-red, #E61E29)", fontWeight: 600 }}>{teamLabel}</span>
      </p>
      {!editable && (
        <p style={{ color: "var(--vir-orange, #E67E22)", fontSize: 12, margin: "0 0 8px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}

      <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13, fontWeight: 800, letterSpacing: 0.5, margin: "10px 0 8px", textTransform: "uppercase" }}>
        Temporada {seasonMonths[0]?.year}-{seasonMonths[seasonMonths.length - 1]?.year}
      </p>

      {(() => {
        const byYear = {};
        seasonMonths.forEach(m => { (byYear[m.year] = byYear[m.year] || []).push(m); });
        return Object.entries(byYear).map(([year, months]) => (
          <div key={year} style={{ marginBottom: 10 }}>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, fontWeight: 700, margin: "0 0 6px" }}>{year}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {months.map(m => {
                const active = m.key === activeMonthKey;
                return (
                  <button key={m.key} className="vir-btn" onClick={() => guardNavigation(() => setSelectedMonthKey(m.key))} style={{
                    padding: "8px 4px", borderRadius: 10, fontSize: 11, fontWeight: active ? 700 : 500, whiteSpace: "nowrap", textAlign: "center",
                    background: active ? "var(--vir-red, #E61E29)" : "var(--vir-bg-surface, #404040)",
                    border: `1px solid ${active ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)"}`,
                    color: active ? "#FFFFFF" : "var(--vir-text-secondary, #ADADAD)",
                  }}>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        ));
      })()}

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "14px 0 8px" }}>Semana</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
        {weeksOfMonth.map(wk => {
          const active = wk === week;
          const wn = seasonWeekNumber(team.seasonStart, wk);
          const hasAttachment = weekMetaFor(teamId, wk).weekAttachments?.length > 0;
          return (
            <button key={wk} className="vir-btn" onClick={() => guardNavigation(() => setWeek(wk))} style={{
              position: "relative",
              padding: "8px 12px", borderRadius: 10, fontWeight: active ? 700 : 500,
              background: active ? "var(--vir-red, #E61E29)" : "var(--vir-bg-surface, #404040)",
              border: `1px solid ${active ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)"}`,
              color: active ? "#FFFFFF" : "var(--vir-text-secondary, #ADADAD)",
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
            }}>
              {hasAttachment && (
                <span title="Entreno semanal colgado" style={{
                  position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: 8,
                  background: "var(--vir-green, #3EA55A)", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Check size={10} color="#FFFFFF" strokeWidth={3} />
                </span>
              )}
              {wn && <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>Semana {wn}</span>}
              <span style={{ fontSize: 11.5 }}>{weekLabel(wk)}{wk === currentGymWeek ? " · actual" : ""}</span>
            </button>
          );
        })}
      </div>

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>Días de entreno esta semana ({activeDays.length}/7)</p>
      {editable ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          {WEEK_DAY_KEYS.map(day => {
            const active = activeDays.includes(day);
            return (
              <button key={day} className="vir-btn" onClick={() => toggleDay(day)} style={{
                padding: "9px 12px", borderRadius: 10, fontSize: 12, fontWeight: active ? 700 : 400,
                background: active ? "var(--vir-red, #E61E29)" : "var(--vir-bg-surface, #404040)",
                border: `1px solid ${active ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)"}`,
                color: active ? "#FFFFFF" : "var(--vir-text-primary, #F5F5F5)",
              }}>{WEEK_DAY_LABELS[day].slice(0, 3)}</button>
            );
          })}
        </div>
      ) : (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, marginBottom: 18 }}>
          {activeDays.length === 0 ? "Sin días de entreno marcados esta semana." : activeDays.map(d => WEEK_DAY_LABELS[d]).join(", ")}
        </p>
      )}

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>Archivos de la semana (PDF o JPG, opcional)</p>
      {(meta.weekAttachments || []).length === 0 && !editable && (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, marginBottom: 18 }}>Sin archivos esta semana.</p>
      )}
      {(meta.weekAttachments || []).map((att, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
          <span className="vir-btn" onClick={() => openFileReliably(att.dataUrl)} style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12.5, cursor: "pointer" }}>
            📎 {att.name}
          </span>
          {editable && (
            <button className="vir-btn" onClick={() => { if (window.confirm(`¿Eliminar el archivo "${att.name}" de esta semana?`)) onRemoveWeekAttachment(teamId, week, i); }} style={{ background: "transparent", color: "var(--vir-text-muted, #8A8A8A)", padding: 4 }}>
              <X size={15} />
            </button>
          )}
        </div>
      ))}
      {editable && (
        <label className="vir-btn" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--vir-bg-surface, #404040)", border: "1px dashed var(--vir-border, #565656)", borderRadius: 10, padding: "11px 0", color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12.5, cursor: "pointer", marginBottom: 18 }}>
          <Camera size={15} />
          {(meta.weekAttachments || []).length === 0 ? "Subir archivo de la semana" : "Añadir otro archivo"}
          <input type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg" style={{ display: "none" }} onChange={handleWeekFile} />
        </label>
      )}

      {activeDays.length === 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5 }}>Marca los días de entreno de esta semana para poder escribir el contenido de cada uno.</p>}

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
      <div style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: 14, marginBottom: 10 }}>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 8px" }}>{FISICO_LABELS[slot]}</p>
        <p style={{ color: value ? "var(--vir-text-secondary, #ADADAD)" : "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: 0, lineHeight: 1.4 }}>{value || "Sin contenido todavía."}</p>
      </div>
    );
  }
  const save = () => {
    onSave(text);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  };
  return (
    <div style={{ background: "var(--vir-bg-surface, #404040)", border: `1px solid ${dirty ? "var(--vir-orange, #E67E22)" : "var(--vir-border, #565656)"}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: 0 }}>{FISICO_LABELS[slot]}</p>
        {dirty ? (
          <p style={{ color: "var(--vir-orange, #E67E22)", fontSize: 10.5, margin: 0, fontWeight: 600 }}>Cambios sin guardar</p>
        ) : justSaved ? (
          <p style={{ color: "var(--vir-green, #3EA55A)", fontSize: 10.5, margin: 0, fontWeight: 600 }}>✓ Guardado</p>
        ) : value ? (
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: 0 }}>Guardado</p>
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
        opacity: dirty ? 1 : 0.4, background: dirty ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)",
      }}>
        Guardar
      </button>
      {dirty && (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "6px 2px 0" }}>Pulsa Guardar antes de cambiar de semana o salir, o se perderá.</p>
      )}
    </div>
  );
}

function RowerGymPlanScreen({ teamId, teamName, seasonStart, seasonEnd, currentGymWeek, weekMetaFor, recordFor, onToggleReport, onBack }) {
  const [week, setWeek] = useState(null); // null = vista general de todas las semanas
  const currentWeekRef = useRef(null);
  useEffect(() => {
    if (week === null && currentWeekRef.current) {
      currentWeekRef.current.scrollIntoView({ block: "center" });
    }
  }, [week]);

  const weekLabel = (mondayIso) => {
    const mon = new Date(mondayIso + "T00:00:00");
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const sameMonth = mon.getMonth() === sun.getMonth();
    return sameMonth ? `${mon.getDate()}-${sun.getDate()} ${MONTHS_ES[mon.getMonth()].slice(0, 3)}` : `${mon.getDate()} ${MONTHS_ES[mon.getMonth()].slice(0, 3)} - ${sun.getDate()} ${MONTHS_ES[sun.getMonth()].slice(0, 3)}`;
  };

  // Estado de una semana entera, para el punto de color junto a cada día y para atenuar la semana pasada
  const dayStatus = (wk, day) => {
    const rec = recordFor(teamId, wk, day);
    if (rec && rec.validated) return "green";
    if (rec && rec.done) return "orange";
    return "red";
  };
  const weekOverallStatus = (wk) => {
    const activeDays = (weekMetaFor(teamId, wk).activeDays || []);
    if (activeDays.length === 0) return null;
    const statuses = activeDays.map(day => dayStatus(wk, day));
    if (statuses.some(s => s === "red")) return "red";
    if (statuses.some(s => s === "orange")) return "orange";
    return "green";
  };
  const statusColor = { red: "var(--vir-danger, #E24B4A)", orange: "var(--vir-orange, #E67E22)", green: "var(--vir-green, #3EA55A)" };

  // ---------- VISTA GENERAL: todas las semanas de la temporada hasta la actual ----------
  if (week === null) {
    const weeks = [];
    if (seasonStart && seasonEnd) {
      let wk = mondayOf(new Date(seasonStart + "T00:00:00"));
      const seasonEndIso = toLocalISODate(new Date(seasonEnd + "T00:00:00"));
      let guard = 0;
      while (wk <= seasonEndIso && guard < 104) {
        weeks.push(wk);
        const d = new Date(wk + "T00:00:00"); d.setDate(d.getDate() + 7); wk = toLocalISODate(d);
        guard++;
      }
      // orden natural (semana 1 primero); la semana actual se resalta y la pantalla se desplaza sola hasta ella
    }
    return (
      <div style={{ padding: "16px 20px 28px" }}>
        <BackRow onBack={onBack} />
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Entrenos de gim</h2>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
          Tripulación: <span style={{ color: "var(--vir-red, #E61E29)", fontWeight: 600 }}>{teamName(teamId)}</span> · toca una semana para ver y marcar sus entrenos
        </p>

        {!seasonStart && <p style={{ color: "var(--vir-orange, #E67E22)", fontSize: 12.5 }}>Tu equipo todavía no tiene temporada configurada.</p>}
        {weeks.length === 0 && seasonStart && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5 }}>Todavía no ha empezado ninguna semana de esta temporada.</p>}

        {weeks.map(wk => {
          const isCurrent = wk === currentGymWeek;
          const isPast = wk < currentGymWeek;
          const overall = weekOverallStatus(wk);
          const wn = seasonWeekNumber(seasonStart, wk);
          const meta = weekMetaFor(teamId, wk);
          const activeDays = WEEK_DAY_KEYS.filter(d => (meta.activeDays || []).includes(d));
          return (
            <div
              key={wk}
              ref={isCurrent ? currentWeekRef : null}
              className="vir-btn"
              onClick={() => setWeek(wk)}
              style={{
                background: "var(--vir-bg-surface, #404040)",
                border: `1px solid ${isCurrent ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)"}`,
                borderRadius: 12, padding: "12px 14px", marginBottom: 10,
                opacity: isPast && !isCurrent ? (overall ? 0.75 : 0.55) : 1,
                boxShadow: isPast && !isCurrent && overall ? `inset 3px 0 0 ${statusColor[overall]}` : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: activeDays.length > 0 ? 8 : 0 }}>
                <div>
                  <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 700, margin: 0 }}>
                    {wn ? `Semana ${wn}` : weekLabel(wk)}
                    {isCurrent && <span style={{ color: "var(--vir-red, #E61E29)", fontSize: 10.5, fontWeight: 800, marginLeft: 8, letterSpacing: 0.4 }}>ACTUAL</span>}
                  </p>
                  <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, margin: "2px 0 0" }}>{weekLabel(wk)}</p>
                </div>
                <ChevronRight size={16} color="var(--vir-text-muted, #8A8A8A)" />
              </div>
              {activeDays.length === 0 ? (
                <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: 0 }}>Sin días de gimnasio marcados.</p>
              ) : (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {activeDays.map(day => (
                    <span key={day} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--vir-text-secondary, #ADADAD)" }}>
                      <span style={{ width: 9, height: 9, borderRadius: 5, background: statusColor[dayStatus(wk, day)], flexShrink: 0 }} />
                      {WEEK_DAY_LABELS[day]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ---------- DETALLE DE UNA SEMANA ----------
  const meta = weekMetaFor(teamId, week);
  const activeDays = meta.activeDays || [];
  const overdue = week < currentGymWeek;

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={() => setWeek(null)} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Entrenos de gim</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
        Tripulación: <span style={{ color: "var(--vir-red, #E61E29)", fontWeight: 600 }}>{teamName(teamId)}</span> · marca cada entreno hecho; el entrenador lo corrobora luego
      </p>

      <div style={{ marginBottom: 16 }}>
        {seasonWeekNumber(seasonStart, week) && (
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 2px" }}>
            Semana {seasonWeekNumber(seasonStart, week)}{week === currentGymWeek && <span style={{ color: "var(--vir-red, #E61E29)", marginLeft: 8 }}>· ACTUAL</span>}
          </p>
        )}
        <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 15, fontWeight: 700, margin: 0 }}>{weekLabel(week)}</p>
      </div>

      {(meta.weekAttachments || []).map((att, i) => (
        <div
          key={i}
          className="vir-btn"
          onClick={() => openFileReliably(att.dataUrl)}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 10, padding: "11px 12px", marginBottom: 8, cursor: "pointer" }}
        >
          <KeyRound size={15} color="var(--vir-text-secondary, #ADADAD)" />
          <span style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12.5, flex: 1 }}>📎 {att.name}</span>
          <span style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5 }}>Ver / descargar</span>
        </div>
      ))}
      {(meta.weekAttachments || []).length > 0 && <div style={{ marginBottom: 8 }} />}

      {activeDays.length === 0 && (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5 }}>El entrenador todavía no ha marcado días de entreno esta semana.</p>
      )}

      {WEEK_DAY_KEYS.filter(day => activeDays.includes(day)).map(day => (
        (meta.days[day] && meta.days[day].content) ? (
          <FisicoRecordRow
            key={day}
            slot={day}
            content={meta.days[day].content}
            record={recordFor(teamId, week, day)}
            overdue={overdue}
            onToggleReport={() => onToggleReport(teamId, week, day)}
          />
        ) : (
          <div key={day} style={{ background: "var(--vir-bg-surface-alt, #3A3A3A)", border: "1px dashed var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13, fontWeight: 700, margin: 0 }}>{FISICO_LABELS[day]}</p>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "4px 0 0" }}>El entrenador todavía no ha escrito el contenido de este día.</p>
          </div>
        )
      ))}
    </div>
  );
}

function FisicoRecordRow({ slot, content, record, overdue, onToggleReport }) {
  const done = !!(record && record.done);
  const validated = !!(record && record.validated);
  const missed = !done && overdue; // ha pasado el día y no se marcó como hecho

  const badgeStyle = {
    width: 44, height: 44, borderRadius: 22, flexShrink: 0, display: "flex",
    alignItems: "center", justifyContent: "center", cursor: validated ? "default" : "pointer",
    background: validated ? "var(--vir-green, #3EA55A)" : done ? "var(--vir-orange, #E67E22)" : missed ? "var(--vir-danger-bg, #7A1F1F)" : "var(--vir-bg-surface-alt, #3A3A3A)",
    border: `1px solid ${validated ? "var(--vir-green, #3EA55A)" : done ? "var(--vir-orange, #E67E22)" : missed ? "var(--vir-danger, #E24B4A)" : "var(--vir-border, #565656)"}`,
  };

  return (
    <div style={{ background: "var(--vir-bg-surface, #404040)", border: `1px solid ${validated ? "var(--vir-green, #3EA55A)" : done ? "var(--vir-orange, #E67E22)" : missed ? "var(--vir-danger, #E24B4A)" : "var(--vir-border, #565656)"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13, fontWeight: 700, margin: 0 }}>{FISICO_LABELS[slot]}</p>
          <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12, margin: "4px 0 0", lineHeight: 1.4 }}>{content}</p>
          {missed && <p style={{ color: "var(--vir-error, #F09595)", fontSize: 11, margin: "6px 0 0", fontWeight: 600 }}>✕ Entreno no realizado</p>}
          {done && !validated && <p style={{ color: "var(--vir-orange, #E67E22)", fontSize: 11, margin: "6px 0 0", fontWeight: 600 }}>● Marcado como hecho — pendiente de que el entrenador lo corrobore</p>}
          {validated && <p style={{ color: "var(--vir-success-text, #9FE1CB)", fontSize: 11, margin: "6px 0 0", fontWeight: 600 }}>✓ Validado por el entrenador</p>}
        </div>
        <button
          className="vir-btn"
          disabled={validated}
          onClick={onToggleReport}
          style={badgeStyle}
        >
          {(done || validated) ? <Check size={20} color="#FFFFFF" /> : missed ? <X size={18} color="#FFFFFF" /> : null}
        </button>
      </div>
    </div>
  );
}

function SeasonSetupForm({ onSave, existing, onCancel }) {
  const [start, setStart] = useState(existing?.seasonStart || "");
  const [end, setEnd] = useState(existing?.seasonEnd || "");
  const canSave = start && end && start < end;
  return (
    <div style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, var(--vir-bg-surface, #404040)))", border: "1px dashed var(--vir-border, var(--vir-border, var(--vir-border, #565656)))", borderRadius: 12, padding: 14, marginBottom: 18 }}>
      <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>
        {existing?.seasonStart ? "Ampliar o acortar la temporada" : "Configura la temporada"}
      </p>
      <label style={{ fontSize: 12, color: "var(--vir-text-secondary, var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD)))", marginBottom: 6, display: "block" }}>Inicio de temporada</label>
      <input type="date" value={start} onChange={e => setStart(e.target.value)} style={{ ...inputStyle, fontSize: 15, padding: "10px", width: "100%", marginBottom: 12 }} />
      <label style={{ fontSize: 12, color: "var(--vir-text-secondary, var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD)))", marginBottom: 6, display: "block" }}>Final de temporada</label>
      <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={{ ...inputStyle, fontSize: 15, padding: "10px", width: "100%", marginBottom: 12 }} />
      {existing?.seasonStart && (
        <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", fontSize: 10.5, margin: "0 0 12px", lineHeight: 1.4 }}>
          Lo que ya tenías dentro del nuevo rango se queda tal cual. Si acortas la temporada y hay días con actividad de por medio, te avisamos antes de tocar nada.
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="vir-btn"
          disabled={!canSave}
          onClick={() => onSave(start, end)}
          style={{ ...primaryBtn, width: "auto", flex: 1, padding: "10px 0", fontSize: 12.5, opacity: canSave ? 1 : 0.4 }}
        >
          {existing?.seasonStart ? "Guardar cambios" : "Generar temporada"}
        </button>
        {onCancel && <button className="vir-btn" onClick={onCancel} style={{ ...ghostBtn, width: "auto", padding: "10px 16px", fontSize: 12.5 }}>Cancelar</button>}
      </div>
    </div>
  );
}

function CoachPlanScreen({ teamId, teams, setScope, sessions, onBack, onToggleActive, onRename, onUpdateSession, overlapFor, editable, onSetSeason }) {
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);

  if (teamId === "club") {
    return (
      <div style={{ padding: "16px 20px 28px" }}>
        <BackRow onBack={onBack} />
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, var(--vir-text-primary, var(--vir-text-primary, #F5F5F5)))", margin: "10px 0 2px" }}>Entrenos de agua</h2>
        <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
          Cada tripulación sale al agua en días y horas distintos. Elige una tripulación para planificar su calendario.
        </p>
        {teams.map(t => (
          <div key={t.id} className="vir-btn" onClick={() => setScope(t.id)} style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, var(--vir-bg-surface, #404040)))", border: "1px solid var(--vir-border, var(--vir-border, var(--vir-border, #565656)))", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, var(--vir-text-primary, #F5F5F5)))", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.name}</p>
            <ChevronRight size={18} color="var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))" />
          </div>
        ))}
      </div>
    );
  }

  const team = teams.find(t => t.id === teamId);
  const teamLabel = team?.name || "";
  const today = new Date();

  // Sin temporada configurada todavía: se pide antes de mostrar nada de calendario
  if (!team?.seasonStart || !team?.seasonEnd) {
    return (
      <div style={{ padding: "16px 20px 28px" }}>
        <BackRow onBack={onBack} />
        <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, var(--vir-text-primary, var(--vir-text-primary, #F5F5F5)))", margin: "10px 0 2px" }}>Entrenos de agua</h2>
        <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", fontSize: 12.5, margin: "0 0 4px", lineHeight: 1.4 }}>
          Tripulación: <span style={{ color: "var(--vir-red, var(--vir-red, var(--vir-red, #E61E29)))", fontWeight: 600 }}>{teamLabel}</span>
        </p>
        <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", fontSize: 12.5, margin: "0 0 18px", lineHeight: 1.4 }}>
          Todavía no has definido el inicio y el fin de temporada de esta tripulación. Hazlo primero para generar su calendario.
        </p>
        {editable ? <SeasonSetupForm onSave={(s, e) => onSetSeason(teamId, s, e)} /> : (
          <p style={{ color: "var(--vir-orange, var(--vir-orange, var(--vir-orange, #E67E22)))", fontSize: 12, lineHeight: 1.4 }}>🔒 El club no te ha dado permiso para configurar esta tripulación.</p>
        )}
      </div>
    );
  }

  // Meses que componen la temporada, de inicio a fin
  const seasonMonths = [];
  {
    const d = new Date(team.seasonStart + "T00:00:00");
    d.setDate(1);
    const end = new Date(team.seasonEnd + "T00:00:00");
    while (d.getFullYear() < end.getFullYear() || (d.getFullYear() === end.getFullYear() && d.getMonth() <= end.getMonth())) {
      seasonMonths.push({ year: d.getFullYear(), month: d.getMonth(), key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS_ES[d.getMonth()] });
      d.setMonth(d.getMonth() + 1);
    }
  }
  const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
  const activeMonthKey = selectedMonthKey && seasonMonths.some(m => m.key === selectedMonthKey)
    ? selectedMonthKey
    : (seasonMonths.some(m => m.key === currentMonthKey) ? currentMonthKey : seasonMonths[0]?.key);

  // Cada día se muestra en su mes real, aunque eso deje alguna semana partida entre dos meses.
  // La línea de separación se coloca tras el último día visible de esa semana en este mes
  // (que será domingo salvo en la última semana visible, si el mes termina antes).
  const weeksInMonth = {};
  [...sessions]
    .filter(s => `${s.date.getFullYear()}-${s.date.getMonth()}` === activeMonthKey)
    .sort((a, b) => a.iso.localeCompare(b.iso))
    .forEach(s => {
      const key = mondayOf(s.date);
      (weeksInMonth[key] = weeksInMonth[key] || []).push(s);
    });

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, var(--vir-text-primary, var(--vir-text-primary, #F5F5F5)))", margin: "10px 0 2px" }}>Entrenos de agua</h2>
      <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", fontSize: 12.5, margin: "0 0 4px", lineHeight: 1.4 }}>
        Tripulación: <span style={{ color: "var(--vir-red, var(--vir-red, var(--vir-red, #E61E29)))", fontWeight: 600 }}>{teamLabel}</span>
      </p>
      {editable ? (
        <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.4 }}>
          Activa o desactiva cada día, ajusta su hora, el título y el bote/rems. Por defecto: "{DEFAULT_SESSION_TITLE}".
        </p>
      ) : (
        <p style={{ color: "var(--vir-orange, var(--vir-orange, var(--vir-orange, #E67E22)))", fontSize: 12, margin: "0 0 10px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, var(--vir-text-primary, #F5F5F5)))", fontSize: 13, fontWeight: 800, letterSpacing: 0.5, margin: 0, textTransform: "uppercase" }}>
          Temporada {seasonMonths[0]?.year}-{seasonMonths[seasonMonths.length - 1]?.year}
        </p>
        {editable && (
          <button className="vir-btn" onClick={() => setShowSeasonForm(!showSeasonForm)} style={{ background: "transparent", color: "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", fontSize: 10.5, textDecoration: "underline" }}>
            {showSeasonForm ? "Cerrar" : "Editar temporada"}
          </button>
        )}
      </div>

      {showSeasonForm && (
        <SeasonSetupForm existing={team} onCancel={() => setShowSeasonForm(false)} onSave={(s, e) => { onSetSeason(teamId, s, e); setShowSeasonForm(false); }} />
      )}

      {(() => {
        const byYear = {};
        seasonMonths.forEach(m => { (byYear[m.year] = byYear[m.year] || []).push(m); });
        return Object.entries(byYear).map(([year, months]) => (
          <div key={year} style={{ marginBottom: 10 }}>
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", fontSize: 10.5, fontWeight: 700, margin: "0 0 6px" }}>{year}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {months.map(m => {
                const active = m.key === activeMonthKey;
                return (
                  <button key={m.key} className="vir-btn" onClick={() => setSelectedMonthKey(m.key)} style={{
                    padding: "8px 4px", borderRadius: 10, fontSize: 11, fontWeight: active ? 700 : 500, whiteSpace: "nowrap", textAlign: "center",
                    background: active ? "var(--vir-red, var(--vir-red, var(--vir-red, #E61E29)))" : "var(--vir-bg-surface, var(--vir-bg-surface, var(--vir-bg-surface, #404040)))",
                    border: `1px solid ${active ? "var(--vir-red, var(--vir-red, var(--vir-red, #E61E29)))" : "var(--vir-border, var(--vir-border, var(--vir-border, #565656)))"}`,
                    color: active ? "#FFFFFF" : "var(--vir-text-secondary, var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD)))",
                  }}>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        ));
      })()}
      <div style={{ marginBottom: 4 }} />

      {Object.entries(weeksInMonth).sort(([a], [b]) => a.localeCompare(b)).map(([weekKey, items], wi) => (
        <div key={weekKey} style={{ borderBottom: "1px solid var(--vir-week-divider, var(--vir-border, var(--vir-border, #565656)))", paddingBottom: 10, marginBottom: 14 }}>
          {items.map(s => {
            const clashes = (s.crews || []).map(c => overlapFor(s, c)).filter(Boolean);
            const isPast = s.date < today && s.iso !== toLocalISODate(today);
            return (
              <div key={s.id} style={{
                background: "var(--vir-bg-surface, var(--vir-bg-surface, var(--vir-bg-surface, #404040)))", border: `1px solid ${clashes.length > 0 ? "var(--vir-orange, var(--vir-orange, var(--vir-orange, #E67E22)))" : "var(--vir-border, var(--vir-border, var(--vir-border, #565656)))"}`,
                borderRadius: 12, padding: "12px 14px", marginBottom: 10, opacity: !s.active ? 0.65 : (isPast ? 0.55 : 1),
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, textAlign: "center" }}>
                      <div className="vir-mono" style={{ color: s.active ? "var(--vir-red, var(--vir-red, var(--vir-red, #E61E29)))" : "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", fontSize: 17, lineHeight: 1 }}>{s.date.getDate()}</div>
                      <div style={{ color: "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", fontSize: 9.5, textTransform: "uppercase" }}>{DAYS_ES[s.dow]}</div>
                    </div>
                    <div style={{ color: "var(--vir-text-secondary, var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD)))", fontSize: 11.5, fontWeight: 600, letterSpacing: 0.3 }}>ENTRENO AGUA</div>
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
                        style={{ ...inputStyle, fontSize: 12.5, padding: "9px 11px", width: "100%", opacity: editable ? 1 : 0.6 }}
                      />
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <DayTimeField time={s.time} onSetTime={(t) => onUpdateSession(s.id, { time: t })} editable={editable} />
                    </div>
                    {clashes.map((clash, i) => (
                      <p key={i} style={{ color: "var(--vir-orange, var(--vir-orange, var(--vir-orange, #E67E22)))", fontSize: 11, margin: "8px 0 0", lineHeight: 1.4 }}>
                        ⚠ Mismo bote ({clash.boat}) que {clash.team}, que lo usa a las {clash.time}
                      </p>
                    ))}
                  </>
                )}
                {!s.active && s.suspendedReason && (
                  <p style={{ color: "var(--vir-error, var(--vir-error, var(--vir-error, #FF8890)))", fontSize: 11.5, margin: "8px 0 0" }}>Suspendido: {s.suspendedReason}</p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Selector de hora: pestañas MAÑANA / TARDE arriba, y debajo de la pestaña activa, el horario para elegir.
// Una vez elegida una hora, se muestra fija con opción de cambiarla.
function DayTimeField({ time, onSetTime, editable }) {
  const [editing, setEditing] = useState(!time);
  const [tab, setTab] = useState(AFTERNOON_TIMES.includes(time) ? "tarde" : "manana");

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", fontSize: 12, margin: 0 }}>
          Horario seleccionado: <span className="vir-mono" style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontWeight: 700 }}>{time}</span>
        </p>
        {editable && (
          <button className="vir-btn" onClick={() => setEditing(true)} style={{ background: "transparent", color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textDecoration: "underline" }}>Cambiar</button>
        )}
      </div>
    );
  }

  const tabBtn = (id, label) => {
    const active = tab === id;
    return (
      <button
        key={id}
        className="vir-btn"
        onClick={() => setTab(id)}
        style={{
          flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 500,
          background: active ? "var(--vir-red, var(--vir-red, #E61E29))" : "var(--vir-bg-surface-alt, var(--vir-bg-surface-alt, #3A3A3A))",
          border: `1px solid ${active ? "var(--vir-red, var(--vir-red, #E61E29))" : "var(--vir-border, var(--vir-border, #565656))"}`,
          color: active ? "#FFFFFF" : "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))",
        }}
      >{label}</button>
    );
  };

  const times = tab === "manana" ? MORNING_TIMES : AFTERNOON_TIMES;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {tabBtn("manana", "MAÑANA")}
        {tabBtn("tarde", "TARDE")}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {times.map(t => (
          <button
            key={t}
            className="vir-btn"
            disabled={!editable}
            onClick={() => { onSetTime(t); setEditing(false); }}
            style={{
              padding: "8px 11px", borderRadius: 8, fontSize: 12,
              background: time === t ? "var(--vir-red, var(--vir-red, #E61E29))" : "var(--vir-bg-surface, var(--vir-bg-surface, #404040))",
              border: `1px solid ${time === t ? "var(--vir-red, var(--vir-red, #E61E29))" : "var(--vir-border, var(--vir-border, #565656))"}`,
              color: time === t ? "#FFFFFF" : "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", opacity: editable ? 1 : 0.6,
            }}
          >{t}</button>
        ))}
      </div>
    </div>
  );
}

function SuspendReasonModal({ session, onSelect, onCancel }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "var(--vir-bg-surface-alt, #333333)", border: "1px solid var(--vir-border, #565656)", borderRadius: 16, padding: 20, width: "100%" }}>
        <h3 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 18, color: "var(--vir-text-primary, #F5F5F5)", margin: "0 0 4px" }}>Suspender entreno</h3>
        <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12.5, margin: "0 0 16px", lineHeight: 1.4 }}>
          {DAYS_ES[session.dow]} {session.date.getDate()} de {MONTHS_ES[session.date.getMonth()]} · ¿Cuál es el motivo de la suspensión?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SUSPEND_REASONS.map(reason => (
            <button key={reason} className="vir-btn" onClick={() => onSelect(reason)} style={{
              background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", color: "var(--vir-text-primary, #F5F5F5)",
              fontSize: 13, fontWeight: 500, padding: "11px 14px", borderRadius: 10, textAlign: "left",
            }}>{reason}</button>
          ))}
        </div>
        <button className="vir-btn" onClick={onCancel} style={{ background: "transparent", color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12.5, marginTop: 16, textDecoration: "underline", display: "block", marginLeft: "auto", marginRight: "auto" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function PhotoLightbox({ photo, caption, onClose }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <img src={photo} alt={caption || "Registro del entreno"} style={{ maxWidth: "100%", maxHeight: "70%", borderRadius: 12, border: "1px solid var(--vir-border, #565656)", objectFit: "contain" }} />
      {caption && <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5, margin: "14px 16px 0", textAlign: "center" }}>{caption}</p>}
      <button className="vir-btn" onClick={onClose} style={{ marginTop: 18, background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 10, padding: "9px 20px", color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12.5 }}>
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
        background: checked ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)", border: "none", position: "relative",
        opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span style={{
        display: "block", width: 18, height: 18, borderRadius: "50%", background: "var(--vir-text-primary, #F5F5F5)",
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
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, margin: "12px 4px 8px" }}>{label}</p>
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
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", margin: "10px 0 2px" }}>
        {DAYS_ES[session.dow]} {session.date.getDate()} de {MONTHS_ES[session.date.getMonth()]}
      </h2>
      <p className="vir-mono" style={{ color: "var(--vir-red, var(--vir-red, #E61E29))", fontSize: 13, margin: "0 0 20px" }}>{session.time}</p>

      <p style={{ color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", fontSize: 13, lineHeight: 1.5 }}>
        Apúntate a este entreno para entrar en la lista de disponibles. El entrenador te asignará a un bote más adelante.
      </p>
      <button className="vir-btn" onClick={() => onToggle(session)} style={{
        ...primaryBtn, marginTop: 14,
        background: session.signups.has(myId) ? "transparent" : "var(--vir-red, var(--vir-red, #E61E29))",
        border: session.signups.has(myId) ? "1px solid var(--vir-error, var(--vir-error, #FF8890))" : "none",
        color: session.signups.has(myId) ? "var(--vir-error, var(--vir-error, #FF8890))" : "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))",
      }}>
        {session.signups.has(myId) ? "Darme de baja" : "Apuntarme"}
      </button>
      <div style={{ marginTop: 18, marginBottom: 22 }}>
        <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", marginBottom: 8 }}>Apuntados ({session.signups.size})</p>
        <SignupsBySide ids={[...session.signups]} sideOf={sideOf} nameOf={nameOf} nicknameOf={nicknameOf} />
      </div>

      {myCrew ? (
        <div>
          <p style={{ color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", fontSize: 12, margin: "0 0 10px" }}>🚣 {myCrew.boat}{myCrew.oars ? ` · ${myCrew.oars}` : ""}</p>
          <div style={{
            display: "flex", alignItems: "center", gap: 12, borderRadius: 12, padding: 16, marginBottom: 18,
            background: isCalled ? "var(--vir-success-bg, var(--vir-success-bg, #1E3A2A))" : isReserve ? "var(--vir-warning-bg, var(--vir-warning-bg, #3D2E17))" : "var(--vir-danger-bg, #3A1E1E)",
            border: `1px solid ${isCalled ? "var(--vir-green, var(--vir-green, #3EA55A))" : isReserve ? "var(--vir-orange, var(--vir-orange, #E67E22))" : "var(--vir-danger, var(--vir-danger, #E24B4A))"}`,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: isCalled ? "var(--vir-green, var(--vir-green, #3EA55A))" : isReserve ? "transparent" : "var(--vir-danger, var(--vir-danger, #E24B4A))",
              border: isReserve ? "2px solid var(--vir-orange, var(--vir-orange, #E67E22))" : "none",
            }}>
              {isCalled ? <Check size={19} color="#FFFFFF" /> : isReserve ? (
                <span style={{ color: "var(--vir-orange, var(--vir-orange, #E67E22))", fontWeight: 800, fontSize: 16, fontFamily: "'Big Shoulders Display', sans-serif" }}>R</span>
              ) : <X size={19} color="#FFFFFF" />}
            </div>
            <div>
              <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontWeight: 700, fontSize: 14, margin: 0 }}>
                {isCalled ? "Convocado/a" : isReserve ? "Estás de reserva" : "No convocado/a"}
              </p>
              {mySeatLabel() && <p className="vir-mono" style={{ color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", fontSize: 12.5, margin: "3px 0 0" }}>{mySeatLabel()}</p>}
            </div>
          </div>
          <BoatDiagram crew={myCrew} readOnly nicknameOf={nicknameOf} nameOf={nameOf} sideOf={sideOf} photoOf={photoOf} fleetBoats={fleetBoats} boatMeasurements={boatMeasurements} />
          {(isCalled || isReserve) && (
            myAlerts && myAlerts.length > 0 ? (
              <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 12, marginTop: 16, textAlign: "center" }}>
                Ya has avisado al entrenador de que no puedes venir.
              </p>
            ) : (
              <button
                className="vir-btn"
                onClick={() => {
                  if (window.confirm("¿Avisar al entrenador de que no puedes venir a este entreno? La tripulación ya cerrada no cambia sola — el entrenador tendrá que reabrirla y buscar un sustituto.")) onSendAlert(session);
                }}
                style={{ ...ghostBtn, marginTop: 18, borderColor: "var(--vir-danger, var(--vir-danger, #E24B4A))", color: "var(--vir-error, var(--vir-error, #FF8890))" }}
              >
                Avisar que no puedo venir
              </button>
            )
          )}
        </div>
      ) : closedCrews.length > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 12, padding: 16, background: "var(--vir-danger-bg, #3A1E1E)", border: "1px solid var(--vir-danger, var(--vir-danger, #E24B4A))" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--vir-danger, var(--vir-danger, #E24B4A))" }}>
            <X size={19} color="#FFFFFF" />
          </div>
          <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontWeight: 700, fontSize: 14, margin: 0 }}>No convocado/a en ningún bote de este día</p>
        </div>
      ) : null}
    </div>
  );
}

function CrewCard({ session, crew, teamOf, roleOf, managedTeamsOf, nameOf, nicknameOf, sideOf, photoOf, waterStatsFor, gymStatsFor, editable, myId, selected, setSelected, onAssign, onClear, onClose, onReopen, onRemoveCrew, onSetBoat, onSetOars, overlapFor, fleetBoats, boatMeasurements }) {
  const [preEditRoster, setPreEditRoster] = useState(null);
  const handleReopen = () => {
    setPreEditRoster({ seats: [...crew.seats], patron: crew.patron, reserves: [...crew.reserves], zodiac: [...crew.zodiac] });
    onReopen(session, crew);
  };
  const handleClose = () => {
    onClose(session, crew, preEditRoster);
    setPreEditRoster(null);
  };
  const inScope = (id) => teamOf(id) === session.teamId || (roleOf(id) === "coach" && managedTeamsOf(id).includes(session.teamId));
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
    <div style={{ flex: "1 1 100%", minWidth: "100%", background: "var(--vir-bg-surface-alt, var(--vir-bg-surface-alt, var(--vir-bg-surface-alt, #3A3A3A)))", border: "1px solid var(--vir-border, var(--vir-border, var(--vir-border, #565656)))", borderRadius: 14, padding: 14, marginBottom: 14 }}>
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
          }} style={{ background: "transparent", color: "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", padding: "4px 6px", flexShrink: 0 }}>
            <X size={16} />
          </button>
        )}
      </div>

      {clash && (
        <p style={{ color: "var(--vir-orange, var(--vir-orange, var(--vir-orange, #E67E22)))", fontSize: 10.5, margin: "0 0 8px", lineHeight: 1.4 }}>
          ⚠ {clash.boat} también está en uso por {clash.team} a las {clash.time} — puede haber conflicto.
        </p>
      )}

      <p className="vir-mono" style={{ color: "var(--vir-red, var(--vir-red, var(--vir-red, #E61E29)))", fontSize: 11.5, margin: "0 0 8px" }}>{filled} puesto{filled === 1 ? "" : "s"} asignado{filled === 1 ? "" : "s"}</p>

      {crew.status === "abierto" ? (
        <>
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", fontSize: 10.5, textTransform: "uppercase", marginBottom: 6 }}>Disponibles ({available.length})</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {available.length === 0 && <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, var(--vir-text-muted, #8A8A8A)))", fontSize: 11.5 }}>Nadie más apuntado todavía.</p>}
            {available.map(id => {
              const meta = SIDE_META[sideOf(id)];
              const isSel = selected === id;
              const label = nicknameOf(id) || nameOf(id);
              const pct = pctFor(id);
              return (
                <button key={id} className="vir-chip vir-btn" disabled={!editable} onClick={() => editable && setSelected(isSel ? null : id)} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "5px 10px 5px 5px", borderRadius: 20, fontSize: 11.5,
                  background: isSel ? "var(--vir-red, var(--vir-red, var(--vir-red, #E61E29)))" : "var(--vir-bg-surface, var(--vir-bg-surface, var(--vir-bg-surface, #404040)))",
                  border: `1px solid ${isSel ? "var(--vir-red, var(--vir-red, var(--vir-red, #E61E29)))" : "var(--vir-border, var(--vir-border, var(--vir-border, #565656)))"}`,
                  color: isSel ? "#FFFFFF" : "var(--vir-text-primary, var(--vir-text-primary, var(--vir-text-primary, #F5F5F5)))", fontWeight: isSel ? 600 : 400,
                  opacity: editable ? 1 : 0.6, cursor: editable ? "pointer" : "not-allowed",
                }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: meta ? meta.color : "var(--vir-border, var(--vir-border, var(--vir-border, #565656)))", color: "#FFFFFF", fontSize: 7.5, fontWeight: 800,
                  }}>{meta ? meta.letter : "?"}</span>
                  {label}
                  <span className="vir-mono" style={{ color: isSel ? "#FFD9DB" : "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 11, fontWeight: 600 }}>· {pct}%</span>
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

function SessionCoachScreen({ session, onBack, selected, setSelected, onAssign, onClear, onClose, onReopen, onAddCrew, onRemoveCrew, onSetCrewBoat, onSetCrewOars, teamName, teamOf, roleOf, managedTeamsOf, nameOf, nicknameOf, sideOf, waterStatsFor, gymStatsFor, onUpdateSession, editable, alerts, onResolveAlert, myId, onToggleSignup, photoOf, overlapFor, fleetBoats, boatMeasurements }) {
  const [newBoatName, setNewBoatName] = useState("");
  const availableBoats = fleetBoats.filter(b => !session.crews.some(c => c.boat === b.name));

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", margin: "10px 0 2px" }}>
        {DAYS_ES[session.dow]} {session.date.getDate()} de {MONTHS_ES[session.date.getMonth()]}
      </h2>
      <p className="vir-mono" style={{ color: "var(--vir-red, var(--vir-red, #E61E29))", fontSize: 13, margin: "0 0 4px" }}>{session.time}</p>
      <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11.5, margin: "0 0 4px" }}>Tripulación: {teamName(session.teamId)}</p>
      {!editable && (
        <p style={{ color: "var(--vir-orange, var(--vir-orange, #E67E22))", fontSize: 12, margin: "0 0 16px", lineHeight: 1.4 }}>
          🔒 Solo lectura — el club no te ha dado permiso para gestionar esta tripulación.
        </p>
      )}
      {editable && <div style={{ marginBottom: 16 }} />}

      {alerts && alerts.length > 0 && (
        <div style={{ background: "var(--vir-danger-bg, var(--vir-danger-bg, #402226))", border: "1px solid var(--vir-red, var(--vir-red, #E61E29))", borderRadius: 12, padding: "12px 14px", marginBottom: 18 }}>
          <p style={{ color: "var(--vir-error, var(--vir-error, #FF8890))", fontSize: 11.5, fontWeight: 700, margin: "0 0 8px" }}>⚠ Avisos de baja</p>
          {alerts.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 12.5, margin: 0, lineHeight: 1.4 }}>{a.text}</p>
              {editable && (
                <button className="vir-btn" onClick={() => onResolveAlert(a.id)} style={{ background: "transparent", color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, textDecoration: "underline", whiteSpace: "nowrap", flexShrink: 0 }}>
                  Ya lo he visto
                </button>
              )}
            </div>
          ))}
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, margin: "6px 0 0", lineHeight: 1.4 }}>
            Reabre el bote correspondiente para hacer los cambios necesarios y vuelve a cerrarlo para notificar.
          </p>
        </div>
      )}

      <button
        className="vir-btn"
        onClick={() => onToggleSignup(session)}
        style={{
          width: "100%", marginBottom: 18, padding: "11px 0", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: session.signups.has(myId) ? "transparent" : "var(--vir-bg-surface, var(--vir-bg-surface, #404040))",
          border: session.signups.has(myId) ? "1px solid var(--vir-error, var(--vir-error, #FF8890))" : "1px solid var(--vir-border, var(--vir-border, #565656))",
          color: session.signups.has(myId) ? "var(--vir-error, var(--vir-error, #FF8890))" : "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))",
        }}
      >
        {session.signups.has(myId) ? "Quitarme de disponible" : "Apuntarme también — cubriré un puesto"}
      </button>

      <div style={{ marginBottom: 18 }}>
        <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", marginBottom: 8 }}>Apuntados ({session.signups.size})</p>
        {session.signups.size === 0 ? (
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 12.5 }}>Todavía no se ha apuntado nadie.</p>
        ) : (
          <SignupsBySide ids={[...session.signups]} sideOf={sideOf} nameOf={nameOf} nicknameOf={nicknameOf} />
        )}
      </div>

      {session.crews.length === 0 && (
        <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 12.5, marginBottom: 14 }}>Todavía no hay ningún bote añadido a este día.</p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {session.crews.map(crew => (
          <CrewCard
            key={crew.id}
            session={session} crew={crew}
            teamOf={teamOf} roleOf={roleOf} managedTeamsOf={managedTeamsOf} nameOf={nameOf} nicknameOf={nicknameOf} sideOf={sideOf} photoOf={photoOf}
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
        <div style={{ background: "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: "1px dashed var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: 14, marginTop: 6 }}>
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Añadir otro bote a este día</p>
          {fleetBoats.length === 0 ? (
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 12 }}>Todavía no hay ningún bote en la flota — créalos desde "Botes" en el inicio.</p>
          ) : availableBoats.length === 0 ? (
            <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 12 }}>Ya están añadidos todos los botes de la flota.</p>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <select value={availableBoats.some(b => b.name === newBoatName) ? newBoatName : availableBoats[0].name} onChange={e => setNewBoatName(e.target.value)} style={{ ...inputStyle, padding: "8px 10px", fontSize: 12.5, flex: 1 }}>
                {availableBoats.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
              <button className="vir-btn" onClick={() => {
                const chosen = availableBoats.find(b => b.name === newBoatName) || availableBoats[0];
                onAddCrew(session, chosen);
                setNewBoatName("");
              }} style={{ ...primaryBtn, width: "auto", padding: "8px 16px", fontSize: 12.5, whiteSpace: "nowrap" }}>Añadir</button>
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
  const colorFor = (rowerId) => (sideOf && rowerId && SIDE_META[sideOf(rowerId)]) ? SIDE_META[sideOf(rowerId)].color : "var(--vir-red, #E61E29)";
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
            <circle cx={x} cy={y} r={r} fill="var(--vir-bg-surface-alt, #333333)" stroke={color} strokeWidth="3.5" />
            <image href={photo} x={x - (r - 3)} y={y - (r - 3)} width={(r - 3) * 2} height={(r - 3) * 2} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
          </>
        ) : (
          <circle cx={x} cy={y} r={r} fill={filled ? color : "var(--vir-bg-surface, #404040)"} stroke={filled ? color : "var(--vir-border, #6E6E6E)"} strokeWidth="1.5" />
        )}
        {!photo && (
          <text x={x} y={y + r * 0.28} textAnchor="middle" fontSize={r * 0.62} fontWeight="700" fill="#FFFFFF">{label.text}</text>
        )}
        {filled && photo && (
          <g>
            <circle cx={x + r * 0.68} cy={y + r * 0.68} r={r * 0.36} fill={color} stroke="var(--vir-bg-surface-alt, #3A3A3A)" strokeWidth="1.5" />
            <text x={x + r * 0.68} y={y + r * 0.68 + r * 0.13} textAnchor="middle" fontSize={r * 0.32} fontWeight="800" fill="#FFFFFF">{label.text}</text>
          </g>
        )}
        {filled && nameBelow && (
          <text x={x} y={y + r + 15} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--vir-boat-name, var(--vir-text-primary, #F5F5F5))">
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
        <rect x="25" y={y - 40} width="250" height="80" rx="14" fill="var(--vir-boat-zodiac-bg, var(--vir-bg-surface-alt, #333333))" stroke="var(--vir-border, #565656)" strokeWidth="1.5" />
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
      <div style={{ background: "var(--vir-boat-bg, #666666)", border: "1px solid var(--vir-border, #565656)", borderRadius: 14, padding: "16px 0 10px" }}>
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
      <div style={{ background: "var(--vir-boat-bg, #666666)", border: "1px solid var(--vir-border, #565656)", borderRadius: 14, padding: "16px 0 10px" }}>
        <svg viewBox={`0 0 300 ${viewH}`} width="100%" height={viewH * 0.92}>
          <line x1={centerX} y1={lineTop} x2={centerX} y2={lineBottom} stroke="var(--vir-border, #767676)" strokeWidth="2" />
          <text x={cx.babor} y={18} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--vir-boat-label, var(--vir-text-muted, #8A8A8A))" letterSpacing="0.5">BABOR</text>
          <text x={cx.estribor} y={18} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--vir-boat-label, var(--vir-text-muted, #8A8A8A))" letterSpacing="0.5">ESTRIBOR</text>

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
    <div style={{ background: "var(--vir-boat-bg, #666666)", border: "1px solid var(--vir-border, #565656)", borderRadius: 14, padding: "16px 0 10px" }}>
      <svg viewBox={`0 0 300 ${viewH}`} width="100%" height={viewH * 0.92}>
        <line x1={centerX} y1={lineTop} x2={centerX} y2={lineBottom} stroke="var(--vir-border, #767676)" strokeWidth="2" />

        <text x={cx.babor} y={18} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--vir-boat-label, var(--vir-text-muted, #8A8A8A))" letterSpacing="0.5">BABOR</text>
        <text x={cx.estribor} y={18} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--vir-boat-label, var(--vir-text-muted, #8A8A8A))" letterSpacing="0.5">ESTRIBOR</text>

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
    <div style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--vir-bg-surface-alt, #454545)", color: "var(--vir-text-primary, #E8E8E8)", fontSize: 12, padding: "6px 12px", borderRadius: 20, marginRight: 6, marginBottom: 6 }}>
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
        <p style={{ color: "var(--vir-text-muted, #6E6E6E)", fontSize: 11 }}>—</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {list.map(id => <NameChip key={id} name={nicknameOf(id) || nameOf(id)} side={sideOf(id)} />)}
        </div>
      )}
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 14 }}>
      <Col label="Babor" color="var(--vir-red, #E61E29)" list={babor} />
      <Col label="Estribor" color="var(--vir-green, #3EA55A)" list={estribor} />
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
        <button className="vir-btn" onClick={() => { onMarkRead(); setOpen(false); setDragX(0); }} style={{ flex: 1, background: "var(--vir-green, var(--vir-green, #3EA55A))", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Check size={18} />
        </button>
        <button className="vir-btn" onClick={() => onHide()} style={{ flex: 1, background: "var(--vir-red, var(--vir-red, #E61E29))", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
          background: isRead ? "var(--vir-bg-surface-alt, var(--vir-bg-surface-alt, #3A3A3A))" : "var(--vir-bg-surface, var(--vir-bg-surface, #404040))", border: `1px solid ${isRead ? "var(--vir-border, #4A4A4A)" : "var(--vir-border, var(--vir-border, #565656))"}`,
          borderRadius: 12, padding: 14, display: "flex", gap: 10, cursor: "pointer", touchAction: "pan-y",
        }}
      >
        <div style={{ width: 30, height: 30, borderRadius: 15, background: isRead ? "var(--vir-bg-surface-alt, var(--vir-bg-surface-alt, #3A3A3A))" : "var(--vir-danger-bg, var(--vir-danger-bg, #402226))", border: isRead ? "1px solid var(--vir-border, var(--vir-border, #565656))" : "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Bell size={14} color={isRead ? "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))" : "var(--vir-red, var(--vir-red, #E61E29))"} />
        </div>
        <div>
          {subtitle && <p style={{ color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", fontSize: 11, margin: "0 0 3px" }}>{subtitle}</p>}
          <p style={{ color: isRead ? "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))" : "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 12.5, margin: 0, lineHeight: 1.45 }}>{n.text}</p>
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
        {items.length === 0 && <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 13, marginTop: 20 }}>Aún no hay notificaciones.</p>}
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

function ProfileScreen({ role, scope, attendance, crewStats, teams, teamName, teamCode, onOpenTraining, myId, myDisplayName, myNickname, mySide, myTeam, myEmail, myFirstName, myLastName, myBirthDate, myPhone, myRowerCode, myPhoto, onUpdateMyProfile, onUpdateMyPhoto, clubDisplayName, clubCode, clubPhoto, clubProfile, onUpdateClubProfile, onUpdateClubPhoto, theme, onToggleTheme, pushSubscribed, onSubscribePush, onUnsubscribePush }) {
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
  const labelStyle = { fontSize: 11.5, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 4, display: "block" };

  return (
    <div style={{ padding: "24px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <AvatarPicker photo={photo} initials={name.split(" ").map(n => n[0]).join("")} onChange={onChangePhoto} />
          <div>
            <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontWeight: 600, fontSize: 16, margin: 0 }}>{name}</p>
            <p style={{ color: "var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD))", fontSize: 12.5, margin: "3px 0 0" }}>{roleLabel}{role !== "club" ? ` · ${clubDisplayName}` : ""}</p>
          </div>
        </div>
        {editable && !editing && (
          <button className="vir-btn" onClick={startEdit} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 10, padding: "8px 10px", color: "var(--vir-text-secondary, #ADADAD)" }}>
            <Pencil size={15} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
        <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13, margin: 0 }}>Modo {theme === "dark" ? "oscuro" : "claro"}</p>
        <ToggleSwitch checked={theme === "light"} onChange={() => onToggleTheme(theme === "dark" ? "light" : "dark")} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
        <div style={{ flex: 1, paddingRight: 10 }}>
          <p style={{ color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13, margin: 0 }}>Avisos en este dispositivo</p>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, margin: "3px 0 0", lineHeight: 1.4 }}>
            {pushSubscribed ? "Activados — recibirás avisos aunque tengas la app cerrada" : "Actívalos para recibir avisos sin tener la app abierta"}
          </p>
        </div>
        <ToggleSwitch checked={pushSubscribed} onChange={() => pushSubscribed ? onUnsubscribePush() : onSubscribePush()} />
      </div>

      {editing && (role === "rower" || role === "coach") && (
        <div style={{ background: "var(--vir-bg-surface-alt, var(--vir-bg-surface-alt, #3A3A3A))", border: "1px dashed var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: 14, marginBottom: 20 }}>
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Editar perfil</p>

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
                      background: active ? meta.color : "var(--vir-bg-surface, var(--vir-bg-surface, #404040))",
                      border: `1px solid ${active ? meta.color : "var(--vir-border, var(--vir-border, #565656))"}`,
                    }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        background: active ? "rgba(0,0,0,0.2)" : "var(--vir-bg-surface-alt, var(--vir-border, var(--vir-border, #565656)))", color: active ? "#FFFFFF" : "var(--vir-text-secondary, var(--vir-text-secondary, var(--vir-text-secondary, #ADADAD)))", fontSize: 9.5, fontWeight: 800,
                      }}>{meta.letter}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: active ? "#FFFFFF" : "var(--vir-text-primary, var(--vir-text-primary, #E8E8E8))" }}>{meta.label}</span>
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
        <div style={{ background: "var(--vir-bg-surface-alt, var(--vir-bg-surface-alt, #3A3A3A))", border: "1px dashed var(--vir-border, var(--vir-border, #565656))", borderRadius: 12, padding: 14, marginBottom: 20 }}>
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Editar perfil</p>

          <label style={labelStyle}>Nombre del club</label>
          <input value={clubNameInput} onChange={e => setClubNameInput(e.target.value)} style={fieldStyle} />

          <label style={labelStyle}>Correo (acceso y recuperación)</label>
          <input type="email" value={clubEmailInput} onChange={e => setClubEmailInput(e.target.value)} style={fieldStyle} />

          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, textTransform: "uppercase", margin: "16px 0 8px" }}>Datos del club</p>
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

          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, textTransform: "uppercase", margin: "16px 0 8px" }}>Persona de contacto</p>
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
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Asistencia a entrenos de agua</p>
          <div style={{ display: "flex", gap: 10 }}>
            <AttendanceCard label={`Este mes · ${attendance.month.label}`} attended={attendance.month.attended} total={attendance.month.total} />
            <AttendanceCard label={`Este año · ${attendance.year.label}`} attended={attendance.year.attended} total={attendance.year.total} />
          </div>
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, margin: "8px 2px 0" }}>Se actualiza cuando termina el horario del entreno, no al apuntarte.</p>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <InfoRow icon={<Check size={15} />} label="Días confirmados de asistencia" value={crewStats.convocado} />
          </div>
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, margin: "4px 2px 0" }}>Veces que el entrenador te ha convocado para el entreno de agua, hayan pasado ya o no.</p>
        </div>
      )}

      {role === "club" ? (
        <>
          <InfoRow icon={<KeyRound size={15} />} label="Número de club" value={clubCode} mono />
          <InfoRow icon={<Users size={15} />} label="Tripulaciones" value={teams.length} />
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "18px 2px 8px" }}>Códigos de tripulación</p>
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
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 11, textTransform: "uppercase", margin: "18px 2px 8px" }}>Códigos de tripulación · compártelos con tus remeros</p>
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
          <p style={{ color: "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontSize: 10.5, margin: "10px 2px 0", lineHeight: 1.4 }}>
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
          width: size, height: size, borderRadius: size / 2, background: "var(--vir-bg-surface-alt, #454545)", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          color: "var(--vir-red, #E61E29)", fontWeight: 700, fontSize: size * 0.36, fontFamily: "'Big Shoulders Display', sans-serif",
        }}
      >
        {photo ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
      </div>
      <div
        className="vir-btn"
        onClick={() => inputRef.current?.click()}
        style={{
          position: "absolute", bottom: -2, right: -2, width: size * 0.36, height: size * 0.36, borderRadius: "50%",
          background: "var(--vir-red, #E61E29)", border: "2px solid var(--vir-bg-surface-alt, #333333)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
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
        background: "var(--vir-bg-surface, #404040)", border: "1px dashed var(--vir-border, #565656)", borderRadius: 10,
        padding: "11px 0", color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12.5, cursor: "pointer",
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
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "4px 2px 0" }}>Formatos admitidos: {formatsLabel}.</p>
      )}
      {error && (
        <p style={{ color: "var(--vir-error, #FF8890)", fontSize: 11, margin: "6px 2px 0" }}>{error}</p>
      )}
      {photo && kind !== "pdf" && (
        <img src={photo} alt="Foto del entreno" style={{ marginTop: 8, width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 10, border: "1px solid var(--vir-border, #565656)" }} />
      )}
      {photo && kind === "pdf" && (
        <p style={{ marginTop: 8, color: "var(--vir-text-secondary, #ADADAD)", fontSize: 12 }}>📄 Archivo PDF adjuntado</p>
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
  const toolBtn = { background: "var(--vir-bg-surface-alt, #333333)", border: "1px solid var(--vir-border, #565656)", borderRadius: 6, width: 30, height: 28, color: "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5 };
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
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Notas</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>
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
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Medidas</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>
        🔒 Solo consulta — las gestiona el entrenador para cada bote.
      </p>
      {boats.length === 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13 }}>Todavía no hay ningún bote con medidas registradas.</p>}
      {boats.map(b => {
        const value = (measurements[b.id] || {})[myId];
        return (
          <div key={b.id} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 700, margin: "0 0 6px" }}>{b.name}</p>
            {value ? (
              <p className="vir-mono" style={{ color: "var(--vir-red, #E61E29)", fontSize: 15, fontWeight: 700, margin: 0 }}>{value}</p>
            ) : (
              <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, margin: 0 }}>El entrenador todavía no ha registrado tu medida en este bote.</p>
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
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Datos de gim</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, margin: "0 0 16px", lineHeight: 1.4 }}>
        {subtitle || "Cada ejercicio tiene su propia tabla de porcentajes de trabajo, calculada a partir del registro (100%)."}
      </p>
      {!editable && (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11.5, margin: "0 0 16px", lineHeight: 1.4 }}>
          🔒 Solo consulta — lo gestiona el propio remero desde su perfil.
        </p>
      )}

      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={15} color="var(--vir-text-muted, #8A8A8A)" style={{ position: "absolute", left: 12, top: 12 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar ejercicio" style={{ ...inputStyle, paddingLeft: 34 }} />
      </div>

      {editable && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 6, display: "block" }}>Ejercicio</label>
          <input value={newExercise} onChange={e => setNewExercise(e.target.value)} placeholder="Ej. Sentadilla" style={{ ...inputStyle, padding: "11px", fontSize: 16, width: "100%", marginBottom: 10 }} />
          <button className="vir-btn" onClick={() => { if (newExercise.trim()) { onAddExercise(newExercise.trim()); setNewExercise(""); } }} style={{ ...primaryBtn, padding: "11px 0", fontSize: 13 }}>Crear</button>
        </div>
      )}

      {visible.length === 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13 }}>{exercises.length === 0 ? "Todavía no hay ejercicios registrados." : "Sin ejercicios que coincidan con la búsqueda."}</p>}
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
    <div style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 12, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: (editing || expanded) ? 8 : 0 }}>
        <p
          className="vir-btn"
          onClick={() => setExpanded(!expanded)}
          style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13.5, fontWeight: 700, margin: 0, flex: 1, cursor: "pointer" }}
        >
          {exercise.name} <span style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11 }}>{expanded ? "▲" : "▼"}</span>
        </p>
        {editable && (
          <button className="vir-btn" onClick={() => setMenuOpen(!menuOpen)} style={{ background: "transparent", color: "var(--vir-text-secondary, #ADADAD)", padding: "4px 6px", fontSize: 18, lineHeight: 1 }}>
            ⋮
          </button>
        )}
        {menuOpen && (
          <div style={{ position: "absolute", top: 38, right: 12, zIndex: 10, background: "#333333", border: "1px solid var(--vir-border, #565656)", borderRadius: 10, overflow: "hidden", minWidth: 160, boxShadow: "0 8px 20px rgba(0,0,0,.4)" }}>
            <button
              className="vir-btn"
              onClick={() => { setBaseInput(exercise.baseKg || ""); setEditing(true); setExpanded(true); setMenuOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13, background: "transparent", borderBottom: "1px solid var(--vir-border, #565656)" }}
            >
              Modificar peso
            </button>
            {onRemove && (
              <button
                className="vir-btn"
                onClick={() => { setMenuOpen(false); onRemove(); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", color: "var(--vir-error, #FF8890)", fontSize: 13, background: "transparent" }}
              >
                Eliminar ejercicio
              </button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div style={{ marginBottom: 4 }}>
          <label style={{ fontSize: 12, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 6, display: "block" }}>Peso 100% (2RP)</label>
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
        expanded && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, margin: 0 }}>{editable ? "Abre el menú (⋮) para registrar el 100%." : "Tu entrenador todavía no ha registrado esta marca."}</p>
      ) : expanded ? (
        <>
          <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, margin: "0 0 8px" }}>Registro (100%): <span className="vir-mono" style={{ color: "var(--vir-text-primary, #F5F5F5)" }}>{exercise.baseKg} kg</span></p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {PESOS_PCTS.map(pct => (
              <div key={pct} style={{ background: "#333333", border: "1px solid var(--vir-border, #565656)", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10, margin: 0 }}>{pct}%</p>
                <p className="vir-mono" style={{ color: pct === 100 ? "var(--vir-red, #E61E29)" : "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5, fontWeight: 700, margin: "2px 0 0" }}>
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
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>Datos ergo</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>
        Registra tu tiempo del TEST 1600; las zonas Z0-Z6 y los porcentajes de trabajo se calculan solos a partir de ese tiempo.
      </p>

      <div style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "14px 16px", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: editingTest ? 10 : 0 }}>
          <div>
            <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 4px" }}>TEST 1600 · tiempo</p>
            <p className="vir-mono" style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 22, fontWeight: 700, margin: 0 }}>{testTime || "—"}</p>
            {baseWatts && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, margin: "4px 0 0" }}>≈ {Math.round(baseWatts)} W de media</p>}
          </div>
          <button className="vir-btn" onClick={startEdit} style={{ background: "#333333", border: "1px solid var(--vir-border, #565656)", borderRadius: 10, padding: "8px 10px", color: "var(--vir-text-secondary, #ADADAD)" }}>
            <Pencil size={15} />
          </button>
        </div>
        {editingTest && (
          <div>
            <label style={{ fontSize: 12, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 6, display: "block" }}>Tiempo TEST 1600</label>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <input
                  value={minInput}
                  onChange={e => setMinInput(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="0"
                  inputMode="numeric"
                  style={{ ...inputStyle, padding: "11px", fontSize: 18, width: "100%", textAlign: "center" }}
                />
                <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10, textAlign: "center", margin: "4px 0 0" }}>minutos</p>
              </div>
              <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 20, margin: "0 0 20px" }}>:</p>
              <div style={{ flex: 1 }}>
                <input
                  value={secInput}
                  onChange={e => setSecInput(Math.min(59, +e.target.value.replace(/\D/g, "") || 0).toString().slice(0, 2))}
                  placeholder="00"
                  inputMode="numeric"
                  style={{ ...inputStyle, padding: "11px", fontSize: 18, width: "100%", textAlign: "center" }}
                />
                <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10, textAlign: "center", margin: "4px 0 0" }}>segundos</p>
              </div>
              <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 20, margin: "0 0 20px" }}>.</p>
              <div style={{ flex: 1 }}>
                <input
                  value={tenthsInput}
                  onChange={e => setTenthsInput(e.target.value.replace(/\D/g, "").slice(0, 1))}
                  placeholder="0"
                  inputMode="numeric"
                  style={{ ...inputStyle, padding: "11px", fontSize: 18, width: "100%", textAlign: "center" }}
                />
                <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10, textAlign: "center", margin: "4px 0 0" }}>décimas</p>
              </div>
            </div>
            <button className="vir-btn" disabled={!composed()} onClick={saveTest} style={{ ...primaryBtn, padding: "11px 0", fontSize: 13, opacity: composed() ? 1 : 0.4 }}>Guardar</button>
          </div>
        )}
      </div>

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Trabajo de zonas</p>
      {!baseWatts ? (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5, marginBottom: 22 }}>Registra tu tiempo del TEST 1600 para calcular las zonas.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 22 }}>
          {ERGO_ZONES.map(z => {
            const [minPct, maxPct] = ERGO_ZONE_BANDS[z];
            const minW = Math.round(baseWatts * minPct / 100);
            const maxW = Math.round(baseWatts * maxPct / 100);
            return (
              <div key={z} style={{ background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 10, padding: "10px 12px" }}>
                <p style={{ color: "var(--vir-red, #E61E29)", fontSize: 12.5, fontWeight: 800, margin: "0 0 4px" }}>{z}</p>
                <p className="vir-mono" style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13, fontWeight: 700, margin: 0 }}>{minW}–{maxW} W</p>
                <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 9.5, margin: "2px 0 0" }}>{minPct}–{maxPct}% del test</p>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Valores de trabajo por porcentaje</p>
      {!baseWatts ? (
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12.5 }}>Registra tu tiempo del TEST 1600 para calcular esta tabla.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {ERGO_PCTS.map(pct => (
            <div key={pct} style={{ background: "var(--vir-bg-surface, #404040)", border: `1px solid ${pct === 100 ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)"}`, borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
              <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10, margin: 0 }}>{pct}%</p>
              <p className="vir-mono" style={{ color: pct === 100 ? "var(--vir-red, #E61E29)" : "var(--vir-text-primary, #F5F5F5)", fontSize: 12.5, fontWeight: 700, margin: "2px 0 0" }}>
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
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 2px" }}>{title}</h2>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>{sub}</p>

      <div style={{ background: "var(--vir-bg-surface-alt, #3A3A3A)", border: "1px dashed var(--vir-border, #565656)", borderRadius: 12, padding: 14, marginBottom: 20 }}>
        <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Nuevo registro</p>
        {fields.map(f => (
          <div key={f.key} style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11.5, color: "var(--vir-text-secondary, #ADADAD)", marginBottom: 4, display: "block" }}>{f.label}</label>
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

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Historial ({entries.length})</p>
      {entries.length === 0 && <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13 }}>Todavía no has añadido ningún registro.</p>}
      {entries.map(e => (
        <div key={e.id} style={{ display: "flex", gap: 12, background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          {e.photo && <img src={e.photo} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
          <div>
            <p style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13, fontWeight: 600, margin: 0 }}>{renderSummary(e)}</p>
            <p className="vir-mono" style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, margin: "4px 0 0" }}>
              {DAYS_ES[e.date.getDay()]} {e.date.getDate()} de {MONTHS_ES[e.date.getMonth()]}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function RowerStatsScreen({ onBack, attendance, crewStats, pesosCount, ergoTestSet, waterWeekMonth, gymWeekMonth, currentWeek, currentGymWeek }) {
  const gymWeekLabel = (mondayIso) => {
    const mon = new Date(mondayIso + "T00:00:00");
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const sameMonth = mon.getMonth() === sun.getMonth();
    return sameMonth ? `${mon.getDate()}-${sun.getDate()} ${MONTHS_ES[mon.getMonth()].slice(0, 3)}` : `${mon.getDate()} ${MONTHS_ES[mon.getMonth()].slice(0, 3)} - ${sun.getDate()} ${MONTHS_ES[sun.getMonth()].slice(0, 3)}`;
  };
  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--vir-text-primary, #F5F5F5)", margin: "10px 0 18px" }}>Estadísticas</h2>

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Asistencia general</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <AttendanceCard label={`Este mes · ${attendance.month.label}`} attended={attendance.month.attended} total={attendance.month.total} />
        <AttendanceCard label={`Este año · ${attendance.year.label}`} attended={attendance.year.attended} total={attendance.year.total} />
      </div>

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Entrenos de agua hechos</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
        <AttendanceCard label={`Semana ${currentWeek}`} attended={waterWeekMonth.weekDone} total={waterWeekMonth.weekTotal} />
        <AttendanceCard label="Este mes" attended={waterWeekMonth.monthDone} total={waterWeekMonth.monthTotal} />
      </div>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "0 0 22px" }}>Convocado: {crewStats.convocado} · Entrenado: {crewStats.entrenado}</p>

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Entrenos de gim hechos (5 sesiones semanales)</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <AttendanceCard label={gymWeekLabel(currentGymWeek)} attended={gymWeekMonth.weekDone} total={gymWeekMonth.weekTotal} unitLabel="hecho" />
        <AttendanceCard label="Este mes" attended={gymWeekMonth.monthDone} total={gymWeekMonth.monthTotal} unitLabel="hecho" />
      </div>

      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Datos de gim y datos ergo</p>
      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Ejercicios con marca" value={pesosCount} />
        <StatCard label="TEST 1600 registrado" value={ergoTestSet ? "Sí" : "No"} />
      </div>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "10px 2px 0", lineHeight: 1.4 }}>
        Los registros de pesos y ergo son los que tú mismo has ido guardando, con sus fotos y valores, para ver tu evolución de cargas y ritmos.
      </p>
    </div>
  );
}

function AttendanceCard({ label, attended, total, unitLabel = "asistencia" }) {
  const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
  return (
    <div style={{ flex: 1, background: "var(--vir-bg-surface, #404040)", border: "1px solid var(--vir-border, #565656)", borderRadius: 12, padding: 12 }}>
      <p style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 10.5, margin: "0 0 8px", textTransform: "uppercase" }}>{label}</p>
      <p className="vir-mono" style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 20, fontWeight: 600, margin: 0 }}>{attended}<span style={{ color: "var(--vir-text-muted, #8A8A8A)", fontSize: 13 }}>/{total}</span></p>
      <div style={{ height: 5, background: "var(--vir-border, #565656)", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--vir-red, #E61E29)", borderRadius: 3 }} />
      </div>
      <p style={{ color: "var(--vir-text-secondary, #ADADAD)", fontSize: 10.5, margin: "6px 0 0" }}>{pct}% {unitLabel}</p>
    </div>
  );
}

function ScopeChip({ active, onClick, label }) {
  return (
    <button className="vir-btn" onClick={onClick} style={{
      padding: "7px 13px", borderRadius: 20, fontSize: 12,
      background: active ? "var(--vir-red, #E61E29)" : "var(--vir-bg-surface, #404040)",
      border: `1px solid ${active ? "var(--vir-red, #E61E29)" : "var(--vir-border, #565656)"}`,
      color: active ? "#FFFFFF" : "var(--vir-text-primary, #F5F5F5)", fontWeight: active ? 600 : 400,
    }}>{label}</button>
  );
}

function InfoRow({ icon, label, value, mono }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 2px", borderBottom: "1px solid var(--vir-border, #565656)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--vir-text-secondary, #ADADAD)", fontSize: 13 }}>{icon}{label}</div>
      <span className={mono ? "vir-mono" : ""} style={{ color: "var(--vir-text-primary, #F5F5F5)", fontSize: 13 }}>{value}</span>
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
    <button className="vir-btn" onClick={onBack} style={{ background: "transparent", color: "var(--vir-text-secondary, #ADADAD)", display: "flex", alignItems: "center", gap: 4, fontSize: 13, padding: 0 }}>
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
    <div style={{ display: "flex", borderTop: "1px solid var(--vir-border, var(--vir-border, #565656))", background: "var(--vir-bg-surface-alt, var(--vir-bg-surface-alt, #3A3A3A))" }}>
      {tabs.map(t => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button key={t.id} className="vir-btn" onClick={() => setScreen(t.id)} style={{
            flex: 1, background: "transparent", padding: "10px 0 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative",
          }}>
            <Icon size={19} color={isActive ? "var(--vir-red, var(--vir-red, #E61E29))" : "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))"} />
            {!!t.badge && <span style={{ position: "absolute", top: 5, right: "28%", width: 7, height: 7, borderRadius: 4, background: "var(--vir-error, var(--vir-error, #FF8890))" }} />}
            <span style={{ fontSize: 10, color: isActive ? "var(--vir-red, var(--vir-red, #E61E29))" : "var(--vir-text-muted, var(--vir-text-muted, #8A8A8A))", fontWeight: isActive ? 600 : 400 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const inputStyle = {
  width: "100%", background: "var(--vir-bg-input, var(--vir-bg-surface, #404040))", border: "1px solid var(--vir-border, var(--vir-border, #565656))", borderRadius: 10,
  padding: "11px 12px", color: "var(--vir-text-primary, var(--vir-text-primary, #F5F5F5))", fontSize: 13.5, outline: "none",
};
const primaryBtn = {
  width: "100%", background: "var(--vir-red, #E61E29)", color: "#FFFFFF", fontWeight: 700, fontSize: 14,
  padding: "13px 0", borderRadius: 12,
};
const ghostBtn = {
  background: "transparent", border: "1px solid var(--vir-border, var(--vir-border, #565656))", color: "var(--vir-text-primary, var(--vir-text-primary, #E8E8E8))", fontSize: 13,
  padding: "10px 0", borderRadius: 10,
};

function ViradaMark({ height = 32, color = "var(--vir-text-primary, #F5F5F5)" }) {
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
