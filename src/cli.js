const termkit = require('../node_modules/terminal-kit/lib/termkit.js')
const terminal = termkit.terminal
const asciichart = require('asciichart')
const Table = require('easy-table')
const { TableColors, TableStyle, MarketsTable } = require('./cli-ui/MarketsTable.js')
const credentials = require('../credentials/credentials.js')
const { Coindog } = require('../src/Coindog.js')

const watchdog = new Coindog(credentials.BITFINEX)

// *helper functions

function statusToTable(status) {
    status.status = status.status === 'ok' ? terminal.str.green(status.status) : terminal.str.red(status.status)
    status.updated = new Date(status.updated).toLocaleString()
    return Table.print(status)
}

function balanceToTable(balance) {
    const keys = Object.keys(balance).filter(function (key) {
        return key !== 'info' && key !== 'free' && key !== 'used' && key !== 'total'
    })
    const result = []
    for (let kCnt = 0; kCnt < keys.length; kCnt++) {
        const key = keys[kCnt]
        const symbol = Object.assign({}, { symbol: key }, balance[key])
        result.push(symbol)
    }
    return Table.print(result)
}

function marketsToTable(markets) {
    const result = markets.reduce(function (accu, curr) {
        accu.push({ markets: curr.symbol })
        return accu
    }, [])
    return Table.print(result)
}

// *cli methods

async function cliInfo() {
    if (!watchdog.initialized) await watchdog.initialize()
    terminal('getting status informaions... ')
    let spinner = await terminal.spinner()
    const status = await watchdog.exchange.fetchStatus()
    spinner.hidden = true
    // print status info
    terminal('\n\n')
    terminal(statusToTable(status))
    terminal('\n')
    // print markets info
    terminal(`watching: ${watchdog.markets.length}\n`)
    terminal(marketsToTable(watchdog.markets))
    terminal('\n')
    terminal(`rateLimit: ${watchdog.exchange.rateLimit}\n`)
    const symbols = Object.keys(watchdog.exchange.markets)
    terminal(`markets: ${symbols.length}\n`)
    console.log({ timeframes: watchdog.timeframes })
    console.log({ timeSpans: watchdog.timespans })
    //terminal(`timeframes: ${watchdog.timeframes}\n\n`)
    // print balance info
    terminal('loading balance... ')
    spinner = await terminal.spinner()
    const balance = await watchdog.loadBalance()
    spinner.hidden = true
    terminal('\n\n')
    terminal(balanceToTable(balance))
    terminal('\n')

}

async function cliSearch(key) {
    if (!watchdog.initialized) await watchdog.initialize()
    terminal(`searching '${key}'... `)
    const spinner = await terminal.spinner()
    const results = await watchdog.search(key)
    const items = results.reduce(function (prev, curr) {
        if (curr.score < 0.1) prev.push(`${curr.item}`)
        return prev
    }, [])
    spinner.hidden = true
    if (items.length) {
        terminal(`\nselect symbol to watch:\n`)
        const select = await terminal.gridMenu(items).promise
        await watchdog.save(select.selectedText)
        terminal(`\n${select.selectedText} saved...\n`)
    } else {
        terminal(`\nno markets found for: ${key}\n`)
    }
}

async function cliRemove(symbol) {
    if (!watchdog.initialized) await watchdog.initialize()
    if (!symbol) {
        const items = watchdog.markets.reduce(function (prev, curr) {
            prev.push(curr.symbol)
            return prev
        }, [])
        terminal(`select a symbol to remove:\n`)
        const select = await terminal.singleColumnMenu(items).promise
        symbol = select.selectedText
    }
    const result = await watchdog.remove(symbol)
    if (result) {
        terminal(`\n${result} removed...\n`)
    }
}

async function cliWatch(markets) {

    // configuration/ settings ???

    terminal.clear()

    // *create ui
    const document = terminal.createDocument()
    const title = new termkit.TextBox({
        parent: document,
        content: 'COINDOG 1.0',
        contentHasMarkup: 'legacyAnsi',
        x: 1,
        y: 0,
        width: terminal.width,
        height: 1,
        attr: { bgColor: 'default' }
    })

    const timerBox = new termkit.TextBox({
        parent: document,
        content: '',
        contentHasMarkup: 'legacyAnsi',
        x: 0,
        y: 0,
        attr: { bgColor: 'default' }
    })

    const marketsTable = new MarketsTable({
        parent: document,
        content: '',
        contentHasMarkup: 'legacyAnsi',
        x: 0,
        y: 0,
        attr: { bgColor: 'default' }
    }, {
        headers: [
            'symbol',
            'first',
            'last',
            'fetched',
            'rpm',
            'rate',
            'position',
            'trend',
            'signal'
        ]
    })

    const chartBox = new termkit.TextBox({
        parent: document,
        content: '',
        contentHasMarkup: 'legacyAnsi',
        x: 0,
        y: 0,
        attr: { bgColor: 'default' }
    })

    const balanceBox = new termkit.TextBox({
        parent: document,
        content: '',
        contentHasMarkup: 'legacyAnsi',
        x: 0,
        y: 0,
        attr: { bgColor: 'default' }
    })

    const ordersBox = new termkit.TextBox({
        parent: document,
        content: '',
        contentHasMarkup: 'legacyAnsi',
        x: 0,
        y: 0,
        attr: { bgColor: 'default' },
        scrollable: true,
        vScrollBar: true
    })

    const messageBox = new termkit.TextBox({
        parent: document,
        content: '',
        contentHasMarkup: 'legacyAnsi',
        x: 0,
        y: 0,
        attr: { bgColor: 'default' }
    })

    // *ui update functions
    const resize = function () {
        const { width, height } = terminal
        const marketsWidth = marketsTable.text.split('\n')[0].length || 0
        const balanceHeight = balanceBox.getContent().split('\n').length || 0
        timerBox.setSizeAndPosition({
            x: 1,
            y: title.outputY + 2,
            height: 1,
            width: timerBox.getContent().length
        })
        marketsTable.setSizeAndPosition({
            x: 1,
            y: timerBox.outputY + 2,
            height: height / 2,
            width: marketsWidth
        })
        const chartContentWidth = chartBox.getContent().split('\n')[0].length
        const chartWidth = chartContentWidth > (width / 2) ? (width / 2) : chartContentWidth
        chartBox.setSizeAndPosition({
            x: marketsTable.outputWidth + 4,
            y: timerBox.outputY + 2,
            height: height / 2,
            width: chartWidth
        })
        balanceBox.setSizeAndPosition({
            x: 1,
            y: height / 2,
            height: balanceHeight,
            width: width / 4
        })
        ordersBox.setSizeAndPosition({
            x: marketsTable.outputWidth + 4,
            y: height / 2,
            height: 10,
            width: width / 2
        })
        messageBox.setSizeAndPosition({
            x: 1,
            y: height - 2,
            height: 1,
            width: width
        })
    }

    // *events
    watchdog.on('initializing', function () {
        messageBox.setContent('loading ...')
    })

    watchdog.on('initialized', function () {
        messageBox.setContent('')
        let balanceText = balanceToTable(watchdog.balance)
        balanceBox.setContent(balanceText)
        resize()
    })

    watchdog.on('fetching', function (symbol) {
        messageBox.setContent(`fetching ${symbol} ...`)
    })

    const highlight = new TableStyle({
        row: 0,
        color: TableColors.black,
        bgColor: TableColors.bgWhite
    })

    watchdog.on('fetched', function (info) {
        messageBox.setContent(`fetching ${info.symbol} ...done`)
        marketsTable.update([info])
        highlight.row = marketsTable.data.findIndex(m => m.symbol === info.symbol) + 2
        marketsTable.applyStyle(highlight)
        if (highlight.row === selected.row) {
            // update chart too
            const symbol = marketsTable.data[selected.row - 2].symbol
            const market = watchdog.markets.find(m => m.symbol === symbol)
            drawChart(market)
        }
        resize()
    })

    watchdog.on('analyzed', function (info) {
        marketsTable.update([info])
        const row = marketsTable.data.findIndex(m => m.symbol === info.symbol) + 2
        if (info.position) {
            marketsTable.applyStyle(new TableStyle({
                row,
                cell: 6,
                color: TableColors.green,
                bgColor: TableColors.bgDefaultColor
            }))
        } else {
            marketsTable.applyStyle(new TableStyle({
                row,
                cell: 6,
                color: TableColors.red,
                bgColor: TableColors.bgDefaultColor
            }))
        }
        if (info.trend) {
            marketsTable.applyStyle(new TableStyle({
                row,
                cell: 7,
                color: TableColors.green,
                bgColor: TableColors.bgDefaultColor
            }))
        } else {
            marketsTable.applyStyle(new TableStyle({
                row,
                cell: 7,
                color: TableColors.red,
                bgColor: TableColors.bgDefaultColor
            }))
        }
        resize()
        if (info.rate >= 0.45) {
            watchdog.makeOrders(info)
        }
    })

    watchdog.on('order', function (order) {
        this.orders.reverse()
        let ordersText = Table.print(this.orders)
        this.orders.reverse()
        ordersBox.setContent(ordersText)
        let balanceText = balanceToTable(watchdog.balance)
        balanceBox.setContent(balanceText)
        resize()
        //ordersBox.scrollToBottom()
    })

    watchdog.on('pause', function (info) {
        if (!info.queue) {
            marketsTable.removeStyle(highlight)
            messageBox.setContent(`all markets up to date ...!`)
        }
        let timerText = `timeout: ${(info.timeout).toFixed(2)}ms fps: ${info.fps.toFixed(2)}`
        timerBox.setContent(timerText)
        resize()
    })

    const selected = new TableStyle({
        row: -1,
        color: TableColors.black,
        bgColor: TableColors.bgBrightGreen
    })

    function drawChart(market) {
        // TODO : add error check for no candles to plot
        let candles = market.candles.reduce(function (prev, curr) {
            prev.push(curr.close)
            return prev
        }, [])
        let upperBand = market.candles.reduce(function (prev, curr) {
            if (curr.uptrend === false && curr.upperBand) {
                prev.push(curr.upperBand)
            } else {
                prev.push(curr.close)
            }
            return prev
        }, [])
        let lowerBand = market.candles.reduce(function (prev, curr) {
            if (curr.uptrend === true && curr.lowerBand) {
                prev.push(curr.lowerBand)
            } else {
                prev.push(curr.close)
            }
            return prev
        }, [])
        const { precision } = market
        const maxWidth = terminal.width / 2
        candles = candles.slice(candles.length > maxWidth ? -maxWidth : 0)
        upperBand = upperBand.slice(upperBand.length > maxWidth ? -maxWidth : 0)
        lowerBand = lowerBand.slice(lowerBand.length > maxWidth ? -maxWidth : 0)
        let chartText = asciichart.plot([upperBand, lowerBand, candles], {
            colors: [
                asciichart.red,
                asciichart.green,
                asciichart.default
            ],
            height: 20,
            format: function (x, i) { return (x.toFixed(precision.price)) }
        })
        //chartBox.setSizeAndPosition({ x: 0, y: watchBox.outputY + watchBox.outputHeight + 2, width: term.width - 1, height: 10 })
        chartBox.setContent(chartText, 'legacyAnsi')
    }

    terminal.on('key', function (name, matches, data) {
        let symbol, market
        switch (name) {
            case 'UP':
                marketsTable.removeStyle(selected)
                selected.row--
                if (selected.row < 2) selected.row = watchdog.markets.length - 1 + 2
                marketsTable.applyStyle(selected)
                symbol = marketsTable.data[selected.row - 2].symbol
                market = watchdog.markets.find(m => m.symbol === symbol)
                drawChart(market)
                resize()
                break
            case 'DOWN':
                marketsTable.removeStyle(selected)
                selected.row++
                if (selected.row >= watchdog.markets.length + 2) selected.row = 2
                if (selected.row < 2) selected.row = 2
                marketsTable.applyStyle(selected)
                symbol = marketsTable.data[selected.row - 2].symbol
                market = watchdog.markets.find(m => m.symbol === symbol)
                drawChart(market)
                resize()
                break
            default:
                messageBox.setContent(`key ${name} ...`)
                break
        }
    })

    // *start
    resize()
    if (!watchdog.initialized) await watchdog.initialize()
    watchdog.queue.push(...watchdog.markets)
    try {
        // run tasks in parallel
        await Promise.all([watchdog.watch(), watchdog.analyze()])
    } catch (error) {
        terminal.grabInput(false)
        terminal.hideCursor(false)
        terminal.styleReset()
        terminal.moveTo(1, terminal.height - 1)
        console.error(error)
    }

}

// *terminal events

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

module.exports = {
    cliInfo,
    cliSearch,
    cliRemove,
    cliWatch,
    terminate,
    terminal
}