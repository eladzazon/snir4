# Display Admin System

Flask-based admin panel for managing lobby TV display.

## Quick Start

### Local Development
```bash
pip install -r requirements.txt
python app.py
```

### Docker
```bash
docker-compose up --build
```

Access admin at: http://localhost:5000/admin

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/banners | List banners |
| POST | /api/banners | Upload banner |
| PATCH | /api/banners/{id} | Update banner |
| DELETE | /api/banners/{id} | Delete banner |
| GET | /api/widgets | List widgets |
| PATCH | /api/widgets/{id} | Update widget |
| GET | /api/settings | Get settings |
| PUT | /api/settings | Update settings |
| GET | /api/config | Full config for display |
