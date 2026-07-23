const TMDB_CONFIG = {
    API_KEY: 'ad8ce1af0bf0576d76a5059e7903e5ca',
    BASE_URL: 'https://api.themoviedb.org/3',
    IMAGE_BASE_URL: 'https://image.tmdb.org/t/p/w500',
    
    buildTvUrl: function(tvId) {
        return `${this.BASE_URL}/tv/${tvId}?api_key=${this.API_KEY}&language=it-IT&append_to_response=videos,credits,watch/providers`;
    },

    buildMovieUrl: function(movieId) {
        return `${this.BASE_URL}/movie/${movieId}?api_key=${this.API_KEY}&language=it-IT&append_to_response=videos,credits,watch/providers`;
    },

    buildSearchUrl: function(query, type = 'tv') {
        return `${this.BASE_URL}/search/${type}?api_key=${this.API_KEY}&language=it-IT&query=${encodeURIComponent(query)}`;
    },

    buildPersonUrl: function(personId) {
        return `${this.BASE_URL}/person/${personId}?api_key=${this.API_KEY}&language=it-IT&append_to_response=combined_credits`;
    },

    buildTrendingUrl: function(mediaType = 'tv') {
        // mediaType può essere 'tv' o 'movie'
        return `${this.BASE_URL}/trending/${mediaType}/week?api_key=${this.API_KEY}&language=it-IT`;
    }
};