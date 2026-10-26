import json
import os
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

HOST = os.environ.get('HOST', '0.0.0.0')
PORT = int(os.environ.get('PORT', 5555))
ROOT_DIR = Path(__file__).resolve().parent
SRC_DIR = ROOT_DIR / 'src'
LOGINS_DIR = ROOT_DIR / 'logins'
PICTURES_DIR = ROOT_DIR / 'pictures'
EVENTS_FILE = SRC_DIR / 'events.json'
USERS_FILE = LOGINS_DIR / 'users.json'

LOGINS_DIR.mkdir(exist_ok=True)
PICTURES_DIR.mkdir(exist_ok=True)


def is_past_event_date(date_string):
    if not date_string or not isinstance(date_string, str):
        return False
    try:
        event_date = datetime.strptime(date_string, '%Y-%m-%d')
    except ValueError:
        return False
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return event_date < today


def prune_past_events(events):
    if not isinstance(events, list):
        return []
    return [
        event for event in events
        if isinstance(event, dict) and not (event.get('date') and is_past_event_date(event.get('date')))
    ]


def read_events():
    try:
        with EVENTS_FILE.open('r', encoding='utf-8') as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

    if not isinstance(data, list):
        return []

    events = prune_past_events(data)
    if len(events) != len(data):
        write_events(events)
    return events


def cleanup_expired_events():
    try:
        with EVENTS_FILE.open('r', encoding='utf-8') as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

    if not isinstance(data, list):
        return []

    cleaned = prune_past_events(data)
    if len(cleaned) != len(data):
        write_events(cleaned)
    return cleaned


def write_events(events):
    EVENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    cleaned = prune_past_events(events)
    with EVENTS_FILE.open('w', encoding='utf-8') as handle:
        json.dump(cleaned, handle, ensure_ascii=False, indent=2)


def sanitize_file_name(value):
    text = str(value or '').lower()
    cleaned = ''.join(ch for ch in text if ch.isalnum() or ch in ('-', '_'))
    cleaned = cleaned.replace(' ', '-')
    cleaned = cleaned.strip('-_')
    return cleaned or 'leader'


def read_users():
    try:
        with USERS_FILE.open('r', encoding='utf-8') as handle:
            data = json.load(handle)
            if isinstance(data, list):
                return data
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return []


def write_users(users):
    LOGINS_DIR.mkdir(parents=True, exist_ok=True)
    with USERS_FILE.open('w', encoding='utf-8') as handle:
        json.dump(users, handle, ensure_ascii=False, indent=2)


def get_leader_picture_path(username, picture_data):
    if not picture_data or not isinstance(picture_data, str):
        return ''

    marker = 'data:image/'
    if not picture_data.startswith(marker):
        return ''

    try:
        header, encoded = picture_data.split(',', 1)
        mime = header.split(';', 1)[0].replace('data:', '')
        if '/' not in mime:
            return ''
        extension = mime.split('/')[-1]
        if extension == 'jpeg':
            extension = 'jpg'
        if extension not in {'png', 'jpg', 'gif'}:
            extension = 'png'
        safe_name = sanitize_file_name(username)
        file_name = f'{safe_name}.{extension}'
        target = PICTURES_DIR / file_name
        raw = encoded.encode('utf-8')
        try:
            import base64
            raw = base64.b64decode(encoded)
        except Exception:
            return ''
        target.write_bytes(raw)
        return f'pictures/{file_name}'
    except Exception:
        return ''


def is_within_directory(base_dir, target_path):
    try:
        base = Path(base_dir).resolve()
        target = Path(target_path).resolve()
        target.relative_to(base)
        return True
    except ValueError:
        return False
    except Exception:
        return False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_file(self, file_path):
        path = Path(file_path)
        if not path.is_file():
            self.send_json(404, {'error': 'Not found'})
            return

        try:
            content = path.read_bytes()
        except OSError:
            self.send_json(404, {'error': 'Not found'})
            return

        mime_types = {
            '.html': 'text/html; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
        }
        mime = mime_types.get(path.suffix.lower(), 'application/octet-stream')

        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def parse_json_body(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length <= 0:
            return {}
        body = self.rfile.read(length)
        if not body:
            return {}
        try:
            return json.loads(body.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}

    def resolve_static_path(self, request_path):
        if request_path in ('', '/'):
            return SRC_DIR / 'index.html'

        if request_path.startswith('/src/'):
            candidate = ROOT_DIR / request_path.lstrip('/')
        elif request_path.startswith('/Assets/') or request_path.startswith('/logins/') or request_path.startswith('/pictures/'):
            candidate = ROOT_DIR / request_path.lstrip('/')
        elif request_path.startswith('/'):
            candidate = ROOT_DIR / request_path.lstrip('/')
        else:
            candidate = ROOT_DIR / request_path

        if is_within_directory(ROOT_DIR, candidate):
            return candidate
        return None

    def handle_get_like(self, method):
        path = unquote(urlparse(self.path).path)

        if path == '/events':
            if method == 'HEAD':
                self.send_response(200)
                self.end_headers()
                return
            self.send_json(200, read_events())
            return

        if path in ('/', '/index.html'):
            if method == 'HEAD':
                self.send_response(200)
                self.end_headers()
                return
            self.serve_file(SRC_DIR / 'index.html')
            return

        resolved = self.resolve_static_path(path)
        if resolved and resolved.is_file():
            if method == 'HEAD':
                content = resolved.read_bytes()
                mime = {
                    '.html': 'text/html; charset=utf-8',
                    '.css': 'text/css; charset=utf-8',
                    '.js': 'application/javascript; charset=utf-8',
                    '.json': 'application/json; charset=utf-8',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                }.get(resolved.suffix.lower(), 'application/octet-stream')
                self.send_response(200)
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                return
            self.serve_file(resolved)
            return

        self.send_json(404, {'error': 'Not found'})

    def do_GET(self):
        self.handle_get_like('GET')

    def do_HEAD(self):
        self.handle_get_like('HEAD')

    def do_POST(self):
        path = urlparse(self.path).path
        payload = self.parse_json_body()

        if path == '/events':
            title = payload.get('title') if isinstance(payload, dict) else None
            date = payload.get('date') if isinstance(payload, dict) else None
            if not title or not date:
                self.send_json(400, {'error': 'Titel und Datum sind erforderlich.'})
                return

            events = read_events()
            events.append({'title': str(title).strip(), 'date': str(date).strip()})
            write_events(events)
            self.send_json(201, {'success': True})
            return

        if path == '/events/sync':
            incoming = payload.get('events', []) if isinstance(payload, dict) else []
            if not isinstance(incoming, list):
                incoming = []

            existing = read_events()
            existing_keys = {
                f"{item.get('date')}::{item.get('title')}"
                for item in existing
                if isinstance(item, dict) and item.get('date') and item.get('title')
            }
            to_add = []
            for item in incoming:
                if not isinstance(item, dict):
                    continue
                title = item.get('title')
                date = item.get('date')
                if not title or not date or is_past_event_date(date):
                    continue
                key = f"{date}::{title}"
                if key not in existing_keys:
                    to_add.append({'title': str(title).strip(), 'date': str(date).strip()})
                    existing_keys.add(key)

            existing.extend(to_add)
            write_events(existing)
            self.send_json(200, {'success': True, 'imported': len(to_add)})
            return

        if path == '/leaders':
            if not isinstance(payload, dict):
                self.send_json(400, {'error': 'Ungültige Daten.'})
                return

            username = (payload.get('username') or '').strip()
            email = (payload.get('email') or '').strip()
            telephone = (payload.get('telephone') or '').strip()
            picture = payload.get('picture') or ''
            role = (payload.get('role') or 'Leiterin / Leiter').strip() or 'Leiterin / Leiter'

            if not username or (not email and not telephone):
                self.send_json(400, {'error': 'Name und Kontaktangaben sind erforderlich.'})
                return

            users = read_users()
            normalized = []
            for user in users:
                if not isinstance(user, dict):
                    continue
                normalized.append({
                    'username': str(user.get('username') or '').strip(),
                    'email': str(user.get('email') or '').strip(),
                    'telephone': str(user.get('telephone') or '').strip(),
                    'picture': str(user.get('picture') or '').strip(),
                    'role': str(user.get('role') or 'Leiterin / Leiter').strip() or 'Leiterin / Leiter'
                })

            duplicate = any(
                user.get('username', '').lower() == username.lower()
                for user in normalized
            )
            if duplicate:
                self.send_json(409, {'error': 'Dieser Leiter existiert bereits.'})
                return

            stored_picture = get_leader_picture_path(username, picture)
            normalized.append({
                'username': username,
                'email': email,
                'telephone': telephone,
                'picture': stored_picture or '',
                'role': role
            })
            write_users(normalized)
            self.send_json(201, {'success': True, 'leader': {
                'username': username,
                'email': email,
                'telephone': telephone,
                'picture': stored_picture or '',
                'role': role
            }})
            return

        self.send_json(404, {'error': 'Not found'})


def main():
    cleanup_expired_events()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print('=' * 60)
    print('             WEB SERVER GESTARTET')
    print('=' * 60)
    print(f'Projektordner : {ROOT_DIR}')
    print(f'Website       : http://localhost:{PORT}/')
    print(f'Direkt        : http://localhost:{PORT}/src/index.html')
    print('Zum Beenden STRG+C drücken.')
    print('=' * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer wird beendet...')
    finally:
        server.server_close()
        print('Server beendet.')


if __name__ == '__main__':
    main()
