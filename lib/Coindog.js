const EventEmitter = require('events')
const fs = require('fs')
const ccxt = require('ccxt')
const Fuse = require('fuse.js')

/**
 * Currently only supports bitfinex v2
 */
class Coindog extends EventEmitter {
    constructor(credentials) {
        super()
        this.key = credentials.key
        this.secret = credentials.secret
        this.exchange = new ccxt.bitfinex2({
            apiKey: this.key,
            secret: this.secret,
            enableRateLimit: true
        })
        this.symbols = []
        this.symbolsPath = './data/symbols.json'
        this.timer = {
            last: 0,
            handle: 0,
            timeout: this.exchange.rateLimit
        }
        this.load()
    }
    load() {
        this.symbols = JSON.parse(fs.readFileSync(this.symbolsPath))
    }
    async remove(symbol) {
        const symbols = this.symbols.reduce(function (prev, curr) {
            prev.push(curr.symbol)
            return prev
        }, [])
        const fuse = new Fuse(symbols)
        const results = fuse.search(symbol)
        if (results.length) {
            const [hit] = results
            this.symbols.splice(hit.refIndex, 1)
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
            if (this.symbols.findIndex(m => m.symbol === market.symbol) < 0) {
                this.symbols.push(market)
            }
        }
        fs.writeFileSync(this.symbolsPath, JSON.stringify(this.symbols, null, 4))
    }
    async watch() {
        const now = performance.now()
        this.timer.last = now
        console.log({ now })
        this.timer.handle = setTimeout(async () => {
            await this.watch()
        }, this.timer.timeout)
    }
}

module.exports = { Coindog }