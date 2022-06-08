const assert = require('assert')
const { Candle, Candles } = require('../src/Candles.js')

describe('candles', function () {

    it('initialize', function () {
        
        const test = []

        for (let cCnt = 0; cCnt < 4; cCnt++) {
            const candle = new Candle([cCnt * 1, cCnt * 2, cCnt * 3, cCnt * 4, cCnt * 5, cCnt * 6])
            test.push(candle)
        }

        const candles = new Candles({ candles: test, max: 3 })
 
        console.log({ candles })
        console.log({
            first: candles.firstCandle,
            last: candles.lastCandle
        })

    })

})