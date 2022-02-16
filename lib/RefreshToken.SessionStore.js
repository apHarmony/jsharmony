const crypto = require('crypto');


const ExchangeErrorCodes = {
    reused: 1,
    expired: 2,
    invalidToken: 3
};

class RefreshTokenSessionStore {

    /** @type {RefreshToken | undefined} */
    #currentToken;
    /** @type { Map<string, RefreshToken> } */
    #issuedTokens = new Map();

    /**     
     * Return error codes are as follows:
     * 1 = reused token
     * 2 = expired token
     * 3 = invalid token
     *           
     * @param {string} token 
     * @param {number} expires - milliseconds since UNIX epoch at which the token will expire 
     * @return {{ errorCode: number | undefined, token: string }}
     */
     exchangeToken(token, expires) {
        
        const response = { errorCode: undefined, token: '' };

        if (this.#currentToken == null || this.#currentToken.token !== token) {
            response.errorCode = ExchangeErrorCodes.invalidToken;
        } else if (this.#currentToken.isExpired()) {
            response.errorCode = ExchangeErrorCodes.expired;            
        } else if (this.#issuedTokens.has(token)) {
            response.errorCode = ExchangeErrorCodes.reused;            
        } else {
            response.token = this.issueToken(expires);
        }

        this.prune();
        return response;
    }

    hasValidToken() {
        return this.#currentToken != null && !this.#currentToken.isExpired();
    }

    /**
     * @param {number} expires - milliseconds since UNIX epoch at which the token will expire 
     * @returns {string}
     */
    issueToken(expires) {

        if (this.#currentToken != null) {
            this.#issuedTokens.set(this.#currentToken.token, this.#currentToken);
        }

        this.#currentToken = new RefreshToken(crypto.randomBytes(32).toString('hex'), expires);        
        this.prune();
        return this.#currentToken.token;
    }

    /**
     * @private
     */
    prune() {
        for (const [key, token] of this.#issuedTokens.entries()) {
            if (token.isExpired()) {
                this.#issuedTokens.delete(key);
            }
        }
    }
}

class RefreshToken {

    /** @type {string} */
    get token() { return this.#token; }
    /** @type {string} */
    #expireTime;
    /** @type {string} */
    #token;

    /**     
     * @param {string} token 
     * @param {number} expireTime - ms elapsed since Unix epoch
     */
    constructor(token, expireTime) {
        this.#token = token;
        this.#expireTime = expireTime;
    }

    isExpired() {
        return this.#expireTime <= Date.now();
    }
}

exports = module.exports = RefreshTokenSessionStore;