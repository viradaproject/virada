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
const race = (dateLabel, title) => ({ id: `rc${Math.random().toString(36).slice(2, 9)}`, dateLabel, title, notes: "", docs: [] });
const RACE_SEED = [
  {
    id: "cat-llagut", name: "LLAGUT",
    races: [
      race("4 Octubre", "Arenys"),
      race("18 Octubre", "Roses"),
      race("8 Novembre", "Lloret (Peskis)"),
      race("15 Novembre", "CN St Feliu"),
      race("29 Novembre", "Lloret (Hotelers)"),
      race("19 i 20 Desembre", "CCAT VE Cambrils"),
    ],
  },
  {
    id: "cat-llaut-batel", name: "LLAÜT MEDITERRANI I BATEL",
    races: [
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
];
const DOC_TYPES = ["Dossier", "Horarios", "Resultados", "Otro"];

const FISICO_SLOTS = ["fisico1", "fisico2", "fisico3", "fisico4", "fisico5"];
const FISICO_LABELS = { fisico1: "Sesión 1", fisico2: "Sesión 2", fisico3: "Sesión 3", fisico4: "Sesión 4", fisico5: "Sesión 5" };

const seatFill = (s) => s.seats.filter(Boolean).length + (s.patron ? 1 : 0) + s.reserves.filter(Boolean).length;
const hasPassed = (s, now) => s.date < now;
const inCrew = (s, id) => [...s.seats, s.patron, ...s.reserves].includes(id);
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
  const [raceCategories, setRaceCategories] = useState(RACE_SEED);
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

  // Carga inicial desde Supabase: clubes y usuarios (activos y pendientes) guardados de verdad
  useEffect(() => {
    const loadData = async () => {
      const { data: clubsData, error: clubsErr } = await supabase.from("clubs").select("*");
      if (!clubsErr && clubsData) {
        setClubs(clubsData.map(c => ({
          id: c.id, name: c.name, code: c.access_code,
          username: c.username, password: c.password_hash, createdAt: c.created_at,
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
        const roles = {}, pwds = {};
        usersData.forEach(u => { if (u.role) roles[u.id] = u.role; pwds[u.id] = u.password_hash; });
        setRoleOverrides(prev => ({ ...prev, ...roles }));
        setPasswords(prev => ({ ...prev, ...pwds }));
      }
      const { data: teamsData, error: teamsErr } = await supabase.from("teams").select("*");
      if (!teamsErr && teamsData) {
        setTeams(teamsData.map(t => ({ id: t.id, clubId: t.club_id, name: t.name, code: t.code })));
        // los entrenos de agua siguen generándose en memoria por ahora (todavía no migrados a Supabase)
        setSessions(teamsData.flatMap(t => buildSessions(t.id)));
      }
    };
    loadData();
  }, []);

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
  const updateMyProfile = ({ apodo, side, email, newPassword }) => {
    setNicknameOverrides(prev => ({ ...prev, [currentUserId]: apodo }));
    setSideOverrides(prev => ({ ...prev, [currentUserId]: side }));
    if (email !== undefined) setRecoveryEmails(prev => ({ ...prev, [currentUserId]: email }));
    if (newPassword) setPasswords(prev => ({ ...prev, [currentUserId]: newPassword }));
    flash("Perfil actualizado");
  };
  const updateClubName = (name) => {
    setClubs(prev => prev.map(c => c.id === currentClubId ? { ...c, name } : c));
    flash("Nombre del club actualizado");
  };
  const assignTeam = (id, teamId) => {
    setTeamOverrides(prev => ({ ...prev, [id]: teamId }));
    flash(`${displayNameOf(id)} asignado a ${teamName(teamId)}`);
  };
  const setPersonRole = (id, role) => {
    setRoleOverrides(prev => ({ ...prev, [id]: role }));
    flash(`Rol actualizado a ${role === "coach" ? "Entrenador" : "Remero"}`);
  };
  const managedTeamsOf = (coachId) => coachTeams[coachId] || [];
  const toggleCoachTeam = (coachId, teamId) => {
    setCoachTeams(prev => {
      const cur = prev[coachId] || [];
      const next = cur.includes(teamId) ? cur.filter(id => id !== teamId) : [...cur, teamId];
      return { ...prev, [coachId]: next };
    });
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
    const code = (person.clubCode || "").trim();
    const { data: clubRow, error: clubErr } = await supabase.from("clubs").select("*").eq("access_code", code).maybeSingle();
    if (clubErr || !clubRow) { setLoginError(clubs.length === 0 ? "Todavía no se ha registrado ningún club." : "Código de club incorrecto."); return; }
    if (isUsernameTaken(person.username)) { setLoginError("Ese nombre de usuario ya existe. Elige otro."); return; }
    const passwordHash = await hashPassword(person.password || "1234");
    const { data, error } = await supabase.from("users").insert({
      club_id: clubRow.id,
      username: person.username.trim().toLowerCase(),
      password_hash: passwordHash,
      nickname: person.apodo || null,
      side: person.side || null,
      status: "pending",
    }).select().single();
    if (error) { setLoginError("No se pudo completar el registro. Inténtalo de nuevo."); return; }
    const entry = { id: data.id, clubId: data.club_id, username: data.username, apodo: data.nickname, side: data.side };
    setPendingUsers(prev => [...prev, entry]);
    setPasswords(prev => ({ ...prev, [data.id]: passwordHash }));
    setLastRegistered(entry);
    setCurrentClubId(clubRow.id);
    setScreen("pendingRole");
  };
  const assignPendingUser = async (id, role, teamId) => {
    const p = pendingUsers.find(u => u.id === id);
    if (!p) return;
    const { error } = await supabase.from("users").update({ status: "active", role, activated_at: new Date().toISOString() }).eq("id", id);
    if (error) { flash("No se pudo asignar el rol. Inténtalo de nuevo."); return; }
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
    setSessions(prev => [...prev, ...buildSessions(data.id)]);
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

  const updateSession = (id, patch) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    if (openSession && openSession.id === id) setOpenSession(prev => ({ ...prev, ...patch }));
  };

  const toggleSignup = (session) => {
    const next = new Set(session.signups);
    if (next.has(currentUserId)) next.delete(currentUserId); else next.add(currentUserId);
    updateSession(session.id, { signups: next });
  };

  const assign = (session, slotType, slotIndex) => {
    if (!selectedRowerChip) return;
    const already = session.seats.includes(selectedRowerChip) || session.patron === selectedRowerChip || session.reserves.includes(selectedRowerChip);
    if (already) return;
    if (slotType === "seat") {
      const seats = [...session.seats]; seats[slotIndex] = selectedRowerChip;
      updateSession(session.id, { seats });
    } else if (slotType === "patron") {
      updateSession(session.id, { patron: selectedRowerChip });
    } else {
      const reserves = [...session.reserves]; reserves[slotIndex] = selectedRowerChip;
      updateSession(session.id, { reserves });
    }
    setSelectedRowerChip(null);
  };

  const clearSlot = (session, slotType, slotIndex) => {
    if (slotType === "seat") { const seats = [...session.seats]; seats[slotIndex] = null; updateSession(session.id, { seats }); }
    else if (slotType === "patron") updateSession(session.id, { patron: null });
    else { const reserves = [...session.reserves]; reserves[slotIndex] = null; updateSession(session.id, { reserves }); }
  };

  const closeCrew = (session) => {
    const assigned = [...session.seats, session.patron, ...session.reserves].filter(Boolean);
    const notes = assigned.map(rid => {
      let role = "reserva";
      const seatIdx = session.seats.indexOf(rid);
      if (seatIdx > -1) role = `puesto ${seatShort(seatIdx)}`;
      else if (session.patron === rid) role = "patrón";
      return {
        id: `${session.id}-${rid}`, rowerId: rid,
        text: `Has sido convocado al entreno de agua del ${session.date.getDate()} de ${MONTHS_ES[session.date.getMonth()]}, ${session.time}. Rol: ${role}.`,
      };
    });
    setNotifications(prev => [...notes, ...prev]);
    updateSession(session.id, { status: "cerrado" });
    flash("Tripulación cerrada y notificaciones enviadas");
  };

  const toggleActive = (session) => {
    if (session.active) { setSuspendTarget(session); return; } // desactivar un día activo pide motivo
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
  const addPesosExercise = (name) => {
    setPesosExercises(prev => ({ ...prev, [currentUserId]: [...(prev[currentUserId] || []), { id: `ex${Date.now()}`, name, baseKg: null }] }));
  };
  const setPesosExerciseBase = (exId, kg) => {
    setPesosExercises(prev => ({ ...prev, [currentUserId]: (prev[currentUserId] || []).map(ex => ex.id === exId ? { ...ex, baseKg: kg } : ex) }));
    flash("Registro actualizado");
  };

  const [ergoTests, setErgoTests] = useState({}); // { [rowerId]: watts }
  const [ergoZoneNotes, setErgoZoneNotes] = useState({}); // { [rowerId]: { Z0: "...", ... } }
  const setErgoTest = (watts) => {
    setErgoTests(prev => ({ ...prev, [currentUserId]: watts }));
    flash("TEST 1600 actualizado");
  };
  const setErgoZoneNote = (zone, value) => {
    setErgoZoneNotes(prev => ({ ...prev, [currentUserId]: { ...(prev[currentUserId] || {}), [zone]: value } }));
  };

  const [gymPlans, setGymPlans] = useState({}); // { [teamId]: { [week]: { fisico1..4: content } } }
  const [gymCompletion, setGymCompletion] = useState({}); // { [rowerId]: { "teamId-week-slot": { done, photo } } }
  const currentWeek = Math.ceil(today.getDate() / 7);
  const gymWeekPlan = (teamId, week) => (gymPlans[teamId] && gymPlans[teamId][week]) || {};
  const setGymContent = (teamId, week, slot, content) => {
    setGymPlans(prev => ({
      ...prev,
      [teamId]: { ...(prev[teamId] || {}), [week]: { ...((prev[teamId] || {})[week] || {}), [slot]: content } },
    }));
    flash("Entreno de gimnasio guardado");
  };
  const gymRecordOf = (rowerId, teamId, week, slot) => (gymCompletion[rowerId] && gymCompletion[rowerId][`${teamId}-${week}-${slot}`]) || null;
  const setGymRecord = (rowerId, teamId, week, slot, photo, photoKind) => {
    const key = `${teamId}-${week}-${slot}`;
    setGymCompletion(prev => ({ ...prev, [rowerId]: { ...(prev[rowerId] || {}), [key]: { done: true, photo, photoKind: photoKind || "image" } } }));
    flash("Entreno marcado como hecho");
  };
  const clearGymRecord = (rowerId, teamId, week, slot) => {
    const key = `${teamId}-${week}-${slot}`;
    setGymCompletion(prev => {
      const mine = { ...(prev[rowerId] || {}) };
      delete mine[key];
      return { ...prev, [rowerId]: mine };
    });
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
      const plan = gymWeekPlan(teamId, w);
      FISICO_SLOTS.forEach(slot => {
        if (!plan[slot]) return;
        monthTotal++;
        const rec = gymRecordOf(rowerId, teamId, w, slot);
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

  const isAdminLogin = (username, password) => (username || "").trim().toLowerCase() === "admin" && password === "1234";

  const loginClub = async (username, password) => {
    setLoginError(null);
    if (isAdminLogin(username, password)) { setRole("admin"); setCurrentClubId(null); setScreen("home"); return; }
    const u = (username || "").trim().toLowerCase();
    const passwordHash = await hashPassword(password);
    const { data, error } = await supabase.from("clubs").select("*").ilike("username", u).maybeSingle();
    if (error || !data || data.password_hash !== passwordHash) {
      setLoginError("Usuario o contraseña incorrectos.");
      return;
    }
    setClubs(prev => prev.some(c => c.id === data.id) ? prev : [...prev, {
      id: data.id, code: data.access_code, name: data.name, username: data.username, password: data.password_hash, createdAt: data.created_at,
    }]);
    setCurrentClubId(data.id);
    setRole("club");
    setScreen("home");
  };

  const loginUser = async (username, password) => {
    setLoginError(null);
    if (isAdminLogin(username, password)) { setRole("admin"); setCurrentClubId(null); setScreen("home"); return; }
    const u = (username || "").trim().toLowerCase();
    const passwordHash = await hashPassword(password);
    const { data, error } = await supabase.from("users").select("*").ilike("username", u).maybeSingle();
    if (error || !data || data.password_hash !== passwordHash) {
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
    setCurrentUserId(data.id);
    setCurrentClubId(data.club_id ?? null);
    if (data.role) setRoleOverrides(prev => ({ ...prev, [data.id]: data.role }));
    setRole(data.role || "rower");
    setScreen("home");
  };

  const registerClub = async (name, username, password) => {
    setLoginError(null);
    if (!username || !password) { setLoginError("Usuario y contraseña son obligatorios."); return; }
    if (isUsernameTaken(username)) { setLoginError("Ese nombre de usuario ya existe. Elige otro."); return; }
    let code = randomClubCode();
    while (clubs.some(c => c.code === code)) code = randomClubCode(); // cada club tiene un código único, propio y exclusivo
    const passwordHash = await hashPassword(password);
    const { data, error } = await supabase.from("clubs").insert({
      name: name && name.trim() ? name.trim() : "Tu club",
      access_code: code,
      username: username.trim().toLowerCase(),
      password_hash: passwordHash,
    }).select().single();
    if (error) { setLoginError("No se pudo registrar el club. Inténtalo de nuevo."); return; }
    const newClub = {
      id: data.id, code: data.access_code, name: data.name,
      username: data.username, password: data.password_hash, createdAt: data.created_at,
    };
    setClubs(prev => [...prev, newClub]);
    setCurrentClubId(data.id);
    setRole("club");
    setScreen("home");
    flash(`Club registrado · código ${code}`);
  };

  const addRaceCategory = (name) => {
    if (!name || !name.trim()) return;
    setRaceCategories(prev => [...prev, { id: `cat${Date.now()}`, name: name.trim().toUpperCase(), races: [] }]);
    flash("Categoría de regatas creada");
  };
  const removeRaceCategory = (catId) => {
    setRaceCategories(prev => prev.filter(c => c.id !== catId));
    flash("Categoría eliminada");
  };
  const addRace = (catId, dateLabel, title) => {
    if (!dateLabel || !dateLabel.trim()) return;
    setRaceCategories(prev => prev.map(c => c.id === catId ? { ...c, races: [...c.races, race(dateLabel.trim(), (title || "").trim())] } : c));
    flash("Día de regata añadido");
  };
  const removeRace = (catId, raceId) => {
    setRaceCategories(prev => prev.map(c => c.id === catId ? { ...c, races: c.races.filter(r => r.id !== raceId) } : c));
    flash("Día de regata eliminado");
  };
  const addRaceDoc = (catId, raceId, doc) => {
    setRaceCategories(prev => prev.map(c => c.id !== catId ? c : {
      ...c, races: c.races.map(r => r.id !== raceId ? r : { ...r, docs: [...r.docs, { id: `doc${Date.now()}`, ...doc }] }),
    }));
    flash("Documento subido");
  };
  const removeRaceDoc = (catId, raceId, docId) => {
    setRaceCategories(prev => prev.map(c => c.id !== catId ? c : {
      ...c, races: c.races.map(r => r.id !== raceId ? r : { ...r, docs: r.docs.filter(d => d.id !== docId) }),
    }));
  };
  const updateRaceTitle = (catId, raceId, title) => {
    setRaceCategories(prev => prev.map(c => c.id !== catId ? c : {
      ...c, races: c.races.map(r => r.id !== raceId ? r : { ...r, title }),
    }));
    flash("Título actualizado");
  };
  const updateRaceNotes = (catId, raceId, notes) => {
    setRaceCategories(prev => prev.map(c => c.id !== catId ? c : {
      ...c, races: c.races.map(r => r.id !== raceId ? r : { ...r, notes }),
    }));
    flash("Información actualizada");
  };

  const recoverPassword = (username) => {
    flash("Si el usuario existe, hemos enviado un enlace a su correo de recuperación.");
  };

  const myNotifications = notifications.filter(n => n.rowerId === currentUserId);

  const Logo = ({ size = 22 }) => (
    <ViradaMark height={size * 1.8} />
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

        {screen === "pendingRole" && (
          <PendingRoleScreen user={lastRegistered} onBack={() => { setLastRegistered(null); setScreen("login"); }} />
        )}

        {screen !== "login" && screen !== "pendingRole" && (
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
                  ergoTest={ergoTests[currentUserId] || null}
                  onNavigate={(id) => setScreen(id)}
                  myId={currentUserId}
                  myName={displayNameOf(currentUserId)}
                  myTeam={teamOf(currentUserId)}
                />
              )}
              {screen === "home" && role === "coach" && (
                <CoachHome sessions={coachWeekAhead} onOpen={(s) => { setOpenSession(s); setSelectedRowerChip(null); setScreen("sessionCoach"); }} scope={coachScope} setScope={setCoachScope} teams={clubTeams} onPlanCalendar={() => setScreen("coachPlan")} onGymPlan={() => setScreen("coachGymPlan")} onTeamStats={() => setScreen("coachTeamStats")} onOpenRegattas={() => setScreen("regattas")} coachName={displayNameOf(currentUserId)} teamName={teamName} showTeamLabel={coachScope === "club"} />
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
                  weekPlanFor={gymWeekPlan}
                  onSaveContent={setGymContent}
                  onBack={() => setScreen("home")}
                  editable={role === "admin" ? true : canManage(coachScope)}
                />
              )}
              {screen === "rowerGymPlan" && role === "rower" && (
                <RowerGymPlanScreen
                  teamId={teamOf(currentUserId)}
                  teamName={teamName}
                  currentWeek={currentWeek}
                  weekPlanFor={gymWeekPlan}
                  recordFor={(teamId, week, slot) => gymRecordOf(currentUserId, teamId, week, slot)}
                  onMarkDone={(teamId, week, slot, photo, photoKind) => setGymRecord(currentUserId, teamId, week, slot, photo, photoKind)}
                  onClearDone={(teamId, week, slot) => clearGymRecord(currentUserId, teamId, week, slot)}
                  onViewPhoto={(photo, caption) => setViewPhoto({ photo, caption })}
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
                  ergoTest={ergoTests[openPerson.id] || null}
                  currentWeek={currentWeek}
                  weekPlanFor={gymWeekPlan}
                  recordFor={(teamId, week, slot) => gymRecordOf(openPerson.id, teamId, week, slot)}
                  waterWeekMonth={waterStatsFor(openPerson.id, teamOf(openPerson.id))}
                  gymWeekMonth={gymStatsFor(openPerson.id, teamOf(openPerson.id))}
                  onViewPhoto={(photo, caption) => setViewPhoto({ photo, caption })}
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
                <ClubTeamsScreen teams={clubTeams} onAddTeam={addTeam} onRemoveTeam={removeTeam} teamOf={teamOf} onOpenTeam={(t) => { setOpenTeam(t); setScreen("teamDetail"); }} />
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
                <ClubUsersScreen teams={clubTeams} teamName={teamName} teamOf={teamOf} roleOf={roleOf} onAssignTeam={assignTeam} onSetRole={setPersonRole} pendingUsers={clubPendingUsers} assignedUsers={clubAssignedUsers} onAssignPending={assignPendingUser} onRejectPending={rejectPendingUser} managedTeamsOf={managedTeamsOf} onToggleCoachTeam={toggleCoachTeam} />
              )}
              {screen === "calendar" && role === "rower" && (
                <CalendarScreen sessions={rowerUpcoming} onOpen={(s) => { setOpenSession(s); setScreen("sessionRower"); }} onToggle={toggleSignup} myId={currentUserId} />
              )}
              {screen === "calendar" && role === "coach" && (
                <CalendarScreen sessions={coachUpcoming} onOpen={(s) => { setOpenSession(s); setSelectedRowerChip(null); setScreen("sessionCoach"); }} myId={currentUserId} teamName={teamName} showTeamLabel={coachScope === "club"} />
              )}
              {screen === "sessionRower" && openSession && (
                <SessionRowerScreen session={openSession} onBack={() => setScreen(role === "rower" ? "home" : "calendar")} onToggle={toggleSignup} myId={currentUserId} nameOf={nameOf} nicknameOf={nicknameOf} />
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
                  teamName={teamName}
                  teamOf={teamOf}
                  nameOf={nameOf}
                  nicknameOf={nicknameOf}
                  sideOf={sideOf}
                  waterStatsFor={waterStatsFor}
                  gymStatsFor={gymStatsFor}
                  onUpdateSession={updateSession}
                  editable={role === "admin" ? true : canManage(openSession.teamId)}
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
                  clubCode={clubCode}
                  onUpdateMyProfile={updateMyProfile}
                  clubDisplayName={clubDisplayName}
                  onUpdateClubName={updateClubName}
                />
              )}
              {screen === "testPesos" && role === "rower" && (
                <PesosScreen
                  exercises={pesosExercisesOf(currentUserId)}
                  onAddExercise={addPesosExercise}
                  onSetBase={setPesosExerciseBase}
                  onBack={() => setScreen("profile")}
                />
              )}
              {screen === "zonasErgo" && role === "rower" && (
                <ErgoZonesScreen
                  testWatts={ergoTests[currentUserId] || null}
                  onSetTest={setErgoTest}
                  zoneNotes={ergoZoneNotes[currentUserId] || {}}
                  onSetZoneNote={setErgoZoneNote}
                  onBack={() => setScreen("profile")}
                />
              )}
              {screen === "estadisticas" && role === "rower" && (
                <RowerStatsScreen
                  onBack={() => setScreen("profile")}
                  attendance={attendanceStats}
                  crewStats={statsFor(currentUserId)}
                  pesosCount={pesosExercisesOf(currentUserId).length}
                  ergoTestSet={!!ergoTests[currentUserId]}
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

function LoginScreen({ onRegisterClub, onLoginClub, onLoginUser, onRegisterUser, onRecoverPassword, onClearError, loginError, Logo }) {
  const [view, setView] = useState("menu"); // "menu" | "registerClub" | "registerUser" | "loginClub" | "loginUser"
  const [quickRole, setQuickRole] = useState(null); // "coach" | "rower" | null — desplegable de acceso directo
  const [regSide, setRegSide] = useState("babor");
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [apodoInput, setApodoInput] = useState("");
  const [clubNameRegInput, setClubNameRegInput] = useState("");
  const [clubCodeInput, setClubCodeInput] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);

  const goTo = (v) => {
    setUsernameInput(""); setPasswordInput(""); setApodoInput(""); setClubNameRegInput("");
    setClubCodeInput(""); setShowRecovery(false); setRecoverySent(false);
    onClearError();
    setView(v);
  };

  const submitRegisterClub = () => onRegisterClub(clubNameRegInput, usernameInput, passwordInput);

  const submitRegisterUser = () => {
    onRegisterUser({ username: usernameInput, apodo: apodoInput, side: regSide, clubCode: clubCodeInput, password: passwordInput });
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

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6, marginTop: 24 }}><Logo size={34} /></div>
      <p style={{ textAlign: "center", color: "#ADADAD", fontSize: 13, margin: "4px 0 34px" }}>Central de reservas de club de remo</p>

      {view === "menu" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 2px" }}>Registro</p>
          <button className="vir-btn" onClick={() => goTo("registerClub")} style={{ ...primaryBtn, textAlign: "left", padding: "14px 16px" }}>
            Registro del club
          </button>
          <button className="vir-btn" onClick={() => goTo("registerUser")} style={{ ...ghostBtn, textAlign: "left", padding: "14px 16px" }}>
            Registro de usuario
          </button>

          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "18px 0 2px" }}>Acceso</p>
          <button className="vir-btn" onClick={() => goTo("loginClub")} style={{ ...ghostBtn, textAlign: "left", padding: "14px 16px" }}>
            Acceso club
          </button>
          <button className="vir-btn" onClick={() => goTo("loginUser")} style={{ ...ghostBtn, textAlign: "left", padding: "14px 16px" }}>
            Acceso usuario
          </button>

          <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "18px 0 2px" }}>Acceso directo de pruebas</p>
          <button className="vir-btn" onClick={() => { onLoginClub("CLUB", "1234"); }} style={{ ...ghostBtn, textAlign: "left", padding: "14px 16px" }}>
            Club <span style={{ color: "#8A8A8A", fontWeight: 400 }}> · CLUB / 1234 · código 001</span>
          </button>
          <button className="vir-btn" onClick={() => setQuickRole(quickRole === "coach" ? null : "coach")} style={{ ...ghostBtn, textAlign: "left", padding: "14px 16px" }}>
            Entrenador <span style={{ color: "#8A8A8A", fontWeight: 400 }}> · elige un usuario</span>
          </button>
          {quickRole === "coach" && (
            <div style={{ display: "flex", gap: 8 }}>
              {DEMO_COACHES.map(u => (
                <button key={u.id} className="vir-btn" onClick={() => onLoginUser(u.username, "1234")} style={{ ...ghostBtn, flex: 1, padding: "10px 0", fontSize: 12 }}>
                  {u.username}
                </button>
              ))}
            </div>
          )}
          <button className="vir-btn" onClick={() => setQuickRole(quickRole === "rower" ? null : "rower")} style={{ ...ghostBtn, textAlign: "left", padding: "14px 16px" }}>
            Remero <span style={{ color: "#8A8A8A", fontWeight: 400 }}> · elige un usuario</span>
          </button>
          {quickRole === "rower" && (
            <div style={{ display: "flex", gap: 8 }}>
              {DEMO_ROWERS.map(u => (
                <button key={u.id} className="vir-btn" onClick={() => onLoginUser(u.username, "1234")} style={{ ...ghostBtn, flex: 1, padding: "10px 0", fontSize: 12 }}>
                  {u.username}
                </button>
              ))}
            </div>
          )}
          <p style={{ color: "#8A8A8A", fontSize: 10, margin: "4px 2px 0", lineHeight: 1.4 }}>
            Solo para revisar el prototipo. El administrador sigue accediendo con usuario ADMIN y contraseña 1234 desde "Acceso club" o "Acceso usuario".
          </p>
        </div>
      )}

      {view === "loginClub" && (
        <>
          <BackRow onBack={() => goTo("menu")} />
          <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "#F5F5F5", margin: "10px 0 18px" }}>Acceso club</h2>
          {usernamePasswordFields}
          {recoveryBlock}
          <button className="vir-btn" onClick={() => onLoginClub(usernameInput, passwordInput)} style={{ ...primaryBtn, marginTop: 22 }}>Entrar</button>
        </>
      )}

      {view === "loginUser" && (
        <>
          <BackRow onBack={() => goTo("menu")} />
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
          <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "#F5F5F5", margin: "10px 0 4px" }}>Registro del club</h2>
          <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>
            Al crear la cuenta, VIRADA generará automáticamente el código de acceso de tu club. Compártelo con tus entrenadores y remeros para que puedan registrarse dentro de tu club y no de otro.
          </p>
          <label style={{ fontSize: 12, color: "#ADADAD", margin: "0 0 6px" }}>Nombre del club</label>
          <input value={clubNameRegInput} onChange={e => setClubNameRegInput(e.target.value)} placeholder="Ej. Club Nàutic..." style={inputStyle} />
          <div style={{ marginTop: 14 }}>{usernamePasswordFields}</div>
          {loginError && <p style={{ color: "#FF8890", fontSize: 11.5, margin: "8px 2px 0" }}>{loginError}</p>}
          <button className="vir-btn" onClick={submitRegisterClub} style={{ ...primaryBtn, marginTop: 22 }}>Registrar club</button>
        </>
      )}

      {view === "registerUser" && (
        <>
          <BackRow onBack={() => goTo("menu")} />
          <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 20, color: "#F5F5F5", margin: "10px 0 4px" }}>Registro de usuario</h2>
          <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>
            Con el código de tu club accedes a su paraguas de gestión. Una vez dentro, será el club quien te asigne el rol — entrenador o remero — y, si corresponde, la tripulación.
          </p>
          {usernamePasswordFields}
          {loginError && <p style={{ color: "#FF8890", fontSize: 11.5, margin: "8px 2px 0" }}>{loginError}</p>}
          <label style={{ fontSize: 12, color: "#ADADAD", margin: "14px 0 6px" }}>Apodo</label>
          <input value={apodoInput} onChange={e => setApodoInput(e.target.value)} placeholder="Como quieres que te vean en el bote" style={inputStyle} />
          <label style={{ fontSize: 12, color: "#ADADAD", margin: "16px 0 8px" }}>¿Dónde remas?</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {Object.entries(SIDE_META).map(([key, meta]) => {
              const active = regSide === key;
              return (
                <button key={key} className="vir-btn" onClick={() => setRegSide(key)} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 10,
                  background: active ? meta.color : "#404040",
                  border: `1px solid ${active ? meta.color : "#565656"}`,
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: active ? "rgba(0,0,0,0.2)" : "#565656", color: active ? "#FFFFFF" : "#ADADAD",
                    fontSize: 10, fontWeight: 800,
                  }}>{meta.letter}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: active ? "#FFFFFF" : "#E8E8E8" }}>{meta.label}</span>
                </button>
              );
            })}
          </div>
          <label style={{ fontSize: 12, color: "#ADADAD", margin: "14px 0 6px" }}>Código de club</label>
          <div style={{ position: "relative" }}>
            <KeyRound size={15} color="#8A8A8A" style={{ position: "absolute", left: 12, top: 12 }} />
            <input
              value={clubCodeInput}
              onChange={e => setClubCodeInput(e.target.value)}
              placeholder="Ej. 452"
              style={{ ...inputStyle, paddingLeft: 34 }}
            />
          </div>
          {loginError && (
            <p style={{ color: "#FF8890", fontSize: 11.5, margin: "8px 2px 0" }}>{loginError}</p>
          )}
          <button className="vir-btn" onClick={submitRegisterUser} style={{ ...primaryBtn, marginTop: 22 }}>Crear cuenta</button>
        </>
      )}
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

function SessionRow({ s, onOpen, right, teamLabel }) {
  const dow = DAYS_ES[s.dow];
  return (
    <div className="vir-btn" onClick={() => onOpen(s)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#404040", border: "1px solid #565656", borderRadius: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
          <SessionRow key={s.id} s={s} onOpen={onOpen} right={
            s.status === "cerrado"
              ? <Badge text={[...s.seats, s.patron, ...s.reserves].includes(myId) ? "Seleccionado" : "Cerrado"} tone={[...s.seats, s.patron, ...s.reserves].includes(myId) ? "selected" : "closed"} />
              : <Badge text={s.signups.has(myId) ? "Apuntado ✓" : "Apuntarse"} tone={s.signups.has(myId) ? "signed" : "action"} onClick={() => onToggle(s)} />
          } />
        ))}
      </div>
    </div>
  );
}

function CoachHome({ sessions, onOpen, scope, setScope, teams, onPlanCalendar, onTeamStats, onGymPlan, onOpenRegattas, coachName, teamName, showTeamLabel }) {
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
            <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>Sube las 5 sesiones de cada semana</p>
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

function CoachRowerDetailScreen({ person, onBack, teamName, teamOf, statsFor, totalPastActive, pesosExercises, ergoTest, currentWeek, weekPlanFor, recordFor, waterWeekMonth, gymWeekMonth, onViewPhoto }) {
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
        const items = FISICO_SLOTS.filter(slot => plan[slot]);
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
                  {done && record.photo && (
                    <img
                      src={record.photo}
                      alt="Toca para ampliar"
                      onClick={() => onViewPhoto(record.photo, `${FISICO_LABELS[slot]} · Semana ${week} · ${person.name}`)}
                      style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover", cursor: "pointer" }}
                    />
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
        <p style={{ color: "#8A8A8A", fontSize: 12.5, lineHeight: 1.5 }}>
          Los registros de pesos y ergo son personales de cada remero. Este remero aún no ha compartido ninguno desde su perfil.
        </p>
      )}
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

function AdminHome({ onOpenRegattas, onOpenUsers, onOpenTeams, onOpenWater, onOpenGym, onOpenStats, clubCode, clubDisplayName, teamsCount, coachCount, rowerCount, clubs, currentClubId, onSwitchClub }) {
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
            <div key={c.id} className="vir-btn" onClick={() => onSwitchClub(c.id)} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{c.name}</p>
                <p className="vir-mono" style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>Código {c.code}</p>
              </div>
              <ChevronRight size={18} color="#8A8A8A" />
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

  const activeCat = categories.find(c => c.id === tab) || categories[0];
  const sortedRaces = activeCat ? [...activeCat.races].sort((a, b) => raceSortKey(a.dateLabel) - raceSortKey(b.dateLabel)) : [];

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
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Nueva categoría (ej. LLAGUT)" style={{ ...inputStyle, padding: "9px 11px", fontSize: 12.5, flex: 1 }} />
          <button className="vir-btn" onClick={() => { onAddCategory(newCatName); setNewCatName(""); }} style={{ ...primaryBtn, padding: "9px 16px", fontSize: 12.5 }}>Crear</button>
        </div>
      )}

      {activeCat && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: 0 }}>{activeCat.name}</p>
            {editable && (
              <button className="vir-btn" onClick={() => onRemoveCategory(activeCat.id)} style={{ background: "transparent", color: "#8A8A8A", fontSize: 10.5, textDecoration: "underline" }}>Eliminar categoría</button>
            )}
          </div>

          {sortedRaces.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 12.5, marginBottom: 14 }}>Sin días de regata todavía.</p>}

          {sortedRaces.map(r => (
            <div key={r.id} className="vir-btn" onClick={() => onOpenRace(activeCat.id, r.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 74, textAlign: "center" }}>
                  <p className="vir-mono" style={{ color: "#E61E29", fontSize: 12.5, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{r.dateLabel}</p>
                  {raceCountdownLabel(r.dateLabel) && (
                    <p style={{ color: "#8A8A8A", fontSize: 9, margin: "2px 0 0", lineHeight: 1.2 }}>{raceCountdownLabel(r.dateLabel)}</p>
                  )}
                </div>
                <div>
                  <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{r.title || "Sin título todavía"}</p>
                  {r.docs.length > 0 && <p style={{ color: "#8A8A8A", fontSize: 10.5, margin: "3px 0 0" }}>📎 {r.docs.length} documento{r.docs.length > 1 ? "s" : ""}</p>}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {editable && (
                  <button className="vir-btn" onClick={(e) => { e.stopPropagation(); onRemoveRace(activeCat.id, r.id); }} style={{ background: "transparent", color: "#8A8A8A", padding: 4 }}>
                    <X size={15} />
                  </button>
                )}
                <ChevronRight size={16} color="#8A8A8A" />
              </div>
            </div>
          ))}

          {editable && (
            <div style={{ background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 12, padding: 14, marginTop: 6 }}>
              <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Nuevo día de regata</p>
              <input value={newDate} onChange={e => setNewDate(e.target.value)} placeholder="Fecha (ej. 6 Març)" style={{ ...inputStyle, padding: "9px 11px", fontSize: 12.5, marginBottom: 8 }} />
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Título / lugar (opcional, ej. Roses)" style={{ ...inputStyle, padding: "9px 11px", fontSize: 12.5, marginBottom: 10 }} />
              <button className="vir-btn" onClick={() => { onAddRace(activeCat.id, newDate, newTitle); setNewDate(""); setNewTitle(""); }} style={{ ...primaryBtn, padding: "9px 0", fontSize: 12.5 }}>Añadir día</button>
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
            <button className="vir-btn" onClick={(e) => { e.stopPropagation(); onRemoveDoc(d.id); }} style={{ background: "transparent", color: "#8A8A8A", padding: 4 }}>
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

function ClubUsersScreen({ teams, teamName, teamOf, roleOf, onAssignTeam, onSetRole, pendingUsers, assignedUsers, onAssignPending, onRejectPending, managedTeamsOf, onToggleCoachTeam }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

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

  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionTitle sub="Filtra por categoría, reasigna tripulaciones y cambia roles">Usuarios del club</SectionTitle>

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
        {visible.map(p => {
          const role = roleOf(p.id);
          return (
            <div key={p.id} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{p.name}</p>
                  {p.nickname && <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "2px 0 0" }}>"{p.nickname}"</p>}
                </div>
                <div style={{ display: "flex", borderRadius: 20, overflow: "hidden", border: "1px solid #565656" }}>
                  {[{ id: "coach", label: "Entrenador" }, { id: "rower", label: "Remero" }].map(r => (
                    <button key={r.id} className="vir-btn" onClick={() => onSetRole(p.id, r.id)} style={{
                      padding: "5px 10px", fontSize: 10.5, fontWeight: 600,
                      background: role === r.id ? "#E61E29" : "transparent",
                      color: role === r.id ? "#F5F5F5" : "#8A8A8A", border: "none",
                    }}>{r.label}</button>
                  ))}
                </div>
              </div>
              {role === "rower" ? (
                <div>
                  <p style={{ color: "#8A8A8A", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 6px" }}>Categoría</p>
                  <select
                    value={teamOf(p.id) || ""}
                    onChange={e => onAssignTeam(p.id, e.target.value)}
                    style={{ ...inputStyle, padding: "8px 10px", fontSize: 12.5 }}
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
                      const managed = managedTeamsOf(p.id).includes(t.id);
                      return (
                        <button key={t.id} className="vir-btn" onClick={() => onToggleCoachTeam(p.id, t.id)} style={{
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
        <button className="vir-btn" onClick={() => onReject(user.id)} style={{ background: "transparent", border: "1px solid #565656", borderRadius: 10, color: "#FF8890", padding: "9px 14px", fontSize: 12.5 }}>
          Eliminar
        </button>
      </div>
    </div>
  );
}

function ClubTeamsScreen({ teams, onAddTeam, onRemoveTeam, onOpenTeam, teamOf }) {
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
          const count = ROWERS.filter(r => teamOf(r.id) === t.id).length;
          return (
            <div key={t.id} className="vir-btn" onClick={() => onOpenTeam(t)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#404040", border: "1px solid #565656", borderRadius: 12, marginBottom: 10 }}>
              <div>
                <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{t.name}</p>
                <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "3px 0 0" }}>{count} remeros</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="vir-mono" style={{ color: "#ADADAD", fontSize: 12 }}>{t.code}</span>
                <button className="vir-btn" onClick={(e) => { e.stopPropagation(); onRemoveTeam(t.id); }} style={{ background: "transparent", color: "#8A8A8A", padding: 4, borderRadius: 8 }} title="Eliminar tripulación">
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
          const items = FISICO_SLOTS.filter(slot => plan[slot]);
          return (
            <div key={week} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 4px" }}>Semana {week}</p>
              {items.length === 0 && <p style={{ fontSize: 11, margin: "0 0 4px" }}>Sin plan subido.</p>}
              {items.map(slot => (
                <p key={slot} style={{ fontSize: 11, margin: "0 0 2px" }}>{FISICO_LABELS[slot]}: {plan[slot]}</p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoachGymPlanScreen({ teamId, teams, setScope, currentWeek, weekPlanFor, onSaveContent, onBack, editable }) {
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
  const plan = weekPlanFor(teamId, week);

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

      {FISICO_SLOTS.map(slot => (
        <GymSlotEditor key={`${week}-${slot}`} slot={slot} value={plan[slot] || ""} onSave={(content) => onSaveContent(teamId, week, slot, content)} editable={editable} onDirtyChange={(isDirty) => markDirty(slot, isDirty)} />
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
        style={{ ...inputStyle, fontSize: 12.5, padding: "9px 11px", resize: "vertical", width: "100%" }}
      />
      <button className="vir-btn" onClick={save} disabled={!dirty} style={{
        ...primaryBtn, marginTop: 8, padding: "9px 0", fontSize: 12.5,
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

function RowerGymPlanScreen({ teamId, teamName, currentWeek, weekPlanFor, recordFor, onMarkDone, onClearDone, onViewPhoto, onBack }) {
  const [week, setWeek] = useState(currentWeek);
  const plan = weekPlanFor(teamId, week);
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

      {FISICO_SLOTS.map(slot => plan[slot] ? (
        <FisicoRecordRow
          key={slot}
          slot={slot}
          content={plan[slot]}
          record={recordFor(teamId, week, slot)}
          overdue={overdue}
          onMarkDone={(photo, kind) => onMarkDone(teamId, week, slot, photo, kind)}
          onClearDone={() => onClearDone(teamId, week, slot)}
          onViewPhoto={(photo) => onViewPhoto(photo, `${FISICO_LABELS[slot]} · Semana ${week}`)}
        />
      ) : (
        <div key={slot} style={{ background: "#3A3A3A", border: "1px dashed #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <p style={{ color: "#8A8A8A", fontSize: 13, fontWeight: 700, margin: 0 }}>{FISICO_LABELS[slot]}</p>
          <p style={{ color: "#8A8A8A", fontSize: 11.5, margin: "4px 0 0" }}>El entrenador no ha asignado entreno esta sesión.</p>
        </div>
      ))}
    </div>
  );
}

function FisicoRecordRow({ slot, content, record, overdue, onMarkDone, onClearDone, onViewPhoto }) {
  const [uploading, setUploading] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [pendingKind, setPendingKind] = useState(null);
  const done = !!(record && record.done);
  const missed = !done && overdue; // ha pasado el día y no se subió justificante

  const confirm = () => {
    if (!pendingPhoto) return;
    onMarkDone(pendingPhoto);
    setUploading(false);
    setPendingPhoto(null);
  };

  const badgeStyle = {
    width: 56, height: 56, borderRadius: 12, flexShrink: 0, display: "flex",
    alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden",
    background: done ? "#3EA55A" : missed ? "#7A1F1F" : "#565656",
    border: `1px solid ${done ? "#3EA55A" : missed ? "#E24B4A" : "#565656"}`,
  };

  return (
    <div style={{ background: "#404040", border: `1px solid ${done ? "#3EA55A" : missed ? "#E24B4A" : "#565656"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: "#F5F5F5", fontSize: 13, fontWeight: 700, margin: 0 }}>{FISICO_LABELS[slot]}</p>
          <p style={{ color: "#ADADAD", fontSize: 12, margin: "4px 0 0", lineHeight: 1.4 }}>{content}</p>
          {missed && <p style={{ color: "#F09595", fontSize: 11, margin: "6px 0 0", fontWeight: 600 }}>✕ Entreno no realizado</p>}
          {done && <p style={{ color: "#9FE1CB", fontSize: 11, margin: "6px 0 0", fontWeight: 600 }}>✓ Entreno hecho</p>}
        </div>
        <div
          style={badgeStyle}
          onClick={() => {
            if (!done) { setUploading(u => !u); return; }
            if (!record.photo) return;
            if (record.photoKind === "pdf") window.open(record.photo, "_blank");
            else onViewPhoto(record.photo);
          }}
        >
          {done ? (
            record.photo && record.photoKind !== "pdf"
              ? <img src={record.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <Check size={22} color="#FFFFFF" />
          ) : missed ? (
            <X size={22} color="#FFFFFF" />
          ) : (
            <Camera size={18} color="#ADADAD" />
          )}
        </div>
      </div>

      {!done && uploading && (
        <div style={{ marginTop: 10 }}>
          <p style={{ color: "#8A8A8A", fontSize: 11, margin: "0 0 6px" }}>Foto del ergómetro/GPS, o PDF del entreno</p>
          <PhotoField
            photo={pendingPhoto}
            onChange={(dataUrl, kind) => { setPendingPhoto(dataUrl); setPendingKind(kind); }}
            jpgOnly
            allowPdf
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="vir-btn" disabled={!pendingPhoto} onClick={() => { onMarkDone(pendingPhoto, pendingKind); setUploading(false); setPendingPhoto(null); setPendingKind(null); }} style={{ ...primaryBtn, flex: 1, padding: "9px 0", fontSize: 12.5, opacity: pendingPhoto ? 1 : 0.4 }}>
              Marcar como hecho
            </button>
            <button className="vir-btn" onClick={() => { setUploading(false); setPendingPhoto(null); setPendingKind(null); }} style={{ ...ghostBtn, flex: 1, padding: "9px 0", fontSize: 12.5 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {done && (
        <button className="vir-btn" onClick={onClearDone} style={{ background: "transparent", color: "#8A8A8A", fontSize: 10.5, textDecoration: "underline", marginTop: 8 }}>
          Deshacer
        </button>
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
  sessions.forEach(s => {
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
  sessions.forEach(s => {
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
                const selected = [...s.seats, s.patron, ...s.reserves].includes(myId);
                right = <Badge text={selected ? "Seleccionado" : "Cerrado"} tone={selected ? "selected" : "closed"} />;
              } else {
                const signed = s.signups.has(myId);
                right = <Badge text={signed ? "Apuntado ✓" : "Apuntarse"} tone={signed ? "signed" : "action"} onClick={() => onToggle(s)} />;
              }
              return <SessionRow key={s.id} s={s} onOpen={onOpen} right={right} teamLabel={showTeamLabel && teamName ? teamName(s.teamId) : null} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionRowerScreen({ session, onBack, onToggle, myId, nameOf, nicknameOf }) {
  const iAmSelected = [...session.seats, session.patron, ...session.reserves].includes(myId);
  const mySeatLabel = () => {
    const idx = session.seats.indexOf(myId);
    if (idx > -1) return seatLabel(idx);
    if (session.patron === myId) return "0 · Patrón";
    const rIdx = session.reserves.indexOf(myId);
    if (rIdx > -1) return `Reserva R${rIdx + 1}`;
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
          {iAmSelected ? (
            <div style={{ background: "#F5F5F5", border: "1px solid #E61E29", borderRadius: 12, padding: 16, marginBottom: 18 }}>
              <p style={{ color: "#B5151E", fontWeight: 600, fontSize: 14, margin: 0 }}>Has sido seleccionado</p>
              <p className="vir-mono" style={{ color: "#7A1015", fontSize: 13, margin: "6px 0 0" }}>{mySeatLabel()}</p>
            </div>
          ) : (
            <div style={{ background: "#454545", border: "1px solid #565656", borderRadius: 12, padding: 16, marginBottom: 18 }}>
              <p style={{ color: "#ADADAD", fontSize: 13, margin: 0 }}>Tripulación cerrada. Esta vez no has sido seleccionado.</p>
            </div>
          )}
          <BoatDiagram session={session} readOnly nicknameOf={nicknameOf} nameOf={nameOf} />
        </div>
      )}
    </div>
  );
}

function SessionCoachScreen({ session, onBack, selected, setSelected, onAssign, onClear, onClose, teamName, teamOf, nameOf, nicknameOf, sideOf, waterStatsFor, gymStatsFor, onUpdateSession, editable }) {
  const inScope = (id) => teamOf(id) === session.teamId;
  const available = [...session.signups].filter(id => !session.seats.includes(id) && session.patron !== id && !session.reserves.includes(id) && inScope(id));
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

          <BoatDiagram session={session} selected={selected} onAssign={onAssign} onClear={onClear} readOnly={!editable} nicknameOf={nicknameOf} nameOf={nameOf} />

          {editable && (
            <button className="vir-btn" disabled={filled === 0} onClick={() => onClose(session)} style={{
              ...primaryBtn, marginTop: 20, opacity: filled === 0 ? 0.4 : 1,
            }}>
              Cerrar tripulación y notificar
            </button>
          )}
        </>
      ) : (
        <>
          <Badge text="Tripulación cerrada" tone="closed" />
          <div style={{ marginTop: 16 }}><BoatDiagram session={session} readOnly nicknameOf={nicknameOf} nameOf={nameOf} /></div>
        </>
      )}
    </div>
  );
}

function BoatDiagram({ session, selected, onAssign, onClear, readOnly, nicknameOf, nameOf }) {
  const handleSlot = (type, idx, occupied) => {
    if (readOnly) return;
    if (occupied) { onClear(session, type, idx); return; }
    if (selected) onAssign(session, type, idx);
  };
  const canClick = (occupied) => !readOnly && (occupied || !!selected);

  const centerX = 150;
  const cx = { babor: 92, estribor: 208 };
  const rowY = (row) => 130 + row * 64; // row 0 = fila 4 (arriba) ... row 3 = fila 1 (abajo, junto al patrón)
  const lineTop = 96;
  const lineBottom = 460;
  const reservePos = [{ x: 92, y: 44 }, { x: 208, y: 44 }];
  const patronPos = { x: centerX, y: 486 };

  const Seat = ({ x, y, filled, label, rowerId, onClick }) => (
    <g style={{ cursor: canClick(filled) ? "pointer" : "default" }} onClick={onClick}>
      <circle cx={x} cy={y} r="18" className="vir-seat"
        fill={filled ? "#E61E29" : "#404040"} stroke={filled ? "#E61E29" : "#6E6E6E"} strokeWidth="1.5" />
      <text x={x} y={y + 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={filled ? "#FFFFFF" : "#8A8A8A"}>{label}</text>
      {filled && (
        <text x={x} y={y + 34} textAnchor="middle" fontSize="11" fontWeight="600" fill="#F5F5F5">{crewLabel(rowerId, nicknameOf, nameOf)}</text>
      )}
    </g>
  );

  return (
    <div style={{ background: "#3A3A3A", border: "1px solid #565656", borderRadius: 14, padding: "16px 0 10px" }}>
      <svg viewBox="0 0 300 560" width="100%" height="480">
        <line x1={centerX} y1={lineTop} x2={centerX} y2={lineBottom} stroke="#767676" strokeWidth="2" />

        <text x={cx.babor} y={80} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#8A8A8A" letterSpacing="0.5">BABOR</text>
        <text x={cx.estribor} y={80} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#8A8A8A" letterSpacing="0.5">ESTRIBOR</text>

        {[0, 1].map(i => (
          <g key={i} style={{ cursor: canClick(!!session.reserves[i]) ? "pointer" : "default" }}
            onClick={() => handleSlot("reserve", i, !!session.reserves[i])}>
            <rect x={reservePos[i].x - 26} y={reservePos[i].y - 16} width="52" height="32" rx="9" className="vir-seat"
              fill={session.reserves[i] ? "#F0A8AC" : "#404040"} stroke={session.reserves[i] ? "#F0A8AC" : "#6E6E6E"} strokeWidth="1.5" />
            <text x={reservePos[i].x} y={reservePos[i].y + 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={session.reserves[i] ? "#7A1015" : "#8A8A8A"}>R{i + 1}</text>
            {session.reserves[i] && <text x={reservePos[i].x} y={reservePos[i].y - 24} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#F5F5F5">{crewLabel(session.reserves[i], nicknameOf, nameOf)}</text>}
          </g>
        ))}

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
            fill={session.patron ? "#F5F5F5" : "#404040"} stroke={session.patron ? "#F5F5F5" : "#6E6E6E"} strokeWidth="1.5" />
          <text x={patronPos.x} y={patronPos.y + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill={session.patron ? "#B5151E" : "#8A8A8A"}>P</text>
          {session.patron && <text x={patronPos.x} y={patronPos.y + 38} textAnchor="middle" fontSize="11" fontWeight="600" fill="#F5F5F5">{crewLabel(session.patron, nicknameOf, nameOf)}</text>}
        </g>
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

function ProfileScreen({ role, scope, attendance, crewStats, teams, teamName, teamCode, onOpenTraining, myId, myDisplayName, myNickname, mySide, myTeam, myEmail, myRowerCode, onUpdateMyProfile, clubDisplayName, clubCode, onUpdateClubName }) {
  const name = role === "coach" ? myDisplayName : role === "club" ? clubDisplayName : myDisplayName;
  const roleLabel = role === "coach" ? "Entrenador" : role === "club" ? "Club" : "Remero";
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
          <div style={{ width: 56, height: 56, borderRadius: 28, background: "#454545", display: "flex", alignItems: "center", justifyContent: "center", color: "#E61E29", fontWeight: 700, fontSize: 20, fontFamily: "'Big Shoulders Display', sans-serif" }}>
            {name.split(" ").map(n => n[0]).join("")}
          </div>
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

const PESOS_PCTS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30];
const ERGO_ZONES = ["Z0", "Z1", "Z2", "Z3", "Z4", "Z5", "Z6"];
const ERGO_PCTS = Array.from({ length: 25 }, (_, i) => 150 - i * 5); // 150 → 30, saltos de 5

function PesosScreen({ exercises, onAddExercise, onSetBase, onBack }) {
  const [search, setSearch] = useState("");
  const [newExercise, setNewExercise] = useState("");

  const visible = exercises.filter(ex => ex.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Test de pesos</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 16px", lineHeight: 1.4 }}>
        Cada ejercicio tiene su propia tabla de porcentajes de trabajo, calculada a partir del registro (100%).
      </p>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={15} color="#8A8A8A" style={{ position: "absolute", left: 12, top: 12 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar ejercicio" style={{ ...inputStyle, paddingLeft: 34 }} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input value={newExercise} onChange={e => setNewExercise(e.target.value)} placeholder="Nuevo ejercicio (ej. Sentadilla)" style={{ ...inputStyle, padding: "9px 11px", fontSize: 12.5, flex: 1 }} />
        <button className="vir-btn" onClick={() => { if (newExercise.trim()) { onAddExercise(newExercise.trim()); setNewExercise(""); } }} style={{ ...primaryBtn, padding: "9px 16px", fontSize: 12.5 }}>Crear</button>
      </div>

      {visible.length === 0 && <p style={{ color: "#8A8A8A", fontSize: 13 }}>Sin ejercicios que coincidan con la búsqueda.</p>}
      {visible.map(ex => (
        <PesosExerciseCard key={ex.id} exercise={ex} onSetBase={(kg) => onSetBase(ex.id, kg)} />
      ))}
    </div>
  );
}

function PesosExerciseCard({ exercise, onSetBase }) {
  const [editing, setEditing] = useState(false);
  const [baseInput, setBaseInput] = useState(exercise.baseKg || "");

  const save = () => {
    const v = parseFloat(baseInput);
    if (!isNaN(v) && v > 0) onSetBase(v);
    setEditing(false);
  };

  return (
    <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <p style={{ color: "#F5F5F5", fontSize: 13.5, fontWeight: 700, margin: 0 }}>{exercise.name}</p>
        <button className="vir-btn" onClick={() => { setBaseInput(exercise.baseKg || ""); setEditing(!editing); }} style={{ background: "transparent", color: "#ADADAD", padding: 4 }}>
          <Pencil size={14} />
        </button>
      </div>

      {editing ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <input
            type="number" value={baseInput} onChange={e => setBaseInput(e.target.value)}
            placeholder="Registro al 100% (kg)"
            style={{ ...inputStyle, padding: "8px 10px", fontSize: 12.5, flex: 1 }}
          />
          <button className="vir-btn" onClick={save} style={{ ...primaryBtn, padding: "0 16px", fontSize: 12 }}>Guardar</button>
        </div>
      ) : !exercise.baseKg ? (
        <p style={{ color: "#8A8A8A", fontSize: 12, margin: 0 }}>Toca el lápiz para registrar tu marca al 100%.</p>
      ) : (
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
      )}
    </div>
  );
}

function ErgoZonesScreen({ testWatts, onSetTest, zoneNotes, onSetZoneNote, onBack }) {
  const [editingTest, setEditingTest] = useState(false);
  const [testInput, setTestInput] = useState(testWatts || "");

  const saveTest = () => {
    const v = parseFloat(testInput);
    if (!isNaN(v) && v > 0) onSetTest(v);
    setEditingTest(false);
  };

  return (
    <div style={{ padding: "16px 20px 28px" }}>
      <BackRow onBack={onBack} />
      <h2 style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 22, color: "#F5F5F5", margin: "10px 0 2px" }}>Zonas de ergómetro</h2>
      <p style={{ color: "#8A8A8A", fontSize: 12, margin: "0 0 18px", lineHeight: 1.4 }}>
        Registra tu TEST 1600 en vatios; las zonas y los porcentajes de trabajo se calculan a partir de ese valor.
      </p>

      <div style={{ background: "#404040", border: "1px solid #565656", borderRadius: 12, padding: "14px 16px", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: editingTest ? 10 : 0 }}>
          <div>
            <p style={{ color: "#8A8A8A", fontSize: 10.5, textTransform: "uppercase", margin: "0 0 4px" }}>TEST 1600</p>
            <p className="vir-mono" style={{ color: "#F5F5F5", fontSize: 22, fontWeight: 700, margin: 0 }}>{testWatts ? `${testWatts} W` : "—"}</p>
          </div>
          <button className="vir-btn" onClick={() => { setTestInput(testWatts || ""); setEditingTest(!editingTest); }} style={{ background: "#333333", border: "1px solid #565656", borderRadius: 10, padding: "8px 10px", color: "#ADADAD" }}>
            <Pencil size={15} />
          </button>
        </div>
        {editingTest && (
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" value={testInput} onChange={e => setTestInput(e.target.value)} placeholder="Vatios" style={{ ...inputStyle, padding: "9px 11px", fontSize: 12.5, flex: 1 }} />
            <button className="vir-btn" onClick={saveTest} style={{ ...primaryBtn, padding: "0 18px", fontSize: 12.5 }}>Guardar</button>
          </div>
        )}
      </div>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Trabajo de zonas</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 22 }}>
        {ERGO_ZONES.map(z => (
          <div key={z} style={{ background: "#404040", border: "1px solid #565656", borderRadius: 10, padding: "10px 12px" }}>
            <p style={{ color: "#E61E29", fontSize: 12.5, fontWeight: 800, margin: "0 0 4px" }}>{z}</p>
            <input
              value={zoneNotes[z] || ""}
              onChange={e => onSetZoneNote(z, e.target.value)}
              placeholder="Ritmo / vatios objetivo"
              style={{ ...inputStyle, padding: "7px 9px", fontSize: 11.5 }}
            />
          </div>
        ))}
      </div>

      <p style={{ color: "#8A8A8A", fontSize: 11, textTransform: "uppercase", margin: "0 0 10px" }}>Valores de trabajo por porcentaje</p>
      {!testWatts ? (
        <p style={{ color: "#8A8A8A", fontSize: 12.5 }}>Registra tu TEST 1600 para calcular esta tabla.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {ERGO_PCTS.map(pct => (
            <div key={pct} style={{ background: "#404040", border: `1px solid ${pct === 100 ? "#E61E29" : "#565656"}`, borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
              <p style={{ color: "#8A8A8A", fontSize: 10, margin: 0 }}>{pct}%</p>
              <p className="vir-mono" style={{ color: pct === 100 ? "#E61E29" : "#F5F5F5", fontSize: 12.5, fontWeight: 700, margin: "2px 0 0" }}>
                {Math.round(testWatts * pct / 100)} W
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
  const homeGroup = ["sessionRower", "sessionCoach", "coachPlan", "coachGymPlan"];
  const profileGroup = ["testPesos", "zonasErgo", "estadisticas", "rowerGymPlan"];
  const active = homeGroup.includes(screen) ? "home"
    : screen === "coachRowerDetail" ? "coachTeamStats"
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
