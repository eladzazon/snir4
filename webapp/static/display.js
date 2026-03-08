const API = '';
let config = null;
let currentNewsIndex = 0;
let newsRotationInterval;
let bannerRotationInterval;

// ============ INIT ============
let refreshToken = null;

async function init() {
    try {
        const res = await fetch(`${API}/api/config`);
        config = await res.json();

        // Store initial refresh token
        refreshToken = config.settings.refresh_token || '';

        // Apply settings
        document.getElementById('building-title').textContent = config.settings.building_title;
        document.getElementById('refresh-meta').content = config.settings.refresh_interval * 60;

        // Render widgets
        renderSidebar('left-sidebar', config.widgets.left);
        renderSidebar('right-sidebar', config.widgets.right);

        // Load banners
        loadBanners();

        // Load weather
        fetchWeather();

        // Load ticker
        fetchTicker();

        // Start Refresh Token Polling
        startRefreshPolling();

    } catch (e) {
        console.error('Failed to load config:', e);
    }
}

// ============ REFRESH POLLING ============
function startRefreshPolling() {
    setInterval(async () => {
        try {
            const res = await fetch(`${API}/api/config`);
            const data = await res.json();
            const newToken = data.settings.refresh_token || '';

            if (refreshToken && newToken && newToken !== refreshToken) {
                console.log('Refresh triggered by admin');
                location.reload();
            }
            refreshToken = newToken;
        } catch (e) {
            // Silent fail
        }
    }, 30000); // Check every 30 seconds
}

// ============ SCALING ============
function updateScale() {
    const wrapper = document.querySelector('.screen-wrapper');
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    wrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;
}
window.addEventListener('resize', updateScale);
updateScale();

// ============ CLOCK ============
function toHebrewNumeral(n) {
    const units = ['', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳', 'ח׳', 'ט׳'];
    const tens = ['', 'י׳', 'כ׳', 'ל׳'];
    if (n === 15) return 'ט״ו';
    if (n === 16) return 'ט״ז';
    if (n <= 9) return units[n];
    if (n % 10 === 0) return tens[n / 10].replace('׳', '״');
    return tens[Math.floor(n / 10)].replace('׳', '') + units[n % 10].replace('׳', '״');
}

function formatHebrewYear(year) {
    const units = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
    const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
    const hundreds = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

    let num = year % 1000;
    let str = hundreds[Math.floor(num / 100)];
    num = num % 100;

    if (num === 15) {
        str += 'טו';
    } else if (num === 16) {
        str += 'טז';
    } else {
        str += tens[Math.floor(num / 10)];
        str += units[num % 10];
    }

    if (str.length === 1) {
        return str + '׳';
    } else if (str.length > 1) {
        return str.slice(0, -1) + '״' + str.slice(-1);
    }
    return str;
}

function updateTime() {
    const now = new Date();
    const tz = 'Asia/Jerusalem';

    document.getElementById('clock').textContent = now.toLocaleTimeString('he-IL', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit'
    });

    const partsEN = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
    }).formatToParts(now);

    let d = 1, m = 1, y = 2024, wd = 'Sun';
    partsEN.forEach(p => {
        if (p.type === 'day') d = parseInt(p.value, 10);
        if (p.type === 'month') m = parseInt(p.value, 10);
        if (p.type === 'year') y = parseInt(p.value, 10);
        if (p.type === 'weekday') wd = p.value;
    });

    const wdMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    document.getElementById('date-full').textContent = `${days[wdMap[wd]]}, ${d} ב${months[m - 1]} ${y}`;

    try {
        const parts = new Intl.DateTimeFormat('he-u-ca-hebrew', {
            timeZone: tz,
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).formatToParts(now);
        const dayNum = parseInt(parts.find(p => p.type === 'day').value);
        const monthName = parts.find(p => p.type === 'month').value;
        const hebDay = toHebrewNumeral(dayNum);
        const displayMonth = monthName.startsWith('ב') ? monthName : 'ב' + monthName;
        const yearVal = parts.find(p => p.type === 'year')?.value;
        const formattedYear = yearVal ? formatHebrewYear(parseInt(yearVal, 10)) : 'תשפ״ו';

        document.getElementById('hebrew-date').textContent = `${hebDay} ${displayMonth} ${formattedYear}`;
    } catch (e) { }
}
setInterval(updateTime, 1000);
updateTime();

// ============ WIDGETS ============
function renderSidebar(containerId, widgets) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    widgets.forEach(widget => {
        const el = createWidgetElement(widget);
        if (el) container.appendChild(el);
    });
}

function createWidgetElement(widget) {
    const prefs = widget.preferences || {};

    switch (widget.widget_type) {
        case 'events':
            return createEventsWidget(prefs);
        case 'news':
            return createNewsWidget(prefs);
        case 'announcements':
            return createAnnouncementsWidget(prefs);
        case 'cleaning':
            return createCleaningWidget(prefs);
        case 'traffic':
            return createTrafficWidget(prefs);
        default:
            return null;
    }
}

function createEventsWidget(prefs) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.flex = '0 0 auto';
    card.innerHTML = `
        <div class="card-header header-purple">📅 אירועים קרובים</div>
        <div class="card-body" id="calendar-container" style="padding: 15px;">
            <div class="loading">טוען אירועים...</div>
        </div>
    `;
    const eventCount = prefs.event_count || 2;
    setTimeout(() => fetchCalendar(prefs.ical_url, eventCount), 100);
    return card;
}

function createNewsWidget(prefs) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.flex = '1';
    card.innerHTML = `
        <div class="card-header header-red">📰 חדשות</div>
        <div class="news-scroll" id="news-container">
            <div class="loading">טוען חדשות...</div>
        </div>
    `;
    const newsCount = prefs.news_count || 12;
    const newsPerPage = prefs.news_per_page || 3;
    setTimeout(() => fetchNews(prefs.rss_url, newsCount, newsPerPage), 100);
    return card;
}

function createAnnouncementsWidget(prefs) {
    const messages = prefs.messages || [];
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
        <div class="card-header header-blue">📢 הודעות ועדכונים</div>
        <div class="msg-container">
            ${messages.map(m => `<div class="msg-item">${m}</div>`).join('')}
        </div>
    `;
    return card;
}

function createCleaningWidget(prefs) {
    const schedule = prefs.schedule || [];
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'flex:1; overflow: hidden;';
    card.innerHTML = `
        <div class="card-header header-green">🧹 שגרת ניקיון</div>
        <div class="clean-scroll">
            ${schedule.map(s => `
                <div class="clean-row">
                    <div class="clean-day">${s.day}</div>
                    <div class="clean-desc">${s.desc}</div>
                </div>
            `).join('')}
        </div>
    `;
    return card;
}

function createTrafficWidget(prefs) {
    const embedUrl = prefs.embed_url || 'https://embed.waze.com/iframe?zoom=17&lat=32.4344&lon=34.9189&ct=livemap';
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'flex:1; min-height: 250px; overflow: hidden;';
    card.innerHTML = `
        <div class="card-header header-red">🚗 עומסי תנועה</div>
        <div style="flex:1; width:100%; height:100%;">
            <iframe src="${embedUrl}" width="100%" height="100%" style="border:0;" allowfullscreen></iframe>
        </div>
    `;
    return card;
}

// ============ BANNERS ============
let bannerTimeout;

function loadBanners() {
    const container = document.getElementById('slideshow-container');
    const watermarkOverlay = document.getElementById('watermark-overlay');
    const banners = config.banners || [];

    const displayMode = config.settings.display_mode || 'banner';
    const watermarkImage = config.settings.watermark_image || '';

    if (displayMode === 'slideshow') {
        container.classList.add('effect-fade');
        if (watermarkImage && watermarkOverlay) {
            watermarkOverlay.style.backgroundImage = `url('${API}/uploads/${watermarkImage}')`;
            watermarkOverlay.style.display = 'block';
        } else if (watermarkOverlay) {
            watermarkOverlay.style.display = 'none';
        }
    } else {
        container.classList.remove('effect-fade');
        if (watermarkOverlay) watermarkOverlay.style.display = 'none';
    }

    if (bannerTimeout) clearTimeout(bannerTimeout);

    if (banners.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:24px;opacity:0.5;">אין באנרים להצגה</div>';
        return;
    }

    container.innerHTML = banners.map((b, i) => {
        const ext = b.filename.split('.').pop().toLowerCase();
        const isVideo = ['mp4', 'webm', 'mov'].includes(ext);
        const className = `banner-item`; // We don't add active here, let cycleBanners handle it

        if (isVideo) {
            return `<video src="${API}/uploads/${b.filename}" class="${className}" muted playsinline style="object-fit:cover;width:100%;height:100%;"></video>`;
        } else {
            return `<img src="${API}/uploads/${b.filename}" class="${className}" alt="Banner" style="object-fit:cover;width:100%;height:100%;">`;
        }
    }).join('');

    if (banners.length > 0) {
        cycleBanners(0, banners);
    }
}

function cycleBanners(index, banners) {
    const items = document.querySelectorAll('#slideshow-container .banner-item');
    if (items.length === 0) return;

    const currentItem = items[index];
    const duration = config.settings.rotation_time || 8000;

    items.forEach((el, i) => {
        if (i !== index) {
            el.classList.remove('active');
            if (el.tagName === 'VIDEO') {
                el.pause();
                el.currentTime = 0;
            }
        }
    });

    if (config.settings.display_mode === 'slideshow' && currentItem.tagName === 'IMG') {
        if (!currentItem.classList.contains('active')) {
            currentItem.style.transition = 'none';
            currentItem.style.transform = 'scale(1)';
        }

        setTimeout(() => {
            currentItem.style.transition = `opacity 1.5s ease-in-out, transform ${duration + 1000}ms linear`;
            currentItem.style.transform = 'scale(1.1)';
            currentItem.classList.add('active');
        }, 50);
    } else {
        currentItem.classList.add('active');
    }

    const nextIndex = (index + 1) % banners.length;

    if (currentItem.tagName === 'VIDEO') {
        const playPromise = currentItem.play();
        if (playPromise !== undefined) playPromise.catch(e => console.log('Autoplay blocked', e));

        currentItem.onended = () => {
            cycleBanners(nextIndex, banners);
        };
    } else {
        if (banners.length > 1) {
            bannerTimeout = setTimeout(() => {
                cycleBanners(nextIndex, banners);
            }, duration);
        }
    }
}



// ============ WEATHER ============
async function fetchWeather() {
    try {
        const location = config.settings.weather_location || '32.4344,34.9189';
        const [lat, lon] = location.split(',').map(s => s.trim());
        const days = config.settings.weather_days || 3;

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.daily) {
            const container = document.getElementById('weather-forecast');
            container.innerHTML = '';
            const daysShort = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

            for (let i = 0; i < days; i++) {
                const date = new Date(data.daily.time[i]);
                const dayLabel = i === 0 ? 'היום' : daysShort[date.getDay()];
                const maxTemp = Math.round(data.daily.temperature_2m_max[i]);
                const minTemp = Math.round(data.daily.temperature_2m_min[i]);
                const code = data.daily.weathercode[i];

                let icon = '☀️';
                if (code > 0) icon = '🌤️';
                if (code > 2) icon = '⛅';
                if (code > 3) icon = '☁️';
                if (code > 44) icon = '🌫️';
                if (code > 50) icon = '🌦️';
                if (code > 60) icon = '🌧️';
                if (code > 80) icon = '⛈️';

                container.innerHTML += `
                    <div class="weather-unit ${i === 0 ? 'today' : ''}">
                        <div class="weather-day-label">${dayLabel}</div>
                        <div class="weather-icon-small">${icon}</div>
                        <div class="weather-temps">
                            <span class="temp-high">${maxTemp}°</span>
                            <span class="temp-low">${minTemp}°</span>
                        </div>
                    </div>
                `;
            }
        }
    } catch (e) { console.error('Weather error', e); }
}

// ============ CALENDAR ============
async function fetchCalendar(icalUrl, eventCount = 2) {
    const container = document.getElementById('calendar-container');
    if (!icalUrl) {
        container.innerHTML = '<div class="loading">לא הוגדר קישור לוח שנה</div>';
        return;
    }

    try {
        const response = await fetch(`${API}/api/proxy/ical?url=${encodeURIComponent(icalUrl)}`);
        const icsData = await response.text();

        const jcalData = ICAL.parse(icsData);
        const comp = new ICAL.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const events = vevents.map(vevent => {
            const event = new ICAL.Event(vevent);
            return {
                summary: event.summary,
                start: event.startDate.toJSDate(),
                isAllDay: event.startDate.isDate,
                location: event.location || 'חדר דיירים'
            };
        })
            .filter(e => e.start >= todayStart)
            .sort((a, b) => a.start - b.start)
            .slice(0, eventCount);

        if (events.length === 0) {
            container.innerHTML = '<div class="loading">אין אירועים קרובים</div>';
            return;
        }

        container.innerHTML = events.map(ev => {
            const tz = 'Asia/Jerusalem';
            const dayStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(ev.start);
            const day = parseInt(dayStr, 10);
            const monthName = new Intl.DateTimeFormat('he-IL', { timeZone: tz, month: 'long' }).format(ev.start);
            const timeStr = ev.isAllDay ? 'כל היום' : ev.start.toLocaleTimeString('he-IL', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
            return `
                <div class="event-card-item">
                    <div class="event-day-box">
                        <span class="event-num">${day}</span>
                        <span class="event-mon">${monthName}</span>
                    </div>
                    <div class="event-info">
                        <div style="font-weight:700; font-size:16px;">${ev.summary}</div>
                        <div style="opacity:0.7; font-size:14px;">${timeStr} • ${ev.location}</div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error('Calendar error:', e);
        container.innerHTML = '<div class="loading">שגיאה בטעינת לוח שנה</div>';
    }
}

// ============ NEWS ============
async function fetchNews(rssUrl, newsCount = 12, newsPerPage = 3) {
    const container = document.getElementById('news-container');
    if (!rssUrl) {
        container.innerHTML = '<div class="loading">לא הוגדר פיד חדשות</div>';
        return;
    }

    try {
        const response = await fetch(`${API}/api/proxy/rss?url=${encodeURIComponent(rssUrl)}`);
        const xmlText = await response.text();

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const items = xmlDoc.querySelectorAll("item");

        if (items.length > 0) {
            container.innerHTML = '';
            const allItems = Array.from(items).slice(0, newsCount);

            for (let i = 0; i < allItems.length; i += newsPerPage) {
                const pageItems = allItems.slice(i, i + newsPerPage);
                const groupDiv = document.createElement('div');
                groupDiv.className = `news-group ${i === 0 ? 'active' : ''}`;

                pageItems.forEach(item => {
                    const title = item.querySelector("title").textContent.replace('<![CDATA[', '').replace(']]>', '');
                    let img = null;

                    // Try multiple sources for the image
                    // 1. Check enclosure tag
                    const enclosure = item.querySelector("enclosure");
                    if (enclosure && enclosure.getAttribute("url")) {
                        img = enclosure.getAttribute("url");
                    }

                    // 2. Check media:content tag (ynet uses this)
                    if (!img) {
                        const mediaContent = item.getElementsByTagName("media:content")[0];
                        if (mediaContent && mediaContent.getAttribute("url")) {
                            img = mediaContent.getAttribute("url");
                        }
                    }

                    // 3. Try to extract image from description HTML
                    if (!img) {
                        const desc = item.querySelector("description");
                        if (desc) {
                            const descText = desc.textContent;
                            const imgMatch = descText.match(/src=["']([^"']+)["']/);
                            if (imgMatch) {
                                img = imgMatch[1];
                            }
                        }
                    }

                    // 4. Check for image tag in ynet format
                    if (!img) {
                        const ynetImg = item.querySelector("image");
                        if (ynetImg && ynetImg.textContent) {
                            img = ynetImg.textContent.trim();
                        }
                    }

                    groupDiv.innerHTML += `
                        <div class="news-item">
                            ${img ? `<img src="${img}" class="news-img">` : '<div class="news-img" style="background:#1e293b;"></div>'}
                            <div class="news-title-container">
                                <div class="news-title">${title}</div>
                            </div>
                        </div>
                    `;
                });
                container.appendChild(groupDiv);
            }

            currentNewsIndex = 0;
            startNewsRotation();
        }
    } catch (e) { console.error('News error', e); }
}

function startNewsRotation() {
    if (newsRotationInterval) clearInterval(newsRotationInterval);
    newsRotationInterval = setInterval(() => {
        const groups = document.querySelectorAll('.news-group');
        if (groups.length === 0) return;
        groups[currentNewsIndex].classList.remove('active');
        currentNewsIndex = (currentNewsIndex + 1) % groups.length;
        groups[currentNewsIndex].classList.add('active');
    }, 10000);
}

// ============ TICKER ============
async function fetchTicker() {
    const container = document.getElementById('ticker-content');
    const tickerRss = config.settings.ticker_rss;
    const tickerSpeed = config.settings.ticker_speed || 240;

    if (!tickerRss) {
        container.innerHTML = '<span class="ticker-item">לא הוגדר פיד מבזקים</span>';
        container.classList.remove('loading');
        return;
    }

    try {
        const response = await fetch(`${API}/api/proxy/rss?url=${encodeURIComponent(tickerRss)}`);
        const xmlText = await response.text();

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const items = xmlDoc.querySelectorAll("item");

        if (items.length > 0) {
            let tickerHtml = '';
            Array.from(items).slice(0, 20).forEach(item => {
                const titleEl = item.querySelector("title");
                if (titleEl) {
                    let title = titleEl.textContent.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
                    if (title) tickerHtml += `<span class="ticker-item">${title}</span>`;
                }
            });

            if (tickerHtml) {
                container.innerHTML = tickerHtml + tickerHtml + tickerHtml + tickerHtml;
                container.style.animationDuration = tickerSpeed + 's';
                container.classList.remove('loading');
            }
        }
    } catch (e) {
        console.error('Ticker error:', e);
        container.innerHTML = '<span class="ticker-item">שגיאה בטעינת מבזקים</span>';
        container.classList.remove('loading');
    }
}

// Start
init();
setInterval(fetchWeather, 3600000);
