const fs = require('fs')
const path = require('path')
const EventEmitter = require('events')
const ccxt = require('ccxt')
const Fuse = require('fuse.js')
const { Candle, Candles } = require('./Candles.js')
const { Supertrend } = require('./Trends.js')
const { buyOrSell, candleRate } = require('./Signals.js')

/**
 * Currently only supports bitfinex v2
 */
class Coindog extends EventEmitter {

    static timespans = {
        '1s': 1000,
        '1m': 1000 * 60,
        '1h': 1000 * 60 * 60
    }

    constructor(credentials, { dataPath = '../data' } = {}) {
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
        this.dataPath = dataPath
        this.timer = {
            diff: 0,
            fps: 0,
            frames: 0,
            handles: {
                analyze: 0
            },
            last: 0,
            lastFrame: 0,
            timeout: 1000 / 30,
        }
        this.timeframes = undefined
        this.running = false
        this.initialized = false
    }

    async analyze() {

        const self = this
        const timer = self.timer

        return new Promise(function (resolve, reject) {

            for (let mCnt = 0; mCnt < self.markets.length; mCnt++) {
                const market = self.markets[mCnt]
                if (market.candles && market.candles.length) {
                    self.emit('analyzing', market.symbol)
                    Supertrend(market)
                    buyOrSell(market)
                    const lastCandle = market.candles.lastCandle
                    const eventData = {
                        symbol: market.symbol,
                        position: self.inPosition(market),
                        trend: lastCandle?.uptrend || false,
                        signal: lastCandle?.signal || 'WAIT',
                        rate: market.candles.rate.toFixed(2)
                    }
                    self.emit('analyzed', eventData)
                }
            }

            timer.handles.analyze = setTimeout(async () => await self.analyze(), timer.timeout)

        })

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

    inPosition(market) {
        const { limits, base } = market
        if (this.balance.free[base]) {
            return this.balance.free[base] > limits.amount.min || this.balance.used[base] > limits.amount.min
        }
        return false
    }

    load({ dataPath } = {}) {
        if (dataPath) this.dataPath = dataPath
        const markets = path.resolve(this.dataPath, 'markets.json')
        this.markets = JSON.parse(fs.readFileSync(markets))
        return this
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
        fs.writeFileSync(path.resolve(this.dataPath, 'markets.json'), JSON.stringify(this.markets, null, 4))
    }

    saveCandles(market) {
        const file = path.resolve(this.dataPath, 'candles.json')
        let candles = {}
        if (fs.existsSync(file)) {
            const oldCandles = JSON.parse(fs.readFileSync(file))
            candles = Object.assign(candles, oldCandles)
        }
        if (candles.hasOwnProperty(market.symbol)) {
            const saved = new Candles(candles[market.symbol])
            saved.add(market.candles)
            candles[market.symbol] = saved
        } else {
            candles[market.symbol] = market.candles
        }
        fs.writeFileSync(file, JSON.stringify(candles, null, 4))
    }

    async watch({ timespan = 60, timeframe = 1 } = {}) {

        const self = this
        const timer = self.timer
        const maxCandles = timespan / timeframe
        const fetchTimeout = 60000 * timeframe
        const queue = self.queue
        let now = Date.now()

        return new Promise(async function (resolve, reject) {

            if (queue.length) {

                const market = queue.shift()
                
                if (!market.candles) market.candles = new Candles({ max: maxCandles })
                if (!market.counter) market.counter = {
                    last: 0,
                    requests: 0,
                    rpm: 0,
                    timeout: Coindog.timespans['1m']
                }
                if (!market.limiter) market.limiter = {
                    last: 0,
                    limit: 90 / 60 * 1000 + 25
                }

                const counter = market.counter
                const limiter = market.limiter
                let lastCandle = market.candles.lastCandle

                if (limiter.last + limiter.limit <= now) {

                    const since = lastCandle ? lastCandle.timestamp : now - Coindog.timespans['1h']
                    self.emit('fetching', market.symbol)
                    let fetched = []
                    try {
                        fetched = await self.exchange.fetchOHLCV(market.symbol, self.timeframes[0], since)
                    } catch (error) {
                        reject(error)
                    }
                    now = Date.now()
                    market.candles.add(fetched)
                    // emit data
                    counter.requests++
                    let firstCandle = market.candles.firstCandle
                    lastCandle = market.candles.lastCandle
                    if (!firstCandle) firstCandle = { timestamp: now - Coindog.timespans['1h'] }
                    if (!lastCandle) lastCandle = { timestamp: now }
                    const eventData = {
                        symbol: market.symbol,
                        first: new Date(firstCandle.timestamp).toLocaleTimeString(),
                        last: new Date(lastCandle.timestamp).toLocaleTimeString(),
                        fetched: `${fetched.length}/${market.candles.length}`,
                        rpm: counter.rpm.toFixed(2)
                    }
                    self.emit('fetched', eventData)
                    limiter.last = now

                }

                counter.rpm = counter.rpm * 0.75 + counter.requests * 0.25
                if (counter.last + counter.timeout <= now) {
                    counter.requests = 0
                    counter.last = now
                }
                if (lastCandle.timestamp + fetchTimeout <= now) {
                    queue.push(market)
                } else {
                    setTimeout(() => queue.push(market), fetchTimeout)
                }

            }

            timer.frames++
            timer.diff = now - timer.lastFrame
            if (timer.last + 1000 <= now) {
                timer.fps = timer.fps * 0.75 + timer.frames * 0.25
                timer.frames = 0
                timer.last = now
            }
            timer.lastFrame = now

            const eventData = {
                timeout: timer.diff,
                fps: timer.fps,
                queue: queue.length
            }
            self.emit('pause', eventData)

            setImmediate(async () => await self.watch())

        })
    }

    stop() {

    }
}

module.exports = { Coindog }