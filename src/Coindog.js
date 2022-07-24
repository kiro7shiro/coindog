const fs = require('fs')
const path = require('path')
const EventEmitter = require('events')
const ccxt = require('ccxt')
const Fuse = require('fuse.js')
const { Candles } = require('./Candles.js')
const { Supertrend } = require('./Trends.js')
const { buyOrSell } = require('./Signals.js')

/**
 * Currently only supports bitfinex v2
 */
class Coindog extends EventEmitter {

    constructor(credentials, { dataPath = '../data', sandbox = false } = {}) {
        super()
        this.key = credentials.key
        this.secret = credentials.secret
        this.exchange = new ccxt.bitfinex2({
            apiKey: this.key,
            secret: this.secret,
            enableRateLimit: true
        })
        this.sandbox = sandbox
        this.balance = undefined
        this.markets = []
        this.orders = []
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
        this.timespans = undefined
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
                    market.position = self.inPosition(market)
                    Supertrend(market)
                    buyOrSell(market)
                    const lastCandle = market.candles.lastCandle
                    const eventData = {
                        symbol: market.symbol,
                        position: market.position,
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
            // convert exchange time frames to milliseconds
            const { timeframes } = this.exchange
            this.timeframes = {}
            this.timespans = {}
            const second = 1000
            const minute = second * 60
            const hour = minute * 60
            const day = hour * 24
            for (let [timeframe, label] of Object.entries(timeframes)) {
                const [unit] = timeframe.slice(-1)
                const [number] = timeframe.split(unit)
                switch (unit) {
                    case 'm':
                        this.timespans[label] = Number(number) * minute
                        break
                    case 'h':
                        this.timespans[label] = Number(number) * hour
                        break
                    case 'd':
                        this.timespans[label] = Number(number) * day
                        break
                    case 'w':
                        if (number === '1') {
                            this.timespans[label] = Number(number) * day * 7
                        } else {
                            this.timespans[label] = Number(number) * day * 14
                        }
                        break
                    case 'M':
                        this.timespans[label] = Number(number) * day * 30
                        break
                }

            }
            this.timeframes = timeframes
            this.load()
            this.initialized = true
            this.emit('initialized')
        }
    }

    inPosition(market) {
        const { limits, base } = market
        if (!this.balance[base]) this.balance[base] = { free: 0, used: 0, total: 0 }
        if (this.balance[base].free) {
            return this.balance[base].free > limits.amount.min || this.balance[base].used > limits.amount.min
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

    async makeOrders(info) {

        const round = function (val, digits = 0) {
            const mult = Math.pow(10, digits)
            return Math.round(val * mult) / mult
        }
        const { symbol, signal } = info
        const [market] = this.markets.filter(m => m.symbol === symbol)
        const { base, quote, limits, precision } = market
        const { close } = market.candles.lastCandle
        const lastOrder = this.orders.reverse().find(function (o) {
            return o.symbol === symbol && o.signal !== signal
        })
        // don't forget to reverse ;)
        this.orders.reverse()
        const order = {
            symbol,
            signal,
            close,
            amount: 0,
            price: 0,
            delta: 0
        }

        if (!this.balance[base]) this.balance[base] = { free: 0, used: 0, total: 0 }

        if (signal === 'BUY' && this.balance.free[quote] > 0) {
            //order.amount = this.balance.free[quote] / close
            order.amount = 50 / close
            order.price = close * order.amount
            order.amount = round(order.amount, precision.amount)
            order.price = round(order.price, precision.price)
            if (order.amount >= limits.amount.min && order.price >= limits.price.min && this.balance[quote].free >= order.price) {
                if (lastOrder) order.delta = lastOrder.price - order.price
                this.balance[base].free += order.amount
                this.balance[quote].free -= order.price
                this.orders.push(order)
                this.emit('order', order)
            }
        } else if (signal === 'SELL') {
            order.amount = this.balance[base].free
            order.price = close * order.amount
            order.amount = round(order.amount, precision.amount)
            order.price = round(order.price, precision.price)
            if (order.amount >= limits.amount.min && order.price >= limits.price.min) {
                if (lastOrder) order.delta = order.price - lastOrder.price
                this.balance[base].free -= order.amount
                this.balance[quote].free += order.price
                this.orders.push(order)
                this.emit('order', order)
            }
        }

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

    /* '1m': 60000,
    '5m': 300000,
    '15m': 900000,
    '30m': 1800000,
    '1h': 3600000,
    '3h': 10800000,
    '4h': 14400000,
    '6h': 21600000,
    '12h': 43200000,
    '1D': 86400000,
    '7D': 604800000,
    '14D': 2419200000,
    '1M': 2592000000 */

    async watch() {

        const self = this
        const timer = self.timer
        const queue = self.queue

        return new Promise(async function (resolve, reject) {

            if (queue.length) {

                const market = queue.shift()
                if (!market.timer) market.timer = {
                    timespan: self.timespans['1h'],
                    timeframe: '1m'
                }
                const { timespan, timeframe } = market.timer
                if (!market.candles) market.candles = new Candles({ max: timespan / self.timespans[timeframe] })
                if (!market.limiter) market.limiter = {
                    last: 0,
                    limit: 90 / self.timespans['1m'] * 1000,
                    requests: 0,
                    rpm: 0,
                    lastRpm: 0
                }
                const limiter = market.limiter
                let lastCandle = market.candles.lastCandle

                if (limiter.last + limiter.limit <= Date.now()) {
                    const since = lastCandle ? lastCandle.timestamp : Date.now() - timespan
                    self.emit('fetching', market.symbol)
                    let fetched = []
                    try {
                        fetched = await self.exchange.fetchOHLCV(market.symbol, timeframe, since)
                        limiter.last = Date.now()
                        limiter.requests++
                    } catch (error) {
                        reject(error)
                    }
                    market.candles.add(fetched)
                    // emit data
                    let firstCandle = market.candles.firstCandle
                    lastCandle = market.candles.lastCandle
                    if (!firstCandle) firstCandle = { timestamp: Date.now() - self.timespans['1h'] }
                    if (!lastCandle) lastCandle = { timestamp: Date.now() }
                    const eventData = {
                        symbol: market.symbol,
                        first: new Date(firstCandle.timestamp).toLocaleTimeString(),
                        last: new Date(lastCandle.timestamp).toLocaleTimeString(),
                        fetched: `${fetched.length}/${market.candles.length}`,
                        rpm: limiter.rpm.toFixed(2)
                    }
                    self.emit('fetched', eventData)
                }
                limiter.rpm = limiter.rpm * 0.75 + limiter.requests * 0.25
                if (limiter.lastRpm + self.timespans['1m'] <= Date.now()) {
                    limiter.requests = 0
                    limiter.lastRpm = Date.now()
                }
                if (lastCandle.timestamp + self.timespans[timeframe] <= limiter.last) {
                    queue.push(market)
                } else {
                    setTimeout(() => queue.push(market), self.timespans[timeframe])
                }
            }

            timer.frames++
            timer.diff = Date.now() - timer.lastFrame
            if (timer.last + 1000 <= Date.now()) {
                timer.fps = timer.fps * 0.75 + timer.frames * 0.25
                timer.frames = 0
                timer.last = Date.now()
            }
            timer.lastFrame = Date.now()

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