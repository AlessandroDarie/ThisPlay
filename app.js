// ==========================================
// CONFIGURAZIONE E SETUP INIZIALE
// ==========================================

let currentContext = 'home';
let lastSearchQuery = '';
let currentTvFilter = 'all';
let currentMovieFilter = 'all';
let activeLibraryTab = 'tv';

// Motore di switch per le schede principali della Libreria
function switchLibraryTab(tab) {
    activeLibraryTab = tab;
    
    const tabTv = document.getElementById('tab-tv');
    const tabMovie = document.getElementById('tab-movie');
    const secTv = document.getElementById('library-tv-section');
    const secMovie = document.getElementById('library-movie-section');
    
    if (tab === 'tv') {
        tabTv.style.color = 'var(--text)';
        tabTv.style.opacity = '1';
        tabMovie.style.color = 'var(--text-muted)';
        tabMovie.style.opacity = '0.5';
        
        secTv.style.display = 'block';
        secMovie.style.display = 'none';
    } else {
        tabMovie.style.color = 'var(--text)';
        tabMovie.style.opacity = '1';
        tabTv.style.color = 'var(--text-muted)';
        tabTv.style.opacity = '0.5';
        
        secMovie.style.display = 'block';
        secTv.style.display = 'none';
    }
}
// Gestore universale dei bottoni filtro
function setLibraryFilter(mediaType, filterValue) {
    if (mediaType === 'tv') currentTvFilter = filterValue;
    if (mediaType === 'movie') currentMovieFilter = filterValue;
    renderLibrary(); // Ricarica la vista applicando le nuove memorie
}

// Motore di Debounce: blocca le raffiche di chiamate API
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// Inizializzazione dei silos asincroni tramite localForage
const UserLibrary = localforage.createInstance({
    name: "TVTracker",
    storeName: "user_library",
    description: "Database utente: ID serie, stato, tracking episodi"
});

const TmdbCache = localforage.createInstance({
    name: "TVTracker",
    storeName: "tmdb_cache",
    description: "Buffer dati: Oggetti JSON immensi scaricati da TMDB"
});

// Utilità per creare pause artificiali nell'esecuzione (Throttling)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// MOTORE DI RICERCA E AGGIUNTA
// ==========================================

async function searchMedia() {
    currentContext = 'search';
    const inputElement = document.getElementById('search-input');
    const resultsContainer = document.getElementById('search-results');
    const query = inputElement.value.trim();
    
    // Leggi il radio button selezionato
    const mediaType = document.querySelector('input[name="search-type"]:checked').value;

    if (!query) return;
    lastSearchQuery = query;

    document.getElementById('discovery-section').style.display = 'none';
    
    try {
        resultsContainer.innerHTML = '<span style="color: var(--text-muted);">Ricerca in corso...</span>';
        // Passa il type all'API config
        const url = TMDB_CONFIG.buildSearchUrl(query, mediaType);
        const response = await fetch(url);
        if (!response.ok) throw new Error("Errore durante la ricerca.");
        
        const data = await response.json();
        resultsContainer.innerHTML = '';

        if (data.results.length === 0) {
            resultsContainer.innerHTML = '<span style="color: var(--danger);">Nessun risultato trovato.</span>';
            return;
        }

        data.results.slice(0, 8).forEach(item => {
            let title, detailLine, badgeColor, badgeText, actionBtn, imgPath;

            if (mediaType === 'person') {
                // Bivio Attori
                title = item.name;
                detailLine = item.known_for_department === 'Acting' ? 'Recitazione' : (item.known_for_department || 'Sconosciuto');
                badgeColor = 'var(--text-muted)';
                badgeText = 'PERSONA';
                actionBtn = `<button class="btn btn-outline btn-small" onclick="openActorView(${item.id})">Apri</button>`;
                imgPath = item.profile_path; // TMDB usa profile_path per le persone
            } else {
                // Bivio Media (Film/TV)
                const rawDate = mediaType === 'tv' ? item.first_air_date : item.release_date;
                detailLine = rawDate ? `Anno: ${rawDate.substring(0, 4)}` : 'Anno: N/A';
                title = mediaType === 'tv' ? item.name : item.title;
                badgeColor = mediaType === 'tv' ? 'var(--text)' : 'var(--danger)';
                badgeText = mediaType === 'tv' ? 'TV' : 'FILM';
                actionBtn = `<button class="btn btn-outline btn-small" onclick="previewMedia(${item.id}, '${mediaType}')">Apri</button>`;
                imgPath = item.poster_path; // TMDB usa poster_path per i media
            }

            // Fallback intelligente se l'immagine manca nei server TMDB
            const imgUrl = imgPath ? `${TMDB_CONFIG.IMAGE_BASE_URL}${imgPath}` : 'https://placehold.co/100x150/27272a/a1a1aa?text=N/D';

            const div = document.createElement('div');
            div.className = 'card';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.style.padding = '0.75rem 1rem'; 
            div.style.marginBottom = '0';
            
            div.innerHTML = `
                <div style="display: flex; gap: 1rem; align-items: center; flex: 1; min-width: 0;">
                    <img src="${imgUrl}" alt="Cover" style="width: 45px; height: 68px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border); flex-shrink: 0;">
                    <div style="display: flex; flex-direction: column; gap: 0.2rem; overflow: hidden;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 0.6rem; font-weight: 900; background: ${badgeColor}; color: var(--card-bg); padding: 0.1rem 0.3rem; border-radius: 3px; letter-spacing: 0.5px; flex-shrink: 0;">${badgeText}</span>
                            <strong style="line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</strong>
                        </div>
                        <span style="color: var(--text-muted); font-size: 0.8rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${detailLine}</span>
                    </div>
                </div>
                <div style="flex-shrink: 0; padding-left: 0.5rem;">
                    ${actionBtn}
                </div>
            `;
            resultsContainer.appendChild(div);
        });

    } catch (error) {
        console.error(error);
        resultsContainer.innerHTML = '<span style="color: var(--danger);">Errore di connessione o API.</span>';
    }
}

// Apre l'anteprima velocemente caricando solo i dati principali
// Sostituisci l'intera funzione previewSeries con questa
async function previewMedia(mediaId, mediaType) {
    const loader = document.getElementById('global-loader');
    loader.classList.add('active'); // Attiva blur e rotella

    try {
        let tmdbData = await TmdbCache.getItem(String(mediaId));
        
        if (!tmdbData) {
            // 1. Bivio strategico per la chiamata API
            const url = mediaType === 'tv' 
                ? TMDB_CONFIG.buildTvUrl(mediaId) 
                : TMDB_CONFIG.buildMovieUrl(mediaId);
                
            const response = await fetch(url);
            if (!response.ok) throw new Error("API irraggiungibile");
            
            tmdbData = await response.json();
            
            // 2. INIEZIONE DEL TIPO E TIMESTAMP (Il passaggio cruciale)
            tmdbData.media_type = mediaType;
            tmdbData.last_updated = Date.now();
            
            await TmdbCache.setItem(String(mediaId), tmdbData);
        }
        
        openDetailView(mediaId);
        switchTab('detail');
    } catch (error) {
        console.error(error);
        await customAlert("Errore durante il caricamento dell'anteprima.");
    } finally {
        loader.classList.remove('active');
    }
}


async function addToLibraryFromPreview(mediaId) {
    try {
        const tmdbData = await TmdbCache.getItem(String(mediaId));
        if (!tmdbData) return;

        // Recuperiamo il DNA che abbiamo iniettato prima, con fallback di sicurezza
        const type = tmdbData.media_type || 'tv'; 

        const userSeriesModel = {
            id: mediaId,
            status: "watching", 
            added_at: Date.now(),
            watched_count: 0,
            watched_minutes: 0,
            progress: {},
            is_favorite: false,
            media_type: type // Salviamo il tipo anche nel DB dell'utente
        };
        
        await UserLibrary.setItem(String(mediaId), userSeriesModel);
        
        const title = type === 'tv' ? tmdbData.name : tmdbData.title;
        console.log(`[SUCCESSO] "${title}" aggiunto in libreria!`);
        
        // Risveglia il download asincrono SOLO se è una serie
        if (type === 'tv' && tmdbData.seasons && tmdbData.seasons.length > 0) {
            backgroundSeasonSync(mediaId, tmdbData.seasons);
        }

        openDetailView(mediaId);
        
    } catch (error) {
        console.error("[CRITICO] Fallimento durante l'aggiunta:", error);
        await customAlert("Errore critico durante l'aggiunta del titolo.");
    }
}

async function backgroundSeasonSync(tvId, seasonsList) {
    console.log(`[SYNC] Avvio download in background per ${seasonsList.length} stagioni (ID: ${tvId})...`);
    
    let tmdbData = await TmdbCache.getItem(String(tvId));
    if (!tmdbData) return;

    tmdbData.detailed_seasons = {};

    for (const season of seasonsList) {
        if (season.season_number === 0) continue; 

        try {
            const seasonUrl = `${TMDB_CONFIG.BASE_URL}/tv/${tvId}/season/${season.season_number}?api_key=${TMDB_CONFIG.API_KEY}&language=it-IT`;
            const response = await fetch(seasonUrl);
            
            if (response.ok) {
                const seasonData = await response.json();
                tmdbData.detailed_seasons[season.season_number] = seasonData;
                console.log(`[SYNC] Stagione ${season.season_number} scaricata.`);
            } else {
                console.warn(`[SYNC] Errore download Stagione ${season.season_number}`);
            }
            await sleep(300); 
        } catch (error) {
            console.error(`[SYNC] Fallimento critico su stagione ${season.season_number}:`, error);
        }
    }

    await TmdbCache.setItem(String(tvId), tmdbData);
    console.log(`[SYNC COMPLETO] Tutti i dati per l'ID ${tvId} sono ora offline-ready.`);

    document.dispatchEvent(new CustomEvent('seasonSyncCompleted', { 
        detail: { syncedTvId: String(tvId) } 
    }));
}

// ==========================================
// VISTE PRINCIPALI (HOME, LIBRERIA, STATS)
// ==========================================

async function renderHome() {
    currentContext = 'home';
    const container = document.getElementById('home-content');
    container.innerHTML = '<span style="color: var(--text-muted);">Scansione database in corso...</span>';

    try {
        const keys = await UserLibrary.keys();
        if(keys.length === 0) {
            container.innerHTML = `
                <p style="color: var(--text-muted); margin-bottom: 1rem;">La tua dashboard è vuota. Nessuna serie tracciata.</p>
                <button class="btn btn-success" onclick="switchTab('search')">Cerca una serie</button>
            `;
            return;
        }

        let inProgressItems = [];
        let upcomingItems = [];
        let historyPool = []; // Contenitore cronologia globale

        const todayObj = new Date();
        const today = todayObj.toISOString().split('T')[0];
        
        const limitObj = new Date();
        limitObj.setDate(todayObj.getDate() + 30); // Finestra visiva stretta a 30 giorni
        const maxDate = limitObj.toISOString().split('T')[0];

        for (const key of keys) {
            const userSeries = await UserLibrary.getItem(key);
            const tmdbData = await TmdbCache.getItem(key);
            
            // --- 1. ESTRAZIONE CRONOLOGIA GLOBALE (Passiva) ---
            if (userSeries.progress && tmdbData) {
                for (const [epKey, timestamp] of Object.entries(userSeries.progress)) {
                    if (epKey === 'MOVIE') continue; // Filtra i film, ci concentriamo sugli episodi
                    historyPool.push({
                        tvId: key,
                        epKey: epKey,
                        timestamp: timestamp,
                        seriesName: tmdbData.name || tmdbData.title,
                        posterPath: tmdbData.poster_path,
                        tmdbData: tmdbData
                    });
                }
            }

            // --- 2. ELABORAZIONE SEZIONI OPERATIVE (Attiva) ---
            if (!userSeries.progress || Object.keys(userSeries.progress).length === 0) continue;
            if (userSeries.status === 'paused') continue;
            if (!tmdbData || !tmdbData.detailed_seasons) continue;

            let targetEpisode = null;
            let isUpcoming = false;
            let epRuntime = 45;

            let maxS = 0;
            let maxE = 0;
            
            for (const epKey in userSeries.progress) {
                if (epKey === 'MOVIE') continue;
                const match = epKey.match(/S(\d+)E(\d+)/);
                if (match) {
                    const s = parseInt(match[1], 10);
                    const e = parseInt(match[2], 10);
                    if (s > maxS || (s === maxS && e > maxE)) {
                        maxS = s;
                        maxE = e;
                    }
                }
            }

            if (maxS > 0) {
                const currentSeasonData = tmdbData.detailed_seasons[maxS];
                
                if (currentSeasonData && currentSeasonData.episodes) {
                    const nextEpData = currentSeasonData.episodes.find(ep => ep.episode_number === maxE + 1);
                    
                    if (nextEpData) {
                        epRuntime = nextEpData.runtime || (tmdbData.episode_run_time && tmdbData.episode_run_time[0]) || 45;
                        if (nextEpData.air_date && nextEpData.air_date > today) {
                            if (nextEpData.air_date <= maxDate) {
                                isUpcoming = true;
                                targetEpisode = { 
                                    key: `S${String(maxS).padStart(2, '0')}E${String(nextEpData.episode_number).padStart(2, '0')}`, 
                                    name: nextEpData.name,
                                    air_date: nextEpData.air_date 
                                };
                            }
                        } else if (nextEpData.air_date && nextEpData.air_date <= today) {
                            targetEpisode = { 
                                key: `S${String(maxS).padStart(2, '0')}E${String(nextEpData.episode_number).padStart(2, '0')}`, 
                                name: nextEpData.name 
                            };
                        }
                    } else {
                        const nextSeasons = Object.keys(tmdbData.detailed_seasons)
                            .map(Number)
                            .filter(s => s > maxS)
                            .sort((a,b) => a - b);
                        
                        for (const nextS of nextSeasons) {
                            const nextSeasonData = tmdbData.detailed_seasons[nextS];
                            if (nextSeasonData && nextSeasonData.episodes && nextSeasonData.episodes.length > 0) {
                                const sortedEps = [...nextSeasonData.episodes].sort((a,b) => a.episode_number - b.episode_number);
                                const firstValidEp = sortedEps[0];
                                
                                if (firstValidEp) {
                                    epRuntime = firstValidEp.runtime || (tmdbData.episode_run_time && tmdbData.episode_run_time[0]) || 45;
                                    if (firstValidEp.air_date && firstValidEp.air_date > today) {
                                        if (firstValidEp.air_date <= maxDate) {
                                            isUpcoming = true;
                                            targetEpisode = { 
                                                key: `S${String(nextS).padStart(2, '0')}E${String(firstValidEp.episode_number).padStart(2, '0')}`, 
                                                name: firstValidEp.name,
                                                air_date: firstValidEp.air_date 
                                            };
                                        }
                                    } else if (firstValidEp.air_date && firstValidEp.air_date <= today) {
                                        targetEpisode = { 
                                            key: `S${String(nextS).padStart(2, '0')}E${String(firstValidEp.episode_number).padStart(2, '0')}`, 
                                            name: firstValidEp.name 
                                        };
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            if (targetEpisode) {
                const posterUrl = tmdbData.poster_path ? `${TMDB_CONFIG.IMAGE_BASE_URL}${tmdbData.poster_path}` : 'https://via.placeholder.com/150x225?text=No+Img';

                if (isUpcoming) {
                    const dateFormatted = targetEpisode.air_date.split('-').reverse().join('/');
                    upcomingItems.push({
                        dateTimestamp: new Date(targetEpisode.air_date).getTime(),
                        html: `
                        <div style="flex-shrink: 0; width: 130px; background: var(--card-bg); border: 1.5px solid var(--border); border-radius: var(--radius); overflow: hidden; position: relative; cursor: pointer;" onclick="openDetailView('${key}'); switchTab('detail');">
                            <img src="${posterUrl}" style="width: 100%; height: 80px; object-fit: cover; opacity: 0.7; border-bottom: 1.5px solid var(--border);" alt="${tmdbData.name}">
                            <div style="padding: 0.5rem;">
                                <div style="font-size: 0.6rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem; letter-spacing: 0.5px;">${dateFormatted}</div>
                                <strong style="font-size: 0.8rem; line-height: 1.1; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text);">${tmdbData.name}</strong>
                                <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 0.15rem; font-weight: 700; background: var(--input-bg); display: inline-block; padding: 0.1rem 0.3rem; border-radius: 3px;">${targetEpisode.key}</div>
                            </div>
                        </div>
                    `});
                } else {
                    inProgressItems.push({
                        lastInteraction: getLastInteraction(userSeries),
                        html: `
                        <div style="display: flex; border: 1.5px solid var(--text); background: var(--input-bg); margin-bottom: 0.75rem; overflow: hidden; height: 110px; cursor: pointer;" onclick="openDetailView('${key}'); switchTab('detail');">
                            <img src="${posterUrl}" style="width: 75px; object-fit: cover; border-right: 1.5px solid var(--text);" alt="${tmdbData.name}">
                            <div style="flex: 1; padding: 0.6rem 0.75rem; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
                                <div>
                                    <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem;">
                                        <strong style="font-size: 0.95rem; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1;">
                                            ${tmdbData.name}
                                        </strong>
                                        <span style="font-size: 0.7rem; font-weight: 900; color: var(--text-muted); flex-shrink: 0; background: var(--card-bg); padding: 0.1rem 0.3rem; border: 1px solid var(--border); border-radius: 3px;">
                                            ${targetEpisode.key}
                                        </span>
                                    </div>
                                    <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.2rem;">
                                        ${targetEpisode.name}
                                    </div>
                                </div>
                                <div style="display: flex; gap: 0.5rem; margin-top: auto;" onclick="event.stopPropagation()">
                                    <button style="flex: 1; border: 1.5px solid var(--success); background: transparent; color: var(--success); font-size: 0.75rem; font-weight: 800; padding: 0.35rem; display: flex; justify-content: center; align-items: center; gap: 0.4rem; border-radius: 4px; cursor: pointer; transition: all 0.2s;" onclick="markNextEpisodeWatched('${key}', '${targetEpisode.key}', ${epRuntime})">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        VISTO
                                    </button>
                                    <button style="width: 36px; padding: 0; display: flex; justify-content: center; align-items: center; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); border-radius: 4px; cursor: pointer; transition: all 0.2s;" onclick="const s = parseInt('${targetEpisode.key}'.match(/S(\\d+)E(\\d+)/)[1],10); const e = parseInt('${targetEpisode.key}'.match(/S(\\d+)E(\\d+)/)[2],10); openEpisodeDetails('${key}', s, e)" title="Dettagli Episodio">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `});
                }
            }
        }

        // --- 3. ELABORAZIONE E RENDERING DEL DOM ---
        inProgressItems.sort((a, b) => b.lastInteraction - a.lastInteraction);
        upcomingItems.sort((a, b) => a.dateTimestamp - b.dateTimestamp);
        
        // Elaborazione Array Cronologia
        historyPool.sort((a, b) => b.timestamp - a.timestamp);
        const recentHistory = historyPool.slice(0, 30);

        for (let item of recentHistory) {
            const match = item.epKey.match(/S(\d+)E(\d+)/);
            let epName = "Episodio Sconosciuto";
            let epRuntime = 45;
            if (match && item.tmdbData.detailed_seasons) {
                const s = parseInt(match[1], 10);
                const e = parseInt(match[2], 10);
                const seasonData = item.tmdbData.detailed_seasons[s];
                if (seasonData && seasonData.episodes) {
                    const epData = seasonData.episodes.find(x => x.episode_number === e);
                    if (epData) {
                        epName = epData.name || epName;
                        epRuntime = epData.runtime || (item.tmdbData.episode_run_time && item.tmdbData.episode_run_time[0]) || 45;
                    }
                }
            }
            item.epName = epName;
            item.epRuntime = epRuntime;
        }

        const activeCount = inProgressItems.length;
        const upcomingCount = upcomingItems.length;
        const inProgressHTML = inProgressItems.map(item => item.html).join('');
        const upcomingHTML = upcomingItems.map(item => item.html).join('');

        let finalHtml = '';

        if (upcomingCount > 0) {
            finalHtml += `
                <div style="margin-bottom: 1.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        <h3 style="margin: 0; font-size: 0.75rem; font-weight: 900; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px;">Calendario Uscite</h3>
                    </div>
                    <div style="display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.5rem; scrollbar-width: none;">
                        ${upcomingHTML}
                    </div>
                </div>
            `;
        }

        if (activeCount > 0) {
            finalHtml += `
                <h3 style="font-size: 0.85rem; font-weight: 900; text-transform: uppercase; color: var(--text); margin-bottom: 0.75rem; letter-spacing: 0.5px; border-bottom: 2px solid var(--text); padding-bottom: 0.3rem;">Da continuare</h3>
                ${inProgressHTML}
            `;
        }

        // AGGIUNTA WIDGET CRONOLOGIA (Con limite 7 ed espansione)
        if (recentHistory.length > 0) {
            let historyHTML = `
                <div style="margin-top: 2.5rem;">
                    <h3 style="font-size: 0.85rem; font-weight: 900; text-transform: uppercase; color: var(--text); margin-bottom: 0.75rem; letter-spacing: 0.5px; border-bottom: 2px solid var(--text); padding-bottom: 0.3rem;">Ultime Segnate</h3>
                    <div id="history-list">
            `;
            
            recentHistory.forEach((item, index) => {
                const posterUrl = item.posterPath ? `${TMDB_CONFIG.IMAGE_BASE_URL}${item.posterPath}` : 'https://placehold.co/150x225/27272a/a1a1aa?text=No+Img';
                const displayStyle = index >= 7 ? 'none' : 'flex';
                const hiddenClass = index >= 7 ? 'history-hidden' : '';
                
                historyHTML += `
                    <div class="${hiddenClass}" style="display: ${displayStyle}; border: 1.5px solid var(--border); background: var(--input-bg); margin-bottom: 0.75rem; overflow: hidden; height: 110px; cursor: pointer;" onclick="openDetailView('${item.tvId}'); switchTab('detail');">
                        <img src="${posterUrl}" style="width: 75px; object-fit: cover; border-right: 1.5px solid var(--border); filter: grayscale(40%) opacity(0.7);" alt="${item.seriesName}">
                        <div style="flex: 1; padding: 0.6rem 0.75rem; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
                            <div>
                                <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem;">
                                    <strong style="font-size: 0.95rem; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1; text-decoration: line-through; color: var(--text-muted);">
                                        ${item.seriesName}
                                    </strong>
                                    <span style="font-size: 0.7rem; font-weight: 900; color: var(--text-muted); flex-shrink: 0; background: transparent; padding: 0.1rem 0; border-radius: 3px;">
                                        ${item.epKey}
                                    </span>
                                </div>
                                <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.2rem;">
                                    ${item.epName}
                                </div>
                            </div>
                            <div style="display: flex; gap: 0.5rem; margin-top: auto;" onclick="event.stopPropagation()">
                                <button style="flex: 1; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-size: 0.75rem; font-weight: 800; padding: 0.35rem; display: flex; justify-content: center; align-items: center; gap: 0.4rem; border-radius: 4px; cursor: pointer; transition: all 0.2s;" onclick="undoEpisodeWatch('${item.tvId}', '${item.epKey}', ${item.epRuntime})" onmouseover="this.style.borderColor='var(--danger)'; this.style.color='var(--danger)';" onmouseout="this.style.borderColor='var(--border)'; this.style.color='var(--text-muted)';">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    NON VISTO
                                </button>
                                <button style="width: 36px; padding: 0; display: flex; justify-content: center; align-items: center; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); border-radius: 4px; cursor: pointer; transition: all 0.2s;" onclick="const s = parseInt('${item.epKey}'.match(/S(\\d+)E(\\d+)/)[1],10); const e = parseInt('${item.epKey}'.match(/S(\\d+)E(\\d+)/)[2],10); openEpisodeDetails('${item.tvId}', s, e)" title="Dettagli Episodio">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            if (recentHistory.length > 7) {
                historyHTML += `
                    <button id="btn-expand-history" class="btn btn-outline" style="width: 100%; margin-top: 0.5rem; font-size: 0.8rem; font-weight: 800; border-style: dashed;" onclick="document.querySelectorAll('.history-hidden').forEach(el => el.style.display = 'flex'); this.style.display = 'none';">Mostra cronologia completa (${recentHistory.length})</button>
                `;
            }
            
            historyHTML += `</div></div>`;
            finalHtml += historyHTML;
        }

        if (activeCount === 0 && upcomingCount === 0 && recentHistory.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem 0;">
                    <p style="color: var(--text-muted); margin-bottom: 1rem; font-weight: 600;">La tua dashboard è vuota.</p>
                    <button class="btn" onclick="switchTab('library')">Sfoglia Libreria</button>
                </div>
            `;
        } else {
            container.innerHTML = finalHtml;
        }

    } catch (e) {
        console.error("[CRITICO] Fallimento rendering Home:", e);
        container.innerHTML = '<span style="color: var(--danger);">Errore nel calcolo del cruscotto operativo.</span>';
    }
}

// Interruttore di sicurezza: rimuove la spunta e ri-proietta la UI al volo
async function undoEpisodeWatch(tvId, epKey, epRuntime) {
    try {
        const userSeries = await UserLibrary.getItem(String(tvId));
        if (!userSeries || !userSeries.progress || !userSeries.progress[epKey]) return;

        // Rimozione chirurgica del progresso
        delete userSeries.progress[epKey];
        
        // Compensazione contatori matematici
        userSeries.watched_count = Math.max(0, (userSeries.watched_count || 0) - 1);
        userSeries.watched_minutes = Math.max(0, (userSeries.watched_minutes || 0) - epRuntime);

        // Retrocessione automatica se la serie risultava completata
        if (userSeries.status === 'completed') {
            userSeries.status = 'watching';
        }

        await UserLibrary.setItem(String(tvId), userSeries);
        await checkAutoCompletion(tvId); // Ri-calcola e allinea database

        console.log(`[SYS] Salvataggio episodio annullato: ${tvId} -> ${epKey}`);
        
        // Ricarica la Home per far svanire la card o declassarla e riportarla tra le attive
        renderHome();
        
    } catch (error) {
        console.error("[CRITICO] Fallimento annullamento episodio:", error);
        await customAlert("Errore critico durante l'annullamento.");
    }
}

// Motore chirurgico per l'avanzamento rapido direttamente dalla Home
async function markNextEpisodeWatched(tvId, epKey, epRuntime) {
    try {
        const userSeries = await UserLibrary.getItem(String(tvId));
        if (!userSeries) return;

        // Inizializza l'oggetto progressi se corrotto
        if (!userSeries.progress) userSeries.progress = {};

        // Iniezione dei dati contabili
        userSeries.progress[epKey] = Date.now();
        userSeries.watched_count = (userSeries.watched_count || 0) + 1;
        userSeries.watched_minutes = (userSeries.watched_minutes || 0) + epRuntime;

        // Chiusura transazione base
        await UserLibrary.setItem(String(tvId), userSeries);

        // CONTROLLO STRATEGICO: Abbiamo appena visto l'ultimo episodio esistente?
        await checkAutoCompletion(tvId);

        // Feedback in console e re-render istantaneo del cruscotto
        console.log(`[SYS] Progresso rapido: ${tvId} -> ${epKey}`);
        
        renderHome();
        
    } catch (error) {
        console.error("[CRITICO] Fallimento operazione rapida:", error);
        await customAlert("Errore critico durante il salvataggio.");
    }
}

// Utilità per calcolare l'ultima interazione assoluta (per l'ordinamento)
function getLastInteraction(userSeries) {
    if (!userSeries.progress || Object.keys(userSeries.progress).length === 0) {
        return userSeries.added_at || 0; // Se non ha episodi visti, usa la data di aggiunta
    }
    return Math.max(...Object.values(userSeries.progress));
}

// Fabbrica DOM per la singola scheda della serie/film
function createSeriesCardElement(item) {
    const isMovie = item.tmdb.media_type === 'movie' || item.user.media_type === 'movie';
    const title = isMovie ? item.tmdb.title : item.tmdb.name;
    const posterUrl = item.tmdb.poster_path ? `${TMDB_CONFIG.IMAGE_BASE_URL}${item.tmdb.poster_path}` : 'https://placehold.co/500x750/27272a/a1a1aa?text=No+Image';
    
    let statusLabel = '';
    let statusColor = 'var(--text-muted)';
    
    if (item.user.status === 'completed') { statusLabel = isMovie ? 'VISTO' : 'COMPLETATA'; statusColor = 'var(--success)'; }
    else if (item.user.status === 'paused') { statusLabel = 'IN PAUSA'; statusColor = 'var(--text)'; }
    else if (item.user.status === 'planned' || item.user.watched_count === 0) { statusLabel = 'DA VEDERE'; }
    else { statusLabel = 'IN CORSO'; statusColor = 'var(--primary)'; }

    const favBadge = item.user.is_favorite ? `<div style="position: absolute; top: 5px; right: 5px; background: var(--card-bg); border-radius: 50%; padding: 4px; border: 1px solid var(--danger); color: var(--danger); line-height: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.5);"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg></div>` : '';
    
    // LOGICA BADGE DINAMICO
    const badgeBg = isMovie ? 'var(--danger)' : 'var(--text)';
    const badgeColor = isMovie ? '#ffffff' : 'var(--bg)';
    const badgeText = isMovie ? 'FILM' : 'SERIE';
    
    const typeBadge = `<div style="position: absolute; top: 5px; left: 5px; background: ${badgeBg}; color: ${badgeColor}; font-size: 0.6rem; font-weight: 900; padding: 0.15rem 0.35rem; border-radius: 3px; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">${badgeText}</div>`;

    const card = document.createElement('div');
    card.className = 'series-card';
    card.style.position = 'relative';
    card.onclick = () => {
        openDetailView(item.user.id);
        switchTab('detail'); 
    };

    card.innerHTML = `
        ${typeBadge}
        ${favBadge}
        <img src="${posterUrl}" alt="${title}">
        <div class="series-card-content">
            <span class="series-title" title="${title}">${title}</span>
            <span class="series-status" style="color: ${statusColor};">${statusLabel}</span>
        </div>
    `;
    return card;
}

async function renderLibrary() {
    currentContext = 'library';
    const tvGrid = document.getElementById('tv-grid');
    const movieGrid = document.getElementById('movie-grid');

    // 1. Aggiornamento Visivo Bottoni UI (Serie)
    const tvButtons = document.querySelectorAll('#tv-filters button');
    tvButtons.forEach(btn => btn.classList.remove('active'));
    const activeTvIndex = ['all', 'watching', 'planned', 'paused', 'completed', 'favorite'].indexOf(currentTvFilter);
    if(activeTvIndex >= 0) tvButtons[activeTvIndex].classList.add('active');

    // 2. Aggiornamento Visivo Bottoni UI (Film)
    const movieButtons = document.querySelectorAll('#movie-filters button');
    movieButtons.forEach(btn => btn.classList.remove('active'));
    const activeMovieIndex = ['all', 'planned', 'completed', 'favorite'].indexOf(currentMovieFilter);
    if(activeMovieIndex >= 0) movieButtons[activeMovieIndex].classList.add('active');

    tvGrid.innerHTML = '<span style="color: var(--text-muted);">Elaborazione dati...</span>';
    movieGrid.innerHTML = '<span style="color: var(--text-muted);">Elaborazione dati...</span>';

    try {
        const keys = await UserLibrary.keys();
        let seriesArray = [];
        let movieArray = [];

        // ESTRAZIONE MASSIVA E SMISTAMENTO ALLA RADICE
        for (const key of keys) {
            const userItem = await UserLibrary.getItem(key);
            let tmdbData = await TmdbCache.getItem(key);
            
            if (!tmdbData) continue; // Ignora i falliti di cache, ci pensa l'updater in background

            const isMovie = tmdbData.media_type === 'movie' || userItem.media_type === 'movie';
            const itemData = { key: key, user: userItem, tmdb: tmdbData, lastInteraction: getLastInteraction(userItem) };

            if (isMovie) {
                if (!userItem.status) userItem.status = 'planned';
                movieArray.push(itemData);
            } else {
                if (!userItem.status) userItem.status = 'watching';
                seriesArray.push(itemData);
            }
        }

        // Ordinamento cronologico assoluto per entrambi i silos
        seriesArray.sort((a, b) => b.lastInteraction - a.lastInteraction);
        movieArray.sort((a, b) => b.lastInteraction - a.lastInteraction);

        tvGrid.innerHTML = '';
        movieGrid.innerHTML = '';

        // MOTORE DI RENDERING SEZIONI INTERNO
        const buildSection = (array, currentFilter, container, typeConfig) => {
            const filterLogic = (type) => array.filter(item => {
                const eps = item.user.watched_count || 0;
                switch(type) {
                    case 'watching': return item.user.status === 'watching' && eps > 0;
                    case 'planned': return (item.user.status === 'watching' && eps === 0) || item.user.status === 'planned';
                    case 'paused': return item.user.status === 'paused';
                    case 'completed': return item.user.status === 'completed';
                    case 'favorite': return item.user.is_favorite === true;
                    default: return true;
                }
            });

            if (array.length === 0) {
                container.innerHTML = '<span style="color: var(--text-muted); display: block; padding: 1rem 0;">Nessun titolo salvato in questa sezione.</span>';
                return;
            }

            if (currentFilter === 'all') {
                let hasContent = false;
                typeConfig.forEach(cat => {
                    const catItems = filterLogic(cat.id);
                    if (catItems.length === 0) return;
                    hasContent = true;

                    const headerColor = cat.color || 'var(--text)';
                    const sectionDiv = document.createElement('div');
                    
                    sectionDiv.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: ${hasContent && container.innerHTML !== '' ? '2rem' : '0'}; margin-bottom: 1rem; border-bottom: 2px solid ${headerColor}; padding-bottom: 0.5rem;">
                            <h3 style="margin: 0; text-transform: uppercase; font-weight: 900; color: ${headerColor}; letter-spacing: -0.5px; font-size: 1.1rem;">${cat.title}</h3>
                            ${catItems.length > 6 ? `<button class="btn btn-outline btn-small" style="font-weight: 800; border-color: ${headerColor}; color: ${headerColor}; padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="setLibraryFilter('${typeConfig[0].mediaType}', '${cat.id}')">Vedi Tutte (${catItems.length})</button>` : ''}
                        </div>
                    `;
                    const subGrid = document.createElement('div');
                    subGrid.className = 'library-grid';
                    
                    catItems.slice(0, 6).forEach(item => subGrid.appendChild(createSeriesCardElement(item)));
                    
                    sectionDiv.appendChild(subGrid);
                    container.appendChild(sectionDiv);
                });

                if (!hasContent) container.innerHTML = '<span style="color: var(--text-muted); display: block; padding: 1rem 0;">La tua lista è completamente vuota.</span>';

            } else {
                const targetItems = filterLogic(currentFilter);
                if (targetItems.length === 0) {
                    container.innerHTML = `<span style="color: var(--text-muted); display: block; padding: 1rem 0;">Nessun titolo in questa categoria.</span>`;
                    return;
                }
                const grid = document.createElement('div');
                grid.className = 'library-grid';
                targetItems.forEach(item => grid.appendChild(createSeriesCardElement(item)));
                container.appendChild(grid);
            }
        };

        // Configurazioni logiche per le categorie
        const tvConfig = [
            { id: 'watching', title: 'In Corso', mediaType: 'tv' },
            { id: 'planned', title: 'Da Vedere', mediaType: 'tv' },
            { id: 'paused', title: 'In Pausa', mediaType: 'tv' },
            { id: 'completed', title: 'Viste', mediaType: 'tv' },
            { id: 'favorite', title: 'Preferite', color: 'var(--danger)', mediaType: 'tv' }
        ];

        const movieConfig = [
            { id: 'planned', title: 'Da Vedere', mediaType: 'movie' },
            { id: 'completed', title: 'Visti', mediaType: 'movie' },
            { id: 'favorite', title: 'Preferiti', color: 'var(--danger)', mediaType: 'movie' }
        ];

        // Esecuzione parallela
        buildSection(seriesArray, currentTvFilter, tvGrid, tvConfig);
        buildSection(movieArray, currentMovieFilter, movieGrid, movieConfig);

    } catch (error) {
        console.error(error);
        tvGrid.innerHTML = '<span style="color: var(--danger); display: block;">Errore critico durante la scansione del database.</span>';
    }
}

async function renderStats() {
    currentContext = 'stats';
    const container = document.getElementById('stats-content');
    container.innerHTML = '<div style="text-align: center; padding: 2rem;"><div style="width: 40px; height: 40px; border: 4px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div><span style="color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Calcolo proiezioni analitiche...</span></div>';
    
    try {
        const keys = await UserLibrary.keys();
        
        // Strutture Dati Separate
        let tv = { tracked: 0, watching: 0, completed: 0, planned: 0, paused: 0, epsWatched: 0, minutes: 0 };
        let movie = { tracked: 0, planned: 0, completed: 0, minutes: 0 };
        
        for (const key of keys) {
            const userItem = await UserLibrary.getItem(key);
            const tmdbData = await TmdbCache.getItem(key);
            
            // Deduciamo il tipo con fallback al salvataggio locale
            const type = (tmdbData && tmdbData.media_type) ? tmdbData.media_type : (userItem.media_type || 'tv');
            
            if (type === 'tv') {
                tv.tracked++;
                const status = userItem.status || 'watching';
                const eps = userItem.watched_count || 0; // Spostato qui in alto per poterlo valutare
                
                // ALLINEAMENTO LOGICO CON LA LIBRERIA:
                if (status === 'completed') {
                    tv.completed++;
                } else if (status === 'paused') {
                    tv.paused++;
                } else if (status === 'planned' || (status === 'watching' && eps === 0)) {
                    tv.planned++; // Se è "in corso" ma hai visto 0 episodi, è di fatto "Da vedere"
                } else if (status === 'watching' && eps > 0) {
                    tv.watching++; // È in corso solo se hai visto almeno un episodio
                }
                
                tv.epsWatched += eps;
                
                if (userItem.watched_minutes !== undefined) {
                    tv.minutes += userItem.watched_minutes;
                } else {
                    let runtime = 45; 
                    if(tmdbData && tmdbData.episode_run_time && tmdbData.episode_run_time.length > 0) runtime = tmdbData.episode_run_time[0];
                    tv.minutes += (eps * runtime);
                }
            } else {
                movie.tracked++;
                const status = userItem.status || 'planned';
                if (status === 'completed') movie.completed++;
                else movie.planned++; // Fallback implicito per i film
                
                let runtime = (tmdbData && tmdbData.runtime) ? tmdbData.runtime : 120;
                if (status === 'completed') {
                    movie.minutes += runtime;
                }
            }
        }
        
        // Helper per la conversione del tempo
        // Helper per la conversione base (per mantenere 3968h 32m nel cruscotto)
        const formatTime = (totalMins) => {
            return {
                h: Math.floor(totalMins / 60),
                m: totalMins % 60
            };
        };

        // NUOVO HELPER: Algoritmo brutale per il tempo umano scalare
        const formatHumanTime = (totalMins) => {
            if (totalMins === 0) return "0 minuti";
            
            const minsInHour = 60;
            const minsInDay = 24 * minsInHour;
            const minsInMonth = 30 * minsInDay;
            const minsInYear = 365 * minsInDay;

            let y = Math.floor(totalMins / minsInYear);
            let remainder = totalMins % minsInYear;
            
            let mo = Math.floor(remainder / minsInMonth);
            remainder = remainder % minsInMonth;
            
            let d = Math.floor(remainder / minsInDay);
            remainder = remainder % minsInDay;
            
            let h = Math.floor(remainder / minsInHour);
            let m = remainder % minsInHour;

            let parts = [];
            if (y > 0) parts.push(`<strong style="color: var(--text);">${y}</strong> ann${y === 1 ? 'o' : 'i'}`);
            if (mo > 0) parts.push(`<strong style="color: var(--text);">${mo}</strong> mes${mo === 1 ? 'e' : 'i'}`);
            if (d > 0) parts.push(`<strong style="color: var(--text);">${d}</strong> giorn${d === 1 ? 'o' : 'i'}`);
            if (h > 0) parts.push(`<strong style="color: var(--text);">${h}</strong> or${h === 1 ? 'a' : 'e'}`);
            if (m > 0) parts.push(`<strong style="color: var(--text);">${m}</strong> minut${m === 1 ? 'o' : 'i'}`);

            if (parts.length === 1) return parts[0];
            if (parts.length === 2) return parts.join(' e ');
            
            const last = parts.pop();
            return parts.join(', ') + ' e ' + last;
        };

        const tvTime = formatTime(tv.minutes);
        const movieTime = formatTime(movie.minutes);
        const totalTime = formatTime(tv.minutes + movie.minutes);
        const humanReadableTotal = formatHumanTime(tv.minutes + movie.minutes);

        // Helper per le percentuali
        const getPct = (val, total) => total > 0 ? Math.round((val / total) * 100) : 0;
        
        // Calcolo metriche per barra Serie
        const tvActivePct = getPct(tv.watching, tv.tracked);
        const tvDonePct = getPct(tv.completed, tv.tracked);
        const tvPausedPct = getPct(tv.paused, tv.tracked);
        const tvPlannedPct = getPct(tv.planned, tv.tracked);

        // Calcolo metriche per barra Film
        const movieDonePct = getPct(movie.completed, movie.tracked);
        const moviePlannedPct = getPct(movie.planned, movie.tracked);

        // Fabbrica del DOM Brutalista
        container.innerHTML = `
            <!-- SEZIONE TOTALE -->
            <div style="border: 2px solid var(--text); padding: 1.5rem; background: var(--card-bg); margin-bottom: 2rem; position: relative; overflow: hidden;">
                <div style="position: absolute; top: -10px; right: -10px; font-size: 6rem; opacity: 0.03; font-weight: 900; pointer-events: none; line-height: 1;">&Sigma;</div>
                <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 900; letter-spacing: 1px; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1rem;">Quadro Complessivo</div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800;">Opere Segnate</div>
                        <div style="font-size: 2.2rem; font-weight: 900; line-height: 1;">${tv.tracked + movie.tracked}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800;">Tempo Totale</div>
                        <div style="display: flex; align-items: baseline; gap: 0.1rem;">
                            <span style="font-size: 2.2rem; font-weight: 900; line-height: 1;">${totalTime.h}</span><span style="font-size: 1rem; color: var(--text-muted); font-weight: 700;">h</span>
                            <span style="font-size: 2.2rem; font-weight: 900; line-height: 1; margin-left: 0.2rem;">${totalTime.m}</span><span style="font-size: 1rem; color: var(--text-muted); font-weight: 700;">m</span>
                        </div>
                    </div>
                </div>
                <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); background: var(--input-bg); padding: 0.75rem; border-left: 4px solid var(--text); line-height: 1.5;">
                    Equivale a ${humanReadableTotal} spesi ininterrottamente davanti a uno schermo.
                </div>
            </div>

            <!-- SEZIONE SERIE TV -->
            <div style="margin-bottom: 2rem;">
                <h3 style="font-size: 1.1rem; text-transform: uppercase; color: var(--text); border-bottom: 2px solid var(--text); padding-bottom: 0.5rem; margin-bottom: 1rem;">Serie TV</h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1.5rem;">
                    <div style="border: 1px solid var(--border); padding: 1rem; background: var(--input-bg);">
                        <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800;">Totali</div>
                        <div style="font-size: 1.8rem; font-weight: 900; line-height: 1;">${tv.tracked}</div>
                    </div>
                    <div style="border: 1px solid var(--border); padding: 1rem; background: var(--input-bg);">
                        <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800;">Episodi Visti</div>
                        <div style="font-size: 1.8rem; font-weight: 900; line-height: 1;">${tv.epsWatched}</div>
                    </div>
                </div>

                <!-- GRAFICO A BARRA CSS: SERIE -->
                <div style="margin-bottom: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.3rem;">
                        <span>In Corso (${tvActivePct}%)</span>
                        <span>Completate (${tvDonePct}%)</span>
                    </div>
                    <div style="width: 100%; height: 12px; background: var(--input-bg); border-radius: 6px; display: flex; overflow: hidden; border: 1px solid var(--border);">
                        <div style="width: ${tvActivePct}%; background: var(--primary);" title="In Corso: ${tv.watching}"></div>
                        <div style="width: ${tvDonePct}%; background: var(--success);" title="Completate: ${tv.completed}"></div>
                        <div style="width: ${tvPausedPct}%; background: var(--text-muted);" title="In Pausa: ${tv.paused}"></div>
                        <div style="width: ${tvPlannedPct}%; background: transparent;" title="Da Vedere: ${tv.planned}"></div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-top: 0.75rem; text-align: center;">
                        <div><div style="font-size: 1.2rem; font-weight: 900; color: var(--primary);">${tv.watching}</div><div style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">In Corso</div></div>
                        <div><div style="font-size: 1.2rem; font-weight: 900; color: var(--success);">${tv.completed}</div><div style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Pari/Fine</div></div>
                        <div><div style="font-size: 1.2rem; font-weight: 900; color: var(--text);">${tv.planned}</div><div style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Da Vedere</div></div>
                        <div><div style="font-size: 1.2rem; font-weight: 900; color: var(--text-muted);">${tv.paused}</div><div style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">In Pausa</div></div>
                    </div>
                </div>

                <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); display: flex; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 0.5rem;">
                    <span>Tempo Totale Serie:</span>
                    <strong style="color: var(--text);">${tvTime.h}h ${tvTime.m}m</strong>
                </div>
            </div>

            <!-- SEZIONE FILM -->
            <div>
                <h3 style="font-size: 1.1rem; text-transform: uppercase; color: var(--danger); border-bottom: 2px solid var(--danger); padding-bottom: 0.5rem; margin-bottom: 1rem;">Film</h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1.5rem;">
                    <div style="border: 1px solid var(--border); padding: 1rem; background: var(--input-bg);">
                        <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800;">Tracciati</div>
                        <div style="font-size: 1.8rem; font-weight: 900; line-height: 1;">${movie.tracked}</div>
                    </div>
                    <div style="border: 1px solid var(--border); padding: 1rem; background: var(--input-bg);">
                        <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800;">Visti</div>
                        <div style="font-size: 1.8rem; font-weight: 900; line-height: 1; color: var(--danger);">${movie.completed}</div>
                    </div>
                </div>

                <!-- GRAFICO A BARRA CSS: FILM -->
                <div style="margin-bottom: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.3rem;">
                        <span>Visti (${movieDonePct}%)</span>
                        <span>Da Vedere (${moviePlannedPct}%)</span>
                    </div>
                    <div style="width: 100%; height: 12px; background: var(--input-bg); border-radius: 6px; display: flex; overflow: hidden; border: 1px solid var(--border);">
                        <div style="width: ${movieDonePct}%; background: var(--danger);" title="Visti: ${movie.completed}"></div>
                        <div style="width: ${moviePlannedPct}%; background: transparent;" title="Da Vedere: ${movie.planned}"></div>
                    </div>
                </div>

                <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); display: flex; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 0.5rem;">
                    <span>Tempo Totale Film:</span>
                    <strong style="color: var(--text);">${movieTime.h}h ${movieTime.m}m</strong>
                </div>
            </div>
        `;
    } catch (e) {
        console.error("[CRITICO] Fallimento rendering Stats:", e);
        container.innerHTML = '<div style="padding: 2rem; border: 2px solid var(--danger); background: var(--card-bg); color: var(--danger); font-weight: 800; text-align: center; text-transform: uppercase;">Impossibile elaborare i dati.<br>Database corrotto o irraggiungibile.</div>';
    }
}

async function openDetailView(mediaId) {
    window.currentOpenTvId = String(mediaId);
    const detailContent = document.getElementById('detail-content');
    detailContent.innerHTML = '<span style="color: var(--text-muted);">Estrazione dati...</span>';

    try {
        const userSeries = await UserLibrary.getItem(String(mediaId));
        const tmdbData = await TmdbCache.getItem(String(mediaId));
        
        if (!tmdbData) throw new Error("Dati TMDB mancanti.");

        const isPreview = !userSeries;
        const mediaType = tmdbData.media_type || 'tv'; 
        const isMovie = mediaType === 'movie';
        const title = isMovie ? tmdbData.title : tmdbData.name;

        const bannerUrl = tmdbData.backdrop_path 
            ? `https://image.tmdb.org/t/p/w780${tmdbData.backdrop_path}` 
            : (tmdbData.poster_path ? `${TMDB_CONFIG.IMAGE_BASE_URL}${tmdbData.poster_path}` : '');

        let bannerHTML = bannerUrl ? `<div style="width: 100%; height: 160px; border: 1.5px solid var(--text); background: url('${bannerUrl}') center/cover; margin-bottom: 1.5rem; display: block;"></div>` : '';

        // ESTRAZIONE DATI AGGIUNTIVI (PROVIDERS, TRAILER, CAST)
        let providersHTML = '';
        if (tmdbData['watch/providers']?.results?.IT) {
            const itData = tmdbData['watch/providers'].results.IT;
            const providers = itData.flatrate || itData.free || [];
            if (providers.length > 0) {
                const uniqueProviders = Array.from(new Map(providers.map(p => [p.provider_id, p])).values());
                providersHTML = `
                    <div style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem;">
                        <strong style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">Su:</strong>
                        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                            ${uniqueProviders.map(p => `<img src="https://image.tmdb.org/t/p/original${p.logo_path}" alt="${p.provider_name}" title="${p.provider_name}" style="width: 28px; height: 28px; border-radius: 4px; border: 1px solid var(--border);">`).join('')}
                        </div>
                    </div>
                `;
            }
        }

        // ==========================================
        // ACTION BAR UNIFICATA (Aggiungi, Trailer, Aggiorna, Elimina)
        // ==========================================
        let actionButtons = '';
        
        if (isPreview) {
            actionButtons += `
                <button class="btn btn-success btn-small" style="font-weight: 800; display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 1rem;" onclick="addToLibraryFromPreview(${mediaId})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    AGGIUNGI
                </button>
            `;
        }

        if (tmdbData.videos?.results) {
            const trailer = tmdbData.videos.results.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
            if (trailer) {
                actionButtons += `
                    <a href="https://www.youtube.com/watch?v=${trailer.key}" target="_blank" class="btn btn-outline btn-small" style="display: inline-flex; align-items: center; gap: 0.4rem; border-color: var(--danger); color: var(--danger); text-decoration: none;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        Trailer
                    </a>
                `;
            }
        }

        // Se l'opera è tracciata, mostra i comandi di amministrazione
        if (!isPreview) {
            actionButtons += `
                <button class="btn btn-outline btn-small" style="display: inline-flex; align-items: center; gap: 0.4rem;" onclick="forceUpdateMetadata(${mediaId})" title="Forza il download dei nuovi dati da TMDB">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                    Aggiorna
                </button>
                <button class="btn btn-outline btn-small" style="display: inline-flex; align-items: center; gap: 0.4rem; border-color: var(--danger); color: var(--danger);" onclick="removeSeries(${mediaId})" title="Rimuovi dalla libreria">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    Elimina
                </button>
            `;
        }

        let actionBarHTML = actionButtons ? `<div style="display: flex; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap;">${actionButtons}</div>` : '';


        let castHTML = '';
        if (tmdbData.credits?.cast) {
            const topCast = tmdbData.credits.cast.slice(0, 6);
            if (topCast.length > 0) {
                castHTML = `
                    <div style="margin-bottom: 1.5rem;">
                        <strong style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 0.5rem;">Cast Principale</strong>
                        <div style="display: flex; gap: 0.75rem; overflow-x: auto; padding-bottom: 0.5rem; scrollbar-width: none;">
                            ${topCast.map(actor => `
                                <div style="flex-shrink: 0; width: 65px; text-align: center; cursor: pointer;" onclick="openActorView(${actor.id})" title="Apri scheda di ${actor.name}">
                                    <img src="${actor.profile_path ? 'https://image.tmdb.org/t/p/w185' + actor.profile_path : 'https://placehold.co/65x95/27272a/a1a1aa?text=?'}" alt="${actor.name}" style="width: 65px; height: 65px; object-fit: cover; border-radius: 50%; border: 1.5px solid var(--border); margin-bottom: 0.3rem;">
                                    <div style="font-size: 0.65rem; font-weight: 800; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text);">${actor.name}</div>
                                    <div style="font-size: 0.6rem; color: var(--text-muted); line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.1rem;">${actor.character}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        }

        let recommendationsHTML = '';
        try {
            const recRes = await fetch(`${TMDB_CONFIG.BASE_URL}/${mediaType}/${mediaId}/recommendations?api_key=${TMDB_CONFIG.API_KEY}&language=it-IT`);
            if (recRes.ok) {
                const recData = await recRes.json();
                if (recData.results && recData.results.length > 0) {
                    recommendationsHTML = buildDiscoveryRow('Titoli Simili', recData.results, mediaType);
                }
            }
        } catch (e) {
            console.warn("[SYS] Radar offline per titoli simili.");
        }

        // ASSEMBLAGGIO FINALE UI BASE
        let html = `
            ${bannerHTML}
            <h2 style="margin: 0 0 0.75rem 0; text-transform: uppercase; font-weight: 900; letter-spacing: -0.5px; font-size: 1.8rem; line-height: 1.1;">${title}</h2>
            ${actionBarHTML}
            
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem; line-height: 1.5;">${tmdbData.overview || 'Nessuna sinossi disponibile.'}</p>
            ${providersHTML}
            ${castHTML}
        `;
        
        // GESTIONE TITOLI GIA' TRACCIATI
        if (!isPreview) {
            const isFav = userSeries.is_favorite === true;
            const currentStatus = userSeries.status || (isMovie ? 'planned' : 'watching');
            const statusOptions = isMovie 
                ? `<option value="planned" ${currentStatus === 'planned' || currentStatus === 'watching' ? 'selected' : ''}>Da Vedere</option>
                   <option value="completed" ${currentStatus === 'completed' ? 'selected' : ''}>Visto</option>`
                : `<option value="watching" ${currentStatus === 'watching' ? 'selected' : ''}>In Corso / Da Vedere</option>
                   <option value="paused" ${currentStatus === 'paused' ? 'selected' : ''}>In Pausa</option>
                   <option value="completed" ${currentStatus === 'completed' ? 'selected' : ''}>Completata</option>`;

            html += `
                <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; background: var(--input-bg); padding: 0.75rem; border: 1.5px solid var(--text);">
                    <select id="status-select-${mediaId}" onchange="changeSeriesStatus(${mediaId}, this.value)" style="flex: 1; padding: 0.5rem; background: var(--card-bg); color: var(--text); border: 1px solid var(--border); border-radius: 4px; font-weight: 700; text-transform: uppercase; font-size: 0.8rem; outline: none;">
                        ${statusOptions}
                    </select>
                    <button onclick="toggleFavorite(${mediaId})" class="btn btn-outline" style="padding: 0.5rem 1rem; color: ${isFav ? 'var(--danger)' : 'var(--text-muted)'}; border-color: ${isFav ? 'var(--danger)' : 'var(--border)'};">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    </button>
                </div>
            `;

            if (isMovie) {
                const isWatched = userSeries.status === 'completed';
                
                if (!userSeries.rewatches) userSeries.rewatches = {};
                const rewatches = userSeries.rewatches['MOVIE'] || 0;
                const totalViews = isWatched ? 1 + rewatches : 0;
                let lastWatchedStr = 'Mai visto';
                
                if (isWatched && userSeries.progress['MOVIE']) {
                    const d = new Date(userSeries.progress['MOVIE']);
                    lastWatchedStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
                }

                let movieActionHTML = '';
                if (isWatched) {
                    movieActionHTML = `
                        <div style="display: flex; justify-content: space-between; background: var(--bg); padding: 0.75rem; border: 1px solid var(--border); border-radius: 4px; margin-bottom: 0.75rem; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted);">
                            <span>Ultima: <strong style="color: var(--text);">${lastWatchedStr}</strong></span>
                            <span>Visioni: <strong style="color: var(--text);">${totalViews}</strong></span>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-outline" style="flex: 1; border-color: var(--border); color: var(--text-muted); font-size: 0.75rem; font-weight: 800; padding: 0.4rem; border-radius: 20px; transition: all 0.2s;" onclick="toggleMovieWatched(${mediaId})">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.3rem;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                ANNULLA
                            </button>
                            <button class="btn btn-outline" style="flex: 1; border-color: var(--primary); color: var(--primary); font-size: 0.75rem; font-weight: 800; padding: 0.4rem; border-radius: 20px; transition: all 0.2s;" onclick="rewatchMovie(${mediaId})">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.3rem;"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                                RIVISTO
                            </button>
                        </div>
                    `;
                } else {
                    movieActionHTML = `
                        <button class="btn btn-outline" style="width: 100%; border-color: var(--success); color: var(--success); font-size: 0.75rem; font-weight: 800; padding: 0.4rem; border-radius: 20px; transition: all 0.2s; justify-content: center;" onclick="toggleMovieWatched(${mediaId})">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.4rem;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 8 12 12 15 15"></polyline></svg>
                            SEGNA COME VISTO
                        </button>
                    `;
                }

                html += `
                    <div style="border-top: 1.5px solid var(--border); border-bottom: 1.5px solid var(--border); padding: 1rem 0; margin-bottom: 1.5rem;">
                        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;">
                            <span style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Uscita: <span style="color: var(--text);">${tmdbData.release_date ? tmdbData.release_date.split('-').reverse().join('/') : 'TBA'}</span></span>
                            <span style="color: var(--border);">|</span>
                            <span style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Durata: <span style="color: var(--text);">${tmdbData.runtime ? `${tmdbData.runtime} min` : 'N/D'}</span></span>
                        </div>
                        ${movieActionHTML}
                    </div>
                `;
            } else {
                if (!tmdbData.detailed_seasons || Object.keys(tmdbData.detailed_seasons).length === 0) {
                    html += `
                        <div class="card" style="border-color: var(--danger); display: flex; align-items: center; gap: 1rem; padding: 1.5rem;">
                            <div style="width: 24px; height: 24px; border: 3px solid var(--danger); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; flex-shrink: 0;"></div>
                            <p style="color: var(--danger); font-weight: 800; margin:0; font-size: 0.95rem; line-height: 1.3;">Sincronizzazione in corso...<br><span style="font-size: 0.8rem; font-weight: 600; opacity: 0.8;">Attendi qualche secondo.</span></p>
                        </div>
                    `;
                } else {
                    const today = new Date().toISOString().split('T')[0];
                    for (const [seasonNum, seasonData] of Object.entries(tmdbData.detailed_seasons)) {
                        const bodyId = `season-body-${mediaId}-${seasonNum}`;
                        let watchedEpsInSeason = 0;
                        const totalSeasonEps = seasonData.episodes ? seasonData.episodes.length : 0;

                        if (seasonData.episodes) {
                            for (const ep of seasonData.episodes) {
                                const epKey = `S${String(seasonNum).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;
                                if (userSeries.progress && userSeries.progress[epKey]) watchedEpsInSeason++;
                            }
                        }

                        const isSeasonCompleted = totalSeasonEps > 0 && watchedEpsInSeason >= totalSeasonEps;
                        
                        html += `
                            <div style="border: 1.5px solid var(--text); border-left: 8px solid ${isSeasonCompleted ? 'var(--success)' : 'var(--primary)'}; background: var(--card-bg); margin-bottom: 1rem; opacity: ${isSeasonCompleted ? '0.6' : '1'};">
                                <div onclick="toggleSeasonPanel(${mediaId}, ${seasonNum}, '${bodyId}')" style="padding: 1.25rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                                    <div>
                                        <strong style="font-size: 1.2rem; text-transform: uppercase; display: block; color: ${isSeasonCompleted ? 'var(--text-muted)' : 'var(--text)'};">Stagione ${seasonNum}</strong>
                                        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 800; margin-top: 0.3rem;">${watchedEpsInSeason}/${totalSeasonEps} EPISODI</div>
                                    </div>
                                    ${isSeasonCompleted ? `<span style="font-size: 0.8rem; font-weight: 900; color: var(--success);">✓ COMPLETATA</span>` : `<button class="btn btn-outline btn-small" style="font-size: 0.7rem; font-weight: 800;" onclick="event.stopPropagation(); markSeasonWatched(${mediaId}, ${seasonNum})">COMPLETA STAGIONE</button>`}
                                </div>
                                <div id="${bodyId}" style="display: none; border-top: 1.5px solid var(--text); padding: 0 1.25rem;">
                        `;
                        
                        if (seasonData.episodes && seasonData.episodes.length > 0) {
                            let firstUnwatchedFound = false;
                            seasonData.episodes.forEach((ep, i) => {
                                const epKey = `S${String(seasonNum).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;
                                const isWatched = userSeries.progress && userSeries.progress[epKey];
                                const isFuture = ep.air_date && ep.air_date > today;
                                const dateStr = ep.air_date ? ep.air_date.split('-').reverse().join('/') : "TBA";
                                
                                let rowIdAttr = '';
                                if (!isWatched && !firstUnwatchedFound && !isFuture) {
                                    rowIdAttr = `id="first-unwatched-${mediaId}-${seasonNum}"`;
                                    firstUnwatchedFound = true;
                                }

                                let actionBtnHTML = isFuture && !isWatched 
                                    ? `<button class="btn btn-outline" style="width: 36px; height: 36px; padding: 0; flex-shrink: 0; opacity: 0.4; border-radius: 50%;" disabled><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></button>`
                                    : (isWatched ? `<button class="btn btn-success" style="width: 36px; height: 36px; padding: 0; flex-shrink: 0; border-radius: 50%;" onclick="event.stopPropagation(); toggleEpisode(${mediaId}, '${epKey}')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>` : `<button class="btn btn-outline" style="width: 36px; height: 36px; padding: 0; flex-shrink: 0; border-radius: 50%; color: var(--text-muted);" onclick="event.stopPropagation(); toggleEpisode(${mediaId}, '${epKey}')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg></button>`);

                                html += `
                                    <div ${rowIdAttr} style="display: flex; gap: 0.75rem; align-items: center; padding: 1rem 0; ${i === seasonData.episodes.length - 1 ? '' : 'border-bottom: 1px solid var(--border);'} opacity: ${isWatched ? '0.5' : '1'}; cursor: pointer;" onclick="openEpisodeDetails(${mediaId}, ${seasonNum}, ${ep.episode_number})">
                                        <img src="${ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : 'https://placehold.co/300x170/27272a/a1a1aa?text=TBA'}" style="width: 100px; height: 56px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border); flex-shrink: 0; filter: ${isWatched ? 'grayscale(100%)' : 'none'};">
                                        <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0;">
                                            <span style="display: block; font-size: 0.95rem; font-weight: 800; color: ${isWatched ? 'var(--text-muted)' : 'var(--text)'}; text-decoration: ${isWatched ? 'line-through' : 'none'}; line-height: 1.2; margin-bottom: 0.3rem;"><span style="color: var(--text-muted); margin-right: 0.1rem;">${ep.episode_number}.</span> ${ep.name}</span>
                                            <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">${dateStr}</span>
                                        </div>
                                        <div style="flex-shrink: 0; padding-left: 0.5rem;">${actionBtnHTML}</div>
                                    </div>
                                `;
                            });
                        } else {
                            html += `<div style="padding: 1.25rem 0; color: var(--text-muted);">Nessun episodio.</div>`;
                        }
                        html += `</div></div>`;
                    }
                }
            }
        }
        
        html += recommendationsHTML; 
        detailContent.innerHTML = html;

    } catch (error) {
        console.error(error);
        detailContent.innerHTML = '<span style="color: var(--danger);">Errore critico nella lettura della cache. Controlla la console.</span>';
    }
}

async function openEpisodeDetails(tvId, seasonNum, epNum) {
    try {
        const tmdbData = await TmdbCache.getItem(String(tvId));
        const userSeries = await UserLibrary.getItem(String(tvId)) || { progress: {}, rewatches: {} };
        
        if (!tmdbData || !tmdbData.detailed_seasons || !tmdbData.detailed_seasons[seasonNum]) return;
        
        const seasonData = tmdbData.detailed_seasons[seasonNum];
        const ep = seasonData.episodes.find(e => e.episode_number === epNum);
        if (!ep) return;

        // Assicurazione dell'esistenza degli oggetti
        if (!userSeries.progress) userSeries.progress = {};
        if (!userSeries.rewatches) userSeries.rewatches = {};

        // CALCOLO TELEMETRIA UTENTE
        const epKey = `S${String(seasonNum).padStart(2, '0')}E${String(epNum).padStart(2, '0')}`;
        const isWatched = !!userSeries.progress[epKey];
        const lastWatchedTs = userSeries.progress[epKey];
        const rewatchCount = userSeries.rewatches[epKey] || 0;
        const totalViews = isWatched ? 1 + rewatchCount : 0;

        // Dati TMDB
        const stillUrl = ep.still_path ? `https://image.tmdb.org/t/p/w780${ep.still_path}` : 'https://placehold.co/780x440/27272a/a1a1aa?text=TBA';
        const dateStr = ep.air_date ? ep.air_date.split('-').reverse().join('/') : "TBA";
        const vote = ep.vote_average ? ep.vote_average.toFixed(1) : 'N/D';
        const runtime = ep.runtime ? `${ep.runtime} min` : (tmdbData.episode_run_time && tmdbData.episode_run_time[0] ? `${tmdbData.episode_run_time[0]} min` : 'N/D');

        let statsHTML = '';
        if (isWatched) {
            const d = new Date(lastWatchedTs);
            const userDateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            statsHTML = `
                <div style="display: flex; justify-content: space-between; background: var(--bg); padding: 0.75rem; border: 1px solid var(--border); border-radius: 4px; margin-bottom: 1.5rem; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted);">
                    <span>Ultima: <strong style="color: var(--text);">${userDateStr}</strong></span>
                    <span>Visioni: <strong style="color: var(--text);">${totalViews}</strong></span>
                </div>
            `;
        }

        let actionButtonsHTML = '';
        if (isWatched) {
            actionButtonsHTML = `
                <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
                    <button class="btn btn-outline" style="flex: 1; font-weight: 800; border-color: var(--border); color: var(--text-muted);" onclick="handleEpisodeAction('${tvId}', ${seasonNum}, ${epNum}, 'non_visto')">
                        Non Visto
                    </button>
                    <button class="btn btn-outline" style="flex: 1; font-weight: 800; border-color: var(--primary); color: var(--primary);" onclick="handleEpisodeAction('${tvId}', ${seasonNum}, ${epNum}, 'rivisto')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.3rem;"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                        Rivisto
                    </button>
                </div>
            `;
        } else {
            actionButtonsHTML = `
                <div style="margin-top: 1.5rem;">
                    <button class="btn btn-outline" style="width: 100%; font-weight: 800; border-color: var(--success); color: var(--success); display: flex; justify-content: center;" onclick="handleEpisodeAction('${tvId}', ${seasonNum}, ${epNum}, 'visto')">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.4rem;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        Segna come Visto
                    </button>
                </div>
            `;
        }

        const modal = document.getElementById('modal-episode');
        const content = document.getElementById('modal-episode-content');

        content.innerHTML = `
            <img src="${stillUrl}" style="width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; border-bottom: 2px solid var(--text);">
            <div style="padding: 1.5rem;">
                <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem;">
                    Stagione ${seasonNum} • Episodio ${epNum}
                </div>
                <h3 style="margin-top: 0; margin-bottom: 1rem; font-size: 1.5rem; line-height: 1.1; color: var(--text);">${ep.name}</h3>
                
                <div style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">
                    <div style="display: flex; align-items: center; gap: 0.3rem;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>${dateStr}</div>
                    <div style="display: flex; align-items: center; gap: 0.3rem;"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #f59e0b;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>${vote}</div>
                    <div style="display: flex; align-items: center; gap: 0.3rem;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${runtime}</div>
                </div>
                
                ${statsHTML}
                <p style="color: var(--text); font-size: 0.95rem; line-height: 1.6; margin: 0;">${ep.overview || 'Nessuna sinossi disponibile per questo episodio nel database TMDB.'}</p>
                ${actionButtonsHTML}
            </div>
        `;
        
        modal.classList.add('active');
    } catch (e) {
        console.error("Fallimento apertura dettaglio episodio:", e);
    }
}

function closeEpisodeModal(event, force = false) {
    if (force || event.target.id === 'modal-episode') {
        document.getElementById('modal-episode').classList.remove('active');
    }
}

async function toggleEpisode(tvId, epKey) {
    try {
        const userSeries = await UserLibrary.getItem(String(tvId));
        const tmdbData = await TmdbCache.getItem(String(tvId));
        
        if (!userSeries.progress) userSeries.progress = {};
        const isWatched = !!userSeries.progress[epKey];

        const match = epKey.match(/S(\d+)E(\d+)/);
        if (!match || !tmdbData || !tmdbData.detailed_seasons) return;
        
        const targetS = parseInt(match[1], 10);
        const targetE = parseInt(match[2], 10);
        const today = new Date().toISOString().split('T')[0];
        let missingEpisodes = []; // Hoisted per poter decidere il tipo di re-render

        if (!isWatched) {
            // FASE 1: RADAR DEGLI EPISODI PRECEDENTI
            for (const [sNumStr, seasonData] of Object.entries(tmdbData.detailed_seasons)) {
                const sNum = parseInt(sNumStr, 10);
                if (sNum > targetS) continue; // Ignora le stagioni future
                
                if (seasonData.episodes) {
                    for (const ep of seasonData.episodes) {
                        const eNum = ep.episode_number;
                        // Verifica la precedenza logica assoluta
                        if (sNum < targetS || (sNum === targetS && eNum < targetE)) {
                            const prevEpKey = `S${String(sNum).padStart(2, '0')}E${String(eNum).padStart(2, '0')}`;
                            // Rileva anomalie (episodio uscito ma non tracciato)
                            if (!userSeries.progress[prevEpKey] && (!ep.air_date || ep.air_date <= today)) {
                                let rTime = ep.runtime || (tmdbData.episode_run_time && tmdbData.episode_run_time[0]) || 45;
                                missingEpisodes.push({ key: prevEpKey, runtime: rTime });
                            }
                        }
                    }
                }
            }

            // FASE 2: RECUPERO (CATCH-UP) TRAMITE MODALE CUSTOM
            if (missingEpisodes.length > 0) {
                const confirmCatchup = await customConfirm(
                `Hai lasciato ${missingEpisodes.length} episodi precedenti non visti. Vuoi segnare come visti anche tutti quelli prima di questo?`, 
                { title: "Recupero Episodi", confirmText: "Segna Visti", isDestructive: false }
            );
                
                if (confirmCatchup) {
                    for (const missing of missingEpisodes) {
                        userSeries.progress[missing.key] = Date.now();
                        userSeries.watched_count = (userSeries.watched_count || 0) + 1;
                        userSeries.watched_minutes = (userSeries.watched_minutes || 0) + missing.runtime;
                    }
                }
            }

            // FASE 3: SALVATAGGIO DELL'OBIETTIVO PRINCIPALE
            let epRuntime = 45;
            const epData = tmdbData.detailed_seasons[targetS]?.episodes?.find(e => e.episode_number === targetE);
            if (epData && epData.runtime) epRuntime = epData.runtime;
            else if (tmdbData.episode_run_time && tmdbData.episode_run_time[0]) epRuntime = tmdbData.episode_run_time[0];

            userSeries.progress[epKey] = Date.now();
            userSeries.watched_count = (userSeries.watched_count || 0) + 1;
            userSeries.watched_minutes = (userSeries.watched_minutes || 0) + epRuntime;

        } else {
            // FASE 4: RIMOZIONE SPUNTA E DECLASSAMENTO
            let epRuntime = 45;
            const epData = tmdbData.detailed_seasons[targetS]?.episodes?.find(e => e.episode_number === targetE);
            if (epData && epData.runtime) epRuntime = epData.runtime;
            else if (tmdbData.episode_run_time && tmdbData.episode_run_time[0]) epRuntime = tmdbData.episode_run_time[0];

            delete userSeries.progress[epKey];
            userSeries.watched_count = Math.max(0, (userSeries.watched_count || 0) - 1);
            userSeries.watched_minutes = Math.max(0, (userSeries.watched_minutes || 0) - epRuntime);
            
            if (userSeries.status === 'completed') {
                userSeries.status = 'watching';
                console.log(`[SYS] Serie ${tvId} declassata da completata a in corso.`);
            }
        }

        // Chiusura Transazione Database
        await UserLibrary.setItem(String(tvId), userSeries);
        
        const isCompletedNow = await checkAutoCompletion(tvId);
        
        // FASE 5: DECISIONE DI RENDERING - Allineamento assoluto con il Database
        
        // 1. Fotografa lo stato attuale dell'interfaccia (quali stagioni l'utente sta guardando)
        const openPanels = [];
        document.querySelectorAll('div[id^="season-body-"]').forEach(panel => {
            if (panel.style.display === 'block') {
                openPanels.push(panel.id);
            }
        });

        // 2. Rade al suolo e ricostruisce l'intera vista con i calcoli aggiornati
        await openDetailView(tvId); 

        // 3. Ripristina l'apertura delle tendine esattamente come l'utente le aveva lasciate
        setTimeout(() => {
            openPanels.forEach(id => {
                const panel = document.getElementById(id);
                if (panel) panel.style.display = 'block';
            });
        }, 50);
    } catch (error) {
        console.error("[CRITICO] Fallimento salvataggio progresso:", error);
    }
}

async function toggleMovieWatched(mediaId) {
    try {
        const userSeries = await UserLibrary.getItem(String(mediaId));
        const tmdbData = await TmdbCache.getItem(String(mediaId));
        
        if (!userSeries || !tmdbData) return;

        const isCurrentlyWatched = userSeries.status === 'completed';
        const runtime = tmdbData.runtime || 120; // Fallback di sicurezza a 2 ore

        if (isCurrentlyWatched) {
            // Retrocessione a "Da vedere"
            userSeries.status = 'planned'; 
            userSeries.watched_count = 0;
            userSeries.watched_minutes = 0;
        } else {
            // Promozione a Visto
            userSeries.status = 'completed';
            userSeries.watched_count = 1;
            userSeries.watched_minutes = runtime;
            
            // Salviamo un finto progresso per uniformità database (utile per ordinamenti futuri)
            if(!userSeries.progress) userSeries.progress = {};
            userSeries.progress['MOVIE'] = Date.now(); 
        }

        await UserLibrary.setItem(String(mediaId), userSeries);
        openDetailView(mediaId); // Ricarica la vista istantaneamente
        
    } catch (error) {
        console.error("[CRITICO] Errore in toggleMovieWatched:", error);
    }
}

async function removeSeries(tvId) {
    const confirmation = await customConfirm("Vuoi davvero eliminare questa serie e tutti i suoi progressi dalla tua libreria?");
    if (!confirmation) return;

    try {
        await UserLibrary.removeItem(String(tvId));
        await TmdbCache.removeItem(String(tvId));
        
        console.log(`[SYS] Serie ${tvId} annientata con successo.`);
        switchTab('library');
    } catch (error) {
        console.error("[CRITICO] Fallimento durante l'eliminazione:", error);
        await customAlert("Errore critico durante la rimozione dal database.");
    }
}

// ==========================================
// GESTIONE STATO E PREFERITI
// ==========================================

async function changeSeriesStatus(mediaId, newStatus) {
    try {
        const userSeries = await UserLibrary.getItem(String(mediaId));
        if (!userSeries) return;
        
        const tmdbData = await TmdbCache.getItem(String(mediaId));
        const isMovie = tmdbData && tmdbData.media_type === 'movie';
        
        if (newStatus === 'completed') {
            if (!userSeries.progress) userSeries.progress = {};
            
            if (isMovie) {
                // Logica completamento Film
                userSeries.progress['MOVIE'] = Date.now();
                userSeries.watched_count = 1;
                userSeries.watched_minutes = tmdbData.runtime || 120;
            } else if (tmdbData && tmdbData.detailed_seasons) {
                // Logica completamento Serie (ciclo stagioni ed episodi)
                for (const [seasonNum, seasonData] of Object.entries(tmdbData.detailed_seasons)) {
                    if (seasonData.episodes) {
                        for (const ep of seasonData.episodes) {
                            const epKey = `S${String(seasonNum).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;
                            if (!userSeries.progress[epKey]) {
                                userSeries.progress[epKey] = Date.now();
                                userSeries.watched_count = (userSeries.watched_count || 0) + 1;
                                let epRuntime = ep.runtime || (tmdbData.episode_run_time && tmdbData.episode_run_time[0]) || 45;
                                userSeries.watched_minutes = (userSeries.watched_minutes || 0) + epRuntime;
                            }
                        }
                    }
                }
            }
        } else if (newStatus === 'planned' && isMovie) {
             // Reset del film se si passa a Da Vedere
             userSeries.progress = {};
             userSeries.watched_count = 0;
             userSeries.watched_minutes = 0;
        }

        userSeries.status = newStatus;
        await UserLibrary.setItem(String(mediaId), userSeries);
        
        if (window.currentOpenTvId === String(mediaId)) openDetailView(mediaId);
        else renderHome();
        
    } catch (error) {
        console.error("[CRITICO] Fallimento cambio stato:", error);
    }
}

// Analizza la discrepanza tra episodi visti e totali esigibili per auto-completare la serie
async function checkAutoCompletion(tvId) {
    try {
        const userSeries = await UserLibrary.getItem(String(tvId));
        const tmdbData = await TmdbCache.getItem(String(tvId));

        if (!userSeries || !tmdbData || !tmdbData.detailed_seasons) return false;
        if (!userSeries.progress) userSeries.progress = {};

        let expectedEpisodes = 0;
        const today = new Date().toISOString().split('T')[0];

        // 1. Calcolo Infallibile del Target (Escludendo il futuro)
        for (const [seasonNum, seasonData] of Object.entries(tmdbData.detailed_seasons)) {
            if (seasonData.episodes) {
                for (const ep of seasonData.episodes) {
                    const epKey = `S${String(seasonNum).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;
                    
                    // L'episodio fa statistica SOLO se è già andato in onda 
                    // OPPURE se non ha data ma tu lo hai spuntato forzatamente.
                    if ((ep.air_date && ep.air_date <= today) || userSeries.progress[epKey]) {
                        expectedEpisodes++;
                    }
                }
            }
        }

        // 2. La VERA conta contabile (nessuna fiducia nei contatori incrementali)
        const actualWatched = Object.keys(userSeries.progress).length;

        // Auto-riparazione silenziosa: se il contatore numerico si è corrotto in passato, sistemalo.
        if (userSeries.watched_count !== actualWatched) {
            console.warn(`[SYS] Correzione database per ${tvId}: Contatore sballato riparato (${userSeries.watched_count} -> ${actualWatched})`);
            userSeries.watched_count = actualWatched;
        }

        let statusChanged = false;

        // 3. Diramazione Operativa
        if (expectedEpisodes > 0 && actualWatched >= expectedEpisodes) {
            // PROMOZIONE
            if (userSeries.status !== 'completed') {
                userSeries.status = 'completed';
                console.log(`[SYS] Promozione: ${tmdbData.name} -> COMPLETATA (${actualWatched}/${expectedEpisodes})`);
                statusChanged = true;
            }
        } else if (userSeries.status === 'completed' && actualWatched < expectedEpisodes) {
            // DECLASSAMENTO (Se aggiungono nuovi episodi o ne deselezioni uno)
            userSeries.status = 'watching';
            console.log(`[SYS] Declassamento: ${tmdbData.name} -> IN CORSO (Mancano episodi)`);
            statusChanged = true;
        }

        // 4. Chiusura Transazione
        await UserLibrary.setItem(String(tvId), userSeries);
        return statusChanged;

    } catch (e) {
        console.error("[CRITICO] Fallimento in checkAutoCompletion:", e);
        return false;
    }
}

async function toggleFavorite(tvId) {
    try {
        const userSeries = await UserLibrary.getItem(String(tvId));
        if (!userSeries) return;
        
        userSeries.is_favorite = !userSeries.is_favorite;
        await UserLibrary.setItem(String(tvId), userSeries);
        
        console.log(`[SYS] Preferito aggiornato per ${tvId}: ${userSeries.is_favorite}`);
        
        // Ricarica chirurgicamente solo la vista dettaglio per aggiornare l'icona
        openDetailView(tvId);
    } catch (error) {
        console.error("[CRITICO] Fallimento aggiornamento preferito:", error);
    }
}

// Motore centrale per le azioni dirette dal Modale Episodio
async function handleEpisodeAction(tvId, sNum, eNum, action) {
    try {
        const userSeries = await UserLibrary.getItem(String(tvId));
        const tmdbData = await TmdbCache.getItem(String(tvId));
        const epKey = `S${String(sNum).padStart(2, '0')}E${String(eNum).padStart(2, '0')}`;
        
        let epRuntime = 45;
        if (tmdbData && tmdbData.detailed_seasons && tmdbData.detailed_seasons[sNum]) {
            const epData = tmdbData.detailed_seasons[sNum].episodes.find(e => e.episode_number === eNum);
            if (epData && epData.runtime) epRuntime = epData.runtime;
            else if (tmdbData.episode_run_time && tmdbData.episode_run_time[0]) epRuntime = tmdbData.episode_run_time[0];
        }

        if (!userSeries.progress) userSeries.progress = {};
        if (!userSeries.rewatches) userSeries.rewatches = {}; // Inizializza il registro delle revisioni

        if (action === 'visto') {
            if (!userSeries.progress[epKey]) {
                userSeries.progress[epKey] = Date.now();
                userSeries.watched_count = (userSeries.watched_count || 0) + 1;
                userSeries.watched_minutes = (userSeries.watched_minutes || 0) + epRuntime;
            }
        } else if (action === 'non_visto') {
            if (userSeries.progress[epKey]) {
                delete userSeries.progress[epKey];
                userSeries.watched_count = Math.max(0, (userSeries.watched_count || 0) - 1);
                
                // Sottrae il tempo calcolando anche quante volte lo avevi rivisto
                const rewCount = userSeries.rewatches[epKey] || 0;
                userSeries.watched_minutes = Math.max(0, (userSeries.watched_minutes || 0) - (epRuntime * (1 + rewCount)));
                delete userSeries.rewatches[epKey];
                
                if (userSeries.status === 'completed') userSeries.status = 'watching';
            }
        } else if (action === 'rivisto') {
            if (userSeries.progress[epKey]) {
                userSeries.progress[epKey] = Date.now(); // Aggiorna la data all'ultima visione
                userSeries.rewatches[epKey] = (userSeries.rewatches[epKey] || 0) + 1;
                userSeries.watched_minutes = (userSeries.watched_minutes || 0) + epRuntime;
            }
        }

        await UserLibrary.setItem(String(tvId), userSeries);
        await checkAutoCompletion(tvId);

        // Ri-proietta le informazioni aggiornate istantaneamente nel Modale
        await openEpisodeDetails(tvId, sNum, eNum);

        // Aggiorna l'UI sottostante senza perdere il contesto visivo
        if (currentContext === 'home') renderHome();
        else if (currentContext === 'detail') {
            const openPanels = [];
            document.querySelectorAll('div[id^="season-body-"]').forEach(panel => {
                if (panel.style.display === 'block') openPanels.push(panel.id);
            });
            await openDetailView(tvId);
            setTimeout(() => { openPanels.forEach(id => { const p = document.getElementById(id); if(p) p.style.display = 'block'; }); }, 50);
        }

    } catch (error) {
        console.error("[CRITICO] Fallimento gestione episodio dal modale:", error);
    }
}

// Funzione specifica per i Film
async function rewatchMovie(mediaId) {
    try {
        const userSeries = await UserLibrary.getItem(String(mediaId));
        const tmdbData = await TmdbCache.getItem(String(mediaId));
        if (!userSeries || !tmdbData) return;

        const runtime = tmdbData.runtime || 120;
        if (!userSeries.rewatches) userSeries.rewatches = {};
        
        userSeries.progress['MOVIE'] = Date.now();
        userSeries.rewatches['MOVIE'] = (userSeries.rewatches['MOVIE'] || 0) + 1;
        userSeries.watched_minutes = (userSeries.watched_minutes || 0) + runtime;

        await UserLibrary.setItem(String(mediaId), userSeries);
        openDetailView(mediaId); 
    } catch (error) {
        console.error(error);
    }
}

// ==========================================
// CUSTOM MODALS (ALERT & CONFIRM)
// ==========================================

function customConfirm(message, options = {}) {
    // Valori di default settati per operazioni distruttive (es. Elimina)
    const {
        title = "Azione Irreversibile",
        confirmText = "Elimina",
        isDestructive = true
    } = options;

    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirm');
        const card = modal.querySelector('.modal-card');
        const titleEl = modal.querySelector('h3');
        const msgEl = document.getElementById('modal-confirm-message');
        const btnOk = document.getElementById('btn-confirm-ok');
        const btnCancel = document.getElementById('btn-confirm-cancel');

        titleEl.innerText = title;
        msgEl.innerText = message;
        btnOk.innerText = confirmText;

        // Iniezione dinamica della semantica visiva
        if (isDestructive) {
            card.style.borderColor = 'var(--danger)';
            titleEl.style.color = 'var(--danger)';
            btnOk.className = 'btn btn-danger';
        } else {
            card.style.borderColor = 'var(--text)';
            titleEl.style.color = 'var(--text)';
            btnOk.className = 'btn btn-success';
        }

        modal.classList.add('active');

        const cleanup = () => {
            modal.classList.remove('active');
            btnOk.removeEventListener('click', onOk);
            btnCancel.removeEventListener('click', onCancel);
        };

        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
    });
}

function customAlert(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirm');
        const card = modal.querySelector('.modal-card');
        const titleEl = modal.querySelector('h3');
        const msgEl = document.getElementById('modal-confirm-message');
        const btnOk = document.getElementById('btn-confirm-ok');
        const btnCancel = document.getElementById('btn-confirm-cancel');

        titleEl.innerText = "Informazione";
        msgEl.innerText = message;
        
        card.style.borderColor = 'var(--text)';
        titleEl.style.color = 'var(--text)';
        
        btnCancel.style.display = 'none';
        btnOk.innerText = 'OK';
        btnOk.className = 'btn btn-success';

        modal.classList.add('active');

        const cleanup = () => {
            modal.classList.remove('active');
            btnOk.removeEventListener('click', onOk);
            btnCancel.style.display = 'block'; // Ripristina il bottone per i futuri confirm
        };

        const onOk = () => { cleanup(); resolve(); };
        btnOk.addEventListener('click', onOk);
    });
}

// ==========================================
// MOTORE DI BACKUP E RIPRISTINO
// ==========================================

async function exportData() {
    try {
        const userKeys = await UserLibrary.keys();
        const tmdbKeys = await TmdbCache.keys();
        
        const exportObj = {
            user_library: {},
            tmdb_cache: {}
        };
        
        for (const key of userKeys) {
            exportObj.user_library[key] = await UserLibrary.getItem(key);
        }
        for (const key of tmdbKeys) {
            exportObj.tmdb_cache[key] = await TmdbCache.getItem(key);
        }
        
        const jsonString = JSON.stringify(exportObj);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.href = url;
        downloadAnchorNode.download = `thisplay_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(downloadAnchorNode); 
        downloadAnchorNode.click();
        
        setTimeout(() => {
            document.body.removeChild(downloadAnchorNode);
            URL.revokeObjectURL(url);
        }, 150);
        
        await customAlert("Backup completo (Progressi + Dati TMDB) esportato con successo. Conserva questo file al sicuro.");
    } catch (error) {
        console.error("[CRITICO] Errore durante l'esportazione:", error);
        await customAlert("Fallimento critico durante la creazione del backup.");
    }
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (typeof importedData !== 'object' || importedData === null) throw new Error("Formato JSON non valido");

            const isNewFormat = importedData.user_library && importedData.tmdb_cache;
            const isOldFormat = !isNewFormat && Object.keys(importedData).length > 0 && importedData[Object.keys(importedData)[0]].status !== undefined;

            if (!isNewFormat && !isOldFormat) throw new Error("Struttura dati non riconosciuta");

            const confermato = await customConfirm(
                "Vuoi sovrascrivere il database attuale con questo backup? I dati presenti sul dispositivo verranno annientati.", 
                { title: "Ripristino Irreversibile", confirmText: "Sovrascrivi", isDestructive: true }
            );

            if (!confermato) {
                event.target.value = ''; 
                return;
            }

            await UserLibrary.clear();

            if (isNewFormat) {
                await TmdbCache.clear();
                
                let counter = 0;
                for (const [key, value] of Object.entries(importedData.user_library)) {
                    // SANIFICAZIONE DATI: Vaccinazione retroattiva per i vecchi backup
                    if (!value.media_type) value.media_type = 'tv';
                    await UserLibrary.setItem(key, value);
                    if (++counter % 5 === 0) await sleep(50); 
                }
                
                counter = 0;
                for (const [key, value] of Object.entries(importedData.tmdb_cache)) {
                    // SANIFICAZIONE DATI: Vaccinazione cache
                    if (!value.media_type) value.media_type = 'tv';
                    await TmdbCache.setItem(key, value);
                    if (++counter % 3 === 0) await sleep(100); 
                }
            } else {
                for (const [key, value] of Object.entries(importedData)) {
                    // SANIFICAZIONE DATI: Vaccinazione formati legacy
                    if (!value.media_type) value.media_type = 'tv';
                    await UserLibrary.setItem(key, value);
                }
                console.warn("[SYS] Importato backup legacy. La TmdbCache dovrà essere ricostruita via rete.");
            }

            await customAlert("Backup ripristinato con successo! L'interfaccia si ricaricherà ora.");
            event.target.value = ''; 
            
            switchTab('home'); 

        } catch (error) {
            console.error("[CRITICO] Errore durante l'importazione:", error);
            await customAlert("Il file selezionato è corrotto o non è un backup valido di ThisPlay.");
            event.target.value = ''; 
        }
    };
    
    reader.readAsText(file);
}

// ==========================================
// PONTE DI MIGRAZIONE TV TIME
// ==========================================

async function handleTVTimeZip(event) {
    const file = event.target.files[0];
    if (!file) return;

    const loader = document.getElementById('global-loader');
    const loaderText = loader.querySelector('strong');
    const originalLoaderText = loaderText.innerText;

    loaderText.innerText = "MIGRAZIONE IN CORSO...\nATTENDI, PUÒ RICHIEDERE MINUTI.";
    loader.classList.add('active');

    try {
        const migrator = new TVTimeMigrator();
        const report = await migrator.processZip(file); // Intercetta il report generato
        
        // 1. Spegne il loader PRIMA di mostrare l'alert per evitare sovrapposizioni z-index
        loader.classList.remove('active');
        
        // 2. Costruisce il resoconto completo
        let message = `Migrazione completata!\n\n✅ Trasferiti: ${report.successCount}\n❌ Non trovati: ${report.failCount}`;
        
        if (report.failCount > 0) {
            const limit = 10;
            const preview = report.failedShows.slice(0, limit).map(s => `- ${s}`).join('\n');
            const extra = report.failCount > limit ? `\n...e altri ${report.failCount - limit}` : '';
            message += `\n\nTitoli da aggiungere manualmente:\n${preview}${extra}`;
        }
        
        // 3. Mostra l'esito finale all'utente
        await customAlert(message);
        
        if (currentContext === 'library') renderLibrary();
        else switchTab('home');
        
    } catch (error) {
        console.error("[CRITICO] Fallimento nell'importazione TV Time:", error);
        loader.classList.remove('active'); // Sicurezza z-index
        await customAlert("Errore fatale durante la migrazione: " + error.message);
    } finally {
        event.target.value = ''; 
        loaderText.innerText = originalLoaderText;
        loader.classList.remove('active');
    }
}

// ==========================================
// MOTORE UI E NAVIGAZIONE
// ==========================================

const currentTheme = localStorage.getItem('tvTheme') || 'dark';
document.documentElement.setAttribute('data-theme', currentTheme);

// Sincronizza immediatamente il colore della barra di stato del telefono all'avvio
const metaThemeColor = document.getElementById('theme-color-meta');
if (metaThemeColor) {
    metaThemeColor.setAttribute('content', currentTheme === 'dark' ? '#18181b' : '#ffffff');
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('tvTheme', newTheme);
    updateSettingsUI();
}

function switchTab(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');
    
    // Aggiornato: Punta alla nuova barra inferiore
    document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
    const targetNav = document.getElementById(`nav-${viewId}`);
    if (targetNav) targetNav.classList.add('active');

    if (viewId === 'library') renderLibrary();
    if (viewId === 'home') renderHome();
    if (viewId === 'stats') renderStats();
    if (viewId === 'search') loadDiscovery(); 
    
    window.scrollTo(0, 0);
}

function openSettings() {
    updateSettingsUI();
    document.getElementById('modal-settings').classList.add('active');
}

function closeSettings(event, force = false) {
    if (force || event.target.id === 'modal-settings') {
        document.getElementById('modal-settings').classList.remove('active');
    }
}

function updateSettingsUI() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const btn = document.getElementById('btn-toggle-theme');
    
    // Cambia dinamicamente la barra di stato nativa di iOS/Android
    const metaThemeColor = document.getElementById('theme-color-meta');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', isDark ? '#18181b' : '#ffffff');
    }

    if (btn) {
        btn.innerText = isDark ? 'ON' : 'OFF';
        btn.style.borderColor = isDark ? 'var(--text)' : 'var(--border)';
        btn.style.color = isDark ? 'var(--card-bg)' : 'var(--text-muted)';
        btn.style.background = isDark ? 'var(--text)' : 'transparent';
    }
}

// Motore per smarcare un'intera stagione con una singola transazione
async function markSeasonWatched(tvId, seasonNum) {
    const confirmation = await customConfirm(
    `Vuoi segnare come visti tutti gli episodi della Stagione ${seasonNum}?`, 
    { title: "Completa Stagione", confirmText: "Conferma", isDestructive: false }
);
    if (!confirmation) return;

    try {
        const userSeries = await UserLibrary.getItem(String(tvId));
        const tmdbData = await TmdbCache.getItem(String(tvId));
        if (!userSeries || !tmdbData || !tmdbData.detailed_seasons) return;
        
        if (!userSeries.progress) userSeries.progress = {};
        
        const seasonData = tmdbData.detailed_seasons[seasonNum];
        if (!seasonData || !seasonData.episodes) return;

        const today = new Date().toISOString().split('T')[0];
        let modified = false;

        for (const ep of seasonData.episodes) {
            const epKey = `S${String(seasonNum).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;
            
            // Applica la spunta solo se non esiste già e se l'episodio è esigibile
            if (!userSeries.progress[epKey] && (!ep.air_date || ep.air_date <= today)) {
                userSeries.progress[epKey] = Date.now();
                userSeries.watched_count = (userSeries.watched_count || 0) + 1;
                let epRuntime = ep.runtime || (tmdbData.episode_run_time && tmdbData.episode_run_time[0]) || 45;
                userSeries.watched_minutes = (userSeries.watched_minutes || 0) + epRuntime;
                modified = true;
            }
        }

        if (modified) {
            await UserLibrary.setItem(String(tvId), userSeries);
            await checkAutoCompletion(tvId); 
            openDetailView(tvId); // Esegue il re-render totale per aggiornare visivamente le spunte
            console.log(`[SYS] Stagione ${seasonNum} completata massivamente.`);
        }
    } catch (error) {
        console.error("[CRITICO] Errore in markSeasonWatched:", error);
    }
}

// Motore di apertura pannelli con Auto-Scroll intelligente
function toggleSeasonPanel(tvId, seasonNum, bodyId) {
    const panel = document.getElementById(bodyId);
    if (!panel) return;
    
    const isOpening = panel.style.display === 'none';
    panel.style.display = isOpening ? 'block' : 'none';
    
    if (isOpening) {
        // Diamo al DOM il tempo di renderizzare il display:block prima di calcolare l'altezza
        setTimeout(() => {
            const target = document.getElementById(`first-unwatched-${tvId}-${seasonNum}`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 50);
    }
}

function navigateBack() {
    // 1. Usa la tua funzione nativa per riportare l'interfaccia alla vista corretta
    switchTab(currentContext);

    // 2. Se stiamo tornando alla ricerca, ripristina i dati
    if (currentContext === 'search') {
        const searchInput = document.getElementById('search-input'); // Usato il TUO id reale
        
        if (searchInput && lastSearchQuery !== '') {
            // A. Ripristina il testo visivo per l'utente
            searchInput.value = lastSearchQuery;
            // B. Riesegue la ricerca con il campo ora compilato
            searchMedia(); 
        }
    }
}

document.querySelectorAll('input[name="search-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        document.querySelectorAll('input[name="search-type"]').forEach(r => r.parentElement.style.color = 'var(--text-muted)');
        e.target.parentElement.style.color = 'var(--text)';
    });
});

// Costante di obsolescenza: 7 giorni in millisecondi
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; 

async function silentCacheUpdate() {
    console.log("[SYS] Avvio scansione obsolescenza cache...");
    
    try {
        const keys = await UserLibrary.keys();
        const now = Date.now();
        let updatedCount = 0;

        for (const tvId of keys) {
            const userSeries = await UserLibrary.getItem(tvId);
            
            // FILTRO STRATEGICO 1: Ignora le serie morte. 
            // Non sprecare risorse per aggiornare serie che l'utente ha messo in pausa o finito.
            if (!userSeries || userSeries.status === 'completed' || userSeries.status === 'paused') continue;

            const tmdbData = await TmdbCache.getItem(tvId);
            if (!tmdbData || !tmdbData.last_updated) continue;

            // FILTRO STRATEGICO 2: Controllo del Time-To-Live
            if (now - tmdbData.last_updated > CACHE_TTL) {
                console.log(`[SYNC] Dati stantii rilevati per "${tmdbData.name}". Età: ${Math.round((now - tmdbData.last_updated) / 86400000)} giorni.`);
                
                try {
                    // 1. Scarica i metadati primari aggiornati
                    const url = TMDB_CONFIG.buildTvUrl(tvId);
                    const response = await fetch(url);
                    if (!response.ok) continue;
                    
                    const freshData = await response.json();
                    
                    // 2. Preserva le stagioni che hai già scaricato per evitare wipe totali
                    freshData.detailed_seasons = tmdbData.detailed_seasons || {};
                    freshData.last_updated = now;
                    
                    // 3. Identifica le stagioni da scaricare/aggiornare
                    const existingSeasonNumbers = Object.keys(freshData.detailed_seasons).map(Number);
                    const highestSeason = Math.max(...existingSeasonNumbers, 0);
                    
                    let seasonsToSync = [];

                    if (freshData.seasons) {
                        freshData.seasons.forEach(seasonInfo => {
                            if (seasonInfo.season_number === 0) return; // Ignora gli speciali
                            
                            // Se è una stagione nuova, o se è l'ultima stagione nota (che potrebbe avere nuovi episodi rilasciati), mettila in coda.
                            if (!existingSeasonNumbers.includes(seasonInfo.season_number) || seasonInfo.season_number === highestSeason) {
                                seasonsToSync.push(seasonInfo);
                            }
                        });
                    }

                    // 4. Salva la nuova radice
                    await TmdbCache.setItem(tvId, freshData);
                    
                    // 5. Manda in coda il download pesante delle stagioni modificate
                    if (seasonsToSync.length > 0) {
                        console.log(`[SYNC] Richiesto aggiornamento di ${seasonsToSync.length} stagioni per ${tvId}.`);
                        // Non usiamo 'await' qui. Lasciamo che backgroundSeasonSync lavori in parallelo senza bloccare questo loop.
                        backgroundSeasonSync(tvId, seasonsToSync);
                    }
                    
                    updatedCount++;
                    
                    // Pausa tattica (Throttling) per evitare ban dell'IP da parte di TMDB per troppe richieste al secondo
                    await sleep(350); 
                    
                } catch (fetchError) {
                    console.warn(`[SYNC] Impossibile aggiornare ${tvId}. Riproverò al prossimo avvio.`, fetchError);
                }
            }
        }
        
        if (updatedCount > 0) {
            console.log(`[SYS] Manutenzione conclusa. Aggiornate ${updatedCount} serie.`);
            // Se eravamo sulla home, ricalcola il cruscotto per far apparire i nuovi episodi appena scoperti
            if (currentContext === 'home') renderHome(); 
        } else {
            console.log("[SYS] Manutenzione conclusa. Nessuna cache obsoleta.");
        }

    } catch (criticalError) {
        console.error("[CRITICO] Fallimento nel motore di invalidazione cache:", criticalError);
    }
}

// ==========================================
// MOTORE SCHEDA ATTORE (PEOPLE) - REVISED
// ==========================================

async function openActorView(personId) {
    const container = document.getElementById('actor-content');
    const actorSection = document.getElementById('view-actor');
    
    // 1. Gestione Dinamica del Tasto Indietro basata sul Context
    const previousContext = currentContext; // Salva da dove sta arrivando l'utente ('search' o 'detail')
    
    let backButtonHTML = '';
    if (previousContext === 'search') {
        backButtonHTML = `<button class="btn btn-outline btn-small" onclick="navigateBack()" style="margin-bottom: 1.5rem;">← Torna alla Ricerca</button>`;
    } else {
        backButtonHTML = `<button class="btn btn-outline btn-small" onclick="switchTab('detail')" style="margin-bottom: 1.5rem;">← Torna al Titolo</button>`;
    }

    container.innerHTML = '<div style="text-align: center; padding: 2rem;"><div style="width: 40px; height: 40px; border: 4px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div><span style="color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Recupero fascicolo...</span></div>';
    
    switchTab('actor');

    try {
        const response = await fetch(TMDB_CONFIG.buildPersonUrl(personId));
        if (!response.ok) throw new Error("Errore API TMDB");
        const personData = await response.json();

        const profileUrl = personData.profile_path ? `https://image.tmdb.org/t/p/w300${personData.profile_path}` : 'https://placehold.co/300x450/27272a/a1a1aa?text=No+Foto';
        
        const birth = personData.birthday ? personData.birthday.split('-').reverse().join('/') : 'Sconosciuta';
        const death = personData.deathday ? ` - ${personData.deathday.split('-').reverse().join('/')}` : '';
        const place = personData.place_of_birth || 'Sconosciuto';
        const bio = personData.biography || 'Nessuna biografia disponibile in italiano per questo artista.';

        // 2. FILTRAGGIO E ORDINAMENTO RIGIDO PER LA FILMOGRAFIA
        let creditsHTML = '<span style="color: var(--text-muted); display: block; margin-top: 1rem;">Nessun credito rilevante trovato.</span>';
        
        if (personData.combined_credits && personData.combined_credits.cast) {
            const validCredits = personData.combined_credits.cast
                .filter(c => {
                    // A. Solo Film e TV
                    if (c.media_type !== 'movie' && c.media_type !== 'tv') return false;
                    
                    // B. PULIZIA COMPARSATE / TALK SHOW
                    const character = (c.character || '').toLowerCase();
                    if (character.includes('self') || character.includes('guest') || character.includes('himself') || character.includes('herself')) {
                        return false;
                    }
                    return true;
                })
                // C. ORDINAMENTO PER VOTE_COUNT (Premia i grandi film/serie rispetto alla popolarità effimera)
                .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
                .slice(0, 15); // Prendi i 15 ruoli di recitazione più significativi

            if (validCredits.length > 0) {
                creditsHTML = `
                    <div class="library-grid" style="margin-top: 1rem;">
                        ${validCredits.map(item => {
                            const title = item.media_type === 'movie' ? item.title : item.name;
                            const poster = item.poster_path ? `${TMDB_CONFIG.IMAGE_BASE_URL}${item.poster_path}` : 'https://placehold.co/200x300/27272a/a1a1aa?text=N/D';
                            const badgeColor = item.media_type === 'tv' ? 'var(--text)' : 'var(--danger)';
                            const badgeText = item.media_type === 'tv' ? 'TV' : 'FILM';
                            const badgeTextColor = item.media_type === 'movie' ? '#ffffff' : 'var(--bg)';
                            
                            return `
                                <div class="series-card" style="position: relative;" onclick="previewMedia(${item.id}, '${item.media_type}')" title="${title}">
                                    <div style="position: absolute; top: 5px; left: 5px; background: ${badgeColor}; color: ${badgeTextColor}; font-size: 0.5rem; font-weight: 900; padding: 0.15rem 0.35rem; border-radius: 3px; z-index: 10;">${badgeText}</div>
                                    <img src="${poster}" alt="${title}">
                                    <div class="series-card-content">
                                        <span class="series-title" style="font-size: 0.7rem;">${title}</span>
                                        <span class="series-status" style="text-transform: none; color: var(--text);">${item.character || 'Ruolo Sconosciuto'}</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }
        }

        // Iniezione nel DOM inclusiva del bottone "Indietro" contestuale
        container.innerHTML = `
            ${backButtonHTML}
            
            <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; align-items: flex-start;">
                <img src="${profileUrl}" alt="${personData.name}" style="width: 100px; height: 150px; object-fit: cover; border: 1.5px solid var(--text); flex-shrink: 0; background: var(--input-bg);">
                <div>
                    <h2 style="margin: 0 0 0.5rem 0; font-size: 1.6rem; text-transform: uppercase; line-height: 1.1;">${personData.name}</h2>
                    <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; margin-bottom: 0.3rem;">
                        <span style="text-transform: uppercase;">Nato il:</span> <span style="color: var(--text);">${birth}${death}</span>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">
                        <span style="text-transform: uppercase;">Luogo:</span> <span style="color: var(--text);">${place}</span>
                    </div>
                </div>
            </div>
            
            <div onclick="const p = this.querySelector('p'); const isClamped = p.style.display === '-webkit-box'; p.style.display = isClamped ? 'block' : '-webkit-box'; this.querySelector('.bio-hint').innerText = isClamped ? '(Clicca per ridurre)' : '(Clicca per espandere)';" style="background: var(--input-bg); padding: 1rem; border: 1px solid var(--border); border-left: 4px solid var(--text); margin-bottom: 2rem; cursor: pointer; user-select: none;">
                <h3 style="font-size: 0.8rem; margin: 0 0 0.5rem 0; color: var(--text-muted); text-transform: uppercase;">Biografia <span class="bio-hint" style="font-size: 0.6rem; font-weight: 600; opacity: 0.6;">(Clicca per espandere)</span></h3>
                <p style="font-size: 0.85rem; line-height: 1.6; margin: 0; color: var(--text); display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">${bio}</p>
            </div>

            <h3 style="font-size: 1.1rem; text-transform: uppercase; border-bottom: 2px solid var(--text); padding-bottom: 0.5rem; margin-bottom: 1rem;">Opere Più Note</h3>
            ${creditsHTML}
        `;

    } catch (error) {
        console.error(error);
        container.innerHTML = `
            ${backButtonHTML}
            <div style="padding: 2rem; text-align: center; color: var(--danger); font-weight: 800;">[ERRORE DI RETE]<br>Impossibile recuperare i dati dell'attore. Verifica la connessione.</div>
        `;
    }
}

// ==========================================
// OVERRIDE MANUALE CACHE TMDB
// ==========================================

async function forceUpdateMetadata(mediaId) {
    const loader = document.getElementById('global-loader');
    const loaderText = loader.querySelector('strong');
    const originalText = loaderText.innerText;
    
    try {
        loaderText.innerText = "AGGIORNAMENTO DATI...";
        loader.classList.add('active');

        // 1. Recupero contesto attuale
        const oldTmdbData = await TmdbCache.getItem(String(mediaId));
        const userItem = await UserLibrary.getItem(String(mediaId));
        
        const mediaType = (oldTmdbData && oldTmdbData.media_type) 
            ? oldTmdbData.media_type 
            : (userItem && userItem.media_type ? userItem.media_type : 'tv');

        // 2. Chiamata API fresca con tutti i nuovi parametri (Cast, Trailer, Provider)
        const url = mediaType === 'tv' ? TMDB_CONFIG.buildTvUrl(mediaId) : TMDB_CONFIG.buildMovieUrl(mediaId);
        const response = await fetch(url);
        
        if (!response.ok) throw new Error("TMDB non raggiungibile. Controlla la rete.");
        const freshData = await response.json();

        // 3. Iniezione del DNA strutturale e preservazione delle stagioni già scaricate
        freshData.media_type = mediaType;
        freshData.last_updated = Date.now();
        
        if (mediaType === 'tv' && oldTmdbData && oldTmdbData.detailed_seasons) {
            freshData.detailed_seasons = oldTmdbData.detailed_seasons;
        }

        // 4. Sovrascrittura spietata del vecchio JSON
        await TmdbCache.setItem(String(mediaId), freshData);

        console.log(`[SYS] Cache aggiornata forzatamente per ID: ${mediaId}`);

        // 5. Ricarica chirurgica della vista
        openDetailView(mediaId);

        // EXTRA: Se è una serie TV, inneschiamo anche un controllo silenzioso sulle stagioni per sicurezza
        if (mediaType === 'tv' && freshData.seasons) {
            backgroundSeasonSync(mediaId, freshData.seasons);
        }

    } catch (error) {
        console.error("[CRITICO] Fallimento aggiornamento forzato:", error);
        await customAlert("Impossibile aggiornare i dati. Sei offline o l'API è bloccata.");
    } finally {
        loader.classList.remove('active');
        loaderText.innerText = originalText; // Ripristino stato originale del loader
    }
}

// ==========================================
// MOTORE DI SCOPERTA E RACCOMANDAZIONE
// ==========================================
let isDiscoveryLoaded = false;

function buildDiscoveryRow(title, items, type) {
    if (!items || items.length === 0) return '';
    const cards = items.slice(0, 15).map(item => {
        const poster = item.poster_path ? `${TMDB_CONFIG.IMAGE_BASE_URL}${item.poster_path}` : 'https://placehold.co/150x225/27272a/a1a1aa?text=N/D';
        const name = type === 'tv' ? item.name : item.title;
        const badgeColor = type === 'tv' ? 'var(--text)' : 'var(--danger)';
        const badgeText = type === 'tv' ? 'TV' : 'FILM';
        const badgeTextColor = type === 'movie' ? '#ffffff' : 'var(--bg)';
        
        return `
            <div style="flex-shrink: 0; width: 100px; cursor: pointer; position: relative;" onclick="previewMedia(${item.id}, '${type}')" title="${name}">
                <div style="position: absolute; top: 4px; left: 4px; background: ${badgeColor}; color: ${badgeTextColor}; font-size: 0.5rem; font-weight: 900; padding: 0.1rem 0.25rem; border-radius: 2px; z-index: 10;">${badgeText}</div>
                <img src="${poster}" alt="${name}" style="width: 100px; height: 150px; object-fit: cover; border-radius: 4px; border: 1.5px solid var(--border); transition: border-color 0.2s;">
                <div style="font-size: 0.7rem; font-weight: 800; line-height: 1.1; margin-top: 0.4rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text);">${name}</div>
            </div>
        `;
    }).join('');
    
    return `
        <div style="margin-bottom: 2rem;">
            <h3 style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-muted); border-bottom: 1.5px solid var(--border); padding-bottom: 0.3rem; margin-bottom: 1rem; letter-spacing: 0.5px;">${title}</h3>
            <div style="display: flex; gap: 0.75rem; overflow-x: auto; padding-bottom: 0.5rem; scrollbar-width: none;">
                ${cards}
            </div>
        </div>
    `;
}

// Utilità per lo stile delle pillole (Filtri)
const pillStyle = "padding: 0.35rem 0.8rem; border-radius: 20px; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-size: 0.7rem; font-weight: 800; cursor: pointer; white-space: nowrap; transition: all 0.2s;";

async function loadDiscovery() {
    currentContext = 'search'; 
    if (isDiscoveryLoaded) return; 

    const container = document.getElementById('discovery-content');
    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted); font-weight: 800; font-size: 0.8rem; text-transform: uppercase;">Inizializzazione radar...</div>';
    
    try {
        let finalHtml = '';

        // 1. PRIMA: Le tendenze (Esplorazione passiva)
        const [tvRes, movieRes] = await Promise.all([
            fetch(TMDB_CONFIG.buildTrendingUrl('tv')),
            fetch(TMDB_CONFIG.buildTrendingUrl('movie'))
        ]);
        
        const tvData = await tvRes.json();
        const movieData = await movieRes.json();
        
        finalHtml += `<div id="trending-container">` + 
                     buildDiscoveryRow('🔥 Serie TV del momento', tvData.results, 'tv') + 
                     buildDiscoveryRow('🎬 Film più popolari', movieData.results, 'movie') + 
                     `</div>`;

        // 2. DOPO: I filtri (Esplorazione attiva, a cascata visiva)
        finalHtml += `
            <div id="filters-container" style="border-top: 1.5px solid var(--border); padding-top: 1.5rem; margin-top: 1rem;">
                <h3 style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.75rem; letter-spacing: 0.5px;">Esplora per Catalogo</h3>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem;">
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('provider', 8, 'Netflix', this)">Netflix</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('provider', 119, 'Prime', this)">Prime</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('provider', 337, 'Disney+', this)">Disney+</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('network', 49, 'HBO', this)">HBO</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('provider', 283, 'Crunchyroll', this)">Crunchyroll</button>
                </div>

                <h3 style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.75rem; letter-spacing: 0.5px;">Esplora per Genere</h3>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem;">
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('genre', 10759, 'Azione & Avventura', this)">Azione/Avventura</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('genre', 16, 'Animazione', this)">Animazione</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('genre', 35, 'Commedia', this)">Commedia</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('genre', 80, 'Crime', this)">Crime</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('genre', 99, 'Documentario', this)">Documentario</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('genre', 18, 'Drammatico', this)">Drammatico</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('genre', 10751, 'Famiglia', this)">Famiglia</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('genre', 9648, 'Mistero', this)">Mistero</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('genre', 10764, 'Reality', this)">Reality</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('genre', 10765, 'Sci-Fi & Fantasy', this)">Sci-Fi & Fantasy</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('genre', 10768, 'Guerra & Politica', this)">Guerra/Politica</button>
                    <button class="filter-btn" style="${pillStyle}" onclick="fetchCatalog('genre', 37, 'Western', this)">Western</button>
                </div>
            </div>
            
            <div id="catalog-results" style="margin-top: 1rem; display: none;"></div>
        `;
        
        container.innerHTML = finalHtml;
        isDiscoveryLoaded = true;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<span style="color: var(--danger); font-size: 0.8rem; font-weight: 800;">Errore di connessione. Radar offline.</span>';
    }
}

async function fetchCatalog(type, id, name, buttonElement) {
    // 1. INTERCETTAZIONE E TOGGLE
    // Se il bottone cliccato è già quello attivo, spegne tutto e torna alla home delle ricerche
    if (buttonElement.dataset.active === 'true') {
        resetDiscovery();
        return;
    }

    // Reset visuale e di stato per tutte le pillole
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-muted)';
        btn.style.borderColor = 'var(--border)';
        btn.dataset.active = 'false'; // Azzera la memoria
    });
    
    // Accensione della pillola cliccata e salvataggio dello stato
    buttonElement.style.background = 'var(--text)';
    buttonElement.style.color = 'var(--bg)';
    buttonElement.style.borderColor = 'var(--text)';
    buttonElement.dataset.active = 'true';

    // Nasconde le tendenze
    document.getElementById('trending-container').style.display = 'none';

    const resultBox = document.getElementById('catalog-results');
    resultBox.style.display = 'block';
    resultBox.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted); font-weight: 800; font-size: 0.8rem; text-transform: uppercase;">Estrazione catalogo in corso...</div>';

    try {
        let url = '';
        if (type === 'provider') url = `${TMDB_CONFIG.BASE_URL}/discover/tv?api_key=${TMDB_CONFIG.API_KEY}&language=it-IT&sort_by=popularity.desc&watch_region=IT&with_watch_providers=${id}`;
        else if (type === 'network') url = `${TMDB_CONFIG.BASE_URL}/discover/tv?api_key=${TMDB_CONFIG.API_KEY}&language=it-IT&sort_by=popularity.desc&with_networks=${id}`;
        else if (type === 'genre') url = `${TMDB_CONFIG.BASE_URL}/discover/tv?api_key=${TMDB_CONFIG.API_KEY}&language=it-IT&sort_by=popularity.desc&with_genres=${id}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            resultBox.innerHTML = '<span style="color: var(--text-muted);">Nessun risultato trovato.</span>';
            return;
        }

        const cards = data.results.map(item => {
            const poster = item.poster_path ? `${TMDB_CONFIG.IMAGE_BASE_URL}${item.poster_path}` : 'https://placehold.co/500x750/27272a/a1a1aa?text=N/D';
            const title = item.name || item.title;
            const isMovie = !!item.title; 
            const badgeBg = isMovie ? 'var(--danger)' : 'var(--text)';
            const badgeColor = isMovie ? '#ffffff' : 'var(--bg)';
            const badgeText = isMovie ? 'FILM' : 'SERIE';
            const mediaType = isMovie ? 'movie' : 'tv';

            return `
                <div class="series-card" style="position: relative;" onclick="previewMedia(${item.id}, '${mediaType}')">
                    <div style="position: absolute; top: 5px; left: 5px; background: ${badgeBg}; color: ${badgeColor}; font-size: 0.6rem; font-weight: 900; padding: 0.15rem 0.35rem; border-radius: 3px; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(0,0,0,0.5); z-index: 10;">${badgeText}</div>
                    <img src="${poster}" alt="${title}">
                    <div class="series-card-content">
                        <span class="series-title" title="${title}">${title}</span>
                        <span class="series-status" style="color: var(--primary);">DA SCOPRIRE</span>
                    </div>
                </div>
            `;
        }).join('');

        resultBox.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1rem; border-bottom: 2px solid var(--text); padding-bottom: 0.5rem;">
                <h3 style="margin: 0; text-transform: uppercase; font-weight: 900; color: var(--text); font-size: 1.1rem;">Top 20: ${name}</h3>
                <button class="btn btn-outline btn-small" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="resetDiscovery()">Chiudi</button>
            </div>
            <div class="library-grid">${cards}</div>
        `;
        
    } catch (e) {
        resultBox.innerHTML = '<span style="color: var(--danger); font-size: 0.75rem; font-weight: 800;">Errore nel recupero dati.</span>';
    }
}

function resetDiscovery() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-muted)';
        btn.style.borderColor = 'var(--border)';
        btn.dataset.active = 'false'; // Pulisce la memoria
    });
    document.getElementById('catalog-results').style.display = 'none';
    document.getElementById('trending-container').style.display = 'block';
}

function handleSearchInput(value) {
    const discoverySection = document.getElementById('discovery-section');
    const resultsContainer = document.getElementById('search-results');
    
    if (value.trim() === '') {
        resultsContainer.innerHTML = '';
        discoverySection.style.display = 'block';
    }
}


// ==========================================
// EVENTI DI SISTEMA E INIZIALIZZAZIONE
// ==========================================

document.addEventListener('seasonSyncCompleted', (event) => {
    const { syncedTvId } = event.detail;
    const detailView = document.getElementById('view-detail');

    // Se l'utente sta guardando la scheda proprio mentre il download finisce, la rigeneriamo chirurgicamente
    if (detailView.classList.contains('active') && window.currentOpenTvId === String(syncedTvId)) {
        console.log(`[SYS] Reattività innescata per ID ${syncedTvId}. Rigenero la UI automaticamente.`);
        openDetailView(syncedTvId);
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('[SYS] Service Worker registrato con successo.', reg.scope))
            .catch(err => console.error('[CRITICO] Registrazione Service Worker fallita:', err));
            
        setTimeout(silentCacheUpdate, 5000);
    });

    // 3. IL MOTORE DI AUTORELOAD
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Questo check evita un loop infinito di ricaricamenti se ci sono schede multiple
        if (!refreshing) {
            console.log('[SYS] Nuovo Service Worker attivato. Aggiornamento interfaccia in corso...');
            window.location.reload();
            refreshing = true;
        }
    });
}

// Init
switchTab('home');