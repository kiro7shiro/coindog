const EventEmitter = require('events')
const fs = require('fs')
const ccxt = require('ccxt')
const Fuse = require('fuse.js')
const { Candle } = require('./Candle.js')

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
        if (!this.exchange.markets) await this.exchange.loadMarkets()
        const symbols = Object.keys(this.exchange.markets)
        const fuse = new Fuse(symbols, { includeScore: true })
        const results = fuse.search(symbol)
        return results
    }
    async save(symbol) {
        if (symbol) {
            if (!this.exchange.markets) await this.exchange.loadMarkets()
            if (!this.exchange.markets[symbol]) throw new Error(`${symbol} not found in markets`)
            const market = this.exchange.markets[symbol]
            if (this.markets.findIndex(m => m.symbol === market.symbol) < 0) {
                this.markets.push(market)

            }
        }
        fs.writeFileSync(this.dataFile, JSON.stringify(this.markets, null, 4))
    }
    async watch({ maxCandles = 60 } = {}) {

        const self = this
        self.running = true

        return new Promise(async function (resolve, reject) {

            try {

                if (!self.initialized) await self.initialize()

                let last = 0
                if (Date.now() > self.timer.last + self.timer.timeout) {

                    // fetch candles for each market
                    for (let mCnt = 0; mCnt < self.markets.length; mCnt++) {
                        const market = self.markets[mCnt]
                        const [lastCandle] = market.candles ? market.candles.slice(-1) : []
                        const since = lastCandle ? lastCandle.timestamp : Date.now() - Coindog.timespans['1h'] * 2
                        self.emit('fetching', market.symbol)
                        const fetched = (await self.exchange.fetchOHLCV(market.symbol, self.timeframes[0], since)).map(function (data) {
                            return new Candle(data)
                        }).filter(function (candle) {
                            return candle.timestamp > since
                        })
                        market.candles = market.candles ? market.candles.concat(fetched) : fetched
                        const slicer = market.candles.length >= maxCandles ? market.candles.length - maxCandles : 0
                        market.candles = market.candles.slice(slicer)
                        self.emit('fetched', market)
                        // wait before fetching new candles
                        if (mCnt >= self.markets.length - 1) {
                            last = market.candles.slice(-1)[0].timestamp
                        }
                    }

                    self.timer.last = last ? last : Date.now()

                } else {
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