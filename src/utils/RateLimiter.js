class RateLimiter {
    constructor(limit = 10, interval = 1000) {
        this.limit = limit; // max requests
        this.interval = interval; // window in ms
        this.users = new Map();
    }

    isAllowed(userId) {
        const now = Date.now();
        if (!this.users.has(userId)) {
            this.users.set(userId, []);
        }

        const userRequests = this.users.get(userId).filter(time => now - time < this.interval);
        if (userRequests.length < this.limit) {
            userRequests.push(now);
            this.users.set(userId, userRequests);
            return true;
        }
        return false;
    }
}

module.exports = RateLimiter;
