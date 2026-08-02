from __future__ import annotations

import csv
import os
import io
import json
import secrets
import sqlite3
import unicodedata
import zipfile
from datetime import date, datetime
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = Path(os.environ.get("APP_DATA_DIR", str(BASE_DIR / "data"))).resolve()
DB_PATH = Path(os.environ.get("DATABASE_PATH", str(DATA_DIR / "participants.sqlite3"))).resolve()
SCHOOL_ACCESS_CODE = os.environ.get("SCHOOL_ACCESS_CODE", "escuela123")
SESSION_COOKIE_NAME = "school_session"
SESSION_TOKEN = secrets.token_urlsafe(32)
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "").lower() in {"1", "true", "yes"}


def normalize_name(value: str) -> str:
    text = " ".join((value or "").strip().split()).lower()
    text = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def now_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat()


def today_iso() -> str:
    return date.today().isoformat()


def parse_date(value: str, field: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        raise ValueError(f"{field} debe tener formato AAAA-MM-DD")


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init_db() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS instruments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                normalized_name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS teachers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                normalized_name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS participants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                normalized_name TEXT NOT NULL,
                birth_date TEXT NOT NULL,
                phone TEXT DEFAULT '',
                email TEXT DEFAULT '',
                neighborhood TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                registered_at TEXT NOT NULL,
                UNIQUE(normalized_name, birth_date)
            );

            CREATE TABLE IF NOT EXISTS activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                activity_date TEXT NOT NULL,
                instrument_id INTEGER,
                teacher_id INTEGER,
                category TEXT DEFAULT '',
                location TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(instrument_id) REFERENCES instruments(id) ON DELETE SET NULL,
                FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                participant_id INTEGER NOT NULL,
                activity_id INTEGER NOT NULL,
                teacher_id INTEGER,
                attended_on TEXT NOT NULL,
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(participant_id) REFERENCES participants(id) ON DELETE CASCADE,
                FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE,
                FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
                UNIQUE(participant_id, activity_id)
            );

            CREATE INDEX IF NOT EXISTS idx_participants_registered_at
                ON participants(registered_at);
            CREATE INDEX IF NOT EXISTS idx_activities_date
                ON activities(activity_date);
            CREATE INDEX IF NOT EXISTS idx_attendance_attended_on
                ON attendance(attended_on);
            """
        )
        ensure_column(db, "activities", "instrument_id", "INTEGER")
        ensure_column(db, "activities", "teacher_id", "INTEGER")
        ensure_column(db, "attendance", "teacher_id", "INTEGER")


def ensure_column(db: sqlite3.Connection, table_name: str, column_name: str, definition: str) -> None:
    columns = {row["name"] for row in db.execute(f"PRAGMA table_info({table_name})")}
    if column_name not in columns:
        db.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(row) for row in rows]


def get_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        raise ValueError("El cuerpo de la solicitud debe ser JSON valido")


def validate_required(data: dict, fields: list[str]) -> None:
    missing = [field for field in fields if not str(data.get(field, "")).strip()]
    if missing:
        raise ValueError(f"Faltan campos requeridos: {', '.join(missing)}")


def query_params(path: str) -> dict[str, str]:
    parsed = urlparse(path)
    params = parse_qs(parsed.query)
    return {key: values[-1] for key, values in params.items() if values}


def parse_cookies(header: str) -> dict[str, str]:
    cookies: dict[str, str] = {}
    for part in (header or "").split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        cookies[key.strip()] = value.strip()
    return cookies


class AppHandler(BaseHTTPRequestHandler):
    server_version = "ParticipantProjectApp/1.0"

    def do_GET(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path.startswith("/api/"):
                self.route_get(parsed.path, query_params(self.path))
            else:
                self.serve_static(parsed.path)
        except Exception as exc:
            self.send_error_json(exc)

    def do_POST(self) -> None:
        try:
            self.route_post(urlparse(self.path).path, get_body(self))
        except Exception as exc:
            self.send_error_json(exc)

    def do_DELETE(self) -> None:
        try:
            self.route_delete(urlparse(self.path).path)
        except Exception as exc:
            self.send_error_json(exc)

    def log_message(self, format: str, *args) -> None:
        print(f"{self.address_string()} - {format % args}")

    def send_json(self, payload: dict | list, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, exc: Exception) -> None:
        if isinstance(exc, PermissionError):
            status = 403
        elif isinstance(exc, ValueError):
            status = 400
        else:
            status = 500
        self.send_json({"error": str(exc)}, status)

    def is_school_user(self) -> bool:
        cookies = parse_cookies(self.headers.get("Cookie", ""))
        return cookies.get(SESSION_COOKIE_NAME) == SESSION_TOKEN

    def require_school_user(self) -> None:
        if not self.is_school_user():
            raise PermissionError("Esta seccion requiere acceso de escuela")

    def send_auth_cookie(self) -> None:
        body = json.dumps({"authenticated": True}, ensure_ascii=False).encode("utf-8")
        secure_flag = "; Secure" if COOKIE_SECURE else ""
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header(
            "Set-Cookie",
            f"{SESSION_COOKIE_NAME}={SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Lax{secure_flag}",
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def clear_auth_cookie(self) -> None:
        body = json.dumps({"authenticated": False}, ensure_ascii=False).encode("utf-8")
        secure_flag = "; Secure" if COOKIE_SECURE else ""
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header(
            "Set-Cookie",
            f"{SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax{secure_flag}",
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, path: str) -> None:
        if path in ("", "/"):
            target = STATIC_DIR / "index.html"
        else:
            target = (STATIC_DIR / path.lstrip("/")).resolve()
            if not str(target).startswith(str(STATIC_DIR.resolve())):
                raise ValueError("Ruta no permitida")

        if not target.exists() or not target.is_file():
            self.send_response(404)
            self.end_headers()
            return

        content_types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
        }
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_types.get(target.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def route_get(self, path: str, params: dict[str, str]) -> None:
        routes = {
            "/api/auth": self.get_auth,
            "/api/participants": self.get_participants,
            "/api/instruments": self.get_instruments,
            "/api/teachers": self.get_teachers,
            "/api/activities": self.get_activities,
            "/api/attendance": self.get_attendance,
            "/api/reports": self.get_reports,
            "/api/export": self.export_zip,
        }
        if path not in routes:
            raise ValueError("Endpoint no encontrado")
        routes[path](params)

    def route_post(self, path: str, data: dict) -> None:
        routes = {
            "/api/login": self.login,
            "/api/logout": self.logout,
            "/api/participants": self.create_participant,
            "/api/instruments": self.create_instrument,
            "/api/teachers": self.create_teacher,
            "/api/activities": self.create_activity,
            "/api/attendance": self.create_attendance,
        }
        if path not in routes:
            raise ValueError("Endpoint no encontrado")
        routes[path](data)

    def route_delete(self, path: str) -> None:
        if path.startswith("/api/participants/"):
            self.delete_participant(path.rsplit("/", 1)[-1])
            return
        if path.startswith("/api/activities/"):
            self.delete_activity(path.rsplit("/", 1)[-1])
            return
        raise ValueError("Endpoint no encontrado")

    def get_auth(self, params: dict[str, str]) -> None:
        self.send_json({"authenticated": self.is_school_user()})

    def login(self, data: dict) -> None:
        if data.get("access_code") != SCHOOL_ACCESS_CODE:
            raise PermissionError("Clave de escuela incorrecta")
        self.send_auth_cookie()

    def logout(self, data: dict) -> None:
        self.clear_auth_cookie()

    def get_participants(self, params: dict[str, str]) -> None:
        search = normalize_name(params.get("search", ""))
        birth_date = params.get("birth_date", "").strip()
        public_exact_lookup = bool(search and birth_date)
        if not self.is_school_user() and not public_exact_lookup:
            self.send_json([])
            return
        sql = """
            SELECT p.*,
                   (SELECT MIN(attended_on)
                    FROM attendance
                    WHERE participant_id = p.id) AS first_attendance_on,
                   (SELECT COUNT(*)
                    FROM attendance
                    WHERE participant_id = p.id) AS attendance_count
            FROM participants p
            WHERE 1 = 1
        """
        values: list[str] = []
        if search:
            sql += " AND p.normalized_name LIKE ?"
            values.append(f"%{search}%")
        if birth_date:
            sql += " AND p.birth_date = ?"
            values.append(parse_date(birth_date, "birth_date"))
        sql += " ORDER BY p.full_name COLLATE NOCASE"
        with connect() as db:
            rows = rows_to_dicts(db.execute(sql, values).fetchall())
        if not self.is_school_user():
            rows = [
                {
                    "id": row["id"],
                    "full_name": row["full_name"],
                    "birth_date": row["birth_date"],
                }
                for row in rows
            ]
        self.send_json(rows)

    def create_participant(self, data: dict) -> None:
        self.require_school_user()
        validate_required(data, ["full_name", "birth_date"])
        full_name = " ".join(data["full_name"].strip().split())
        birth_date = parse_date(data["birth_date"], "birth_date")
        normalized = normalize_name(full_name)
        registered_at = data.get("registered_at") or today_iso()
        parse_date(registered_at, "registered_at")

        with connect() as db:
            existing = db.execute(
                "SELECT * FROM participants WHERE normalized_name = ? AND birth_date = ?",
                (normalized, birth_date),
            ).fetchone()
            if existing:
                self.send_json({"participant": dict(existing), "existing": True}, 200)
                return
            cursor = db.execute(
                """
                INSERT INTO participants
                    (full_name, normalized_name, birth_date, phone, email, neighborhood, notes, registered_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    full_name,
                    normalized,
                    birth_date,
                    data.get("phone", "").strip(),
                    data.get("email", "").strip(),
                    data.get("neighborhood", "").strip(),
                    data.get("notes", "").strip(),
                    registered_at,
                ),
            )
            participant = db.execute("SELECT * FROM participants WHERE id = ?", (cursor.lastrowid,)).fetchone()
        self.send_json({"participant": dict(participant), "existing": False}, 201)

    def get_instruments(self, params: dict[str, str]) -> None:
        with connect() as db:
            rows = rows_to_dicts(
                db.execute(
                    "SELECT * FROM instruments ORDER BY name COLLATE NOCASE"
                ).fetchall()
            )
        self.send_json(rows)

    def create_instrument(self, data: dict) -> None:
        self.require_school_user()
        validate_required(data, ["name"])
        name = " ".join(data["name"].strip().split())
        normalized = normalize_name(name)
        with connect() as db:
            existing = db.execute(
                "SELECT * FROM instruments WHERE normalized_name = ?",
                (normalized,),
            ).fetchone()
            if existing:
                self.send_json({"instrument": dict(existing), "existing": True}, 200)
                return
            cursor = db.execute(
                "INSERT INTO instruments (name, normalized_name, created_at) VALUES (?, ?, ?)",
                (name, normalized, now_iso()),
            )
            instrument = db.execute("SELECT * FROM instruments WHERE id = ?", (cursor.lastrowid,)).fetchone()
        self.send_json({"instrument": dict(instrument), "existing": False}, 201)

    def get_teachers(self, params: dict[str, str]) -> None:
        with connect() as db:
            rows = rows_to_dicts(
                db.execute(
                    "SELECT * FROM teachers ORDER BY name COLLATE NOCASE"
                ).fetchall()
            )
        self.send_json(rows)

    def create_teacher(self, data: dict) -> None:
        self.require_school_user()
        validate_required(data, ["name"])
        name = " ".join(data["name"].strip().split())
        normalized = normalize_name(name)
        with connect() as db:
            existing = db.execute(
                "SELECT * FROM teachers WHERE normalized_name = ?",
                (normalized,),
            ).fetchone()
            if existing:
                self.send_json({"teacher": dict(existing), "existing": True}, 200)
                return
            cursor = db.execute(
                "INSERT INTO teachers (name, normalized_name, created_at) VALUES (?, ?, ?)",
                (name, normalized, now_iso()),
            )
            teacher = db.execute("SELECT * FROM teachers WHERE id = ?", (cursor.lastrowid,)).fetchone()
        self.send_json({"teacher": dict(teacher), "existing": False}, 201)

    def get_activities(self, params: dict[str, str]) -> None:
        sql = """
            SELECT a.*,
                   i.name AS instrument_name,
                   t.name AS teacher_name,
                   COUNT(att.id) AS attendance_count,
                   COUNT(DISTINCT att.participant_id) AS participant_count
            FROM activities a
            LEFT JOIN instruments i ON i.id = a.instrument_id
            LEFT JOIN teachers t ON t.id = a.teacher_id
            LEFT JOIN attendance att ON att.activity_id = a.id
            WHERE 1 = 1
        """
        values: list[str] = []
        if params.get("search"):
            sql += " AND lower(a.name) LIKE lower(?)"
            values.append(f"%{params['search'].strip()}%")
        sql += " GROUP BY a.id ORDER BY a.created_at DESC, a.name COLLATE NOCASE"
        with connect() as db:
            rows = rows_to_dicts(db.execute(sql, values).fetchall())
        self.send_json(rows)

    def create_activity(self, data: dict) -> None:
        self.require_school_user()
        validate_required(data, ["name"])
        activity_date = parse_date(data.get("activity_date") or today_iso(), "activity_date")
        instrument_id = data.get("instrument_id") or None
        teacher_id = data.get("teacher_id") or None
        with connect() as db:
            if instrument_id:
                instrument = db.execute(
                    "SELECT * FROM instruments WHERE id = ?",
                    (instrument_id,),
                ).fetchone()
                if not instrument:
                    raise ValueError("Instrumento no encontrado")
            if teacher_id:
                teacher = db.execute(
                    "SELECT * FROM teachers WHERE id = ?",
                    (teacher_id,),
                ).fetchone()
                if not teacher:
                    raise ValueError("Profesor no encontrado")
            cursor = db.execute(
                """
                INSERT INTO activities (name, activity_date, instrument_id, teacher_id, category, location, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    data["name"].strip(),
                    activity_date,
                    instrument_id,
                    teacher_id,
                    data.get("category", "").strip(),
                    data.get("location", "").strip(),
                    data.get("notes", "").strip(),
                    now_iso(),
                ),
            )
            activity = db.execute("SELECT * FROM activities WHERE id = ?", (cursor.lastrowid,)).fetchone()
        self.send_json({"activity": dict(activity)}, 201)

    def delete_participant(self, participant_id: str) -> None:
        self.require_school_user()
        with connect() as db:
            cursor = db.execute("DELETE FROM participants WHERE id = ?", (participant_id,))
            if cursor.rowcount == 0:
                raise ValueError("Participante no encontrado")
        self.send_json({"deleted": True})

    def delete_activity(self, activity_id: str) -> None:
        self.require_school_user()
        with connect() as db:
            cursor = db.execute("DELETE FROM activities WHERE id = ?", (activity_id,))
            if cursor.rowcount == 0:
                raise ValueError("Actividad no encontrada")
        self.send_json({"deleted": True})

    def get_attendance(self, params: dict[str, str]) -> None:
        if not self.is_school_user():
            self.send_json([])
            return
        sql = """
            SELECT att.id,
                   att.attended_on,
                   att.notes,
                   p.id AS participant_id,
                   p.full_name,
                   p.birth_date,
                   a.id AS activity_id,
                   a.name AS activity_name,
                   a.activity_date,
                   i.name AS instrument_name,
                   COALESCE(t.id, at.id) AS teacher_id,
                   COALESCE(t.name, at.name) AS teacher_name
            FROM attendance att
            JOIN participants p ON p.id = att.participant_id
            JOIN activities a ON a.id = att.activity_id
            LEFT JOIN instruments i ON i.id = a.instrument_id
            LEFT JOIN teachers t ON t.id = att.teacher_id
            LEFT JOIN teachers at ON at.id = a.teacher_id
            WHERE 1 = 1
        """
        values: list[str] = []
        if params.get("activity_id"):
            sql += " AND a.id = ?"
            values.append(params["activity_id"])
        if params.get("participant_id"):
            sql += " AND p.id = ?"
            values.append(params["participant_id"])
        if params.get("from"):
            sql += " AND att.attended_on >= ?"
            values.append(parse_date(params["from"], "from"))
        if params.get("to"):
            sql += " AND att.attended_on <= ?"
            values.append(parse_date(params["to"], "to"))
        sql += " ORDER BY att.attended_on DESC, p.full_name COLLATE NOCASE"
        with connect() as db:
            rows = rows_to_dicts(db.execute(sql, values).fetchall())
        self.send_json(rows)

    def create_attendance(self, data: dict) -> None:
        validate_required(data, ["participant_id", "activity_id"])
        teacher_id = data.get("teacher_id") or None
        with connect() as db:
            activity = db.execute(
                "SELECT * FROM activities WHERE id = ?",
                (data["activity_id"],),
            ).fetchone()
            participant = db.execute(
                "SELECT * FROM participants WHERE id = ?",
                (data["participant_id"],),
            ).fetchone()
            if not activity or not participant:
                raise ValueError("Participante o actividad no encontrado")
            teacher_id = teacher_id or activity["teacher_id"]
            if teacher_id:
                teacher = db.execute(
                    "SELECT * FROM teachers WHERE id = ?",
                    (teacher_id,),
                ).fetchone()
                if not teacher:
                    raise ValueError("Profesor no encontrado")

            attended_on = data.get("attended_on") or activity["activity_date"]
            attended_on = parse_date(attended_on, "attended_on")
            try:
                cursor = db.execute(
                    """
                    INSERT INTO attendance (participant_id, activity_id, teacher_id, attended_on, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        data["participant_id"],
                        data["activity_id"],
                        teacher_id,
                        attended_on,
                        data.get("notes", "").strip(),
                        now_iso(),
                    ),
                )
            except sqlite3.IntegrityError:
                existing = db.execute(
                    """
                    SELECT att.*, p.full_name, a.name AS activity_name
                    FROM attendance att
                    JOIN participants p ON p.id = att.participant_id
                    JOIN activities a ON a.id = att.activity_id
                    WHERE participant_id = ? AND activity_id = ?
                    """,
                    (data["participant_id"], data["activity_id"]),
                ).fetchone()
                self.send_json({"attendance": dict(existing), "existing": True}, 200)
                return

            attendance = db.execute(
                """
                SELECT att.*, p.full_name, a.name AS activity_name
                FROM attendance att
                JOIN participants p ON p.id = att.participant_id
                JOIN activities a ON a.id = att.activity_id
                WHERE att.id = ?
                """,
                (cursor.lastrowid,),
            ).fetchone()
        self.send_json({"attendance": dict(attendance), "existing": False}, 201)

    def get_reports(self, params: dict[str, str]) -> None:
        self.require_school_user()
        start = parse_date(params.get("from") or "1900-01-01", "from")
        end = parse_date(params.get("to") or "2999-12-31", "to")
        activity_id = params.get("activity_id", "").strip()

        activity_filter = ""
        values: list[str] = [start, end]
        if activity_id:
            activity_filter = " AND a.id = ?"
            values.append(activity_id)

        with connect() as db:
            totals = {
                "registered_total": db.execute("SELECT COUNT(*) FROM participants").fetchone()[0],
                "activities_total": db.execute("SELECT COUNT(*) FROM activities").fetchone()[0],
                "attendance_total": db.execute("SELECT COUNT(*) FROM attendance").fetchone()[0],
                "activities_in_period": db.execute(
                    "SELECT COUNT(DISTINCT activity_id) FROM attendance WHERE attended_on BETWEEN ? AND ?",
                    (start, end),
                ).fetchone()[0],
                "attendance_in_period": db.execute(
                    "SELECT COUNT(*) FROM attendance WHERE attended_on BETWEEN ? AND ?",
                    (start, end),
                ).fetchone()[0],
                "unique_participants_in_period": db.execute(
                    "SELECT COUNT(DISTINCT participant_id) FROM attendance WHERE attended_on BETWEEN ? AND ?",
                    (start, end),
                ).fetchone()[0],
                "new_registrations": db.execute(
                    "SELECT COUNT(*) FROM participants WHERE registered_at BETWEEN ? AND ?",
                    (start, end),
                ).fetchone()[0],
                "first_time_attendees": db.execute(
                    """
                    SELECT COUNT(*)
                    FROM (
                        SELECT participant_id, MIN(attended_on) AS first_attendance
                        FROM attendance
                        GROUP BY participant_id
                    )
                    WHERE first_attendance BETWEEN ? AND ?
                    """,
                    (start, end),
                ).fetchone()[0],
            }

            attendance_rows = rows_to_dicts(
                db.execute(
                    f"""
                    SELECT a.id AS activity_id,
                           a.name,
                           a.activity_date,
                           MAX(att.attended_on) AS last_attendance_on,
                           i.name AS instrument_name,
                           t.name AS teacher_name,
                           a.category,
                           COUNT(att.id) AS attendance_count,
                           COUNT(DISTINCT att.participant_id) AS unique_participants
                    FROM activities a
                    LEFT JOIN instruments i ON i.id = a.instrument_id
                    LEFT JOIN teachers t ON t.id = a.teacher_id
                    LEFT JOIN attendance att
                        ON att.activity_id = a.id
                       AND att.attended_on BETWEEN ? AND ?
                    WHERE att.id IS NOT NULL {activity_filter}
                    GROUP BY a.id
                    ORDER BY MAX(att.attended_on) DESC, a.name COLLATE NOCASE
                    """,
                    values,
                ).fetchall()
            )

            first_rows = rows_to_dicts(
                db.execute(
                    """
                    SELECT substr(first_attendance, 1, 7) AS period,
                           COUNT(*) AS first_time_attendees
                    FROM (
                        SELECT participant_id, MIN(attended_on) AS first_attendance
                        FROM attendance
                        GROUP BY participant_id
                    )
                    WHERE first_attendance BETWEEN ? AND ?
                    GROUP BY substr(first_attendance, 1, 7)
                    ORDER BY period
                    """,
                    (start, end),
                ).fetchall()
            )

            registration_rows = rows_to_dicts(
                db.execute(
                    """
                    SELECT substr(registered_at, 1, 7) AS period,
                           COUNT(*) AS new_registrations
                    FROM participants
                    WHERE registered_at BETWEEN ? AND ?
                    GROUP BY substr(registered_at, 1, 7)
                    ORDER BY period
                    """,
                    (start, end),
                ).fetchall()
            )

            detail_rows = rows_to_dicts(
                db.execute(
                    """
                    SELECT p.full_name,
                           p.birth_date,
                           p.registered_at,
                           MIN(att.attended_on) AS first_attendance_on,
                           COUNT(att.id) AS attendance_count
                    FROM participants p
                    LEFT JOIN attendance att ON att.participant_id = p.id
                    GROUP BY p.id
                    ORDER BY p.full_name COLLATE NOCASE
                    """
                ).fetchall()
            )

        self.send_json(
            {
                "totals": totals,
                "attendance_by_activity": attendance_rows,
                "new_registrations_by_month": registration_rows,
                "first_time_attendees_by_month": first_rows,
                "participant_detail": detail_rows,
            }
        )

    def export_zip(self, params: dict[str, str]) -> None:
        self.require_school_user()
        with connect() as db:
            datasets = {
                "participantes.csv": rows_to_dicts(db.execute("SELECT * FROM participants ORDER BY full_name").fetchall()),
                "instrumentos.csv": rows_to_dicts(db.execute("SELECT * FROM instruments ORDER BY name").fetchall()),
                "profesores.csv": rows_to_dicts(db.execute("SELECT * FROM teachers ORDER BY name").fetchall()),
                "actividades.csv": rows_to_dicts(
                    db.execute(
                        """
                        SELECT a.id,
                               a.name,
                               i.name AS instrument_name,
                               t.name AS teacher_name,
                               a.category,
                               a.location,
                               a.notes,
                               a.created_at
                        FROM activities a
                        LEFT JOIN instruments i ON i.id = a.instrument_id
                        LEFT JOIN teachers t ON t.id = a.teacher_id
                        ORDER BY a.created_at DESC
                        """
                    ).fetchall()
                ),
                "asistencias.csv": rows_to_dicts(
                    db.execute(
                        """
                        SELECT att.id,
                               att.attended_on,
                               p.full_name,
                               p.birth_date,
                               a.name AS activity_name,
                               i.name AS instrument_name,
                               COALESCE(t.name, at.name) AS teacher_name,
                               att.notes
                        FROM attendance att
                        JOIN participants p ON p.id = att.participant_id
                        JOIN activities a ON a.id = att.activity_id
                        LEFT JOIN instruments i ON i.id = a.instrument_id
                        LEFT JOIN teachers t ON t.id = att.teacher_id
                        LEFT JOIN teachers at ON at.id = a.teacher_id
                        ORDER BY att.attended_on DESC
                        """
                    ).fetchall()
                ),
            }

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for filename, rows in datasets.items():
                text = io.StringIO()
                if rows:
                    writer = csv.DictWriter(text, fieldnames=list(rows[0].keys()))
                    writer.writeheader()
                    writer.writerows(rows)
                archive.writestr(filename, text.getvalue())
            archive.writestr("respaldo.json", json.dumps(datasets, ensure_ascii=False, indent=2))

        body = buffer.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", 'attachment; filename="reporte-participantes.zip"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    init_db()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    display_host = "127.0.0.1" if host == "0.0.0.0" else host
    print(f"Aplicacion lista en http://{display_host}:{port}")
    print(f"Base de datos: {DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido")


if __name__ == "__main__":
    main()
