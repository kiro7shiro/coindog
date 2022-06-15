const termkit = require('../node_modules/terminal-kit/lib/termkit.js')
const terminal = termkit.terminal
const { TableColors, TableStyle, MarketsTable } = require('../src/cli-ui/MarketsBox.js')


function terminate() {
    terminal.moveTo(1, terminal.height - 1)
    terminal.grabInput(false)
    terminal.hideCursor(false)
    terminal.styleReset()
    terminal.processExit()
}

terminal.on('key', function (name) {
    switch (name) {
        case 'CTRL_C':
            terminate()
            break
    }
})

function test() {
    const testData = [
        { symbol: 'xyz', value: 0 },
        { symbol: 2, value: 1 }
    ]
    const testStyle1 = new TableStyle({
        row: 2,
        cell: 1,
        color: TableColors.red,
        bgColor: TableColors.bgBrightYellow
    })
    const testStyle2 = new TableStyle({
        row: 3,
        cell: 0,
        color: TableColors.black,
        bgColor: TableColors.bgBrightCyan
    })
    const testStyle3 = new TableStyle({
        row: 3,
        color: TableColors.black,
        bgColor: TableColors.bgWhite
    })
    const document = terminal.createDocument()
    const marketsTable = new MarketsTable({
        parent: document,
        contentHasMarkup: 'legacyAnsi',
        x: 0,
        y: 0,
        width: terminal.width,
        height: 10,
    }, { data: testData })
    marketsTable.update([{ symbol: 3, value: 2 }, { symbol: 'xyz', value: 4 }, { symbol: 4, value: 5 }])
    marketsTable.applyStyle(testStyle3)
    marketsTable.applyStyle(testStyle2)
    marketsTable.applyStyle(testStyle1)
    marketsTable.drawStyles()

}

test()