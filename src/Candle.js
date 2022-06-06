class Candle {
    constructor(data) {
        this.timestamp = data[0]
        this.open = data[1]
        this.high = data[2]
        this.low = data[3]
        this.close = data[4]
        this.volume = Number(data[5].toFixed(2))
    }
}
exports.Candle = Candle
