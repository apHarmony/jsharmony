const RefreshTokenSessionStore = require('./RefreshToken.SessionStore.js');

class RefreshTokenUserStore {

    /** @type {Map<string, RefreshTokenSessionStore} */
    #store = new Map();

    /**
     * @param {string} sessionId
     */
    clearSessionTokenStore(sessionId) {
        this.#store.delete(sessionId);
        this.prune();
    }

    /**
     * Return error codes are as follows:
     * 1 = reused token
     * 2 = expired token
     * 3 = invalid token
     *
     * @param {string} sessionId
     * @param {string} token
     * @param {number} expires - milliseconds since UNIX epoch at which the token will expire 
     * @return {{ errorCode: number | undefined, token: string }}
     */
    exchangeToken(sessionId, token, expires) {
        const sessionStore = this.getSessionStore(sessionId);
        const response = sessionStore.exchangeToken(token, expires);
        this.prune();
        return response;
    }

    /**
     * @param {string} sessionId
     * @param {number} expires - milliseconds since UNIX epoch at which the token will expire 
     * @return {string}
     */
    issueToken(sessionId, expires) {
        const sessionStore = this.getSessionStore(sessionId);
        const token = sessionStore.issueToken(expires);
        this.prune();
        return token;
    }

    /**
     * @private
     */
    getSessionStore(sessionId) {
        let sessionStore = this.#store.get(sessionId);
        if (sessionStore == null) {
            sessionStore = new RefreshTokenSessionStore();
            this.#store.set(sessionId, sessionStore);
        }
        return sessionStore;
    }

    /**
     * @private
     */
    prune() {
        for (const [key, sessionStore] of this.#store.entries()) {
            if (!sessionStore.hasValidToken()) {
                this.#store.delete(key);
            }
        }
    }
}

exports = module.exports = RefreshTokenUserStore;