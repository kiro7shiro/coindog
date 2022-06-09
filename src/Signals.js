class Signals {

    /**
     * 
     * @param {Object} market
     * @param {Object} [options]
     * @param {Number} [options.period] 
     * @returns 
     */
    static buyOrSell = function (market, { period = 14 } = {}) {
        for (let cCnt = period + 1; cCnt < market.candles.length; cCnt++) {
            const prev = market.candles[cCnt - 1]
            const curr = market.candles[cCnt]
            if (curr.signal) continue
            switch (true) {
                case !prev.uptrend && curr.uptrend && !market.inPosition:
                    curr.signal = 'BUY'
                    break
                case prev.uptrend && !curr.uptrend && market.inPosition:
                    curr.signal = 'SELL'
                    break
                case curr.uptrend && !market.inPosition:
                    curr.signal = 'BUY'
                    break
                case !curr.uptrend && market.inPosition:
                    curr.signal = 'SELL'
                    break
                default:
                    curr.signal = 'WAIT'
                    break
            }
        }
        return
    }

}

module.exports = Signals