const TMDB_CONFIG = {
    API_KEY: 'ad8ce1af0bf0576d76a5059e7903e5ca',
    BASE_URL: 'https://api.themoviedb.org/3',
    IMAGE_BASE_URL: 'https://image.tmdb.org/t/p/w500',
    
    buildTvUrl: function(tvId) {
        return `${this.BASE_URL}/tv/${tvId}?api_key=${this.API_KEY}&language=it-IT`;
    },

    buildSearchUrl: function(query) {
        // encodeURIComponent protegge la stringa da spazi e caratteri speciali
        return `${this.BASE_URL}/search/tv?api_key=${this.API_KEY}&language=it-IT&query=${encodeURIComponent(query)}`;
    }
};