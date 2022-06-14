const termkit = require('../node_modules/terminal-kit/lib/termkit.js')
const terminal = termkit.terminal
const credentials = require('../credentials/credentials.js')
const { Coindog } = require('../src/Coindog.js')
const Table = require('easy-table')

const watchdog = new Coindog(credentials.BITFINEX, '../data/symbols.json')

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

    const marketsBox = new termkit.TextBox({
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

    const messageBox = new termkit.TextBox({
        parent: document,
        content: '',
        contentHasMarkup: 'legacyAnsi',
        x: 0,
        y: 0,
        attr: { bgColor: 'default' }
    })

    // *ui update functions
    let timerText = ''
    let lastRpm = 0
    let upDown = ''
    const updateTimer = function (info) {
        if (lastRpm < info.rpm) {
            upDown = '▲'
        } else if (lastRpm === info.rpm) {
            upDown = upDown
        } else {
            upDown = '▼'
        }
        timerText = `requests per minute: ${(info.rpm).toFixed(2)} ${upDown} timeout: ${(info.timeout).toFixed(2)}ms`
        lastRpm = info.rpm
    }

    let marketsData = []
    let marketsText = ''
    let highlights = []

    const colors = {
        'defaultColor': 'defaultColor',
        'black': 'black',
        'red': 'red',
        'green': 'green',
        'yellow': 'yellow',
        'blue': 'blue',
        'magenta': 'magenta',
        'cyan': 'cyan',
        'white': 'white',
        'gray': 'gray',
        'brightRed': 'brightRed',
        'brightGreen': 'brightGreen',
        'brightYellow': 'brightYellow',
        'brightBlue': 'brightBlue',
        'brightMagenta': 'brightMagenta',
        'brightCyan': 'brightCyan',
        'brightWhite': 'brightWhite',
        'bgDefaultColor': 'bgDefaultColor',
        'bgBlack': 'bgBlack',
        'bgRed': 'bgRed',
        'bgGreen': 'bgGreen',
        'bgYellow': 'bgYellow',
        'bgBlue': 'bgBlue',
        'bgMagenta': 'bgMagenta',
        'bgCyan': 'bgCyan',
        'bgWhite': 'bgWhite',
        'bgDarkColor': 'bgDarkColor',
        'bgGray': 'bgGray',
        'bgBrightRed': 'bgBrightRed',
        'bgBrightGreen': 'bgBrightGreen',
        'bgBrightYellow': 'bgBrightYellow',
        'bgBrightBlue': 'bgBrightBlue',
        'bgBrightMagenta': 'bgBrightMagenta',
        'bgBrightCyan': 'bgBrightCyan'
    }

    const selectedRow = {
        index: -1,
        color: colors['defaultColor'],
        bgColor: colors['bgBrightGreen']
    }
    const updatedRow = {
        index: -1,
        color: colors['brightGreen'],
        bgColor: colors['bgDefaultColor']
    }

    highlights = [selectedRow, updatedRow]

    const highlightTableLines = function (tableData, highlights) {
        return Table.print(tableData).split('\n').map((line, index) => {
            const highlight = highlights.find(highlight => highlight.index === index)
            if (highlight) {
                return terminal[highlight.color][highlight.bgColor].str(line)
            } else {
                return terminal.defaultColor.bgDefaultColor.str(line)
            }
        }).join('\n')
    }

    const updateMarkets = function (info, { highlight = false } = {}) {

        // init text
        if (!marketsText.length) {
            marketsData = watchdog.markets.reduce(function (accu, curr) {
                accu.push({
                    symbol: curr.symbol,
                    first: '',
                    last: '',
                    fetched: '',
                    rate: '',
                    frame: '',
                    position: '',
                    trend: '',
                    signal: ''
                })
                return accu
            }, [])
        }

        // update market text
        if (info) {
            let mIdx = marketsData.findIndex(m => m.symbol === info.symbol)
            if (mIdx < 0) {
                marketsData.push(info)
                mIdx = marketsData.length - 1
            } else {
                marketsData[mIdx] = Object.assign(marketsData[mIdx], info)
            }
            if (highlight) updatedRow.index = mIdx + 2

        }
        marketsText = highlightTableLines(marketsData, highlights)
    }

    let balanceText = ''

    const updateBalance = function (balance) {
        balanceText = balanceToTable(balance)
    }

    // *ui draw functions
    const resize = function () {
        const { width, height } = terminal
        const marketsWidth = marketsText.split('\n')[0].length || 0
        const balanceHeight = balanceText.split('\n').length || 0
        timerBox.setSizeAndPosition({
            x: 1,
            y: title.outputY + 2,
            height: 1,
            width: timerText.length
        })
        marketsBox.setSizeAndPosition({
            x: 1,
            y: timerBox.outputY + 2,
            height: height / 2,
            width: marketsWidth
        })
        balanceBox.setSizeAndPosition({
            x: 1,
            y: height / 2,
            height: balanceHeight,
            width: width / 4
        })
        messageBox.setSizeAndPosition({
            x: 1,
            y: height - 2,
            height: 1,
            width: width
        })
    }

    const drawTimer = function () {
        timerBox.setContent(timerText, 'legacyAnsi')
    }

    const drawMarkets = function () {
        marketsBox.setContent(marketsText, 'legacyAnsi')
    }

    const drawBalance = function () {
        balanceBox.setContent(balanceText)
    }

    // *events
    watchdog.on('initializing', function () {
        messageBox.setContent('loading...')
    })
    watchdog.on('initialized', function () {
        messageBox.setContent('')
        updateMarkets()
        updateBalance(watchdog.balance)
        resize()
        drawMarkets()
        drawBalance()
    })
    watchdog.on('fetching', function (symbol) {
        messageBox.setContent(`fetching ${symbol} ...`)
    })
    watchdog.on('fetched', function (info) {
        messageBox.setContent(`fetching ${info.symbol} ...done`)
        updateMarkets(info, { highlight: true })
        resize()
        drawMarkets()
    })
    watchdog.on('analyzed', function (info) {
        updateMarkets(info)
        resize()
        drawMarkets()
    })
    watchdog.on('pause', function (info) {
        updateTimer(info)
        resize()
        drawTimer()
    })

    terminal.on('key', function (name, matches, data) {
        switch (name) {
            case 'UP':
                selectedRow.index--
                if (selectedRow.index < 2) selectedRow.index = watchdog.markets.length - 1 + 2
                break
            case 'DOWN':
                selectedRow.index++
                if (selectedRow.index >= watchdog.markets.length + 2) selectedRow.index = 2
                if (selectedRow.index < 2) selectedRow.index = 2
                break
            default:
                messageBox.setContent(`key ${name} ...`)
                break
        }
    })

    // *start
    resize()
    if (!watchdog.initialized) await watchdog.initialize()
    // run tasks in parallel
    await Promise.all([watchdog.watch2(), watchdog.analyze()])

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