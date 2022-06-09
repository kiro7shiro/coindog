const EventEmitter = require('events')
const fs = require('fs')
const ccxt = require('ccxt')
const Fuse = require('fuse.js')
const { Candle, Candles } = require('./Candles.js')

/**
 * Currently only supports bitfinex v2
 */
class Coindog extends EventEmitter {

    static timespans = {
        '1s': 1000,
        '1m': 1000 * 60,
        '1h': 1000 * 60 * 60
    }

    constructor(credentials, dataFile) {
        super()
        this.key = credentials.key
        this.secret = credentials.secret
        this.exchange = new ccxt.bitfinex2({
            apiKey: this.key,
            secret: this.secret,
            enableRateLimit: true
        })
        this.sandbox = false
        this.balance = undefined
        this.markets = []
        this.queue = []
        this.dataFile = dataFile
        this.handle = 0
        this.timer = {
            last: 0,
            timeout: Coindog.timespans['1m'],
            rateLimit: this.exchange.rateLimit
        }
        this.timeframes = undefined
        this.running = false
        this.initialized = false
    }
    async initialize() {
        if (!this.initialized) {
            this.emit('initializing')
            if (!this.balance) await this.loadBalance()
            if (!this.exchange.markets) await this.exchange.loadMarkets()
            this.timeframes = this.exchange.timeframes
            this.load()
            this.initialized = true
            this.emit('initialized')
        }
    }
    load({ dataFile } = {}) {
        if (dataFile) this.dataFile = dataFile
        this.markets = JSON.parse(fs.readFileSync(this.dataFile))
        return this.markets
    }
    async loadBalance() {
        this.balance = await this.exchange.fetchBalance()
        return this.balance
    }
    async remove(symbol) {
        const symbols = this.markets.reduce(function (prev, curr) {
            prev.push(curr.symbol)
            return prev
        }, [])
        const fuse = new Fuse(symbols)
        const results = fuse.search(symbol)
        if (results.length) {
            const [hit] = results
            this.markets.splice(hit.refIndex, 1)
            await this.save()
            return hit.item
        }
        return false
    }
    async search(symbol) {
        const symbols = Object.keys(this.exchange.markets)
        const fuse = new Fuse(symbols, { includeScore: true })
        const results = fuse.search(symbol)
        return results
    }
    async save(symbol) {
        if (symbol) {
            if (!this.exchange.markets[symbol]) throw new Error(`${symbol} not found in markets`)
            const market = this.exchange.markets[symbol]
            if (this.markets.findIndex(m => m.symbol === market.symbol) < 0) {
                this.markets.push(market)
            }
        }
        fs.writeFileSync(this.dataFile, JSON.stringify(this.markets, null, 4))
    }
    
    async watch() {

        const self = this
        self.running = true

        const needToBeFetched = function (queue, market) {
            if (!market.candles) market.candles = new Candles({ max: 60 })
            if (!market.candles.lastCandle) {
                queue.push(market)
                return queue
            }
            if (market.candles.lastCandle.timestamp + self.timer.timeout < Date.now()) {
                queue.push(market)
                return queue
            }
            return queue
        }

        return new Promise(async function (resolve, reject) {

            try {

                const queue = self.queue

                while (queue.length) {
                    const market = queue.shift()
                    const lastCandle = market.candles.lastCandle
                    const since = lastCandle ? lastCandle.timestamp : Date.now() - Coindog.timespans['1h']
                    self.emit('fetching', market.symbol)
                    const fetched = await self.exchange.fetchOHLCV(market.symbol, self.timeframes[0], since)
                    market.candles.add(fetched)
                    // emit data
                    const eventData = {
                        symbol: market.symbol,
                        first: new Date(market.candles.firstCandle.timestamp).toLocaleTimeString(),
                        last: new Date(market.candles.lastCandle.timestamp).toLocaleTimeString(),
                        fetched: `${fetched.length}/${market.candles.length}`,
                        position: '',
                        trend: '',
                        signal: '',
                    }
                    self.emit('fetched', eventData)
                }

                self.timer.last = Math.max(...self.markets.reduce(function (timestamps, market) {
                    if (market.candles && market.candles.lastCandle) {
                        timestamps.push(market.candles.lastCandle.timestamp)
                    }
                    return timestamps
                }, [Date.now() - Coindog.timespans['1m']]))

                queue.push(...self.markets.reduce(needToBeFetched, []))

                if (!queue.length) {
                    const remaining = self.timer.last + self.timer.timeout - Date.now()
                    self.emit('pause', remaining)
                }

                if (self.running) {
                    self.handle = setTimeout(async () => await self.watch(), self.timer.rateLimit)
                } else {
                    resolve()
                }

            } catch (error) {

                reject(error)

            }

        })

    }

    stop() {
        this.running = false
        if (this.handle) {
            clearTimeout(this.handle)
            this.handle = 0
        }
    }
}

module.exports = { Coindog }