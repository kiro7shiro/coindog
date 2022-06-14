const termkit = require('../node_modules/terminal-kit/lib/termkit.js')
const terminal = termkit.terminal

describe('', function () {

    it('', function () {

        for (let cCnt = 0; cCnt < 255; cCnt++) {

            terminal.colorGrayscale(cCnt).bgColorGrayscale(255 - cCnt, `color: ${cCnt} bgColor: ${255 -cCnt}\n`)
            terminal.styleReset()

        }

    })

})