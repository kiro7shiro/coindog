const { ATR } = require('technicalindicators')

class Trends {

    static Supertrend = function (market, period = 14, multiplier = 3) {
        // calc average true range
        const atr = ATR.calculate({
            high: market.candles.reduce(function (prev, curr) {
                prev.push(curr.high)
                return prev
            }, []),
            low: market.candles.reduce(function (prev, curr) {
                prev.push(curr.low)
                return prev
            }, []),
            close: market.candles.reduce(function (prev, curr) {
                prev.push(curr.close)
                return prev
            }, []),
            period
        })
        for (let dCnt = period; dCnt < market.candles.length; dCnt++) {
            const candle = market.candles[dCnt]
            candle.atr = atr[dCnt - period]
        }
        // init uptrend flag
        market.candles.map(function (candle, index) {
            if (index >= period) {
                candle.uptrend = true
            }
            return candle
        })
        // calc supertrend
        for (let dCnt = period + 1; dCnt < market.candles.length; dCnt++) {
            const curr = market.candles[dCnt]
            const prev = market.candles[dCnt - 1]
            const hl2 = (curr.high + curr.low) / 2
            const precision = market.precision.price
            curr.upperBand = Number((hl2 + (multiplier * curr.atr)).toFixed(precision))
            curr.lowerBand = Number((hl2 - (multiplier * curr.atr)).toFixed(precision))
            if (curr.close > prev.upperBand) {
                curr.uptrend = true
            } else if (curr.close < prev.lowerBand) {
                curr.uptrend = false
            } else {
                curr.uptrend = prev.uptrend
                if (curr.uptrend && curr.lowerBand < prev.lowerBand) {
                    curr.lowerBand = prev.lowerBand
                }
                if (!curr.uptrend && curr.upperBand > prev.upperBand) {
                    curr.upperBand = prev.upperBand
                }
            }
    
        }
        return
    }

}

module.exports = Trends