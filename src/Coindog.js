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
        this.handle = 0
        this.timer = {
            last: 0,
            timespan: Coindog.timespans['1m'],
            timeout: Coindog.timespans['1s'],
            rateLimit: Coindog.timespans['1m'] / 90
        }
        this.counter = {
            last: 0,
            request: 0,
            rpm: 0,
            timeout: Coindog.timespans['1s']
        }
        this.timer2 = {
            handle: 0,
            last: 0,
            timespan: Coindog.timespans['1s'],
            timeout: Coindog.timespans['1s'] / 60,
            rateLimit: Coindog.timespans['1m'] / 90
        }
        this.timeframes = undefined
        this.running = false
        this.initialized = false
    }

    async analyze() {

        const self = this

        return new Promise(function (resolve, reject) {

            for (let mCnt = 0; mCnt < self.markets.length; mCnt++) {
                const market = self.markets[mCnt]
                self.emit('analyzing', market.symbol)
                Supertrend(market)
                buyOrSell(market)
                const lastCandle = market.candles.lastCandle
                const eventData = {
                    symbol: market.symbol,
                    position: self.inPosition(market),
                    trend: lastCandle?.uptrend || false,
                    signal: lastCandle?.signal || 'WAIT',
                    rate: market.candles.rate.toFixed(2),
                    frame: market.candles.timeframe.toFixed(2)
                }
                self.emit('analyzed', eventData)
            }

            let handle = setTimeout(async () => await self.analyze(), Coindog.timespans['1s'])

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

    async watch({ maxCandles = 60 } = {}) {

        const self = this
        self.running = true

        const needToBeFetched = function (queue, market) {
            if (!market.candles) market.candles = new Candles({ max: maxCandles })
            if (!market.candles.lastCandle) {
                queue.push(market)
                return queue
            }
            if (market.candles.lastCandle.timestamp + self.timer.timespan < Date.now()) {
                queue.push(market)
                return queue
            }
            return queue
        }

        return new Promise(async function (resolve, reject) {

            try {

                const now = Date.now()

                // fetch candles for each market
                const queue = self.queue
                while (queue.length) {
                    const market = queue.shift()
                    let lastCandle = market.candles.lastCandle
                    const since = lastCandle ? lastCandle.timestamp : now - Coindog.timespans['1h']
                    self.emit('fetching', market.symbol)
                    const fetched = await self.exchange.fetchOHLCV(market.symbol, self.timeframes[0], since)
                    market.candles.add(fetched)
                    // emit data
                    let firstCandle = market.candles.firstCandle
                    lastCandle = market.candles.lastCandle
                    if (!firstCandle) firstCandle = { timestamp: 0 }
                    if (!lastCandle) lastCandle = { timestamp: 0 }
                    const eventData = {
                        symbol: market.symbol,
                        first: new Date(firstCandle.timestamp).toLocaleTimeString(),
                        last: new Date(lastCandle.timestamp).toLocaleTimeString(),
                        fetched: `${fetched.length}/${market.candles.length}`
                    }
                    self.emit('fetched', eventData)
                }

                // set pause timer
                self.timer.last = Math.max(...self.markets.reduce(function (timestamps, market) {
                    if (market.candles && market.candles.lastCandle) {
                        timestamps.push(market.candles.lastCandle.timestamp)
                    }
                    return timestamps
                }, [now - Coindog.timespans['1m']]))

                // prepare queue for next iteration
                queue.push(...self.markets.reduce(needToBeFetched, []))

                // calc new timeout
                self.timer.timeout = self.timer.rateLimit / ((90 / queue.length) || 1)

                self.counter.request += queue.length
                if (self.counter.last + self.counter.timeout <= now) {
                    self.counter.rpm = self.counter.rpm * 0.5 + self.counter.request * 0.5
                    self.counter.request = 0
                    self.counter.last = now
                }

                const remaining = self.timer.timespan - (now - self.timer.last)
                const eventData = {
                    remaining,
                    rpm: self.counter.rpm,
                    queue: queue.length,
                    timeout: self.timer.timeout
                }
                self.emit('pause', eventData)

                // resolve promise if stopped
                if (self.running) {
                    self.handle = setTimeout(async () => await self.watch(), self.timer.timeout)
                } else {
                    resolve()
                }

            } catch (error) {

                reject(error)

            }

        })

    }

    async watch2({ maxCandles = 60 } = {}) {
        const self = this
        const timer2 = self.timer2
        const now = Date.now()

        const needToBeFetched = function (queue, market) {
            if (queue.findIndex(m => m.symbol === market.symbol) > -1) return queue
            if (!market.candles) market.candles = new Candles({ max: maxCandles })
            if (!market.candles.lastCandle) {
                queue.push(market)
                return queue
            }
            if ((market.candles.lastCandle.timestamp + Coindog.timespans['1m']) < now) {
                queue.push(market)
                return queue
            }
            return queue
        }

        return new Promise(async function (resolve, reject) {

            let queue = self.queue
            const counter = self.counter

            queue = self.markets.reduce(needToBeFetched, queue)

            if (queue.length) {
                const market = queue.shift()
                let lastCandle = market.candles.lastCandle
                const since = lastCandle ? lastCandle.timestamp : now - Coindog.timespans['1h']
                self.emit('fetching', market.symbol)
                const fetched = await self.exchange.fetchOHLCV(market.symbol, self.timeframes[0], since)
                market.candles.add(fetched)
                // emit data
                let firstCandle = market.candles.firstCandle
                lastCandle = market.candles.lastCandle
                if (!firstCandle) firstCandle = { timestamp: 0 }
                if (!lastCandle) lastCandle = { timestamp: 0 }
                const eventData = {
                    symbol: market.symbol,
                    first: new Date(firstCandle.timestamp).toLocaleTimeString(),
                    last: new Date(lastCandle.timestamp).toLocaleTimeString(),
                    fetched: `${fetched.length}/${market.candles.length}`
                }
                self.emit('fetched', eventData)
                counter.request++
                timer2.last = now
            }
            
            if (counter.last + counter.timeout <= now) {
                counter.rpm = counter.rpm * 0.75 + counter.request * 0.25
                counter.request = 0
                counter.last = now
            }

            const eventData = {
                remaining: 0,
                rpm: counter.rpm * 60,
                queue: queue.length,
                timeout: timer2.timeout
            }
            self.emit('pause', eventData)

            timer2.handle = setTimeout(async () => await self.watch2(), timer2.timeout)

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