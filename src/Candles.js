const { Candle } = require('./Candle.js')

class Candles extends Array {
    constructor({ candles = [], max = Infinity } = {}) {
        super()
        this.max = max
        this.add(candles)
    }
    get firstCandle() {
        return this[0]
    }
    get lastCandle() {
        return this[this.length - 1]
    }
    get timeframe() {
        let frame = 0
        if (this.length) {
            frame = this.reduce((frm, candle, index) => {
                if (index === 0) return frm
                const prev = this[index - 1]
                frm += candle.timestamp - prev.timestamp
                return frm
            }, 0)
            frame /= this.length
        }
        return frame
    }
    get rate() {
        return this.length / this.max
    }
    add(data) {
        let newCandles = data
        // check if data is raw
        if (data.length && !(data[0] instanceof Candle)) {
            newCandles = data.map(dat => new Candle(dat))
        }
        // filter out old candles
        const self = this
        newCandles = newCandles.filter(function (candle) {
            if (self.lastCandle) {
                return candle.timestamp > self.lastCandle.timestamp
            }
            return true
        })
        this.push(...newCandles)
        // limit candles
        if (this.max < Infinity && this.length > this.max) {
            do {
                this.shift()
            } while (this.length > this.max)
        }
    }
}

module.exports = { Candle, Candles }