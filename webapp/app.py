import os
from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
from werkzeug.utils import secure_filename
from models import db, Banner, Widget, Setting, ConnectedClient
import uuid
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

# Configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///display.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max upload

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov'}

db.init_app(app)

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.before_request
def track_client():
    # Only track clients that are fetching the config (which means it's a display screen)
    if request.path == '/api/config':
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if ip:
            ip = ip.split(',')[0].strip()
            client = ConnectedClient.query.get(ip)
            if client:
                client.last_seen = datetime.utcnow()
            else:
                client = ConnectedClient(ip_address=ip)
                db.session.add(client)
            try:
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                print(f"Error tracking client: {e}")

# ============== PAGES ==============
@app.route('/')
def display_page():
    return render_template('index.html')

@app.route('/admin')
def admin_page():
    return render_template('admin.html')

# ============== BANNERS API ==============
@app.route('/api/banners', methods=['GET'])
def get_banners():
    include_archived = request.args.get('archived', 'false') == 'true'
    query = Banner.query
    if not include_archived:
        query = query.filter_by(archived=False)
    banners = query.order_by(Banner.order).all()
    return jsonify([b.to_dict() for b in banners])

@app.route('/api/banners', methods=['POST'])
def upload_banner():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if file and allowed_file(file.filename):
        original_name = file.filename
        ext = original_name.rsplit('.', 1)[1].lower()
        filename = f"{uuid.uuid4().hex}.{ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        max_order = db.session.query(db.func.max(Banner.order)).scalar() or 0
        banner = Banner(
            filename=filename,
            original_name=original_name,
            order=max_order + 1
        )
        db.session.add(banner)
        db.session.commit()
        
        return jsonify(banner.to_dict()), 201
    
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/api/banners/reorder', methods=['POST'])
def reorder_banners():
    updates = request.json
    for update in updates:
        banner = Banner.query.get(update['id'])
        if banner:
            banner.order = update['order']
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/banners/<int:id>', methods=['PATCH'])
def update_banner(id):
    banner = Banner.query.get_or_404(id)
    data = request.json
    
    if 'active' in data:
        banner.active = data['active']
    if 'archived' in data:
        banner.archived = data['archived']
    if 'order' in data:
        banner.order = data['order']
    
    db.session.commit()
    return jsonify(banner.to_dict())

@app.route('/api/banners/<int:id>', methods=['DELETE'])
def delete_banner(id):
    banner = Banner.query.get_or_404(id)
    # Delete file
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], banner.filename)
    if os.path.exists(filepath):
        os.remove(filepath)
    db.session.delete(banner)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/uploads/<filename>')
def serve_upload(filename):
    response = send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    response.headers['Cache-Control'] = 'public, max-age=31536000'
    return response

# ============== WIDGETS API ==============
@app.route('/api/widgets', methods=['GET'])
def get_widgets():
    widgets = Widget.query.order_by(Widget.sidebar, Widget.order).all()
    return jsonify([w.to_dict() for w in widgets])

@app.route('/api/widgets/<int:id>', methods=['PATCH'])
def update_widget(id):
    widget = Widget.query.get_or_404(id)
    data = request.json
    
    if 'sidebar' in data:
        widget.sidebar = data['sidebar']
    if 'order' in data:
        widget.order = data['order']
    if 'enabled' in data:
        widget.enabled = data['enabled']
    if 'preferences' in data:
        widget.set_preferences(data['preferences'])
    
    db.session.commit()
    return jsonify(widget.to_dict())

@app.route('/api/widgets/reorder', methods=['POST'])


@app.route('/api/widgets/reorder', methods=['POST'])
def reorder_widgets():
    updates = request.json
    for update in updates:
        widget = Widget.query.get(update['id'])
        if widget:
            widget.sidebar = update['sidebar']
            widget.order = update['order']
    db.session.commit()
    return jsonify({'success': True})

# ============== SETTINGS API ==============
@app.route('/api/settings', methods=['GET'])
def get_settings():
    settings = {
        'building_title': Setting.get('building_title', 'שניר 4 חדרה'),
        'rotation_time': int(Setting.get('rotation_time', '8000')),
        'refresh_interval': int(Setting.get('refresh_interval', '10')),
        'weather_location': Setting.get('weather_location', '32.4344,34.9189'),
        'weather_days': int(Setting.get('weather_days', '3')),
        'ticker_rss': Setting.get('ticker_rss', 'https://www.ynet.co.il/Integration/StoryRss1854.xml'),
        'ticker_speed': int(Setting.get('ticker_speed', '240')),
        'alert_zones': Setting.get('alert_zones', 'חדרה'),
        'test_alert': Setting.get('test_alert', 'false'),
    }
    return jsonify(settings)

@app.route('/api/settings', methods=['PUT'])
def update_settings():
    data = request.json
    for key, value in data.items():
        Setting.set(key, str(value))
    return jsonify({'success': True})

# ============== PROXY API (for fetching external resources) ==============
import urllib.request
import urllib.error

@app.route('/api/proxy/ical', methods=['GET'])
def proxy_ical():
    """Fetch iCal data from a URL"""
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL parameter required'}), 400
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = response.read().decode('utf-8')
            return data, 200, {'Content-Type': 'text/calendar; charset=utf-8'}
    except urllib.error.URLError as e:
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/proxy/rss', methods=['GET'])
def proxy_rss():
    """Fetch RSS feed from a URL"""
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL parameter required'}), 400
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = response.read().decode('utf-8')
            return data, 200, {'Content-Type': 'application/xml; charset=utf-8'}
    except urllib.error.URLError as e:
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/proxy/alerts', methods=['GET'])
def proxy_alerts():
    """Fetch Red Alerts from Pikud Haoref"""
    # Check if test alert is active
    test_mode = Setting.get('test_alert', 'false') == 'true'
    if test_mode:
        # Simulate an alert
        zones = Setting.get('alert_zones', 'חדרה').split(',')
        return jsonify({
            "id": "12345", 
            "cat": "1", 
            "title": "בדיקה בלבד", 
            "data": [zones[0].strip()] if zones else [], 
            "desc": "אנא היכנסו למרחב מוגן", 
            "is_test": True
        })

    # Real Alert Check
    url = "https://www.oref.org.il/WarningMessages/alert/alerts.json"
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://www.oref.org.il/',
            'X-Requested-With': 'XMLHttpRequest'
        })
        with urllib.request.urlopen(req, timeout=3) as response:
            data = response.read().decode('utf-8-sig') # BOM might be present
            if not data.strip():
                return jsonify({}) # Empty response means no alert
            return data, 200, {'Content-Type': 'application/json'}
    except Exception as e:
        # Fallback or quiet fail
        return jsonify({}), 200

@app.route('/api/admin/trigger-alert', methods=['POST'])
def trigger_alert():
    active = request.json.get('active', False)
    Setting.set('test_alert', 'true' if active else 'false')
    return jsonify({'success': True})

@app.route('/api/admin/clients', methods=['GET'])
def get_connected_clients():
    threshold = datetime.utcnow() - timedelta(minutes=2)
    count = ConnectedClient.query.filter(ConnectedClient.last_seen >= threshold).count()
    return jsonify({'count': count})

@app.route('/api/admin/trigger-refresh', methods=['POST'])
def trigger_refresh():
    """Trigger a refresh on all display clients"""
    new_token = uuid.uuid4().hex
    Setting.set('refresh_token', new_token)
    return jsonify({'success': True, 'token': new_token})

# ============== CONFIG API (for display) ==============
@app.route('/api/config', methods=['GET'])
def get_config():
    """Get full configuration for the display app"""
    banners = Banner.query.filter_by(active=True, archived=False).order_by(Banner.order).all()
    widgets = Widget.query.filter_by(enabled=True).order_by(Widget.sidebar, Widget.order).all()
    
    return jsonify({
        'banners': [b.to_dict() for b in banners],
        'widgets': {
            'left': [w.to_dict() for w in widgets if w.sidebar == 'left'],
            'right': [w.to_dict() for w in widgets if w.sidebar == 'right']
        },
        'settings': {
            'building_title': Setting.get('building_title', 'שניר 4 חדרה'),
            'rotation_time': int(Setting.get('rotation_time', '8000')),
            'refresh_interval': int(Setting.get('refresh_interval', '10')),
            'weather_location': Setting.get('weather_location', '32.4344,34.9189'),
            'weather_days': int(Setting.get('weather_days', '3')),
            'ticker_rss': Setting.get('ticker_rss', 'https://www.ynet.co.il/Integration/StoryRss1854.xml'),
            'ticker_speed': int(Setting.get('ticker_speed', '240')),
            'alert_zones': Setting.get('alert_zones', 'חדרה'),
            'test_alert': Setting.get('test_alert', 'false'),
            'refresh_token': Setting.get('refresh_token', ''),
        }
    })

def init_default_widgets():
    """Initialize default widgets if none exist"""
    
    # Check specifically for traffic widget and add if missing
    if Widget.query.filter_by(widget_type='traffic').count() == 0:
        db.session.add(Widget(widget_type='traffic', sidebar='unused', order=0, preferences='{"embed_url": "https://embed.waze.com/iframe?zoom=17&lat=32.4344&lon=34.9189&ct=livemap"}'))
        db.session.commit()

    if Widget.query.count() == 0:
        announcements_prefs = json.dumps({
            "messages": [
                "מעליות: ביום ג' הקרוב תתבצע תחזוקה תקופתית בין השעות 09:00-11:00.",
                "חניה: דיירים מתבקשים לא לחסום את שער הכניסה. נא להקפיד על חניה במקומות המסומנים בלבד."
            ]
        }, ensure_ascii=False)
        
        cleaning_prefs = json.dumps({
            "schedule": [
                {"day": "ראשון", "desc": "ניקיון קומות 10–18\nלובי, מעליות, מראות וקומת מינוס"},
                {"day": "שני", "desc": "ניקיון קומות 1–9\nלובי, מעליות, מראות וקומת מינוס"},
                {"day": "שלישי", "desc": "חדרי מדרגות\nפחי אשפה של השטחים המשותפים\nלובי, מעליות, מראות וקומת מינוס"},
                {"day": "רביעי", "desc": "ניקיון קומות 10–18\nלובי, מעליות, מראות וקומת מינוס"},
                {"day": "חמישי", "desc": "ניקיון קומות 1–9\nלובי, מעליות, מראות וקומת מינוס"},
                {"day": "שישי", "desc": "לובי, מעליות, מראות וקומת מינוס\nמעליות מיוחד"}
            ]
        }, ensure_ascii=False)
        
        defaults = [
            Widget(widget_type='events', sidebar='left', order=0, preferences='{"ical_url": "https://calendar.google.com/calendar/ical/26abe10de4934e9fb7d53fc1a3f3743327110dbd5dd1288b15424bbeb05760fa%40group.calendar.google.com/public/basic.ics"}'),
            Widget(widget_type='news', sidebar='left', order=1, preferences='{"rss_url": "https://www.ynet.co.il/Integration/StoryRss2.xml"}'),
            Widget(widget_type='announcements', sidebar='right', order=0, preferences=announcements_prefs),
            Widget(widget_type='cleaning', sidebar='right', order=1, preferences=cleaning_prefs),
            Widget(widget_type='traffic', sidebar='unused', order=0, preferences='{"embed_url": "https://embed.waze.com/iframe?zoom=15&lat=32.4344&lon=34.9189&ct=livemap"}'),
        ]
        db.session.add_all(defaults)
        db.session.commit()

def init_default_settings():
    """Initialize default settings if none exist"""
    if not Setting.query.first():
        Setting.set('building_title', 'שניר 4 חדרה')
        Setting.set('rotation_time', '8000')
        Setting.set('refresh_interval', '10')
        Setting.set('ticker_rss', 'https://www.ynet.co.il/Integration/StoryRss1854.xml')
        Setting.set('ticker_speed', '240')
        Setting.set('weather_location', '32.4344,34.9189')
        Setting.set('weather_days', '3')

# Initialize DB on import (for production)
with app.app_context():
    db.create_all()
    # Clear active clients on restart
    try:
        ConnectedClient.query.delete()
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Error clearing clients on startup: {e}")
        
    # Check if we need to init defaults
    if not Setting.query.first():
        init_default_settings()
        init_default_widgets()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
