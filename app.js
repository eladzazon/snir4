let currentNewsIndex = 0;
let newsInterval;

async function fetchNews() {
    const container = document.getElementById("news-container");
    try {
        const rss = "https://www.ynet.co.il/Integration/StoryRss2.xml";
        const proxy = `https://corsproxy.io/?${encodeURIComponent(rss)}`;
        const res = await fetch(proxy);
        const text = await res.text();

        const xml = new DOMParser().parseFromString(text, "text/xml");
        const items = Array.from(xml.querySelectorAll("item")).slice(0, 12);

        container.innerHTML = "";

        for (let i = 0; i < items.length; i += 3) {
            const group = document.createElement("div");
            group.className = "news-group" + (i === 0 ? " active" : "");

            items.slice(i, i + 3).forEach(item => {
                const title = item.querySelector("title").textContent;
                let img = "https://picsum.photos/400/200?random=" + Math.random();

                const desc = item.querySelector("description")?.textContent || "";
                const m = desc.match(/src=['"](.*?)['"]/);
                if (m) img = m[1];

                group.innerHTML += `
                    <div class="news-item">
                        <img src="${img}" class="news-img">
                        <div class="news-title-container">
                            <div class="news-title">${title}</div>
                        </div>
                    </div>`;
            });

            container.appendChild(group);
        }

        startNewsRotation();

    } catch (e) {
        container.innerHTML = "<div class='loading'>שגיאה בטעינת חדשות</div>";
    }
}

function startNewsRotation() {
    const groups = document.querySelectorAll(".news-group");
    if (newsInterval) clearInterval(newsInterval);

    newsInterval = setInterval(() => {
        groups[currentNewsIndex].classList.remove("active");
        currentNewsIndex = (currentNewsIndex + 1) % groups.length;
        groups[currentNewsIndex].classList.add("active");
    }, 10000);
}

async function fetchTicker() {
    const container = document.getElementById("ticker-content");
    try {
        const rss = "https://www.ynet.co.il/Integration/StoryRss1854.xml";
        const proxy = `https://corsproxy.io/?${encodeURIComponent(rss)}`;
        const res = await fetch(proxy);
        const text = await res.text();

        const xml = new DOMParser().parseFromString(text, "text/xml");
        const titles = Array.from(xml.querySelectorAll("item title"))
            .slice(0, 20)
            .map(t => `<span class="ticker-item">${t.textContent}</span>`);

        container.innerHTML = titles.join("") + titles.join("");
    } catch {
        container.innerHTML = "<span class='ticker-item'>חדשות מתעדכנות</span>".repeat(20);
    }
}

fetchNews();
fetchTicker();

setInterval(fetchNews, 600000);
setInterval(fetchTicker, 600000);
