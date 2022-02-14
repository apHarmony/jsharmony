const RefreshTokenUserStore = require('./RefreshToken.UserStore');

class RefreshTokenStore {
        
    /** @type {Map<string, RefreshTokenUserStore>} */
    #store = new Map();

    /**     
     * @param {string} username 
     * @param {string} sessionId 
     */
    clearSessionTokenStore(username, sessionId) {
        this.#getUserStore(username).clearSessionTokenStore(sessionId);
    }

    /**
     * Return error codes are as follows:
     * 1 = reused token
     * 2 = expired token
     * 3 = invalid token
     * 
     * @param {string} username 
     * @param {string} sessionId 
     * @param {string} token 
     * @param {number} expires - milliseconds since UNIX epoch at which the token will expire 
     * @return {{ errorCode: number | undefined, token: string }}
     */
    exchangeToken(username, sessionId, token, expires) {
        return this.#getUserStore(username).exchangeToken(sessionId, token, expires);
    }

    /**
     * @param {string} username 
     * @param {string} sessionId 
     * @param {number} expires - milliseconds since UNIX epoch at which the token will expire 
     * @returns {string}
     */
    issueToken(username, sessionId, expires) {
        return this.#getUserStore(username).issueToken(sessionId, expires);        
    }

    #getUserStore(username) {
        let userStore = this.#store.get(username);
        if (userStore == null) {
            userStore = new RefreshTokenUserStore();
            this.#store.set(username, userStore);
        }
        return userStore;
    }
}

exports = module.exports = RefreshTokenStore;