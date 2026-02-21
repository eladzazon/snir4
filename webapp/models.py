from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json

db = SQLAlchemy()

class ConnectedClient(db.Model):
    ip_address = db.Column(db.String(50), primary_key=True)
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)

class Banner(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255))
    active = db.Column(db.Boolean, default=True)
    archived = db.Column(db.Boolean, default=False)
    order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'original_name': self.original_name,
            'active': self.active,
            'archived': self.archived,
            'order': self.order,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Widget(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    widget_type = db.Column(db.String(50), nullable=False)  # events, news, ticker, weather, announcements, cleaning
    sidebar = db.Column(db.String(10), default='left')  # left or right
    order = db.Column(db.Integer, default=0)
    enabled = db.Column(db.Boolean, default=True)
    preferences = db.Column(db.Text, default='{}')  # JSON string

    def get_preferences(self):
        try:
            return json.loads(self.preferences)
        except:
            return {}

    def set_preferences(self, prefs):
        self.preferences = json.dumps(prefs, ensure_ascii=False)

    def to_dict(self):
        return {
            'id': self.id,
            'widget_type': self.widget_type,
            'sidebar': self.sidebar,
            'order': self.order,
            'enabled': self.enabled,
            'preferences': self.get_preferences()
        }

class Setting(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text)

    @staticmethod
    def get(key, default=None):
        setting = Setting.query.filter_by(key=key).first()
        return setting.value if setting else default

    @staticmethod
    def set(key, value):
        setting = Setting.query.filter_by(key=key).first()
        if setting:
            setting.value = value
        else:
            setting = Setting(key=key, value=value)
            db.session.add(setting)
        db.session.commit()
        return setting
