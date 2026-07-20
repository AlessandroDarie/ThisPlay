// Motore di Debounce: blocca le raffiche di chiamate API
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        // Se l'utente preme un tasto, cancella il timer precedente
        clearTimeout(timeoutId);
        // Fa partire un nuovo timer
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// 1. Inizializzazione dei silos asincroni tramite localForage
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

// 2. Motore di test e validazione dell'infrastruttura
async function testDownloadAndCache(tvId) {
    try {
        console.log(`[SYS] Richiesta dati a TMDB per ID: ${tvId}...`);
        
        const url = TMDB_CONFIG.buildTvUrl(tvId);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Errore HTTP ${response.status}: Verifica la validità della tua API Key o la tua connessione.`);
        }
        
        const data = await response.json();
        
        // Applicazione della marca temporale per logica di cache futura
        data.last_updated = Date.now();
        
        // Scrittura asincrona. Se fallisce qui, il browser ha esaurito lo spazio o bloccato IndexedDB
        await TmdbCache.setItem(String(tvId), data);
        console.log(`[OK] Serie "${data.name}" salvata con successo in TmdbCache!`);
        
        // Lettura asincrona per confermare l'integrità del dato scritto
        const savedData = await TmdbCache.getItem(String(tvId));
        console.log("[DATA] Estrazione dal database locale completata:", savedData);
        
    } catch (error) {
        console.error("[CRITICO] Fallimento architettura dati:", error);
    }
}



async function addSeriesToLibraryFromSearch(tvId) {
    if (!tvId) return;

    try {
        console.log(`[SYS] Inizio procedura di tracciamento per ID: ${tvId}...`);

        // 2. Controllo duplicati (Interrogazione del database asincrono)
        const existingEntry = await UserLibrary.getItem(String(tvId));
        if (existingEntry) {
            console.warn(`[AVVISO] La serie con ID ${tvId} è già presente nella tua libreria.`);
            return; // Blocca l'esecuzione, evitiamo sovrascritture accidentali
        }

        // 3. Scaricamento dati freschi da TMDB
        const url = TMDB_CONFIG.buildTvUrl(tvId);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Serie non trovata o errore di rete (Status: ${response.status})`);
        }
        
        const tmdbData = await response.json();

        // 4. Scrittura nel Silos Pesante (TmdbCache)
        tmdbData.last_updated = Date.now();
        await TmdbCache.setItem(String(tvId), tmdbData);

        // 5. Scrittura nel Silos Leggero (UserLibrary) con il modello ottimizzato
        const userSeriesModel = {
            id: tvId,
            status: "watching",
            added_at: Date.now(),
            watched_count: 0,
            progress: {} // La Mappa vuota (Complessità O(1)) pronta per gli episodi
        };
        
        await UserLibrary.setItem(String(tvId), userSeriesModel);

        console.log(`[SUCCESSO] "${tmdbData.name}" aggiunta alla libreria utente!`);
        inputElement.value = ''; // Pulisce il campo di testo

    } catch (error) {
        console.error("[CRITICO] Fallimento durante l'aggiunta:", error);
    }
}

async function searchSeries() {
    const inputElement = document.getElementById('search-input');
    const resultsContainer = document.getElementById('search-results');
    const query = inputElement.value.trim();

    if (!query) return;

    try {
        // Svuota i risultati precedenti e mostra caricamento
        resultsContainer.innerHTML = '<span style="color: #a1a1aa;">Ricerca in corso...</span>';

        const url = TMDB_CONFIG.buildSearchUrl(query);
        const response = await fetch(url);
        
        if (!response.ok) throw new Error("Errore durante la ricerca.");
        
        const data = await response.json();
        const results = data.results;

        // Pulizia del contenitore
        resultsContainer.innerHTML = '';

        if (results.length === 0) {
            resultsContainer.innerHTML = '<span style="color: #ef4444;">Nessun risultato trovato.</span>';
            return;
        }

        // Prendi solo i primi 5 risultati per non inondare l'interfaccia
        const topResults = results.slice(0, 5);

        topResults.forEach(series => {
            // Estrae l'anno di uscita se disponibile
            const year = series.first_air_date ? series.first_air_date.substring(0, 4) : 'N/A';
            
            const item = document.createElement('div');
            item.style = "display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: #18181b; border: 1px solid #3f3f46; border-radius: 4px;";
            item.innerHTML = `
                <div>
                    <strong>${series.name}</strong> <span style="color: #a1a1aa; font-size: 0.9em;">(${year})</span>
                </div>
                <button onclick="addSeriesToLibraryFromSearch(${series.id})" style="padding: 0.25rem 0.75rem; background: #4ade80; color: #064e3b; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.8rem;">
                    Traccia
                </button>
            `;
            resultsContainer.appendChild(item);
        });

    } catch (error) {
        console.error(error);
        resultsContainer.innerHTML = '<span style="color: #ef4444;">Errore di connessione o API.</span>';
    }
}