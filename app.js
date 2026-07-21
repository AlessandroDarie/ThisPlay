// ==========================================
// CONFIGURAZIONE E SETUP INIZIALE
// ==========================================

let currentContext = 'home'; // Le tue aree: 'home', 'library', 'search', 'stats'
let lastSearchQuery = '';    // Memoria per l'ultima parola cercata

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

async function searchSeries() {
    currentContext = 'search';
    const inputElement = document.getElementById('search-input');
    const resultsContainer = document.getElementById('search-results');
    const query = inputElement.value.trim();

    if (!query) return;

    lastSearchQuery = query;

    try {
        resultsContainer.innerHTML = '<span style="color: var(--text-muted);">Ricerca in corso...</span>';
        const url = TMDB_CONFIG.buildSearchUrl(query);
        const response = await fetch(url);
        if (!response.ok) throw new Error("Errore durante la ricerca.");
        
        const data = await response.json();
        resultsContainer.innerHTML = '';

        if (data.results.length === 0) {
            resultsContainer.innerHTML = '<span style="color: var(--danger);">Nessun risultato trovato.</span>';
            return;
        }

        data.results.slice(0, 8).forEach(series => {
            const year = series.first_air_date ? series.first_air_date.substring(0, 4) : 'N/A';
            const item = document.createElement('div');
            item.className = 'card';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.padding = '1rem';
            item.style.marginBottom = '0';
            
            // Bottone "Apri" invece di "Traccia"
            item.innerHTML = `
                <div>
                    <strong>${series.name}</strong> <span style="color: var(--text-muted); font-size: 0.9em;">(${year})</span>
                </div>
                <button class="btn btn-outline btn-small" onclick="previewSeries(${series.id})">Apri</button>
            `;
            resultsContainer.appendChild(item);
        });
    } catch (error) {
        console.error(error);
        resultsContainer.innerHTML = '<span style="color: var(--danger);">Errore di connessione o API.</span>';
    }
}

// Apre l'anteprima velocemente caricando solo i dati principali
async function previewSeries(tvId) {
    const loader = document.getElementById('global-loader');
    loader.classList.add('active'); // Attiva blur e rotella

    try {
        let tmdbData = await TmdbCache.getItem(String(tvId));
        if (!tmdbData) {
            const url = TMDB_CONFIG.buildTvUrl(tvId);
            const response = await fetch(url);
            if (!response.ok) throw new Error("API irraggiungibile");
            tmdbData = await response.json();
            tmdbData.last_updated = Date.now();
            await TmdbCache.setItem(String(tvId), tmdbData);
        }
        
        openDetailView(tvId);
        switchTab('detail');
    } catch (error) {
        console.error(error);
        await customAlert("Errore durante il caricamento dell'anteprima.");
    } finally {
        loader.classList.remove('active'); // Spegne il loader in ogni caso
    }
}

// Converte un'anteprima in una serie tracciata e fa partire il download pesante
async function addToLibraryFromPreview(tvId) {
    try {
        const tmdbData = await TmdbCache.getItem(String(tvId));
        if (!tmdbData) return;

        const userSeriesModel = {
            id: tvId,
            status: "watching", // Stato di default: in corso
            added_at: Date.now(),
            watched_count: 0,
            watched_minutes: 0,
            progress: {},
            is_favorite: false
        };
        
        await UserLibrary.setItem(String(tvId), userSeriesModel);
        console.log(`[SUCCESSO] "${tmdbData.name}" inizializzata in libreria!`);
        
        // Risveglia il download asincrono in background
        if (tmdbData.seasons && tmdbData.seasons.length > 0) {
            backgroundSeasonSync(tvId, tmdbData.seasons);
        }

        // Ricarica la vista dettaglio (passerà automaticamente da Anteprima a Modalità Piena)
        openDetailView(tvId);
        
    } catch (error) {
        console.error("[CRITICO] Fallimento durante l'aggiunta:", error);
        await customAlert("Errore critico durante l'aggiunta della serie.");
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

        let inProgressHTML = '';
        let upcomingHTML = '';
        let activeCount = 0;
        let upcomingCount = 0;

        const today = new Date().toISOString().split('T')[0];

        for (const key of keys) {
            const userSeries = await UserLibrary.getItem(key);
            
            if (!userSeries.progress || Object.keys(userSeries.progress).length === 0) continue;
            if (userSeries.status === 'completed' || userSeries.status === 'paused') continue;

            const tmdbData = await TmdbCache.getItem(key);
            if (!tmdbData || !tmdbData.detailed_seasons) continue;

            let targetEpisode = null;
            let isUpcoming = false;
            let epRuntime = 45;

            let maxS = 0;
            let maxE = 0;
            
            for (const epKey in userSeries.progress) {
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
                            // È in pari, la prossima puntata deve ancora uscire
                            isUpcoming = true;
                            targetEpisode = { 
                                key: `S${String(maxS).padStart(2, '0')}E${String(nextEpData.episode_number).padStart(2, '0')}`, 
                                name: nextEpData.name,
                                air_date: nextEpData.air_date 
                            };
                        } else if (!nextEpData.air_date || nextEpData.air_date <= today) {
                            // Puntata uscita e pronta da vedere
                            targetEpisode = { 
                                key: `S${String(maxS).padStart(2, '0')}E${String(nextEpData.episode_number).padStart(2, '0')}`, 
                                name: nextEpData.name 
                            };
                        }
                    } else {
                        // Cerca nella prossima stagione
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
                                        isUpcoming = true;
                                        targetEpisode = { 
                                            key: `S${String(nextS).padStart(2, '0')}E${String(firstValidEp.episode_number).padStart(2, '0')}`, 
                                            name: firstValidEp.name,
                                            air_date: firstValidEp.air_date 
                                        };
                                    } else if (!firstValidEp.air_date || firstValidEp.air_date <= today) {
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
                    upcomingCount++;
                    const dateFormatted = targetEpisode.air_date.split('-').reverse().join('/');
                    const calendarSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 3px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;

                    upcomingHTML += `
                        <div style="display: flex; border: 1.5px solid var(--border); background: var(--input-bg); margin-bottom: 0.75rem; overflow: hidden; height: 95px; opacity: 0.85;">
                            <img src="${posterUrl}" style="width: 65px; object-fit: cover; border-right: 1.5px solid var(--border);" alt="${tmdbData.name}">
                            <div style="flex: 1; padding: 0.5rem 0.75rem; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
                                <div>
                                    <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem;">
                                        <strong style="font-size: 0.9rem; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1;">
                                            ${tmdbData.name}
                                        </strong>
                                        <span style="font-size: 0.7rem; font-weight: 900; color: var(--text-muted); flex-shrink: 0; background: var(--card-bg); padding: 0.1rem 0.3rem; border: 1px solid var(--border); border-radius: 3px;">
                                            ${targetEpisode.key}
                                        </span>
                                    </div>
                                    <div style="font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.15rem;">
                                        ${targetEpisode.name}
                                    </div>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
                                    <span style="font-size: 0.75rem; font-weight: 800; color: var(--text); display: flex; align-items: center;">
                                        ${calendarSvg} Uscita: ${dateFormatted}
                                    </span>
                                    <button class="btn btn-outline btn-small" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;" onclick="openDetailView('${key}'); switchTab('detail');">
                                        Dettagli
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    activeCount++;
                    inProgressHTML += `
                        <div style="display: flex; border: 1.5px solid var(--text); background: var(--input-bg); margin-bottom: 0.75rem; overflow: hidden; height: 110px;">
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
                                <div style="display: flex; gap: 0.5rem; margin-top: auto;">
                                    <button class="btn btn-success" style="flex: 1; padding: 0.25rem; font-size: 0.8rem; font-weight: 800;" onclick="markNextEpisodeWatched('${key}', '${targetEpisode.key}', ${epRuntime})">
                                        VISTO
                                    </button>
                                    <button class="btn btn-outline" style="padding: 0.25rem 0.6rem;" onclick="openDetailView('${key}'); switchTab('detail');" title="Dettagli">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }
        }

        let finalHtml = '';

        if (activeCount > 0) {
            finalHtml += `
                <p style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-bottom: 1rem; letter-spacing: 0.5px;">Da continuare</p>
                ${inProgressHTML}
            `;
        }

        if (upcomingCount > 0) {
            finalHtml += `
                <p style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-top: ${activeCount > 0 ? '2rem' : '0'}; margin-bottom: 1rem; letter-spacing: 0.5px;">Prossime Uscite (In Pari)</p>
                ${upcomingHTML}
            `;
        }

        if (activeCount === 0 && upcomingCount === 0) {
            container.innerHTML = `
                <p style="color: var(--text-muted); margin-bottom: 1rem;">Nessuna serie attiva al momento. Le serie in corso appariranno qui.</p>
                <button class="btn" onclick="switchTab('library')">Sfoglia Libreria</button>
            `;
        } else {
            container.innerHTML = finalHtml;
        }

    } catch (e) {
        console.error("[CRITICO] Fallimento rendering Home:", e);
        container.innerHTML = '<span style="color: var(--danger);">Errore nel calcolo del cruscotto operativo.</span>';
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

// Fabbrica DOM per la singola scheda della serie (Evita codice duplicato)
function createSeriesCardElement(item) {
    const posterUrl = item.tmdb.poster_path ? `${TMDB_CONFIG.IMAGE_BASE_URL}${item.tmdb.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image';
    
    let statusLabel = '';
    let statusColor = 'var(--text-muted)';
    
    if (item.user.status === 'completed') { statusLabel = 'COMPLETATA'; statusColor = 'var(--success)'; }
    else if (item.user.status === 'paused') { statusLabel = 'IN PAUSA'; statusColor = 'var(--text)'; }
    else if (item.user.watched_count === 0) { statusLabel = 'DA VEDERE'; }
    else { statusLabel = 'IN CORSO'; statusColor = 'var(--primary)'; }

    const favBadge = item.user.is_favorite ? `<div style="position: absolute; top: 5px; right: 5px; background: var(--card-bg); border-radius: 50%; padding: 4px; border: 1px solid var(--danger); color: var(--danger); line-height: 0;"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg></div>` : '';

    const card = document.createElement('div');
    card.className = 'series-card';
    card.style.position = 'relative';
    card.onclick = () => {
        openDetailView(item.user.id);
        switchTab('detail'); 
    };

    card.innerHTML = `
        ${favBadge}
        <img src="${posterUrl}" alt="${item.tmdb.name}">
        <div class="series-card-content">
            <span class="series-title" title="${item.tmdb.name}">${item.tmdb.name}</span>
            <span class="series-status" style="color: ${statusColor};">${statusLabel}</span>
        </div>
    `;
    return card;
}

// Renderizza il cruscotto principale dell'utente con filtri, ordinamento e multi-sezione
async function renderLibrary(currentFilter = 'all') {
    currentContext = 'library';
    const container = document.getElementById('library-grid');
    const filterButtons = document.querySelectorAll('#library-filters button');
    
    filterButtons.forEach(btn => btn.classList.remove('active'));
    const activeBtnIndex = ['all', 'watching', 'planned', 'paused', 'completed', 'favorite'].indexOf(currentFilter);
    if(activeBtnIndex >= 0) filterButtons[activeBtnIndex].classList.add('active');

    // Cambiamo la struttura per ospitare intestazioni multiple, non usiamo più la grid CSS direttamente sul contenitore padre
    container.className = ''; 
    container.innerHTML = '<span style="color: var(--text-muted);">Estrazione e smistamento dati...</span>';

    try {
        const keys = await UserLibrary.keys();
        if (keys.length === 0) {
            container.innerHTML = '<span style="color: var(--text-muted); display: block; text-align: center; padding: 2rem 0;">La tua libreria è vuota. Cerca una serie per iniziare.</span>';
            return;
        }

        let seriesArray = [];

        // 1. Estrazione dati massiva
        for (const key of keys) {
            const userSeries = await UserLibrary.getItem(key);
            let tmdbData = await TmdbCache.getItem(key);

            if (!tmdbData) {
                try {
                    const url = TMDB_CONFIG.buildTvUrl(key);
                    const res = await fetch(url);
                    if (!res.ok) throw new Error("API irraggiungibile");
                    tmdbData = await res.json();
                    tmdbData.last_updated = Date.now();
                    await TmdbCache.setItem(key, tmdbData);
                    if (tmdbData.seasons && tmdbData.seasons.length > 0) backgroundSeasonSync(key, tmdbData.seasons);
                } catch (e) { continue; }
            }
            
            if (!userSeries.status) userSeries.status = 'watching';
            seriesArray.push({ key: key, user: userSeries, tmdb: tmdbData, lastInteraction: getLastInteraction(userSeries) });
        }

        // 2. Ordinamento assoluto dal più recente al meno recente
        seriesArray.sort((a, b) => b.lastInteraction - a.lastInteraction);
        container.innerHTML = '';

        // Funzione filtro locale
        const filterSeries = (type) => seriesArray.filter(item => {
            const eps = item.user.watched_count || 0;
            switch(type) {
                case 'watching': return item.user.status === 'watching' && eps > 0;
                case 'planned': return item.user.status === 'watching' && eps === 0;
                case 'paused': return item.user.status === 'paused';
                case 'completed': return item.user.status === 'completed';
                case 'favorite': return item.user.is_favorite === true;
                default: return true;
            }
        });

        // 3. DIRAMAZIONE LOGICA: Panoramica vs Categoria Singola
        if (currentFilter === 'all') {
            const categories = [
                { id: 'watching', title: 'In Corso' },
                { id: 'planned', title: 'Da Vedere' },
                { id: 'paused', title: 'In Pausa' },
                { id: 'completed', title: 'Viste' },
                { id: 'favorite', title: 'Preferite', color: 'var(--danger)' }
            ];

            let hasContent = false;

            categories.forEach(cat => {
                const catSeries = filterSeries(cat.id);
                if (catSeries.length === 0) return; // Salta la sezione se vuota
                hasContent = true;

                // Intestazione Brutalista della Sezione
                const headerColor = cat.color || 'var(--text)';
                const headerHtml = `
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: ${hasContent ? '0' : '2rem'}; margin-bottom: 1rem; border-bottom: 2px solid ${headerColor}; padding-bottom: 0.5rem; padding-top: 2rem;">
                        <h3 style="margin: 0; text-transform: uppercase; font-weight: 900; color: ${headerColor}; letter-spacing: -0.5px;">${cat.title}</h3>
                        ${catSeries.length > 6 ? `<button class="btn btn-outline btn-small" style="font-weight: 800; border-color: ${headerColor}; color: ${headerColor};" onclick="renderLibrary('${cat.id}')">Vedi Tutte (${catSeries.length})</button>` : ''}
                    </div>
                `;
                
                const sectionDiv = document.createElement('div');
                sectionDiv.innerHTML = headerHtml;
                container.appendChild(sectionDiv);

                // Griglia per questa specifica sezione
                const subGrid = document.createElement('div');
                subGrid.className = 'library-grid';
                
                // Prendi solo i primi 6 e usa la fabbrica DOM
                catSeries.slice(0, 6).forEach(item => {
                    subGrid.appendChild(createSeriesCardElement(item));
                });
                
                container.appendChild(subGrid);
            });

            if (!hasContent) container.innerHTML = '<span style="color: var(--text-muted); display: block; text-align: center; padding: 2rem 0;">La tua libreria è vuota.</span>';

        } else {
            // MODALITÀ SINGOLA CATEGORIA (Comportamento precedente)
            const targetSeries = filterSeries(currentFilter);
            
            if (targetSeries.length === 0) {
                container.innerHTML = `<span style="color: var(--text-muted); display: block; text-align: center; padding: 2rem 0;">Nessuna serie in questa categoria.</span>`;
                return;
            }

            const grid = document.createElement('div');
            grid.className = 'library-grid';
            
            targetSeries.forEach(item => {
                grid.appendChild(createSeriesCardElement(item));
            });
            
            container.appendChild(grid);
        }
    } catch (error) {
        console.error(error);
        container.innerHTML = '<span style="color: var(--danger); display: block;">Errore critico database locale.</span>';
    }
}

async function renderStats() {
    currentContext = 'stats';
    const container = document.getElementById('stats-content');
    container.innerHTML = '<span style="color: var(--text-muted);">Calcolo metriche in corso...</span>';
    
    try {
        const keys = await UserLibrary.keys();
        let totalSeries = keys.length;
        let totalEpisodes = 0;
        let totalMinutes = 0;
        
        for (const key of keys) {
            const userSeries = await UserLibrary.getItem(key);
            
            const epCount = userSeries.watched_count || 0;
            totalEpisodes += epCount;
            
            if (userSeries.watched_minutes !== undefined) {
                totalMinutes += userSeries.watched_minutes;
            } else {
                const tmdbData = await TmdbCache.getItem(key);
                let runtime = 45; 
                if(tmdbData && tmdbData.episode_run_time && tmdbData.episode_run_time.length > 0) {
                    runtime = tmdbData.episode_run_time[0];
                }
                totalMinutes += (epCount * runtime);
            }
        }
        
        const hours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;
        const days = (totalMinutes / 1440).toFixed(1);
        
        container.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                <div style="border: 1.5px solid var(--text); padding: 1.25rem; background: var(--input-bg);">
                    <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800;">Serie Tracciate</div>
                    <div style="font-size: 2rem; font-weight: 900; line-height: 1.1; margin-top: 0.2rem;">${totalSeries}</div>
                </div>
                <div style="border: 1.5px solid var(--text); padding: 1.25rem; background: var(--input-bg);">
                    <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800;">Episodi Visti</div>
                    <div style="font-size: 2rem; font-weight: 900; line-height: 1.1; margin-top: 0.2rem;">${totalEpisodes}</div>
                </div>
            </div>
            
            <div style="border: 1.5px solid var(--text); padding: 1.25rem; background: var(--card-bg);">
                <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800;">Tempo Vitale Consumato</div>
                <div style="display: flex; align-items: baseline; gap: 0.2rem; margin-top: 0.5rem;">
                    <span style="font-size: 2.5rem; font-weight: 900; line-height: 1; color: var(--text);">${hours}</span>
                    <span style="color: var(--text-muted); font-weight: 700; font-size: 1.2rem; margin-right: 0.5rem;">h</span>
                    <span style="font-size: 2.5rem; font-weight: 900; line-height: 1; color: var(--text);">${remainingMinutes}</span>
                    <span style="color: var(--text-muted); font-weight: 700; font-size: 1.2rem;">m</span>
                </div>
                <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem; font-weight: 600;">Equivalgono a circa <strong style="color: var(--text);">${days} giorni</strong> ininterrotti.</p>
            </div>
        `;
    } catch (e) {
        console.error("[CRITICO] Fallimento rendering Stats:", e);
        container.innerHTML = '<span style="color: var(--danger);">Impossibile calcolare le statistiche.</span>';
    }
}

// ==========================================
// DETTAGLIO SERIE ED EPISODI
// ==========================================

async function openDetailView(tvId) {
    window.currentOpenTvId = String(tvId);
    const detailContent = document.getElementById('detail-content');
    detailContent.innerHTML = '<span style="color: var(--text-muted);">Estrazione dati...</span>';

    try {
        // userSeries potrebbe essere NULL se siamo in modalità anteprima
        const userSeries = await UserLibrary.getItem(String(tvId));
        const tmdbData = await TmdbCache.getItem(String(tvId));
        
        if (!tmdbData) throw new Error("Dati TMDB mancanti.");

        const isPreview = !userSeries; // Variabile di stato cruciale

        const bannerUrl = tmdbData.backdrop_path 
            ? `https://image.tmdb.org/t/p/w780${tmdbData.backdrop_path}` 
            : (tmdbData.poster_path ? `${TMDB_CONFIG.IMAGE_BASE_URL}${tmdbData.poster_path}` : '');

        let bannerHTML = '';
        if (bannerUrl) {
            bannerHTML = `<div style="width: 100%; height: 160px; border: 1.5px solid var(--text); background: url('${bannerUrl}') center/cover; margin-bottom: 1.5rem; display: block;"></div>`;
        }

        // 1. HEADER (Il tasto elimina scompare in anteprima)
        let html = `
            ${bannerHTML}
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; gap: 1rem;">
                <h2 style="margin: 0; text-transform: uppercase; font-weight: 900; letter-spacing: -0.5px; font-size: 1.8rem; line-height: 1.1;">${tmdbData.name}</h2>
                ${!isPreview ? `<button class="btn btn-danger btn-small" style="flex-shrink: 0;" onclick="removeSeries(${tvId})">Elimina</button>` : ''}
            </div>
            
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem; line-height: 1.5;">${tmdbData.overview || 'Nessuna sinossi disponibile.'}</p>
        `;
        
        if (isPreview) {
            // 2. MODALITÀ ANTEPRIMA: Niente plancia, solo bottone gigante
            html += `
                <div style="margin-bottom: 1.5rem; background: var(--input-bg); padding: 1.25rem; border: 1.5px solid var(--primary); text-align: center;">
                    <p style="margin-bottom: 1rem; color: var(--text-muted); font-weight: 700; font-size: 0.85rem; text-transform: uppercase;">Questa serie non è tracciata</p>
                    <button class="btn btn-success" style="width: 100%; font-size: 1.1rem; padding: 1rem; font-weight: 900;" onclick="addToLibraryFromPreview(${tvId})">AGGIUNGI ALLA LIBRERIA</button>
                </div>
            `;
        } else {
            // 3. MODALITÀ TRACCIATA: Plancia di controllo e rendering stagioni
            const isFav = userSeries.is_favorite === true;
            const favIconFill = isFav ? 'currentColor' : 'none';
            const favColor = isFav ? 'var(--danger)' : 'var(--text-muted)';
            const favBorder = isFav ? 'var(--danger)' : 'var(--border)';
            const currentStatus = userSeries.status || 'watching';

            html += `
                <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; background: var(--input-bg); padding: 0.75rem; border: 1.5px solid var(--text);">
                    <select id="status-select-${tvId}" onchange="changeSeriesStatus(${tvId}, this.value)" style="flex: 1; padding: 0.5rem; background: var(--card-bg); color: var(--text); border: 1px solid var(--border); border-radius: 4px; font-weight: 700; text-transform: uppercase; font-size: 0.8rem; outline: none;">
                        <option value="watching" ${currentStatus === 'watching' ? 'selected' : ''}>In Corso / Da Vedere</option>
                        <option value="paused" ${currentStatus === 'paused' ? 'selected' : ''}>In Pausa</option>
                        <option value="completed" ${currentStatus === 'completed' ? 'selected' : ''}>Completata</option>
                    </select>
                    
                    <button onclick="toggleFavorite(${tvId})" class="btn btn-outline" style="padding: 0.5rem 1rem; color: ${favColor}; border-color: ${favBorder};">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="${favIconFill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    </button>
                </div>
            `;

            if (!tmdbData.detailed_seasons || Object.keys(tmdbData.detailed_seasons).length === 0) {
                html += `<div class="card" style="border-color: var(--danger);"><p style="color: var(--danger); font-weight: bold; margin:0;">Sincronizzazione in corso... Attendi qualche secondo e riapri la scheda.</p></div>`;
            } else {
                const today = new Date().toISOString().split('T')[0];

                // All'interno di openDetailView, nel ciclo delle stagioni:
                for (const [seasonNum, seasonData] of Object.entries(tmdbData.detailed_seasons)) {
                    const bodyId = `season-body-${tvId}-${seasonNum}`;
                    
                    let validEpsInSeason = 0;
                    let watchedEpsInSeason = 0;
                    const totalSeasonEps = seasonData.episodes ? seasonData.episodes.length : 0;

                    if (seasonData.episodes) {
                        for (const ep of seasonData.episodes) {
                            const epKey = `S${String(seasonNum).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;
                            const isWatched = userSeries.progress && userSeries.progress[epKey];

                            if (isWatched || (ep.air_date && ep.air_date <= today)) {
                                validEpsInSeason++;
                                if (isWatched) watchedEpsInSeason++;
                            }
                        }
                    }

                    const isSeasonCompleted = totalSeasonEps > 0 && watchedEpsInSeason >= totalSeasonEps;

                    const borderColor = isSeasonCompleted ? 'var(--success)' : 'var(--primary)';
                    const opacity = isSeasonCompleted ? '0.6' : '1';
                    const titleColor = isSeasonCompleted ? 'var(--text-muted)' : 'var(--text)';

                    const actionHTML = isSeasonCompleted 
                        ? `<span style="font-size: 0.8rem; font-weight: 900; color: var(--success); letter-spacing: 0.5px; flex-shrink: 0;">✓ COMPLETATA</span>` 
                        : `<button class="btn btn-outline btn-small" style="font-size: 0.7rem; font-weight: 800; flex-shrink: 0;" onclick="event.stopPropagation(); markSeasonWatched(${tvId}, ${seasonNum})">COMPLETA STAGIONE</button>`;

                    html += `
                        <div style="border: 1.5px solid var(--text); border-left: 8px solid ${borderColor}; background: var(--card-bg); margin-bottom: 1rem; border-radius: 0; opacity: ${opacity}; transition: opacity 0.2s;">
                            <div onclick="toggleSeasonPanel(${tvId}, ${seasonNum}, '${bodyId}')" 
                                style="padding: 1.25rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
                                <div>
                                    <strong style="font-size: 1.2rem; text-transform: uppercase; display: block; color: ${titleColor}; transition: color 0.2s;">Stagione ${seasonNum}</strong>
                                    <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 800; margin-top: 0.3rem;">
                                        ${watchedEpsInSeason}/${totalSeasonEps} EPISODI <span style="font-size: 0.7rem; font-weight: 400; opacity: 0.7;">(Clicca per espandere)</span>
                                    </div>
                                </div>
                                ${actionHTML}
                            </div>
                            <div id="${bodyId}" style="display: none; border-top: 1.5px solid var(--text); padding: 0 1.25rem;">
                    `;
                    
                    let firstUnwatchedFound = false;
                    
                    if (seasonData.episodes && seasonData.episodes.length > 0) {
                        seasonData.episodes.forEach((ep, i) => {
                            const epKey = `S${String(seasonNum).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;
                            const isWatched = userSeries.progress && userSeries.progress[epKey];
                            
                            const isFuture = ep.air_date && ep.air_date > today;
                            const dateStr = ep.air_date ? ep.air_date.split('-').reverse().join('/') : "TBA";
                            
                            let rowIdAttr = '';
                            if (!isWatched && !firstUnwatchedFound && !isFuture) {
                                rowIdAttr = `id="first-unwatched-${tvId}-${seasonNum}"`;
                                firstUnwatchedFound = true;
                            }
                            
                            const titleClass = isWatched ? 'ep-title watched' : 'ep-title';
                            const titleStyle = isWatched ? 'color: var(--text-muted); text-decoration: line-through;' : 'color: var(--text);';
                            const isLast = i === seasonData.episodes.length - 1;
                            const borderBottom = isLast ? '' : 'border-bottom: 1px solid var(--border);';

                            let actionBtnHTML = '';
                            if (isFuture && !isWatched) {
                                actionBtnHTML = `<button class="btn btn-outline btn-small" style="white-space: nowrap; flex-shrink: 0; opacity: 0.4; cursor: not-allowed; border-color: var(--border); color: var(--text-muted);" disabled title="In onda il ${dateStr}">Non Uscito</button>`;
                            } else {
                                const btnClass = isWatched ? 'btn btn-success btn-small' : 'btn btn-outline btn-small';
                                const btnText = isWatched ? 'Visto' : 'Segna come visto';
                                actionBtnHTML = `<button id="btn-${tvId}-${epKey}" class="${btnClass}" style="white-space: nowrap; flex-shrink: 0;" onclick="toggleEpisode(${tvId}, '${epKey}')">${btnText}</button>`;
                            }

                            // ICONA SVG MINIMALE PER LA DATA AL POSTO DELL'EMOJI
                            const calendarSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;

                            html += `
                                <div ${rowIdAttr} style="display: flex; justify-content: space-between; align-items: center; padding: 1.25rem 0; ${borderBottom}">
                                    <div style="padding-right: 1rem;">
                                        <span id="title-${tvId}-${epKey}" class="${titleClass}" style="display: block; font-size: 1rem; font-weight: 700; ${titleStyle}">
                                            <span style="color: var(--text-muted); display: inline-block; width: 28px;">${ep.episode_number}.</span> 
                                            ${ep.name}
                                        </span>
                                        <span style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center;">
                                            ${calendarSvg} ${dateStr}
                                        </span>
                                    </div>
                                    ${actionBtnHTML}
                                </div>
                            `;
                        });
                    } else {
                        html += `<div style="padding: 1.25rem 0; color: var(--text-muted);">Nessun episodio trovato.</div>`;
                    }
                    
                    html += `</div></div>`;
                }
            }
        }
        detailContent.innerHTML = html;

    } catch (error) {
        console.error(error);
        detailContent.innerHTML = '<span style="color: var(--danger);">Errore critico nella lettura della cache. Controlla la console.</span>';
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

async function changeSeriesStatus(tvId, newStatus) {
    try {
        const userSeries = await UserLibrary.getItem(String(tvId));
        if (!userSeries) return;
        
        // Se il nuovo stato è "completed", spunta massivamente tutti gli episodi
        if (newStatus === 'completed') {
            const tmdbData = await TmdbCache.getItem(String(tvId));
            if (!userSeries.progress) userSeries.progress = {};
            
            if (tmdbData && tmdbData.detailed_seasons) {
                for (const [seasonNum, seasonData] of Object.entries(tmdbData.detailed_seasons)) {
                    if (seasonData.episodes) {
                        for (const ep of seasonData.episodes) {
                            const epKey = `S${String(seasonNum).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;
                            // Se l'episodio non è già segnato, lo segna
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
        }

        userSeries.status = newStatus;
        await UserLibrary.setItem(String(tvId), userSeries);
        console.log(`[SYS] Stato aggiornato per ${tvId}: ${newStatus}`);
        
        // Se siamo nel dettaglio, ricarica tutta la UI per mostrare le spunte verdi
        if (newStatus === 'completed' && window.currentOpenTvId === String(tvId)) {
            openDetailView(tvId);
        } else {
            renderHome();
        }
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
        const keys = await UserLibrary.keys();
        const exportObj = {};
        
        for (const key of keys) {
            exportObj[key] = await UserLibrary.getItem(key);
        }
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj));
        const downloadAnchorNode = document.createElement('a');
        
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `setfree_tv_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode); 
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        
        await customAlert("Backup esportato con successo. Conserva questo file al sicuro.");
    } catch (error) {
        console.error("Errore durante l'esportazione:", error);
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
            if (typeof importedData !== 'object' || importedData === null) throw new Error("Formato non valido");

            for (const [key, value] of Object.entries(importedData)) {
                await UserLibrary.setItem(key, value);
            }

            await customAlert("Backup ripristinato con successo! Ricarica la pagina o il cruscotto.");
            event.target.value = ''; 
            renderLibrary(); 

        } catch (error) {
            console.error("Errore durante l'importazione:", error);
            await customAlert("Il file selezionato non è un backup valido.");
        }
    };
    
    reader.readAsText(file);
}

// ==========================================
// MOTORE UI E NAVIGAZIONE
// ==========================================

const currentTheme = localStorage.getItem('tvTheme') || 'dark';
document.documentElement.setAttribute('data-theme', currentTheme);

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
    
    document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
    const targetNav = document.getElementById(`nav-${viewId}`);
    if (targetNav) targetNav.classList.add('active');

    if (viewId === 'library') renderLibrary();
    if (viewId === 'home') renderHome();
    if (viewId === 'stats') renderStats();
    
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
            searchSeries(); 
        }
    }
}

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
// EVENTI DI SISTEMA E INIZIALIZZAZIONE
// ==========================================

document.addEventListener('seasonSyncCompleted', (event) => {
    // ... il tuo codice esistente ...
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('[SYS] Service Worker registrato con successo.', reg.scope))
            .catch(err => console.error('[CRITICO] Registrazione Service Worker fallita:', err));

        setTimeout(silentCacheUpdate, 5000);
    });
}

// Init
switchTab('home');